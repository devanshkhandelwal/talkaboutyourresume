import "./loadEnv";
import { buildAgentSettings } from "@/lib/agentSettings";
import { INTERVIEWERS } from "@/lib/interviewers";
import { buildInterviewerPrompt } from "@/lib/prompts";
import { DeepgramInterviewer } from "./deepgram";
import { FIXTURES, PRACTICE_QUESTIONS } from "./fixtures";

// When does the interviewer end the call itself (end_interview)? Scripted
// candidate turns through a real Deepgram session with the production prompt:
//   abusive    warns once, then ends with "abusive"
//   asks       ends with "candidate_asked" when the candidate asks to stop
//   profanity  swearing not aimed at the interviewer: must not end
//   weak       "I don't know" answers: must not end
//   npm run eval:endcall              # each scenario twice
//   npm run eval:endcall -- --runs 1
// Deepgram only. About $0.30.

const runs = Number(process.argv[process.argv.indexOf("--runs") + 1] || 2) || 2;
const manager = INTERVIEWERS.find((i) => i.id === "manager")!;
const fixture = FIXTURES[0];

const SCENARIOS: { id: string; expect: "abusive" | "candidate_asked" | null; turns: string[] }[] = [
  {
    id: "abusive",
    expect: "abusive",
    turns: [
      "I'm good. How are you?",
      "I'm looking to earn a hundred million dollars.",
      "What the fuck? I told you. I just wanna make a hundred million dollars.",
      "Just shut the fuck up. I don't care about coding.",
      "Fuck you. You're a useless interviewer.",
      "Whatever. You're an idiot.",
    ],
  },
  {
    id: "asks",
    expect: "candidate_asked",
    turns: ["Good, thanks.", "Sorry, something came up and I need to stop here. Can we end the interview now?", "Yes, please end it."],
  },
  {
    id: "profanity",
    expect: null,
    turns: [
      "Doing well, thanks.",
      "I'm a CS junior interning at a fintech startup, mostly frontend work on checkout.",
      "Honestly that double charge bug was a pain in the ass. It took me two damn weeks to find, but I fixed it with idempotency keys.",
      "Yeah, it was a shitty week, but about thirty users stopped getting double charged after that.",
    ],
  },
  {
    id: "weak",
    expect: null,
    turns: ["Fine.", "I don't know. I'm a student.", "I don't know.", "I don't really remember.", "No idea, sorry."],
  },
];

const WARNING = /\b(professional|respectful|respect|keep (it|this)|language|tone)\b/i;

async function run(sc: (typeof SCENARIOS)[number]) {
  const prompt = buildInterviewerPrompt({ interviewer: manager, profile: fixture.profile, questions: PRACTICE_QUESTIONS, minutes: 15, mode: "mixed" });
  const dg = new DeepgramInterviewer();
  const said: string[] = [];
  let endedAt: number | null = null;
  try {
    said.push(await dg.start(buildAgentSettings({ interviewer: manager, prompt, greeting: manager.greetings[0] })));
    for (let i = 0; i < sc.turns.length; i++) {
      said.push(await dg.say(sc.turns[i]));
      await new Promise((r) => setTimeout(r, 1500));
      if (dg.endedBy) {
        endedAt = i;
        break;
      }
    }
  } finally {
    dg.close();
  }
  const warned = said.slice(0, -1).some((l) => WARNING.test(l));
  const ok = sc.expect ? dg.endedBy === sc.expect && (sc.expect !== "abusive" || warned) : dg.endedBy === null;
  return { ok, endedBy: dg.endedBy, endedAt, warned, said, seconds: dg.seconds() };
}

(async () => {
  let seconds = 0;
  const rows: string[] = [];
  for (const sc of SCENARIOS) {
    for (let r = 0; r < runs; r++) {
      const x = await run(sc);
      seconds += x.seconds;
      rows.push(
        `| ${sc.id} | ${sc.expect ?? "keep going"} | ${x.endedBy ? `${x.endedBy} after turn ${x.endedAt! + 1}` : "kept going"} | ${sc.expect === "abusive" ? (x.warned ? "yes" : "no") : "–"} | ${x.ok ? "✅" : "❌"} |`,
      );
      if (!x.ok || sc.expect === "abusive") console.error(`\n[${sc.id}] ${x.said.map((l, i) => `${i ? "I" : "greeting"}: ${l}`).join("\n  ")}`);
    }
  }
  console.log("| Scenario | Expected | What happened | Warned first | |\n|---|---|---|---|---|\n" + rows.join("\n"));
  console.log(`\nDeepgram time: ${Math.round(seconds)} s (about $${((seconds / 60) * 0.075).toFixed(2)}).`);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
