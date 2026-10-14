"use client";

import type { TranscriptLine } from "../types";
import { recording } from "./recording";
import { readLevel } from "./level";
import { AGENT_URL } from "@/lib/agentSettings";

export type AgentStatus =
  | "connecting"
  | "listening"
  | "speaking"
  | "thinking"
  | "muted"
  | "ended"
  | "error";

export type AgentEvents = {
  onStatus: (s: AgentStatus) => void;
  onLine: (line: TranscriptLine) => void;
  onError: (message: string) => void;
  /** Called once when the voice connection closes, with how long it was open (Deepgram bills by this time). */
  onVoiceTime?: (ms: number) => void;
};

const OUTPUT_RATE = 24000;

/**
 * Thin wrapper around Deepgram's Voice Agent websocket.
 * Mic audio goes up as 16 kHz linear16; the interviewer's voice comes
 * back as 24 kHz linear16 and is scheduled for gapless playback.
 */
export class InterviewAgent {
  private ws: WebSocket | null = null;
  private ctx: AudioContext | null = null;
  private mic: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private playhead = 0;
  private playing = new Set<AudioBufferSourceNode>();
  private keepAlive: ReturnType<typeof setInterval> | null = null;
  private muted = false;
  private agentSpeaking = false;
  private ended = false;
  private openedAt: number | null = null;
  /** Deepgram's own explanation, if it sent one before closing. */
  private serverError: string | null = null;
  private recDest: MediaStreamAudioDestinationNode | null = null;
  private recorder: MediaRecorder | null = null;
  private recChunks: Blob[] = [];
  private analyser: AnalyserNode | null = null;
  private levelBuf: Float32Array<ArrayBuffer> | null = null;
  private outAnalyser: AnalyserNode | null = null;
  private outBuf: Float32Array<ArrayBuffer> | null = null;

  constructor(private events: AgentEvents) {}

