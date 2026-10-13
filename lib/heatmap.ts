import type { AnswerFeedback, ResumeTopic, Verdict } from "./types";

// Places each resume claim on the lines of the resume it came from, then colors
// those lines by how the answers about that claim went.

/** Lowercase, drop leading bullets, collapse whitespace. Applied per line. */
export function normalizeLine(s: string): string {
  return s
    .toLowerCase()
    .replace(/^[\s\u2022\u00b7\u25aa\u25cf\u25e6\u2023\u2219\u2043\u2013\u2014*+>-]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBlock(s: string): string {
  return s.split(/\r?\n/).map(normalizeLine).filter(Boolean).join(" ");
}

function words(s: string): Set<string> {
  return new Set(s.match(/[a-z0-9]+/g) ?? []);
}

/** How many lines a single claim may span. */
const MAX_SPAN = 8;

/**
 * Finds the resume lines a claim's sourceText came from, as [first, last] line
 * indices, or null. Tries an exact match on normalized text first (a claim may
 * start or end mid-line and span lines), then falls back to the line with the
 * highest word overlap, extended to neighbors that clearly belong to it.
 */
export function placeClaim(lines: string[], sourceText: string): [number, number] | null {
  const norm = lines.map(normalizeLine);
  const src = normalizeBlock(sourceText);
  if (!src) return null;

  let best: [number, number] | null = null;
  for (let i = 0; i < norm.length; i++) {
    if (!norm[i]) continue;
    let joined = "";
    for (let j = i; j < norm.length && j - i < MAX_SPAN; j++) {
      if (!norm[j]) continue;
      joined = joined ? `${joined} ${norm[j]}` : norm[j];
      if (joined.includes(src)) {
        if (!best || j - i < best[1] - best[0]) best = [i, j];
        break;
      }
    }
  }
  // The shortest run that contains the claim, so both end lines are part of it.
  if (best) return best;

  // Fallback: highest word overlap.
  const srcWords = words(src);
  if (srcWords.size === 0) return null;
  const shared = norm.map((l) => [...words(l)].filter((w) => srcWords.has(w)));
  let b = -1;
  shared.forEach((s, k) => {
    if (s.length > 0 && (b < 0 || s.length > shared[b].length)) b = k;
  });
  if (b < 0) return null;
  // Neighbors join when a good share of their words are in the claim (a wrapped bullet).
  const belongs = (k: number) => {
    const w = words(norm[k]);
    return w.size > 0 && shared[k].length / w.size >= 0.4;
  };
  let first = b;
  let last = b;
  while (first - 1 >= 0 && b - (first - 1) < MAX_SPAN && belongs(first - 1)) first--;
  while (last + 1 < norm.length && last + 1 - first < MAX_SPAN && belongs(last + 1)) last++;
  const covered = new Set(shared.slice(first, last + 1).flat());
  return covered.size >= 2 && covered.size >= srcWords.size * 0.5 ? [first, last] : null;
}

const RANK: Record<Verdict, number> = { vague: 0, needs_detail: 1, strong: 2 };

/** The weakest verdict, which is what a line shows when several answers touch it. */
export function weakest(verdicts: Verdict[]): Verdict | null {
  return verdicts.reduce<Verdict | null>((w, v) => (w === null || RANK[v] < RANK[w] ? v : w), null);
}

export type HeatBlock = {
  /** Consecutive resume lines, as text. */
  lines: string[];
  /** Claims these lines hold that were discussed; empty for plain text. */
  claimIds: string[];
  verdict: Verdict | null;
  /** Answers about those claims, in the order the report lists them. */
  answers: AnswerFeedback[];
};

export type Heatmap = {
  blocks: HeatBlock[];
  /** Discussed claims that couldn't be found on the resume text. */
  unplaced: { topic: ResumeTopic; verdict: Verdict; answers: AnswerFeedback[] }[];
};

/**
 * Splits the resume into blocks: runs of lines about the same discussed claims
 * (colored by the weakest answer), and plain runs between them. Claims that were
 * picked but never discussed stay plain.
 */
export function buildHeatmap(resumeText: string, topics: ResumeTopic[], answers: AnswerFeedback[]): Heatmap {
  const lines = resumeText.split(/\r?\n/);
  const byClaim = new Map<string, AnswerFeedback[]>();
  for (const a of answers) {
    if (!a.claimId) continue;
    byClaim.set(a.claimId, [...(byClaim.get(a.claimId) ?? []), a]);
  }

  const lineClaims: string[][] = lines.map(() => []);
  const unplaced: Heatmap["unplaced"] = [];
  for (const t of topics) {
    const said = t.id ? byClaim.get(t.id) : undefined;
    if (!t.id || !said?.length) continue;
    const range = placeClaim(lines, t.sourceText || t.claim);
    if (!range) {
      unplaced.push({ topic: t, verdict: weakest(said.map((a) => a.verdict))!, answers: said });
      continue;
    }
    for (let k = range[0]; k <= range[1]; k++) lineClaims[k].push(t.id);
  }

  const blocks: HeatBlock[] = [];
  lines.forEach((line, k) => {
    const ids = lineClaims[k];
    const key = ids.join(",");
    const prev = blocks[blocks.length - 1];
    // Blank lines inside a claim stay with it; elsewhere they separate plain runs.
    if (prev && prev.claimIds.join(",") === key) {
      prev.lines.push(line);
      return;
    }
    const said = ids.flatMap((id) => byClaim.get(id) ?? []);
    blocks.push({ lines: [line], claimIds: ids, verdict: weakest(said.map((a) => a.verdict)), answers: said });
  });
  return { blocks, unplaced };
}
