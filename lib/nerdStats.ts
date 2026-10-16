import { WORDS_PER_MINUTE, analyzeFillers } from "./fillers";
import type { InterviewSession } from "./types";

// "Stats for nerds" on the results page: numbers about how the conversation went,
// computed in the browser from the transcript and the voice session's measurements.

export type NerdStats = {
  durationSec: number;
  answers: number;
  yourWords: number;
  interviewerWords: number;
  /** Measured from when you started talking to the end of each turn (timed turns only); null on older sessions. */
  yourTalkSec: number | null;
  interviewerTalkSec: number | null;
  /** Your share of the talking, by time when measured, else by words. */
  yourShare: number;
  wordsPerMinute: number;
  /** False when speaking time wasn't recorded and the rate assumes 150 words a minute. */
  wpmMeasured: boolean;
  avgAnswerWords: number;
  avgAnswerSec: number | null;
  longestAnswer: { words: number; sec: number | null; preview: string } | null;
  fillers: number;
  fillersPerMinute: number;
  /** "I" vs "we": who your answers credit. */
  iCount: number;
  weCount: number;
  /** Hedges like "I think", "maybe", "kind of". */
  hedges: number;
  /** Numbers in your answers: a rough signal of specificity. */
  numbers: number;
  questionsAsked: number;
  latency: { turns: number; median: number; p90: number; stt: number | null; llm: number | null; tts: number | null } | null;
};

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}
function mean(xs: (number | undefined)[]) {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export const HEDGES = /\b(i think|i guess|i feel like|maybe|probably|kind of|sort of|i'm not sure|i believe)\b/gi;
export const NUMBERS = /\b\d[\d,.]*%?|\b(one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|hundred|thousand|million|percent|half|double|twice)\b/gi;

export function computeNerdStats(s: InterviewSession): NerdStats {
  const yours = s.transcript.filter((l) => l.role === "user");
  const theirs = s.transcript.filter((l) => l.role === "assistant");
  const yourText = yours.map((l) => l.content).join(" ");
  const yourWords = words(yourText);
  const interviewerWords = words(theirs.map((l) => l.content).join(" "));

  const timed = yours.filter((l) => typeof l.speakMs === "number" && l.speakMs > 0);
  // Only trust measured time if most turns have it.
  const measured = yours.length > 0 && timed.length >= yours.length * 0.6;
  const yourTalkSec = measured ? timed.reduce((n, l) => n + l.speakMs!, 0) / 1000 : null;
  const interviewerTalkSec = s.voice ? s.voice.interviewerAudioMs / 1000 : null;

  // Rate over the turns that were timed: their words over their measured minutes (pauses included).
  const timedWords = timed.reduce((n, l) => n + words(l.content), 0);
  const wordsPerMinute = measured && yourTalkSec ? timedWords / (yourTalkSec / 60) : WORDS_PER_MINUTE;
  const speakingMinutes = measured && yourTalkSec ? yourTalkSec / 60 : yourWords / WORDS_PER_MINUTE;

  const share =
    yourTalkSec !== null && interviewerTalkSec
      ? yourTalkSec / (yourTalkSec + interviewerTalkSec)
      : yourWords / Math.max(1, yourWords + interviewerWords);

  const longest = yours.reduce<(typeof yours)[number] | null>((a, l) => (!a || words(l.content) > words(a.content) ? l : a), null);
  const fillers = analyzeFillers(s.transcript).total;

  const lat = s.voice?.latencies ?? [];
  const totals = lat.map((l) => l.total).sort((a, b) => a - b);

  return {
    durationSec: Math.max(0, Math.round(((s.endedAt ?? Date.now()) - s.startedAt) / 1000)),
    answers: yours.length,
    yourWords,
    interviewerWords,
    yourTalkSec: yourTalkSec === null ? null : round(yourTalkSec, 0),
    interviewerTalkSec: interviewerTalkSec === null ? null : round(interviewerTalkSec, 0),
    yourShare: round(share * 100, 0),
    wordsPerMinute: round(wordsPerMinute, 0),
    wpmMeasured: measured,
    avgAnswerWords: yours.length ? round(yourWords / yours.length, 0) : 0,
    avgAnswerSec: measured ? round(timed.reduce((n, l) => n + l.speakMs!, 0) / 1000 / timed.length, 0) : null,
    longestAnswer: longest
      ? { words: words(longest.content), sec: typeof longest.speakMs === "number" ? round(longest.speakMs / 1000, 0) : null, preview: longest.content.slice(0, 80) }
      : null,
    fillers,
    fillersPerMinute: speakingMinutes > 0 ? round(fillers / speakingMinutes) : 0,
    iCount: count(yourText, /\b(i|i'm|i've|i'd|i'll|me|my)\b/gi),
    weCount: count(yourText, /\b(we|we're|we've|we'd|we'll|us|our)\b/gi),
    hedges: count(yourText, HEDGES),
    numbers: count(yourText, NUMBERS),
    questionsAsked: theirs.filter((l) => l.content.includes("?")).length,
    latency: totals.length
      ? {
          turns: totals.length,
          median: round(quantile(totals, 0.5)),
          p90: round(quantile(totals, 0.9)),
          stt: mean(lat.map((l) => l.stt)) === null ? null : round(mean(lat.map((l) => l.stt))!, 2),
          llm: mean(lat.map((l) => l.llm)) === null ? null : round(mean(lat.map((l) => l.llm))!, 2),
          tts: mean(lat.map((l) => l.tts)) === null ? null : round(mean(lat.map((l) => l.tts))!, 2),
        }
      : null,
  };
}
