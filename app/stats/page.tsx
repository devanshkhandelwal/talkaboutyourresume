import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { SiteHeader } from "@/components/Chrome";
import { INTERVIEWERS } from "@/lib/interviewers";
import { EVENTS, readEvents, redisEnabled } from "@/lib/limits";

// Private usage numbers: /stats?key=<STATS_KEY>. Anything else is a 404, and
// the page is a 404 everywhere until STATS_KEY is set.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Stats", robots: { index: false, follow: false } };

const LABELS: Record<(typeof EVENTS)[number], string> = {
  resume_read: "Resumes read",
  resume_failed: "Resumes that failed",
  interview_started: "Interviews started",
  retry_started: "Retries started",
  custom_questions_used: "Interviews with own questions",
  interview_ended: "Interviews ended",
  feedback_generated: "Feedback generated",
  feedback_failed: "Feedback that failed",
  waitlist_signup: "Waitlist signups",
};

// The path from upload to feedback, in order.
const FUNNEL = ["resume_read", "interview_started", "interview_ended", "feedback_generated"] as const;

function allowed(given: string | undefined) {
  const want = process.env.STATS_KEY;
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sum(days: { counts: Record<string, number> }[], event: string) {
  return days.reduce((n, d) => n + (d.counts[event] ?? 0), 0);
}

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  if (!allowed(key)) notFound();

  if (!redisEnabled) {
    return (
      <>
        <SiteHeader />
        <main className="wrap" style={{ paddingTop: 24, paddingBottom: 96 }}>
          <h1 className="display h2">Stats</h1>
          <p className="muted">Upstash isn&apos;t connected, so nothing is being counted.</p>
        </main>
      </>
    );
  }

  const days = await readEvents(30);
  const week = days.slice(0, 7);
  const today = days.slice(0, 1);
  const daily = [...days].reverse();
  const peak = Math.max(1, ...daily.map((d) => d.counts.interview_started ?? 0));

  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ maxWidth: "calc(1080px + 2 * var(--gutter))", paddingTop: 24, paddingBottom: 96 }}>
        <h1 className="display h2">Stats</h1>
        <p className="muted" style={{ margin: "8px 0 32px" }}>Anonymous counts, by UTC day. Page views and visitors are in Vercel Analytics.</p>

        <section aria-labelledby="funnel-title" className="card" style={{ padding: 24 }}>
          <h2 id="funnel-title" style={{ margin: "0 0 16px", fontSize: "1.125rem", fontWeight: 600 }}>Last 7 days, upload to feedback</h2>
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            {FUNNEL.map((e, i) => {
              const n = sum(week, e);
              const prev = i > 0 ? sum(week, FUNNEL[i - 1]) : 0;
              return (
                <li key={e} style={{ padding: 16, border: "2px solid var(--ink)", borderRadius: 8 }}>
                  <p style={{ margin: 0, fontSize: "2.25rem", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1 }}>{n}</p>
                  <p style={{ margin: "6px 0 0", fontWeight: 600 }}>{LABELS[e]}</p>
                  <p className="subtle" style={{ margin: "2px 0 0" }}>{i === 0 ? "Start of the funnel" : prev ? `${Math.round((n / prev) * 100)}% of the step before` : "No previous step yet"}</p>
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-labelledby="daily-title" className="card" style={{ marginTop: 20, padding: 24 }}>
          <h2 id="daily-title" style={{ margin: "0 0 16px", fontSize: "1.125rem", fontWeight: 600 }}>Interviews started per day, last 30 days</h2>
          <div role="img" aria-label="Interviews started per day" style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120 }}>
            {daily.map((d) => {
              const n = d.counts.interview_started ?? 0;
              return <span key={d.day} title={`${d.day}: ${n}`} style={{ flex: "1 1 0", height: `${Math.max(2, (n / peak) * 100)}%`, background: n ? "var(--ink)" : "var(--line)", opacity: n ? 1 : 0.15 }} />;
            })}
          </div>
          <p className="subtle" style={{ margin: "8px 0 0", display: "flex", justifyContent: "space-between" }}>
            <span>{daily[0].day}</span>
            <span>{sum(days, "interview_started")} in 30 days</span>
            <span>{daily[daily.length - 1].day}</span>
          </p>
        </section>

        <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, alignItems: "start" }}>
          <section aria-labelledby="all-title" className="card" style={{ padding: 24 }}>
            <h2 id="all-title" style={{ margin: "0 0 12px", fontSize: "1.125rem", fontWeight: 600 }}>Every event</h2>
            <StatTable first="Event" rows={EVENTS.map((e) => ({ label: LABELS[e], today: sum(today, e), week: sum(week, e), month: sum(days, e) }))} />
          </section>
          <section aria-labelledby="who-title" className="card" style={{ padding: 24 }}>
            <h2 id="who-title" style={{ margin: "0 0 12px", fontSize: "1.125rem", fontWeight: 600 }}>Interviewers picked</h2>
            <StatTable
              first="Interviewer"
              rows={INTERVIEWERS.map((i) => ({ label: i.name, today: sum(today, `interviewer:${i.id}`), week: sum(week, `interviewer:${i.id}`), month: sum(days, `interviewer:${i.id}`) })).sort((a, b) => b.month - a.month)}
            />
          </section>
        </div>
      </main>
    </>
  );
}

function StatTable({ first, rows }: { first: string; rows: { label: string; today: number; week: number; month: number }[] }) {
  const cell: React.CSSProperties = { padding: "8px 0", borderBottom: "1px solid var(--line)", textAlign: "right", fontVariantNumeric: "tabular-nums" };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
      <thead>
        <tr>
          <th style={{ ...cell, textAlign: "left", fontWeight: 600 }}>{first}</th>
          <th style={{ ...cell, fontWeight: 600 }}>Today</th>
          <th style={{ ...cell, fontWeight: 600 }}>7 days</th>
          <th style={{ ...cell, fontWeight: 600 }}>30 days</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td style={{ ...cell, textAlign: "left" }}>{r.label}</td>
            <td style={cell}>{r.today}</td>
            <td style={cell}>{r.week}</td>
            <td style={cell}>{r.month}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
