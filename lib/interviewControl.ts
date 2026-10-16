import { HEDGES, NUMBERS } from "./nerdStats";

// The interview controller: decisions about the flow that the app makes in code,
// instead of leaving them to the interviewer model. The model kept digging into
// one story (the same question five times, a practice question never asked), the
// same way it ignored "wrap up" until the app took the close over. Here the app
// grades each answer, counts follow-ups on the current story, and decides:
// dig, move on, or note the answer to come back to.
//
// Pure functions, no I/O: the live interview, the evals and the offline replay
// (evals/replay.ts) all run the same code.

export type AnswerGrade = "solid" | "shaky" | "dodged" | "smalltalk" | "repeated";

/** What the controller wants the interviewer to do next. */
export type Action =
  | { kind: "none" } // let the model lead (a solid answer to a new question, small talk)
  | { kind: "dig"; reason: string } // a follow-up on the same story is fine
  | { kind: "move_on"; to: MoveTarget; note?: Note; reason: string };

export type MoveTarget = { kind: "practice"; question: string } | { kind: "topic"; id: string; title: string } | { kind: "revisit"; note: Note } | { kind: "any" };

/** A shaky answer to come back to, and to hand the feedback report. */
export type Note = { story: string; turn: number; missing: string[] };

/** How each interviewer type handles shaky answers (stored on the interviewer). */
export type FollowUpPolicy = {
  /** Follow-ups allowed on one story while the answers stay shaky. */
  maxFollowUps: number;
  /** After that: note it and move on, or note it and come back before the close. */
  afterBudget: "note" | "revisit";
};

