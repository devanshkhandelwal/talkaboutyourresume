"use client";

import { useEffect, useState } from "react";
import { drawShareCard } from "@/lib/shareCard";
import type { Verdict } from "@/lib/types";

/**
 * "Share your result": previews a square image of the score, made in the browser,
 * then shares it (phones) or downloads it. The best line is included only if they
 * leave the box ticked, and they see exactly what goes out before sharing.
 */
export function ShareResult({ verdicts, interviewer, dateMs, bestQuote }: { verdicts: Verdict[]; interviewer: string; dateMs: number; bestQuote: string | null }) {
  const [open, setOpen] = useState(false);
  const [withQuote, setWithQuote] = useState(Boolean(bestQuote));
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);

  // Redraw only when what's on the card changes (the array itself is new on every render).
  const verdictKey = verdicts.join(",");
  useEffect(() => {
    if (!open) return;
    let url = "";
    let alive = true;
    drawShareCard({ verdicts: verdictKey.split(",") as Verdict[], interviewer, date: new Date(dateMs), quote: withQuote ? bestQuote : null, host: window.location.host })
      .then((blob) => {
        if (!alive) return;
        url = URL.createObjectURL(blob);
        setImage({ blob, url });
        const file = new File([blob], "interview-result.png", { type: "image/png" });
        setCanShareFiles(Boolean(navigator.canShare?.({ files: [file] })));
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Couldn't make the image."));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, withQuote, verdictKey, interviewer, dateMs, bestQuote]);

  async function share() {
    if (!image) return;
    const file = new File([image.blob], "interview-result.png", { type: "image/png" });
    try {
      await navigator.share({ files: [file], title: "My practice interview" });
    } catch (e) {
      // Closing the share sheet isn't an error worth showing.
      if (!(e instanceof DOMException && e.name === "AbortError")) download();
    }
  }

  function download() {
    if (!image) return;
    const a = document.createElement("a");
    a.href = image.url;
    a.download = "interview-result.png";
    a.click();
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-light btn-sm" onClick={() => setOpen(true)} aria-expanded={false}>
        <ShareIcon />
        Share your result
      </button>
    );
  }

  return (
    <section aria-label="Share your result" className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>Share your result</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image.url} alt="Your result card" width={540} height={540} style={{ display: "block", width: "100%", maxWidth: 420, height: "auto", border: "2px solid var(--ink)", borderRadius: 8 }} />
      ) : (
        !error && (
          <p className="muted" style={{ display: "flex", alignItems: "center", gap: 10, margin: 0 }}>
            <span className="spinner" aria-hidden /> Making your card...
          </p>
        )
      )}
      {error && (
        <p className="error" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      {bestQuote && (
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14, fontSize: 15, cursor: "pointer" }}>
          <input type="checkbox" checked={withQuote} onChange={(e) => setWithQuote(e.target.checked)} style={{ marginTop: 4, width: 18, height: 18 }} />
          Include my best line (it may mention where you worked)
        </label>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
        {canShareFiles && (
          <button type="button" className="btn btn-dark btn-sm" onClick={share} disabled={!image}>
            <ShareIcon />
            Share
          </button>
        )}
        <button type="button" className={`btn btn-sm ${canShareFiles ? "btn-light" : "btn-dark"}`} onClick={download} disabled={!image}>
          Download image
        </button>
      </div>
      <p className="subtle" style={{ margin: "10px 0 0" }}>Made on your device. Nothing is uploaded.</p>
    </section>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}
