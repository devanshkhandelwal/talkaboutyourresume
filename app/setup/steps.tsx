"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { INTERVIEWERS, getInterviewer } from "@/lib/interviewers";
import { INTERVIEW_MODES, type InterviewMode } from "@/lib/prompts";
import { BETA, FREE_MINUTES } from "@/lib/config";

export const MAX_QUESTIONS = 5;

// Common questions people want to rehearse; one tap adds them to the list.
const SUGGESTED_QUESTIONS = [
  "Tell me about yourself.",
  "Why do you want to work here?",
  "Tell me about a time you failed.",
  "What's your biggest weakness?",
  "Tell me about a disagreement with a teammate.",
];

export const ArrowIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12h14" />
    <path d="M13 6l6 6-6 6" />
  </svg>
);

/** The heading of a step. Focus moves here when the step changes, so screen readers announce it. */
export function StepHeading({ children, lede }: { children: React.ReactNode; lede: React.ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    ref.current?.focus();
  }, []);
  return (
    <>
      <h1 ref={ref} className="display" tabIndex={-1} id="step-title">
        {children}
      </h1>
      <p className="su-lede muted">{lede}</p>
    </>
  );
}

/** Back and Continue. Pinned to the bottom of the screen on phones. */
export function StepNav({ onBack, onNext, label }: { onBack?: () => void; onNext: () => void; label: string }) {
  return (
    <div className="su-nav">
      {onBack && (
        <button type="button" className="btn-link" onClick={onBack}>
          Back
        </button>
      )}
      <span className="su-nav-gap" />
      <button type="button" className="btn btn-dark" onClick={onNext}>
        {label}
        <ArrowIcon />
      </button>
    </div>
  );
}

/** Radio-style cards. Arrow keys move the choice, as in any radio group. */
function Cards<T extends string>({ value, ids, onChange, children }: { value: T; ids: T[]; onChange: (id: T) => void; children: (id: T, on: boolean) => React.ReactNode }) {
  const group = useRef<HTMLDivElement>(null);
  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (ids.indexOf(value) + step + ids.length) % ids.length;
    onChange(ids[next]);
    group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  }
  return (
    <div ref={group} className="su-options" role="radiogroup" aria-labelledby="step-title" onKeyDown={onKeyDown}>
      {ids.map((id) => (
        <button key={id} type="button" role="radio" className="pick" aria-checked={id === value} tabIndex={id === value ? 0 : -1} onClick={() => onChange(id)}>
          {children(id, id === value)}
        </button>
      ))}
    </div>
  );
}

export function ModeStep({ mode, onMode }: { mode: InterviewMode; onMode: (m: InterviewMode) => void }) {
  return (
    <>
      <StepHeading lede="Pick one. You can change it before you start.">What do you want to practice?</StepHeading>
      <Cards value={mode} ids={INTERVIEW_MODES.map((m) => m.id)} onChange={onMode}>
        {(id) => {
          const m = INTERVIEW_MODES.find((x) => x.id === id)!;
          return (
            <>
              <span style={{ fontWeight: 600, fontSize: "1.0625rem" }}>{m.label}</span>
              <span className="pick-sub" style={{ marginTop: 4, fontSize: 14, lineHeight: 1.4 }}>
                {m.blurb}
              </span>
            </>
          );
        }}
      </Cards>
    </>
  );
}

