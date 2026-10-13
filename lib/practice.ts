"use client";

// Days you finished an interview, kept in this browser only (localStorage), so
// the feedback page's calendar can cross them off. Nothing is sent anywhere.
const KEY = "tayr.practiced";

/** Local calendar date as YYYY-MM-DD. */
export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getPracticedDays(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const days = raw ? JSON.parse(raw) : [];
    return Array.isArray(days) ? days.filter((d): d is string => typeof d === "string") : [];
  } catch {
    return [];
  }
}

export function recordPractice(d: Date): string[] {
  const days = getPracticedDays();
  const key = dayKey(d);
  if (days.includes(key)) return days;
  const next = [...days, key].slice(-120);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be blocked; the calendar still shows today.
  }
  return next;
}
