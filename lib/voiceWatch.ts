import { thinkModel } from "./agentSettings";

// Watches the Deepgram account for voice-agent sessions this app didn't start.
// In direct mode the browser gets a Deepgram token that lasts the interview (up to
// MAX_INTERVIEW_MINUTES + 2) and sends the session Settings itself, so a modified
// client could use a token to open agent sessions with any configuration, each for
// as long as it likes, on this account (Deepgram's tokens can't be locked to a
// stored configuration; the relay, VOICE_RELAY=1, closes that gap). Until it's on, this
// reads Deepgram's own request log and flags sessions that don't look like ours.
// Shown on /stats. Server only: it uses the billing key.

export type FlaggedSession = { created: string; usd: number; minutes: number; model: string; tags: string[]; reasons: string[] };
export type VoiceWatch = {
  since: string;
  sessions: number;
  usd: number;
  flagged: FlaggedSession[];
  balanceUsd: number | null;
  /** Set when the check couldn't run (no billing key, API error). */
  error?: string;
};

type DgRequest = {
  created: string;
  response?: {
    details?: { usd?: number; tags?: string[] };
    sts_details?: { duration?: number; tier?: string; llms?: { provider?: string; model?: string }[] };
  };
};

/** The app's own sessions carry this tag (lib/agentSettings.ts). */
const APP_TAG = "talkaboutyourresume";
/** Below this, interviews are close to stopping: top up (auto-recharge should be off). */
export const LOW_BALANCE_USD = 20;

export async function checkVoiceUsage(hours = 48): Promise<VoiceWatch> {
  const project = process.env.DEEPGRAM_PROJECT_ID;
  const key = process.env.DEEPGRAM_BILLING_API_KEY || process.env.DEEPGRAM_API_KEY;
  const sinceDate = new Date(Date.now() - hours * 3600_000);
  const since = sinceDate.toISOString().slice(0, 19);
  const empty: VoiceWatch = { since, sessions: 0, usd: 0, flagged: [], balanceUsd: null };
  if (!project || !key) return { ...empty, error: "DEEPGRAM_PROJECT_ID or a Deepgram key isn't set." };

  const headers = { Authorization: `Token ${key}` };
  const capMinutes = Number(process.env.MAX_INTERVIEW_MINUTES || 15) + 3;
  const model = thinkModel();
  try {
    const requests: DgRequest[] = [];
    // Pages of 100 (the API's real maximum, though its docs say 1,000), up to 2,000 sessions.
    for (let page = 0; page < 20; page++) {
      const res = await fetch(`https://api.deepgram.com/v1/projects/${project}/requests?endpoint=agent&limit=100&page=${page}&start=${since}`, { headers, cache: "no-store" });
      if (!res.ok) throw new Error(`Deepgram requests ${res.status}`);
      const batch = ((await res.json()) as { requests?: DgRequest[] }).requests ?? [];
      requests.push(...batch);
      if (batch.length < 100) break;
    }

    const flagged: FlaggedSession[] = [];
    let usd = 0;
    for (const r of requests) {
      const d = r.response?.details;
      const sts = r.response?.sts_details;
      const cost = d?.usd ?? 0;
      usd += cost;
      const tags = d?.tags ?? [];
      const llm = sts?.llms?.[0];
      const llmName = llm ? `${llm.provider ?? "?"}/${llm.model ?? "?"}` : "unknown";
      const minutes = (sts?.duration ?? 0) / 60;
      const reasons = [
        tags.includes(APP_TAG) ? "" : "not tagged by the app",
        minutes > capMinutes ? `longer than ${capMinutes} min` : "",
        llm && llm.model !== model ? `model ${llmName}, not ${model}` : "",
        sts?.tier && sts.tier !== "standard" ? `${sts.tier} tier` : "",
      ].filter(Boolean);
      if (reasons.length) flagged.push({ created: r.created, usd: cost, minutes: Math.round(minutes * 10) / 10, model: llmName, tags, reasons });
    }

    let balanceUsd: number | null = null;
    const b = await fetch(`https://api.deepgram.com/v1/projects/${project}/balances`, { headers, cache: "no-store" });
    if (b.ok) {
      const list = ((await b.json()) as { balances?: { amount: number; units: string }[] }).balances ?? [];
      balanceUsd = list.filter((x) => x.units === "usd").reduce((n, x) => n + x.amount, 0);
    }
    return { since, sessions: requests.length, usd: Math.round(usd * 100) / 100, flagged, balanceUsd: balanceUsd === null ? null : Math.round(balanceUsd * 100) / 100 };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }
}
