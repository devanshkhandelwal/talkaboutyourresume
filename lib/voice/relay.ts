import type { RawData, WebSocket as ClientSocket } from "ws";
import { AGENT_URL } from "@/lib/agentSettings";
import { thinkPrompt } from "@/lib/prompts";
import { claimPart, getVoiceSession, latestPart, sessionDeadline } from "./sessions";

// The voice relay: the browser talks to this server, and this server talks to
// Deepgram with the real API key. That puts the interview's limits on the server:
// - the time cap (from the session record, not the browser's clock),
// - which Settings are used (built by /api/session; the browser can't swap the
//   model or voice),
// - which messages reach Deepgram (an allowlist).
// A Vercel Function can stay open for 5 minutes on the Hobby plan, so a long
// interview is a chain of connections ("parts"). Before one runs out, the browser
// opens the next part with the conversation so far, which Deepgram replays as
// agent.context, and switches over at a pause (see lib/voice/agent.ts).

/** Close codes the browser understands. */
export const RELAY_CLOSE = {
  notFound: 4404,
  timeUp: 4408,
  superseded: 4409,
  badStart: 4400,
  upstream: 4502,
  partLimit: 4000,
} as const;

/** What the browser sends first on each connection. */
export type RelayStart = {
  type: "RelayStart";
  /** The conversation so far, for every part after the first. */
  history?: { role: "user" | "assistant"; content: string }[];
  /** Text added to the prompt mid-interview (UpdatePrompt), to carry over. */
  prompts?: string[];
};

// Messages the browser may send on to Deepgram. Settings, UpdateThink and
// UpdateSpeak are not here: they would let a client pick a pricier model. One-turn
// directives come as RelaySteer, and the relay builds the UpdateThink itself.
const ALLOWED = new Set(["KeepAlive", "InjectAgentMessage", "UpdatePrompt", "FunctionCallResponse"]);
const MAX_TEXT = 4000;
const MAX_HISTORY = 80;
const MAX_HISTORY_CHARS = 60_000;
const START_TIMEOUT_MS = 10_000;
/** How often a connection checks whether a newer part replaced it. */
const SUPERSEDE_CHECK_MS = 15_000;
/** How long an older part may overlap a newer one before it's closed. */
const OVERLAP_MS = 20_000;

export type RelayOptions = {
  sessionId: string;
  part: number;
  apiKey: string;
  /** Longest one connection may stay open (the platform's function limit, minus a margin). */
  connectionMs: number;
  log?: (msg: string, data?: Record<string, unknown>) => void;
  /** Extra message types to pass through; tests use InjectUserMessage to "speak". */
  extraAllowed?: string[];
};

