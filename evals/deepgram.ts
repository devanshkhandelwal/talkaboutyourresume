import { AGENT_URL } from "@/lib/agentSettings";

// The interviewer side of an eval, run as a real Deepgram Voice Agent session:
// the same endpoint and Settings as a live interview. Candidate turns are sent as
// text with InjectUserMessage, which the agent treats as if the user had spoken;
// the interviewer's replies are read from ConversationText. Audio is ignored.

const TURN_TIMEOUT_MS = 90_000;

type Waiter = { resolve: (text: string) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> };

export class DeepgramInterviewer {
  private ws: WebSocket | null = null;
  private keepAlive: ReturnType<typeof setInterval> | null = null;
  private replyParts: string[] = [];
  private turn: Waiter | null = null;
  private promptUpdated: (() => void) | null = null;
  private waitForSettingsOnly = false;
  private thinkUpdated: (() => void) | null = null;
  private openedAt = 0;
  private closedAt = 0;
  private failure: Error | null = null;
  /** Every message type received, in order, for debugging. */
  readonly events: string[] = [];
  /** Set when the interviewer called end_interview, with its reason. */
  endedBy: string | null = null;

  /**
   * Connects, applies the settings, and resolves with the interviewer's spoken
   * greeting, or with "" once the settings apply when there is no greeting (a
   * session that continues a conversation from agent.context).
   */
  async start(settings: unknown): Promise<string> {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) throw new Error("DEEPGRAM_API_KEY is not set (add it to .env.local).");
    this.waitForSettingsOnly = !(settings as { agent?: { greeting?: string } })?.agent?.greeting;
    const greeting = this.nextTurn();
    // If connecting fails, start() rejects below and nobody awaits `greeting`; its
    // later rejection must not crash the whole eval run.
    greeting.catch(() => {});
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(AGENT_URL, ["token", key]);
      ws.binaryType = "arraybuffer";
      this.ws = ws;
      ws.onopen = () => {
        this.openedAt = Date.now();
        ws.send(JSON.stringify(settings));
        // No mic here, so stream silence like a muted call: Deepgram closes sessions
        // that receive no audio for a while. 100 ms of 16 kHz, 16-bit mono = 3,200 bytes.
        const silence = new ArrayBuffer(3200);
        this.keepAlive = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(silence);
        }, 100);
        resolve();
      };
      ws.onerror = () => reject(new Error("Couldn't connect to Deepgram."));
      ws.onclose = (e) => {
        this.closedAt ||= Date.now();
        this.fail(new Error(this.failure?.message ?? `Deepgram closed the session (${e.code}${e.reason ? `: ${e.reason}` : ""}).`));
      };
      ws.onmessage = (e) => {
        if (typeof e.data === "string") this.handle(e.data);
      };
    });
    return greeting;
  }

  /** Sends what the candidate "said" and resolves with the interviewer's reply. */
  say(text: string): Promise<string> {
    const reply = this.nextTurn();
    this.send({ type: "InjectUserMessage", content: text });
    return reply;
  }

  /** Makes the interviewer say an exact line (InjectAgentMessage); resolves once it's said. */
  speak(message: string): Promise<string> {
    const said = this.nextTurn();
    this.send({ type: "InjectAgentMessage", message });
    return said;
  }

  /** Adds to the interviewer's prompt mid-session, like the live wrap-up (UpdatePrompt appends). */
  addToPrompt(text: string): Promise<void> {
    return new Promise((resolve) => {
      this.promptUpdated = resolve;
      this.send({ type: "UpdatePrompt", prompt: text });
      // Don't hang if the acknowledgment never comes.
      setTimeout(resolve, 5000);
    });
  }

  /** Replaces the interviewer's think settings, prompt included (UpdateThink); resolves on ThinkUpdated. */
  updateThink(think: unknown): Promise<void> {
    return new Promise((resolve) => {
      this.thinkUpdated = resolve;
      this.send({ type: "UpdateThink", think });
      setTimeout(resolve, 5000);
    });
  }

  close() {
    if (this.keepAlive) clearInterval(this.keepAlive);
    this.closedAt ||= Date.now();
    try {
      this.ws?.close();
    } catch {}
  }

  /** Seconds the session was open: what Deepgram bills. */
  seconds(): number {
    return this.openedAt ? ((this.closedAt || Date.now()) - this.openedAt) / 1000 : 0;
  }

  private nextTurn(): Promise<string> {
    if (this.failure) return Promise.reject(this.failure);
    this.replyParts = [];
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error("Deepgram didn't reply within 90 seconds.")), TURN_TIMEOUT_MS);
      this.turn = { resolve, reject, timer };
    });
  }

  private handle(raw: string) {
    let msg: { type?: string; role?: string; content?: string; description?: string; code?: string; functions?: { id: string; name: string; arguments?: string; client_side?: boolean }[] };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type) this.events.push(msg.type === "Warning" ? `Warning: ${msg.description ?? msg.code ?? ""}` : msg.type);
    switch (msg.type) {
      case "SettingsApplied":
        if (this.waitForSettingsOnly && this.turn) {
          const t = this.turn;
          this.turn = null;
          clearTimeout(t.timer);
          t.resolve("");
        }
        break;
      case "ConversationText":
        if (msg.role === "assistant" && msg.content) this.replyParts.push(msg.content);
        break;
      case "FunctionCallRequest":
        // The app's end_interview: answer it like the live page, and remember why.
        for (const f of msg.functions ?? []) {
          if (!f.client_side) continue;
          let reason = "unknown";
          try {
            reason = JSON.parse(f.arguments ?? "{}").reason ?? reason;
          } catch {}
          if (f.name === "end_interview") this.endedBy = reason;
          this.send({ type: "FunctionCallResponse", id: f.id, name: f.name, content: f.name === "end_interview" ? "The interview has ended. Say nothing more." : "Unknown function." });
        }
        break;
      case "AgentAudioDone":
        // The reply is complete once its audio has been sent.
        if (this.turn && this.replyParts.length) {
          const t = this.turn;
          this.turn = null;
          clearTimeout(t.timer);
          t.resolve(this.replyParts.join(" ").trim());
        }
        break;
      case "ThinkUpdated":
        this.thinkUpdated?.();
        this.thinkUpdated = null;
        break;
      case "PromptUpdated":
        this.promptUpdated?.();
        this.promptUpdated = null;
        break;
      case "Error":
        this.fail(new Error(`Deepgram error: ${msg.description || msg.code || "unknown"}`));
        break;
    }
  }

  private fail(err: Error) {
    this.failure ??= err;
    if (this.turn) {
      const t = this.turn;
      this.turn = null;
      clearTimeout(t.timer);
      t.reject(this.failure);
    }
  }

  private send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }
}
