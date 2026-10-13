"use client";

import { useEffect, useRef } from "react";

// A pixel-art scene drawn at low resolution and scaled up crisply:
// your desk by a big window, the city outside, a laptop mid-interview,
// and your resume with a highlighter stroke. Seeded, so it draws the same every time.
const W = 192;
const H = 108;
const HORIZON = 74;
const DESK = 82;

type Palette = {
  sky: string[];
  cloud: string;
  cloudShade: string;
  sun: string;
  sunRing: string;
  far: string;
  near: string;
  win: string;
  winOff: string;
  tree: [string, string, string];
  desk: string;
  deskTop: string;
  deskGrain: string;
  screen: string;
  stars: boolean;
};

const DAY: Palette = {
  sky: ["#2f7fd8", "#4a98e4", "#6fb2ee", "#9bcdf5", "#c4e3fa"],
  cloud: "#ffffff",
  cloudShade: "#d3e8f8",
  sun: "#fff6c9",
  sunRing: "#ffe48a",
  far: "#a3c6e3",
  near: "#7399c0",
  win: "#fff1b3",
  winOff: "#5f84ab",
  tree: ["#2a6f46", "#3b8f5a", "#57b06f"],
  desk: "#b97f4d",
  deskTop: "#d69b62",
  deskGrain: "#a56f3f",
  screen: "#1f3fd1",
  stars: false,
};

