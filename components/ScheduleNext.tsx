"use client";

import { useEffect, useState } from "react";
import { FREE_MINUTES } from "@/lib/config";
import { defaultSlotTime, formatMinute } from "@/lib/calendar";
import { AddToCalendar } from "./AddToCalendar";
import { SlotPicker } from "./SlotPicker";

/**
 * Lets people put their next practice on their own calendar: a prefilled Google
 * Calendar event, or an .ics file for Apple Calendar and Outlook. Nothing is
 * stored or emailed.
 */
export function ScheduleNext() {
  const [when, setWhen] = useState<Date | null>(null);
  const [origin, setOrigin] = useState("");
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setWhen(defaultSlotTime());
    setOrigin(window.location.origin);
  }, []);

  return (
    <section aria-labelledby="schedule-title" className="card" style={{ padding: 20 }}>
      <h2 id="schedule-title" style={{ margin: "0 0 6px", fontSize: "1.125rem", fontWeight: 600 }}>
        Plan your next practice
      </h2>
      <p className="subtle" style={{ margin: "0 0 14px" }}>Put it on your calendar so it actually happens.</p>
      {when && (
        <>
          <SlotPicker
            value={when}
            onChange={(d) => {
              setWhen(d);
              setAdded(false);
            }}
          />
          <p style={{ margin: "16px 0 0", fontWeight: 600 }}>
            {when.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}, {formatMinute(when.getHours() * 60 + when.getMinutes())}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            <AddToCalendar size="sm" event={{ start: when, minutes: FREE_MINUTES + 5, url: `${origin}/` }} onAdded={() => setAdded(true)} />
          </div>
        </>
      )}
      {added && (
        <p className="subtle" role="status" style={{ margin: "10px 0 0" }}>
          Added. You&apos;ll need to upload your resume again then, since it isn&apos;t saved.
        </p>
      )}
    </section>
  );
}
