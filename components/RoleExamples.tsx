"use client";

import { useSyncExternalStore } from "react";

type Example = {
  id: string;
  label: string;
  role: string;
  org: string;
  claim: string;
  other: string;
  question: string;
  before: string;
  after: string;
};

const EXAMPLES: Example[] = [
  {
    id: "engineering",
    label: "Engineering",
    role: "Software Engineering Intern",
    org: "Fintech startup",
    claim: "Cut checkout page load time by 40%",
    other: "Built a payments dashboard in React",
    question: "What was it before, and what did you change first?",
    before: "We worked on making the page faster. There were a lot of things slowing it down, so the team fixed those.",
    after: "It took about three seconds on mobile. I traced it to three payment scripts loading up front, deferred two of them, and got it under two seconds.",
  },
  {
    id: "sales",
    label: "Sales",
    role: "Sales Associate",
    org: "Outdoor gear store",
    claim: "Top seller three months in a row",
    other: "Trained four new hires on the floor",
    question: "What did you do differently from everyone else?",
    before: "I'm just good with people, and I worked really hard.",
    after: "Before showing anything, I asked what trip they were planning. That let me suggest what they would actually need, and my add-on sales were close to double the store average.",
  },
  {
    id: "marketing",
    label: "Marketing",
    role: "Marketing Intern",
    org: "Local coffee chain",
    claim: "Grew Instagram engagement by 40%",
    other: "Planned a store launch event for 200 guests",
    question: "40% compared to what, and what did you actually change?",
    before: "We posted a lot more and engagement went up. The team was really happy with how it turned out.",
    after: "Engagement was about 2% per post. I moved us from product photos to short customer videos, and in three months it reached about 2.8%.",
  },
  {
    id: "teaching",
    label: "Teaching",
    role: "Student Teacher",
    org: "7th grade math",
    claim: "Raised unit test average by 12 points",
    other: "Ran an after-school tutoring group",
    question: "How do you know your change caused that?",
    before: "The kids just understood it better after I changed how I taught.",
    after: "I added a five-minute warm-up on last week's mistakes in one class but not the other. The class with it improved 12 points; the other improved 3.",
  },
];

// The hero and the answers below share one chosen example. It only changes
// when someone picks a role: no auto-rotation, so text never moves under a reader.
let current = 0;
const listeners = new Set<() => void>();
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
function choose(i: number) {
  current = i;
  listeners.forEach((l) => l());
}
function useExample() {
  return useSyncExternalStore(subscribe, () => current, () => 0);
}

const Check = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 12l5 5L20 7" />
  </svg>
);

/** The role picker, placed next to the section heading. */
export function RolePicker() {
  const idx = useExample();
  return (
    <div className="role-tabs" role="group" aria-label="Example role">
      {EXAMPLES.map((e, i) => (
        <button key={e.id} type="button" aria-pressed={i === idx} onClick={() => choose(i)}>
          {e.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The same follow-up answered twice: the resume line on the left, the question
 * it prompts and both answers on the right.
 */
export function AnswerExample() {
  const ex = EXAMPLES[useExample()];
  return (
    <div className="example" aria-live="polite">
      <div className="resume-card">
        <p className="resume-kicker">On the resume</p>
        <p className="resume-role">{ex.role}</p>
        <p className="resume-org">{ex.org}</p>
        <ul>
          <li>
            <span className="mark">{ex.claim}</span>
          </li>
          <li>{ex.other}</li>
        </ul>
        <span className="resume-lines" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </div>

      <div className="example-talk">
        <div className="ask-card">
          <span className="chip-tag tag-ask">Interviewer</span>
          <p>&ldquo;{ex.question}&rdquo;</p>
        </div>
        <div className="answers">
          <div className="answer answer-before">
            <p className="answer-head">Before practice</p>
            <p className="answer-body">&ldquo;{ex.before}&rdquo;</p>
            <p className="answer-foot">
              <span className="chip-tag tag-vague">Vague</span>
            </p>
          </div>
          <div className="answer answer-after">
            <p className="answer-head">After practice</p>
            <p className="answer-body">&ldquo;{ex.after}&rdquo;</p>
            <ul className="answer-foot" aria-label="What this answer has">
              <li><Check /> Starting point</li>
              <li><Check /> What you did</li>
              <li><Check /> Result</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
