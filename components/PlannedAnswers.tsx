import type { PlanComparison } from "@/lib/types";

/**
 * Results-page section: for each practice question with a planned answer, what
 * they said vs what they planned, the one change to make, and a tighter version.
 * [Brackets] in the improved answer mark facts they still need to fill in.
 */
export function PlannedAnswers({ items }: { items: PlanComparison[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="planned-title" style={{ marginTop: 40 }}>
      <h2 id="planned-title" style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>
        Your planned answers
      </h2>
      <p className="subtle" style={{ margin: "4px 0 14px" }}>
        What you said out loud, compared with what you planned to say.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {items.map((p) => (
          <article key={p.question} className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: "1.0625rem", fontWeight: 600 }}>{p.question}</h3>
              {!p.asked && (
                <span className="chip" style={{ background: "var(--chip-neutral)" }}>
                  Not asked this time
                </span>
              )}
            </div>

            {p.asked && (
              <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {p.covered.map((c) => (
                  <Point key={`c-${c}`} kind="covered" text={c} />
                ))}
                {p.missed.map((c) => (
                  <Point key={`m-${c}`} kind="missed" text={c} />
                ))}
                {p.added.map((c) => (
                  <Point key={`a-${c}`} kind="added" text={c} />
                ))}
              </ul>
            )}
            {!p.asked && p.missed.length > 0 && (
              <p className="muted" style={{ margin: "12px 0 0", fontSize: 15 }}>
                Key points in your plan: {p.missed.join("; ")}.
              </p>
            )}

            {p.suggestion && (
              <p style={{ margin: "14px 0 0" }}>
                <strong>Next time:</strong> {p.suggestion}
              </p>
            )}
            {p.improved && (
              <details open style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>A tighter version to practice</summary>
                <p style={{ margin: "10px 0 0", padding: "12px 14px", borderRadius: 8, border: "2px solid var(--ink)", lineHeight: 1.55 }}>
                  <Bracketed text={p.improved} />
                </p>
                {/\[[^\]]+\]/.test(p.improved) && (
                  <p className="subtle" style={{ margin: "6px 0 0" }}>
                    Fill in the highlighted parts with your real numbers.
                  </p>
                )}
              </details>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

const POINT = {
  covered: { mark: "✓", label: "Said", bg: "var(--v-strong)" },
  missed: { mark: "✕", label: "Left out", bg: "var(--v-vague)" },
  added: { mark: "+", label: "Added", bg: "var(--chip-neutral)" },
} as const;

function Point({ kind, text }: { kind: keyof typeof POINT; text: string }) {
  const p = POINT[kind];
  return (
    <li style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <span
        aria-label={p.label}
        title={p.label}
        style={{ flex: "0 0 auto", width: 22, height: 22, marginTop: 1, borderRadius: 4, border: "2px solid var(--ink)", background: p.bg, color: "#000", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}
      >
        {p.mark}
      </span>
      <span>{text}</span>
    </li>
  );
}

/** Highlights [placeholders] the candidate still needs to fill in. */
function Bracketed({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[[^\]]+\])/).map((part, i) =>
        /^\[[^\]]+\]$/.test(part) ? (
          <mark key={i} style={{ padding: "1px 4px", background: "var(--hl)", color: "#000", fontWeight: 600 }}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
