"use client";

import { useEffect, useRef } from "react";
import { dayKey, getPracticedDays } from "@/lib/practice";
import { drawText3x5, textWidth3x5 } from "@/lib/pixelFont";
import { currentTheme, setTheme } from "@/lib/theme";

// A minimal 1-bit pixel-art room, drawn at low resolution and scaled up crisply:
// a desk with a coffee mug, a pendant lamp, a window and a wall calendar for
// this month with the practiced days crossed off. Everything is black or white;
// the only color is the laptop's video call. Dark mode inverts the room.
// Small things to find: the window follows the visitor's clock (a sun by day, a
// moon and stars at night), clicking the lamp turns it off (dark mode), a plant
// grows with the days practiced, the interviewer blinks, and the coffee cools
// unless you click the mug to top it up.
// The room is laid out on a 192 x 108 grid and placed on a larger 240 x 135 canvas
// (offset by OX, OY), so pixels stay fine and there's open wall around it.
const W = 240;
const H = 135;
// The canvas has twice the grid's resolution. The room is drawn in whole grid
// pixels (2 x 2 canvas pixels); only the calendar's month uses single canvas
// pixels, so a 3 x 5 font fits in its small header.
const RES = 2;
const OX = 48;
const OY = 27;
const FLOOR = 96;
const TOP = 70; // desk top

type Px = (x: number, y: number, c: string) => void;

