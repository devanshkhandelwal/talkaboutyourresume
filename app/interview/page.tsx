"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { MicLevel } from "@/components/MicLevel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MicCheck } from "@/lib/voice/level";
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
  const [mouth, setMouth] = useState(0);
  const [micCheck, setMicCheck] = useState<"off" | "starting" | "on" | "error">("off");

  const agentRef = useRef<InterviewAgent | null>(null);
  const linesRef = useRef<TranscriptLine[]>([]);
  const startedAt = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const wrapping = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camStream = useRef<MediaStream | null>(null);
  const micCheckRef = useRef<MicCheck | null>(null);

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

  // Load the feedback screen ahead of time, so ending the interview switches instantly.
  useEffect(() => {
    router.prefetch("/feedback");
  }, [router]);

  // Wall clock only. No countdown, like a real interview.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);

  // Mouth follows the loudness of the interviewer's actual voice. Re-renders only
  // when the quantized openness changes, not every frame.
  useEffect(() => {
    if (phase !== "live") return;
    let raf = 0;
    let level = 0;
    let last = -1;
    const tick = () => {
      const target = agentRef.current?.outputLevel() ?? 0;
      level += (target - level) * (target > level ? 0.6 : 0.25);
      const q = Math.round(Math.min(1, level) * 5) / 5;
      if (q !== last) {
        last = q;
        setMouth(q);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => () => micCheckRef.current?.stop(), []);

  async function startMicCheck() {
    setError(null);
    setMicCheck("starting");
    const check = new MicCheck();
    try {
      await check.start();
      micCheckRef.current = check;
      setMicCheck("on");
    } catch (err) {
      check.stop();
      setMicCheck("error");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "We need microphone access for the interview. Allow it in your browser and try again."
          : "Couldn't open your microphone. Check that one is connected.",
      );
    }
  }

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
    // The interview opens its own mic stream.
    micCheckRef.current?.stop();
    micCheckRef.current = null;
    setMicCheck("off");
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
  // Deepgram sends no "started speaking" event for the greeting, so also treat
  // any audible interviewer audio as talking.
  const voiceActive = speaking || mouth > 0;
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
  // Toggles share one look: filled when on, outlined when off. Labels never change;
  // the icon (slashed when off) and aria-pressed carry the state.
  const btn = (on: boolean): React.CSSProperties => ({
    minHeight: 48, padding: "0 18px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 8,
    fontSize: 15, fontWeight: 700, cursor: "pointer",
    background: on ? "var(--primary-bg)" : "var(--card)", color: on ? "var(--primary-ink)" : "var(--ink)",
    border: `1px solid ${on ? "var(--primary-bg)" : "var(--line-2)"}`,
  });

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="wrap site-header" style={{ maxWidth: 1080 }}>
        {phase === "lobby" ? (
          <Link href="/" className="wordmark">
            talkaboutyourresume
          </Link>
        ) : (
          <span className="wordmark">talkaboutyourresume</span>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span aria-label="Current time" style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: "1.0625rem" }}>
            {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </span>
          <ThemeToggle />
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
          style={{ position: "relative", minHeight: 480, borderRadius: 28, background: "var(--inv-bg)", color: "var(--inv-ink)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "48px 24px 140px", overflow: "hidden" }}
        >
          <span style={{ position: "relative", borderRadius: "50%", boxShadow: "0 0 0 8px rgba(255,255,255,0.06)" }}>
            <span aria-hidden className={`speaking-ring${voiceActive ? " on" : ""}`} />
            <Avatar character={interviewer.id} size={160} talking={voiceActive} open={mouth} />
          </span>
          <p className="display" style={{ fontSize: "1.5rem", fontWeight: 700 }}>{interviewer.name}</p>

          {phase === "lobby" ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center" }}>
              <p style={{ margin: 0, color: "var(--inv-ink-3)", maxWidth: 420 }}>
                {retryTopic ? "A short retry of one answer." : "Your interviewer is ready."} Find a quiet spot and use headphones if you can.
              </p>
              {micCheck === "on" ? (
                <p style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 10, fontSize: 15, color: "var(--inv-ink-2)" }}>
                  <MicLevel read={() => micCheckRef.current?.level() ?? 0} />
                  Say something. The bars should move.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={startMicCheck}
                  disabled={micCheck === "starting"}
                  style={{ minHeight: 40, padding: "0 16px", borderRadius: 999, background: "transparent", color: "var(--inv-ink)", border: "1px solid var(--inv-line)", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <MicIcon on />
                  {micCheck === "starting" ? "Opening your mic..." : "Test your mic"}
                </button>
              )}
              <button className="btn btn-inverse" style={{ minHeight: 60, fontSize: 18 }} onClick={join}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="6" width="13" height="12" rx="2" />
                  <path d="M16 10l5-3v10l-5-3" />
                </svg>
                Join interview
              </button>
              <p style={{ margin: 0, fontSize: 13, color: "var(--inv-ink-3)" }}>
                Recorded on this device only, so you can replay it afterwards. <Link href="/privacy" style={{ color: "var(--inv-ink-2)" }}>Privacy</Link>
              </p>
            </div>
          ) : (
            <p style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, color: "var(--inv-ink-2)" }} aria-live="polite">
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: muted ? "var(--inv-ink-3)" : "#3dd6b8" }} />
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
              style={{ position: "absolute", top: 20, right: 20, width: 200, height: 130, objectFit: "cover", borderRadius: 16, border: "2px solid var(--inv-line)", transform: "scaleX(-1)", background: "var(--inv-fill)" }}
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
            <button type="button" style={btn(!muted)} aria-pressed={!muted} onClick={toggleMute}>
              <MicIcon on={!muted} />
              Mic
            </button>
            <button type="button" style={btn(camera)} aria-pressed={camera} onClick={toggleCamera}>
              <CameraIcon on={camera} />
              Camera
            </button>
            <button type="button" style={btn(captions)} aria-pressed={captions} onClick={() => setCaptions((c) => !c)}>
              <CaptionsIcon />
              Captions
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

const ICON = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

function MicIcon({ on }: { on: boolean }) {
  return (
    <svg {...ICON}>
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v3" />
      {!on && <path d="M4 4l16 16" />}
    </svg>
  );
}

function CameraIcon({ on }: { on: boolean }) {
  return (
    <svg {...ICON}>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3" />
      {!on && <path d="M3 3l18 18" />}
    </svg>
  );
}

function CaptionsIcon() {
  return (
    <svg {...ICON}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M10 10.5a2 2 0 1 0 0 3" />
      <path d="M16 10.5a2 2 0 1 0 0 3" />
    </svg>
  );
}