  async start(token: string, settings: unknown) {
    this.events.onStatus("connecting");

    this.mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    this.ctx = new AudioContext();
    await this.ctx.resume();
    await this.ctx.audioWorklet.addModule("/mic-processor.js");
    const source = this.ctx.createMediaStreamSource(this.mic);
    this.node = new AudioWorkletNode(this.ctx, "mic-processor");
    source.connect(this.node);
    // Read-only tap for the on-screen mic meter.
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    source.connect(this.analyser);
    // Tap on the interviewer's voice, to move the avatar's mouth with the audio.
    this.outAnalyser = this.ctx.createAnalyser();
    this.outAnalyser.fftSize = 512;
    // The worklet must be pulled by the graph; route it to a silent gain.
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    this.node.connect(sink).connect(this.ctx.destination);

    this.startRecording(source);

    // Temporary tokens from /v1/auth/grant use the "bearer" subprotocol.
    const ws = new WebSocket(AGENT_URL, ["bearer", token]);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.onopen = () => {
      this.openedAt = Date.now();
      ws.send(JSON.stringify(settings));
      this.keepAlive = setInterval(() => this.sendJson({ type: "KeepAlive" }), 8000);
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") this.handleMessage(ev.data);
      else this.playChunk(ev.data as ArrayBuffer);
    };

    ws.onerror = () => {
      if (!this.ended) this.events.onError("Lost connection to the interviewer.");
    };

    ws.onclose = (ev) => {
      this.closeVoiceClock();
      if (!this.ended) {
        console.warn("[voice] connection closed", { code: ev.code, reason: ev.reason, wasClean: ev.wasClean });
        // Deepgram usually sends an Error message explaining why before it closes; keep that on screen.
        this.events.onError(
          this.serverError
            ? `The voice service closed the interview: ${this.serverError}`
            : ev.code === 1008 || ev.code === 4001
              ? "The session couldn't be authorized."
              : ev.reason
                ? `The interview connection closed: ${ev.reason}`
                : "The interview connection closed.",
        );
        this.events.onStatus("error");
      }
    };

    this.node.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
      if (this.muted || ws.readyState !== WebSocket.OPEN) return;
      ws.send(ev.data);
    };
  }

  /** Records the mic and the interviewer's voice as one track, in memory only. */
  private startRecording(micSource: MediaStreamAudioSourceNode) {
    recording.set(null);
    if (!this.ctx || typeof MediaRecorder === "undefined") {
      console.warn("[recording] MediaRecorder isn't available in this browser; no audio will be saved.");
      return;
    }
    try {
      this.recDest = this.ctx.createMediaStreamDestination();
      micSource.connect(this.recDest);
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(this.recDest.stream, mime ? { mimeType: mime } : undefined);
      this.recChunks = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) this.recChunks.push(e.data);
      };
      rec.onerror = (e) => console.warn("[recording] recorder error", e);
      rec.onstop = () => {
        if (this.recChunks.length === 0) {
          console.warn("[recording] recorder stopped with no audio data.");
          return;
        }
        const type = rec.mimeType || mime || "audio/webm";
        recording.set({
          blob: new Blob(this.recChunks, { type }),
          ext: type.includes("mp4") ? "m4a" : "webm",
          durationMs: Date.now() - startedAt,
        });
        this.recChunks = [];
      };
      const startedAt = Date.now();
      rec.start(1000);
      this.recorder = rec;
    } catch (err) {
      // Recording is a bonus; the interview works without it.
      console.warn("[recording] couldn't start", err);
      this.recDest = null;
      this.recorder = null;
    }
  }

  private sendJson(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private handleMessage(raw: string) {
    let msg: { type?: string; role?: "user" | "assistant"; content?: string; description?: string; code?: string };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.type) {
      case "SettingsApplied":
        this.events.onStatus(this.muted ? "muted" : "listening");
        break;
      case "ConversationText":
        if (msg.role && msg.content) this.events.onLine({ role: msg.role, content: msg.content });
        break;
      case "UserStartedSpeaking":
        // Barge-in: the candidate talked over the interviewer, so stop playback.
        this.stopPlayback();
        this.agentSpeaking = false;
        this.events.onStatus(this.muted ? "muted" : "listening");
        break;
      case "AgentThinking":
        this.events.onStatus("thinking");
        break;
      case "AgentStartedSpeaking":
        this.agentSpeaking = true;
        this.events.onStatus("speaking");
        break;
      case "AgentAudioDone": {
        // Audio may still be queued locally; flip back once it has played.
        const wait = Math.max(0, (this.playhead - (this.ctx?.currentTime ?? 0)) * 1000);
        setTimeout(() => {
          this.agentSpeaking = false;
          if (!this.ended) this.events.onStatus(this.muted ? "muted" : "listening");
        }, wait);
        break;
      }
      case "Error":
        console.warn("[voice] Deepgram error", msg);
        this.serverError = msg.description || msg.code || null;
        this.events.onError(msg.description || "The voice service reported an error.");
        break;
    }
  }

  private playChunk(buf: ArrayBuffer) {
    if (!this.ctx || buf.byteLength < 2) return;
    const pcm = new Int16Array(buf, 0, Math.floor(buf.byteLength / 2));
    const audio = this.ctx.createBuffer(1, pcm.length, OUTPUT_RATE);
    const data = audio.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) data[i] = pcm[i] / 0x8000;
    const src = this.ctx.createBufferSource();
    src.buffer = audio;
    src.connect(this.ctx.destination);
    if (this.recDest) src.connect(this.recDest);
    if (this.outAnalyser) src.connect(this.outAnalyser);
    const now = this.ctx.currentTime;
    this.playhead = Math.max(this.playhead, now + 0.03);
    src.start(this.playhead);
    this.playhead += audio.duration;
    this.playing.add(src);
    src.onended = () => this.playing.delete(src);
  }

  private stopPlayback() {
    for (const s of this.playing) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
    }
    this.playing.clear();
    this.playhead = this.ctx?.currentTime ?? 0;
  }

  /** Current mic loudness, 0 to 1, for the on-screen meter. */
  inputLevel(): number {
    if (!this.analyser || this.muted || this.ended) return 0;
    this.levelBuf ??= new Float32Array(this.analyser.fftSize);
    // Speech RMS is usually 0.02 to 0.2; scale so normal talking fills most of the meter.
    return readLevel(this.analyser, this.levelBuf, 6);
  }

  /** Current loudness of the interviewer's voice, 0 to 1. */
  outputLevel(): number {
    if (!this.outAnalyser || this.ended) return 0;
    this.outBuf ??= new Float32Array(this.outAnalyser.fftSize);
    return readLevel(this.outAnalyser, this.outBuf, 5);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.mic?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    if (!this.agentSpeaking) this.events.onStatus(muted ? "muted" : "listening");
  }

  /** Swap the system prompt mid-interview, e.g. to start wrapping up. */
  updatePrompt(prompt: string) {
    this.sendJson({ type: "UpdatePrompt", prompt });
  }

  /** Have the interviewer say a specific line now. */
  say(message: string) {
    this.sendJson({ type: "InjectAgentMessage", message });
  }

  /** When the voice connection opened, or null if it isn't open. */
  voiceOpenedAt(): number | null {
    return this.openedAt;
  }

  private closeVoiceClock() {
    if (this.openedAt === null) return;
    const ms = Date.now() - this.openedAt;
    this.openedAt = null;
    this.events.onVoiceTime?.(ms);
  }

  stop() {
    // finish() and the interview page's unmount cleanup both call this.
    if (this.ended) return;
    this.ended = true;
    // Count up to now: the socket closes asynchronously, after the page may have moved on.
    this.closeVoiceClock();
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.stopPlayback();
    this.node?.disconnect();
    if (this.recorder?.state === "recording") this.recorder.stop();
    this.mic?.getTracks().forEach((t) => t.stop());
    try {
      this.ws?.close(1000);
    } catch {
      // ignore
    }
    void this.ctx?.close();
    this.events.onStatus("ended");
  }
}
