import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { AnswerFeedback, FeedbackReport, Verdict } from "./types";

// Saved interviews for signed-in users, in Neon Postgres (DATABASE_URL comes from
// the Vercel integration). Only scores and feedback are kept: no transcripts,
// resume text or audio.

export const dbEnabled = Boolean(process.env.DATABASE_URL);

let sql: NeonQueryFunction<false, false> | null = null;
let ready: Promise<void> | null = null;

/** The query function, created on first use so builds without DATABASE_URL still work. */
async function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  sql ??= neon(process.env.DATABASE_URL);
  // Create the table the first time each server instance needs it. Cheap after
  // the first run, and it means no separate migration step to forget.
  ready ??= (async () => {
    await sql!`
      CREATE TABLE IF NOT EXISTS interviews (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL,
        started_at timestamptz NOT NULL,
        duration_sec integer NOT NULL,
        interviewer_id text NOT NULL,
        is_retry boolean NOT NULL DEFAULT false,
        strong_count integer NOT NULL,
        answer_count integer NOT NULL,
        summary text NOT NULL,
        best_moment jsonb,
        answers jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, started_at)
      )`;
    await sql!`CREATE INDEX IF NOT EXISTS interviews_user_started ON interviews (user_id, started_at DESC)`;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  await ready;
  return sql;
}

export type SavedAnswer = Pick<AnswerFeedback, "title" | "question" | "verdict" | "tip">;

export type SavedInterview = {
  id: string;
  startedAt: string;
  durationSec: number;
  interviewerId: string;
  isRetry: boolean;
  strongCount: number;
  answerCount: number;
  summary: string;
  bestMoment: FeedbackReport["bestMoment"];
  answers: SavedAnswer[];
};

export type NewInterview = Omit<SavedInterview, "id" | "strongCount" | "answerCount">;

const VERDICTS = new Set<Verdict>(["strong", "needs_detail", "vague"]);
const cap = (v: unknown, n: number) => String(v ?? "").slice(0, n);

/** Trusts nothing from the browser: caps every field and keeps known verdicts only. */
export function cleanInterview(input: unknown): NewInterview | null {
  const x = (input ?? {}) as Record<string, unknown>;
  const started = new Date(String(x.startedAt));
  if (Number.isNaN(started.getTime())) return null;
  const answers = (Array.isArray(x.answers) ? x.answers : []).slice(0, 12).flatMap((a) => {
    const r = (a ?? {}) as Record<string, unknown>;
    if (!VERDICTS.has(r.verdict as Verdict)) return [];
    return [{ title: cap(r.title, 200), question: r.question ? cap(r.question, 300) : undefined, verdict: r.verdict as Verdict, tip: cap(r.tip, 600) }];
  });
  if (answers.length === 0) return null;
  const best = x.bestMoment as { quote?: unknown; why?: unknown } | null | undefined;
  return {
    startedAt: started.toISOString(),
    durationSec: Math.max(0, Math.min(60 * 60, Math.round(Number(x.durationSec) || 0))),
    interviewerId: cap(x.interviewerId, 40),
    isRetry: Boolean(x.isRetry),
    summary: cap(x.summary, 2000),
    bestMoment: best && best.quote ? { quote: cap(best.quote, 600), why: cap(best.why, 600) } : null,
    answers,
  };
}

/** Saves one interview. Saving the same interview twice is a no-op. Returns true if it was new. */
export async function saveInterview(userId: string, i: NewInterview): Promise<boolean> {
  const q = await db();
  const strong = i.answers.filter((a) => a.verdict === "strong").length;
  const rows = await q`
    INSERT INTO interviews (user_id, started_at, duration_sec, interviewer_id, is_retry, strong_count, answer_count, summary, best_moment, answers)
    VALUES (${userId}, ${i.startedAt}, ${i.durationSec}, ${i.interviewerId}, ${i.isRetry}, ${strong}, ${i.answers.length}, ${i.summary},
            ${i.bestMoment ? JSON.stringify(i.bestMoment) : null}, ${JSON.stringify(i.answers)})
    ON CONFLICT (user_id, started_at) DO NOTHING
    RETURNING id`;
  return rows.length > 0;
}

/** A user's interviews, newest first. */
export async function listInterviews(userId: string, limit = 200): Promise<SavedInterview[]> {
  const q = await db();
  const rows = await q`
    SELECT id, started_at, duration_sec, interviewer_id, is_retry, strong_count, answer_count, summary, best_moment, answers
    FROM interviews WHERE user_id = ${userId} ORDER BY started_at DESC LIMIT ${limit}`;
  return rows.map((r) => ({
    id: String(r.id),
    startedAt: new Date(r.started_at as string).toISOString(),
    durationSec: Number(r.duration_sec),
    interviewerId: String(r.interviewer_id),
    isRetry: Boolean(r.is_retry),
    strongCount: Number(r.strong_count),
    answerCount: Number(r.answer_count),
    summary: String(r.summary),
    bestMoment: (r.best_moment as SavedInterview["bestMoment"]) ?? null,
    answers: (r.answers as SavedAnswer[]) ?? [],
  }));
}

/** Deletes everything saved for a user. Returns how many interviews were removed. */
export async function deleteInterviews(userId: string): Promise<number> {
  const q = await db();
  const rows = await q`DELETE FROM interviews WHERE user_id = ${userId} RETURNING id`;
  return rows.length;
}
