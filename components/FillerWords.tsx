import { WORDS_PER_MINUTE, type FillerMatch, type FillerReport } from "@/lib/fillers";
import type { TranscriptLine } from "@/lib/types";

/** Text with filler spans wrapped in <mark>. */
export function Highlighted({ text, matches }: { text: string; matches?: FillerMatch[] }) {
  if (!matches?.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  matches.forEach((m, i) => {
    if (m.start > at) parts.push(text.slice(at, m.start));
    parts.push(
      <mark key={i} className="filler">
        {text.slice(m.start, m.end)}
      </mark>,
    );
    at = m.end;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

/** Filler word summary for the feedback page. Counts the candidate's answers only. */
export function FillerSummary({ report, transcript }: { report: FillerReport; transcript: TranscriptLine[] }) {
  const { total, perMinute, byWord, worst, matches } = report;
  return (
    <section aria-labelledby="fillers-title" style={{ marginTop: 40 }}>
      <h2 id="fillers-title" style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>
        Filler words
      </h2>
      <div className="card" style={{ marginTop: 12, padding: 24 }}>
        {total === 0 ? (
          <>
            <p style={{ margin: 0, fontWeight: 600 }}>No filler words. Nice and clean.</p>
            <p className="subtle" style={{ margin: "4px 0 0" }}>&ldquo;Um&rdquo; and &ldquo;uh&rdquo; can&apos;t be counted yet: the voice service removes them.</p>
          </>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 32px" }}>
              <p style={{ margin: 0 }}>
                <span className="display" style={{ fontSize: "2.25rem" }}>{total}</span>{" "}
                <span className="muted">{total === 1 ? "filler word" : "filler words"}</span>
              </p>
              <p style={{ margin: 0 }}>
                <span className="display" style={{ fontSize: "2.25rem" }}>{perMinute.toFixed(1)}</span>{" "}
                <span className="muted">per minute</span>
              </p>
            </div>
            <p className="subtle" style={{ margin: "4px 0 0" }}>
              Per minute of your speaking, estimated at {WORDS_PER_MINUTE} words a minute. &ldquo;Um&rdquo; and &ldquo;uh&rdquo; can&apos;t be counted yet: the voice service removes them.
            </p>
            <ul aria-label="By word" style={{ margin: "16px 0 0", padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8 }}>
              {byWord.map((w) => (
                <li key={w.label} className="chip chip-neutral">
                  &ldquo;{w.label}&rdquo; × {w.count}
                </li>
              ))}
            </ul>
            {worst && (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  Most in one answer: {worst.count}
                </p>
                {worst.question && (
                  <p className="subtle" style={{ margin: "4px 0 0" }}>
                    Asked: {worst.question}
                  </p>
                )}
                <p className="muted" style={{ margin: "8px 0 0" }}>
                  {worst.lines.map((i, n) => (
                    <span key={i}>
                      {n > 0 && " "}
                      <Highlighted text={transcript[i]?.content ?? ""} matches={matches[i]} />
                    </span>
                  ))}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
