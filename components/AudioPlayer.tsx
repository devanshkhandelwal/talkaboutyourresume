"use client";

import { useEffect, useRef, useState } from "react";

const SPEEDS = [1, 1.25, 1.5, 2];

function clock(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Player for the interview recording. The native <audio controls> is hard to
 * read on dark surfaces and can't show progress for MediaRecorder files
 * (their duration reads as Infinity), so this draws its own controls and
 * uses the length measured while recording.
 */
export function AudioPlayer({ src, durationMs, onDownload }: { src: string; durationMs: number; onDownload: () => void }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(durationMs / 1000);
  const [speed, setSpeed] = useState(1);
  const dragging = useRef(false);

  // Follow playback every frame while playing, so the bar moves smoothly.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const a = audio.current;
      if (a && !dragging.current) setTime(a.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      if (a.currentTime >= duration - 0.05) a.currentTime = 0;
      void a.play().catch(() => setPlaying(false));
    } else a.pause();
  }

  function seek(value: number) {
    setTime(value);
    if (audio.current) audio.current.currentTime = value;
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audio.current) audio.current.playbackRate = next;
  }

  const pct = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;

  return (
    <div className="audio-player">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setTime(duration);
        }}
        onLoadedMetadata={(e) => {
          // Prefer the file's own length when the browser knows it.
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
      />
      <button type="button" className="audio-play" onClick={toggle} aria-label={playing ? "Pause recording" : "Play recording"}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          {playing ? (
            <>
              <rect x="6" y="5" width="4" height="14" rx="1.2" />
              <rect x="14" y="5" width="4" height="14" rx="1.2" />
            </>
          ) : (
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
          )}
        </svg>
      </button>
      <span className="audio-time">{clock(time)}</span>
      <input
        type="range"
        className="audio-scrubber"
        min={0}
        max={duration || 0}
        step={0.01}
        value={Math.min(time, duration || 0)}
        aria-label="Seek"
        aria-valuetext={`${clock(time)} of ${clock(duration)}`}
        style={{ "--pct": `${pct}%` } as React.CSSProperties}
        onPointerDown={() => (dragging.current = true)}
        onPointerUp={() => (dragging.current = false)}
        onChange={(e) => seek(Number(e.target.value))}
      />
      <span className="audio-time audio-total">{clock(duration)}</span>
      <button type="button" className="audio-chip" onClick={cycleSpeed} aria-label={`Playback speed ${speed}x`}>
        {speed}×
      </button>
      <button type="button" className="audio-chip" onClick={onDownload} aria-label="Download recording" title="Download recording">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 4v11" />
          <path d="M7 10l5 5 5-5" />
          <path d="M5 20h14" />
        </svg>
      </button>
    </div>
  );
}
