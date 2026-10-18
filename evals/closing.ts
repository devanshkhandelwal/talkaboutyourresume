import "./loadEnv";
import { readFileSync } from "node:fs";
import { buildAgentSettings } from "@/lib/agentSettings";
import { INTERVIEWERS } from "@/lib/interviewers";
import { CLOSING_PROMPT, buildInterviewerPrompt } from "@/lib/prompts";
import { DeepgramInterviewer } from "./deepgram";
import { FIXTURES, PRACTICE_QUESTIONS } from "./fixtures";

// Does the interviewer praise the candidate's question at the close ("That's a
// great question")? Recorded closings are resumed in a real Deepgram session (the
// conversation up to "what questions do you have for me?" as agent.context), the
// candidate's recorded question is sent, and the reply is checked. Setups:
//   plain    production Settings, then the close's UpdatePrompt, as live
//   swapped  the same, after a directive was swapped in and out with UpdateThink
//   nofunc   plain, without the end_interview function
//   npm run eval:closing -- <results>.json [--cases 12] [--modes plain,swapped,nofunc]
// Deepgram only, about $0.15 per 12 sessions.

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const file = process.argv.slice(2).find((a) => a.endsWith(".json"));
if (!file) throw new Error("Pass an eval results .json with transcripts.");
const CASES = Number(arg("cases") ?? 12);
const MODES = (arg("modes") ?? "plain,swapped,nofunc").split(",") as Mode[];
type Mode = "plain" | "swapped" | "nofunc";
const PRAISE = /\b(great|good|excellent|fantastic|interesting|smart|thoughtful) question/i;
const manager = INTERVIEWERS.find((i) => i.id === "manager")!;

type Line = { role: "interviewer" | "candidate"; text: string };
const run = JSON.parse(readFileSync(file, "utf8")) as { interviews: { id: string; transcript?: Line[] }[] };
const cases = run.interviews
  .flatMap((x) => {
    const t = x.transcript ?? [];
    const k = t.findIndex((l, i) => l.role === "interviewer" && /what questions do you have for me/i.test(l.text) && t[i + 1]?.role === "candidate");
    return k >= 0 && !x.id.includes("adversarial") ? [{ id: x.id, history: t.slice(0, k + 1), question: t[k + 1].text }] : [];
  })
  .slice(0, CASES);

async function trial(c: (typeof cases)[number], mode: Mode) {
  const fixture = FIXTURES.find((f) => c.id.startsWith(`${f.id}/`))!;
  const prompt = buildInterviewerPrompt({ interviewer: manager, profile: fixture.profile, focusNote: "", questions: PRACTICE_QUESTIONS, minutes: 15, mode: "mixed" });
  const settings = buildAgentSettings({ interviewer: manager, prompt, greeting: "" }) as { agent: { greeting?: string; context?: unknown; think: { prompt: string; functions?: unknown } } };
  delete settings.agent.greeting;
  if (mode === "nofunc") delete settings.agent.think.functions;
  settings.agent.context = { messages: c.history.map((l) => ({ type: "History", role: l.role === "interviewer" ? "assistant" : "user", content: l.text })) };
  const dg = new DeepgramInterviewer();
  try {
    await dg.start(settings);
    if (mode === "swapped") {
      const think = settings.agent.think;
      await dg.updateThink({ ...think, prompt: `${think.prompt}\n\nDIRECTIVE 1. For your next reply only: give one short, neutral acknowledgment with no praise, then move on.` });
      await dg.updateThink(think);
    }
    await dg.addToPrompt(CLOSING_PROMPT);
    const reply = await dg.say(c.question);
    return { praised: PRAISE.test(reply), reply, seconds: dg.seconds() };
  } finally {
    dg.close();
  }
}

(async () => {
  const tally: Record<string, { n: number; praised: number }> = {};
  let seconds = 0;
  const jobs = cases.flatMap((c) => MODES.map((m) => ({ c, m })));
  let next = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < jobs.length) {
        const { c, m } = jobs[next++];
        try {
          const r = await trial(c, m);
          seconds += r.seconds;
          tally[m] ??= { n: 0, praised: 0 };
          tally[m].n++;
          if (r.praised) tally[m].praised++;
          console.error(`${m.padEnd(8)} ${c.id}: ${r.praised ? "PRAISED" : "ok"}  ${r.reply.slice(0, 90)}`);
        } catch (err) {
          console.error(`${m} ${c.id}: error ${(err as Error).message}`);
        }
      }
    }),
  );
  console.log("| Setup | Praised the question |\n|---|---|");
  for (const m of MODES) if (tally[m]) console.log(`| ${m} | ${tally[m].praised} of ${tally[m].n} |`);
  console.log(`\nDeepgram time: ${Math.round(seconds)} s (about $${((seconds / 60) * 0.075).toFixed(2)}).`);
  process.exit(0);
})();