const NIGHT: Palette = {
  sky: ["#070b24", "#0d1436", "#141d4a", "#1d295e", "#283672"],
  cloud: "#323f7c",
  cloudShade: "#273266",
  sun: "#f4f1de",
  sunRing: "#c9c6b4",
  far: "#202a58",
  near: "#161d45",
  win: "#ffd66b",
  winOff: "#1e2650",
  tree: ["#0c2219", "#133326", "#1c4734"],
  desk: "#5a3b25",
  deskTop: "#70492e",
  deskGrain: "#4a301e",
  screen: "#2747e8",
  stars: true,
};

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function draw(ctx: CanvasRenderingContext2D, p: Palette) {
  const rng = mulberry32(11);
  const px = (x: number, y: number, c: string) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 1);
  };
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };

  // Sky: flat color bands, with a thin dithered seam where two bands meet.
  for (let y = 0; y < HORIZON; y++) {
    const f = (y / HORIZON) * (p.sky.length - 1);
    const base = Math.floor(f);
    const seam = f - base > 0.88;
    for (let x = 0; x < W; x++) {
      const up = seam && BAYER[y % 4][x % 4] % 2 === 0;
      px(x, y, p.sky[Math.min(p.sky.length - 1, base + (up ? 1 : 0))]);
    }
  }

  if (p.stars) {
    for (let i = 0; i < 60; i++) px(Math.floor(rng() * W), Math.floor(rng() * 46), rng() > 0.8 ? "#ffe9a8" : "#dfe6ff");
  }

  // Sun (or moon at night), upper right.
  for (let y = -8; y <= 8; y++)
    for (let x = -8; x <= 8; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d <= 5) px(156 + x, 15 + y, p.sun);
      else if (d <= 6.5 && !p.stars) px(156 + x, 15 + y, p.sunRing);
    }
  if (p.stars) for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (Math.hypot(x - 2.5, y + 1.5) <= 4.2 && Math.hypot(x, y) <= 5) px(156 + x, 15 + y, p.sky[1]);

  // Clouds: unions of ellipses with a shaded underside.
  const clouds = [
    { x: 118, y: 30, parts: [[0, 0, 9, 4], [8, -3, 7, 5], [16, 0, 8, 4]] },
    { x: 60, y: 14, parts: [[0, 0, 7, 3], [6, -2, 6, 4], [13, 0, 6, 3]] },
    { x: 170, y: 44, parts: [[0, 0, 6, 3], [6, -2, 6, 3], [12, 0, 5, 3]] },
    { x: 20, y: 48, parts: [[0, 0, 6, 2], [6, -2, 5, 3], [11, 0, 5, 2]] },
  ];
  for (const c of clouds) {
    for (let y = c.y - 8; y <= c.y + 6; y++)
      for (let x = c.x - 10; x <= c.x + 30; x++) {
        const inside = c.parts.some(([ox, oy, rx, ry]) => ((x - c.x - ox) / rx) ** 2 + ((y - c.y - oy) / ry) ** 2 <= 1);
        if (inside) px(x, y, y >= c.y + 1 ? p.cloudShade : p.cloud);
      }
  }

  // Far skyline, hazy.
  for (let x = 0; x < W; ) {
    const w = 5 + Math.floor(rng() * 8);
    const h = 10 + Math.floor(rng() * 16);
    rect(x, HORIZON - h, w, h, p.far);
    if (rng() > 0.7) rect(x + Math.floor(w / 2), HORIZON - h - 3, 1, 3, p.far);
    x += w;
  }
  // Near skyline with windows.
  for (let x = -2; x < W; ) {
    const w = 6 + Math.floor(rng() * 9);
    const h = 6 + Math.floor(rng() * 13);
    const top = HORIZON - h;
    rect(x, top, w, h + 4, p.near);
    for (let wy = top + 2; wy < HORIZON; wy += 3)
      for (let wx = x + 1; wx < x + w - 1; wx += 2) px(wx, wy, rng() < (p.stars ? 0.55 : 0.25) ? p.win : p.winOff);
    x += w + (rng() > 0.6 ? 1 : 0);
  }

  // Tree line in front of the city.
  for (let x = 0; x < W; x++) {
    const top = Math.round(74 - (2.5 + 2.2 * Math.sin(x * 0.27) + 1.6 * Math.sin(x * 0.09 + 1.3) + rng() * 1.4));
    for (let y = top; y < DESK; y++) px(x, y, p.tree[1]);
    px(x, top, p.tree[2]);
    if (rng() > 0.5) px(x, top + 1, p.tree[2]);
    for (let k = 0; k < 2; k++) px(x, top + 2 + Math.floor(rng() * (DESK - top - 2)), p.tree[0]);
  }

  // Desk.
  rect(0, DESK, W, H - DESK, p.desk);
  rect(0, DESK, W, 2, p.deskTop);
  for (let y = DESK + 4; y < H; y += 3 + Math.floor(rng() * 2)) {
    let x = Math.floor(rng() * 20);
    while (x < W) {
      const len = 8 + Math.floor(rng() * 24);
      rect(x, y, len, 1, p.deskGrain);
      x += len + 6 + Math.floor(rng() * 20);
    }
  }

  // Laptop mid-interview: the interviewer on screen, a live dot.
  rect(122, 56, 36, 27, "#262a33");
  rect(124, 58, 32, 23, p.screen);
  for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 22) px(140 + x, 67 + y, "#8d5a3b");
  rect(135, 61, 11, 3, "#1e1e24");
  rect(134, 63, 2, 3, "#1e1e24");
  rect(145, 63, 2, 3, "#1e1e24");
  px(138, 67, "#1e1e24");
  px(142, 67, "#1e1e24");
  rect(139, 70, 3, 1, "#3a1f1f");
  for (let y = 0; y < 5; y++) for (let x = -9; x <= 9; x++) if ((x / 9) ** 2 + ((y - 4) / 4) ** 2 <= 1) px(140 + x, 76 + y, "#162055");
  rect(152, 59, 2, 2, "#3dd6b8");
  rect(118, 83, 44, 2, "#c9ced6");
  rect(118, 85, 44, 1, "#8f96a3");

  // Mug with steam.
  rect(102, 75, 8, 8, "#e85d75");
  rect(102, 75, 8, 1, "#ff93a6");
  rect(103, 76, 6, 1, "#4a2c1d");
  rect(110, 77, 2, 1, "#e85d75");
  rect(111, 78, 1, 2, "#e85d75");
  rect(110, 80, 2, 1, "#e85d75");
  for (const [x, y] of [[104, 72], [105, 71], [104, 70], [107, 73], [108, 72], [107, 71], [108, 70]]) px(x, y, p.cloudShade);

  // Plant.
  rect(172, 75, 10, 8, "#d9824b");
  rect(171, 74, 12, 2, "#ea9a64");
  const leaves: [number, number, number][] = [[-1, -1, 9], [1, -1, 11], [0.2, -1, 13], [-0.6, -1, 10], [0.7, -1, 8]];
  for (const [dx, dy, len] of leaves)
    for (let i = 0; i < len; i++) px(Math.round(177 + dx * i * 0.6), Math.round(73 + dy * i), i > len - 4 ? p.tree[2] : p.tree[1]);

  // Your resume on the desk, one line highlighted, a pen beside it.
  rect(28, 89, 40, 17, "#f7f6f1");
  rect(28, 105, 40, 1, "#d7d4ca");
  for (const [y, len] of [[92, 22], [95, 30], [98, 26], [101, 18]] as const) rect(32, y, len, 1, "#b9bcc5");
  rect(31, 94, 26, 3, "#ffe45c");
  rect(32, 95, 24, 1, "#7d818c");
  for (let i = 0; i < 16; i++) px(72 + i, 93 + Math.floor(i * 0.45), i < 3 ? "#0e1a66" : "#1f3fd1");
}

export function PixelScene({ position = "62% 50%" }: { position?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const render = () => draw(ctx, document.documentElement.dataset.theme === "dark" ? NIGHT : DAY);
    render();
    // Redraw as a night scene when the theme toggle switches to dark.
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
