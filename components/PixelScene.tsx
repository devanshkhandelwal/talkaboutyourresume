"use client";

import { useEffect, useRef } from "react";

// A 1-bit pixel-art room, drawn at low resolution and scaled up crisply: a desk
// with a lamp, a mug and a plant, your resume pinned to the wall, a window, a
// pendant light and a shelf. Everything is black or white with dithered shading;
// the only color is the laptop's video call. Dark mode inverts the room.
// The room is laid out on a 192 x 108 grid and placed on a larger 240 x 135 canvas
// (offset by OX, OY), so pixels stay fine and there's open wall around it.
const W = 240;
const H = 135;
const OX = 48;
const OY = 27;
const FLOOR = 96;
const TOP = 70; // desk top

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

type Px = (x: number, y: number, c: string) => void;

// The interviewer on the video call, 20 x 24 pixels: hair with a highlight,
// ears, brows, eyes, a nose shadow, a smile, a navy blazer over a white collar.
function drawPerson(px: Px, ox: number, oy: number) {
  const C: Record<string, string> = {
    h: "#2b1d16", H: "#4a3426", l: "#8d5a3b", L: "#a26c48", S: "#6e4329",
    e: "#17171d", b: "#2b1d16", m: "#5a2a22", w: "#eef1f6", j: "#1e2a5a", J: "#141d42",
  };
  const seg = (y: number, x0: number, x1: number, k: string) => {
    for (let x = x0; x <= x1; x++) px(ox + x, oy + y, C[k]);
  };
  const dot = (x: number, y: number, k: string) => px(ox + x, oy + y, C[k]);

  // Shoulders and blazer first, so the neck and collar sit on top.
  seg(16, 3, 16, "j");
  seg(17, 1, 18, "j");
  for (let y = 18; y < 24; y++) seg(y, 0, 19, "j");
  for (let y = 18; y < 24; y++) seg(y, 9, 10, "J");
  seg(16, 7, 12, "w");
  seg(17, 8, 11, "w");
  seg(18, 9, 10, "w");
  seg(14, 6, 13, "S");
  seg(15, 8, 11, "S");
  // Hair.
  seg(0, 6, 13, "h");
  seg(1, 4, 15, "h");
  seg(2, 3, 16, "h");
  seg(2, 6, 10, "H");
  seg(3, 3, 16, "h");
  seg(3, 5, 7, "H");
  seg(4, 3, 16, "h");
  // Face.
  seg(5, 3, 16, "h");
  seg(5, 5, 14, "l");
  seg(6, 3, 4, "h");
  seg(6, 5, 14, "l");
  seg(6, 7, 11, "L");
  seg(6, 15, 16, "h");
  dot(3, 7, "h");
  seg(7, 4, 15, "l");
  dot(16, 7, "h");
  seg(7, 6, 8, "b");
  seg(7, 11, 13, "b");
  seg(8, 3, 16, "l");
  seg(9, 3, 16, "l");
  dot(2, 8, "S");
  dot(2, 9, "S");
  dot(17, 8, "S");
  dot(17, 9, "S");
  dot(7, 9, "e");
  dot(12, 9, "e");
  seg(10, 3, 16, "l");
  dot(10, 10, "S");
  seg(11, 4, 15, "l");
  seg(11, 9, 10, "S");
  dot(4, 11, "S");
  dot(15, 11, "S");
  seg(12, 4, 15, "l");
  seg(13, 5, 14, "l");
  dot(5, 13, "S");
  dot(14, 13, "S");
  // A smile: corners one row up, then the lower lip.
  dot(7, 12, "m");
  dot(12, 12, "m");
  seg(13, 8, 11, "m");
}

