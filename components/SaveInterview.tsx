"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SignInButton, useAuth } from "@clerk/nextjs";
import { authEnabled } from "@/lib/authConfig";
import type { FeedbackReport, InterviewSession } from "@/lib/types";

type State = "idle" | "saving" | "saved" | "error";

/**
 * Results-page card for optional accounts. Signed in: saves this interview's
 * scores and feedback to your profile, once. Signed out: offers Google sign-in,
 * and saves as soon as you come back signed in (the report is still in this tab).
 */
export function SaveInterview(props: { session: InterviewSession; report: FeedbackReport }) {
  return authEnabled ? <ClerkSaveInterview {...props} /> : null;
}

function ClerkSaveInterview({ session, report }: { session: InterviewSession; report: FeedbackReport }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const key = `tayr.saved.${session.startedAt}`;

  useEffect(() => {
    if (!isLoaded || !isSignedIn || state !== "idle") return;
    try {
      if (sessionStorage.getItem(key)) {
        setState("saved");
        return;
      }
    } catch {
      // Storage can be blocked; the server ignores duplicates anyway.
    }
    setState("saving");
    fetch("/api/interviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startedAt: new Date(session.startedAt).toISOString(),
        durationSec: ((session.endedAt ?? Date.now()) - session.startedAt) / 1000,
        interviewerId: session.interviewerId,
        isRetry: Boolean(session.retryTopic),
        summary: report.summary,
        bestMoment: report.bestMoment,
        answers: report.answers.map(({ title, question, verdict, tip }) => ({ title, question, verdict, tip })),
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save this interview.");
        try {
          sessionStorage.setItem(key, "1");
        } catch {}
        setState("saved");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Couldn't save this interview.");
        setState("error");
      });
  }, [isLoaded, isSignedIn, state, key, session, report]);

  if (!isLoaded) return null;

  return (
    <section aria-labelledby="save-profile-title" className="card" style={{ padding: 20 }} aria-live="polite">
      <h2 id="save-profile-title" style={{ margin: "0 0 8px", fontSize: "1.125rem", fontWeight: 600 }}>
        {state === "saved" ? "Saved to your profile" : "Keep this result"}
      </h2>
      {!isSignedIn ? (
        <>
          <p className="muted" style={{ margin: "0 0 14px", fontSize: 15 }}>
            Sign in with Google to save your score and feedback, and see your progress over time. Your transcript and resume aren&apos;t saved.
          </p>
          <SignInButton mode="modal">
            <button type="button" className="btn btn-dark btn-sm" style={{ width: "100%" }}>
              Sign in to save
            </button>
          </SignInButton>
        </>
      ) : state === "saved" ? (
        <p style={{ margin: 0, fontSize: 15 }}>
          <Link href="/profile">See it on your profile</Link>
        </p>
      ) : state === "error" ? (
        <>
          <p className="error" role="alert" style={{ margin: "0 0 12px" }}>
            {error}
          </p>
          <button type="button" className="btn btn-light btn-sm" onClick={() => setState("idle")}>
            Try again
          </button>
        </>
      ) : (
        <p className="subtle" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <span className="spinner" aria-hidden style={{ width: 14, height: 14, borderWidth: 2 }} />
          Saving to your profile...
        </p>
      )}
    </section>
  );
}
