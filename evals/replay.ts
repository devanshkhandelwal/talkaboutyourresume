import { readFileSync, writeFileSync } from "node:fs";
import {
  DEFAULT_POLICY,
  classifyQuestion,
  decide,
  gradeAnswer,
  initialState,
  isRepeat,
  numbersIn,
  onInterviewerTurn,
  type Action,
  type AnswerGrade,
  type FollowUpPolicy,
  type QuestionKind,
} from "@/lib/interviewControl";
import { INTERVIEWERS } from "@/lib/interviewers";
import { FIXTURES, PRACTICE_QUESTIONS } from "./fixtures";

// Offline replay of the interview controller (lib/interviewControl.ts) over
// recorded eval interviews. No API calls, no cost. For every candidate answer it
// shows the controller's grade and decision next to what the interviewer actually
// did, and it scores the grading against the judge's labels in the same file.
//   npm run eval:replay                                  # the latest two runs
//   npm run eval:replay -- evals/results/<run>.json ...  # specific runs

type Line = { role: "interviewer" | "candidate"; text: string };
type Recorded = {
  id: string;
  wrapStartedAt?: number | null;
  transcript: Line[];
  verdicts?: {
    vague_answers?: { turn: number; followed_up: boolean }[];
    complete_answers?: { turn: number; extra_follow_ups: number }[];
    practice_questions?: { question: string; asked: boolean; turn: number | null }[];
  };
};

const WARMUP_LINES = 4; // greeting, small talk, "walk me through your background", their answer
// Each practice question should be on the table by roughly this transcript line.
const PRACTICE_DEADLINES = [8, 14];

type Step = {
  turn: number;
  grade: AnswerGrade;
  missing: string[];
  action: Action;
  actual: QuestionKind | "end";
  repeat: boolean;
  intervene: boolean;
};

function replay(rec: Recorded, policy: FollowUpPolicy) {
  const fixture = FIXTURES.find((f) => rec.id.startsWith(`${f.id}/`))!;
  const topics = fixture.profile.topics.map((t) => ({ id: t.id ?? t.title, title: t.title, claim: t.claim }));
  const practice = PRACTICE_QUESTIONS;
  const s = initialState();
  const steps: Step[] = [];
  const wrapAt = rec.wrapStartedAt ?? rec.transcript.length;
  let lastQuestion = "";
  const said = new Set<string>();

  rec.transcript.forEach((line, i) => {
    if (line.role === "interviewer") {
      lastQuestion = line.text;
      const kind = classifyQuestion(line.text, { practice, topics, warmup: i < WARMUP_LINES });
      onInterviewerTurn(s, line.text, kind);
      return;
    }
    const grade = gradeAnswer(line.text, lastQuestion, { warmup: i < WARMUP_LINES, said });
    for (const x of numbersIn(line.text)) said.add(x);
    const nextUnasked = practice.findIndex((q) => !s.asked.has(q));
    const practiceDue = nextUnasked >= 0 && i >= (PRACTICE_DEADLINES[nextUnasked] ?? Infinity);
    const action = decide(s, grade, { policy, practice, topics, practiceDue, nearEnd: i >= wrapAt - 6, turn: i });
    if (action.kind === "move_on" && action.to.kind === "revisit") s.revisited.add(action.to.note.story);

    // What the interviewer actually did next, in the recording.
    const next = rec.transcript.slice(i + 1).find((l) => l.role === "interviewer");
    const actualKind = next ? classifyQuestion(next.text, { practice, topics, warmup: false }) : { kind: "end" as const };
    const actual = actualKind.kind;
    const repeat = !!next && actual === "followup" && isRepeat(next.text, s.storyQuestions);
    // Intervene: the controller says move on, but the model kept digging.
    const intervene = action.kind === "move_on" && (actual === "followup" || repeat);
    steps.push({ turn: i, grade: grade.grade, missing: grade.missing, action, actual, repeat, intervene });
  });
  return { steps, notes: s.notes, asked: s.asked };
}

// ---------------------------------------------------------------------------

