// Shared by the server layout (pre-paint script) and the client toggle.
export type Theme = "light" | "dark";

export const THEME_KEY = "tayr.theme";
export const THEME_COLOR: Record<Theme, string> = { light: "#ffffff", dark: "#000000" };

/**
 * Runs in <head> before first paint, so a saved dark choice never flashes light.
 * Light is the default; only an explicit "dark" choice changes it.
 */
export const THEME_INIT_SCRIPT = `try{if(localStorage.getItem("${THEME_KEY}")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;

/** The theme on the page right now (browser only). */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Switch the page theme and remember a dark choice (browser only). */
export function setTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
  try {
    if (theme === "dark") localStorage.setItem(THEME_KEY, "dark");
    else localStorage.removeItem(THEME_KEY);
  } catch {
    // Storage can be blocked; the theme still changes for this visit.
  }
}
