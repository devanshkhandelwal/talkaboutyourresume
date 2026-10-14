import type { Interviewer } from "./interviewers";

/** Deepgram's Voice Agent endpoint, used by the browser and by the evals. */
export const AGENT_URL = "wss://agent.deepgram.com/v1/agent/converse";

/** The interviewer's model and temperature inside Deepgram (the "think" step). */
export const THINK_TEMPERATURE = 0.8;
export function thinkModel(): string {
  return process.env.DEEPGRAM_THINK_MODEL || "claude-haiku-4-5";
}

/**
 * Turn-taking for the candidate's speech (Deepgram Flux). Measured with spoken
 * test audio, `npm run eval:pauses` ("So the hardest part was, um," + pause + rest):
 *   Nova-3 (before)  cut in under 1 s into the pause
 *   Flux 0.75        cuts in on 2.5 s pauses; replies ~0.9 s after you finish
 *   Flux 0.9         waits through 2.5 s pauses (4 s is borderline); replies ~1.7 s after
 *   Flux 0.95        same pauses as 0.9, replies ~2.6 s after
 * 0.9 by default; personas override it (Interviewer.patience).
 */
export const LISTEN = { eotThreshold: 0.9, eotTimeoutMs: 7000 };

/**
 * The Settings message that configures a Deepgram Voice Agent session: listening,
 * the interviewer's brain and voice, and the spoken greeting. Shared by
 * /api/session (live interviews) and evals/ (simulated ones), so evals test
 * exactly what users get.
 */
export function buildAgentSettings(o: { interviewer: Interviewer; prompt: string; greeting: string; model?: string; temperature?: number }) {
  return {
    type: "Settings",
    tags: ["talkaboutyourresume", o.interviewer.id],
    audio: {
      input: { encoding: "linear16", sample_rate: 16000 },
      output: { encoding: "linear16", sample_rate: 24000, container: "none" },
    },
    agent: {
      listen: {
        // Flux decides when you're done talking from what you're saying, not only
        // from silence, so a thinking pause mid-sentence ("and then I... um...")
        // doesn't hand the turn to the interviewer. Nova-3 ended turns on silence alone.
        provider: {
          type: "deepgram",
          version: "v2",
          model: "flux-general-en",
          // Confidence needed to end your turn (0.5-1.0); see LISTEN above.
          eot_threshold: o.interviewer.patience ?? LISTEN.eotThreshold,
          // Silence after which your turn ends regardless, so a finished answer
          // doesn't hang.
          eot_timeout_ms: LISTEN.eotTimeoutMs,
          // No filler_words: the voice agent rejected it and closed sessions.
        },
      },
      think: {
        provider: {
          type: "anthropic",
          model: o.model ?? thinkModel(),
          temperature: o.temperature ?? THINK_TEMPERATURE,
        },
        prompt: o.prompt,
      },
      speak: {
        provider: { type: "deepgram", model: o.interviewer.voice, speed: o.interviewer.speed },
      },
      greeting: o.greeting,
    },
  };
}
