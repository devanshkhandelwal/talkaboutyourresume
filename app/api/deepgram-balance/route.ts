import { NextResponse } from "next/server";
import { DEEPGRAM_COST_PER_INTERVIEW } from "@/lib/config";
import type { BalanceResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 60_000;

// Per-instance cache so a busy page doesn't call Deepgram on every visit.
// Failures are cached too, so a key without billing access isn't retried constantly.
let cached: { at: number; data: BalanceResponse | null } | null = null;

async function fetchBalance(): Promise<BalanceResponse | null> {
  const key = process.env.DEEPGRAM_API_KEY;
  const project = process.env.DEEPGRAM_PROJECT_ID;
  if (!key || !project) return null;
  const res = await fetch(`https://api.deepgram.com/v1/projects/${encodeURIComponent(project)}/balances`, {
    headers: { Authorization: `Token ${key}` },
    cache: "no-store",
  });
  if (!res.ok) {
    // 403 means the key exists but lacks billing permission.
    console.warn(`[deepgram-balance] ${res.status}${res.status === 403 ? " (key lacks billing permission)" : ""}`);
    return null;
  }
  const data = (await res.json()) as { balances?: { amount?: number; units?: string }[] };
  const balances = Array.isArray(data.balances) ? data.balances : [];
  if (balances.length === 0) return null;
  const remaining = balances.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  return {
    remaining,
    units: String(balances[0].units ?? "usd").toLowerCase(),
    estInterviewsLeft: Math.max(0, Math.floor(remaining / DEEPGRAM_COST_PER_INTERVIEW)),
  };
}

export async function GET() {
  if (!cached || Date.now() - cached.at > TTL_MS) {
    const data = await fetchBalance().catch((err) => {
      console.warn("[deepgram-balance]", err);
      return null;
    });
    cached = { at: Date.now(), data };
  }
  if (!cached.data) {
    return NextResponse.json({ error: "Unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  // Let Vercel's CDN share the result across instances for the same 60 seconds.
  return NextResponse.json(cached.data, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
  });
}
