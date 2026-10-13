"use client";

import { useState } from "react";
import { buildHeatmap } from "@/lib/heatmap";
import type { AnswerFeedback, ResumeTopic, Verdict } from "@/lib/types";

const LABEL: Record<Verdict, string> = { strong: "Strong", needs_detail: "Needs detail", vague: "Vague" };
const CHIP: Record<Verdict, string> = { strong: "chip-strong", needs_detail: "chip-detail", vague: "chip-vague" };

/**
 * The resume, with each part the interview discussed colored by how the answer went.
 * Parts that weren't discussed stay plain. Tap a colored part for the question, verdict and tip.
 */
export function ResumeHeatmap({ resumeText, topics, answers }: { resumeText: string; topics: ResumeTopic[]; answers: AnswerFeedback[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const { blocks, unplaced } = buildHeatmap(resumeText, topics, answers);
  if (!blocks.some((b) => b.verdict) && unplaced.length === 0) return null;
  const toggle = (key: string) => setOpen((o) => (o === key ? null : key));

  return (
    <section aria-labelledby="heatmap-title" style={{ marginTop: 40 }}>
      <h2 id="heatmap-title" style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>
        Your resume, by answer
      </h2>
      <p className="subtle" style={{ margin: "4px 0 0" }}>Tap a colored part to see what you were asked and how to tighten it.</p>
      <ul aria-label="Legend" style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: "8px 16px", fontSize: 14 }}>
        {(["strong", "needs_detail", "vague"] as const).map((v) => (
          <li key={v} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span aria-hidden className={`heat-swatch heat-${v}`} />
            {LABEL[v]}
          </li>
        ))}
        <li style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span aria-hidden className="heat-swatch" />
          Not discussed
        </li>
      </ul>

      <div className="card heatmap" style={{ marginTop: 12, padding: "16px 12px" }}>
        {blocks.map((b, k) => {
          const text = b.lines.join("\n");
          if (!b.verdict) {
            // Plain text keeps the resume's own blank lines.
            return text.trim() ? (
              <p key={k} className="heat-plain">
                {text}
              </p>
            ) : (
              <span key={k} aria-hidden className="heat-gap" />
            );
          }
          const key = `b${k}`;
          return (
            <div key={k}>
              <button type="button" className={`heat-part heat-${b.verdict}`} aria-expanded={open === key} aria-controls={`${key}-notes`} onClick={() => toggle(key)}>
                <span className="visually-hidden">{LABEL[b.verdict]}: </span>
                {text.trim()}
              </button>
              {open === key && <Notes id={`${key}-notes`} answers={b.answers} />}
            </div>
          );
        })}
      </div>

      {unplaced.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <p className="subtle" style={{ margin: "0 0 8px" }}>Also discussed, but we couldn&apos;t find the exact line on your resume:</p>
          {unplaced.map((u) => {
            const key = `u${u.topic.id}`;
            return (
              <div key={key} style={{ marginTop: 8 }}>
                <button type="button" className={`heat-part heat-${u.verdict}`} aria-expanded={open === key} aria-controls={`${key}-notes`} onClick={() => toggle(key)}>
                  <span className="visually-hidden">{LABEL[u.verdict]}: </span>
                  {u.topic.claim || u.topic.title}
                </button>
                {open === key && <Notes id={`${key}-notes`} answers={u.answers} />}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Notes({ id, answers }: { id: string; answers: AnswerFeedback[] }) {
  return (
    <div id={id} className="heat-notes">
      {answers.map((a, i) => (
        <div key={i} style={{ paddingTop: i ? 12 : 0, marginTop: i ? 12 : 0, borderTop: i ? "1px solid var(--line)" : undefined }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>{a.question ? `“${a.question}”` : a.title}</span>
            <span className={`chip ${CHIP[a.verdict] ?? "chip-vague"}`}>{LABEL[a.verdict] ?? a.verdict}</span>
          </div>
          <p className="muted" style={{ margin: "6px 0 0" }}>{a.tip}</p>
        </div>
      ))}
    </div>
  );
}
