"use client";

import type { FeedbackReport, InterviewSession, ResumeProfile } from "./types";

/** What the person chose on the setup screen. `questions` are ones they want to be asked. */
export type SetupChoice = { interviewerId: string; focusNote: string; questions?: string[] };

// Beta: everything lives in the browser's sessionStorage, so a page refresh
// keeps progress but nothing is stored on a server.
const KEYS = {
  profile: "tayr.profile",
  setup: "tayr.setup",
  session: "tayr.session",
  report: "tayr.report",
  /** Plain text of the resume, kept apart from the profile so it isn't sent with every request. */
  resumeText: "tayr.resumeText",
} as const;

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private mode; the flow still works in memory.
  }
}

export const store = {
  getProfile: () => read<ResumeProfile>(KEYS.profile),
  setProfile: (p: ResumeProfile) => write(KEYS.profile, p),
  clearProfile: () => {
    write(KEYS.profile, null);
    write(KEYS.resumeText, null);
  },
  getResumeText: () => read<string>(KEYS.resumeText),
  setResumeText: (t: string | null) => write(KEYS.resumeText, t),
  getSetup: () => read<SetupChoice>(KEYS.setup),
  setSetup: (s: SetupChoice) => write(KEYS.setup, s),
  getSession: () => read<InterviewSession>(KEYS.session),
  setSession: (s: InterviewSession) => write(KEYS.session, s),
  getReport: () => read<FeedbackReport>(KEYS.report),
  setReport: (r: FeedbackReport | null) => write(KEYS.report, r),
};
