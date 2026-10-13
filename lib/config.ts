// Flip to false once payments are live. During beta every interviewer
// is unlocked and the Pro card shows "Coming soon".
export const BETA = true;

export const FREE_MINUTES = 15;
export const PRO_PRICE = 20;
export const PRO_MINUTES = 100;

// Rough Deepgram spend per interview, used only for the "about N interviews"
// estimate in the beta credits badge. A full 15-minute Voice Agent session at the
// Standard tier is about $1.13, but most practice runs end sooner, so tune this
// against real usage in the Deepgram console.
export const DEEPGRAM_COST_PER_INTERVIEW = 0.6;

/**
 * Every rate the live cost display uses, in US dollars. Copy current prices from
 * the pricing pages when they change:
 * - Deepgram: https://deepgram.com/pricing (Voice Agent API, per minute of connection).
 *   The interviewer's Claude "think" model runs inside Deepgram and is billed in this
 *   per-minute rate, so it has no separate token cost here.
 * - Anthropic: https://www.anthropic.com/pricing#api (per million tokens). Cache writes
 *   are 1.25x the input price (5-minute cache), cache reads 0.1x.
 */
export const COST_RATES = {
  deepgramVoicePerMinute: 0.075,
  claudePerMillionTokens: {
    // Haiku 5.5 prices are for prompts up to 100K tokens; resumes are capped well below that.
    "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
    "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  } as Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }>,
  /** Used when ANTHROPIC_*_MODEL names a model that isn't listed above. Keep it at the priciest listed model so costs are never understated. */
  claudeFallbackModel: "claude-sonnet-5-5",
};
