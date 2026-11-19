"use client";

import { googleCalendarUrl, icsFile, type PracticeEvent } from "@/lib/calendar";

/** Two ways to put a practice on a calendar: Google Calendar, or an .ics file for Apple and Outlook. */
export function AddToCalendar({ event, onAdded, size = "lg" }: { event: PracticeEvent; onAdded: () => void; size?: "lg" | "sm" }) {
  const cls = size === "sm" ? "btn btn-light btn-sm" : "btn";

  function downloadIcs() {
    const url = URL.createObjectURL(icsFile(event));
    const a = document.createElement("a");
    a.href = url;
    a.download = "interview-practice.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onAdded();
  }

  return (
    <>
      <a className={`${cls} ${size === "lg" ? "btn-dark" : ""}`} href={googleCalendarUrl(event)} target="_blank" rel="noopener" onClick={onAdded}>
        Add to Google Calendar
      </a>
      <button type="button" className={cls} onClick={downloadIcs}>
        Apple or Outlook (.ics)
      </button>
    </>
  );
}
