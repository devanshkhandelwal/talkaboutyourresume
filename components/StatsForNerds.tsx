import type { ReactNode } from "react";
import { Highlighted } from "@/components/FillerWords";
import type { FillerReport } from "@/lib/fillers";
import type { NerdStats } from "@/lib/nerdStats";
import type { TranscriptLine } from "@/lib/types";

/** Collapsible numbers about the conversation, for people who like numbers. */
export function StatsForNerds({ stats: s, fillers, transcript }: { stats: NerdStats; fillers: FillerReport; transcript: TranscriptLine[] }) {
  const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
  const { byWord, worst, matches } = fillers;
  const fillerDetail =
    s.fillers === 0 ? (
      "none in your answers"
    ) : (
      <>
        <span style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "6px 0 0" }}>
          {byWord.map((w) => (
            <span key={w.label} className="chip chip-neutral">
              &ldquo;{w.label}&rdquo; × {w.count}
            </span>
          ))}
        </span>
        {worst && (
          <span style={{ display: "block", marginTop: 10 }}>
            Most in one answer: {worst.count}
            {worst.question && <span style={{ display: "block" }}>Asked: {worst.question}</span>}
            <span className="muted" style={{ display: "block", marginTop: 4 }}>
              {worst.lines.map((i, n) => (
                <span key={i}>
                  {n > 0 && " "}
                  <Highlighted text={transcript[i]?.content ?? ""} matches={matches[i]} />
                </span>
              ))}
            </span>
          </span>
        )}
      </>
    );
  const groups: { title: string; rows: [string, string, ReactNode?][] }[] = [
    {
      title: "You",
      rows: [
        ["Speaking pace", `${s.wordsPerMinute} words/min`, s.wpmMeasured ? "measured, pauses included; roughly 130–160 is an easy pace to follow" : "estimated (speaking time wasn't recorded)"],
        ["Talk time", s.yourTalkSec === null ? `${s.yourWords} words` : `${mmss(s.yourTalkSec)} (${s.yourWords} words)`],
        ["Share of the talking", `${s.yourShare}%`, "you vs the interviewer; candidates usually do most of the talking"],
        ["Answers", `${s.answers}, ${s.avgAnswerWords} words${s.avgAnswerSec === null ? "" : ` / ${s.avgAnswerSec} s`} on average`],
        ...(s.longestAnswer
          ? ([["Longest answer", `${s.longestAnswer.words} words${s.longestAnswer.sec === null ? "" : ` / ${s.longestAnswer.sec} s`}`, `“${s.longestAnswer.preview}…”`]] as [string, string, ReactNode][])
          : []),
        ["Filler words", `${s.fillers} (${s.fillersPerMinute}/min)`, fillerDetail],
        ["“I” vs “we”", `${s.iCount} : ${s.weCount}`, "who your answers credit"],
        ["Hedges", String(s.hedges), "“I think”, “maybe”, “kind of”…"],
        ["Numbers mentioned", String(s.numbers), "a rough signal of how specific you were"],
      ],
    },
    {
      title: "The interviewer",
      rows: [
        ["Questions asked", String(s.questionsAsked)],
        ["Talk time", s.interviewerTalkSec === null ? `${s.interviewerWords} words` : `${mmss(s.interviewerTalkSec)} (${s.interviewerWords} words)`],
      ],
    },
    {
      title: "The connection",
      rows: [
        ["Call length", mmss(s.durationSec)],
        ...(s.latency
          ? ([
              ["Response time", `${s.latency.median} s median, ${s.latency.p90} s slowest 10%`, `from you finishing to the interviewer's first sound, over ${s.latency.turns} turns`],
              [
                "Where the time goes",
                [s.latency.stt !== null && `speech-to-text ${s.latency.stt} s`, s.latency.llm !== null && `model ${s.latency.llm} s`, s.latency.tts !== null && `voice ${s.latency.tts} s`].filter(Boolean).join(" · ") || "not reported",
                "averages per turn",
              ],
            ] as [string, string, ReactNode][])
          : ([["Response time", "not recorded", "only interviews from now on have it"]] as [string, string, ReactNode][])),
      ],
    },
  ];

  return (
    <details style={{ marginTop: 24 }}>
      <summary style={{ cursor: "pointer", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>Stats for nerds</summary>
      <div className="card" style={{ marginTop: 12, padding: "8px 20px 16px" }}>
        {groups.map((g) => (
          <section key={g.title} aria-label={g.title}>
            <h3 style={{ margin: "14px 0 4px", fontSize: 15, fontWeight: 600 }}>{g.title}</h3>
            <dl style={{ margin: 0 }}>
              {g.rows.map(([label, value, note]) => (
                <div key={label} style={{ display: "grid", gridTemplateColumns: "minmax(0, 11rem) minmax(0, 1fr)", gap: "2px 16px", padding: "7px 0", borderTop: "1px solid var(--line)" }}>
                  <dt className="muted" style={{ fontSize: 15 }}>
                    {label}
                  </dt>
                  <dd style={{ margin: 0, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {value}
                    {note && (
                      <span className="subtle" style={{ display: "block", fontWeight: 400, fontVariantNumeric: "normal" }}>
                        {note}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </details>
  );
}
