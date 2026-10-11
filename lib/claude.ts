import Anthropic from "@anthropic-ai/sdk";

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
 * Asks Claude for a JSON object. The reply comes back through a forced tool call,
 * so the API hands us a parsed object instead of text we have to parse ourselves
 * (free-text JSON broke on raw newlines and stray comments). The shape is described
 * in the system prompt.
 */
export async function askJson<T>(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<T> {
  const res = await claude().messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2000,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    tools: [
      {
        name: "respond",
        description: "Return the result as a JSON object with the shape described in the system prompt.",
        input_schema: { type: "object", additionalProperties: true },
      },
    ],
    tool_choice: { type: "tool", name: "respond" },
  });
  if (res.stop_reason === "max_tokens") throw new Error("Model reply was cut off (max_tokens)");
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Model did not return JSON");
  return block.input as T;
}
