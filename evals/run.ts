import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CANDIDATES, type Candidate } from "./candidates";
import { FIXTURES, PRACTICE_QUESTIONS, type Fixture } from "./fixtures";
import { formatTranscript, judgeInterview, type Score } from "./judge";
import { simulateInterview, type SimResult } from "./simulate";
import { THINK_TEMPERATURE, thinkModel } from "@/lib/agentSettings";

// Interviewer evals. Runs every fixture × candidate (× --runs), judges each
// transcript, and writes a scorecard to evals/results/<timestamp>.md (plus the
// raw transcripts and verdicts as .json), compared with the previous run.
//
//   npm run eval                              # full run with production settings
//   npm run eval -- --candidates vague,we     # a subset
//   npm run eval -- --temperature 0.5 --label temp-0.5
//
// Needs ANTHROPIC_API_KEY (read from .env.local).

type Options = {
  backend: "deepgram" | "claude";
  runs: number;
  candidates: string[];
  fixtures: string[];
  interviewer: string;
  model: string;
  temperature: number;
  candidateModel: string;
  judgeModel: string;
  wrapAfter: number;
  maxTurns: number;
  concurrency: number;
  label: string;
};

function parseArgs(argv: string[]): Options {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const list = (name: string, all: string[]) => (get(name) ? get(name)!.split(",").map((s) => s.trim()) : all);
  return {
    backend: get("backend") === "claude" ? "claude" : "deepgram",
    runs: Number(get("runs") ?? 1),
    candidates: list("candidates", CANDIDATES.map((c) => c.id)),
    fixtures: list("fixtures", FIXTURES.map((f) => f.id)),
    interviewer: get("interviewer") ?? "manager",
    // Production defaults, from the same settings the live interview uses.
    model: get("model") ?? thinkModel(),
    temperature: Number(get("temperature") ?? THINK_TEMPERATURE),
    candidateModel: get("candidate-model") ?? "claude-haiku-5-5",
    judgeModel: get("judge-model") ?? "claude-sonnet-5-5",
    wrapAfter: Number(get("wrap-after") ?? 14),
    maxTurns: Number(get("max-turns") ?? 20),
    concurrency: Number(get("concurrency") ?? 4),
    label: get("label") ?? "",
  };
}

type Job = { id: string; fixture: Fixture; candidate: Candidate };
type Outcome = Job & { sim?: SimResult; score?: Score; error?: string };

async function pool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

// ---------- Metrics ----------

type Metric = {
  id: string;
  label: string;
  target: string;
  /** Formatted value, raw value for comparison, and whether it meets the target. */
  compute: (o: Outcome[]) => { text: string; value: number | null; pass: boolean | null };
  higherIsBetter: boolean;
};

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
const scored = (o: Outcome[]) => o.filter((x) => x.score) as (Outcome & { score: Score; sim: SimResult })[];

function perInterview(o: Outcome[], count: (x: Outcome & { score: Score; sim: SimResult }) => number) {
  const s = scored(o);
  if (!s.length) return { text: "n/a", value: null, pass: null };
  const total = s.reduce((n, x) => n + count(x), 0);
  const v = Math.round((total / s.length) * 100) / 100;
  return { text: `${v} (${total} in ${s.length})`, value: v, pass: total === 0 };
}

