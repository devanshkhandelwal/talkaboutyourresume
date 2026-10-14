import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { SiteFooter, SiteHeader } from "@/components/Chrome";
import { Avatar } from "@/components/Avatar";
import { DeleteHistory, ProfileSignIn } from "@/components/ProfileActions";
import { getInterviewer } from "@/lib/interviewers";
import { dbEnabled, listInterviews, type SavedInterview } from "@/lib/db";
import { authEnabled } from "@/lib/authConfig";

// Your account and every interview you've saved, newest first. Signed-out
// visitors get a sign-in prompt instead.
export const dynamic = "force-dynamic";

const CHIP = { strong: "chip-good", needs_detail: "chip-detail", vague: "chip-vague" } as const;
const LABEL = { strong: "Strong", needs_detail: "Needs detail", vague: "Vague" } as const;

function pct(strong: number, total: number) {
  return total ? Math.round((strong / total) * 100) : 0;
}

function when(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function minutes(sec: number) {
  const m = Math.max(1, Math.round(sec / 60));
  return `${m} min`;
}

export default async function ProfilePage() {
  if (!authEnabled) {
    return (
      <>
        <SiteHeader />
        <main className="wrap" style={{ paddingTop: 24, paddingBottom: 96 }}>
          <h1 className="display h2">Your profile</h1>
          <p className="muted">Accounts aren&apos;t set up on this copy of the app.</p>
        </main>
      </>
    );
  }
  const { userId } = await auth();

  if (!userId) {
    return (
      <>
        <SiteHeader />
        <main className="wrap" style={{ maxWidth: "calc(760px + 2 * var(--gutter))", paddingTop: 24, paddingBottom: 96 }}>
          <h1 className="display h2">Your profile</h1>
          <p className="muted" style={{ margin: "12px 0 24px", fontSize: "1.125rem" }}>
            Sign in with Google to save each interview&apos;s score and feedback, and see how your answers improve over time. Practicing without an account still works.
          </p>
          <ProfileSignIn />
        </main>
        <SiteFooter />
      </>
    );
  }

  const user = await currentUser();
  let interviews: SavedInterview[] = [];
  let loadError = false;
  if (dbEnabled) {
    try {
      interviews = await listInterviews(userId);
    } catch (err) {
      console.error("[profile] list", err);
      loadError = true;
    }
  }

  const name = user?.firstName || user?.fullName || user?.primaryEmailAddress?.emailAddress || "You";
  const answers = interviews.reduce((n, i) => n + i.answerCount, 0);
  const strong = interviews.reduce((n, i) => n + i.strongCount, 0);
  // Oldest to newest, for the progress chart.
  const series = [...interviews].reverse().map((i) => pct(i.strongCount, i.answerCount));
  const recent = interviews.slice(0, 3);
  const earlier = interviews.slice(3, 6);
  const trend = recent.length && earlier.length ? pct(sum(recent, "strongCount"), sum(recent, "answerCount")) - pct(sum(earlier, "strongCount"), sum(earlier, "answerCount")) : null;

  return (
    <>
      <SiteHeader />
      <main className="wrap with-aside" style={{ maxWidth: "calc(1160px + 2 * var(--gutter))", paddingTop: 24, paddingBottom: 96 }}>
        <div style={{ minWidth: 0, maxWidth: 760 }}>
          <h1 className="display h2">{interviews.length ? "Your interviews" : `Welcome, ${name}`}</h1>
          <p className="muted" style={{ margin: "8px 0 28px", fontSize: "1.125rem" }}>
            {interviews.length
              ? "Every interview you've saved, newest first. Open one to see its feedback."
              : "Finish an interview while signed in and it'll show up here, with its score and feedback."}
          </p>

          {loadError && (
            <p className="error" role="alert">
              Couldn&apos;t load your interviews. Refresh to try again.
            </p>
          )}

          {interviews.length === 0 && !loadError ? (
            <Link href="/setup" className="btn btn-dark">
              Start an interview
            </Link>
          ) : (
            <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 14 }}>
              {interviews.map((i) => (
                <InterviewItem key={i.id} interview={i} />
              ))}
            </ol>
          )}
        </div>

        <aside aria-label="Your account" className="aside-sticky">
          <section className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {user?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.imageUrl} alt="" width={52} height={52} style={{ borderRadius: "50%", border: "2px solid var(--ink)" }} />
              ) : null}
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: "1.125rem", overflowWrap: "anywhere" }}>{user?.fullName || name}</p>
                {user?.primaryEmailAddress && (
                  <p className="subtle" style={{ margin: 0, overflowWrap: "anywhere" }}>
                    {user.primaryEmailAddress.emailAddress}
                  </p>
                )}
              </div>
            </div>
            <dl className="preview-list" style={{ marginBottom: 0 }}>
              <div>
                <dt>Interviews saved</dt>
                <dd>{interviews.length}</dd>
              </div>
              <div>
                <dt>Specific answers</dt>
                <dd>{answers ? `${pct(strong, answers)}% (${strong} of ${answers})` : "None yet"}</dd>
              </div>
              {user?.createdAt && (
                <div>
                  <dt>Member since</dt>
                  <dd>{when(new Date(user.createdAt).toISOString())}</dd>
                </div>
              )}
            </dl>
          </section>

          {series.length >= 2 && (
            <section aria-labelledby="progress-title" className="card" style={{ padding: 20 }}>
              <h2 id="progress-title" style={{ margin: "0 0 4px", fontSize: "1.125rem", fontWeight: 600 }}>
                Progress
              </h2>
              <p className="subtle" style={{ margin: "0 0 12px" }}>
                Share of specific answers in each interview, oldest to newest.
                {trend !== null && ` Your last 3 are ${trend === 0 ? "level with" : `${Math.abs(trend)} points ${trend > 0 ? "above" : "below"}`} the 3 before.`}
              </p>
              <ProgressChart values={series} />
            </section>
          )}

          <section className="card" style={{ padding: 20 }}>
            <Link href="/setup" className="btn btn-dark btn-sm" style={{ width: "100%" }}>
              Practice again
            </Link>
            {interviews.length > 0 && <DeleteHistory count={interviews.length} />}
            <p className="subtle" style={{ margin: "12px 0 0" }}>
              Saved: scores, verdicts, tips and summaries. Not saved: transcripts, your resume or audio. Deleting your account deletes all of it.
            </p>
          </section>
        </aside>
      </main>
      <SiteFooter />
    </>
  );
}

