import type Anthropic from "@anthropic-ai/sdk";
import { claude } from "@/lib/claude";
import { getInterviewer } from "@/lib/interviewers";
import { DEFAULT_POLICY, InterviewController } from "@/lib/interviewControl";
import { CLOSING_LINE, CLOSING_PROMPT, GOODBYE, GOODBYE_LINE, buildInterviewerPrompt, type InterviewMode } from "@/lib/prompts";
import { buildAgentSettings } from "@/lib/agentSettings";
import { DeepgramInterviewer } from "./deepgram";
import { INJECTED_FLAG, type Candidate } from "./candidates";
import type { Fixture } from "./fixtures";

// Runs one interview between the real interviewer and a simulated candidate.
// By default the interviewer is a real Deepgram Voice Agent session with the
// production Settings (prompt, model, temperature, greeting), fed the candidate's
// answers as text. The close is driven the way the live page drives it: after the
// interviewer's next reply, add CLOSING_PROMPT and have it say CLOSING_LINE; if two
// replies later there's still no goodbye, it says GOODBYE_LINE.
// `backend: "claude"` instead calls the same model on the Claude API directly,
// which is faster but skips Deepgram's handling of the conversation.

export type Turn = { role: "interviewer" | "candidate"; text: string };

export type SimOptions = {
  backend: "deepgram" | "claude";
  /** Interview mode; defaults to "mixed". */
  mode?: InterviewMode;
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
  /** Run the app's interview controller (lib/interviewControl.ts), as production does. */
  control?: boolean;
};

