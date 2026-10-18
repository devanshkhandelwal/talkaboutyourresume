import type { NextRequest } from "next/server";

// Optional Upstash Redis over its REST API (no SDK needed).
// Without it, limits are skipped and emails are only logged.
// Upstash's own names, or the KV_REST_API_* names Vercel's Upstash integration
// adds, which carry whatever prefix was picked when connecting (e.g. STORAGE_).
function upstashEnv(part: "URL" | "TOKEN"): string | undefined {
  const own = process.env[`UPSTASH_REDIS_REST_${part}`];
  if (own) return own;
  const name = `KV_REST_API_${part}`;
  return Object.entries(process.env).find(([k, v]) => v && (k === name || k.endsWith(`_${name}`)))?.[1];
}
const URL_ = upstashEnv("URL");
const TOKEN = upstashEnv("TOKEN");

export const redisEnabled = Boolean(URL_ && TOKEN);

async function redis(command: (string | number)[]): Promise<unknown> {
  if (!redisEnabled) return null;
  const res = await fetch(URL_!, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstash error ${res.status}`);
  const data = (await res.json()) as { result: unknown };
  return data.result;
}

// Days are counted in Eastern Time, so the /stats page lines up with the owner's day.
export const STATS_TIME_ZONE = "America/New_York";

/** The calendar date (YYYY-MM-DD) in Eastern Time. */
export function easternDay(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: STATS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Counts one use of `kind` by this IP today; true while it's within `limit`. */
async function takeDaily(kind: string, ip: string, limit: number): Promise<boolean> {
  if (!redisEnabled) return true;
  const key = `${kind}:${easternDay()}:${ip}`;
  const count = Number(await redis(["INCR", key]));
  if (count === 1) await redis(["EXPIRE", key, 60 * 60 * 26]);
  return count <= limit;
}

/** Returns true if this IP is still under its daily interview limit. */
export function takeDailyInterview(ip: string): Promise<boolean> {
  return takeDaily("interviews", ip, Number(process.env.DAILY_INTERVIEWS_PER_IP || 3));
}

/**
 * Daily caps on the routes that each cost a Claude call, so nobody can run up the
 * bill by calling them in a loop. Generous for real use: a few interviews a day,
 * each reading a resume and writing one report, with room for retries.
 */
export function takeDailyResumeRead(ip: string): Promise<boolean> {
  return takeDaily("resume-reads", ip, Number(process.env.DAILY_RESUME_READS_PER_IP || 15));
}
export function takeDailyFeedback(ip: string): Promise<boolean> {
  return takeDaily("feedback", ip, Number(process.env.DAILY_FEEDBACK_PER_IP || 15));
}

export async function saveEmail(email: string, meta: Record<string, string>) {
  const entry = JSON.stringify({ email, ...meta, at: new Date().toISOString() });
  if (!redisEnabled) {
    console.log("[waitlist]", entry);
    return;
  }
  await redis(["SADD", "emails", email]);
  await redis(["LPUSH", "email_log", entry]);
}

// Anonymous usage counts: one Redis hash per day, `events:YYYY-MM-DD`, with a
// field per event. Only counts are stored: no emails, resumes or IPs.
export const EVENTS = [
  "resume_read",
  "resume_failed",
  "interview_started",
  "retry_started",
  "custom_questions_used",
  "interview_ended",
  "feedback_generated",
  "feedback_failed",
  "waitlist_signup",
  "account_created",
  "account_deleted",
  "interview_saved",
] as const;
export type UsageEvent = (typeof EVENTS)[number] | `interviewer:${string}` | `mode:${string}`;

/** Adds one to today's count. Never throws: tracking must not break a request. */
export async function trackEvent(event: UsageEvent): Promise<void> {
  if (!redisEnabled) return;
  try {
    const key = `events:${easternDay()}`;
    await redis(["HINCRBY", key, event, 1]);
    await redis(["EXPIRE", key, 60 * 60 * 24 * 400]);
  } catch (err) {
    console.error("[track]", event, err);
  }
}

/** Counts for the last `days` days (UTC), newest first. */
export async function readEvents(days: number): Promise<{ day: string; counts: Record<string, number> }[]> {
  // Step back whole calendar days from today's Eastern date (no 24-hour math, so DST can't skip or repeat a day).
  const today = new Date(`${easternDay()}T00:00:00Z`);
  const list = Array.from({ length: days }, (_, i) => new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  return Promise.all(
    list.map(async (day) => {
      const flat = ((await redis(["HGETALL", `events:${day}`])) ?? []) as string[];
      const counts: Record<string, number> = {};
      for (let i = 0; i + 1 < flat.length; i += 2) counts[flat[i]] = Number(flat[i + 1]) || 0;
      return { day, counts };
    }),
  );
}

// Resume uploads: only the file type, size and outcome, never the name or content.
// Kept as a capped list of the most recent uploads for the /stats page.
const UPLOADS_KEY = "uploads";
const UPLOADS_KEPT = 500;

export type UploadOutcome = "read" | "unreadable" | "no_topics" | "too_big" | "error";
export type UploadRecord = { at: string; type: "pdf" | "docx" | "other"; bytes: number; outcome: UploadOutcome };

export function uploadType(file: File): UploadRecord["type"] {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (name.endsWith(".docx")) return "docx";
  return "other";
}

/** Records one upload. Never throws: tracking must not break a request. */
export async function trackUpload(file: File, outcome: UploadOutcome): Promise<void> {
  if (!redisEnabled) return;
  const entry: UploadRecord = { at: new Date().toISOString(), type: uploadType(file), bytes: file.size, outcome };
  try {
    await redis(["LPUSH", UPLOADS_KEY, JSON.stringify(entry)]);
    await redis(["LTRIM", UPLOADS_KEY, 0, UPLOADS_KEPT - 1]);
    await redis(["EXPIRE", UPLOADS_KEY, 60 * 60 * 24 * 400]);
  } catch (err) {
    console.error("[track upload]", err);
  }
}

/** The most recent uploads, newest first. */
export async function readUploads(): Promise<UploadRecord[]> {
  const raw = ((await redis(["LRANGE", UPLOADS_KEY, 0, UPLOADS_KEPT - 1])) ?? []) as string[];
  return raw.flatMap((r) => {
    try {
      return [JSON.parse(r) as UploadRecord];
    } catch {
      return [];
    }
  });
}