function sum(list: SavedInterview[], key: "strongCount" | "answerCount") {
  return list.reduce((n, i) => n + i[key], 0);
}

function InterviewItem({ interview: i }: { interview: SavedInterview }) {
  const interviewer = getInterviewer(i.interviewerId);
  return (
    <li className="card" style={{ padding: 0, overflow: "hidden" }}>
      <details>
        <summary style={{ listStyle: "none", cursor: "pointer", padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
          <Avatar character={interviewer.id} size={44} decorative />
          <span style={{ flex: "1 1 auto", minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 600 }}>
              {interviewer.name}
              {i.isRetry && <span className="chip chip-vague" style={{ marginLeft: 8, verticalAlign: "middle" }}>Retry</span>}
            </span>
            <span className="subtle">
              {when(i.startedAt)} · {minutes(i.durationSec)}
            </span>
          </span>
          <span style={{ flex: "0 0 auto", textAlign: "right" }}>
            <span style={{ display: "block", fontWeight: 600, fontSize: "1.25rem" }}>
              {i.strongCount}/{i.answerCount}
            </span>
            <span className="subtle">specific</span>
          </span>
          <span aria-hidden style={{ display: "flex", gap: 3 }}>
            {i.answers.map((a, n) => (
              <span key={n} className={`chip ${CHIP[a.verdict]}`} style={{ width: 10, height: 18, padding: 0, borderRadius: 2 }} />
            ))}
          </span>
        </summary>
        <div style={{ padding: "0 18px 18px", borderTop: "2px solid var(--ink)" }}>
          {i.summary && <p style={{ margin: "14px 0 0" }}>{i.summary}</p>}
          {i.bestMoment && (
            <p style={{ margin: "12px 0 0", padding: "10px 12px", borderRadius: 8, border: "2px solid var(--ink)", background: "var(--hl)", color: "#000" }}>
              <strong>Best moment:</strong> &ldquo;{i.bestMoment.quote}&rdquo;
            </p>
          )}
          <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none" }}>
            {i.answers.map((a, n) => (
              <li key={n} style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontWeight: 600 }}>{a.title}</span>
                  <span className={`chip ${CHIP[a.verdict]}`}>{LABEL[a.verdict]}</span>
                </div>
                {a.question && <p className="subtle" style={{ margin: "4px 0 0" }}>&ldquo;{a.question}&rdquo;</p>}
                <p className="muted" style={{ margin: "6px 0 0" }}>{a.tip}</p>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </li>
  );
}

/** Specific-answer share per interview, as a 1-bit step line with square points. */
function ProgressChart({ values }: { values: number[] }) {
  const W = 280;
  const H = 110;
  const pad = 8;
  const x = (n: number) => pad + (values.length === 1 ? 0 : (n * (W - pad * 2)) / (values.length - 1));
  const y = (v: number) => H - pad - (v / 100) * (H - pad * 2);
  const points = values.map((v, n) => `${x(n)},${y(v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" role="img" aria-label={`Specific answers per interview: ${values.map((v) => `${v}%`).join(", ")}`}>
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={pad} x2={W - pad} y1={y(g)} y2={y(g)} stroke="var(--ink)" strokeOpacity={g === 0 ? 1 : 0.15} strokeWidth={g === 0 ? 2 : 1} />
          <text x={W - pad} y={y(g) - 3} textAnchor="end" fontSize="10" fill="var(--ink-3)">
            {g}%
          </text>
        </g>
      ))}
      <polyline points={points} fill="none" stroke="var(--ink)" strokeWidth={2} />
      {values.map((v, n) => (
        <rect key={n} x={x(n) - 4} y={y(v) - 4} width={8} height={8} fill="var(--card)" stroke="var(--ink)" strokeWidth={2} />
      ))}
      <text x={pad} y={H + 14} fontSize="10" fill="var(--ink-3)">
        First
      </text>
      <text x={W - pad} y={H + 14} fontSize="10" fill="var(--ink-3)" textAnchor="end">
        Latest
      </text>
    </svg>
  );
}
