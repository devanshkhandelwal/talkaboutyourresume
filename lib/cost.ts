"use client";

import { COST_RATES } from "./config";
import type { ClaudeUsage } from "./types";

// Running cost of one interview, kept in this tab's sessionStorage like the rest of
// the beta data. The resume read is counted toward the first interview after an
// upload; every later interview (retry, practice again) starts from zero.
export type CostLedger = {
  /** Finished Deepgram connection time. A connection still open is added live by the interview page. */
  voiceMs: number;
  claude: { label: "resume" | "feedback"; usage: ClaudeUsage }[];
  /** Set once an interview has started, so the next one with any spend starts a fresh ledger. */
  interviewStarted: boolean;
};

const KEY = "tayr.cost";
const EMPTY: CostLedger = { voiceMs: 0, claude: [], interviewStarted: false };

function read(): CostLedger {
  try {
    const raw = sessionStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as CostLedger) : null;
    return v && Array.isArray(v.claude) ? v : EMPTY;
  } catch {
    return EMPTY;
  }
}

function write(l: CostLedger) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    // Storage can be unavailable in private mode; the cost display is a bonus.
  }
}

export const costLedger = {
  get: read,
  /** A new resume was read: start over with just its cost. */
  resetForResume(usage: ClaudeUsage | undefined) {
    write({ ...EMPTY, claude: usage ? [{ label: "resume", usage }] : [] });
  },
  /**
   * An interview is starting. Keeps the resume cost only for the first interview
   * since the upload. A previous attempt that never connected doesn't count.
   */
  startInterview() {
    const l = read();
    const spent = l.voiceMs > 0 || l.claude.some((c) => c.label === "feedback");
    write(l.interviewStarted && spent ? { ...EMPTY, interviewStarted: true } : { ...l, interviewStarted: true });
  },
  addVoiceMs(ms: number) {
    const l = read();
    write({ ...l, voiceMs: l.voiceMs + Math.max(0, ms) });
  },
  addClaude(label: "resume" | "feedback", usage: ClaudeUsage | undefined) {
    if (!usage) return;
    const l = read();
    write({ ...l, claude: [...l.claude, { label, usage }] });
  },
};

export function voiceCost(ms: number): number {
  return (ms / 60_000) * COST_RATES.deepgramVoicePerMinute;
}

export function claudeCost(u: ClaudeUsage): number {
  const table = COST_RATES.claudePerMillionTokens;
  const r = table[u.model] ?? table[COST_RATES.claudeFallbackModel];
  return (
    (u.input_tokens * r.input +
      u.output_tokens * r.output +
      (u.cache_creation_input_tokens ?? 0) * r.cacheWrite +
      (u.cache_read_input_tokens ?? 0) * r.cacheRead) /
    1_000_000
  );
}

export function costBreakdown(l: CostLedger, liveVoiceMs = 0) {
  const voiceMs = l.voiceMs + liveVoiceMs;
  const voice = voiceCost(voiceMs);
  const resume = l.claude.filter((c) => c.label === "resume").reduce((s, c) => s + claudeCost(c.usage), 0);
  const feedback = l.claude.filter((c) => c.label === "feedback").reduce((s, c) => s + claudeCost(c.usage), 0);
  const hasResume = l.claude.some((c) => c.label === "resume");
  const hasFeedback = l.claude.some((c) => c.label === "feedback");
  return { voiceMs, voice, resume, feedback, claude: resume + feedback, total: voice + resume + feedback, hasResume, hasFeedback };
}

/** "$0.43"; amounts under a cent show as "<$0.01" so they never read as free. */
export function money(n: number): string {
  if (n > 0 && n < 0.005) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

export function minutesSeconds(ms: number): string {
  const sec = Math.round(ms / 1000);
  return `${Math.floor(sec / 60)} min ${sec % 60} sec`;
}
