import { upgradeWebSocket } from "@vercel/functions";
import { NextRequest, NextResponse } from "next/server";
import { runRelay } from "@/lib/voice/relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The Hobby plan's limit. A connection hands over to a new one before this (see
// lib/voice/relay.ts), so interviews can run longer than one function.
export const maxDuration = 300;

/** How long one relay connection may stay open, leaving room under maxDuration. */
const CONNECTION_MS = 285_000;

/** The voice relay: GET /api/voice?s=<session id>&p=<part>, upgraded to a WebSocket. */
export async function GET(req: NextRequest) {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return NextResponse.json({ error: "Voice is not configured." }, { status: 500 });
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return NextResponse.json({ error: "Expected a WebSocket." }, { status: 426 });
  }
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("s") ?? "";
  const part = Number(url.searchParams.get("p") ?? "0");
  if (!/^[0-9a-f-]{36}$/.test(sessionId) || !Number.isInteger(part) || part < 0 || part > 50) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  return upgradeWebSocket((ws) => runRelay(ws, { sessionId, part, apiKey: key, connectionMs: CONNECTION_MS }));
}
