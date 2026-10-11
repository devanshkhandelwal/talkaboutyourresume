"use client";

// Beta: the interview audio lives only in this tab's memory (not sessionStorage,
// which can't hold audio). It survives the move from /interview to /feedback and
// is gone on refresh. Nothing is uploaded or stored.
let current: { blob: Blob; ext: string } | null = null;
const listeners = new Set<() => void>();

export const recording = {
  get: () => current,
  set(next: { blob: Blob; ext: string } | null) {
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