function draw(ctx: CanvasRenderingContext2D, dark: boolean) {
  const I = dark ? "#ffffff" : "#000000"; // ink
  const P = dark ? "#000000" : "#ffffff"; // paper
  const px: Px = (x, y, c) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  };
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  const box = (x: number, y: number, w: number, h: number) => {
    rect(x, y, w, h, P);
    rect(x, y, w, 1, I);
    rect(x, y + h - 1, w, 1, I);
    rect(x, y, 1, h, I);
    rect(x + w - 1, y, 1, h, I);
  };
  // Ordered-dither shading: level 0 (white) to 16 (black).
  const shade = (x: number, y: number, w: number, h: number, level: number) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (BAYER[yy % 4][xx % 4] < level) px(xx, yy, I);
  };
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) px(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), I);
  };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  rect(0, 0, W, H, P);

  // Wall: a ceiling line, a baseboard, and the floor with boards in perspective.
  const floorY = FLOOR + OY;
  rect(0, 1, W, 1, I);
  rect(0, floorY - 4, W, 1, I);
  rect(0, floorY, W, 1, I);
  for (let x = 8; x < W + 12; x += 20) line(x, floorY + 1, x - 6, H - 1);

  // Everything else is laid out on the 192 x 108 grid, shifted toward the lower right.
  ctx.setTransform(1, 0, 0, 1, OX, OY);

  // Window with mullions, a dithered sky and a white cloud; curtains on either side.
  box(146, 8, 36, 40);
  shade(147, 9, 34, 38, 2);
  const cloud: [number, number, number, number][] = [[0, 0, 6, 2], [5, -2, 5, 3], [10, 0, 5, 2]];
  for (let y = 12; y < 26; y++)
    for (let x = 148; x < 181; x++)
      if (cloud.some(([ox, oy, rx, ry]) => ((x - 155 - ox) / rx) ** 2 + ((y - 19 - oy) / ry) ** 2 <= 1)) px(x, y, P);
  rect(163, 9, 2, 38, I);
  rect(147, 27, 34, 2, I);
  rect(143, 48, 42, 2, I);
  rect(138, 4, 52, 1, I);
  for (const cx of [140, 183]) {
    box(cx, 5, 6, 48);
    rect(cx + 2, 6, 1, 46, I);
    rect(cx + 4, 6, 1, 46, I);
  }

  // Pendant lamp.
  rect(128, 2, 1, 9, I);
  for (let y = 0; y < 6; y++) rect(124 - y, 11 + y, 9 + y * 2, 1, I);
  rect(126, 17, 5, 1, P);

  // Your resume pinned to the wall, one line highlighted.
  box(86, 8, 22, 28);
  for (const [y, len] of [[13, 12], [17, 16], [21, 14], [25, 16], [29, 10]] as const) rect(89, y, len, 1, I);
  shade(88, 16, 18, 3, 6);
  rect(89, 17, 16, 1, I);
  rect(96, 6, 3, 3, I);
  // Shelf with books (alternating solid and outlined spines) and a small plant.
  rect(84, 46, 40, 2, I);
  for (let i = 0; i < 8; i++) {
    const h = 8 - (i % 3);
    if (i % 2) rect(86 + i * 2, 46 - h, 2, h, I);
    else box(86 + i * 2, 46 - h, 2, h);
  }
  box(114, 42, 6, 4);
  for (const [dx, h] of [[1, 5], [3, 7], [5, 4]] as const) rect(114 + dx, 42 - h, 1, h, I);

  // The desk: top, front edge, apron, a leg, a drawer pedestal, a shadow below.
  shade(100, FLOOR + 1, 84, 3, 4);
  rect(96, TOP, 92, 1, I);
  rect(96, TOP + 3, 92, 1, I);
  rect(96, TOP, 1, 4, I);
  rect(187, TOP, 1, 4, I);
  box(100, TOP + 3, 84, 4);
  rect(101, TOP + 7, 3, FLOOR - TOP - 7, I);
  box(160, TOP + 6, 24, FLOOR - TOP - 6);
  rect(160, TOP + 15, 24, 1, I);
  rect(170, TOP + 10, 4, 1, I);
  rect(170, TOP + 19, 4, 1, I);

  // Mug with steam.
  box(112, 62, 7, 8);
  rect(113, 63, 5, 1, I);
  rect(119, 64, 2, 1, I);
  rect(120, 65, 1, 2, I);
  rect(119, 67, 2, 1, I);
  for (const [x, y] of [[114, 59], [115, 58], [116, 57]]) px(x, y, I);

  // Plant in a pot.
  box(176, 62, 8, 8);
  rect(176, 64, 8, 1, I);
  for (const [dx, dy, len] of [[-1, -1, 8], [1, -1, 10], [0.2, -1, 12], [-0.6, -1, 9], [0.7, -1, 7]] as const)
    for (let i = 0; i < len; i++) px(Math.round(180 + dx * i * 0.6), Math.round(61 + dy * i), I);

  // Laptop on the desk: the one colorful thing in the room, a video call.
  const sx = 125;
  const sy = 40;
  rect(sx - 2, sy - 2, 48, 32, I);
  rect(sx, sy, 44, 28, "#e3e9f1");
  rect(sx, sy + 18, 44, 10, "#d3dbe7");
  rect(sx + 1, sy + 3, 9, 1, "#8b6b4a");
  rect(sx + 1, sy + 11, 9, 1, "#8b6b4a");
  const spines = ["#e85d75", "#1f3fd1", "#f2b84b", "#3b8f5a", "#6a2fd0", "#e85d75", "#f2b84b", "#1f3fd1"];
  spines.forEach((c, i) => rect(sx + 1 + i, sy + 4 + (i % 3), 1, 7 - (i % 3), c));
  spines.slice(0, 6).forEach((c, i) => rect(sx + 2 + i, sy + 12 + (i % 2), 1, 6 - (i % 2), c));
  rect(sx + 33, sy + 3, 8, 7, "#2b2f38");
  rect(sx + 34, sy + 4, 6, 5, "#9cc2e2");
  rect(sx + 34, sy + 7, 6, 2, "#57b06f");
  drawPerson(px, sx + 12, sy + 5);
  rect(sx + 37, sy + 25, 3, 2, "#3dd6b8");
  rect(sx - 6, TOP - 1, 56, 1, I);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

export function PixelScene({ position = "100% 50%" }: { position?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const render = () => draw(ctx, document.documentElement.dataset.theme === "dark");
    render();
    // Redraw inverted when the theme toggle switches to dark.
    const mo = new MutationObserver(render);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      aria-hidden
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: position, imageRendering: "pixelated" }}
    />
  );
}
