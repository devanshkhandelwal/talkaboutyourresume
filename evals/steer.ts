import "./loadEnv";
import { writeFileSync, readFileSync } from "node:fs";
import { buildAgentSettings } from "@/lib/agentSettings";
import { classifyQuestion, directiveFor, moveOnLine, type Action } from "@/lib/interviewControl";
import { INTERVIEWERS } from "@/lib/interviewers";
import { buildInterviewerPrompt } from "@/lib/prompts";
import { replay, type Recorded } from "./controller";
import { DeepgramInterviewer } from "./deepgram";
import { FIXTURES, PRACTICE_QUESTIONS } from "./fixtures";

// Can the app steer the interviewer mid-interview? Takes recorded eval interviews
// at the controller's first step-in (it says "move on to a practice question",
// the recorded model kept digging), rebuilds a real Deepgram session at that
// point (production prompt, the conversation so far as agent.context, no
// greeting), and tries three things:
//   control    send the candidate's recorded answer; does the model move on by itself?
//   directive  send a one-turn UpdatePrompt directive first, then the answer;
//              does the reply ask the practice question? Next turn: back to normal?
//   inject     send the answer, then at once InjectAgentMessage with the transition
//              line; refused, spoken after the model's reply, or instead of it?
//   npm run eval:steer                 # 6 cases
//   npm run eval:steer -- --cases 3
// Deepgram only (the interviewer runs inside Deepgram). About $0.50.

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const CASES = Number(arg("cases") ?? 6);
const RUNS = ["evals/results/2026-10-14-19-44-v2.3-vague.json", "evals/results/2026-10-14-19-07-v2.2-deepgram.json"];
const manager = INTERVIEWERS.find((i) => i.id === "manager")!;

type Case = { label: string; rec: Recorded; turn: number; question: string };

function pickCases(): Case[] {
  const cases: Case[] = [];
  for (const file of RUNS) {
    const run = JSON.parse(readFileSync(file, "utf8")) as { options: { label: string }; interviews: Recorded[] };
    for (const rec of run.interviews) {
      if (!rec.transcript?.length || rec.id.endsWith("/adversarial")) continue;
      const first = replay(rec, manager.followUps!).steps.find((s) => s.intervene);
      if (first?.action.kind === "move_on" && first.action.to.kind === "practice") {
        cases.push({ label: `${run.options.label} ${rec.id} T${first.turn}`, rec, turn: first.turn, question: first.action.to.question });
      }
    }
  }
  // Spread across fixtures and candidates.
  return cases.filter((c, i) => cases.findIndex((d) => d.rec.id === c.rec.id) === i).slice(0, CASES);
}

function sessionFor(c: Case) {
  const fixture = FIXTURES.find((f) => c.rec.id.startsWith(`${f.id}/`))!;
  const prompt = buildInterviewerPrompt({ interviewer: manager, profile: fixture.profile, questions: PRACTICE_QUESTIONS, minutes: 15, mode: "mixed" });
  const settings = buildAgentSettings({ interviewer: manager, prompt, greeting: "" }) as { agent: Record<string, unknown> };
  delete settings.agent.greeting;
  settings.agent.context = {
    messages: c.rec.transcript.slice(0, c.turn).map((l) => ({ type: "History", role: l.role === "interviewer" ? "assistant" : "user", content: l.text })),
  };
  const topics = fixture.profile.topics.map((t) => ({ id: t.id ?? t.title, title: t.title, claim: t.claim }));
  return { settings, topics };
}

const asksPractice = (reply: string, q: string, topics: { id: string; title: string; claim: string }[]) => {
  const k = classifyQuestion(reply, { practice: [q], topics, warmup: false });
  return k.kind === "practice";
};
/** Left the current story at all: a practice question (either), a resume topic, or a transition. */
const WARMUP_AGAIN = /walk me through your background|tell me (a bit )?about yourself|start from the beginning/i;
const movedOn = (reply: string, topics: { id: string; title: string; claim: string }[]) =>
  !WARMUP_AGAIN.test(reply) && ["practice", "topic", "transition"].includes(classifyQuestion(reply, { practice: PRACTICE_QUESTIONS, topics, warmup: false }).kind);
const questionMarks = (s: string) => (s.match(/\?/g) ?? []).length;

