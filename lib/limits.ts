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

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Returns true if this IP is still under its daily interview limit. */
export async function takeDailyInterview(ip: string): Promise<boolean> {
  if (!redisEnabled) return true;
  const limit = Number(process.env.DAILY_INTERVIEWS_PER_IP || 3);
  const day = new Date().toISOString().slice(0, 10);
  const key = `interviews:${day}:${ip}`;
  const count = Number(await redis(["INCR", key]));
  if (count === 1) await redis(["EXPIRE", key, 60 * 60 * 26]);
  return count <= limit;
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
] as const;
export type UsageEvent = (typeof EVENTS)[number] | `interviewer:${string}`;

/** Adds one to today's count. Never throws: tracking must not break a request. */
export async function trackEvent(event: UsageEvent): Promise<void> {
  if (!redisEnabled) return;
  try {
    const key = `events:${new Date().toISOString().slice(0, 10)}`;
    await redis(["HINCRBY", key, event, 1]);
    await redis(["EXPIRE", key, 60 * 60 * 24 * 400]);
  } catch (err) {
    console.error("[track]", event, err);
  }
}

/** Counts for the last `days` days (UTC), newest first. */
export async function readEvents(days: number): Promise<{ day: string; counts: Record<string, number> }[]> {
  const list = Array.from({ length: days }, (_, i) => new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
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
