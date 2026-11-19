import { NextRequest, NextResponse, after } from "next/server";
import { getInterviewer, INTERVIEWERS } from "@/lib/interviewers";
import { buildInterviewerPrompt, isInterviewMode } from "@/lib/prompts";
import { buildAgentSettings } from "@/lib/agentSettings";
import { clientIp, takeDailyInterview, trackEvent } from "@/lib/limits";
import { createVoiceSession, relayAvailable } from "@/lib/voice/sessions";
import { directTokenTtl, grantDeepgramToken } from "@/lib/voice/token";
import type { ResumeProfile } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Two ways to connect the browser to the interviewer:
 * - relay (app/api/voice): the server holds the Deepgram key, builds the Settings and
 *   enforces the time cap; nothing usable reaches the browser. Needs Redis and a
 *   platform that upgrades WebSockets (Vercel, or `vercel dev` locally).
 * - direct: a Deepgram token that lasts the interview, plus the Settings, go to the
 *   browser, which connects itself. Works with `next dev`, but a modified client can
 *   misuse the token (lib/voiceWatch.ts watches for that).
 */
function relayMode(requested: boolean) {
  // Rollout: VOICE_RELAY=1 sends every interview through the relay (closing the
  // token gap: no Deepgram token reaches the browser); VOICE_RELAY=0 turns it off.
  // Unset, it's opt-in per interview (/interview?relay=1) for testing on production.
  if (process.env.VOICE_RELAY === "0") return false;
  return (process.env.VOICE_RELAY === "1" || requested) && relayAvailable();
}

/**
 * Starts an interview: checks limits, builds the voice agent Settings (the
 * interviewer prompt never ships in client code), and returns how to connect:
 * a relay session, or a Deepgram token that lasts the interview plus the Settings.
 */
export async function POST(req: NextRequest) {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return NextResponse.json({ error: "Voice is not configured." }, { status: 500 });

  let body: { profile?: ResumeProfile; interviewerId?: string; questions?: unknown; retryTopic?: string; mode?: unknown; noResume?: unknown; relay?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  // No profile is fine: the resume may still be being read (the browser adds it to the
  // interview when it's done), or it couldn't be read and this is a general interview.
  // A profile that is sent must be a real one.
  const profile = body.profile ?? null;
  if (profile && !profile.topics?.length) {
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

  const interviewer = getInterviewer(body.interviewerId);
  // Questions the candidate wants to practice: at most 5 strings of up to 200 characters.
  const questions = Array.isArray(body.questions)
    ? body.questions.filter((q): q is string => typeof q === "string").map((q) => q.replace(/\s+/g, " ").trim().slice(0, 200)).filter(Boolean).slice(0, 5)
    : [];
  // Without a resume, and none coming, the only interview left is the general one.
  const mode = !profile && body.noResume === true ? "general" : isInterviewMode(body.mode) ? body.mode : "mixed";
  const prompt = buildInterviewerPrompt({
    interviewer,
    profile,
    noResume: body.noResume === true,
    questions,
    minutes: sessionMinutes,
    retryTopic,
    mode,
  });
  const greetings = retryTopic
    ? ["Welcome back. Let's take another pass at one of your answers."]
    : interviewer.greetings;

  const settings = buildAgentSettings({
    interviewer,
    prompt,
    greeting: greetings[Math.floor(Math.random() * greetings.length)],
  });

  let voice: { kind: "relay"; sessionId: string } | { kind: "direct"; token: string; settings: typeof settings };
  if (relayMode(body.relay === true)) {
    const sessionId = crypto.randomUUID();
    try {
      await createVoiceSession(sessionId, { settings, startedAt: Date.now(), maxMs: sessionMinutes * 60_000 });
    } catch (err) {
      console.error("[session] couldn't create the voice session", err);
      return NextResponse.json({ error: "Couldn't start the voice session. Please try again." }, { status: 502 });
    }
    voice = { kind: "relay", sessionId };
  } else {
    let access_token: string;
    try {
      access_token = await grantDeepgramToken(key, directTokenTtl(sessionMinutes));
    } catch (err) {
      console.error("[session] deepgram grant failed", err);
      return NextResponse.json({ error: "Couldn't start the voice session. Please try again." }, { status: 502 });
    }

    voice = { kind: "direct", token: access_token, settings };
  }

  after(async () => {
    if (retryTopic) return trackEvent("retry_started");
    await trackEvent("interview_started");
    await trackEvent(`interviewer:${interviewer.id}`);
    await trackEvent(`mode:${mode}`);
    if (questions.length > 0) await trackEvent("custom_questions_used");
  });

  return NextResponse.json({
    voice,
    maxMinutes: sessionMinutes,
    interviewer: { id: interviewer.id, name: interviewer.name },
  });
}