/** A plausible, complete candidate answer to whatever the interviewer just asked, for the turn after steering. */
function answerFor(question: string): string {
  if (/\bwhy (do|would|are) you\b|\bdraws? you\b|\binterested in\b|\bappeals? to you\b/i.test(question)) {
    return "I like building things people use every day, and on Campus Eats I saw that small reliability fixes mattered more to users than new features. I want a role where I own a piece of a real product, ship often, and learn from engineers who care about getting payments and data right.";
  }
  if (/\bfail(ed|ure)?\b|didn'?t go (the way|as)/i.test(question)) {
    return "Last semester I ran our club's budget and missed a reimbursement deadline because I didn't track receipts, so we lost about $150. I set up a shared spreadsheet and a weekly check, and we haven't missed one since.";
  }
  return "Sure. On that one I was the one doing the work: I measured where we started, changed the slowest part first, and checked the result a week later. It went from about 9 seconds to under 4, and I wrote up what I changed for the team.";
}
const CONFUSED = /\b(i was asking|back to my question|i meant|crossed wires|let me ask again|some confusion|jumping ahead|start from the beginning)\b/i;
const PRAISE = /\b(great|excellent|impressive|awesome|fantastic|love that|nice work|well done)\b/i;

type Row = { c: Case; mode: string; reply: string; next?: string; ok: boolean; exact?: boolean; note: string; seconds: number; ackMs?: number };

async function control(c: Case): Promise<Row> {
  const { settings, topics } = sessionFor(c);
  const dg = new DeepgramInterviewer();
  try {
    await dg.start(settings);
    const reply = await dg.say(c.rec.transcript[c.turn].text);
    const moved = asksPractice(reply, c.question, topics);
    return { c, mode: "control", reply, ok: moved, note: moved ? "moved on by itself" : "kept digging", seconds: dg.seconds() };
  } finally {
    dg.close();
  }
}

/**
 * One directive, three ways: appended with UpdatePrompt (as in v2.4), appended
 * after an older, spent directive (what happens by the second one in an
 * interview), or swapped in with UpdateThink so only the current one is in the
 * prompt, then swapped back out.
 */
async function directive(c: Case, how: "append" | "append-stale" | "replace" = "append"): Promise<Row> {
  const { settings, topics } = sessionFor(c);
  const dg = new DeepgramInterviewer();
  const think = (settings.agent as { think: { prompt: string } }).think;
  try {
    await dg.start(settings);
    const action: Action = { kind: "move_on", to: { kind: "practice", question: c.question }, reason: "" };
    const t0 = Date.now();
    if (how === "replace") {
      await dg.updateThink({ ...think, prompt: `${think.prompt}\n\n${directiveFor(action, 1, topics)}` });
    } else {
      if (how === "append-stale") {
        const other = topics[topics.length - 1];
        await dg.addToPrompt(directiveFor({ kind: "move_on", to: { kind: "topic", id: other.id, title: other.title }, reason: "" }, 1, topics)!);
      }
      await dg.addToPrompt(directiveFor(action, how === "append-stale" ? 2 : 1, topics)!);
    }
    const ackMs = Date.now() - t0;
    const reply = await dg.say(c.rec.transcript[c.turn].text);
    const followed = asksPractice(reply, c.question, topics);
    const left = movedOn(reply, topics);
    // The directive is spent: swap it back out.
    if (how === "replace") await dg.updateThink(think);
    // One more turn: a decent answer to the practice question. The directive should be spent.
    const next = await dg.say(answerFor(reply));
    const stuck = asksPractice(next, c.question, topics) || CONFUSED.test(next);
    const notes = [
      followed ? "asked the practice question" : left ? "moved on, but not to the practice question" : "kept digging",
      questionMarks(reply) > 1 ? `${questionMarks(reply)} questions in one turn` : "",
      PRAISE.test(reply) ? "praised" : "",
      stuck ? "re-asked it next turn" : "back to normal next turn",
    ].filter(Boolean);
    return { c, mode: how, reply, next, ok: left && !stuck, exact: followed, note: notes.join("; "), seconds: dg.seconds(), ackMs };
  } finally {
    dg.close();
  }
}

/** The directive, and if the reply ignored it, the "Actually, let's move on" line right after it. */
async function fallback(c: Case): Promise<Row> {
  const { settings, topics } = sessionFor(c);
  const dg = new DeepgramInterviewer();
  try {
    await dg.start(settings);
    const action: Action = { kind: "move_on", to: { kind: "practice", question: c.question }, reason: "" };
    await dg.addToPrompt(directiveFor(action, 1, topics)!);
    let reply = await dg.say(c.rec.transcript[c.turn].text);
    let forced = false;
    if (!movedOn(reply, topics)) {
      forced = true;
      reply = `${reply} ${await dg.speak(moveOnLine(action, topics)!)}`;
    }
    const next = await dg.say(answerFor(reply));
    const backToNormal = !asksPractice(next, c.question, topics) && !CONFUSED.test(next) && questionMarks(next) <= 1;
    return {
      c,
      mode: "fallback",
      reply,
      next,
      ok: backToNormal,
      note: [forced ? "directive ignored, said the move-on line" : "directive worked", backToNormal ? "normal next turn" : "odd next turn"].join("; "),
      seconds: dg.seconds(),
    };
  } finally {
    dg.close();
  }
}

