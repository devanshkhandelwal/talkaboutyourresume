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

/** Value for <input type="datetime-local">, in local time: tomorrow at the next whole hour. */
export function defaultPracticeTime(now = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return toLocalInput(d);
}

export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
