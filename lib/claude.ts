import Anthropic from "@anthropic-ai/sdk";
import type { ClaudeUsage } from "./types";

let client: Anthropic | null = null;

export function claude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export const MODELS = {
  resume: process.env.ANTHROPIC_RESUME_MODEL || "claude-haiku-5-5",
  feedback: process.env.ANTHROPIC_FEEDBACK_MODEL || "claude-sonnet-5-5",
};

/**
 * Asks Claude for a JSON object. The reply comes back through a tool call,
 * so the API hands us a parsed object instead of text we have to parse ourselves
 * (free-text JSON broke on raw newlines and stray comments). Each caller supplies
 * the JSON Schema for the result. Token usage comes back alongside it, so the
 * browser can show what the call cost.
 */
export async function askJson<T>(opts: {
  model: string;
  system: string;
  user: string;
  /** JSON Schema for the result object. */
  schema: Record<string, unknown>;
  maxTokens?: number;
  /** Omit for the model's default; 0 for repeatable output (the eval judge). */
  temperature?: number;
}): Promise<{ data: T; usage: ClaudeUsage }> {
  const res = await claude().messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2000,
    ...(opts.temperature === undefined ? {} : { temperature: opts.temperature }),
    system: `${opts.system}\n\nDeliver your answer by calling the \`respond\` tool exactly once. Do not reply with text.`,
    messages: [{ role: "user", content: opts.user }],
    tools: [
      {
        name: "respond",
        description: "Return the result.",
        input_schema: opts.schema as Anthropic.Tool.InputSchema,
      },
    ],
    // Not forced: some models (e.g. Sonnet 5.5) reject tool_choice "tool" / "any".
    tool_choice: { type: "auto" },
  });
  if (res.stop_reason === "max_tokens") throw new Error("Model reply was cut off (max_tokens)");
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Model did not return JSON");
  const usage: ClaudeUsage = {
    model: opts.model,
    input_tokens: res.usage.input_tokens,
    output_tokens: res.usage.output_tokens,
    ...(res.usage.cache_creation_input_tokens ? { cache_creation_input_tokens: res.usage.cache_creation_input_tokens } : {}),
    ...(res.usage.cache_read_input_tokens ? { cache_read_input_tokens: res.usage.cache_read_input_tokens } : {}),
  };
  return { data: block.input as T, usage };
}
