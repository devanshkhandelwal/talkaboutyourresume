import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { timingSafeEqual } from "node:crypto";
import { SiteHeader } from "@/components/Chrome";
import { INTERVIEWERS } from "@/lib/interviewers";
import { EVENTS, STATS_TIME_ZONE, readEvents, readUploads, redisEnabled, type UploadRecord } from "@/lib/limits";

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
  account_created: "Accounts created",
  account_deleted: "Accounts deleted",
  interview_saved: "Interviews saved to a profile",
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

  const [days, uploads] = await Promise.all([readEvents(30), readUploads()]);
  const week = days.slice(0, 7);
  const today = days.slice(0, 1);
  const daily = [...days].reverse();
  const peak = Math.max(1, ...daily.map((d) => d.counts.interview_started ?? 0));

  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ maxWidth: "calc(1080px + 2 * var(--gutter))", paddingTop: 24, paddingBottom: 96 }}>
        <h1 className="display h2">Stats</h1>
        <p className="muted" style={{ margin: "8px 0 32px" }}>Anonymous counts, by day in Eastern Time. Page views and visitors are in Vercel Analytics.</p>

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
          <Uploads uploads={uploads} />
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

const OUTCOME: Record<UploadRecord["outcome"], string> = {
  read: "Read",
  unreadable: "No text (scanned?)",
  no_topics: "Nothing to ask about",
  too_big: "Over 5 MB",
  error: "Error",
};

const SIZE_BUCKETS = [
  { label: "Under 100 KB", max: 100 * 1024 },
  { label: "100 to 500 KB", max: 500 * 1024 },
  { label: "500 KB to 1 MB", max: 1024 * 1024 },
  { label: "1 to 5 MB", max: 5 * 1024 * 1024 },
  { label: "Over 5 MB", max: Infinity },
];

function kb(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function median(nums: number[]) {
  const a = [...nums].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length === 0 ? 0 : a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Recent resume uploads: file type, size and outcome only. */
function Uploads({ uploads }: { uploads: UploadRecord[] }) {
  const cell: React.CSSProperties = { padding: "8px 0", borderBottom: "1px solid var(--line)", textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const types = (["pdf", "docx", "other"] as const)
    .map((t) => {
      const of = uploads.filter((u) => u.type === t);
      return { t, n: of.length, read: of.filter((u) => u.outcome === "read").length, median: median(of.map((u) => u.bytes)) };
    })
    .filter((r) => r.n > 0);
  return (
    <section aria-labelledby="uploads-title" className="card" style={{ padding: 24 }}>
      <h2 id="uploads-title" style={{ margin: "0 0 4px", fontSize: "1.125rem", fontWeight: 600 }}>Resume files</h2>
      <p className="subtle" style={{ margin: "0 0 12px" }}>Last {uploads.length} uploads. Type and size only, never the name or content.</p>
      {uploads.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>No uploads recorded yet.</p>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
            <thead>
              <tr>
                <th style={{ ...cell, textAlign: "left", fontWeight: 600 }}>Type</th>
                <th style={{ ...cell, fontWeight: 600 }}>Uploads</th>
                <th style={{ ...cell, fontWeight: 600 }}>Read OK</th>
                <th style={{ ...cell, fontWeight: 600 }}>Median size</th>
              </tr>
            </thead>
            <tbody>
              {types.map((r) => (
                <tr key={r.t}>
                  <td style={{ ...cell, textAlign: "left" }}>{r.t.toUpperCase()}</td>
                  <td style={cell}>{r.n}</td>
                  <td style={cell}>{Math.round((r.read / r.n) * 100)}%</td>
                  <td style={cell}>{kb(r.median)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ margin: "20px 0 8px", fontSize: 15, fontWeight: 600 }}>Sizes</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
            <tbody>
              {SIZE_BUCKETS.map((b, i) => {
                const min = i === 0 ? 0 : SIZE_BUCKETS[i - 1].max;
                const n = uploads.filter((u) => u.bytes >= min && u.bytes < b.max).length;
                return (
                  <tr key={b.label}>
                    <td style={{ ...cell, textAlign: "left" }}>{b.label}</td>
                    <td style={cell}>{n}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h3 style={{ margin: "20px 0 8px", fontSize: 15, fontWeight: 600 }}>Latest</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
            <tbody>
              {uploads.slice(0, 10).map((u, i) => (
                <tr key={i}>
                  <td style={{ ...cell, textAlign: "left" }}>{new Date(u.at).toLocaleString("en-US", { timeZone: STATS_TIME_ZONE, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                  <td style={cell}>{u.type.toUpperCase()}</td>
                  <td style={{ ...cell, whiteSpace: "nowrap", paddingLeft: 8 }}>{kb(u.bytes)}</td>
                  <td style={cell}>{OUTCOME[u.outcome] ?? u.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="subtle" style={{ margin: "8px 0 0" }}>Times are Eastern.</p>
        </>
      )}
    </section>
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
