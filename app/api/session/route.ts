import { NextRequest, NextResponse, after } from "next/server";
import { getInterviewer, INTERVIEWERS } from "@/lib/interviewers";
import { buildInterviewerPrompt } from "@/lib/prompts";
import { clientIp, takeDailyInterview, trackEvent } from "@/lib/limits";
import type { ResumeProfile } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Starts an interview: checks limits, mints a short-lived Deepgram token
 * for the browser, and returns the full voice agent Settings message.
 * The interviewer prompt is built here so it never ships in client code.
 */
export async function POST(req: NextRequest) {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return NextResponse.json({ error: "Voice is not configured." }, { status: 500 });

  let body: { profile?: ResumeProfile; interviewerId?: string; focusNote?: string; questions?: unknown; retryTopic?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!body.profile?.topics?.length) {
    return NextResponse.json({ error: "Upload your resume first." }, { status: 400 });
  }
  if (!INTERVIEWERS.some((i) => i.id === body.interviewerId)) {
    return NextResponse.json({ error: "Unknown interviewer." }, { status: 400 });
  }

  const allowed = await takeDailyInterview(clientIp(req)).catch(() => true);
  if (!allowed) {
    return NextResponse.json(
      { error: "You've hit today's limit for free practice interviews. Come back tomorrow!" },
      { status: 429 },
    );
  }

  const minutes = Number(process.env.MAX_INTERVIEW_MINUTES || 15);
  const retryTopic = body.retryTopic?.slice(0, 300);
  const sessionMinutes = retryTopic ? Math.min(4, minutes) : minutes;

  let access_token: string;
  try {
    const grant = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
      // The token only needs to open the socket; the socket outlives it.
      body: JSON.stringify({ ttl_seconds: 60 }),
      cache: "no-store",
    });
    if (!grant.ok) throw new Error(`grant ${grant.status}: ${await grant.text()}`);
    ({ access_token } = (await grant.json()) as { access_token: string });
  } catch (err) {
    console.error("[session] deepgram grant failed", err);
    return NextResponse.json({ error: "Couldn't start the voice session. Please try again." }, { status: 502 });
  }

  const interviewer = getInterviewer(body.interviewerId);
  // Questions the candidate wants to practice: at most 5 strings of up to 200 characters.
  const questions = Array.isArray(body.questions)
    ? body.questions.filter((q): q is string => typeof q === "string").map((q) => q.replace(/\s+/g, " ").trim().slice(0, 200)).filter(Boolean).slice(0, 5)
    : [];
  const prompt = buildInterviewerPrompt({
    interviewer,
    profile: body.profile,
    focusNote: (body.focusNote ?? "").slice(0, 1500),
    questions,
    minutes: sessionMinutes,
    retryTopic,
  });
  const greetings = retryTopic
    ? ["Welcome back. Let's take another pass at one of your answers."]
    : interviewer.greetings;

  const settings = {
    type: "Settings",
    tags: ["talkaboutyourresume", interviewer.id],
    audio: {
      input: { encoding: "linear16", sample_rate: 16000 },
      output: { encoding: "linear16", sample_rate: 24000, container: "none" },
    },
    agent: {
      listen: { provider: { type: "deepgram", model: "nova-3", smart_format: false } },
      think: {
        provider: {
          type: "anthropic",
          model: process.env.DEEPGRAM_THINK_MODEL || "claude-haiku-4-5",
          temperature: 0.8,
        },
        prompt,
      },
      speak: {
        provider: { type: "deepgram", model: interviewer.voice, speed: interviewer.speed },
      },
      greeting: greetings[Math.floor(Math.random() * greetings.length)],
    },
  };

  after(async () => {
    if (retryTopic) return trackEvent("retry_started");
    await trackEvent("interview_started");
    await trackEvent(`interviewer:${interviewer.id}`);
    if (questions.length > 0) await trackEvent("custom_questions_used");
  });

  return NextResponse.json({
    token: access_token,
    settings,
    maxMinutes: sessionMinutes,
    interviewer: { id: interviewer.id, name: interviewer.name },
  });
}
