"use client";

import type { TranscriptLine, TurnLatency, VoiceStats } from "../types";
import { recording } from "./recording";
import { readLevel } from "./level";
import { AGENT_URL, type EndReason } from "@/lib/agentSettings";

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
  /** The candidate started a new answer (their first speech since their last line). */
  onTurnStart?: () => void;
  /** The interviewer ended the interview itself (end_interview), after its closing line played. */
  onInterviewerEnded?: (reason: EndReason) => void;
};

const OUTPUT_RATE = 24000;

/** How /api/session says to connect: through our voice relay, or straight to Deepgram. */
export type VoiceConnection =
  | { kind: "relay"; sessionId: string }
  | { kind: "direct"; token: string; settings: unknown };

// A relay connection lives under 5 minutes (a Vercel Function on the Hobby plan).
// Partway through, open the next one with the conversation so far, then switch
// at a pause; switch regardless before the old one is cut off.
const ROLLOVER_PREPARE_MS = 225_000;
const ROLLOVER_FORCE_MS = 275_000;
/** 100 ms of 16 kHz, 16-bit mono silence, to keep a waiting connection alive. */
const SILENCE = new ArrayBuffer(3200);

/**
 * Thin wrapper around Deepgram's Voice Agent websocket.
 * Mic audio goes up as 16 kHz linear16; the interviewer's voice comes
 * back as 24 kHz linear16 and is scheduled for gapless playback.
 */
export class InterviewAgent {
  private ws: WebSocket | null = null;
  private conn: VoiceConnection | null = null;
  // Relay hand-over: the connection number, the next connection while it warms up,
  // what to replay to it, and the timers that schedule it.
  private part = 0;
  private next: WebSocket | null = null;
  private nextReady = false;
  private nextSilence: ReturnType<typeof setInterval> | null = null;
  private rolloverTimers: ReturnType<typeof setTimeout>[] = [];
  private history: { role: "user" | "assistant"; content: string }[] = [];
  private promptAdditions: string[] = [];
  private ctx: AudioContext | null = null;
  private mic: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private playhead = 0;
  private playing = new Set<AudioBufferSourceNode>();
  private keepAlive: ReturnType<typeof setInterval> | null = null;
  private muted = false;
  private agentSpeaking = false;
  // Stats for nerds: when the candidate's current turn started, response times, audio received.
  private userTurnStartedAt: number | null = null;
  private latencies: TurnLatency[] = [];
  private interviewerSamples = 0;
  private agentThinking = false;
  /** The candidate has spoken since the interviewer last finished talking. */
  private userSpokeSinceAgent = false;
  /** A close waiting for a quiet moment (see closeAtNextPause). */
  private pendingClose: { prompt?: string; line: string } | null = null;
  private lastClose: { prompt?: string; line: string } | null = null;
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

