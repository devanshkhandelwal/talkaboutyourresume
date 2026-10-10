"use client";

import { useEffect, useState } from "react";

type Example = {
  id: string;
  label: string;
  title: string;
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
    title: "Software Engineering Intern · Fintech startup",
    claim: "Cut checkout page load time by 40%",
    other: "Built a payments dashboard in React",
    question: "What was it before, and what did you change first?",
    before: "We worked on making the page faster. There were a lot of things slowing it down, so the team fixed those.",
    after: "It took about three seconds on mobile. I traced it to three payment scripts loading up front, deferred two of them, and got it under two seconds.",
  },
  {
    id: "sales",
    label: "Sales",
    title: "Sales Associate · Outdoor gear store",
    claim: "Top seller three months in a row",
    other: "Trained four new hires on the floor",
    question: "What did you do differently from everyone else?",
    before: "I'm just good with people, and I worked really hard.",
    after: "Before showing anything, I asked what trip they were planning. That let me suggest what they would actually need, and my add-on sales were close to double the store average.",
  },
  {
    id: "marketing",
    label: "Marketing",
    title: "Marketing Intern · Local coffee chain",
    claim: "Grew Instagram engagement by 40%",
    other: "Planned a store launch event for 200 guests",
    question: "40% compared to what, and what did you actually change?",
    before: "We posted a lot more and engagement went up. The team was really happy with how it turned out.",
    after: "Engagement was about 2% per post. I moved us from product photos to short customer videos, and in three months it reached about 2.8%.",
  },
  {
    id: "teaching",
    label: "Teaching",
    title: "Student Teacher · 7th grade math",
    claim: "Raised unit test average by 12 points",
    other: "Ran an after-school tutoring group",
    question: "How do you know your change caused that?",
    before: "The kids just understood it better after I changed how I taught.",
    after: "I added a five-minute warm-up on last week's mistakes in one class but not the other. The class with it improved 12 points; the other improved 3.",
  },
];

export function RoleExamples({ part }: { part: "card" | "compare" }) {
  return part === "card" ? <ExampleCard /> : <Compare />;
}

// Both parts share one rotating selection through a tiny module-level store.
let current = 0;
let paused = false;
const listeners = new Set<() => void>();
function set(i: number, pause: boolean) {
  current = i;
  if (pause) paused = true;
  listeners.forEach((l) => l());
}
function useExample(): [number, (i: number) => void] {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return [current, (i) => set(i, true)];
}

function ExampleCard() {
  const [idx, choose] = useExample();
  useEffect(() => {
    const t = setInterval(() => {
      if (!paused) set((current + 1) % EXAMPLES.length, false);
    }, 5000);
    return () => clearInterval(t);
  }, []);
  const ex = EXAMPLES[idx];
  const bars = [6, 12, 20, 10, 24, 28, 16, 8, 18, 26, 28, 22, 12, 16, 26, 28, 20, 14, 8, 18, 24, 16, 10, 6, 14, 22, 26, 18, 10, 6];

  return (
    <section aria-label="Example of a practice session" style={{ flex: "1 1 440px", minWidth: 0 }}>
      <div role="group" aria-label="Pick an example role" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {EXAMPLES.map((e, i) => (
          <button
            key={e.id}
            type="button"
            aria-pressed={i === idx}
            onClick={() => choose(i)}
            style={{
              minHeight: 40, padding: "0 16px", borderRadius: 999, fontSize: 14, fontWeight: 700, cursor: "pointer",
              background: i === idx ? "var(--ink)" : "#fff",
              color: i === idx ? "#fff" : "var(--ink-2)",
              border: `1px solid ${i === idx ? "var(--ink)" : "var(--line-2)"}`,
            }}
          >
            {e.label}
          </button>
        ))}
      </div>
      <div className="example-panel" style={{ borderRadius: 28, background: "var(--accent-panel)" }}>
        <div style={{ padding: 20, borderRadius: 18, background: "#fff", boxShadow: "0 12px 32px -20px rgba(22,22,26,0.35)" }}>
          <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)" }}>Your resume</p>
          <p style={{ margin: "0 0 10px", fontWeight: 700 }}>{ex.title}</p>
          <p style={{ margin: 0, padding: "8px 12px", borderRadius: 10, background: "var(--warm-soft)", color: "var(--warm-ink)", fontWeight: 500 }}>{ex.claim}</p>
          <p style={{ margin: "8px 0 0", padding: "0 12px", color: "#6b6b74" }}>{ex.other}</p>
        </div>
        <div style={{ margin: "20px 0 0 40px", padding: "20px 22px", borderRadius: "18px 18px 18px 4px", background: "var(--accent)", color: "#fff" }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Interviewer</p>
          <p style={{ margin: 0, fontFamily: "var(--display)", fontSize: "1.375rem", lineHeight: 1.3, fontWeight: 500 }}>&ldquo;{ex.question}&rdquo;</p>
        </div>
        <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", borderRadius: 999, background: "#fff" }}>
          <span style={{ flex: "0 0 auto", width: 44, height: 44, borderRadius: "50%", background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
              <path d="M19 11a7 7 0 0 1-14 0" />
              <path d="M12 18v3" />
            </svg>
          </span>
          <div aria-hidden style={{ flex: "1 1 auto", display: "flex", alignItems: "center", gap: 3, height: 28, overflow: "hidden" }}>
            {bars.map((h, i) => (
              <span key={i} style={{ display: "block", flex: "0 0 4px", width: 4, height: h, borderRadius: 999, background: "var(--ink)" }} />
            ))}
          </div>
          <span style={{ flex: "0 0 auto", fontSize: 14, fontWeight: 700 }}>Could you answer?</span>
        </div>
      </div>
    </section>
  );
}

function Compare() {
  const [idx] = useExample();
  const ex = EXAMPLES[idx];
  return (
    <>
      <p className="muted" style={{ margin: "0 0 28px" }}>
        Example answers to the {ex.label.toLowerCase()} question above.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div className="card" style={{ padding: 28 }}>
          <span className="chip chip-vague">Before practice</span>
          <p style={{ margin: "12px 0 0", fontSize: "1.2rem", lineHeight: 1.45, color: "var(--ink-3)" }}>&ldquo;{ex.before}&rdquo;</p>
        </div>
        <div className="card" style={{ padding: 28, border: "2px solid var(--accent)" }}>
          <span className="chip chip-strong">After practice</span>
          <p style={{ margin: "12px 0 0", fontSize: "1.2rem", lineHeight: 1.45 }}>&ldquo;{ex.after}&rdquo;</p>
        </div>
      </div>
    </>
  );
}
