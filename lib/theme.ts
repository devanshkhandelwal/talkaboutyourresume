// Shared by the server layout (pre-paint script) and the client toggle.
export type Theme = "light" | "dark";

export const THEME_KEY = "tayr.theme";
export const THEME_COLOR: Record<Theme, string> = { light: "#fbfbf9", dark: "#111114" };

/**
 * Runs in <head> before first paint, so a saved dark choice never flashes light.
 * Light is the default; only an explicit "dark" choice changes it.
 */
export const THEME_INIT_SCRIPT = `try{if(localStorage.getItem("${THEME_KEY}")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;