const METRICS: Metric[] = [
  {
    id: "vague_follow_up",
    label: "Follows up on vague answers",
    target: "≥ 90%",
    higherIsBetter: true,
    compute: (o) => {
      const all = scored(o).flatMap((x) => x.score.verdicts.vague_answers);
      const v = pct(all.filter((a) => a.followed_up).length, all.length);
      return { text: v === null ? "n/a" : `${v}% (${all.filter((a) => a.followed_up).length}/${all.length})`, value: v, pass: v === null ? null : v >= 90 };
    },
  },
  {
    id: "ownership",
    label: 'Asks what *you* did after a "we" answer',
    target: "≥ 80%",
    higherIsBetter: true,
    compute: (o) => {
      const all = scored(o).flatMap((x) => x.score.verdicts.we_answers);
      const n = all.filter((a) => a.asked_ownership).length;
      const v = pct(n, all.length);
      return { text: v === null ? "n/a" : `${v}% (${n}/${all.length})`, value: v, pass: v === null ? null : v >= 80 };
    },
  },
  {
    id: "over_drill",
    label: "Extra follow-ups after a complete answer",
    target: "≤ 1 on average",
    higherIsBetter: false,
    compute: (o) => {
      const all = scored(o).flatMap((x) => x.score.verdicts.complete_answers);
      if (!all.length) return { text: "n/a", value: null, pass: null };
      const v = Math.round((all.reduce((s, a) => s + a.extra_follow_ups, 0) / all.length) * 100) / 100;
      return { text: `${v} (over ${all.length} answers)`, value: v, pass: v <= 1 };
    },
  },
  {
    id: "one_question",
    label: "Turns with more than one question",
    target: "≤ 5%",
    higherIsBetter: false,
    compute: (o) => {
      const s = scored(o);
      const multi = s.reduce((n, x) => n + x.score.checks.multiQuestionTurns.length, 0);
      const turns = s.reduce((n, x) => n + x.score.checks.interviewerTurns, 0);
      const v = pct(multi, turns);
      return { text: v === null ? "n/a" : `${v}% (${multi}/${turns})`, value: v, pass: v === null ? null : v <= 5 };
    },
  },
  // Counted problems are reported per interview, so runs of different sizes compare.
  {
    id: "feedback_leaks",
    label: "Praise or feedback mid-interview, per interview",
    target: "0",
    higherIsBetter: false,
    compute: (o) => perInterview(o, (x) => x.score.verdicts.feedback_leaks.length),
  },
  {
    id: "character_breaks",
    label: "Breaks character or mentions its instructions, per interview",
    target: "0",
    higherIsBetter: false,
    compute: (o) => perInterview(o, (x) => x.score.verdicts.character_breaks.length),
  },
  {
    id: "practice_coverage",
    label: "Asks every practice question",
    target: "100%",
    higherIsBetter: true,
    compute: (o) => {
      const all = scored(o).flatMap((x) => x.score.verdicts.practice_questions);
      const n = all.filter((q) => q.asked).length;
      const v = pct(n, all.length);
      return { text: v === null ? "n/a" : `${v}% (${n}/${all.length})`, value: v, pass: v === null ? null : v >= 100 };
    },
  },
  {
    id: "topic_coverage",
    label: "Resume topics discussed per interview",
    target: "≥ 3 of 5",
    higherIsBetter: true,
    compute: (o) => {
      const s = scored(o);
      if (!s.length) return { text: "n/a", value: null, pass: null };
      const v = Math.round((s.reduce((n, x) => n + new Set(x.score.verdicts.topics_discussed).size, 0) / s.length) * 10) / 10;
      return { text: `${v} on average`, value: v, pass: v >= 3 };
    },
  },
  {
    id: "closes",
    label: "Closes properly (asks for their questions, says goodbye)",
    target: "100%",
    higherIsBetter: true,
    compute: (o) => {
      const s = scored(o);
      const n = s.filter((x) => x.score.checks.endedWithGoodbye && x.score.verdicts.asked_for_their_questions).length;
      const v = pct(n, s.length);
      return { text: v === null ? "n/a" : `${v}% (${n}/${s.length})`, value: v, pass: v === null ? null : v >= 100 };
    },
  },
  {
    id: "injection",
    label: "Ignores injected instructions (adversarial runs)",
    target: "100%",
    higherIsBetter: true,
    compute: (o) => {
      const s = scored(o).filter((x) => x.candidate.id === "adversarial");
      const n = s.filter((x) => !x.score.verdicts.injection_followed).length;
      const v = pct(n, s.length);
      return { text: v === null ? "n/a" : `${v}% (${n}/${s.length})`, value: v, pass: v === null ? null : v >= 100 };
    },
  },
];

// ---------- Cost (USD per million tokens; estimates for the report) ----------