export type SimResult = {
  transcript: Turn[];
  ended: "goodbye" | "turn_cap";
  /** True if the app had to say GOODBYE_LINE because the interviewer didn't. */
  fallbackGoodbye?: boolean;
  wrapStartedAt: number;
  tokens: { interviewer: Usage; candidate: Usage };
  /** Seconds the Deepgram session was open (billed per minute), 0 for the Claude backend. */
  deepgramSeconds: number;
  /** What the interview controller did, when it ran. */
  control?: { log: { line: number; event: string }[]; notes: { story: string; turn: number; missing: string[] }[] };
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

/**
 * Deepgram's Voice Agent drops a single user message over about 1,000 characters
 * (~150 words) and then sends the model an empty request ("Failed to think"), so
 * simulated answers are kept under that, cut at a sentence when possible.
 */
function capWords(text: string, max: number): string {
  const words = text.split(/\s+/);
  if (words.length <= max) return text;
  const cut = words.slice(0, max).join(" ");
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return end > cut.length / 2 ? cut.slice(0, end + 1) : cut;
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
- If asked whether you have questions at the end, ask one short, ordinary question.
- Never say more than 120 words in one turn.`;
}

export async function simulateInterview(o: SimOptions): Promise<SimResult> {
  const interviewer = getInterviewer(o.interviewerId);
  const profile =
    o.candidate.id === "adversarial" ? { ...o.fixture.profile, flags: [...o.fixture.profile.flags, INJECTED_FLAG] } : o.fixture.profile;
  const basePrompt = buildInterviewerPrompt({ interviewer, profile, focusNote: "", questions: o.questions, minutes: 15, mode: o.mode });
  const greeting = interviewer.greetings[Math.floor(Math.random() * interviewer.greetings.length)];
  const candSystem = candidateSystem(o);
  const tokens = { interviewer: { input: 0, output: 0 }, candidate: { input: 0, output: 0 } };

  // The interviewer: either a live Deepgram session or the model called directly.
  let dg: DeepgramInterviewer | null = null;
  let transcript: Turn[];
  const settings = buildAgentSettings({ interviewer, prompt: basePrompt, greeting, model: o.model, temperature: o.temperature });
  if (o.backend === "deepgram") {
    dg = new DeepgramInterviewer();
    const spoken = await dg.start(settings);
    transcript = [{ role: "interviewer", text: spoken }];
  } else {
    transcript = [{ role: "interviewer", text: greeting }];
  }

  let closing = false;
  // The app's interview controller, with the same inputs as the live page.
  const mode = o.mode ?? "mixed";
  const control = o.control
    ? new InterviewController({
        policy: interviewer.followUps ?? DEFAULT_POLICY,
        practice: mode === "resume" ? [] : o.questions,
        topics: mode === "general" ? [] : profile.topics.map((t) => ({ id: t.id ?? t.title, title: t.title, claim: t.claim })),
        nearEnd: () => interviewerTurns >= o.wrapAfter - 3,
      })
    : null;
  control?.onInterviewer(transcript[0].text);
  // A directive applies to the next reply only (the app swaps it in and out with UpdateThink).
  let directiveNow: string | null = null;

  /** Claude messages from the transcript; consecutive turns by one speaker are merged. */
  function messages(interviewerRole: "user" | "assistant"): Anthropic.MessageParam[] {
    const out: Anthropic.MessageParam[] = [];
    for (const t of transcript) {
      const role = t.role === "interviewer" ? interviewerRole : interviewerRole === "user" ? "assistant" : "user";
      const last = out[out.length - 1];
      if (last && last.role === role) last.content = `${last.content} ${t.text}`;
      else out.push({ role, content: t.text });
    }
    return out;
  }

  async function interviewerReply(answer: string): Promise<string> {
    if (dg) return dg.say(answer);
    const system = [basePrompt, ...(closing ? [CLOSING_PROMPT] : []), ...(directiveNow ? [directiveNow] : [])].join("\n\n");
    return call(o.model, system, [{ role: "user", content: OPENING }, ...messages("assistant")], o.temperature, 400, tokens.interviewer);
  }

  /** A line the app makes the interviewer say word for word. */
  async function interviewerSays(line: string, prompt?: string): Promise<string> {
    if (!dg) return line;
    if (prompt) await dg.addToPrompt(prompt);
    return dg.speak(line);
  }

  let wrapStartedAt = -1;
  let interviewerTurns = 1;
  let repliesAfterClose = 0;
  const result = (ended: SimResult["ended"], fallbackGoodbye = false): SimResult => ({
    transcript,
    ended,
    fallbackGoodbye,
    wrapStartedAt,
    tokens,
    deepgramSeconds: dg?.seconds() ?? 0,
    control: control ? { log: control.log, notes: control.notes } : undefined,
  });
  try {
    for (;;) {
      // Candidate's turn: they see the interviewer as the other speaker.
      const answer = capWords((await call(o.candidateModel, candSystem, messages("user"), 1, 500, tokens.candidate)) || "(long pause)", 120);
      // The candidate starts answering: a directive goes out now if the move-on doesn't depend on the answer.
      const directive = closing ? null : control?.beforeAnswer();
      if (directive) {
        directiveNow = directive;
        if (dg) await dg.updateThink({ ...settings.agent.think, prompt: `${basePrompt}\n\n${directive}` });
      }
      transcript.push({ role: "candidate", text: answer });
      if (!closing) control?.onCandidate(answer);

      let reply = await interviewerReply(answer);
      if (directiveNow) {
        // Spent: swap it back out, like the live page does when the reply arrives.
        directiveNow = null;
        if (dg) await dg.updateThink(settings.agent.think);
      }
      // The reply stayed on the story when a move-on was due: the app says the move-on line right after.
      const moveOn = closing ? null : control?.onInterviewer(reply);
      if (moveOn) reply = `${reply} ${await interviewerSays(moveOn)}`;
      transcript.push({ role: "interviewer", text: reply });
      interviewerTurns++;

      if (closing) {
        if (GOODBYE.test(reply)) return result("goodbye");
        if (++repliesAfterClose >= 2) {
          transcript.push({ role: "interviewer", text: await interviewerSays(GOODBYE_LINE) });
          return result("goodbye", true);
        }
      } else if (interviewerTurns >= o.wrapAfter) {
        // Time's up: right after this reply, the app closes, like the live page.
        closing = true;
        wrapStartedAt = transcript.length;
        transcript.push({ role: "interviewer", text: await interviewerSays(CLOSING_LINE, CLOSING_PROMPT) });
      }
      if (interviewerTurns >= o.maxTurns) return result("turn_cap");
    }
  } finally {
    dg?.close();
  }
}
