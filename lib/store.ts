"use client";

import type { FeedbackReport, InterviewSession, ResumeProfile } from "./types";

// Beta: everything lives in the browser's sessionStorage, so a page refresh
// keeps progress but nothing is stored on a server.
const KEYS = {
  profile: "tayr.profile",
  setup: "tayr.setup",
  session: "tayr.session",
  report: "tayr.report",
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
  getSetup: () => read<{ interviewerId: string; focusNote: string }>(KEYS.setup),
  setSetup: (s: { interviewerId: string; focusNote: string }) => write(KEYS.setup, s),
  getSession: () => read<InterviewSession>(KEYS.session),
  setSession: (s: InterviewSession) => write(KEYS.session, s),
  getReport: () => read<FeedbackReport>(KEYS.report),
  setReport: (r: FeedbackReport | null) => write(KEYS.report, r),
};
