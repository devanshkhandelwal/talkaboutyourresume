import type { NextRequest } from "next/server";

// Optional Upstash Redis over its REST API (no SDK needed).
// Without it, limits are skipped and emails are only logged.
const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

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