// The interviewer on the video call, 20 x 24 pixels: hair with a highlight,
// ears, brows, eyes, a nose shadow, a smile, a navy blazer over a white collar.
function drawPerson(px: Px, ox: number, oy: number, blink: boolean) {
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
  dot(7, 9, blink ? "l" : "e");
  dot(12, 9, blink ? "l" : "e");
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

type Cal = {
  /** The month, abbreviated ("OCT"), for the calendar's header. */
  month: string;
  /** Weekday of the 1st (0 = Sunday) and the number of days this month. */
  first: number;
  days: number;
  today: number;
  /** Days of the month to cross out, in the order they get drawn. */
  crossed: number[];
  /** How many of `crossed` are drawn so far (they animate in). */
  shown: number;
  /** Whether today's square is lit (it blinks a few times, then stays). */
  todayOn: boolean;
};

/** This month's layout and the days to cross out: the days you practiced, and only those. */
function monthCal(now: Date): Cal {
  const y = now.getFullYear();
  const m = now.getMonth();
  const prefix = dayKey(now).slice(0, 8);
  const practiced = getPracticedDays()
    .filter((d) => d.startsWith(prefix))
    .map((d) => Number(d.slice(8)))
    .filter((d) => d >= 1 && d <= 31)
    .sort((a, b) => a - b);
  const today = now.getDate();
  const month = now.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  return { month, first: new Date(y, m, 1).getDay(), days: new Date(y, m + 1, 0).getDate(), today, crossed: practiced, shown: practiced.length, todayOn: true };
}

type Fx = {
  /** Local hour with minutes as a fraction, which places the sun. */
  hour: number;
  /** Interviewer's eyes closed this frame. */
  blink: boolean;
  /** Steam pixels showing, 3 when hot down to 0 when cold, and which way they lean. */
  steam: number;
  sway: 0 | 1;
  /** Days practiced in this browser, all time. */
  practiced: number;
};

const isNight = (hour: number) => hour < 6 || hour >= 19;
const localHour = (d = new Date()) => d.getHours() + d.getMinutes() / 60;

// Grid areas you can click (the 192 x 108 grid): the lamp and the mug.
const LAMP = { x0: 116, x1: 141, y0: 0, y1: 18 };
const MUG = { x0: 110, x1: 122, y0: 55, y1: 70 };
const inside = (a: typeof LAMP, x: number, y: number) => x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1;

// A crescent moon (5 x 5) and stars, in grid coordinates.
const MOON = [".###.", "##...", "#....", "##...", ".###."];
const STARS = [[150, 13], [156, 20], [159, 12], [168, 22], [151, 36], [158, 42], [168, 33], [175, 39], [178, 31], [155, 31]];
// The sun: a 4 x 4 disc with four short rays.
const SUN = ["...##...", "........", "..####..", "#.####.#", "#.####.#", "..####..", "........", "...##..."];
// Steam rising from the mug, leaning one way then the other.
const STEAM: [number, number][][] = [
  [[114, 59], [115, 58], [116, 57]],
  [[115, 59], [114, 58], [115, 57]],
];

function draw(ctx: CanvasRenderingContext2D, dark: boolean, cal: Cal, fx: Fx) {
  const I = dark ? "#ffffff" : "#000000"; // ink
  const P = dark ? "#000000" : "#ffffff"; // paper
  const px: Px = (x, y, c) => {
    // No bounds check: the room is drawn offset (OX, OY), and the canvas clips anyway.
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


  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  rect(0, 0, W, H, P);

  // Wall: a ceiling line, a baseboard and the floor. No texture, so the room stays quiet.
  const floorY = FLOOR + OY;
  rect(0, 1, W, 1, I);
  rect(0, floorY - 4, W, 1, I);
  rect(0, floorY, W, 1, I);

  // Everything else is laid out on the 192 x 108 grid, shifted toward the lower right.
  ctx.setTransform(RES, 0, 0, RES, OX * RES, OY * RES);
  // Half-size pixels, in half-grid units, for the calendar's text.
  const fine = (x: number, y: number, w: number, h: number, c: string) => rect(x / RES, y / RES, w / RES, h / RES, c);

  // Window: a plain frame with a cross of mullions and a sill. The sky follows the
  // visitor's clock: a sun that crosses the panes from 6 am to 7 pm, then a moon
  // and stars in a black sky (black in both themes, so the night reads as night).
  const night = isNight(fx.hour);
  box(146, 8, 36, 40);
  if (night) {
    for (const [x, y] of [[148, 10], [166, 10], [148, 30], [166, 30]]) rect(x, y, 14, 16, "#000000");
    MOON.forEach((row, y) => [...row].forEach((c, x) => c === "#" && px(172 + x, 12 + y, "#ffffff")));
    for (const [x, y] of STARS) px(x, y, "#ffffff");
  } else {
    // Morning in the left panes, afternoon in the right, never behind the mullion.
    const t = Math.min(1, Math.max(0, (fx.hour - 6) / 13));
    const slot = Math.round(t * 15);
    const sunX = slot < 8 ? 147 + slot : 158 + slot;
    const sunY = Math.round(10 + Math.abs(t - 0.5) * 2 * 12);
    SUN.forEach((row, y) => [...row].forEach((c, x) => c === "#" && px(sunX + x, sunY + y, I)));
  }
  rect(163, 9, 2, 38, I);
  rect(147, 27, 34, 2, I);
  rect(143, 48, 42, 2, I);

  // Pendant lamp. Its bulb is paper-colored, so it reads as on in the light theme
  // and off in the dark one; click it to switch.
  rect(128, 2, 1, 9, I);
  for (let y = 0; y < 6; y++) rect(124 - y, 11 + y, 9 + y * 2, 1, I);
  rect(126, 17, 5, 1, P);

  // A wall calendar on a nail: the month in a solid header (half-size pixels, see
  // RES), then a dot for each day. Days you practiced are crossed out, and only
  // those; today is a solid square. It grows a row for six-week months.
  const cx = 78;
  const cy = 18;
  const rows = Math.ceil((cal.first + cal.days) / 7);
  rect(cx + 15, cy - 2, 2, 2, I);
  box(cx, cy, 32, 9 + rows * 4);
  rect(cx, cy, 32, 5, I);
  rect(cx + 4, cy + 2, 2, 1, P);
  rect(cx + 26, cy + 2, 2, 1, P);
  drawText3x5(cal.month, cx * RES + Math.floor((32 * RES - textWidth3x5(cal.month)) / 2), cy * RES + 3, (x, y) => fine(x, y, 1, 1, P));
  const shown = new Set(cal.crossed.slice(0, cal.shown));
  for (let day = 1; day <= cal.days; day++) {
    const slot = cal.first + day - 1;
    const x = cx + 3 + (slot % 7) * 4;
    const y = cy + 7 + Math.floor(slot / 7) * 4;
    if (shown.has(day)) {
      px(x, y, I);
      px(x + 2, y, I);
      px(x + 1, y + 1, I);
      px(x, y + 2, I);
      px(x + 2, y + 2, I);
    } else if (day === cal.today && cal.todayOn) rect(x, y, 3, 3, I);
    else px(x + 1, y + 1, I);
  }

  // The desk: top, front edge, apron, a leg and a drawer pedestal.
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

  // Mug with steam. The steam sways while the coffee is hot, then thins out from
  // the top as it cools.
  box(112, 62, 7, 8);
  rect(113, 63, 5, 1, I);
  rect(119, 64, 2, 1, I);
  rect(120, 65, 1, 2, I);
  rect(119, 67, 2, 1, I);
  for (const [x, y] of STEAM[fx.sway].slice(0, fx.steam)) px(x, y, I);

  // A potted plant to the right of the laptop: a sprout at first, then a leaf for
  // each day practiced (up to five), and a flower once you've practiced a week.
  const leaves = Math.min(5, fx.practiced);
  const stemTop = 61 - 2 * leaves;
  rect(175, 63, 8, 2, I);
  box(176, 64, 6, 6);
  rect(178, stemTop, 1, 63 - stemTop, I);
  px(177, 61, I);
  px(176, 60, I);
  px(179, 61, I);
  px(180, 60, I);
  for (let i = 1; i <= leaves; i++) {
    const y = 61 - 2 * i;
    const side = i % 2 ? -1 : 1;
    px(178 + side, y, I);
    px(178 + 2 * side, y - 1, I);
  }
  if (fx.practiced >= 7) {
    px(178, stemTop - 3, I);
    px(177, stemTop - 2, I);
    px(179, stemTop - 2, I);
    px(178, stemTop - 1, I);
  }

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
  drawPerson(px, sx + 12, sy + 5, fx.blink);
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
    const cal = monthCal(new Date());
    const fx: Fx = { hour: localHour(), blink: false, steam: 3, sway: 0, practiced: getPracticedDays().length };
    const render = () => draw(ctx, currentTheme() === "dark", cal, fx);
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Hot coffee for 30 seconds, then one steam pixel fades every 2.5 seconds.
    let hotUntil = Date.now() + 30_000;
    if (!reduced) {
      // The calendar's X's are drawn in one at a time, then today's square blinks
      // three times and stays. Reduced motion gets the finished calendar.
      const step = Math.min(90, 900 / Math.max(1, cal.crossed.length));
      cal.shown = 0;
      cal.todayOn = false;
      for (let i = 1; i <= cal.crossed.length; i++) later(() => ((cal.shown = i), render()), 400 + i * step);
      const end = 400 + cal.crossed.length * step;
      for (let i = 1; i <= 6; i++) later(() => ((cal.todayOn = i % 2 === 1), render()), end + i * 260);
      later(() => ((cal.todayOn = true), render()), end + 7 * 260);

      // The interviewer blinks every 2.5 to 6 seconds.
      const blink = () => {
        fx.blink = true;
        render();
        later(() => ((fx.blink = false), render()), 140);
        later(blink, 2500 + Math.random() * 3500);
      };
      later(blink, 2000);

      timers.push(
        window.setInterval(() => {
          const over = Date.now() - hotUntil;
          const steam = over < 0 ? 3 : Math.max(0, 3 - Math.ceil(over / 2500));
          if (steam === 0 && fx.steam === 0) return;
          fx.steam = steam;
          fx.sway = fx.sway ? 0 : 1;
          render();
        }, 700),
      );
    }
    // The sky moves with the clock.
    timers.push(window.setInterval(() => ((fx.hour = localHour()), render()), 60_000));
    render();

    // Clicks land on the 192 x 108 grid: undo the canvas's object-fit: cover and
    // object-position, then the room's offset.
    const [posX, posY] = position.split(/\s+/).map((v) => parseFloat(v) / 100);
    const toGrid = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      const scale = Math.max(r.width / W, r.height / H);
      const x = (e.clientX - r.left - (r.width - W * scale) * (posX ?? 0.5)) / scale - OX;
      const y = (e.clientY - r.top - (r.height - H * scale) * (posY ?? 0.5)) / scale - OY;
      return [x, y] as const;
    };
    const onClick = (e: MouseEvent) => {
      const [x, y] = toGrid(e);
      if (inside(LAMP, x, y)) setTheme(currentTheme() === "dark" ? "light" : "dark");
      else if (inside(MUG, x, y)) {
        hotUntil = Date.now() + 30_000;
        fx.steam = 3;
        render();
      }
    };
    const onMove = (e: MouseEvent) => {
      const [x, y] = toGrid(e);
      canvas.style.cursor = inside(LAMP, x, y) || inside(MUG, x, y) ? "pointer" : "";
    };
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("mousemove", onMove);

    // Redraw inverted when the theme switches.
    const mo = new MutationObserver(render);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mo.disconnect();
      timers.forEach((t) => (clearTimeout(t), clearInterval(t)));
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("mousemove", onMove);
    };
  }, [position]);

  return (
    <canvas
      ref={ref}
      width={W * RES}
      height={H * RES}
      aria-hidden
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: position, imageRendering: "pixelated" }}
    />
  );
}
