"use client";

// Beta: the interview audio lives only in this tab's memory (not sessionStorage,
// which can't hold audio). It survives the move from /interview to /feedback and
// is gone on refresh. Nothing is uploaded or stored.
// durationMs is measured while recording: browsers often report Infinity as the
// duration of a MediaRecorder webm file, which breaks progress bars.
export type Recording = { blob: Blob; ext: string; durationMs: number };

let current: Recording | null = null;
const listeners = new Set<() => void>();

export const recording = {
  get: () => current,
  set(next: Recording | null) {
    current = next;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
