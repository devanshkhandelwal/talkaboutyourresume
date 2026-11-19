// Calendar invites for the next practice session, built in the browser. Nothing is
// stored or emailed: people add the event to their own calendar.

export type PracticeEvent = { start: Date; minutes: number; url: string };

const TITLE = "Interview practice (talkaboutyourresume)";

function description(url: string) {
  return `Practice talking about your resume, out loud. Open ${url} and upload your resume to start (it isn't saved between visits). Headphones help.`;
}

/** 20261014T170000Z */
function utcStamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function end(e: PracticeEvent) {
  return new Date(e.start.getTime() + e.minutes * 60_000);
}

/** Opens a prefilled event in Google Calendar. */
export function googleCalendarUrl(e: PracticeEvent): string {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: TITLE,
    dates: `${utcStamp(e.start)}/${utcStamp(end(e))}`,
    details: description(e.url),
    location: e.url,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

// iCalendar text values escape backslashes, commas, semicolons and newlines.
function icsText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
}

// Lines over 75 characters are folded onto continuation lines that start with a space.
function fold(line: string) {
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += i === 0 ? 75 : 74) parts.push(line.slice(i, i + (i === 0 ? 75 : 74)));
  return parts.join("\r\n ");
}

/** An .ics file that Apple Calendar, Outlook and others open, with a reminder 10 minutes before. */
export function icsFile(e: PracticeEvent): Blob {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//talkaboutyourresume//practice//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${utcStamp(e.start)}-${Math.random().toString(36).slice(2)}@talkaboutyourresume`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(e.start)}`,
    `DTEND:${utcStamp(end(e))}`,
    `SUMMARY:${icsText(TITLE)}`,
    `DESCRIPTION:${icsText(description(e.url))}`,
    `URL:${e.url}`,
    `LOCATION:${icsText(e.url)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Interview practice in 10 minutes",
    "TRIGGER:-PT10M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return new Blob([lines.map(fold).join("\r\n") + "\r\n"], { type: "text/calendar;charset=utf-8" });
}

// --- Picking a time: whole days, start times every 15 minutes -------------------

export const SLOT_STEP = 15;
/** First and last start time of a day, in minutes after midnight (6:00 AM to 10:45 PM). */
export const DAY_FIRST = 6 * 60;
export const DAY_LAST = 22 * 60 + 45;
export const PICKABLE_DAYS = 7;

export type Period = "morning" | "afternoon" | "evening";
export const PERIODS: Period[] = ["morning", "afternoon", "evening"];

export function periodOf(minute: number): Period {
  return minute < 12 * 60 ? "morning" : minute < 17 * 60 ? "afternoon" : "evening";
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Today and the next six days, at local midnight. */
export function pickableDays(now = new Date()): Date[] {
  return Array.from({ length: PICKABLE_DAYS }, (_, i) => {
    const d = startOfDay(now);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/** Every start time of a day, in minutes after midnight. */
export function dayMinutes(): number[] {
  const out: number[] = [];
  for (let m = DAY_FIRST; m <= DAY_LAST; m += SLOT_STEP) out.push(m);
  return out;
}

/** The moment a start time on a day happens, in local time. */
export function slotDate(day: Date, minute: number): Date {
  const d = new Date(day);
  d.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return d;
}

/** Times that have passed, or start within the next 15 minutes, can't be picked. */
export function slotTaken(day: Date, minute: number, now = new Date()): boolean {
  return slotDate(day, minute).getTime() <= now.getTime() + SLOT_STEP * 60_000;
}

/** "9:15 AM" */
export function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** The first start time at least an hour away, or 9:00 AM tomorrow if today has none left. */
export function defaultSlotTime(now = new Date()): Date {
  const ahead = new Date(now.getTime() + 60 * 60_000);
  const minute = Math.ceil((ahead.getHours() * 60 + ahead.getMinutes()) / SLOT_STEP) * SLOT_STEP;
  const today = startOfDay(now);
  if (ahead.toDateString() === now.toDateString() && minute >= DAY_FIRST && minute <= DAY_LAST) return slotDate(today, minute);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return slotDate(tomorrow, 9 * 60);
}
