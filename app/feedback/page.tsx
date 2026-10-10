"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/Chrome";
import { getInterviewer } from "@/lib/interviewers";
import { store } from "@/lib/store";
import type { FeedbackReport, InterviewSession } from "@/lib/types";

const CHIP = { strong: "chip-strong", needs_detail: "chip-detail", vague: "chip-vague" } as const;
const LABEL = { strong: "Strong", needs_detail: "Needs detail", vague: "Vague" } as const;

function duration(s: InterviewSession) {
  const sec = Math.max(0, Math.round(((s.endedAt ?? Date.now()) - s.startedAt) / 1000));
  return `${Math.floor(sec / 60)} min ${sec % 60} sec`;
}

export default function FeedbackPage() {
  const router = useRouter();
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [report, setReport] = useState<FeedbackReport | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saving" | "done">("idle");

  useEffect(() => {
    const s = store.getSession();
    setSession(s);
    const r = store.getReport();
    setLoaded(true);
    if (r) {
      setReport(r);
      return;
    }
    const userTurns = s?.transcript.filter((l) => l.role === "user").length ?? 0;
    if (!s || userTurns < 2) return;
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: s.transcript, profile: store.getProfile() }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't generate feedback.");
        store.setReport(data);
        setReport(data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't generate feedback."));
  }, []);

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    setSaved("saving");
    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source: "feedback", verifiedProfile: optIn }),
    });
    if (res.ok) setSaved("done");
    else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't save that.");
      setSaved("idle");
    }
  }

  function downloadTranscript() {
    if (!session) return;
    const text = session.transcript.map((l) => `${l.role === "user" ? "You" : "Interviewer"}: ${l.content}`).join("\n\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "interview-transcript.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  function retry(title: string, tip: string) {
    router.push(`/interview?retry=${encodeURIComponent(`${title}. Coaching note: ${tip}`)}`);
  }

  if (!loaded) return null;

  if (!session) {
    return (
      <>
        <SiteHeader />
        <main className="narrow" style={{ paddingTop: 64, paddingBottom: 64 }}>
          <h1 className="display h2">No interview yet</h1>
          <Link href="/" className="btn btn-dark" style={{ marginTop: 16 }}>
            Start practicing
          </Link>
        </main>
      </>
    );
  }

  const interviewer = getInterviewer(session.interviewerId);
  const tooShort = session.transcript.filter((l) => l.role === "user").length < 2;
  const total = report?.answers.length ?? 0;
  const strong = report?.answers.filter((a) => a.verdict === "strong").length ?? 0;

  return (
    <>
      <SiteHeader />
      <main className="narrow" style={{ paddingTop: 24, paddingBottom: 96 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ flex: "0 0 auto", width: 52, height: 52, borderRadius: "50%", background: "var(--good)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 8px var(--good-soft)" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12l5 5L20 7" />
            </svg>
          </span>
          <p className="muted" style={{ margin: 0 }}>
            <strong style={{ color: "var(--ink)" }}>Interview complete.</strong> {duration(session)} with {interviewer.name}.
          </p>
        </div>

        <h1 className="display" style={{ marginTop: 28, fontSize: "clamp(2rem, 5vw, 2.75rem)" }}>
          {tooShort ? "That was a short one." : "Nice work. Here's how it went."}
        </h1>

        {tooShort && (
          <p className="muted" style={{ fontSize: "1.125rem" }}>
            We need a few answers to give you useful feedback. Try a full interview when you have 10 to 15 minutes.
          </p>
        )}

        {!tooShort && !report && !error && (
          <p className="muted" style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 24 }}>
            <span className="spinner spinner-dark" aria-hidden /> Reviewing your answers...
          </p>
        )}

        {error && (
          <p className="error" role="alert" style={{ marginTop: 24 }}>
            {error}
          </p>
        )}

        {report && (
          <>
            <p style={{ margin: "16px 0 0", fontSize: "1.1875rem", color: "var(--ink-2)" }}>{report.summary}</p>

            {report.bestMoment && (
              <section aria-labelledby="best" style={{ marginTop: 28, padding: 24, borderRadius: 20, background: "var(--accent-soft)" }}>
                <h2 id="best" style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--accent-ink)" }}>
                  Your best moment
                </h2>
                <p className="display" style={{ fontWeight: 700, fontSize: "1.375rem", lineHeight: 1.35, color: "#1a1f4d", letterSpacing: "-0.01em" }}>
                  &ldquo;{report.bestMoment.quote}&rdquo;
                </p>
                <p style={{ margin: "10px 0 0", color: "#1a1f4d" }}>{report.bestMoment.why}</p>
              </section>
            )}

            {total > 0 && (
              <section className="card" style={{ marginTop: 16, padding: 24 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: "1.125rem" }}>
                    {strong} of {total} answers were specific
                  </h2>
                  <span className="subtle">Goal: {total} of {total}</span>
                </div>
                <div aria-hidden style={{ marginTop: 14, display: "flex", gap: 6 }}>
                  {report.answers.map((_, i) => (
                    <span key={i} style={{ flex: "1 1 0", height: 10, borderRadius: 999, background: i < strong ? "var(--good)" : "var(--line)" }} />
                  ))}
                </div>
                <p style={{ margin: "12px 0 0", fontWeight: 700 }}>
                  {strong === total ? "Every answer landed. Try a tougher interviewer next." : total - strong === 1 ? "One more and you're interview-ready." : `${total - strong} answers to tighten up.`}
                </p>
              </section>
            )}

            {total > 0 && (
              <>
                <h2 style={{ margin: "40px 0 0", fontSize: "1.25rem" }}>Answer by answer</h2>
                <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", borderTop: "1px solid var(--line)" }}>
                  {report.answers.map((a, i) => (
                    <li key={i} style={{ padding: "20px 0", borderBottom: "1px solid var(--line)" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <span style={{ fontWeight: 700 }}>{a.title}</span>
                        <span className={`chip ${CHIP[a.verdict] ?? "chip-vague"}`}>{LABEL[a.verdict] ?? a.verdict}</span>
                      </div>
                      <p className="muted" style={{ margin: "6px 0 0" }}>{a.tip}</p>
                      {i === report.weakestIndex && (
                        <button className="btn btn-dark btn-sm" style={{ marginTop: 12 }} onClick={() => retry(a.title, a.tip)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M21 12a9 9 0 1 1-3-6.7" />
                            <path d="M21 4v5h-5" />
                          </svg>
                          Retry this answer · 2 min
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        <details style={{ marginTop: 20 }}>
          <summary style={{ cursor: "pointer", color: "var(--accent)", fontWeight: 500 }}>Read the full transcript</summary>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {session.transcript.map((l, i) => (
              <p key={i} style={{ margin: 0 }}>
                <strong>{l.role === "user" ? "You" : "Interviewer"}:</strong> <span className="muted">{l.content}</span>
              </p>
            ))}
            <button className="btn btn-light btn-sm" style={{ alignSelf: "flex-start" }} onClick={downloadTranscript}>
              Download transcript
            </button>
          </div>
        </details>

        <section aria-labelledby="save-title" style={{ marginTop: 40, padding: 28, borderRadius: 24, background: "var(--ink)", color: "#fff" }}>
          {saved === "done" ? (
            <p className="display" style={{ fontSize: "1.5rem" }}>You&apos;re on the list. Thanks for trying it!</p>
          ) : (
            <form onSubmit={saveEmail}>
              <h2 id="save-title" className="display" style={{ fontSize: "1.75rem", letterSpacing: "-0.02em" }}>
                Want more practice?
              </h2>
              <p style={{ margin: "8px 0 16px", color: "#c4c4cc" }}>
                We&apos;re in beta. Leave your email and we&apos;ll tell you when Pro, scheduled interviews and new interviewers go live.
              </p>
              <label htmlFor="email" className="visually-hidden">Email</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@school.edu"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ flex: "1 1 220px", color: "var(--ink)" }}
                />
                <button className="btn" style={{ background: "#fff", color: "var(--ink)", minHeight: 48 }} disabled={saved === "saving"}>
                  {saved === "saving" ? "Saving..." : "Keep me posted"}
                </button>
              </div>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14, fontSize: 14, color: "#e6e6ea", cursor: "pointer" }}>
                <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} style={{ marginTop: 4 }} />
                I&apos;d like to share a verified version of my interview with employers when that&apos;s ready.
              </label>
            </form>
          )}
        </section>

        <p style={{ marginTop: 24, textAlign: "center" }}>
          <Link href="/setup">Practice again</Link>
        </p>
      </main>
    </>
  );
}
