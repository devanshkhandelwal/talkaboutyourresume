import { NextRequest, NextResponse } from "next/server";
import { trackEvent } from "@/lib/limits";

// Usage events only the browser knows about. Everything else is counted by the
// route that does the work (resume, session, feedback, waitlist).
const CLIENT_EVENTS = new Set(["interview_ended"] as const);

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { event?: string } | null;
  const event = body?.event;
  if (!event || !CLIENT_EVENTS.has(event as "interview_ended")) {
    return NextResponse.json({ error: "Unknown event." }, { status: 400 });
  }
  await trackEvent(event as "interview_ended");
  return new NextResponse(null, { status: 204 });
}