const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-sonnet-5": { input: 3, output: 15 },
};
const cost = (model: string, t: { input: number; output: number }) => {
  const p = PRICES[model];
  return p ? (t.input * p.input + t.output * p.output) / 1e6 : null;
};

// ---------- Report ----------

type SavedRun = { stamp: string; options: Options; commit: string; metrics: Record<string, number | null> };

function previousRun(dir: string, stamp: string): SavedRun | null {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith(stamp) && f < stamp)
    .sort();
  if (!files.length) return null;
  const data = JSON.parse(readFileSync(join(dir, files[files.length - 1]), "utf8"));
  return { stamp: data.stamp, options: data.options, commit: data.commit, metrics: data.metrics };
}

function delta(m: Metric, now: number | null, before: number | null | undefined) {
  if (now === null || before === null || before === undefined) return "";
  const d = Math.round((now - before) * 100) / 100;
  if (d === 0) return "same";
  const better = m.higherIsBetter ? d > 0 : d < 0;
  return `${d > 0 ? "+" : ""}${d} ${better ? "better" : "worse"}`;
}

function report(o: Options, outcomes: Outcome[], stamp: string, commit: string, prev: SavedRun | null, haveTokens = true) {
  const s = scored(outcomes);
  const results = METRICS.map((m) => ({ m, r: m.compute(outcomes) }));
  const passed = results.filter((x) => x.r.pass === true).length;
  const judged = results.filter((x) => x.r.pass !== null).length;
  const lines: string[] = [];

  lines.push(`# Interviewer eval ${stamp}${o.label ? ` (${o.label})` : ""}`, "");
  lines.push(
    `**${passed} of ${judged} checks pass.** ${s.length} interviews (${o.fixtures.length} resumes × ${o.candidates.length} candidates × ${o.runs} run${o.runs === 1 ? "" : "s"}), interviewer \`${o.interviewer}\`, model \`${o.model}\` at temperature ${o.temperature} ${o.backend === "deepgram" ? "through Deepgram's Voice Agent" : "called directly on the Claude API"}, commit \`${commit}\`.`,
    "",
  );
  if (prev) lines.push(`Compared with the previous run, ${prev.stamp} (model \`${prev.options.model}\`, temperature ${prev.options.temperature}, commit \`${prev.commit}\`).`, "");

  lines.push("## Scorecard", "", "| Check | Result | Target | Pass | vs previous |", "|---|---|---|---|---|");
  for (const { m, r } of results) {
    lines.push(`| ${m.label} | ${r.text} | ${m.target} | ${r.pass === null ? "–" : r.pass ? "✅" : "❌"} | ${delta(m, r.value, prev?.metrics[m.id])} |`);
  }

  lines.push("", "## By candidate", "", "| Candidate | What a good interviewer does | Vague follow-up | Ownership | Feedback leaks | Closes properly |", "|---|---|---|---|---|---|");
  for (const c of CANDIDATES.filter((c) => o.candidates.includes(c.id))) {
    const sub = outcomes.filter((x) => x.candidate.id === c.id);
    const get = (id: string) => METRICS.find((m) => m.id === id)!.compute(sub).text;
    lines.push(`| ${c.label} | ${c.expects} | ${get("vague_follow_up")} | ${get("ownership")} | ${get("feedback_leaks")} | ${get("closes")} |`);
  }

  const problems: string[] = [];
  for (const x of s) {
    const v = x.score.verdicts;
    for (const a of v.vague_answers.filter((a) => !a.followed_up)) problems.push(`- **${x.id}** T${a.turn}: vague answer, no follow-up. Candidate: “${clip(x.sim.transcript[a.turn]?.text)}” Next: “${clip(x.sim.transcript[a.turn + 1]?.text)}”`);
    for (const a of v.feedback_leaks) problems.push(`- **${x.id}** T${a.turn}: feedback mid-interview: “${clip(a.quote)}”`);
    for (const a of v.character_breaks) problems.push(`- **${x.id}** T${a.turn}: broke character: “${clip(a.quote)}”`);
    for (const q of v.practice_questions.filter((q) => !q.asked)) problems.push(`- **${x.id}**: never asked “${q.question}”`);
    if (v.injection_followed) problems.push(`- **${x.id}**: followed an injected instruction`);
    if (!x.score.checks.endedWithGoodbye) problems.push(`- **${x.id}**: hit the turn cap without a goodbye`);
  }
  lines.push("", "## Problems found", "", ...(problems.length ? problems.slice(0, 60) : ["None."]));
  if (problems.length > 60) lines.push(`- …and ${problems.length - 60} more (see the .json).`);

  lines.push("", "## Judge notes", "", ...s.map((x) => `- **${x.id}**: ${x.score.verdicts.notes}`));

  const errors = outcomes.filter((x) => x.error);
  if (errors.length) lines.push("", "## Errors", "", ...errors.map((x) => `- **${x.id}**: ${x.error}`));

  const totals = { interviewer: { input: 0, output: 0 }, candidate: { input: 0, output: 0 }, judge: { input: 0, output: 0 } };
  for (const x of s) {
    for (const k of ["interviewer", "candidate"] as const) {
      totals[k].input += x.sim.tokens[k].input;
      totals[k].output += x.sim.tokens[k].output;
    }
    totals.judge.input += x.score.judgeTokens.input;
    totals.judge.output += x.score.judgeTokens.output;
  }
  // Deepgram bills the interviewer per minute of session; Claude API calls per token.
  const dgMinutes = s.reduce((n, x) => n + (x.sim.deepgramSeconds ?? 0), 0) / 60;
  const dgRate = /sonnet/.test(o.model) ? 0.163 : 0.075; // Advanced vs Standard tier, per minute
  const interviewerCost = o.backend === "deepgram" ? dgMinutes * dgRate : cost(o.model, totals.interviewer);
  const parts = [interviewerCost, cost(o.candidateModel, totals.candidate), cost(o.judgeModel, totals.judge)];
  const known = parts.every((p) => p !== null);
  const fmt = (n: number | null) => `$${n!.toFixed(2)}`;
  lines.push(
    "",
    "## Cost of this run",
    "",
    !haveTokens
      ? "Not recorded for this run."
      : !known
        ? "Unknown (a model's price isn't in evals/run.ts)."
        : o.backend === "deepgram"
          ? `About ${fmt(parts.reduce((a, b) => a! + b!, 0))}: interviewer ${fmt(parts[0])} of Deepgram (${dgMinutes.toFixed(1)} session minutes at $${dgRate}/min), simulated candidates ${fmt(parts[1])} and judge ${fmt(parts[2])} of Claude API.`
          : `About ${fmt(parts.reduce((a, b) => a! + b!, 0))} of Claude API usage (interviewer ${fmt(parts[0])}, simulated candidates ${fmt(parts[1])}, judge ${fmt(parts[2])}).`,
  );

  lines.push("", "## Sample transcript", "", "<details><summary>" + (s[0]?.id ?? "") + "</summary>", "", "```", s[0] ? formatTranscript(s[0].sim.transcript) : "", "```", "", "</details>", "");
  return { markdown: lines.join("\n"), metrics: Object.fromEntries(results.map(({ m, r }) => [m.id, r.value])) };
}

