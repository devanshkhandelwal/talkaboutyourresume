"use client";

import { useEffect, useState } from "react";
import type { BalanceResponse } from "@/lib/types";

function money(amount: number, units: string) {
  return units === "usd" ? `$${amount.toFixed(2)}` : `${amount.toFixed(2)} ${units.toUpperCase()}`;
}

/** Public beta badge. Renders nothing until the balance loads, and nothing on any error. */
export function CreditsBadge() {
  const [data, setData] = useState<BalanceResponse | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/deepgram-balance")
      .then((res) => (res.ok ? res.json() : null))
      .then((d: BalanceResponse | null) => {
        if (alive && d && typeof d.remaining === "number") setData(d);
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
      Beta credits left: {money(data.remaining, data.units)} (about {n.toLocaleString()} {n === 1 ? "interview" : "interviews"})
    </span>
  );
}
