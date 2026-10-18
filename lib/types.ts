export type ResumeTopic = {
  /** Stable id ("c1", "c2", ...) that feedback answers point back to. Missing on profiles read before the heatmap shipped. */
  id?: string;
  /** Short label, e.g. "Internship: checkout performance" */
  title: string;
  /** The claim as written on the resume */
  claim: string;
  /** What a sharp interviewer would want to know about it */
  probe: string;
  /** The claim copied verbatim from the resume text, for placing it on the resume heatmap. */
  sourceText?: string;
};

export type ResumeProfile = {
  fileName: string;
  name: string | null;
  /** One line, e.g. "CS student, backend internships" */
  headline: string;
  topics: ResumeTopic[];
  /** Inconsistencies or vague spots worth asking about */
  flags: string[];
};

export type TranscriptLine = {
  role: "user" | "assistant";
  content: string;
  /** Candidate turns: ms from when they started talking to when the turn ended (thinking pauses included). */
  speakMs?: number;
};

/** One interviewer turn's response time from Deepgram's LatencyReport, in seconds. */
export type TurnLatency = { total: number; stt?: number; llm?: number; tts?: number };

/** Measurements from the voice session, for "Stats for nerds". */
export type VoiceStats = {
  latencies: TurnLatency[];
  /** Interviewer audio actually received, in ms. */
  interviewerAudioMs: number;
};

export type Verdict = "strong" | "needs_detail" | "vague";

export type AnswerFeedback = {
  title: string;
  /** The interviewer's question, condensed. */
  question?: string;
  /** Id of the resume claim this answer was about, or null if none. */
  claimId?: string | null;
  verdict: Verdict;
  tip: string;
};

/** A practice question with the answer the candidate planned to give. */
export type PlannedAnswer = { question: string; plan: string };

/** How what they said compares with what they planned, for one practice question. */
export type PlanComparison = {
  question: string;
  /** Whether the interviewer asked it (in any wording). */
  asked: boolean;
  /** Planned points they said. */
  covered: string[];
  /** Planned points they left out. */
  missed: string[];
  /** Good points they said that weren't in the plan. */
  added: string[];
  /** The single most useful change. */
  suggestion: string;
  /** A tighter answer built only from their plan and what they said; [brackets] mark missing facts. */
  improved: string;
};

export type FeedbackReport = {
  summary: string;
  bestMoment: { quote: string; why: string } | null;
  answers: AnswerFeedback[];
  /** Index into answers of the one to retry, or null */
  weakestIndex: number | null;
  /** Planned vs said, one per practice question that had a planned answer. */
  planned?: PlanComparison[];
};

export type InterviewSession = {
  interviewerId: string;
  focusNote: string;
  /** If set, this session retries a single answer */
  retryTopic?: string;
  startedAt: number;
  endedAt?: number;
  transcript: TranscriptLine[];
  /** Missing on sessions recorded before Stats for nerds. */
  voice?: VoiceStats;
  /** Set when the interviewer ended the call itself (end_interview). */
  endedBy?: { by: "interviewer"; reason: "abusive" | "candidate_asked" | "wellbeing" };
};

/** Public response of /api/deepgram-balance. */
export type BalanceResponse = {
  estInterviewsLeft: number;
};

/** Token counts from a Claude response's `usage`, plus the model that produced them. */
export type ClaudeUsage = {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};
