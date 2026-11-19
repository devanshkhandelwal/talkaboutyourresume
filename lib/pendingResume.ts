"use client";

import { costLedger } from "./cost";
import { store } from "./store";
import type { ClaudeUsage, ResumeProfile } from "./types";

// Lets the upload keep running while the person is already on /setup.
// Lives in memory: it survives client-side navigation, not a refresh.
export type PendingState =
  | { status: "idle" }
  | { status: "reading"; fileName: string }
  | { status: "error"; fileName: string; message: string };

export const IDLE: PendingState = { status: "idle" };
let state: PendingState = IDLE;
let generation = 0;
const listeners = new Set<() => void>();

function set(next: PendingState) {
  state = next;
  listeners.forEach((l) => l());
}

export const pendingResume = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  /** Starts reading a resume. A newer upload wins if two overlap. */
  start(file: File, upload: (f: File) => Promise<{ profile: ResumeProfile; usage?: ClaudeUsage; resumeText?: string }>) {
    const mine = ++generation;
    const startedAt = Date.now();
    store.clearProfile();
    store.setReport(null);
    set({ status: "reading", fileName: file.name });
    upload(file).then(
      ({ profile, usage, resumeText }) => {
        if (mine !== generation) return;
        store.setProfile(profile);
        store.setResumeText(resumeText ?? null);
        costLedger.resetForResume(usage, startedAt);
        set(IDLE);
      },
      (err: unknown) => {
        if (mine !== generation) return;
        set({ status: "error", fileName: file.name, message: err instanceof Error ? err.message : "Upload failed. Please try again." });
      },
    );
  },
};

const MAX_BYTES = 5 * 1024 * 1024;

/** Checks we can do before uploading, so obvious problems show up right away. */
export function checkResumeFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".pdf") && !name.endsWith(".docx")) return "Please upload a PDF or DOCX file.";
  if (file.size > MAX_BYTES) return "That file is over 5 MB.";
  return null;
}