export function InterviewerStep({ who, onWho }: { who: string; onWho: (id: string) => void }) {
  const chosen = getInterviewer(who);
  return (
    <>
      <StepHeading lede="Real interviewers come in every style. Practice against the one that scares you most.">Pick your interviewer</StepHeading>
      <Cards value={who} ids={INTERVIEWERS.map((i) => i.id)} onChange={onWho}>
        {(id) => {
          const i = getInterviewer(id);
          return (
            <>
              <span className="su-pick-top">
                <Avatar character={i.id} size={64} decorative />
                {i.pro && <span className="su-pro">{BETA ? "Pro, free in beta" : "Pro"}</span>}
              </span>
              <span style={{ marginTop: 14, fontWeight: 600, fontSize: "1.0625rem" }}>{i.name}</span>
              <span className="pick-sub" style={{ marginTop: 4, fontSize: 14, lineHeight: 1.4 }}>{i.blurb}</span>
              <span className="pick-sub" style={{ marginTop: 12, fontSize: 13, fontWeight: 600 }}>{i.level}</span>
            </>
          );
        }}
      </Cards>
      <p key={chosen.id} className="su-bubble" aria-live="polite">
        <b>{chosen.name} might open with</b>
        &ldquo;{chosen.sample}&rdquo;
      </p>
    </>
  );
}

