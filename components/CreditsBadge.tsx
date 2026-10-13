"use client";

import { useEffect, useState } from "react";
import type { BalanceResponse } from "@/lib/types";

/** Rounded so it reads as a live count, not a precise promise: "330+", then "Only 42" when low. */
function count(n: number) {
  if (n >= 100) return { lead: "", num: `${Math.floor(n / 10) * 10}+`, rest: " free interviews left in Beta" };
  return { lead: "Only ", num: String(n), rest: n === 1 ? " free interview left in Beta" : " free interviews left in Beta" };
}

/**
 * Header badge with the beta's shared free-interview count.
 * Renders nothing until the count loads, and nothing on any error.
 */
export function CreditsBadge() {
  const [data, setData] = useState<BalanceResponse | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/deepgram-balance")
      .then((res) => (res.ok ? res.json() : null))
      .then((d: BalanceResponse | null) => {
        if (alive && d && typeof d.estInterviewsLeft === "number") setData(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return null;
  const n = data.estInterviewsLeft;
  if (n <= 0) {
    return (
      <span className="credits-badge out" title="Free interviews are shared by everyone during the beta">
        Free interviews are used up for now
      </span>
    );
  }
  const c = count(n);
  return (
    <span className="credits-badge" title="Free interviews are shared by everyone during the beta">
      <span>
        {c.lead}
        <strong>{c.num}</strong>
        {c.rest}
      </span>
    </span>
  );
}
