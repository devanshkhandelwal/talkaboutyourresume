"use client";

import { useEffect, useState } from "react";
import { currentTheme, setTheme as applyTheme, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  // Unknown until mounted: the server can't see the saved choice.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(currentTheme());
    // Stay in sync when something else switches the theme (the lamp on the home page).
    const mo = new MutationObserver(() => setTheme(currentTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  function toggle() {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
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
