// Temporary Deepgram tokens for direct mode (the browser connects to Deepgram itself).
// Server only: it uses the real key.

/**
 * How long a direct-mode token lives. It has to last the whole interview, not just
 * the socket opening: Deepgram re-checks the token on every UpdateThink (sent after
 * each exchange to keep the conversation in the prompt) and closes the interview
 * with "Invalid credentials." once it has expired. Two extra minutes cover the mic
 * setup between the grant and the socket opening. Deepgram allows up to an hour.
 */
export function directTokenTtl(sessionMinutes: number) {
  return Math.min(3600, Math.ceil(sessionMinutes * 60) + 120);
}

export async function grantDeepgramToken(key: string, ttlSeconds: number): Promise<string> {
  const grant = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl_seconds: ttlSeconds }),
    cache: "no-store",
  });
  if (!grant.ok) throw new Error(`grant ${grant.status}: ${await grant.text()}`);
  return ((await grant.json()) as { access_token: string }).access_token;
}
