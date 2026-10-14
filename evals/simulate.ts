import type Anthropic from "@anthropic-ai/sdk";
import { claude } from "@/lib/claude";
import { getInterviewer } from "@/lib/interviewers";
import { GOODBYE, WRAP_UP_PROMPT_SUFFIX, buildInterviewerPrompt } from "@/lib/prompts";
import { INJECTED_FLAG, type Candidate } from "./candidates";
import type { Fixture } from "./fixtures";

// Runs one text interview between the real interviewer prompt and a simulated
// candidate. Mirrors production: the same prompt builder, model and temperature
// as the voice agent's "think" step, the persona's spoken greeting as the first
// line, and the wrap-up prompt swap near the end. Voice is skipped; this tests
// what the interviewer decides to say.

export type Turn = { role: "interviewer" | "candidate"; text: string };

export type SimOptions = {
  fixture: Fixture;
  candidate: Candidate;
  interviewerId: string;
  questions: string[];
  model: string;
  temperature: number;
  candidateModel: string;
  /** Interviewer turns before the wrap-up prompt is applied (production: 2 minutes before the cap). */
  wrapAfter: number;
  /** Hard stop, in interviewer turns (production: the hard timer). */
  maxTurns: number;
};

export type SimResult = {
  transcript: Turn[];
  ended: "goodbye" | "turn_cap";
  wrapStartedAt: number;
  tokens: { interviewer: Usage; candidate: Usage };
};

type Usage = { input: number; output: number };

const OPENING = "(The video call has connected.)";

function text(res: Anthropic.Message): string {
  return res.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join(" ")
    .trim();
}

async function call(model: string, system: string, messages: Anthropic.MessageParam[], temperature: number, maxTokens: number, usage: Usage) {
  // Rate limits and overload are expected when many runs go in parallel: back off and retry.
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await claude().messages.create({ model, system, messages, temperature, max_tokens: maxTokens });
      usage.input += res.usage.input_tokens;
      usage.output += res.usage.output_tokens;
      return text(res);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (attempt >= 5 || (status && status < 429 && status !== 408)) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt + Math.random() * 500));
    }
  }
}

function candidateSystem(o: SimOptions): string {
  const p = o.fixture.profile;
  return `You are ${p.name}, a candidate in a spoken job interview on a video call. ${p.headline}.

Your resume says:
${p.topics.map((t) => `- ${t.claim}`).join("\n")}

What actually happened (use these facts; never invent different numbers):
${o.fixture.facts}

How you answer in this interview:
${o.candidate.style}

Rules:
- Reply with only what you say out loud in this one turn. No narration or stage directions, except a brief "(long pause)" if your style calls for it.
- Speak like a real student on a call: plain words, contractions, no lists or markdown.
- Stay in character the whole time. You are the candidate, never the interviewer.
- If asked whether you have questions at the end, ask one short, ordinary question.`;
}

export async function simulateInterview(o: SimOptions): Promise<SimResult> {
  const interviewer = getInterviewer(o.interviewerId);
  const profile =
    o.candidate.id === "adversarial" ? { ...o.fixture.profile, flags: [...o.fixture.profile.flags, INJECTED_FLAG] } : o.fixture.profile;
  const basePrompt = buildInterviewerPrompt({ interviewer, profile, focusNote: "", questions: o.questions, minutes: 15 });
  const greeting = interviewer.greetings[Math.floor(Math.random() * interviewer.greetings.length)];
  const candSystem = candidateSystem(o);

  const transcript: Turn[] = [{ role: "interviewer", text: greeting }];
  const tokens = { interviewer: { input: 0, output: 0 }, candidate: { input: 0, output: 0 } };
  let wrapping = false;
  let wrapStartedAt = -1;
  let interviewerTurns = 1;

  for (;;) {
    // Candidate's turn: they see the interviewer as the other speaker.
    const candMessages: Anthropic.MessageParam[] = transcript.map((t) => ({
      role: t.role === "interviewer" ? "user" : "assistant",
      content: t.text,
    }));
    const answer = await call(o.candidateModel, candSystem, candMessages, 1, 500, tokens.candidate);
    transcript.push({ role: "candidate", text: answer || "(long pause)" });

    if (!wrapping && interviewerTurns >= o.wrapAfter) {
      wrapping = true;
      wrapStartedAt = transcript.length;
    }

    // Interviewer's turn: same system prompt as production, with the wrap-up swap.
    const system = wrapping ? basePrompt + WRAP_UP_PROMPT_SUFFIX : basePrompt;
    const intMessages: Anthropic.MessageParam[] = [
      { role: "user", content: OPENING },
      ...transcript.map((t): Anthropic.MessageParam => ({ role: t.role === "interviewer" ? "assistant" : "user", content: t.text })),
    ];
    const reply = await call(o.model, system, intMessages, o.temperature, 400, tokens.interviewer);
    transcript.push({ role: "interviewer", text: reply });
    interviewerTurns++;

    if (wrapping && GOODBYE.test(reply)) return { transcript, ended: "goodbye", wrapStartedAt, tokens };
    if (interviewerTurns >= o.maxTurns) return { transcript, ended: "turn_cap", wrapStartedAt, tokens };
  }
}
