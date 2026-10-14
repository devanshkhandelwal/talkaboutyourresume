import { AGENT_URL, LISTEN, buildAgentSettings } from "@/lib/agentSettings";
import { INTERVIEWERS } from "@/lib/interviewers";

// Turn-taking check: does the interviewer cut in when you pause mid-sentence to
// think? Speaks a real answer into a Deepgram Voice Agent session (Deepgram TTS,
// streamed in real time like a microphone): "So the hardest part was, um," then a
// pause, then the rest. Reports whether the answer arrived as one turn and how
// long the interviewer took to reply after you actually finished.
//
//   npm run eval:pauses                          # production settings, 2.5 s and 4 s pauses
//   npm run eval:pauses -- --eot 0.8,0.9 --pauses 2500,4000,6000
//
// Needs DEEPGRAM_API_KEY. Costs about a cent of Deepgram per trial.

try {
  process.loadEnvFile(".env.local");
} catch {}
const KEY = process.env.DEEPGRAM_API_KEY;

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const EOTS = (arg("eot") ?? String(LISTEN.eotThreshold)).split(",").map(Number);
const PAUSES = (arg("pauses") ?? "2500,4000").split(",").map(Number);

const BYTES_PER_SEC = 16000 * 2; // 16 kHz, 16-bit mono

async function speak(text: string): Promise<Buffer> {
  const res = await fetch("https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=linear16&sample_rate=16000&container=none", {
    method: "POST",
    headers: { Authorization: `Token ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`Deepgram TTS ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
const silence = (ms: number) => Buffer.alloc(Math.round((BYTES_PER_SEC * ms) / 1000));

type Trial = { turns: number; replyAfterFinish: number | null; cutIn: boolean };

async function trial(eot: number, audio: Buffer, speechEnds: number): Promise<Trial> {
  const interviewer = { ...INTERVIEWERS[1], patience: eot };
  const settings = buildAgentSettings({ interviewer, prompt: "You are a job interviewer. Reply in one short sentence.", greeting: "Tell me about the hardest problem you worked on." });
  const ws = new WebSocket(AGENT_URL, ["token", KEY!]);
  ws.binaryType = "arraybuffer";
  let t0 = 0;
  let turns = 0;
  const replies: number[] = [];
  await new Promise<void>((resolve, reject) => {
    ws.onerror = () => reject(new Error("Couldn't connect to Deepgram."));
    ws.onopen = () => ws.send(JSON.stringify(settings));
    ws.onmessage = async (e) => {
      if (typeof e.data !== "string") return;
      const m = JSON.parse(e.data);
      if (m.type === "Error") reject(new Error(m.description));
      if (t0 && m.type === "ConversationText") {
        const at = (Date.now() - t0) / 1000;
        if (m.role === "user") turns++;
        else replies.push(at);
      }
      if (m.type === "AgentAudioDone" && !t0) {
        // The greeting is done: "say" the answer in real time, 100 ms frames.
        t0 = Date.now();
        const all = Buffer.concat([audio, silence(9000)]);
        for (let i = 0; i < all.length && ws.readyState === WebSocket.OPEN; i += 3200) {
          ws.send(all.subarray(i, i + 3200));
          await new Promise((r) => setTimeout(r, 100));
        }
        ws.close();
        resolve();
      }
    };
  });
  const cutIn = replies.some((r) => r < speechEnds);
  const last = replies.filter((r) => r >= speechEnds)[0];
  return { turns, cutIn, replyAfterFinish: last === undefined ? null : Math.round((last - speechEnds) * 10) / 10 };
}

(async () => {
  if (!KEY) throw new Error("DEEPGRAM_API_KEY is not set (add it to .env.local).");
  const a = await speak("So the hardest part was, um,");
  const b = await speak("figuring out why some customers got charged twice when they double tapped pay.");
  console.log("| Flux eot_threshold | Pause | One turn? | Cut in mid-sentence? | Reply after you finish |");
  console.log("|---|---|---|---|---|");
  for (const eot of EOTS) {
    for (const pause of PAUSES) {
      const audio = Buffer.concat([a, silence(pause), b]);
      const speechEnds = audio.length / BYTES_PER_SEC;
      const r = await trial(eot, audio, speechEnds);
      console.log(`| ${eot} | ${pause / 1000} s | ${r.turns === 1 ? "yes" : `no (${r.turns})`} | ${r.cutIn ? "yes" : "no"} | ${r.replyAfterFinish === null ? "–" : `${r.replyAfterFinish} s`} |`);
    }
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
