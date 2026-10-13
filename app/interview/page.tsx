"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { LiveCost } from "@/components/LiveCost";
import { MicLevel } from "@/components/MicLevel";
import { costLedger } from "@/lib/cost";
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
  const [questions, setQuestions] = useState<string[]>([]);
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
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
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
      setQuestions(s.questions ?? []);
    }
    const retry = new URLSearchParams(window.location.search).get("retry");
    if (retry) setRetryTopic(retry);
    setLoaded(true);
  }, []);

  // Load the feedback screen ahead of time, so ending the interview switches instantly.
  useEffect(() => {
    router.prefetch("/feedback");
  }, [router]);

  // Track browser full screen (also changes when people press Esc).
  useEffect(() => {
    setCanFullscreen(Boolean(document.fullscreenEnabled));
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);

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
    // Anonymous count of finished calls; sendBeacon survives the page change.
    if (startedAt.current) navigator.sendBeacon?.("/api/track", new Blob([JSON.stringify({ event: "interview_ended" })], { type: "application/json" }));
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
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

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  async function join() {
    if (!profile) return;
    // Full screen needs the click itself, so ask before anything async.
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
    setPrivacyOpen(false);
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
        body: JSON.stringify({ profile, interviewerId, focusNote, questions, retryTopic }),
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
        onVoiceTime: (ms) => costLedger.addVoiceMs(ms),
      });
      agentRef.current = agent;
      await agent.start(data.token, data.settings);
      costLedger.startInterview();
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
  // Call controls are the 1-bit card drawn in white on the black stage: filled
  // white when on, outlined when off. Labels never change; the icon (slashed
  // when off) and aria-pressed carry the state.
  const btn = (on: boolean): React.CSSProperties => ({
    minHeight: 48, padding: "0 16px", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 8,
    fontSize: 15, fontWeight: 600, cursor: "pointer",
    background: on ? "#fff" : "#000", color: on ? "#000" : "#fff",
    border: "2px solid #fff", boxShadow: "3px 3px 0 #fff",
  });

  return (
    // The interview is a full-window call stage, dark in both themes.
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "var(--inv-bg)", color: "var(--inv-ink)", overflow: "hidden" }}>
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "8px 16px", padding: "16px 24px" }}>
        {phase === "lobby" ? (
          <Link href="/" className="wordmark" style={{ color: "var(--inv-ink)" }}>
            talkaboutyourresume
          </Link>
        ) : (
          <span className="wordmark" style={{ color: "var(--inv-ink)" }}>talkaboutyourresume</span>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span aria-label="Current time" style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: "1.0625rem", whiteSpace: "nowrap" }}>
            {now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </span>
          {phase === "live" && <LiveCost voiceOpenedAt={() => agentRef.current?.voiceOpenedAt() ?? null} />}
          {canFullscreen && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-pressed={fullscreen}
              aria-label="Full screen"
              title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
              style={{ width: 40, height: 40, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#000", color: "#fff", border: "2px solid #fff", cursor: "pointer" }}
            >
              <FullscreenIcon on={fullscreen} />
            </button>
          )}
        </div>
      </header>

      <main aria-label="Interview" style={{ position: "relative", flex: "1 1 auto", minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: "0 24px", textAlign: "center" }}>
        <span style={{ position: "relative", borderRadius: "50%", boxShadow: "0 0 0 3px #000, 0 0 0 5px #fff" }}>
          <span aria-hidden className={`speaking-ring${voiceActive ? " on" : ""}`} />
          <Avatar character={interviewer.id} size={160} talking={voiceActive} open={mouth} />
        </span>
        <p className="display" style={{ fontSize: "1.5rem" }}>{interviewer.name}</p>

        {phase === "lobby" ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <p style={{ margin: 0, color: "var(--inv-ink-3)", maxWidth: 420 }}>
              {retryTopic ? "A short retry of one answer." : "Your interviewer is ready."} Find a quiet spot and use headphones if you can.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
              {micCheck === "on" ? (
                <span style={{ ...btn(false), cursor: "default", fontWeight: 500, boxShadow: "none" }}>
                  <MicLevel read={() => micCheckRef.current?.level() ?? 0} />
                  Say something. The bars should move.
                </span>
              ) : (
                <button type="button" onClick={startMicCheck} disabled={micCheck === "starting"} style={btn(false)}>
                  <MicIcon on />
                  {micCheck === "starting" ? "Opening your mic..." : "Test your mic"}
                </button>
              )}
              <button type="button" onClick={toggleCamera} aria-pressed={camera} style={btn(camera)}>
                <CameraIcon on={camera} />
                {camera ? "Camera on" : "Turn on camera"}
              </button>
            </div>
            {/* The one primary action here: brand blue, so it outranks the white "on" toggles. */}
            <button className="btn btn-accent" style={{ minHeight: 56, fontSize: 18, padding: "0 28px", borderColor: "#fff", boxShadow: "3px 3px 0 #fff" }} onClick={join}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="6" width="13" height="12" rx="2" />
                <path d="M16 10l5-3v10l-5-3" />
              </svg>
              Join interview
            </button>
            <div style={{ position: "relative" }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--inv-ink-3)" }}>
                Recorded on this device only, so you can replay it afterwards.{" "}
                <button
                  type="button"
                  aria-expanded={privacyOpen}
                  aria-controls="privacy-card"
                  onClick={() => setPrivacyOpen((o) => !o)}
                  style={{ padding: 0, border: 0, background: "none", color: "var(--inv-ink-2)", textDecoration: "underline", font: "inherit", cursor: "pointer" }}
                >
                  Privacy
                </button>
              </p>
              {privacyOpen && <PrivacyCard onClose={() => setPrivacyOpen(false)} />}
            </div>
          </div>
        ) : (
          <p style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, color: "var(--inv-ink-2)" }} aria-live="polite">
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: muted ? "var(--inv-ink-3)" : "#3dd6b8" }} />
            {statusText}
            {phase === "live" && !muted && <MicLevel read={() => agentRef.current?.inputLevel() ?? 0} />}
          </p>
        )}

        {camera && (
          // Picture-in-picture self view, the same element in the lobby and the call so it never restarts.
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            aria-label="Your camera"
            style={{ position: "absolute", right: 24, bottom: 16, width: "clamp(132px, 22vw, 280px)", aspectRatio: "16 / 10", objectFit: "cover", borderRadius: 8, border: "2px solid #fff", transform: "scaleX(-1)", background: "#000", boxShadow: "3px 3px 0 #fff" }}
          />
        )}
      </main>

      <footer style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "12px 24px 24px" }}>
        {captions && recent.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center", textAlign: "center", width: "100%" }}>
            {recent.map((l, i) => (
              <p key={lines.length - recent.length + i} style={{ margin: 0, maxWidth: 720, padding: "8px 14px", borderRadius: 8, border: `2px solid ${l.role === "assistant" ? "#fff" : "#5f636b"}`, background: "#000", fontSize: 15 }}>
                <strong>{l.role === "assistant" ? "Interviewer" : "You"}:</strong> {l.content}
              </p>
            ))}
          </div>
        )}

        {error && (
          <p className="error" role="alert" style={{ margin: 0, maxWidth: 560 }}>
            {error}
          </p>
        )}

        {phase === "live" && (
          <div role="toolbar" aria-label="Interview controls" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
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
            {confirmEnd ? (
              <span style={{ display: "inline-flex", gap: 8 }}>
                <button type="button" onClick={finish} style={{ ...btn(false), background: "#e5484d", color: "#fff" }}>
                  End and get feedback
                </button>
                <button type="button" onClick={() => setConfirmEnd(false)} style={btn(false)}>
                  Keep going
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmEnd(true)} style={{ ...btn(false), background: "#e5484d", color: "#fff" }}>
                <EndIcon />
                End
              </button>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}

/** A short privacy summary that opens right where it's asked for. Esc or a click outside closes it. */
function PrivacyCard({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element;
      // The Privacy link toggles the card itself; let its click handle that.
      if (target.closest('[aria-controls="privacy-card"]')) return;
      if (ref.current && !ref.current.contains(target)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      id="privacy-card"
      role="dialog"
      aria-label="Privacy"
      tabIndex={-1}
      className="privacy-card"
      style={{ position: "absolute", bottom: "calc(100% + 10px)", left: "50%", width: "min(380px, calc(100vw - 32px))", padding: 20, borderRadius: 10, background: "#fff", color: "#000", border: "2px solid #000", textAlign: "left", outline: "none", zIndex: 10 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <p style={{ margin: 0, fontWeight: 600, fontSize: 16 }}>Your privacy</p>
        <button type="button" onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, borderRadius: 8, border: "2px solid #000", background: "#fff", color: "#000", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8, fontSize: 14, lineHeight: 1.45, color: "#33363d" }}>
        <li>Your voice is streamed to Deepgram only to run this conversation.</li>
        <li>The recording stays in this browser tab so you can replay or download it. It isn&apos;t uploaded to us.</li>
        <li>Your resume and transcript go to Anthropic to ask questions and write feedback. We don&apos;t store them.</li>
        <li>Nothing is shared with employers.</li>
      </ul>
      <a href="/privacy" target="_blank" rel="noopener" style={{ display: "inline-block", marginTop: 12, fontSize: 13, color: "#1f3fd1" }}>
        Full privacy page (opens a new tab)
      </a>
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

function FullscreenIcon({ on }: { on: boolean }) {
  return (
    <svg {...ICON}>
      {on ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
    </svg>
  );
}

function EndIcon() {
  return (
    <svg {...ICON}>
      <path d="M3 15.5c5-4.7 13-4.7 18 0l-2.2 2.6-3.6-1.4v-2.6c-2.1-.6-4.3-.6-6.4 0v2.6l-3.6 1.4z" />
    </svg>
  );
}
