"use client";

import { useEffect, useRef, useState } from "react";
import { costBreakdown, costLedger, minutesSeconds, money } from "@/lib/cost";

/**
 * Running cost of the interview, for the call header. Tap for a voice vs. Claude
 * breakdown (tap again, tap outside or press Esc to close). Works the same on touch.
 */
export function LiveCost({ voiceOpenedAt }: { voiceOpenedAt: () => number | null }) {
  const [, setTick] = useState(0);
  // Where the breakdown opens: under the button, kept 16px inside the screen edges.
  const [open, setOpen] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrap = useRef<HTMLDivElement | null>(null);

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    if (open) return setOpen(null);
    const r = e.currentTarget.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const width = Math.min(300, vw - 32);
    setOpen({ top: r.bottom + 10, left: Math.max(16, Math.min(r.right - width, vw - 16 - width)), width });
  }

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const openedAt = voiceOpenedAt();
  const b = costBreakdown(costLedger.get(), openedAt ? Date.now() - openedAt : 0);

  return (
    <div ref={wrap}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={Boolean(open)}
        aria-controls="live-cost"
        aria-label={`Cost so far ${money(b.total)}. Show breakdown`}
        style={{ height: 40, padding: "0 12px", borderRadius: 8, display: "inline-flex", alignItems: "center", background: "#000", color: "#fff", border: "2px solid #fff", fontWeight: 600, fontSize: 15, fontVariantNumeric: "tabular-nums", cursor: "pointer" }}
      >
        {money(b.total)}
      </button>
      {open && (
        <div
          id="live-cost"
          role="dialog"
          aria-label="Cost breakdown"
          style={{ position: "fixed", top: open.top, left: open.left, width: open.width, zIndex: 10, padding: 16, borderRadius: 10, background: "#fff", color: "#000", border: "2px solid #000", boxShadow: "3px 3px 0 #fff", textAlign: "left" }}
        >
          <p style={{ margin: "0 0 10px", fontWeight: 600 }}>This interview so far</p>
          <CostRows b={b} feedback="later" />
        </div>
      )}
    </div>
  );
}

/** The rows shared by the live popover and the feedback page's final cost card. */
export function CostRows({
  b,
  feedback,
}: {
  b: ReturnType<typeof costBreakdown>;
  /** What to say about a feedback call that isn't counted yet: coming after the interview, in progress, or not happening. */
  feedback: "later" | "pending" | "none";
}) {
  const feedbackNote = b.hasFeedback ? "feedback" : feedback === "later" ? "feedback comes after" : feedback === "pending" ? "feedback in progress" : null;
  const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: "1px solid currentColor" };
  const num: React.CSSProperties = { fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  return (
    <div style={{ fontSize: 14, lineHeight: 1.4 }}>
      <div style={row}>
        <span>
          Voice (Deepgram)
          <br />
          <span style={{ opacity: 0.7 }}>{minutesSeconds(b.voiceMs)}</span>
        </span>
        <span style={num}>{money(b.voice)}</span>
      </div>
      <div style={row}>
        <span>
          Claude
          <br />
          <span style={{ opacity: 0.7 }}>
            {[b.hasResume && "resume read", feedbackNote].filter(Boolean).join(", ") || "nothing yet"}
          </span>
        </span>
        <span style={num}>{money(b.claude)}</span>
      </div>
      <div style={{ ...row, borderBottom: 0, fontWeight: 600 }}>
        <span>Total</span>
        <span style={num}>{money(b.total)}</span>
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 12, opacity: 0.7 }}>Estimated from list prices. The interviewer&apos;s replies are part of the voice rate.</p>
    </div>
  );
}