  /** The interviewer's think settings, to swap a directive in and out (UpdateThink). */
  private think: { prompt: string; [k: string]: unknown } | null = null;
  private steering = false;
  /** An end_interview call waiting for the closing line to finish playing. */
  private pendingEnd: { id: string; reason: EndReason } | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private events: AgentEvents) {}

  async start(conn: VoiceConnection) {
    this.conn = conn;
    // Direct mode carries the Settings, so the think config is here to swap directives
    // in and out; through the relay, the server holds it and does the swap (RelaySteer).
    const think = conn.kind === "direct" ? (conn.settings as { agent?: { think?: { prompt?: string } } })?.agent?.think : undefined;
    this.think = think && typeof think.prompt === "string" ? (think as { prompt: string }) : null;
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

    const ws = this.openSocket(0);
    this.ws = ws;

    this.node.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
      // Keep sending while muted: the mic track is disabled, so this is silence, and
      // Deepgram closes sessions that receive no audio for a while.
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      this.ws.send(ev.data);
    };
  }

  private relayUrl(part: number) {
    const id = this.conn?.kind === "relay" ? this.conn.sessionId : "";
    return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/voice?s=${id}&p=${part}`;
  }

  /**
   * Opens connection `part`. Part 0 becomes the live connection when it opens; later
   * parts (relay only) warm up in the background until switchToNext().
   */
  private openSocket(part: number): WebSocket {
    const conn = this.conn!;
    // Temporary tokens from /v1/auth/grant use the "bearer" subprotocol.
    const ws = conn.kind === "direct" ? new WebSocket(AGENT_URL, ["bearer", conn.token]) : new WebSocket(this.relayUrl(part));
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      if (conn.kind === "direct") ws.send(JSON.stringify(conn.settings));
      // The relay builds the Settings itself; later parts carry the conversation over.
      else ws.send(JSON.stringify(part === 0 ? { type: "RelayStart" } : { type: "RelayStart", history: this.history, prompts: this.promptAdditions }));
      if (part === 0) {
        this.openedAt = Date.now();
        this.keepAlive = setInterval(() => this.sendJson({ type: "KeepAlive" }), 8000);
        if (conn.kind === "relay") this.scheduleRollover();
      } else {
        // Nobody is talking to it yet: stream silence so it stays open.
        this.nextSilence = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(SILENCE), 100);
      }
    };

    ws.onmessage = (ev) => {
      if (ws === this.next) {
        // Warming up: only care that it's ready.
        if (typeof ev.data === "string" && ev.data.includes('"SettingsApplied"')) {
          this.nextReady = true;
          this.trySwitch();
        }
        return;
      }
      if (ws !== this.ws) return;
      if (typeof ev.data === "string") this.handleMessage(ev.data);
      else this.playChunk(ev.data as ArrayBuffer);
    };

    ws.onerror = () => {
      if (ws === this.ws && !this.ended) this.events.onError("Lost connection to the interviewer.");
    };

    ws.onclose = (ev) => {
      if (ws === this.next) {
        // The next connection failed while warming up; try again shortly.
        this.dropNext();
        if (!this.ended) this.rolloverTimers.push(setTimeout(() => this.prepareNext(), 5000));
        return;
      }
      if (ws !== this.ws) return;
      this.closeVoiceClock();
      if (!this.ended) {
        console.warn("[voice] connection closed", { code: ev.code, reason: ev.reason, wasClean: ev.wasClean });
        // Deepgram (or the relay) usually explains why before it closes; keep that on screen.
        this.events.onError(
          ev.code === 4408
            ? "This interview reached its time limit."
            : this.serverError
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
    return ws;
  }

  private scheduleRollover() {
    this.rolloverTimers.forEach(clearTimeout);
    this.rolloverTimers = [
      setTimeout(() => this.prepareNext(), ROLLOVER_PREPARE_MS),
      setTimeout(() => this.switchToNext(), ROLLOVER_FORCE_MS),
    ];
  }

  private prepareNext() {
    if (this.ended || this.next || this.conn?.kind !== "relay") return;
    this.nextReady = false;
    this.next = this.openSocket(this.part + 1);
  }

  /** Switch when it won't cut anyone off: the interviewer had the last word and finished. */
  private trySwitch() {
    if (!this.nextReady || this.ended) return;
    const quiet =
      !this.agentSpeaking &&
      !this.agentThinking &&
      this.userTurnStartedAt === null &&
      !this.pendingClose &&
      this.history.at(-1)?.role === "assistant";
    if (quiet) this.switchToNext();
    else this.rolloverTimers.push(setTimeout(() => this.trySwitch(), 500));
  }

  private switchToNext() {
    const next = this.next;
    if (!next || !this.nextReady || this.ended) return;
    const old = this.ws;
    if (this.nextSilence) clearInterval(this.nextSilence);
    this.nextSilence = null;
    this.next = null;
    this.nextReady = false;
    this.ws = next;
    this.part += 1;
    this.scheduleRollover();
    if (old) {
      old.onmessage = old.onclose = old.onerror = null;
      try {
        old.close(1000);
      } catch {
        // already closed
      }
    }
  }

  private dropNext() {
    if (this.nextSilence) clearInterval(this.nextSilence);
    this.nextSilence = null;
    const next = this.next;
    this.next = null;
    this.nextReady = false;
    if (next) {
      next.onmessage = next.onclose = next.onerror = null;
      try {
        next.close(1000);
      } catch {
        // already closed
      }
    }
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
    let msg: {
      type?: string;
      role?: "user" | "assistant";
      content?: string;
      description?: string;
      code?: string;
      total_latency?: number;
      stt_latency?: number;
      ttt_text_latency?: number;
      ttt_token_latency?: number;
      tts_latency?: number;
      functions?: { id: string; name: string; arguments?: string; client_side?: boolean }[];
    };
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
        // The interviewer replied: a directive is spent, so swap it back out.
        if (msg.role === "assistant" && this.steering) {
          this.steering = false;
          if (this.conn?.kind === "relay") this.sendJson({ type: "RelaySteer", directive: null });
          else this.sendThink(null);
        }
        if (msg.role && msg.content) {
          const line: TranscriptLine = { role: msg.role, content: msg.content };
          this.history.push({ role: msg.role, content: msg.content });
          if (msg.role === "user" && this.userTurnStartedAt !== null) {
            line.speakMs = Date.now() - this.userTurnStartedAt;
            this.userTurnStartedAt = null;
          }
          this.events.onLine(line);
        }
        break;
      case "LatencyReport":
        if (typeof msg.total_latency === "number") {
          this.latencies.push({
            total: msg.total_latency,
            stt: msg.stt_latency,
            llm: msg.ttt_text_latency ?? msg.ttt_token_latency,
            tts: msg.tts_latency,
          });
        }
        break;
      case "UserStartedSpeaking":
        // Barge-in: the candidate talked over the interviewer, so stop playback.
        this.stopPlayback();
        this.agentSpeaking = false;
        this.userSpokeSinceAgent = true;
        // The first start since their last turn; pauses mid-answer don't reset it.
        if (this.userTurnStartedAt === null) {
          this.userTurnStartedAt = Date.now();
          this.events.onTurnStart?.();
        }
        this.events.onStatus(this.muted ? "muted" : "listening");
        break;
      case "AgentThinking":
        this.agentThinking = true;
        this.events.onStatus("thinking");
        break;
      case "AgentStartedSpeaking":
        this.agentThinking = false;
        this.agentSpeaking = true;
        this.events.onStatus("speaking");
        break;
      case "AgentAudioDone": {
        // Audio may still be queued locally; flip back once it has played.
        const wait = Math.max(0, (this.playhead - (this.ctx?.currentTime ?? 0)) * 1000);
        setTimeout(() => {
          this.agentSpeaking = false;
          this.agentThinking = false;
          this.userSpokeSinceAgent = false;
          if (!this.ended) this.events.onStatus(this.muted ? "muted" : "listening");
          // The interviewer just finished talking: the natural moment to close.
          if (this.pendingClose) this.flushClose();
          // If the interviewer just said its closing line, hang up shortly after.
          if (this.pendingEnd) this.scheduleEnd(600);
          // ...and a good moment to move to the next relay connection, if one is waiting.
          this.trySwitch();
        }, wait);
        break;
      }
      case "InjectionRefused":
        // Someone was talking; try the close again at the next pause.
        if (this.lastClose && !this.pendingClose) this.pendingClose = this.lastClose;
        break;
      case "FunctionCallRequest":
        for (const f of msg.functions ?? []) {
          if (!f.client_side) continue;
          if (f.name !== "end_interview") {
            this.sendJson({ type: "FunctionCallResponse", id: f.id, name: f.name, content: "Unknown function." });
            continue;
          }
          let reason: EndReason = "candidate_asked";
          try {
            const r = JSON.parse(f.arguments ?? "{}").reason;
            if (r === "abusive" || r === "wellbeing") reason = r;
          } catch {
            // keep the default
          }
          this.sendJson({ type: "FunctionCallResponse", id: f.id, name: f.name, content: "The interview has ended. Say nothing more." });
          this.pendingEnd = { id: f.id, reason };
          this.scheduleEnd(2500);
        }
        break;
      case "FunctionCallCancelled":
        // The candidate kept talking before their turn was confirmed: the call is void.
        if (this.pendingEnd && msg.functions?.some((f) => f.id === this.pendingEnd!.id)) {
          this.pendingEnd = null;
          if (this.endTimer) clearTimeout(this.endTimer);
        }
        break;
      case "RelayError":
        this.serverError = msg.description || null;
        break;
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
    this.interviewerSamples += pcm.length;
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

  /**
   * Add instructions to the interviewer's prompt mid-interview, e.g. to start
   * wrapping up. Deepgram's UpdatePrompt appends to the current prompt; it does
   * not replace it, so pass only the new text.
   */
  addToPrompt(text: string) {
    this.promptAdditions.push(text);
    this.sendJson({ type: "UpdatePrompt", prompt: text });
  }

  /**
   * Ends the questions at the next quiet moment: right after the interviewer
   * finishes speaking, or now if nobody is talking. Adds `prompt` (closing rules)
   * and has the interviewer say `line` word for word. The model alone ignores
   * "wrap up" instructions, so the app decides when the interview closes.
   */
  closeAtNextPause(prompt: string, line: string) {
    this.pendingClose = { prompt, line };
    if (!this.agentSpeaking && !this.agentThinking && !this.userSpokeSinceAgent) this.flushClose();
  }

  private flushClose() {
    const close = this.pendingClose;
    if (!close || this.ended) return;
    this.pendingClose = null;
    this.lastClose = close;
    if (close.prompt) this.addToPrompt(close.prompt);
    this.say(close.line);
  }

  /**
   * A one-turn instruction for the interviewer's next reply, from the interview
   * controller (lib/interviewControl.ts). Sent while the candidate is still talking.
   */
  steer(directive: string) {
    // UpdateThink replaces the prompt, so only this directive is in it, and it comes
    // out again after the next reply. (UpdatePrompt would pile directives up.)
    this.steering = true;
    if (this.conn?.kind === "relay") return this.sendJson({ type: "RelaySteer", directive });
    if (!this.think) return this.addToPrompt(directive);
    this.sendThink(directive);
  }

  /** The base prompt plus anything appended since, plus at most one directive. */
  private sendThink(directive: string | null) {
    if (!this.think) return;
    const prompt = [this.think.prompt, ...this.promptAdditions, ...(directive ? [directive] : [])].join("\n\n");
    this.sendJson({ type: "UpdateThink", think: { ...this.think, prompt } });
  }

  /**
   * Has the interviewer say `line` at the next quiet moment, retrying if Deepgram
   * refuses while someone is talking. The controller's move-on line; the close
   * replaces it if both are pending.
   */
  sayAtNextPause(line: string) {
    if (this.pendingClose?.prompt) return;
    this.pendingClose = { line };
    if (!this.agentSpeaking && !this.agentThinking && !this.userSpokeSinceAgent) this.flushClose();
  }

  /** Have the interviewer say a specific line now. */
  say(message: string) {
    this.sendJson({ type: "InjectAgentMessage", message });
  }

  /**
   * Ends the call for end_interview once the interviewer is quiet: its closing line
   * may come before or after the function call, so wait for it to finish playing.
   */
  private scheduleEnd(ms: number) {
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = setTimeout(() => {
      const end = this.pendingEnd;
      if (!end || this.ended) return;
      // Still talking: AgentAudioDone will schedule this again.
      if (this.agentSpeaking || this.agentThinking) return;
      this.pendingEnd = null;
      this.events.onInterviewerEnded?.(end.reason);
    }, ms);
  }

  /** Response times and audio received, for the results page's Stats for nerds. */
  voiceStats(): VoiceStats {
    return { latencies: [...this.latencies], interviewerAudioMs: Math.round((this.interviewerSamples / OUTPUT_RATE) * 1000) };
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
    if (this.endTimer) clearTimeout(this.endTimer);
    this.rolloverTimers.forEach(clearTimeout);
    this.dropNext();
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
