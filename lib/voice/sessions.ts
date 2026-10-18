import { redis, redisEnabled } from "@/lib/limits";

// Server-side record of a live interview, for the voice relay (app/api/voice).
// /api/session creates it; every relay connection reads it. The clock starts
// here, on the server, so a modified browser can't extend an interview.

export type VoiceSession = {
  /** The Deepgram Settings message, built by /api/session. */
  settings: Record<string, unknown>;
  startedAt: number;
  maxMs: number;
};

/** Time allowed past the interview length, for the goodbye and slow starts. */
export const GRACE_MS = 90_000;

const key = (id: string) => `voice:${id}`;
const latestKey = (id: string) => `voice:${id}:latest`;

// Redis in production. Without it (local development and the relay test), a
// process-local map: fine for one server process, which is why relayAvailable()
// still requires Redis before /api/session sends anyone through the relay.
const memory = new Map<string, { value: string; expires: number }>();
async function kvGet(k: string): Promise<string | null> {
  if (redisEnabled) {
    const raw = await redis(["GET", k]);
    return raw === null || raw === undefined ? null : String(raw);
  }
  const hit = memory.get(k);
  return hit && hit.expires > Date.now() ? hit.value : null;
}
async function kvSet(k: string, value: string, ttlSeconds: number) {
  if (redisEnabled) await redis(["SET", k, value, "EX", ttlSeconds]);
  else memory.set(k, { value, expires: Date.now() + ttlSeconds * 1000 });
}

export async function createVoiceSession(id: string, s: VoiceSession): Promise<void> {
  const ttl = Math.ceil((s.maxMs + GRACE_MS) / 1000) + 600;
  await kvSet(key(id), JSON.stringify(s), ttl);
}

export async function getVoiceSession(id: string): Promise<VoiceSession | null> {
  const raw = await kvGet(key(id));
  return raw ? (JSON.parse(raw) as VoiceSession) : null;
}

/** When the interview must be over, relay connections included. */
export const sessionDeadline = (s: VoiceSession) => s.startedAt + s.maxMs + GRACE_MS;

/**
 * Records that connection `part` of an interview has opened. Returns false for a
 * part older than the newest one seen (a stale or replayed connection).
 */
export async function claimPart(id: string, part: number): Promise<boolean> {
  const latest = Number((await kvGet(latestKey(id))) ?? -1);
  if (part < latest) return false;
  await kvSet(latestKey(id), String(part), 60 * 60);
  return true;
}

/** The newest connection part opened for an interview. */
export async function latestPart(id: string): Promise<number> {
  return Number((await kvGet(latestKey(id))) ?? -1);
}

export const relayAvailable = () => redisEnabled && Boolean(process.env.DEEPGRAM_API_KEY);
