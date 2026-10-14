"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/Chrome";
import { Avatar } from "@/components/Avatar";
import { uploadResume } from "@/components/UploadButton";
import { IDLE, checkResumeFile, pendingResume } from "@/lib/pendingResume";
import { INTERVIEWERS, getInterviewer } from "@/lib/interviewers";
import { INTERVIEW_MODES, type InterviewMode } from "@/lib/prompts";
import { BETA, FREE_MINUTES } from "@/lib/config";
import { store } from "@/lib/store";
import type { ResumeProfile } from "@/lib/types";

const QUICK_ADDS = [
  { label: "+ An answer I ramble on", text: "I tend to ramble when talking about " },
  { label: "+ Company and role", text: "I'm interviewing for a  role at " },
  { label: "+ Paste job description", text: "Job description:\n" },
];

// Common questions people want to rehearse; one tap adds them to the list.
const SUGGESTED_QUESTIONS = [
  "Tell me about yourself.",
  "Why do you want to work here?",
  "Tell me about a time you failed.",
  "What's your biggest weakness?",
  "Tell me about a disagreement with a teammate.",
];
const MAX_QUESTIONS = 5;

export default function SetupPage() {
  const router = useRouter();
  const replaceId = useId();
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [picked, setPicked] = useState("manager");
  const [mode, setMode] = useState<InterviewMode>("mixed");
  const [note, setNote] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  // Planned answers by question, and which questions have their answer box open.
  const [plans, setPlans] = useState<Record<string, string>>({});
  const [openPlans, setOpenPlans] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // Set when Start is clicked while the resume is still being read.
  const [waiting, setWaiting] = useState(false);
  const pending = useSyncExternalStore(pendingResume.subscribe, pendingResume.get, () => IDLE);
  // How open the preview interviewer's mouth is: they say hello when picked.
  const [greeting, setGreeting] = useState(0);

  useEffect(() => {
    if (!loaded || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = now - start;
      if (t > 1300) {
        setGreeting(0);
        return;
      }
      setGreeting(Math.round(Math.abs(Math.sin(t / 95)) * 5) / 5);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [picked, loaded]);

  useEffect(() => {
    setProfile(store.getProfile());
    const s = store.getSetup();
    if (s) {
      setPicked(s.interviewerId);
      setNote(s.focusNote);
      setQuestions(s.questions ?? []);
      setMode(s.mode ?? "mixed");
      setPlans(s.plans ?? {});
    }
    setLoaded(true);
  }, []);

  // Load the interview screen ahead of time, so Start switches instantly.
  useEffect(() => {
    router.prefetch("/interview");
  }, [router]);

  // Pick up the profile once a background read finishes.
  useEffect(() => {
    if (pending.status === "idle") setProfile(store.getProfile());
    if (pending.status === "error") setWaiting(false);
  }, [pending.status]);

  // Start clicked early: go as soon as the resume is ready.
  useEffect(() => {
    if (waiting && pending.status === "idle" && profile) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, pending.status, profile]);

  function onReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const problem = checkResumeFile(file);
    setFileError(problem);
    if (problem) return;
    setProfile(null);
    pendingResume.start(file, uploadResume);
  }

  function addQuestion(text: string) {
    const q = text.replace(/\s+/g, " ").trim().slice(0, 200);
    if (!q) return;
    if (questions.length >= MAX_QUESTIONS) {
      setQuestionError(`You can add up to ${MAX_QUESTIONS} questions. Remove one to add another.`);
      return;
    }
    if (questions.some((x) => x.toLowerCase() === q.toLowerCase())) {
      setQuestionError("That question is already on your list.");
      return;
    }
    setQuestions((qs) => [...qs, q]);
    setDraft("");
    setQuestionError(null);
  }

  function removeQuestion(i: number) {
    const q = questions[i];
    setPlans(({ [q]: _, ...rest }) => rest);
    setQuestions((qs) => qs.filter((_, j) => j !== i));
    setQuestionError(null);
  }

  function onStart() {
    if (pending.status === "reading") setWaiting(true);
    else start();
  }

  function start() {
    // Only planned answers that still have a question and some text.
    const kept = Object.fromEntries(questions.flatMap((q) => (plans[q]?.trim() ? [[q, plans[q].trim()]] : [])));
    store.setSetup({ interviewerId: picked, mode, focusNote: note, questions, plans: kept });
    store.setReport(null);
    router.push("/interview");
  }

  if (!loaded) return null;

  const reading = pending.status === "reading";
  const failed = pending.status === "error";

  if (!profile && !reading && !failed) {
    return (
      <>
        <SiteHeader />
        <main className="narrow" style={{ paddingTop: 64, paddingBottom: 64 }}>
          <h1 className="display h2">Upload your resume first</h1>
          <p className="muted">We need your resume to know what to ask you about.</p>
          <Link href="/" className="btn btn-dark" style={{ marginTop: 16 }}>
            Go to upload
          </Link>
        </main>
      </>
    );
  }

  const chosen = getInterviewer(picked);

  return (
    <>
      <SiteHeader right={<span className="subtle">Up to {FREE_MINUTES} minutes{BETA ? ", free" : ""}</span>} />
      <main className="wrap with-aside" style={{ maxWidth: "calc(1320px + 2 * var(--gutter))", paddingTop: 24, paddingBottom: 96 }}>
        <div style={{ minWidth: 0 }}>
        <h1 className="display h1" style={{ marginBottom: 24 }}>
          Set up your interview
        </h1>

        <div className="card" style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 16, padding: "12px 12px 12px 12px", maxWidth: "100%" }}>
          <span style={{ width: 44, height: 44, borderRadius: 8, border: "2px solid var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5" />
              <path d="M9 13h6" />
              <path d="M9 17h4" />
            </svg>
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 600, overflowWrap: "anywhere" }}>{pending.status === "idle" ? profile?.fileName : pending.fileName}</span>
            {reading ? (
              <span role="status" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--ink-3)" }}>
                <span className="spinner" aria-hidden style={{ width: 14, height: 14, borderWidth: 2 }} />
                Reading your resume. Pick an interviewer meanwhile.
              </span>
            ) : failed ? (
              <span style={{ display: "block", fontSize: 14, color: "var(--ink-2)" }}>Couldn&apos;t read this one.</span>
            ) : (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--ink-2)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12l5 5L20 7" />
                </svg>
                Read and ready
              </span>
            )}
          </span>
          {!reading && (
            <>
              <label htmlFor={replaceId} className={`btn btn-sm upload-btn ${failed ? "btn-dark" : "btn-light"}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 12a9 9 0 1 1-3-6.7" />
                  <path d="M21 4v5h-5" />
                </svg>
                {failed ? "Try another file" : "Replace"}
              </label>
              <input id={replaceId} type="file" accept=".pdf,.docx" className="visually-hidden" onChange={onReplace} />
            </>
          )}
        </div>
        {(failed || fileError) && (
          <p className="error" role="alert" style={{ marginTop: 12 }}>
            {fileError ?? (pending.status === "error" ? pending.message : "")}
          </p>
        )}

        <section aria-labelledby="mode-title" className="section-rule">
          <h2 id="mode-title" className="display" style={{ fontSize: "2rem" }}>
            What do you want to practice?
          </h2>
          <div role="group" aria-labelledby="mode-title" className="interviewer-grid" style={{ marginTop: 20 }}>
            {INTERVIEW_MODES.map((m) => (
              <button key={m.id} type="button" className="pick" aria-pressed={m.id === mode} onClick={() => setMode(m.id)}>
                <span style={{ fontWeight: 600, fontSize: "1.0625rem" }}>{m.label}</span>
                <span className="pick-sub" style={{ marginTop: 4, fontSize: 14, lineHeight: 1.4 }}>
                  {m.blurb}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section aria-labelledby="pick-title" className="section-rule">
          <h2 id="pick-title" className="display" style={{ fontSize: "2rem" }}>
            Pick your interviewer
          </h2>
          <p className="muted" style={{ margin: "6px 0 24px" }}>
            Real interviewers come in every style. Practice against the one that scares you most.
          </p>
          <div className="interviewer-grid">
            {INTERVIEWERS.map((i) => {
              const on = i.id === picked;
              return (
                <button
                  key={i.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(i.id)}
                  className="pick"
                >
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                    <Avatar character={i.id} size={64} decorative />
                    {i.pro && <span className="chip chip-pro">Pro</span>}
                  </span>
                  <span style={{ marginTop: 14, fontWeight: 600, fontSize: "1.0625rem" }}>{i.name}</span>
                  <span className="pick-sub" style={{ marginTop: 4, fontSize: 14, lineHeight: 1.4 }}>{i.blurb}</span>
                  <span className="pick-sub" style={{ marginTop: 12, fontSize: 13, fontWeight: 600 }}>{i.level}</span>
                </button>
              );
            })}
          </div>
        </section>

        {mode === "resume" ? (
          <section aria-labelledby="questions-title" className="section-rule" style={{ maxWidth: 760 }}>
            <h2 id="questions-title" className="display" style={{ fontSize: "2rem", lineHeight: 1.1 }}>
              Questions you want to practice
            </h2>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              &ldquo;Just my resume&rdquo; sticks to what your resume says. To add your own questions, pick &ldquo;Resume + your questions&rdquo; or &ldquo;General questions&rdquo; above.
            </p>
          </section>
        ) : (
        <section aria-labelledby="questions-title" className="section-rule" style={{ maxWidth: 760 }}>
            <h2 id="questions-title" className="display" style={{ fontSize: "2rem", lineHeight: 1.1 }}>
              Questions you want to practice
            </h2>
            <p className="muted" style={{ margin: "6px 0 20px" }}>
              Your interviewer will ask each one in their own words, along with {mode === "general" ? "a few classic behavioral questions" : "questions about your resume"}. Add how you&apos;d answer any of them, and your results will compare it with what you actually said. Up to {MAX_QUESTIONS}. Optional.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addQuestion(draft);
              }}
              style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
            >
              <label htmlFor="new-question" className="visually-hidden">
                Question to practice
              </label>
              <input
                id="new-question"
                className="input"
                value={draft}
                maxLength={200}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setQuestionError(null);
                }}
                placeholder="Tell me about a time you disagreed with your manager."
                style={{ flex: "1 1 320px" }}
              />
              <button type="submit" className="btn btn-dark btn-sm" disabled={!draft.trim()}>
                Add question
              </button>
            </form>
            {questionError && (
              <p className="error" role="alert" style={{ marginTop: 10 }}>
                {questionError}
              </p>
            )}
            {questions.length > 0 && (
              <ul aria-label="Your questions" style={{ margin: "16px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {questions.map((q, i) => (
                  <li key={q} className="card" style={{ padding: "8px 8px 8px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ flex: "1 1 auto", minWidth: 0, overflowWrap: "anywhere" }}>{q}</span>
                      {!openPlans.has(q) && (
                        <button
                          type="button"
                          className="chip-btn"
                          onClick={() => setOpenPlans((o) => new Set(o).add(q))}
                          aria-label={`${plans[q] ? "Edit" : "Add"} how you'd answer: ${q}`}
                        >
                          {plans[q] ? "Edit your answer" : "+ How you'd answer"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeQuestion(i)}
                        aria-label={`Remove question: ${q}`}
                        className="icon-btn"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </div>
                    {openPlans.has(q) ? (
                      <div style={{ margin: "10px 6px 6px 0" }}>
                        <label htmlFor={`plan-${i}`} className="subtle" style={{ display: "block", marginBottom: 6 }}>
                          How you&apos;d answer. Bullet points are fine. The interviewer won&apos;t see this; your results will compare it with what you actually said.
                        </label>
                        <textarea
                          id={`plan-${i}`}
                          className="textarea"
                          rows={4}
                          maxLength={1500}
                          value={plans[q] ?? ""}
                          onChange={(e) => setPlans((p) => ({ ...p, [q]: e.target.value }))}
                          placeholder="e.g. Checkout took 3.1 s on mobile. I profiled it, deferred two payment scripts, lazy-loaded the card form. Down to 1.8 s."
                        />
                        <button
                          type="button"
                          className="chip-btn"
                          style={{ marginTop: 8 }}
                          onClick={() =>
                            setOpenPlans((o) => {
                              const n = new Set(o);
                              n.delete(q);
                              return n;
                            })
                          }
                        >
                          Done
                        </button>
                      </div>
                    ) : (
                      plans[q]?.trim() && (
                        <p className="subtle" style={{ margin: "6px 6px 2px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          Your answer: {plans[q]}
                        </p>
                      )
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="subtle" aria-live="polite" style={{ margin: "10px 0 0" }}>
              {questions.length} of {MAX_QUESTIONS} added
            </p>
            {questions.length < MAX_QUESTIONS && (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <span className="subtle">Suggestions:</span>
                {SUGGESTED_QUESTIONS.filter((sq) => !questions.includes(sq)).map((sq) => (
                  <button
                    key={sq}
                    type="button"
                    onClick={() => addQuestion(sq)}
                    className="chip-btn"
                  >
                    + {sq}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="section-rule" style={{ maxWidth: 760 }}>
          <label htmlFor="details" className="display" style={{ display: "block", fontSize: "2rem", lineHeight: 1.1 }}>
            Anything you want to tighten up?
          </label>
          <p className="muted" style={{ margin: "6px 0 20px" }}>
            An answer you ramble on, a project that&apos;s hard to explain, or a role you&apos;re preparing for. Optional.
          </p>
          <textarea
            id="details"
            className="textarea"
            rows={4}
            maxLength={1500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. I always ramble about my hackathon project. Backend internship interview on Friday."
          />
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span className="subtle">Quick add:</span>
            {QUICK_ADDS.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => setNote((n) => (n.trim() ? n.trimEnd() + "\n" : "") + q.text)}
                className="chip-btn"
              >
                {q.label}
              </button>
            ))}
          </div>
        </section>

        </div>

        {/* A live preview of the interview you're building, beside the choices on wide screens. */}
        <aside aria-label="Your interview" className="aside-sticky">
          <div className="card card-lg" style={{ padding: 20 }}>
            <div className="call-preview">
              <span className="call-preview-tag" aria-hidden>
                <span className="live-dot" /> Ready
              </span>
              <Avatar character={chosen.id} size={104} talking={greeting > 0} open={greeting} decorative />
              <p style={{ margin: "10px 0 0", fontWeight: 600 }}>{chosen.name}</p>
            </div>
            <p key={chosen.id} className="preview-bubble">&ldquo;{chosen.sample}&rdquo;</p>
            <dl className="preview-list">
              <div>
                <dt>Resume</dt>
                <dd>{reading ? "Reading..." : failed ? "Needs a new file" : "Ready"}</dd>
              </div>
              <div>
                <dt>Practicing</dt>
                <dd>{INTERVIEW_MODES.find((m) => m.id === mode)?.label}</dd>
              </div>
              <div>
                <dt>Level</dt>
                <dd>{chosen.level}{chosen.pro && BETA ? ", free in beta" : ""}</dd>
              </div>
              <div>
                <dt>Your questions</dt>
                <dd>
                  {mode === "resume" ? "Not in this mode" : questions.length ? `${questions.length} of ${MAX_QUESTIONS}` : "None"}
                  {mode !== "resume" && questions.some((q) => plans[q]?.trim()) ? `, ${questions.filter((q) => plans[q]?.trim()).length} planned` : ""}
                </dd>
              </div>
              <div>
                <dt>Note</dt>
                <dd>{note.trim() ? "Added" : "None"}</dd>
              </div>
              <div>
                <dt>Length</dt>
                <dd>Up to {FREE_MINUTES} min</dd>
              </div>
            </dl>
            <button type="button" className="btn btn-dark" style={{ width: "100%", minHeight: 56, fontSize: 18 }} onClick={onStart} disabled={failed || waiting} aria-busy={waiting}>
              {waiting ? (
                <>
                  <span className="spinner" aria-hidden />
                  Finishing your resume...
                </>
              ) : (
                <>
                  Start interview
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12h14" />
                    <path d="M13 6l6 6-6 6" />
                  </svg>
                </>
              )}
            </button>
            <p className="subtle" style={{ margin: "10px 0 0" }}>Starts right away. Use headphones if you can.</p>
          </div>
        </aside>
      </main>
    </>
  );
}
