"use client";

import type { Verdict } from "./types";

// A square result card drawn on a canvas in the browser, in the site's 1-bit look:
// paper, ink borders, hard shadows, verdict colors. Nothing is uploaded.

export type ShareCardData = {
  verdicts: Verdict[];
  interviewer: string;
  date: Date;
  /** Their best line, only when they chose to include it. */
  quote: string | null;
  host: string;
};

const SIZE = 1080;
const PAD = 80;
const INK = "#000";
const FILL: Record<Verdict, string> = { strong: "#b8f0cf", needs_detail: "#ffe98a", vague: "#ffc7c7" };

/** Splits text into lines that fit `width`, capped at `max` lines with an ellipsis. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  let last = kept[max - 1];
  while (last && ctx.measureText(`${last}…`).width > width) last = last.replace(/\s*\S+$/, "");
  kept[max - 1] = `${last}…`;
  return kept;
}

/** The 1-bit card: fill, ink border, hard offset shadow. */
function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, border = 4, shadow = 8) {
  ctx.fillStyle = INK;
  ctx.fillRect(x + shadow, y + shadow, w, h);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x + border, y + border, w - 2 * border, h - 2 * border);
}

export async function drawShareCard(data: ShareCardData): Promise<Blob> {
  await document.fonts?.ready;
  // The site's self-hosted font, by the name next/font gave it.
  const family = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const font = (weight: number, px: number) => `${weight} ${px}px ${family}`;

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn't available.");
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, SIZE, SIZE);
  box(ctx, 24, 24, SIZE - 56, SIZE - 56, "#fff", 6, 8);

  const total = data.verdicts.length;
  const strong = data.verdicts.filter((v) => v === "strong").length;
  const inner = SIZE - 2 * PAD;

  ctx.fillStyle = INK;
  ctx.font = font(600, 38);
  ctx.fillText("talkaboutyourresume", PAD, PAD + 50);
  ctx.font = font(500, 30);
  ctx.fillStyle = "#33363d";
  ctx.fillText("Practice interview", PAD, PAD + 96);

  // Headline: how many answers landed. Without a quote the score sits lower, so the card isn't top-heavy.
  let y = PAD + 300 + (data.quote ? 0 : 150);
  ctx.fillStyle = INK;
  ctx.font = font(600, 190);
  const big = `${strong} of ${total}`;
  ctx.fillText(big, PAD - 6, y);
  ctx.font = font(500, 52);
  y += 76;
  ctx.fillText(total === 1 ? "answer was specific" : "answers were specific", PAD, y);

  // One block per answer, filled with its verdict color.
  y += 50;
  const gap = 18;
  const w = Math.min(150, (inner - gap * (total - 1)) / Math.max(1, total));
  data.verdicts.forEach((v, i) => box(ctx, PAD + i * (w + gap), y, w, 56, FILL[v], 4, 6));
  y += 56 + 50;

  // Optional best line, in a highlighter-yellow card like the feedback page.
  if (data.quote) {
    ctx.font = font(500, 38);
    const lines = wrap(ctx, `“${data.quote}”`, inner - 64, 4);
    const h = 70 + lines.length * 50 + 24;
    box(ctx, PAD, y, inner, h, "#ffe45c", 4, 8);
    ctx.fillStyle = INK;
    ctx.font = font(600, 26);
    ctx.fillText("My best moment", PAD + 32, y + 52);
    ctx.font = font(500, 38);
    lines.forEach((l, i) => ctx.fillText(l, PAD + 32, y + 110 + i * 50));
  }

  // Footer.
  ctx.fillStyle = "#33363d";
  ctx.font = font(500, 28);
  const when = data.date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  ctx.fillText(`With ${data.interviewer} · ${when}`, PAD, SIZE - PAD);
  ctx.textAlign = "right";
  ctx.fillStyle = INK;
  ctx.font = font(600, 28);
  ctx.fillText(data.host, SIZE - PAD, SIZE - PAD);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the image."))), "image/png"));
}