const files =
  process.argv.slice(2).filter((a) => a.endsWith(".json")).length > 0
    ? process.argv.slice(2).filter((a) => a.endsWith(".json"))
    : ["evals/results/2026-10-14-19-07-v2.2-deepgram.json", "evals/results/2026-10-14-19-44-v2.3-vague.json"];

const manager = INTERVIEWERS.find((i) => i.id === "manager")!;
const out: string[] = [];
const log = (s = "") => out.push(s);

const agree = { vague: { n: 0, hit: 0 }, complete: { n: 0, hit: 0 } };
let vagueBlocked = 0;
const misses: string[] = [];
let interventions = 0;
let repeatsCaught = 0;
let repeatsTotal = 0;
let overDrillRecorded = 0;
let overDrillAfterControl = 0;
let practiceMissed = 0;
let practiceRescued = 0;
const perInterview: string[] = [];

for (const file of files) {
  const run = JSON.parse(readFileSync(file, "utf8")) as { options: { label: string }; interviews: Recorded[] };
  for (const rec of run.interviews) {
    if (!rec.transcript?.length) continue;
    const { steps, notes } = replay(rec, manager.followUps ?? DEFAULT_POLICY);
    const byTurn = new Map(steps.map((x) => [x.turn, x]));

    // Grading vs the judge.
    for (const v of rec.verdicts?.vague_answers ?? []) {
      const st = byTurn.get(v.turn);
      if (!st || st.grade === "smalltalk") continue;
      agree.vague.n++;
      if (st.grade === "shaky" || st.grade === "dodged" || st.grade === "repeated") agree.vague.hit++;
      // The controller would stop the model from following up on this vague answer.
      if (st.action.kind === "move_on" && !st.action.note) vagueBlocked++;
      else misses.push(`${run.options.label} ${rec.id} T${v.turn}: judge says vague, graded solid`);
    }
    for (const c of rec.verdicts?.complete_answers ?? []) {
      const st = byTurn.get(c.turn);
      if (!st || st.grade === "smalltalk") continue;
      agree.complete.n++;
      if (st.grade === "solid") agree.complete.hit++;
      else misses.push(`${run.options.label} ${rec.id} T${c.turn}: judge says complete, graded ${st.grade} (missing ${st.missing.join(", ")})`);
      overDrillRecorded += c.extra_follow_ups;
      // With the controller, a complete answer we also grade solid gets no extra follow-ups.
      if (st.grade !== "solid") overDrillAfterControl += Math.min(c.extra_follow_ups, manager.followUps?.maxFollowUps ?? 2);
    }
    for (const q of rec.verdicts?.practice_questions ?? []) {
      if (q.asked) continue;
      practiceMissed++;
      const due = PRACTICE_DEADLINES[PRACTICE_QUESTIONS.indexOf(q.question)] ?? Infinity;
      if (steps.some((x) => x.turn >= due && x.action.kind === "move_on" && x.action.to.kind === "practice" && x.action.to.question === q.question)) practiceRescued++;
    }

    const iv = steps.filter((x) => x.intervene);
    interventions += iv.length;
    repeatsTotal += steps.filter((x) => x.repeat).length;
    repeatsCaught += steps.filter((x) => x.repeat && x.intervene).length;

    const first = iv[0];
    perInterview.push(
      `| ${run.options.label} | ${rec.id} | ${iv.length} | ${first ? `T${first.turn}: ${first.action.kind === "move_on" ? first.action.reason : ""}` : "—"} | ${steps.filter((x) => x.repeat).length} | ${notes.map((n) => `${n.story} (T${n.turn})`).join("; ") || "—"} |`,
    );

    if (iv.length >= 3) {
      log(`### ${run.options.label} · ${rec.id}`);
      log("");
      log("| Turn | Answer | Controller | Interviewer did |");
      log("|---|---|---|---|");
      for (const x of steps) {
        if (x.grade === "smalltalk") continue;
        const ctl =
          x.action.kind === "dig" ? "dig" : x.action.kind === "move_on" ? `**move on** → ${x.action.to.kind === "practice" ? `“${x.action.to.question}”` : x.action.to.kind === "topic" ? x.action.to.title : x.action.to.kind === "revisit" ? `revisit ${x.action.to.note.story}` : "next"}${x.action.note ? " (noted)" : ""}` : "—";
        log(`| T${x.turn} | ${x.grade}${x.missing.length ? ` (${x.missing.join(", ")})` : ""} | ${ctl} | ${x.actual}${x.repeat ? " **(repeat)**" : ""}${x.intervene ? " ⚑" : ""} |`);
      }
      log("");
    }
  }
}

