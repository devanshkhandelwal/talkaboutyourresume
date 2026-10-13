"use client";

import { useEffect, useState } from "react";
import { FREE_MINUTES } from "@/lib/config";
import { defaultPracticeTime, googleCalendarUrl, icsFile, toLocalInput } from "@/lib/calendar";

/**
 * Lets people put their next practice on their own calendar: a prefilled Google
 * Calendar event, or an .ics file for Apple Calendar and Outlook. Nothing is
 * stored or emailed.
 */
export function ScheduleNext() {
  const [when, setWhen] = useState("");
  const [origin, setOrigin] = useState("");
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setWhen(defaultPracticeTime());
    setOrigin(window.location.origin);
  }, []);

  const start = when ? new Date(when) : null;
  const valid = Boolean(start && !Number.isNaN(start.getTime()) && start.getTime() > Date.now());
  const event = valid && start ? { start, minutes: FREE_MINUTES + 5, url: `${origin}/` } : null;

  function downloadIcs() {
    if (!event) return;
    const url = URL.createObjectURL(icsFile(event));
    const a = document.createElement("a");
    a.href = url;
    a.download = "interview-practice.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setAdded(true);
  }

  return (
    <section aria-labelledby="schedule-title" className="card" style={{ padding: 20 }}>
      <h2 id="schedule-title" style={{ margin: "0 0 6px", fontSize: "1.125rem", fontWeight: 600 }}>
        Plan your next practice
      </h2>
      <p className="subtle" style={{ margin: "0 0 14px" }}>Put it on your calendar so it actually happens.</p>
      <label htmlFor="practice-when" style={{ display: "block", fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
        When
      </label>
      <input
        id="practice-when"
        type="datetime-local"
        className="input"
        value={when}
        min={toLocalInput(new Date())}
        onChange={(e) => {
          setWhen(e.target.value);
          setAdded(false);
        }}
      />
      {when && !valid && (
        <p className="subtle" role="alert" style={{ margin: "6px 0 0" }}>
          Pick a time in the future.
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
        {event ? (
          <a className="btn btn-light btn-sm" href={googleCalendarUrl(event)} target="_blank" rel="noopener" onClick={() => setAdded(true)}>
            Add to Google Calendar
          </a>
        ) : (
          <button type="button" className="btn btn-light btn-sm" disabled>
            Add to Google Calendar
          </button>
        )}
        <button type="button" className="btn btn-light btn-sm" onClick={downloadIcs} disabled={!event}>
          Apple or Outlook (.ics)
        </button>
      </div>
      {added && (
        <p className="subtle" role="status" style={{ margin: "10px 0 0" }}>
          Added. You&apos;ll need to upload your resume again then, since it isn&apos;t saved.
        </p>
      )}
    </section>
  );
}
