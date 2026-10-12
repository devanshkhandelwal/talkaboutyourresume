"use client";

import { useEffect, useState } from "react";
import type { BalanceResponse } from "@/lib/types";

/** Public beta badge. Renders nothing until the balance loads, and nothing on any error. */
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
  return (
    <span className="credits-badge">
      About {n.toLocaleString()} free {n === 1 ? "interview" : "interviews"} left in the beta
    </span>
  );
}