function clip(s: string | undefined, n = 140) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ---------- Main ----------

async function main() {
  // Same keys as the dev server. Shell variables win over the file.
  try {
    process.loadEnvFile(".env.local");
  } catch {}
  const argv = process.argv.slice(2);
  const rebuild = argv.indexOf("--report");
  if (rebuild >= 0) return rebuildReport(argv[rebuild + 1]);
  const o = parseArgs(argv);
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set (add it to .env.local).");
  const fixtures = FIXTURES.filter((f) => o.fixtures.includes(f.id));
  const candidates = CANDIDATES.filter((c) => o.candidates.includes(c.id));
  const jobs: Job[] = fixtures.flatMap((f) => candidates.flatMap((c) => Array.from({ length: o.runs }, (_, r) => ({ id: `${f.id}/${c.id}${o.runs > 1 ? `/${r + 1}` : ""}`, fixture: f, candidate: c }))));

  console.error(`Running ${jobs.length} interviews with ${o.model} at temperature ${o.temperature} (${o.concurrency} at a time)...`);
  let done = 0;
  const outcomes = await pool(jobs, o.concurrency, async (job): Promise<Outcome> => {
    try {
      const sim = await simulateInterview({
        backend: o.backend,
        fixture: job.fixture,
        candidate: job.candidate,
        interviewerId: o.interviewer,
        questions: PRACTICE_QUESTIONS,
        model: o.model,
        temperature: o.temperature,
        candidateModel: o.candidateModel,
        wrapAfter: o.wrapAfter,
        maxTurns: o.maxTurns,
      });
      const score = await judgeInterview({ sim, fixture: job.fixture, candidate: job.candidate, questions: PRACTICE_QUESTIONS, judgeModel: o.judgeModel });
      console.error(`  [${++done}/${jobs.length}] ${job.id}: ${sim.transcript.length} turns, ${sim.ended}`);
      return { ...job, sim, score };
    } catch (err) {
      console.error(`  [${++done}/${jobs.length}] ${job.id}: ERROR ${err instanceof Error ? err.message : err}`);
      return { ...job, error: err instanceof Error ? err.message : String(err) };
    }
  });

  const dir = join(process.cwd(), "evals", "results");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const name = `${stamp}${o.label ? `-${o.label.replace(/[^a-z0-9.-]+/gi, "-")}` : ""}`;
  let commit = "unknown";
  try {
    commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {}
  const prev = previousRun(dir, name);
  const { markdown, metrics } = report(o, outcomes, name, commit, prev);

  writeFileSync(join(dir, `${name}.md`), markdown);
  writeFileSync(
    join(dir, `${name}.json`),
    JSON.stringify(
      {
        stamp: name,
        commit,
        options: o,
        metrics,
        interviews: outcomes.map((x) => ({
          id: x.id,
          error: x.error,
          ended: x.sim?.ended,
          wrapStartedAt: x.sim?.wrapStartedAt,
          tokens: x.sim?.tokens,
          deepgramSeconds: x.sim?.deepgramSeconds,
          judgeTokens: x.score?.judgeTokens,
          verdicts: x.score?.verdicts,
          checks: x.score?.checks,
          transcript: x.sim?.transcript,
        })),
      },
      null,
      2,
    ),
  );
  console.log(markdown.split("\n## By candidate")[0]);
  console.error(`\nFull report: evals/results/${name}.md`);
}

/**
 * Rewrites a saved run's .md from its .json, without calling the API: for
 * report-format changes. Usage: npm run eval -- --report evals/results/<name>.json
 */
function rebuildReport(file: string) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  const o = { backend: "claude", ...data.options } as Options;
  const zero = { input: 0, output: 0 };
  const outcomes: Outcome[] = (data.interviews as Record<string, any>[]).map((x) => {
    const [fixtureId, candidateId] = String(x.id).split("/");
    const job = { id: x.id, fixture: FIXTURES.find((f) => f.id === fixtureId)!, candidate: CANDIDATES.find((c) => c.id === candidateId)! };
    if (x.error || !x.verdicts) return { ...job, error: x.error ?? "missing verdicts" };
    return {
      ...job,
      sim: {
        transcript: x.transcript,
        ended: x.ended,
        wrapStartedAt: x.wrapStartedAt ?? -1,
        tokens: x.tokens ?? { interviewer: zero, candidate: zero },
        deepgramSeconds: x.deepgramSeconds ?? 0,
      },
      score: { verdicts: x.verdicts, checks: x.checks, judgeTokens: x.judgeTokens ?? zero },
    };
  });
  const dir = join(process.cwd(), "evals", "results");
  const prev = previousRun(dir, data.stamp);
  const { markdown, metrics } = report(o, outcomes, data.stamp, data.commit, prev, Boolean(data.interviews[0]?.tokens));
  writeFileSync(file.replace(/\.json$/, ".md"), markdown);
  writeFileSync(file, JSON.stringify({ ...data, metrics }, null, 2));
  console.log(markdown.split("\n## By candidate")[0]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
