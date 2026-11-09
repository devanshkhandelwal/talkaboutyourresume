import "./loadEnv";
import { AGENT_URL, buildAgentSettings } from "@/lib/agentSettings";
import { INTERVIEWERS } from "@/lib/interviewers";
import { buildInterviewerPrompt } from "@/lib/prompts";
import { directTokenTtl, grantDeepgramToken } from "@/lib/voice/token";
import { FIXTURES } from "./fixtures";

// Checks that a direct-mode interview outlives its Deepgram token's first minute.
// Deepgram re-checks the bearer token on UpdateThink, which the browser sends after
// every exchange (lib/voice/agent.ts, remember/steer). With the old 60-second token,
// interviews ended 60 to 100 seconds in with "Invalid credentials."
//
// Two sessions, side by side, each opened the way the browser opens one (bearer
// token, production Settings) and kept alive with silence. After --wait seconds:
//   1. the app's token (directTokenTtl): UpdateThink is acknowledged and a user
//      message gets a reply. This is the regression check.
//   2. a 60-second token: Deepgram should close it with "Invalid credentials."
//      That shows the check still catches the failure; if it stops failing,
//      Deepgram changed and the note in lib/voice/token.ts may be out of date.
//   npm run eval:token [-- --wait 70]
// Needs DEEPGRAM_API_KEY in .env.local. About 3 minutes of Deepgram time (2 sessions).

const KEY = process.env.DEEPGRAM_API_KEY!;
if (!KEY) throw new Error("DEEPGRAM_API_KEY is not set.");
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const WAIT_S = Number(arg("wait") ?? 70);
const MINUTES = Number(process.env.MAX_INTERVIEW_MINUTES || 15);
const SILENCE = Buffer.alloc(3200);

type Outcome = { ok: boolean; detail: string };

async function session(label: string, ttl: number, settings: ReturnType<typeof buildAgentSettings>): Promise<Outcome> {
  const token = await grantDeepgramToken(KEY, ttl);
  const ws = new WebSocket(AGENT_URL, ["bearer", token]);
  ws.binaryType = "arraybuffer";
  const types: string[] = [];
  let error: string | null = null;
  let closed: string | null = null;
  let replies = 0;
  let silence: ReturnType<typeof setInterval> | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  const waiters: (() => void)[] = [];
  const wake = () => waiters.splice(0).forEach((w) => w());
  const until = (check: () => boolean, ms: number) =>
    new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);
      const poll = () => (check() ? (clearTimeout(timer), resolve(true)) : waiters.push(poll));
      poll();
    });
  const send = (msg: unknown) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));

  ws.onopen = () => {
    ws.send(JSON.stringify(settings));
    silence = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(SILENCE), 100);
    keepAlive = setInterval(() => send({ type: "KeepAlive" }), 8000);
  };
  ws.onmessage = (ev) => {
    if (typeof ev.data !== "string") return;
    const msg = JSON.parse(ev.data);
    types.push(msg.type);
    if (msg.type === "Error") error = `${msg.description ?? ""} (${msg.code ?? "?"})`;
    if (msg.type === "ConversationText" && msg.role === "assistant") replies++;
    wake();
  };
  ws.onclose = (ev) => {
    closed = `${ev.code}${ev.reason ? ` ${ev.reason}` : ""}`;
    if (silence) clearInterval(silence);
    if (keepAlive) clearInterval(keepAlive);
    wake();
  };
  const finish = (o: Outcome) => {
    if (ws.readyState === WebSocket.OPEN) ws.close(1000);
    console.log(`  ${label}: ${o.detail}`);
    return o;
  };

  if (!(await until(() => types.includes("SettingsApplied") || closed !== null, 15_000)))
    return finish({ ok: false, detail: `no SettingsApplied; got ${types.join(", ")}` });
  if (closed) return finish({ ok: false, detail: `closed before starting: ${error ?? closed}` });
  // The greeting, so the next reply is one we asked for.
  await until(() => replies >= 1 || closed !== null, 15_000);

  await new Promise((r) => setTimeout(r, WAIT_S * 1000));
  if (closed) return finish({ ok: false, detail: `closed while idle at ${WAIT_S}s: ${error ?? closed}` });

  const think = (settings as { agent: { think: Record<string, unknown> } }).agent.think;
  send({ type: "UpdateThink", think });
  const acked = await until(() => types.includes("ThinkUpdated") || error !== null || closed !== null, 10_000);
  if (!acked || !types.includes("ThinkUpdated"))
    return finish({ ok: false, detail: `UpdateThink at ${WAIT_S}s: ${error ?? (closed ? `closed ${closed}` : "no reply")}` });

  const before = replies;
  send({ type: "InjectUserMessage", content: "Sure. I led the data pipeline rewrite at my last internship." });
  await until(() => replies > before || error !== null || closed !== null, 30_000);
  if (replies <= before) return finish({ ok: false, detail: `no reply after UpdateThink: ${error ?? (closed ? `closed ${closed}` : "timed out")}` });
  return finish({ ok: true, detail: `UpdateThink acknowledged and a reply at ${WAIT_S}s+` });
}

async function main() {
  const fixture = FIXTURES[0];
  const interviewer = INTERVIEWERS[0];
  const prompt = buildInterviewerPrompt({ interviewer, profile: fixture.profile, focusNote: "", questions: [], minutes: MINUTES, mode: "mixed" });
  const settings = buildAgentSettings({ interviewer, prompt, greeting: "Hi, thanks for joining. How's your day going?" });

  const appTtl = directTokenTtl(MINUTES);
  // The time cap is MINUTES (4 for a retry) from when the socket opens; the token must outlive it.
  const covers = [MINUTES, Math.min(4, MINUTES)].every((m) => directTokenTtl(m) > m * 60);
  console.log(`Token TTL for a ${MINUTES}-minute interview: ${appTtl}s (${covers ? "covers" : "does NOT cover"} the time cap)`);
  console.log(`Opening two sessions, waiting ${WAIT_S}s, then UpdateThink + a user message…`);

  const [app, old] = await Promise.all([session(`app token (${appTtl}s)`, appTtl, settings), session("60s token (before the fix)", 60, settings)]);

  const oldFailedAsExpected = !old.ok && /invalid credentials/i.test(old.detail);
  console.log("");
  console.log(`${app.ok && covers ? "PASS" : "FAIL"}: the app's token survives past ${WAIT_S}s`);
  console.log(
    oldFailedAsExpected
      ? `ok: a 60s token still fails ("Invalid credentials."), so this check would catch a regression`
      : `note: a 60s token ${old.ok ? "now works past its TTL" : `failed differently: ${old.detail}`}; Deepgram's behavior may have changed`,
  );
  process.exit(app.ok && covers ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