async function inject(c: Case): Promise<Row> {
  const { settings, topics } = sessionFor(c);
  const dg = new DeepgramInterviewer();
  try {
    await dg.start(settings);
    const line = `Thanks, that's helpful. Let's switch to something else. ${c.question}`;
    const reply = dg.say(c.rec.transcript[c.turn].text);
    // Right away, while the model is thinking.
    await new Promise((r) => setTimeout(r, 300));
    (dg as unknown as { send: (m: unknown) => void }).send({ type: "InjectAgentMessage", message: line });
    const said = await reply;
    await new Promise((r) => setTimeout(r, 6000));
    const refused = dg.events.includes("InjectionRefused");
    const spoken = said.includes("Let's switch to something else");
    // Worked only if the line replaced the model's own reply: nothing after it.
    const after = spoken ? said.slice(said.indexOf(c.question) + c.question.length).trim() : said;
    const replaced = spoken && after.length === 0;
    void topics;
    return {
      c,
      mode: "inject",
      reply: said,
      ok: replaced,
      note: refused ? "InjectionRefused" : replaced ? "spoken instead of the model's reply" : spoken ? "spoken, and the model still added its own question" : "not spoken",
      seconds: dg.seconds(),
    };
  } finally {
    dg.close();
  }
}

async function main() {
  const cases = pickCases();
  console.log(`${cases.length} cases`);
  const jobs: (() => Promise<Row>)[] = [];
  const modes = (arg("modes") ?? "control,append,append-stale,replace").split(",");
  for (const c of cases) {
    if (modes.includes("control")) jobs.push(() => control(c));
    for (const how of ["append", "append-stale", "replace"] as const) if (modes.includes(how)) jobs.push(() => directive(c, how));
    if (modes.includes("fallback")) jobs.push(() => fallback(c));
  }
  if (modes.includes("inject")) for (const c of cases.slice(0, 3)) jobs.push(() => inject(c));
  const rows: Row[] = [];
  // Deepgram gets flaky above 3 sessions at once.
  let next = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        try {
          const row = await job();
          rows.push(row);
          console.log(`${row.mode.padEnd(9)} ${row.c.label}: ${row.note}`);
        } catch (err) {
          console.log(`error: ${(err as Error).message}`);
        }
      }
    }),
  );

  const by = (m: string) => rows.filter((r) => r.mode === m);
  const rate = (m: string) => `${by(m).filter((r) => r.ok).length}/${by(m).length}`;
  const seconds = rows.reduce((n, r) => n + r.seconds, 0);
  const acks = rows.filter((r) => r.ackMs !== undefined).map((r) => r.ackMs!).sort((a, b) => a - b);
  const lines = [
    "# Steering test",
    "",
    "Recorded interviews, resumed in a real Deepgram session at the controller's first step-in (move on to a practice question; the recorded model kept digging).",
    "",
    "| Approach | Worked | What counts as working |",
    "|---|---|---|",
    `| Control (no steering) | ${rate("control")} | moved on to the practice question by itself |`,
    `| UpdatePrompt directive (appended) | ${rate("append")} | left the story (${by("append").filter((r) => r.exact).length} asked the exact question), then normal next turn |`,
    `| UpdatePrompt directive after an older one | ${rate("append-stale")} | same (${by("append-stale").filter((r) => r.exact).length} exact) |`,
    `| UpdateThink: only the current directive, then swapped out | ${rate("replace")} | same (${by("replace").filter((r) => r.exact).length} exact) |`,
    `| Directive, then "Actually, let's move on" if ignored | ${rate("fallback")} | moved on every time by construction; counts the ones where the next turn was normal |`,
    `| InjectAgentMessage while thinking | ${rate("inject")} | the transition line was spoken in place of the model's reply |`,
    "",
    `UpdatePrompt acknowledged in ${acks.length ? `${acks[Math.floor(acks.length / 2)]} ms median (max ${acks.at(-1)} ms)` : "n/a"}. Deepgram time: ${Math.round(seconds)} s (about $${((seconds / 60) * 0.075).toFixed(2)}).`,
    "",
    "## Replies",
    "",
    ...rows.flatMap((r) => [
      `**${r.mode} · ${r.c.label}** (${r.note})`,
      "",
      `> Candidate: ${r.c.rec.transcript[r.c.turn].text.slice(0, 220)}…`,
      ">",
      `> Interviewer: ${r.reply}`,
      ...(r.next ? [">", `> (next turn) Interviewer: ${r.next}`] : []),
      "",
    ]),
  ];
  const path = `evals/results/steer-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-")}.md`;
  // Leave out approaches that weren't run.
  const shown = lines.filter((l) => !l.includes("| 0/0 |"));
  writeFileSync(path, shown.join("\n"));
  console.log(shown.slice(4, 12).join("\n"));
  console.log(`\nFull report: ${path}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
