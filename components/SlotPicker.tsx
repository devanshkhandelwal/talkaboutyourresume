"use client";

import { useState } from "react";
import {
  PERIODS,
  dayMinutes,
  formatMinute,
  pickableDays,
  periodOf,
  slotDate,
  slotTaken,
  startOfDay,
  type Period,
} from "@/lib/calendar";
import "./slot-picker.css";

const PERIOD_LABEL: Record<Period, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };

/**
 * Pick a day, then a start time in 15-minute steps. Controlled: `value` is the
 * chosen start (or null) and `onChange` gets the new one.
 */
export function SlotPicker({ value, onChange }: { value: Date | null; onChange: (d: Date) => void }) {
  const now = new Date();
  const days = pickableDays(now);
  const dayIndex = Math.max(0, value ? days.findIndex((d) => d.getTime() === startOfDay(value).getTime()) : 0);
  const day = days[dayIndex];
  const minute = value ? value.getHours() * 60 + value.getMinutes() : null;
  const [period, setPeriod] = useState<Period>(() => (minute != null ? periodOf(minute) : "morning"));

  const minutes = dayMinutes();
  const open = (p: Period) => minutes.some((m) => periodOf(m) === p && !slotTaken(day, m, now));

  function pickDay(i: number) {
    const d = days[i];
    // Keep the same time of day on the new day when it's still free.
    const keep = minute != null && !slotTaken(d, minute, now) ? minute : minutes.find((m) => periodOf(m) === period && !slotTaken(d, m, now));
    const first = keep ?? minutes.find((m) => !slotTaken(d, m, now));
    if (first == null) return;
    setPeriod(periodOf(first));
    onChange(slotDate(d, first));
  }

  return (
    <div className="slotpicker">
      <div className="sp-days" role="group" aria-label="Day">
        {days.map((d, i) => (
          <button key={d.getTime()} type="button" className="sp-day" aria-pressed={i === dayIndex} disabled={!minutes.some((m) => !slotTaken(d, m, now))} onClick={() => pickDay(i)}>
            {i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "short" })}
            <small>{d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small>
          </button>
        ))}
      </div>
      <div className="sp-periods" role="group" aria-label="Time of day">
        {PERIODS.map((p) => (
          <button key={p} type="button" className="sp-period" aria-pressed={period === p} disabled={!open(p)} onClick={() => setPeriod(p)}>
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>
      <div className="sp-slots" role="group" aria-label="Start time, every 15 minutes">
        {minutes
          .filter((m) => periodOf(m) === period)
          .map((m) => (
            <button key={m} type="button" className="sp-slot" aria-pressed={m === minute} disabled={slotTaken(day, m, now)} onClick={() => onChange(slotDate(day, m))}>
              {formatMinute(m)}
            </button>
          ))}
      </div>
    </div>
  );
}
