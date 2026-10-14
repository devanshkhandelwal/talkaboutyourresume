import type { TranscriptLine } from "./types";

/**
 * Filler words to count in the candidate's answers. Tune this list freely: each
 * pattern must capture the filler itself in a named group `f`, which is what gets
 * counted and highlighted. Patterns run on the candidate's turns only, never the
 * interviewer's. Flux transcripts keep "um" and "uh"; the older Nova-3 setup
 * dropped them. Punctuation-based rules depend on Deepgram's punctuation.
 */
export const FILLER_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "um", pattern: /\b(?<f>u+m+)\b/gi },
  // Skips "uh-huh" and "uh-oh".
  { label: "uh", pattern: /(?<![\w-])(?<f>u+h+)(?![\w-])/gi },
  // "You know" as filler, not "you know what I did" or "you know how it works".
  {
    label: "you know",
    pattern:
      /\b(?<f>you know)\b(?!\s+(?:what|how|why|that|when|where|who|which|whether|if|about|the|a|an|this|these|those|it|him|her|them|me|my|your|his|their|our|someone|something|anything|everything|more|much|of|to)\b)/gi,
  },
  { label: "I mean", pattern: /\b(?<f>I mean),/gi },
  { label: "basically", pattern: /\b(?<f>basically)\b/gi },
  { label: "literally", pattern: /\b(?<f>literally)\b/gi },
  // "So," opening the answer or a sentence.
  { label: "so", pattern: /(?:^|[.!?]\s+)(?<f>so),/gi },
  // "Like" only next to a comma (", like" or "like,"), so "I like Python" doesn't count.
  { label: "like", pattern: /,\s*(?<f>like)\b,?|\b(?<f2>like)\s*,/gi },
];

/** Used to estimate speaking time, since the voice agent sends no word timestamps. */
export const WORDS_PER_MINUTE = 150;

export type FillerMatch = { start: number; end: number; label: string };

/** Filler spans in one piece of text, in order, never overlapping. */
export function findFillers(text: string): FillerMatch[] {
  const found: FillerMatch[] = [];
  for (const { label, pattern } of FILLER_PATTERNS) {
    for (const m of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      const f = m.groups?.f ?? m.groups?.f2;
      if (!f || m.index === undefined) continue;
      const start = m.index + m[0].indexOf(f);
      found.push({ start, end: start + f.length, label });
    }
  }
  found.sort((a, b) => a.start - b.start);
  return found.filter((m, i) => i === 0 || m.start >= found[i - 1].end);
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export type FillerAnswer = {
  /** Indices into the transcript of the candidate lines that make up this answer. */
  lines: number[];
  /** The interviewer line just before it, if any. */
  question: string | null;
  count: number;
};

export type FillerReport = {
  total: number;
  /** Fillers per minute of the candidate's speaking time. */
  perMinute: number;
  /** Speaking minutes, estimated from word count at WORDS_PER_MINUTE. */
  minutes: number;
  /** Counts per filler, most frequent first. */
  byWord: { label: string; count: number }[];
  /** The answer with the most fillers, or null when there are none. */
  worst: FillerAnswer | null;
  /** Filler spans per transcript line index (candidate lines only). */
  matches: Record<number, FillerMatch[]>;
};

export function analyzeFillers(transcript: TranscriptLine[]): FillerReport {
  const matches: Record<number, FillerMatch[]> = {};
  const counts = new Map<string, number>();
  const answers: FillerAnswer[] = [];
  let words = 0;
  let lastQuestion: string | null = null;
  let current: FillerAnswer | null = null;

  transcript.forEach((line, i) => {
    if (line.role !== "user") {
      lastQuestion = line.content;
      current = null;
      return;
    }
    const found = findFillers(line.content);
    matches[i] = found;
    words += wordCount(line.content);
    for (const m of found) counts.set(m.label, (counts.get(m.label) ?? 0) + 1);
    // Back-to-back candidate lines are one answer; the voice agent often splits them.
    if (!current) {
      current = { lines: [], question: lastQuestion, count: 0 };
      answers.push(current);
    }
    current.lines.push(i);
    current.count += found.length;
  });

  const total = answers.reduce((s, a) => s + a.count, 0);
  const minutes = words / WORDS_PER_MINUTE;
  const worst = answers.reduce<FillerAnswer | null>((best, a) => (a.count > (best?.count ?? 0) ? a : best), null);
  return {
    total,
    perMinute: minutes > 0 ? total / minutes : 0,
    minutes,
    byWord: [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    worst,
    matches,
  };
}
