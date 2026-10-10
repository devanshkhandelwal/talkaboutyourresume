"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/Chrome";
import { Avatar } from "@/components/Avatar";
import { uploadResume } from "@/components/UploadButton";
import { INTERVIEWERS, getInterviewer } from "@/lib/interviewers";
import { BETA, FREE_MINUTES } from "@/lib/config";
import { store } from "@/lib/store";
import type { ResumeProfile } from "@/lib/types";

const QUICK_ADDS = [
  { label: "+ An answer I ramble on", text: "I tend to ramble when talking about " },
  { label: "+ Company and role", text: "I'm interviewing for a  role at " },
  { label: "+ Paste job description", text: "Job description:\n" },
];

export default function SetupPage() {
  const router = useRouter();
  const replaceId = useId();
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [picked, setPicked] = useState("manager");
  const [note, setNote] = useState("");
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProfile(store.getProfile());
    const s = store.getSetup();
    if (s) {
      setPicked(s.interviewerId);
      setNote(s.focusNote);
    }
    setLoaded(true);
  }, []);

  async function onReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReplacing(true);
    setError(null);
    try {
      const p = await uploadResume(file);
      store.setProfile(p);
      setProfile(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setReplacing(false);
    }
  }

  function start() {
    store.setSetup({ interviewerId: picked, focusNote: note });
    store.setReport(null);
    router.push("/interview");
  }

  if (!loaded) return null;

  if (!profile) {
    return (
      <>
        <SiteHeader />
        <main className="narrow" style={{ paddingTop: 64, paddingBottom: 64 }}>
          <h1 className="display h2">Upload your resume first</h1>
          <p className="muted">We need your resume to know what to ask you about.</p>
          <Link href="/" className="btn btn-dark" style={{ marginTop: 16 }}>
            Go to upload
          </Link>
        </main>
      </>
    );
  }

  const chosen = getInterviewer(picked);

  return (
    <>
      <SiteHeader right={<span className="subtle">{BETA ? "Free beta" : "Free plan"} · up to {FREE_MINUTES} minutes</span>} />
      <main className="wrap" style={{ maxWidth: 1080, paddingTop: 24, paddingBottom: 96 }}>
        <h1 className="display" style={{ fontSize: "clamp(2.2rem, 6vw, 3rem)", marginBottom: 24 }}>
          Set up your interview
        </h1>

        <div className="card" style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 16, padding: "12px 12px 12px 16px", borderRadius: 18, maxWidth: "100%" }}>
          <span style={{ width: 44, height: 44, borderRadius: 12, background: "var(--warm-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8A3412" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5" />
              <path d="M9 13h6" />
              <path d="M9 17h4" />
            </svg>
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 700, overflowWrap: "anywhere" }}>{profile.fileName}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "#0b5c51" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0B5C51" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12l5 5L20 7" />
              </svg>
              {replacing ? "Reading..." : "Read and ready"}
            </span>
          </span>
          <label htmlFor={replaceId} className="btn btn-light btn-sm" style={{ background: "var(--bg)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 4v5h-5" />
            </svg>
            Replace
          </label>
          <input id={replaceId} type="file" accept=".pdf,.docx" className="visually-hidden" onChange={onReplace} disabled={replacing} />
        </div>
        {error && (
          <p className="error" role="alert" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}

        <section aria-labelledby="pick-title" className="section-rule">
          <h2 id="pick-title" className="display" style={{ fontSize: "2rem" }}>
            Pick your interviewer
          </h2>
          <p className="muted" style={{ margin: "6px 0 24px" }}>
            Real interviewers come in every style. Practice against the one that scares you most.
          </p>
          <div className="interviewer-grid">
            {INTERVIEWERS.map((i) => {
              const on = i.id === picked;
              return (
                <button
                  key={i.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(i.id)}
                  style={{
                    textAlign: "left", cursor: "pointer", padding: 18, borderRadius: 18, background: "#fff",
                    display: "flex", flexDirection: "column", alignItems: "flex-start",
                    border: `2px solid ${on ? "var(--ink)" : "var(--line)"}`,
                    boxShadow: on ? "0 12px 28px -18px rgba(22,22,26,0.5)" : "none",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                    <Avatar character={i.id} size={64} decorative />
                    {i.pro && (
                      <span style={{ padding: "3px 9px", borderRadius: 999, background: "#f3f3f5", color: "var(--ink-2)", fontSize: 12, fontWeight: 700 }}>Pro</span>
                    )}
                  </span>
                  <span style={{ marginTop: 14, fontWeight: 700, fontSize: "1.0625rem" }}>{i.name}</span>
                  <span style={{ marginTop: 4, fontSize: 14, color: "var(--ink-2)", lineHeight: 1.4 }}>{i.blurb}</span>
                  <span style={{ marginTop: 12, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-3)" }}>{i.level}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="section-rule" style={{ maxWidth: 760 }}>
          <label htmlFor="details" className="display" style={{ display: "block", fontSize: "2rem", lineHeight: 1.1 }}>
            Anything you want to tighten up?
          </label>
          <p className="muted" style={{ margin: "6px 0 20px" }}>
            An answer you ramble on, a project that&apos;s hard to explain, or a role you&apos;re preparing for. Optional.
          </p>
          <textarea
            id="details"
            className="textarea"
            rows={4}
            maxLength={1500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. I always ramble about my hackathon project. Backend internship interview on Friday."
          />
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span className="subtle">Quick add:</span>
            {QUICK_ADDS.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => setNote((n) => (n.trim() ? n.trimEnd() + "\n" : "") + q.text)}
                style={{ minHeight: 36, padding: "0 14px", borderRadius: 999, border: "1px solid var(--line-2)", background: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
              >
                {q.label}
              </button>
            ))}
          </div>
        </section>

        <section
          aria-label="Your interview"
          style={{ marginTop: 48, padding: 24, borderRadius: 24, background: "#fff", border: "2px solid var(--ink)", boxShadow: "0 24px 48px -32px rgba(22,22,26,0.45)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 20 }}
        >
          <Avatar character={chosen.id} size={72} decorative />
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            <p className="display" style={{ fontSize: "1.5rem", letterSpacing: "-0.02em" }}>{chosen.name}</p>
            <p className="muted" style={{ margin: "2px 0 0" }}>
              &ldquo;{chosen.sample}&rdquo;
            </p>
            <p className="subtle" style={{ margin: "6px 0 0" }}>
              Starts now · up to {FREE_MINUTES} minutes · use headphones if you can
              {chosen.pro && BETA ? " · Pro interviewers are free during beta" : ""}
            </p>
          </div>
          <button type="button" className="btn btn-dark" style={{ minHeight: 60, fontSize: 18 }} onClick={start}>
            Start interview
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14" />
              <path d="M13 6l6 6-6 6" />
            </svg>
          </button>
        </section>
      </main>
    </>
  );
}
