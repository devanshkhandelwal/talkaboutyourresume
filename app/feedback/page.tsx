"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/Chrome";
import { INTERVIEWERS, getInterviewer } from "@/lib/interviewers";
import { BETA } from "@/lib/config";
import { dayKey, getPracticedDays, recordPractice } from "@/lib/practice";
import { Avatar } from "@/components/Avatar";
import { PixelCalendar } from "@/components/PixelCalendar";
import { store } from "@/lib/store";
import { recording } from "@/lib/voice/recording";
import { AudioPlayer } from "@/components/AudioPlayer";
import { CostRows } from "@/components/LiveCost";
import { FillerSummary, Highlighted } from "@/components/FillerWords";
import { ResumeHeatmap } from "@/components/ResumeHeatmap";
import { ScheduleNext } from "@/components/ScheduleNext";
import { ShareResult } from "@/components/ShareResult";
import { SaveInterview } from "@/components/SaveInterview";
import { PlannedAnswers } from "@/components/PlannedAnswers";
import { analyzeFillers } from "@/lib/fillers";
import { costBreakdown, costLedger, type CostLedger } from "@/lib/cost";
import type { ClaudeUsage, FeedbackReport, InterviewSession, ResumeTopic } from "@/lib/types";

// Verdict chips: green, yellow, red, matching the resume heatmap.
const CHIP = { strong: "chip-good", needs_detail: "chip-detail", vague: "chip-vague" } as const;
const LABEL = { strong: "Strong", needs_detail: "Needs detail", vague: "Vague" } as const;

const STEPS = [
  { at: 0, label: "Reading your transcript" },
  { at: 4000, label: "Judging each answer" },
  { at: 9000, label: "Writing your tips" },
];

/** What the wait is doing, so 10 to 20 seconds doesn't feel like a stall. Steps are paced by time. */
function ReviewSteps() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - start), 500);
    return () => clearInterval(t);
  }, []);
  const current = STEPS.reduce((n, s, i) => (elapsed >= s.at ? i : n), 0);
  return (
    <div role="status" style={{ marginTop: 24 }}>
      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
        {STEPS.map((s, i) => (
          <li key={s.label} style={{ display: "flex", alignItems: "center", gap: 10, color: i <= current ? "var(--ink)" : "var(--ink-3)", fontWeight: i === current ? 600 : 400 }}>
            {i < current ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12l5 5L20 7" />
              </svg>
            ) : i === current ? (
              <span className="spinner" aria-hidden />
            ) : (
              <span aria-hidden style={{ width: 20, height: 20, borderRadius: 4, border: "2px solid var(--ink-3)" }} />
            )}
            {s.label}
          </li>
        ))}
      </ol>
      <p className="subtle" style={{ margin: "12px 0 0" }}>Usually takes about 15 seconds.</p>
    </div>
  );
}

function RetryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v5h-5" />
    </svg>
  );
}

function duration(s: InterviewSession) {
  const sec = Math.max(0, Math.round(((s.endedAt ?? Date.now()) - s.startedAt) / 1000));
  return `${Math.floor(sec / 60)} min ${sec % 60} sec`;
}

