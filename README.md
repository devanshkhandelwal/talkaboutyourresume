# talkaboutyourresume

Practice talking about your own resume with an AI interviewer, out loud, and get specific feedback.

**Flow:** upload resume → pick an interviewer and add what you want to tighten up → live voice interview → feedback with "Retry this answer".

## Stack

| Piece | What it does |
|---|---|
| Next.js 15 (App Router) | Pages and API routes, deployed on Vercel |
| Claude API | Reads the resume into interview topics (`/api/resume`) and writes the feedback report (`/api/feedback`) |
| Deepgram Voice Agent | The live interview: speech to text, the interviewer's brain (Claude via Deepgram), and the voice |
| Upstash Redis (optional) | Per-IP daily limits and the email list |

During the beta, resumes, transcripts and feedback live only in the user's browser tab (sessionStorage). Nothing is stored server-side except emails people choose to leave.

## Run it locally

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY and DEEPGRAM_API_KEY
npm run dev                  # http://localhost:3000
```

Use Chrome and headphones for testing. The interview needs microphone permission.

## Deploy (about 10 minutes)

1. Push this repo to GitHub (private is fine).
2. Go to vercel.com → **Add New Project** → import the repo. Framework is detected automatically.
3. Add environment variables from `.env.example` (at least `ANTHROPIC_API_KEY` and `DEEPGRAM_API_KEY`).
4. Deploy. Every push to `main` redeploys; every pull request gets a preview URL.
5. **Before sharing publicly:**
   - Set a **spending limit** in the Deepgram console and the Anthropic console.
   - Create a free Upstash Redis database, add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, so the daily limit per person is enforced.
   - Point your domain at Vercel (Project → Settings → Domains).

## Where things live

```
app/
  page.tsx              Landing page (rotating role examples, pricing)
  setup/page.tsx        Resume card, interviewer picker, "tighten up" note
  interview/page.tsx    Live session: avatar, clock, mute, camera, captions, "Give me a moment"
  feedback/page.tsx     Best moment, progress bar, answer verdicts, retry, transcript, email
  api/resume            PDF/DOCX → text → Claude → interview topics
  api/session           Limits, Deepgram temporary token, builds the interviewer's Settings
  api/feedback          Transcript → Claude → feedback report
  api/waitlist          Saves emails (Upstash, or logs if not configured)
  api/deepgram-balance  Public "N free interviews left" badge (Deepgram balance, cached 60 s)
lib/
  interviewers.ts       The six personalities, voices and greetings  ← tune these most
  prompts.ts            The interviewer system prompt and follow-up rules
  voice/agent.ts        Browser side of the Deepgram websocket (mic in, voice out, barge-in)
  config.ts             BETA flag, free minutes, Pro price, cost per interview estimate, COST_RATES  ← update prices here
  cost.ts               Per-interview cost ledger (browser only): Deepgram voice time + Claude token usage
  fillers.ts            Filler word patterns (FILLER_PATTERNS) and the counter for the feedback page  ← tune here
  heatmap.ts            Places resume claims on resume lines and colors them by the weakest answer
components/Avatar.tsx   Placeholder faces with talking mouth frames
public/mic-processor.js Mic → 16 kHz PCM on the audio thread
```

## Costs (approximate)

Deepgram Voice Agent at the Standard tier is about **$0.075 per minute** (the default think model, `claude-haiku-4-5`, is billed at Standard). A full 15-minute free interview costs about $1.13, plus a few cents of Claude for the resume read and feedback. The live cost shown during each interview uses `COST_RATES` in `lib/config.ts`.

## Things to verify on first deploy

- **Browser auth to Deepgram.** The client opens the websocket with the subprotocol `["bearer", <temporary token>]`. If the console shows the socket closing right away, check Deepgram's current docs for browser auth with temporary tokens and adjust `lib/voice/agent.ts`.
- **Model names.** Defaults are in `.env.example`. If a model is rejected, swap it via env vars, no code change needed.

## Roadmap (already designed)

- Emailed "Join interview" reminders (the calendar invite is done; email needs a sending service such as Resend)
- Pro plan ($20/month, 100 minutes, all interviewers) with Stripe; set `BETA = false`
- Accounts so feedback and progress persist
- Waiting room with mic check, sounds (upload whoosh, finish chime)
- Full avatar expression set mapped to the interviewer's reactions
- Verified profiles that employers can search
