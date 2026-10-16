import {
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
import { FIXTURES, PRACTICE_QUESTIONS } from "./fixtures";

// Replays one recorded eval interview through the interview controller
// (lib/interviewControl.ts), turn by turn. Used by replay.ts (offline report) and
// steer.ts (live steering test).

export type Line = { role: "interviewer" | "candidate"; text: string };
export type Recorded = {
  id: string;
  wrapStartedAt?: number | null;
  transcript: Line[];
  verdicts?: {
    vague_answers?: { turn: number; followed_up: boolean }[];
    complete_answers?: { turn: number; extra_follow_ups: number }[];
    practice_questions?: { question: string; asked: boolean; turn: number | null }[];
  };
};

export const WARMUP_LINES = 4; // greeting, small talk, "walk me through your background", their answer
// Each practice question should be on the table by roughly this transcript line.
export const PRACTICE_DEADLINES = [8, 14];

export type Step = {
  turn: number;
  grade: AnswerGrade;
  missing: string[];
  action: Action;
  actual: QuestionKind | "end";
  repeat: boolean;
  intervene: boolean;
};

export function replay(rec: Recorded, policy: FollowUpPolicy) {
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

