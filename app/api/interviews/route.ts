import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { cleanInterview, dbEnabled, deleteInterviews, saveInterview } from "@/lib/db";
import { trackEvent } from "@/lib/limits";
import { authEnabled } from "@/lib/authConfig";

// Saved interviews for the signed-in user. Saving needs an account; nothing
// here is reachable without one.

export async function POST(req: NextRequest) {
  if (!authEnabled) return NextResponse.json({ error: "Accounts aren't set up." }, { status: 503 });
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to save interviews." }, { status: 401 });
  if (!dbEnabled) return NextResponse.json({ error: "Saving isn't set up yet." }, { status: 503 });
  const interview = cleanInterview(await req.json().catch(() => null));
  if (!interview) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  try {
    const created = await saveInterview(userId, interview);
    if (created) after(() => trackEvent("interview_saved"));
    return NextResponse.json({ ok: true, created });
  } catch (err) {
    console.error("[interviews] save", err);
    return NextResponse.json({ error: "Couldn't save this interview. Please try again." }, { status: 500 });
  }
}

export async function DELETE() {
  if (!authEnabled) return NextResponse.json({ error: "Accounts aren't set up." }, { status: 503 });
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!dbEnabled) return NextResponse.json({ ok: true, deleted: 0 });
  try {
    return NextResponse.json({ ok: true, deleted: await deleteInterviews(userId) });
  } catch (err) {
    console.error("[interviews] delete", err);
    return NextResponse.json({ error: "Couldn't delete your interviews. Please try again." }, { status: 500 });
  }
}