/** Relays one browser connection to a new Deepgram session until either side closes. */
export async function runRelay(client: ClientSocket, o: RelayOptions): Promise<void> {
  const log = o.log ?? ((msg, data) => console.log(`[relay] ${msg}`, data ?? ""));
  const allowed = o.extraAllowed?.length ? new Set([...ALLOWED, ...o.extraAllowed]) : ALLOWED;
  const openedAt = Date.now();
  const close = (code: number, reason: string) => {
    if (client.readyState === client.OPEN || client.readyState === client.CONNECTING) client.close(code, reason);
  };
  const fail = (code: number, description: string) => {
    if (client.readyState === client.OPEN) client.send(JSON.stringify({ type: "RelayError", code, description }));
    close(code, description.slice(0, 120));
  };

  // Buffer what the browser sends until Deepgram is ready.
  const pending: { data: RawData; isBinary: boolean }[] = [];
  let upstream: WebSocket | null = null;
  let startMsg: RelayStart | null = null;
  let resolveStart: (() => void) | null = null;
  const started = new Promise<void>((r) => (resolveStart = r));

  client.on("message", (data, isBinary) => {
    if (!startMsg) {
      if (isBinary) return;
      try {
        const msg = JSON.parse(data.toString());
        if (msg?.type === "RelayStart") {
          startMsg = msg as RelayStart;
          resolveStart?.();
        }
      } catch {
        // ignore until a valid RelayStart arrives
      }
      return;
    }
    if (upstream?.readyState === WebSocket.OPEN) forward(data, isBinary);
    else if (pending.length < 200) pending.push({ data, isBinary });
  });

  const stats = { audioUpBytes: 0, audioDownBytes: 0, turns: 0, latencies: [] as number[] };
  const forward = (data: RawData, isBinary: boolean) => {
    if (!upstream || upstream.readyState !== WebSocket.OPEN) return;
    if (isBinary) {
      const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
      stats.audioUpBytes += buf.byteLength;
      upstream.send(buf);
      return;
    }
    let msg: { type?: string; message?: string; prompt?: string; content?: string; directive?: string | null };
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.type === "RelaySteer") {
      // The stored think config, what's been appended (the close), and at most one directive.
      const directive = typeof msg.directive === "string" ? msg.directive.slice(0, MAX_TEXT) : null;
      const prompt = thinkPrompt(baseThink.prompt, appended, history, directive);
      upstream.send(JSON.stringify({ type: "UpdateThink", think: { ...baseThink, prompt } }));
      return;
    }
    if (msg.type === "UpdatePrompt" && typeof msg.prompt === "string") appended.push(msg.prompt.slice(0, MAX_TEXT));
    if (!msg.type || !allowed.has(msg.type)) return;
    if ([msg.message, msg.prompt, msg.content].some((t) => (t?.length ?? 0) > MAX_TEXT)) return;
    upstream.send(JSON.stringify(msg));
  };

  let timers: ReturnType<typeof setTimeout>[] = [];
  const cleanup = () => {
    timers.forEach(clearTimeout);
    timers = [];
    if (upstream && upstream.readyState <= WebSocket.OPEN) upstream.close(1000);
  };
  client.on("close", () => {
    cleanup();
    const seconds = Math.round((Date.now() - openedAt) / 1000);
    const sorted = [...stats.latencies].sort((a, b) => a - b);
    log("closed", {
      session: o.sessionId.slice(0, 8),
      part: o.part,
      seconds,
      turns: stats.turns,
      medianLatency: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
      upKB: Math.round(stats.audioUpBytes / 1024),
      downKB: Math.round(stats.audioDownBytes / 1024),
    });
  });

  // 1. The interview must exist, be current, and have time left.
  const session = await getVoiceSession(o.sessionId).catch(() => null);
  if (!session) return fail(RELAY_CLOSE.notFound, "This interview session wasn't found or has expired.");
  const deadline = sessionDeadline(session);
  if (Date.now() >= deadline) return fail(RELAY_CLOSE.timeUp, "This interview is out of time.");
  if (!(await claimPart(o.sessionId, o.part).catch(() => false))) {
    return fail(RELAY_CLOSE.superseded, "A newer connection replaced this one.");
  }

  // 2. Wait for the browser's RelayStart.
  const gotStart = await Promise.race([started.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), START_TIMEOUT_MS))]);
  if (!gotStart || !startMsg) return fail(RELAY_CLOSE.badStart, "The connection didn't start properly.");
  const start: RelayStart = startMsg;
  const settings = continuationSettings(session.settings, start);
  // For RelaySteer: the think config this connection started with, and what the
  // browser appends during it (UpdatePrompt).
  // (The same Settings without the conversation in the prompt: RelaySteer adds it fresh.)
  const baseThink = (continuationSettings(session.settings, { ...start, history: [] }) as { agent: { think: { prompt: string } } }).agent.think;
  const appended: string[] = [];
  // The conversation so far, for the prompt: what the browser carried over, then every
  // line Deepgram reports. Kept here, not taken from the browser on each turn.
  const history = continuationHistory(start);

  // 3. Open Deepgram with the server's key and the server's Settings.
  upstream = new WebSocket(AGENT_URL, ["token", o.apiKey]);
  upstream.binaryType = "arraybuffer";
  const up = upstream;
  up.onopen = () => {
    up.send(JSON.stringify(settings));
    for (const m of pending.splice(0)) forward(m.data, m.isBinary);
  };
  up.onmessage = (ev) => {
    if (client.readyState !== client.OPEN) return;
    if (typeof ev.data === "string") {
      noteServerMessage(ev.data, stats, history);
      client.send(ev.data);
    } else {
      const buf = Buffer.from(ev.data as ArrayBuffer);
      stats.audioDownBytes += buf.byteLength;
      client.send(buf, { binary: true });
    }
  };
  up.onerror = () => fail(RELAY_CLOSE.upstream, "Couldn't reach the voice service.");
  up.onclose = (ev) => close(ev.code === 1000 ? 1000 : RELAY_CLOSE.upstream, ev.reason || "The voice service closed the session.");

  // 4. Limits: the interview's deadline, this connection's lifetime, and newer parts.
  const now = Date.now();
  if (deadline - now < o.connectionMs) {
    timers.push(setTimeout(() => fail(RELAY_CLOSE.timeUp, "This interview is out of time."), deadline - now));
  } else {
    timers.push(setTimeout(() => fail(RELAY_CLOSE.partLimit, "This connection reached its time limit."), o.connectionMs));
  }
  const checkSuperseded = async () => {
    const latest = await latestPart(o.sessionId).catch(() => o.part);
    if (latest > o.part) {
      timers.push(setTimeout(() => close(RELAY_CLOSE.superseded, "Replaced by a newer connection."), OVERLAP_MS));
      return;
    }
    timers.push(setTimeout(checkSuperseded, SUPERSEDE_CHECK_MS));
  };
  timers.push(setTimeout(checkSuperseded, SUPERSEDE_CHECK_MS));
}

