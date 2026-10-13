"use client";

import { useEffect, useState } from "react";
import type { BalanceResponse } from "@/lib/types";

/** Rounded so it reads as a live count, not a precise promise: "330+", then "Only 42" when low. */
function creditsText(n: number) {
  if (n <= 0) return "Free beta interviews are used up for now";
  if (n >= 100) return `${Math.floor(n / 10) * 10}+ free interviews left in the beta`;
  return `Only ${n} free ${n === 1 ? "interview" : "interviews"} left in the beta`;
}

/**
 * The beta's shared free-interview count, shown under the main call to action.
 * Reserves its line while loading so nothing below jumps; renders nothing on error.
 */
export function CreditsBadge() {
  const [data, setData] = useState<BalanceResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/deepgram-balance")
      .then((res) => (res.ok ? res.json() : null))
      .then((d: BalanceResponse | null) => {
        if (!alive) return;
        if (d && typeof d.estInterviewsLeft === "number") setData(d);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  if (failed) return null;
  const n = data?.estInterviewsLeft ?? 0;
  return (
    <p className={`credits-line${data ? " ready" : ""}${data && n <= 0 ? " out" : ""}`} aria-live="polite">
      {data && (
        <>
          <span className="credits-dot" aria-hidden />
          {creditsText(n)}
        </>
      )}
    </p>
  );
}
