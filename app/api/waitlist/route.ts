import { NextRequest, NextResponse, after } from "next/server";
import { saveEmail, trackEvent } from "@/lib/limits";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { email, source, verifiedProfile } = (await req.json()) as {
      email?: string;
      source?: string;
      verifiedProfile?: boolean;
    };
    const clean = String(email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) || clean.length > 200) {
      return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
    }
    await saveEmail(clean, {
      source: String(source ?? "unknown").slice(0, 40),
      verifiedProfile: verifiedProfile ? "yes" : "no",
    });
    after(() => trackEvent("waitlist_signup"));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[waitlist]", err);
    return NextResponse.json({ error: "Couldn't save that. Please try again." }, { status: 500 });
  }
}
