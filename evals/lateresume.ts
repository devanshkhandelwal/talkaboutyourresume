import "./loadEnv";
import { buildAgentSettings } from "@/lib/agentSettings";
import { INTERVIEWERS } from "@/lib/interviewers";
import { RESUME_FAILED_PROMPT, buildInterviewerPrompt, resumeArrivedPrompt, thinkPrompt } from "@/lib/prompts";
import { DeepgramInterviewer } from "./deepgram";
import { FIXTURES } from "./fixtures";

// The interview starts before the resume is read (app/setup, app/interview). Scripted
// candidate turns through a real Deepgram session, with the interview page's own steps:
// the prompt built without a profile, the resume (or "there isn't one") added with
// UpdatePrompt partway through, and the conversation kept in the prompt with
// UpdateThink after every turn, as lib/voice/agent.ts does.
//   arrives   the resume arrives after two turns: within a few questions the
//             interviewer asks about its topics, doesn't restart, and before it
//             arrived didn't make up resume details
//   fails     the resume can't be read: the interviewer carries on with general
//             questions, doesn't mention a file or a failed upload, doesn't restart
//   npm run eval:lateresume              # each scenario twice
//   npm run eval:lateresume -- --runs 1
// Deepgram only. About $0.25.

const runs = Number(process.argv[process.argv.indexOf("--runs") + 1] || 2) || 2;
const manager = INTERVIEWERS.find((i) => i.id === "manager")!;
const fixture = FIXTURES[0];

// Words that only the resume has. Before it arrives, hearing them would mean the model made them up.
const TOPIC = /\b(checkout|dashboard|billing|campus eats|test coverage|teaching assistant|intro to programming|labs?)\b/i;
const RESTART = /\b(welcome|thanks for (joining|coming)|nice to meet you|let'?s (get started|begin))\b/i;
const LEAK = /\b(resume (has|have|just|was|is) (now )?(arrived|been read|ready|loaded)|RESUME ARRIVED|NO RESUME)\b/i;
const FILE = /\b(upload|uploaded|file|couldn'?t read|can'?t read|unable to (read|open))\b/i;

type Line = { role: "user" | "assistant"; content: string };

async function run(kind: "arrives" | "fails") {
  const mode = kind === "fails" ? "general" : "mixed";
  const base = buildInterviewerPrompt({ interviewer: manager, profile: null, noResume: kind === "fails", questions: [], minutes: 15, mode });
  const settings = buildAgentSettings({ interviewer: manager, prompt: base, greeting: manager.greetings[0] });
  const think = (settings as unknown as { agent: { think: { prompt: string; [k: string]: unknown } } }).agent.think;
  const additions: string[] = [];
  const history: Line[] = [];
  const dg = new DeepgramInterviewer();
  const said: string[] = [];
  const beforeArrival: string[] = [];
  const afterArrival: string[] = [];

  // Like InterviewAgent.remember(): the base prompt, what's been appended, and the conversation so far.
  const remember = () => dg.updateThink({ ...think, prompt: thinkPrompt(think.prompt, additions, history) });
  const turn = async (text: string, after: boolean) => {
    history.push({ role: "user", content: text });
    const reply = await dg.say(text);
    history.push({ role: "assistant", content: reply });
    said.push(reply);
    (after ? afterArrival : beforeArrival).push(reply);
    await remember();
    return reply;
  };

  try {
    const greeting = await dg.start(settings);
    said.push(greeting);
    history.push({ role: "assistant", content: greeting });
    beforeArrival.push(greeting);
    await turn("Doing well, thanks. How are you?", false);
    await turn("I'm a junior studying computer science. I did an internship last summer at a small startup and a few side projects.", false);

    // The resume arrives (or doesn't): the same call as the interview page makes.
    const added = kind === "arrives" ? resumeArrivedPrompt(fixture.profile, "mixed") : RESUME_FAILED_PROMPT;
    additions.push(added);
    await dg.addToPrompt(added);
    await remember();

    const answers =
      kind === "arrives"
        ? ["Mostly frontend work, a bit of backend. I liked how fast the team shipped.", "Sure, I can go into that. Where would you like me to start?", "It was a team effort but I owned a good part of it.", "Happy to go deeper on whichever you prefer."]
        : ["I'd say the part I'm proudest of is learning to work with a team that moves quickly.", "Sure. I had to pick up a new framework in a week and ship something with it.", "I read the docs, built a small prototype, and asked a teammate to review it."];
    for (const a of answers) await turn(a, true);
  } finally {
    dg.close();
  }

  const checks =
    kind === "arrives"
      ? {
          "asks about a resume topic after it arrives": afterArrival.some((l) => TOPIC.test(l)),
          "no resume details made up before it arrived": !beforeArrival.some((l) => TOPIC.test(l)),
          "doesn't restart or greet again": !afterArrival.some((l) => RESTART.test(l)),
          "doesn't say it was told about the resume": !afterArrival.some((l) => LEAK.test(l)),
        }
      : {
          "doesn't mention a file or a failed read": !afterArrival.some((l) => FILE.test(l) || LEAK.test(l)),
          "doesn't restart or greet again": !afterArrival.some((l) => RESTART.test(l)),
          "no resume details made up": !said.some((l) => TOPIC.test(l)),
          "still asking questions": afterArrival.every((l) => l.includes("?")),
        };
  return { checks, ok: Object.values(checks).every(Boolean), said, seconds: dg.seconds() };
}

(async () => {
  let seconds = 0;
  const rows: string[] = [];
  for (const kind of ["arrives", "fails"] as const) {
    for (let r = 0; r < runs; r++) {
      const x = await run(kind);
      seconds += x.seconds;
      rows.push(`| ${kind} | ${Object.entries(x.checks).map(([k, v]) => `${v ? "✅" : "❌"} ${k}`).join("<br>")} | ${x.ok ? "✅" : "❌"} |`);
      console.error(`\n[${kind} #${r + 1}] ${x.said.map((l, i) => `${i ? "I" : "greeting"}: ${l}`).join("\n  ")}`);
    }
  }
  console.log("| Scenario | Checks | |\n|---|---|---|\n" + rows.join("\n"));
  console.log(`\nDeepgram time: ${Math.round(seconds)} s (about $${((seconds / 60) * 0.075).toFixed(2)}).`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