export function QuestionsStep({
  mode,
  questions,
  plans,
  onQuestions,
  onPlans,
}: {
  mode: InterviewMode;
  questions: string[];
  plans: Record<string, string>;
  onQuestions: (q: string[]) => void;
  onPlans: (p: Record<string, string>) => void;
}) {
  const formId = useId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  function add(text: string) {
    const q = text.replace(/\s+/g, " ").trim().slice(0, 200);
    if (!q) return;
    if (questions.length >= MAX_QUESTIONS) return setError(`You can add up to ${MAX_QUESTIONS} questions. Remove one to add another.`);
    if (questions.some((x) => x.toLowerCase() === q.toLowerCase())) return setError("That question is already on your list.");
    onQuestions([...questions, q]);
    setDraft("");
    setError(null);
  }

  function remove(i: number) {
    const q = questions[i];
    const { [q]: _gone, ...rest } = plans;
    onPlans(rest);
    onQuestions(questions.filter((_, j) => j !== i));
    setError(null);
  }

  const close = (q: string) =>
    setOpen((o) => {
      const n = new Set(o);
      n.delete(q);
      return n;
    });

  return (
    <>
      <StepHeading
        lede={`Your interviewer asks each one in their own words, along with ${mode === "general" ? "a few classic behavioral questions" : "questions about your resume"}. Optional, up to ${MAX_QUESTIONS}.`}
      >
        Any questions you want to practice?
      </StepHeading>
      <form
        className="su-qform"
        onSubmit={(e) => {
          e.preventDefault();
          add(draft);
        }}
      >
        <label htmlFor={`${formId}-q`} className="visually-hidden">
          Question to practice
        </label>
        <input
          id={`${formId}-q`}
          className="input"
          value={draft}
          maxLength={200}
          autoComplete="off"
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          placeholder="Tell me about a time you disagreed with your manager."
        />
        <button type="submit" className="btn btn-dark btn-sm" disabled={!draft.trim()}>
          Add question
        </button>
      </form>
      {error && (
        <p className="error" role="alert" style={{ marginTop: 10, maxWidth: 760 }}>
          {error}
        </p>
      )}
      {questions.length > 0 && (
        <ul className="su-qlist" aria-label="Your questions">
          {questions.map((q, i) => (
            <li key={q} className="card">
              <div className="su-qrow">
                <span>{q}</span>
                {!open.has(q) && (
                  <button type="button" className="chip-btn" onClick={() => setOpen((o) => new Set(o).add(q))} aria-label={`${plans[q] ? "Edit" : "Add"} how you'd answer: ${q}`}>
                    {plans[q] ? "Edit your answer" : "+ How you'd answer"}
                  </button>
                )}
                <button type="button" className="icon-btn" onClick={() => remove(i)} aria-label={`Remove question: ${q}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
              {open.has(q) ? (
                <div style={{ margin: "10px 6px 6px 0" }}>
                  <label htmlFor={`${formId}-plan-${i}`} className="subtle" style={{ display: "block", marginBottom: 6 }}>
                    How you&apos;d answer. Bullet points are fine. The interviewer won&apos;t see this; your results will compare it with what you actually said.
                  </label>
                  <textarea
                    id={`${formId}-plan-${i}`}
                    className="textarea"
                    rows={4}
                    maxLength={1500}
                    value={plans[q] ?? ""}
                    onChange={(e) => onPlans({ ...plans, [q]: e.target.value })}
                    placeholder="e.g. Checkout took 3.1 s on mobile. I profiled it, deferred two payment scripts, lazy-loaded the card form. Down to 1.8 s."
                  />
                  <button type="button" className="chip-btn" style={{ marginTop: 8 }} onClick={() => close(q)}>
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
      <p className="subtle" aria-live="polite" style={{ margin: "12px 0 0" }}>
        {questions.length} of {MAX_QUESTIONS} added
      </p>
      {questions.length < MAX_QUESTIONS && (
        <div className="su-chips">
          <span className="subtle">Suggestions:</span>
          {SUGGESTED_QUESTIONS.filter((sq) => !questions.includes(sq)).map((sq) => (
            <button key={sq} type="button" className="chip-btn" onClick={() => add(sq)}>
              + {sq}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/** The interviewer says hello when shown: a short mouth animation. */
function useGreeting(key: string) {
  const [open, setOpen] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = now - start;
      if (t > 1300) return setOpen(0);
      setOpen(Math.round(Math.abs(Math.sin(t / 95)) * 5) / 5);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key]);
  return open;
}

export function InterviewerPreview({ who }: { who: string }) {
  const i = getInterviewer(who);
  const open = useGreeting(i.id);
  return (
    <aside className="card card-lg su-preview" aria-label="Your interviewer">
      <Avatar character={i.id} size={104} talking={open > 0} open={open} decorative />
      <p className="su-name">{i.name}</p>
      <p className="su-bubble">&ldquo;{i.sample}&rdquo;</p>
    </aside>
  );
}

/** What you picked, with a way back to each answer. */
export function Summary({
  mode,
  who,
  questions,
  plans,
  onGoto,
  resumeFailed,
  onReplace,
}: {
  mode: InterviewMode;
  who: string;
  questions: string[];
  plans: Record<string, string>;
  onGoto: (id: string) => void;
  /** The resume couldn't be read: the interview will be a general one. */
  resumeFailed: boolean;
  onReplace: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const replaceId = useId();
  const i = getInterviewer(who);
  const planned = questions.filter((q) => plans[q]?.trim()).length;
  const qText = mode === "resume" ? "Not in this mode" : questions.length ? `${questions.length} of ${MAX_QUESTIONS}${planned ? `, ${planned} planned` : ""}` : "None";
  return (
    <ul className="su-rows">
      <li>
        <span className="su-k">Practicing</span>
        <span className="su-v">
          {INTERVIEW_MODES.find((m) => m.id === mode)?.label}
          <button type="button" className="su-chg" onClick={() => onGoto("mode")}>
            Change
          </button>
        </span>
      </li>
      <li>
        <span className="su-k">Interviewer</span>
        <span className="su-v">
          {i.name}
          <small>
            {i.level}
            {i.pro && BETA ? ", free in beta" : ""}
          </small>
          <button type="button" className="su-chg" onClick={() => onGoto("who")}>
            Change
          </button>
        </span>
      </li>
      {mode !== "resume" && (
        <li>
          <span className="su-k">Your questions</span>
          <span className="su-v">
            {qText}
            <button type="button" className="su-chg" onClick={() => onGoto("q")}>
              Change
            </button>
          </span>
        </li>
      )}
      {resumeFailed && (
        <li>
          <span className="su-k">Resume</span>
          <span className="su-v">
            Couldn&apos;t read it
            <small>General questions only</small>
            <label htmlFor={replaceId} className="su-chg" style={{ cursor: "pointer" }}>
              Try another file
            </label>
            <input id={replaceId} type="file" accept=".pdf,.docx" className="visually-hidden" onChange={onReplace} />
          </span>
        </li>
      )}
      <li>
        <span className="su-k">Length</span>
        <span className="su-v">Up to {FREE_MINUTES} min</span>
      </li>
    </ul>
  );
}
