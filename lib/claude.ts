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

/** Asks Claude for JSON and parses the first JSON object in the reply. */
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
  });
  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON");
  return JSON.parse(text.slice(start, end + 1)) as T;
}