/** The Settings for this part: the stored ones, plus the conversation so far and any prompt additions. */
export function continuationSettings(stored: Record<string, unknown>, start: RelayStart): Record<string, unknown> {
  const settings = structuredClone(stored) as { agent: { greeting?: string; think: { prompt: string }; context?: unknown } };
  const prompts = (start.prompts ?? []).filter((p) => typeof p === "string").slice(0, 5).map((p) => p.slice(0, MAX_TEXT));
  if (prompts.length) settings.agent.think.prompt += "\n\n" + prompts.join("\n\n");

  const history = continuationHistory(start);
  // Keep the most recent turns within the character budget.
  let chars = 0;
  const kept: typeof history = [];
  for (let i = history.length - 1; i >= 0; i--) {
    chars += history[i].content.length;
    if (chars > MAX_HISTORY_CHARS) break;
    kept.unshift(history[i]);
  }
  if (kept.length) {
    // A continuation: no second greeting, and the model sees what was said: the
    // recent turns as context, and all of it in the prompt (it only remembers a few).
    delete settings.agent.greeting;
    settings.agent.context = { messages: kept.map((m) => ({ type: "History", role: m.role, content: m.content.slice(0, MAX_TEXT) })) };
    settings.agent.think.prompt = thinkPrompt(settings.agent.think.prompt, [], history);
  }
  return settings;
}

type HistoryLine = { role: "user" | "assistant"; content: string };

/** The conversation the browser carried over to this part, checked and capped. */
function continuationHistory(start: RelayStart): HistoryLine[] {
  return (start.history ?? [])
    .filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_TEXT) }));
}

function noteServerMessage(raw: string, stats: { turns: number; latencies: number[] }, history: HistoryLine[]) {
  if (!raw.includes("LatencyReport") && !raw.includes("ConversationText")) return;
  try {
    const msg = JSON.parse(raw) as { type?: string; total_latency?: number; role?: string; content?: string };
    if (msg.type === "LatencyReport" && typeof msg.total_latency === "number") stats.latencies.push(msg.total_latency);
    if (msg.type === "ConversationText") {
      stats.turns++;
      if ((msg.role === "user" || msg.role === "assistant") && typeof msg.content === "string") {
        history.push({ role: msg.role, content: msg.content.slice(0, MAX_TEXT) });
        if (history.length > MAX_HISTORY) history.shift();
      }
    }
  } catch {
    // not JSON
  }
}