export const DEFAULT_POLICY: FollowUpPolicy = { maxFollowUps: 2, afterBudget: "revisit" };

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const I_WORDS = /\b(i|i'm|i've|i'd|i'll|me|my)\b/gi;
const WE_WORDS = /\b(we|we're|we've|we'd|we'll|us|our)\b/gi;
const DODGES = new RegExp(
  [
    "\\b(don'?t|do not|can'?t|cannot) (really )?(remember|recall|say|share|know)\\b",
    "\\bdon'?t have (an? |the )?(exact |specific |real )?(number|count|figure|breakdown|tally)",
    "\\bhard to (say|pin|put (a|an exact|a single) number)",
    "\\b(didn'?t|did not) (keep|track|count|measure)",
    "\\bwasn'?t (tracking|counting|measuring)",
    "\\b(i'?d )?rather not (guess|say)",
    "\\bi'?d have to (check|dig|look)",
    "\\bnot sure\\b|\\bno idea\\b|\\bit'?s complicated\\b",
  ].join("|"),
  "i",
);
/** Filler that stands in for specifics: "a lot faster", "stuff like that", "pretty much". */
const FUZZY = /\b(a lot|lots of|pretty (much|good|well|big)|stuff|things like that|basically|kind of|sort of|various|a bunch|somewhat|really helped|went well|a while|eventually|some (stuff|things|point)|a project|a class|things were)\b/gi;
/** Names and proper nouns mid-sentence ("Campus Eats", "Lighthouse", "React"): concrete detail. */
const NAMES = /(?<=[a-z,;:] )(?!I\b)[A-Z][a-zA-Z]+/g;
const SILENT = /^\s*(\(.*(pause|silence).*\)|\.\.\.|um+\.?|uh+\.?)?\s*$/i;
const ALREADY_ANSWERED =
  /\b(already (answered|covered|gone over|went over|told you|said)|(second|third|fourth) time you'?ve? asked|as i (said|mentioned) (before|earlier)|same answer as before)\b/i;
/** Questions that ask for a quantity: the answer needs a number it hasn't given before. */
const QUANTITY = /\bhow (many|much|long|often|big|fast)\b|\bwhat (percent|percentage|number)|\bbaseline\b|\bfrom what\b|\bball ?park\b|\bestimate\b|\bnumbers?\b/i;

/** The numbers in a piece of text, normalized ("2,400" → "2400", "40 %" → "40"). */
export function numbersIn(text: string): string[] {
  return (text.match(NUMBERS) ?? []).map((n) => n.toLowerCase().replace(/[,%]/g, "").replace(/\.$/, ""));
}
const MOTIVATION = /\bwhy (do|would|are) you\b|\bwhat (draws|attracts|excites)\b|\binterest(ed)? in\b|\byour (goals|strengths|weakness)/i;

/**
 * Grades one candidate answer from the words alone (no model call): numbers,
 * "I" vs "we", hedging, length, and dodging phrases. Story answers need a
 * concrete detail and the candidate's own part; motivation answers don't need
 * numbers.
 */
export function gradeAnswer(
  answer: string,
  question: string,
  opts: { warmup?: boolean; /** Numbers the candidate already gave: repeating them isn't new detail. */ said?: Set<string> } = {},
): { grade: AnswerGrade; missing: string[] } {
  if (opts.warmup) return { grade: "smalltalk", missing: [] };
  if (SILENT.test(answer)) return { grade: "dodged", missing: ["any answer (silence)"] };
  // "I've already answered that": the interviewer is going in circles.
  if (ALREADY_ANSWERED.test(answer)) return { grade: "repeated", missing: [] };
  const n = words(answer).length;
  const numbers = numbersIn(answer).filter((x) => !opts.said?.has(x)).length;
  const mine = count(answer, I_WORDS);
  const ours = count(answer, WE_WORDS);
  const hedges = count(answer, HEDGES);
  const missing: string[] = [];

  if (DODGES.test(answer) && numbers === 0) return { grade: "dodged", missing: ["a direct answer"] };
  if (QUANTITY.test(question) && !MOTIVATION.test(question) && numbers === 0) {
    return { grade: "shaky", missing: ["the number they were asked for"] };
  }
  if (MOTIVATION.test(question)) {
    if (n < 25) missing.push("a reason in their own words");
    return { grade: missing.length ? "shaky" : "solid", missing };
  }
  const fuzzy = count(answer, FUZZY);
  const names = count(answer, NAMES);
  if (numbers + names === 0 || (numbers === 0 && fuzzy >= 2)) missing.push("a concrete detail or result");
  if (ours > 0 && ours >= 2 * mine) missing.push("their own part");
  if (n < 25) missing.push("enough detail");
  if (hedges >= 3 && hedges * 25 > n) missing.push("a confident claim");
  return { grade: missing.length ? "shaky" : "solid", missing };
}

// ---------------------------------------------------------------------------
// What the interviewer just asked: a new topic, a practice question, a follow-up
// on the current story, or a repeat of something already asked.

export type Topic = { id: string; title: string; claim: string };
export type QuestionKind = "warmup" | "practice" | "topic" | "transition" | "followup" | "closing";

const STOP = new Set(
  "the a an and or but to of in on for with at by from about what how why when where who which that this these those you your yours was were is are be been it its did do does have has had can could would should will just like so really any some more most much many tell me us we our they them their there here then than also into over out up down".split(" "),
);
const content = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9%\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
function overlap(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / Math.min(a.size, b.size);
}
const TRANSITIONS = /\b(let'?s (switch|move|shift|turn|talk about|go back|pivot)|switch(ing)? gears|moving on|change of topic|on a different note|different (topic|direction)|i'?d like to (hear|ask) about)\b/i;
const CLOSING = /what questions do you have for me|before we wrap up|that'?s (all|it) (i have|from me)/i;

export function classifyQuestion(text: string, ctx: { practice: string[]; topics: Topic[]; warmup: boolean }): { kind: QuestionKind; match?: string } {
  if (CLOSING.test(text)) return { kind: "closing" };
  if (ctx.warmup) return { kind: "warmup" };
  const said = content(text);
  for (const q of ctx.practice) if (overlap(content(q), said) >= 0.6) return { kind: "practice", match: q };
  for (const t of ctx.topics) {
    const keys = content(t.title);
    if ([...keys].some((k) => said.has(k)) && (TRANSITIONS.test(text) || overlap(content(`${t.title} ${t.claim}`), said) >= 0.34)) {
      return { kind: "topic", match: t.id };
    }
  }
  if (TRANSITIONS.test(text)) return { kind: "transition" };
  return { kind: "followup" };
}

/** True when the interviewer is asking again something it already asked about this story. */
export function isRepeat(text: string, earlier: string[]): boolean {
  const said = content(text);
  return earlier.some((e) => overlap(content(e), said) >= 0.6);
}

// ---------------------------------------------------------------------------
// The controller's state and its decision after each candidate answer.

export type ControlState = {
  story: string; // what the current story is about ("warmup", a topic id, a practice question)
  storyQuestions: string[]; // the interviewer's questions on this story
  followUps: number; // follow-ups asked on this story
  asked: Set<string>; // practice questions and topic ids already covered
  notes: Note[];
  revisited: Set<string>;
};

export function initialState(): ControlState {
  return { story: "warmup", storyQuestions: [], followUps: 0, asked: new Set(), notes: [], revisited: new Set() };
}

/** Updates the state with what the interviewer just asked. */
export function onInterviewerTurn(s: ControlState, text: string, kind: { kind: QuestionKind; match?: string }) {
  // Naming the story already on the table is a follow-up, not a new story.
  if ((kind.kind === "practice" || kind.kind === "topic") && kind.match === s.story) kind = { kind: "followup" };
  // The first question after the warm-up starts a story, even if it builds on their background answer.
  if (kind.kind === "followup" && s.story === "warmup") kind = { kind: "transition" };
  if (kind.kind === "practice" || kind.kind === "topic") {
    s.story = kind.match!;
    s.asked.add(kind.match!);
    s.storyQuestions = [text];
    s.followUps = 0;
  } else if (kind.kind === "transition") {
    s.story = `other:${text.slice(0, 40)}`;
    s.storyQuestions = [text];
    s.followUps = 0;
  } else if (kind.kind === "followup") {
    s.followUps += 1;
    s.storyQuestions.push(text);
  }
}

export type DecideContext = {
  policy: FollowUpPolicy;
  practice: string[];
  topics: Topic[];
  /** Practice questions still unasked past their deadline get priority when moving on. */
  practiceDue: boolean;
  /** Near the end: the time to come back to a noted answer. */
  nearEnd: boolean;
  turn: number;
};

/** After a candidate answer: what should the interviewer do next? */
export function decide(s: ControlState, grade: { grade: AnswerGrade; missing: string[] }, c: DecideContext): Action {
  if (grade.grade === "smalltalk" || s.story === "warmup") return { kind: "none" };
  const target = (): MoveTarget => {
    const practice = c.practice.find((q) => !s.asked.has(q));
    if (practice && c.practiceDue) return { kind: "practice", question: practice };
    const note = c.nearEnd ? s.notes.find((n) => !s.revisited.has(n.story) && n.story !== s.story) : undefined;
    if (note) return { kind: "revisit", note };
    if (practice) return { kind: "practice", question: practice };
    const topic = c.topics.find((t) => !s.asked.has(t.id));
    return topic ? { kind: "topic", id: topic.id, title: topic.title } : { kind: "any" };
  };

  if (grade.grade === "repeated") {
    return { kind: "move_on", to: target(), reason: "candidate says they already answered" };
  }
  if (grade.grade === "solid") {
    // A complete answer gets no more digging, from any interviewer.
    return s.followUps > 0 || c.practiceDue ? { kind: "move_on", to: target(), reason: "complete answer" } : { kind: "none" };
  }
  if (s.followUps < c.policy.maxFollowUps && !c.practiceDue) {
    return { kind: "dig", reason: `${grade.grade}: missing ${grade.missing.join(", ")}` };
  }
  const note: Note = { story: s.story, turn: c.turn, missing: grade.missing };
  if (!s.notes.some((n) => n.story === s.story)) s.notes.push(note);
  return {
    kind: "move_on",
    to: target(),
    note,
    reason: c.practiceDue ? "practice question overdue" : `still ${grade.grade} after ${s.followUps} follow-ups`,
  };
}