export default function FeedbackPage() {
  const router = useRouter();
  const audio = useSyncExternalStore(recording.subscribe, recording.get, () => null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!audio) {
      setAudioUrl(null);
      return;
    }
    const url = URL.createObjectURL(audio.blob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [audio]);
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [report, setReport] = useState<FeedbackReport | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState<"idle" | "saving" | "done">("idle");
  const [practiced, setPracticed] = useState<string[]>([]);
  const [cost, setCost] = useState<CostLedger | null>(null);
  const [resume, setResume] = useState<{ text: string; topics: ResumeTopic[] } | null>(null);

  useEffect(() => {
    const s = store.getSession();
    setSession(s);
    // Cross today off the calendar once there's a real interview to count.
    const answered = s?.transcript.filter((l) => l.role === "user").length ?? 0;
    setPracticed(s && answered >= 2 ? recordPractice(new Date(s.endedAt ?? Date.now())) : getPracticedDays());
    const r = store.getReport();
    setCost(costLedger.get());
    // The heatmap needs the resume text and claim ids; resumes read before it shipped have neither.
    const text = store.getResumeText();
    const topics = store.getProfile()?.topics ?? [];
    if (text && topics.some((t) => t.id)) setResume({ text, topics });
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
      body: JSON.stringify({
        transcript: s.transcript,
        profile: store.getProfile(),
        // Planned answers from setup, for the planned-vs-said comparison (not for 2-minute retries).
        plans: s.retryTopic ? [] : Object.entries(store.getSetup()?.plans ?? {}).map(([question, plan]) => ({ question, plan })),
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't generate feedback.");
        const { usage, ...report } = data as FeedbackReport & { usage?: ClaudeUsage };
        costLedger.addClaude("feedback", usage);
        setCost(costLedger.get());
        store.setReport(report);
        setReport(report);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't generate feedback."));
  }, []);

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    setSaved("saving");
    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source: "feedback" }),
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

  function downloadAudio() {
    if (!audio || !audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = `interview-audio.${audio.ext}`;
    a.click();
  }

  function practiceWith(id: string) {
    const prev = store.getSetup();
    store.setSetup({ interviewerId: id, focusNote: prev?.focusNote ?? "", questions: prev?.questions ?? [] });
    router.push("/setup");
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
  const fillers = analyzeFillers(session.transcript);
  const total = report?.answers.length ?? 0;
  const strong = report?.answers.filter((a) => a.verdict === "strong").length ?? 0;
  const weakest = report && report.weakestIndex !== null ? report.answers[report.weakestIndex] ?? null : null;
  // Suggest the next interviewer in the list (they get tougher), wrapping around.
  const next = INTERVIEWERS[(INTERVIEWERS.findIndex((i) => i.id === interviewer.id) + 1) % INTERVIEWERS.length];
  const monthName = new Date().toLocaleDateString([], { month: "long" });
  const thisMonth = dayKey(new Date()).slice(0, 7);
  const daysThisMonth = practiced.filter((d) => d.startsWith(thisMonth)).length;

  return (
    <>
      <SiteHeader />
      <main className="wrap with-aside" style={{ maxWidth: "calc(1160px + 2 * var(--gutter))", paddingTop: 24, paddingBottom: 96 }}>
        <div style={{ minWidth: 0, maxWidth: 760 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ flex: "0 0 auto", width: 48, height: 48, borderRadius: 8, background: "var(--good-soft)", border: "2px solid var(--ink)", boxShadow: "3px 3px 0 var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12l5 5L20 7" />
            </svg>
          </span>
          <p className="muted" style={{ margin: 0 }}>
            <strong style={{ color: "var(--ink)" }}>Interview complete.</strong> {duration(session)} with {interviewer.name}.
          </p>
        </div>

        {audioUrl && audio && (
          <section aria-label="Your interview recording" style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 8 }}>
            <AudioPlayer src={audioUrl} durationMs={audio.durationMs} onDownload={downloadAudio} />
            <p className="subtle" style={{ margin: 0 }}>
              Your recording stays in this tab and isn&apos;t saved anywhere. Download it to keep it.
            </p>
          </section>
        )}

        <h1 className="display h2" style={{ marginTop: 32 }}>
          {tooShort ? "That was a short one." : "Nice work. Here's how it went."}
        </h1>

        {tooShort && (
          <p className="muted" style={{ fontSize: "1.125rem" }}>
            We need a few answers to give you useful feedback. Try a full interview when you have 10 to 15 minutes.
          </p>
        )}

        {!tooShort && !report && !error && <ReviewSteps />}

        {error && (
          <p className="error" role="alert" style={{ marginTop: 24 }}>
            {error}
          </p>
        )}

        {report && (
          <>
            <p style={{ margin: "16px 0 0", fontSize: "1.1875rem", color: "var(--ink-2)" }}>{report.summary}</p>

            {report.bestMoment && (
              <section aria-labelledby="best" className="card" style={{ marginTop: 28, padding: 24, background: "var(--hl)", color: "#000" }}>
                <h2 id="best" style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600 }}>
                  Your best moment
                </h2>
                <p className="display" style={{ fontWeight: 500, fontSize: "1.375rem", lineHeight: 1.35, color: "var(--best-ink)", letterSpacing: "-0.01em" }}>
                  &ldquo;{report.bestMoment.quote}&rdquo;
                </p>
                <p style={{ margin: "10px 0 0", color: "var(--best-ink)" }}>{report.bestMoment.why}</p>
              </section>
            )}

            {total > 0 && (
              <section className="card" style={{ marginTop: 20, padding: 24 }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: "1.125rem" }}>
                    {strong} of {total} answers were specific
                  </h2>
                  <span className="subtle">Goal: {total} of {total}</span>
                </div>
                <div aria-hidden style={{ marginTop: 14, display: "flex", gap: 6 }}>
                  {report.answers.map((_, i) => (
                    <span key={i} style={{ flex: "1 1 0", height: 14, borderRadius: 2, border: "2px solid var(--ink)", background: i < strong ? "var(--good-soft)" : "transparent" }} />
                  ))}
                </div>
                <p style={{ margin: "12px 0 0", fontWeight: 600 }}>
                  {strong === total ? "Every answer landed. Try a tougher interviewer next." : total - strong === 1 ? "One more and you're interview-ready." : `${total - strong} answers to tighten up.`}
                </p>
                {weakest && (
                  <button className="btn btn-dark btn-sm" style={{ marginTop: 16 }} onClick={() => retry(weakest.title, weakest.tip)}>
                    <RetryIcon />
                    Retry your weakest answer · 2 min
                  </button>
                )}
              </section>
            )}

            {total > 0 && (
              <div style={{ marginTop: 16 }}>
                <ShareResult
                  verdicts={report.answers.map((a) => a.verdict)}
                  interviewer={interviewer.name}
                  dateMs={session.endedAt ?? session.startedAt}
                  bestQuote={report.bestMoment?.quote ?? null}
                />
              </div>
            )}

            {total > 0 && (
              <>
                <h2 style={{ margin: "40px 0 0", fontSize: "1.25rem", fontWeight: 600 }}>Answer by answer</h2>
                <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none", borderTop: "2px solid var(--line)" }}>
                  {report.answers.map((a, i) => (
                    <li key={i} style={{ padding: "20px 0", borderBottom: "1px solid var(--line)" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <span style={{ fontWeight: 600 }}>{a.title}</span>
                        <span className={`chip ${CHIP[a.verdict] ?? "chip-vague"}`}>{LABEL[a.verdict] ?? a.verdict}</span>
                      </div>
                      <p className="muted" style={{ margin: "6px 0 0" }}>{a.tip}</p>
                      {i === report.weakestIndex && (
                        <button className="btn btn-light btn-sm" style={{ marginTop: 12 }} onClick={() => retry(a.title, a.tip)}>
                          <RetryIcon />
                          Retry this answer · 2 min
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {report.planned && report.planned.length > 0 && <PlannedAnswers items={report.planned} />}

            {resume && total > 0 && <ResumeHeatmap resumeText={resume.text} topics={resume.topics} answers={report.answers} />}
          </>
        )}

        {!tooShort && <FillerSummary report={fillers} transcript={session.transcript} />}

        <details style={{ marginTop: 20 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>Read the full transcript</summary>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {fillers.total > 0 && (
              <p className="subtle" style={{ margin: 0 }}>
                Your filler words are <mark className="filler">highlighted</mark>.
              </p>
            )}
            {session.transcript.map((l, i) => (
              <p key={i} style={{ margin: 0 }}>
                <strong>{l.role === "user" ? "You" : "Interviewer"}:</strong>{" "}
                <span className="muted">{l.role === "user" ? <Highlighted text={l.content} matches={fillers.matches[i]} /> : l.content}</span>
              </p>
            ))}
            <button className="btn btn-light btn-sm" style={{ alignSelf: "flex-start" }} onClick={downloadTranscript}>
              Download transcript
            </button>
          </div>
        </details>

        <p style={{ marginTop: 32 }}>
          <Link href="/setup" className="btn btn-light">
            Practice again
          </Link>
        </p>

        {/* A light card: the email ask shouldn't outweigh practicing again. */}
        <section aria-labelledby="save-title" className="card" style={{ marginTop: 40, padding: 28 }}>
          {saved === "done" ? (
            <p className="display" style={{ fontSize: "1.5rem" }}>You&apos;re on the list. Thanks for trying it!</p>
          ) : (
            <form onSubmit={saveEmail}>
              <h2 id="save-title" className="display" style={{ fontSize: "1.5rem", letterSpacing: "-0.02em" }}>
                Want to hear what&apos;s next?
              </h2>
              <p className="muted" style={{ margin: "8px 0 16px" }}>
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
                  style={{ flex: "1 1 220px" }}
                />
                <button className="btn btn-dark" style={{ minHeight: 48 }} disabled={saved === "saving"}>
                  {saved === "saving" ? "Saving..." : "Keep me posted"}
                </button>
              </div>
            </form>
          )}
        </section>

        </div>

        <aside aria-label="Your practice" className="aside-sticky">
          {report && total > 0 && !tooShort && <SaveInterview session={session} report={report} />}
          {cost && (cost.voiceMs > 0 || cost.claude.length > 0) && (
            <section aria-labelledby="cost-title" className="card" style={{ padding: 20 }}>
              <h2 id="cost-title" style={{ margin: "0 0 10px", fontSize: "1.125rem", fontWeight: 600 }}>
                What this interview cost
              </h2>
              <CostRows b={costBreakdown(cost)} feedback={!tooShort && !report && !error ? "pending" : "none"} />
            </section>
          )}
          <section aria-labelledby="month-title" className="card" style={{ padding: 20 }}>
            <h2 id="month-title" style={{ margin: "0 0 14px", fontSize: "1.125rem", fontWeight: 600 }}>
              {monthName}
            </h2>
            <PixelCalendar practiced={practiced} />
            <p style={{ margin: "14px 0 0", fontWeight: 600 }}>
              {daysThisMonth === 0 ? "Finish an interview to cross off today." : daysThisMonth === 1 ? "1 day practiced this month" : `${daysThisMonth} days practiced this month`}
            </p>
            <p className="subtle" style={{ margin: "4px 0 0" }}>Kept in this browser only.</p>
          </section>

          <ScheduleNext />

          <section aria-labelledby="next-title" className="card" style={{ padding: 20 }}>
            <h2 id="next-title" style={{ margin: "0 0 14px", fontSize: "1.125rem", fontWeight: 600 }}>
              Try someone new
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar character={next.id} size={56} decorative />
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 600 }}>{next.name}</p>
                <p className="subtle" style={{ margin: 0 }}>
                  {next.level}
                  {next.pro && BETA ? ", free in beta" : ""}
                </p>
              </div>
            </div>
            <p className="muted" style={{ margin: "12px 0 16px", fontSize: 15 }}>{next.blurb}</p>
            <button type="button" className="btn btn-light btn-sm" style={{ width: "100%" }} onClick={() => practiceWith(next.id)}>
              Practice with {next.name.replace(/^The /, "the ")}
            </button>
          </section>
        </aside>
      </main>
    </>
  );
}
