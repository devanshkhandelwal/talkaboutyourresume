"use client";

import { useEffect, useState } from "react";
import { THEME_COLOR, THEME_KEY, type Theme } from "@/lib/theme";

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

export function ThemeToggle() {
  // Unknown until mounted: the server can't see the saved choice.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current: Theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    apply(current);
    setTheme(current);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    apply(next);
    setTheme(next);
    try {
      if (next === "dark") localStorage.setItem(THEME_KEY, "dark");
      else localStorage.removeItem(THEME_KEY);
    } catch {
      // Storage can be blocked; the toggle still works for this visit.
    }
  }

  const dark = theme === "dark";
  return (
    <button type="button" className="theme-toggle" aria-label="Dark mode" aria-pressed={dark} onClick={toggle} disabled={theme === null}>
      {/* Shows what you'll switch to: a moon in light mode, a sun in dark mode. */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </>
        ) : (
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        )}
      </svg>
    </button>
  );
}
