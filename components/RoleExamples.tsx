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

/** The hero's signature element: a resume line under question, marked up like an interviewer would. */
export function ResumeExample() {
  const idx = useExample();
  const ex = EXAMPLES[idx];
  return (
    <div>
      <div className="role-tabs" role="group" aria-label="Example role">
        <span className="role-tabs-label">Example:</span>
        {EXAMPLES.map((e, i) => (
          <button key={e.id} type="button" aria-pressed={i === idx} onClick={() => choose(i)}>
            {e.label}
          </button>
        ))}
      </div>
      {/* Keyed by example so the highlight and note replay when a role is picked. */}
      <figure key={ex.id} className="paper" aria-label={`Example resume for a ${ex.role}, with the interviewer's follow-up question`}>
        <p className="paper-role">{ex.role}</p>
        <p className="paper-org">{ex.org}</p>
        <ul className="paper-list">
          <li>
            <span className="mark">{ex.claim}</span>
            <p className="pen-note">
              <span className="pen-note-who">The interviewer asks</span>
              &ldquo;{ex.question}&rdquo;
            </p>
          </li>
          <li>{ex.other}</li>
        </ul>
      </figure>
    </div>
  );
}

/** The same follow-up answered twice, set as a short transcript. */
export function AnswerExample() {
  const idx = useExample();
  const ex = EXAMPLES[idx];
  return (
    <>
      <p className="home-sub">
        The {ex.label.toLowerCase()} example from above. Both answers describe the same work; the second one gives the starting point, what they did, and the result.
      </p>
      <dl className="transcript">
        <dt>Interviewer</dt>
        <dd>&ldquo;{ex.question}&rdquo;</dd>
        <dt>Before practice</dt>
        <dd className="before">&ldquo;{ex.before}&rdquo;</dd>
        <dt>After practice</dt>
        <dd>&ldquo;{ex.after}&rdquo;</dd>
      </dl>
    </>
  );
}