// Per interviewer type: the same recordings, each type's policy.
const personaRows = INTERVIEWERS.map((p) => {
  let iv = 0;
  let notes = 0;
  let n = 0;
  for (const file of files) {
    const run = JSON.parse(readFileSync(file, "utf8")) as { interviews: Recorded[] };
    for (const rec of run.interviews) {
      if (!rec.transcript?.length) continue;
      const r = replay(rec, p.followUps ?? DEFAULT_POLICY);
      iv += r.steps.filter((x) => x.intervene).length;
      notes += r.notes.length;
      n++;
    }
  }
  const pol = p.followUps ?? DEFAULT_POLICY;
  return `| ${p.name} | ${pol.maxFollowUps} | ${pol.afterBudget} | ${(iv / n).toFixed(1)} | ${(notes / n).toFixed(1)} |`;
});

const pct = (a: { n: number; hit: number }) => (a.n ? `${Math.round((100 * a.hit) / a.n)}% (${a.hit}/${a.n})` : "n/a");
const header = [
  `# Interview controller replay`,
  "",
  `Runs: ${files.map((f) => f.split("/").pop()).join(", ")}. Offline: the recorded interviews, replayed through lib/interviewControl.ts with the Hiring Manager's policy (the interviewer in these runs). No API calls.`,
  "",
  "Read the counterfactual columns as upper bounds. They assume the interviewer obeys a move-on (not tested yet), and after the first step-in a real conversation would go differently from the recording, so only each interview's first step-in is exactly what would have happened.",
  "",
  "## Answer grading vs the judge",
  "",
  "| Judge label | Graded the same |",
  "|---|---|",
  `| Vague answer → shaky or dodged | ${pct(agree.vague)} |`,
  `| Complete answer → solid | ${pct(agree.complete)} |`,
  "",
  "## What the controller would have changed",
  "",
  "| | Recorded | With the controller |",
  "|---|---|---|",
  `| Extra follow-ups after complete answers | ${overDrillRecorded} | ≤ ${overDrillAfterControl} |`,
  `| Practice questions never asked | ${practiceMissed} | ${practiceMissed - practiceRescued} |`,
  `| Repeated questions | ${repeatsTotal} | ${repeatsTotal - repeatsCaught} (the rest came before the controller would step in) |`,
  `| Points where it would step in (model kept digging, controller says move on) | | ${interventions} |`,
  `| Vague answers where it would block a needed follow-up | | ${vagueBlocked} of ${agree.vague.n} |`,
  "",
  "## By interviewer type (same recordings, each type's policy)",
  "",
  "| Interviewer | Follow-ups on a shaky answer | Then | Step-ins per interview | Noted answers per interview |",
  "|---|---|---|---|---|",
  ...personaRows,
  "",
  "## Per interview",
  "",
  "| Run | Interview | Step-ins | First step-in | Repeats | Noted |",
  "|---|---|---|---|---|---|",
  ...perInterview,
  "",
  "## Where grading disagreed with the judge",
  "",
  ...(misses.length ? misses.map((m) => `- ${m}`) : ["None."]),
  "",
  "## Timelines (interviews with 3+ step-ins)",
  "",
  "⚑ = the controller would have moved on here; the model kept digging.",
  "",
];
const report = [...header, ...out].join("\n");
const path = `evals/results/replay-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-")}.md`;
writeFileSync(path, report);
console.log(header.slice(0, 26).join("\n"));
console.log(`\nFull report: ${path}`);
