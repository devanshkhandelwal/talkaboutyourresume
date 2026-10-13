"use client";

import { useEffect, useRef } from "react";
import { dayKey } from "@/lib/practice";

// A 1-bit wall calendar for the current month, like the one on the home page:
// practiced days are crossed out, today has a box around it. Inverts in dark mode.
const PITCH = 7;
const W = 3 + 7 * PITCH + 2;
const TOP = 13;

export function PixelCalendar({ practiced, today = new Date() }: { practiced: string[]; today?: Date }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const rows = Math.ceil((first + days) / 7);
  const H = TOP + rows * PITCH + 3;
  const done = new Set(practiced);
  const key = practiced.join(",");

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const draw = () => {
      const dark = document.documentElement.dataset.theme === "dark";
      const I = dark ? "#ffffff" : "#000000";
      const P = dark ? "#000000" : "#ffffff";
      const rect = (x: number, y: number, w: number, h: number, c: string) => {
        ctx.fillStyle = c;
        ctx.fillRect(x, y, w, h);
      };
      rect(0, 0, W, H, P);
      // Frame, solid header and two rings.
      rect(0, 0, W, 1, I);
      rect(0, H - 1, W, 1, I);
      rect(0, 0, 1, H, I);
      rect(W - 1, 0, 1, H, I);
      rect(0, 0, W, 8, I);
      rect(11, 3, 3, 2, P);
      rect(W - 14, 3, 3, 2, P);
      for (let d = 1; d <= days; d++) {
        const slot = first + d - 1;
        const x = 3 + (slot % 7) * PITCH;
        const y = TOP + Math.floor(slot / 7) * PITCH;
        if (done.has(dayKey(new Date(year, month, d)))) {
          for (let i = 0; i < 5; i++) {
            rect(x + i, y + i, 1, 1, I);
            rect(x + 4 - i, y + i, 1, 1, I);
          }
        } else rect(x + 2, y + 2, 1, 1, I);
        if (d === today.getDate()) {
          rect(x - 1, y - 1, 7, 1, I);
          rect(x - 1, y + 5, 7, 1, I);
          rect(x - 1, y - 1, 1, 7, I);
          rect(x + 5, y - 1, 1, 7, I);
        }
      }
    };
    draw();
    const mo = new MutationObserver(draw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, year, month, H]);

  return <canvas ref={ref} width={W} height={H} aria-hidden style={{ display: "block", width: "100%", height: "auto", imageRendering: "pixelated" }} />;
}
