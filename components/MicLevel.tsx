"use client";

import { useEffect, useRef } from "react";

const WEIGHTS = [0.55, 0.8, 1, 0.8, 0.55];

/**
 * Live mic meter, so people can see they're being heard.
 * Bars are updated directly each frame (transform only) without re-rendering React.
 */
export function MicLevel({ read }: { read: () => number }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const readRef = useRef(read);
  readRef.current = read;

  useEffect(() => {
    let raf = 0;
    let level = 0;
    const tick = () => {
      const target = readRef.current();
      // Fast attack, slower release: follows speech without flickering.
      level += (target - level) * (target > level ? 0.5 : 0.15);
      bars.current.forEach((b, i) => {
        if (b) b.style.transform = `scaleY(${Math.max(0.2, Math.min(1, level * WEIGHTS[i] * 1.4))})`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <span aria-hidden style={{ display: "inline-flex", alignItems: "center", gap: 3, height: 16 }}>
      {WEIGHTS.map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el;
          }}
          style={{ width: 3, height: 16, borderRadius: 999, background: "#3dd6b8", transform: "scaleY(0.2)", willChange: "transform" }}
        />
      ))}
    </span>
  );
}
