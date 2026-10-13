export type ResumeTopic = {
  /** Short label, e.g. "Internship: checkout performance" */
  title: string;
  /** The claim as written on the resume */
  claim: string;
  /** What a sharp interviewer would want to know about it */
  probe: string;
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
};

export type Verdict = "strong" | "needs_detail" | "vague";

export type AnswerFeedback = {
  title: string;
  verdict: Verdict;
  tip: string;
};

export type FeedbackReport = {
  summary: string;
  bestMoment: { quote: string; why: string } | null;
  answers: AnswerFeedback[];
  /** Index into answers of the one to retry, or null */
  weakestIndex: number | null;
};

export type InterviewSession = {
  interviewerId: string;
  focusNote: string;
  /** If set, this session retries a single answer */
  retryTopic?: string;
  startedAt: number;
  endedAt?: number;
  transcript: TranscriptLine[];
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
