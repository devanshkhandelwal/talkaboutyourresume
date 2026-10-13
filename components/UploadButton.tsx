"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { checkResumeFile, pendingResume } from "@/lib/pendingResume";
import type { ClaudeUsage, ResumeProfile } from "@/lib/types";

export type UploadedResume = { profile: ResumeProfile; usage?: ClaudeUsage; resumeText?: string };

export async function uploadResume(file: File): Promise<UploadedResume> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/resume", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Upload failed. Please try again.");
  const { usage, resumeText, ...profile } = data as ResumeProfile & { usage?: ClaudeUsage; resumeText?: string };
  return { profile, usage, resumeText };
}

export function UploadButton({
  label = "Upload your resume",
  variant = "dark",
}: {
  label?: string;
  variant?: "dark" | "light";
}) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load /setup ahead of time, so picking a file switches screens instantly.
  useEffect(() => {
    router.prefetch("/setup");
    return () => {
      if (slowTimer.current) clearTimeout(slowTimer.current);
    };
  }, [router]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const problem = checkResumeFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    // Don't wait for the read: setup is useful right away (pick an interviewer,
    // add a note) while the resume is read in the background.
    setError(null);
    // Only show "Opening..." if the switch is slow (setup wasn't prefetched yet).
    slowTimer.current = setTimeout(() => setBusy(true), 300);
    pendingResume.start(file, uploadResume);
    router.push("/setup");
  }

  return (
    <div>
      <label
        htmlFor={id}
        className={`btn upload-btn ${variant === "dark" ? "btn-dark" : "btn-inverse upload-btn-on-dark"}`}
        style={{ minHeight: 60, fontSize: 18, maxWidth: 360, width: "100%", cursor: busy ? "progress" : "pointer" }}
        aria-busy={busy}
      >
        {busy ? (
          <>
            <span className="spinner" aria-hidden />
            Opening...
          </>
        ) : (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 16V4" />
              <path d="M7 9l5-5 5 5" />
              <path d="M4 20h16" />
            </svg>
            {label}
          </>
        )}
      </label>
      <input id={id} type="file" accept=".pdf,.docx" className="visually-hidden" onChange={onFile} disabled={busy} />
      <p style={{ margin: "10px 0 0", fontSize: 14, color: variant === "dark" ? "var(--upload-hint, var(--ink-3))" : "var(--inv-ink-3)" }}>
        PDF or DOCX, up to 5 MB. No account needed.
      </p>
      {error && (
        <p className="error" role="alert" style={{ marginTop: 12, maxWidth: 480 }}>
          {error}
        </p>
      )}
    </div>
  );
}
