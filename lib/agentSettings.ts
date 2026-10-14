import type { Interviewer } from "./interviewers";

/** Deepgram's Voice Agent endpoint, used by the browser and by the evals. */
export const AGENT_URL = "wss://agent.deepgram.com/v1/agent/converse";

/** The interviewer's model and temperature inside Deepgram (the "think" step). */
export const THINK_TEMPERATURE = 0.8;
export function thinkModel(): string {
  return process.env.DEEPGRAM_THINK_MODEL || "claude-haiku-4-5";
}

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
        provider: {
          type: "deepgram",
          model: "nova-3",
          smart_format: false,
          // No filler_words here: the voice agent rejects it and closes the session, even
          // though Deepgram's plain speech-to-text supports it. So "um" and "uh" are dropped.
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
