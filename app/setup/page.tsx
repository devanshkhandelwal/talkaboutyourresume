"use client";

import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/Chrome";
import { AddToCalendar } from "@/components/AddToCalendar";
import { SlotPicker } from "@/components/SlotPicker";
import { uploadResume } from "@/components/UploadButton";
import { IDLE, checkResumeFile, pendingResume } from "@/lib/pendingResume";
import { defaultSlotTime, formatMinute } from "@/lib/calendar";
import type { InterviewMode } from "@/lib/prompts";
import { BETA, FREE_MINUTES } from "@/lib/config";
import { store } from "@/lib/store";
import type { ResumeProfile } from "@/lib/types";
import { Progress, type StepInfo } from "./Progress";
import { ArrowIcon, InterviewerPreview, InterviewerStep, ModeStep, QuestionsStep, StepHeading, StepNav, Summary } from "./steps";
import "./setup.css";

type StepId = "mode" | "who" | "q" | "go";

export default function SetupPage() {
  const router = useRouter();
  const replaceId = useId();
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [who, setWho] = useState("manager");
  const [mode, setMode] = useState<InterviewMode>("mixed");
  const [questions, setQuestions] = useState<string[]>([]);
  // Planned answers, by question.
  const [plans, setPlans] = useState<Record<string, string>>({});
  const [stepId, setStepId] = useState<StepId>("mode");
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState<Date | null>(null);
  const [added, setAdded] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  // Set when Start is clicked while the resume is still being read.
  const [waiting, setWaiting] = useState(false);
  const pending = useSyncExternalStore(pendingResume.subscribe, pendingResume.get, () => IDLE);

  // "Just my resume" has no question list, so it has one screen fewer.
  const steps = useMemo<(StepInfo & { id: StepId })[]>(
    () => [
      { id: "mode", label: "Practice" },
      { id: "who", label: "Interviewer" },
      ...(mode === "resume" ? [] : [{ id: "q" as const, label: "Questions" }]),
      { id: "go", label: "Start" },
    ],
    [mode],
  );
  const index = Math.max(0, steps.findIndex((s) => s.id === stepId));

  useEffect(() => {
    setProfile(store.getProfile());
    const s = store.getSetup();
    if (s) {
      setWho(s.interviewerId);
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

  function goto(id: string) {
    setScheduling(false);
    setStepId(id as StepId);
  }

  function next() {
    setAnswered((a) => new Set(a).add(stepId));
    const to = steps[index + 1];
    if (to) setStepId(to.id);
  }

  function back() {
    const to = steps[index - 1];
    if (to) setStepId(to.id);
  }

  function chooseMode(m: InterviewMode) {
    setMode(m);
    // The Questions screen may not exist in the new mode.
    setAnswered((a) => {
      const n = new Set(a);
      n.delete("q");
      return n;
    });
  }

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

  function onStart() {
    if (pending.status === "reading") setWaiting(true);
    else start();
  }

  function start() {
    // Only planned answers that still have a question and some text.
    const kept = Object.fromEntries(questions.flatMap((q) => (plans[q]?.trim() ? [[q, plans[q].trim()]] : [])));
    store.setSetup({ interviewerId: who, mode, questions: mode === "resume" ? [] : questions, plans: kept });
    store.setReport(null);
    router.push("/interview");
  }

  function openScheduler() {
    setWhen((w) => w ?? defaultSlotTime());
    setAdded(false);
    setScheduling(true);
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

  return (
    <>
      <SiteHeader right={<span className="subtle">Up to {FREE_MINUTES} minutes{BETA ? ", free" : ""}</span>} />
      <main className="wrap setup">
        <Progress steps={steps} index={index} done={answered} onGoto={(i) => goto(steps[i].id)} />

        <section className="su-step" key={stepId}>
          {stepId === "mode" && (
            <>
              <ModeStep mode={mode} onMode={chooseMode} />
              <StepNav onNext={next} label="Continue" />
            </>
          )}
          {stepId === "who" && (
            <>
              <InterviewerStep who={who} onWho={setWho} />
              <StepNav onBack={back} onNext={next} label="Continue" />
            </>
          )}
          {stepId === "q" && (
            <>
              <QuestionsStep mode={mode} questions={questions} plans={plans} onQuestions={setQuestions} onPlans={setPlans} />
              <StepNav onBack={back} onNext={next} label={questions.length ? "Continue" : "Skip, no questions"} />
            </>
          )}
          {stepId === "go" && (
            <>
              <StepHeading lede="Start now, or put it on your calendar for later.">Ready when you are</StepHeading>
              <div className="su-final">
                <div>
                  <Summary mode={mode} who={who} questions={questions} plans={plans} onGoto={goto} />
                  {failed && (
                    <div style={{ marginTop: 20 }}>
                      <p className="error" role="alert">
                        {fileError ?? (pending.status === "error" ? pending.message : "")} Try another file to start.
                      </p>
                      <label htmlFor={replaceId} className="btn btn-dark upload-btn" style={{ marginTop: 12 }}>
                        Try another file
                      </label>
                      <input id={replaceId} type="file" accept=".pdf,.docx" className="visually-hidden" onChange={onReplace} />
                    </div>
                  )}
                  {scheduling ? (
                    <Scheduler
                      when={when}
                      onWhen={(d) => {
                        setWhen(d);
                        setAdded(false);
                      }}
                      added={added}
                      onAdded={() => setAdded(true)}
                      onStartNow={() => setScheduling(false)}
                    />
                  ) : (
                    <>
                      <div className="su-actions">
                        <button type="button" className="btn btn-dark" onClick={onStart} disabled={failed || waiting} aria-busy={waiting}>
                          {waiting ? (
                            <>
                              <span className="spinner" aria-hidden />
                              Finishing your resume...
                            </>
                          ) : (
                            <>
                              Start interview
                              <ArrowIcon />
                            </>
                          )}
                        </button>
                        <button type="button" className="btn" onClick={openScheduler}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <rect x="3" y="5" width="18" height="16" rx="2" />
                            <path d="M3 10h18M8 3v4M16 3v4" />
                          </svg>
                          Schedule for later
                        </button>
                      </div>
                      <p className="subtle" style={{ margin: "12px 0 0" }}>Starts right away. Use headphones if you can.</p>
                    </>
                  )}
                </div>
                <InterviewerPreview who={who} />
              </div>
              <div className="su-backrow">
                <button type="button" className="btn-link" onClick={back}>
                  Back
                </button>
              </div>
            </>
          )}
        </section>
      </main>
    </>
  );
}

function Scheduler({ when, onWhen, added, onAdded, onStartNow }: { when: Date | null; onWhen: (d: Date) => void; added: boolean; onAdded: () => void; onStartNow: () => void }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  if (!when) return null;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const minutes = FREE_MINUTES + 5;
  return (
    <div className="su-sched">
      <h2 className="display">Pick a time</h2>
      <SlotPicker value={when} onChange={onWhen} />
      <p className="su-picked">
        {when.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}, {formatMinute(when.getHours() * 60 + when.getMinutes())}
        <small>
          {minutes} minute block ({FREE_MINUTES} plus 5 to settle in) · {tz}
        </small>
      </p>
      <div className="su-actions">
        <AddToCalendar event={{ start: when, minutes, url: `${origin}/` }} onAdded={onAdded} />
        <button type="button" className="btn-link" onClick={onStartNow}>
          Start now instead
        </button>
      </div>
      {added && (
        <p className="subtle" role="status" style={{ margin: "12px 0 0" }}>
          Added. At that time, open the link and upload your resume again, since it isn&apos;t saved.
        </p>
      )}
    </div>
  );
}
