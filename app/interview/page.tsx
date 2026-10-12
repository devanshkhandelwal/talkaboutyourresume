"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { MicLevel } from "@/components/MicLevel";
import { getInterviewer } from "@/lib/interviewers";
import { WRAP_UP_PROMPT_SUFFIX } from "@/lib/prompts";
import { store } from "@/lib/store";
import { InterviewAgent, type AgentStatus } from "@/lib/voice/agent";
import type { ResumeProfile, TranscriptLine } from "@/lib/types";

const GOODBYE = /\b(good ?bye|take care|best of luck|good luck with|have a (great|good) (day|one|rest))\b/i;

type Phase = "lobby" | "starting" | "live" | "ending";

export default function InterviewPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [interviewerId, setInterviewerId] = useState("manager");
  const [focusNote, setFocusNote] = useState("");
  const [retryTopic, setRetryTopic] = useState<string | undefined>();
  const [loaded, setLoaded] = useState(false);

  const [phase, setPhase] = useState<Phase>("lobby");
  const [status, setStatus] = useState<AgentStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [muted, setMuted] = useState(false);
  const [captions, setCaptions] = useState(false);
  const [camera, setCamera] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [frame, setFrame] = useState(0);

  const agentRef = useRef<InterviewAgent | null>(null);
  const linesRef = useRef<TranscriptLine[]>([]);
  const startedAt = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const wrapping = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camStream = useRef<MediaStream | null>(null);

  useEffect(() => {
    setProfile(store.getProfile());
    const s = store.getSetup();
    if (s) {
      setInterviewerId(s.interviewerId);
      setFocusNote(s.focusNote);
    }
    const retry = new URLSearchParams(window.location.search).get("retry");
    if (retry) setRetryTopic(retry);
    setLoaded(true);
  }, []);

  // Wall clock only. No countdown, like a real interview.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);

  // Mouth animation while the interviewer speaks.
  useEffect(() => {
    if (status !== "speaking") return;
    const t = setInterval(() => setFrame((f) => f + 1), 140);
    return () => clearInterval(t);
  }, [status]);

  const finish = useCallback(() => {
    if (phase === "ending") return;
    setPhase("ending");
    timers.current.forEach(clearTimeout);
    agentRef.current?.stop();
    camStream.current?.getTracks().forEach((t) => t.stop());
    store.setSession({
      interviewerId,
      focusNote,
      retryTopic,
      startedAt: startedAt.current,
      endedAt: Date.now(),
      transcript: linesRef.current,
    });
    store.setReport(null);
    router.push("/feedback");
  }, [phase, interviewerId, focusNote, retryTopic, router]);

  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
      agentRef.current?.stop();
      camStream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function join() {
    if (!profile) return;
    setError(null);
    setPhase("starting");
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, interviewerId, focusNote, retryTopic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't start the interview.");

      const agent = new InterviewAgent({
        onStatus: setStatus,
        onLine: (line) => {
          linesRef.current = [...linesRef.current, line];
          setLines(linesRef.current);
          if (wrapping.current && line.role === "assistant" && GOODBYE.test(line.content)) {
            timers.current.push(setTimeout(() => finishRef.current(), 5000));
          }
        },
        onError: (msg) => setError(msg),
      });
      agentRef.current = agent;
      await agent.start(data.token, data.settings);
      startedAt.current = Date.now();
      setPhase("live");

      const maxMs = Number(data.maxMinutes) * 60_000;
      const basePrompt: string = data.settings.agent.think.prompt;
      timers.current.push(
        setTimeout(() => {
          wrapping.current = true;
          agent.updatePrompt(basePrompt + WRAP_UP_PROMPT_SUFFIX);
        }, Math.max(30_000, maxMs - 2 * 60_000)),
        setTimeout(() => finishRef.current(), maxMs),
      );
    } catch (err) {
      agentRef.current?.stop();
      agentRef.current = null;
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "We need microphone access for the interview. Allow it in your browser and try again."
          : err instanceof Error
            ? err.message
            : "Couldn't start the interview.";
      setError(msg);
      setPhase("lobby");
    }
  }

  function toggleMute() {
    const m = !muted;
    setMuted(m);
    agentRef.current?.setMuted(m);
  }

  async function toggleCamera() {
    if (camera) {
      camStream.current?.getTracks().forEach((t) => t.stop());
      camStream.current = null;
      setCamera(false);
      return;
    }
    try {
      camStream.current = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 400 } });
      setCamera(true);
    } catch {
      setError("Couldn't turn on your camera. You can keep going without it.");
    }
  }

  useEffect(() => {
    if (camera && videoRef.current && camStream.current) videoRef.current.srcObject = camStream.current;
  }, [camera]);

  function takeMoment() {
    agentRef.current?.say("Of course, take your time.");
  }

  if (!loaded) return null;

  if (!profile) {
    return (
      <main className="narrow" style={{ paddingTop: 64, paddingBottom: 64 }}>
        <h1 className="display h2">Upload your resume first</h1>
        <Link href="/" className="btn btn-dark" style={{ marginTop: 16 }}>
          Go to upload
        </Link>
      </main>
    );
  }

  const interviewer = getInterviewer(interviewerId);
  const speaking = status === "speaking";
  const statusText =
    phase === "starting" || status === "connecting"
      ? "Connecting..."
      : muted
        ? "Your mic is off"
        : status === "speaking"
          ? "Speaking"
          : status === "thinking"
            ? "Thinking"
            : "Listening";
  const recent = lines.slice(-2);
  const btn = (on: boolean): React.CSSProperties => ({
    minHeight: 48, padding: "0 18px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 8,
    fontSize: 15, fontWeight: 700, cursor: "pointer",
    background: on ? "var(--ink)" : "#fff", color: on ? "#fff" : "var(--ink)",
    border: `1px solid ${on ? "var(--ink)" : "var(--line-2)"}`,
  });

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="wrap site-header" style={{ maxWidth: 1080 }}>
        <span className="wordmark">talkaboutyourresume</span>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span aria-label="Current time" style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: "1.0625rem" }}>
            {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </span>
          {phase === "live" &&
            (confirmEnd ? (
              <span style={{ display: "inline-flex", gap: 8 }}>
                <button className="btn btn-dark btn-sm" onClick={finish}>
                  End and get feedback
                </button>
                <button className="btn btn-light btn-sm" onClick={() => setConfirmEnd(false)}>
                  Keep going
                </button>
              </span>
            ) : (
              <button className="btn btn-light btn-sm" onClick={() => setConfirmEnd(true)}>
                End interview
              </button>
            ))}
        </div>
      </header>

      <main className="wrap" style={{ flex: "1 1 auto", maxWidth: 1080, width: "100%", paddingTop: 8, paddingBottom: 48, display: "flex", flexDirection: "column", gap: 20 }}>
        <section
          aria-label="Interview"
          style={{ position: "relative", minHeight: 480, borderRadius: 28, background: "var(--ink)", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "48px 24px 140px", overflow: "hidden" }}
        >
          <span style={{ borderRadius: "50%", animation: speaking ? "pulse 1.2s ease-in-out infinite" : undefined, boxShadow: "0 0 0 8px rgba(255,255,255,0.06)" }}>
            <Avatar character={interviewer.id} size={160} talking={speaking} frame={frame} />
          </span>
          <p className="display" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{interviewer.name}</p>

          {phase === "lobby" ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
              <p style={{ margin: 0, color: "#c4c4cc", maxWidth: 420 }}>
                {retryTopic ? "A short retry of one answer." : "Your interviewer is ready."} Find a quiet spot and use headphones if you can.
              </p>
              <button className="btn" style={{ background: "#fff", color: "var(--ink)", minHeight: 60, fontSize: 18 }} onClick={join}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="6" width="13" height="12" rx="2" />
                  <path d="M16 10l5-3v10l-5-3" />
                </svg>
                Join interview
              </button>
            </div>
          ) : (
            <p style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, color: "#e6e6ea" }} aria-live="polite">
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: muted ? "#c4c4cc" : "#3dd6b8" }} />
              {statusText}
              {phase === "live" && !muted && <MicLevel read={() => agentRef.current?.inputLevel() ?? 0} />}
            </p>
          )}

          {captions && recent.length > 0 && (
            <div style={{ position: "absolute", left: 24, right: 24, bottom: 24, display: "flex", flexDirection: "column", gap: 6, alignItems: "center", textAlign: "center" }}>
              {recent.map((l, i) => (
                <p key={lines.length - recent.length + i} style={{ margin: 0, maxWidth: 720, padding: "8px 14px", borderRadius: 10, background: l.role === "assistant" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)", fontSize: 15 }}>
                  <strong>{l.role === "assistant" ? "Interviewer" : "You"}:</strong> {l.content}
                </p>
              ))}
            </div>
          )}

          {camera && (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              aria-label="Your camera"
              style={{ position: "absolute", top: 20, right: 20, width: 200, height: 130, objectFit: "cover", borderRadius: 16, border: "2px solid #4a4a52", transform: "scaleX(-1)", background: "#3a3a42" }}
            />
          )}
        </section>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {phase === "live" && (
          <div role="toolbar" aria-label="Interview controls" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
            <button type="button" style={btn(muted)} aria-pressed={muted} onClick={toggleMute}>
              {muted ? "Unmute" : "Mute"}
            </button>
            <button type="button" style={btn(camera)} aria-pressed={camera} onClick={toggleCamera}>
              {camera ? "Camera on" : "Camera off"}
            </button>
            <button type="button" style={btn(captions)} aria-pressed={captions} onClick={() => setCaptions((c) => !c)}>
              {captions ? "Captions on" : "Captions off"}
            </button>
            <button type="button" style={btn(false)} onClick={takeMoment}>
              Give me a moment
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
