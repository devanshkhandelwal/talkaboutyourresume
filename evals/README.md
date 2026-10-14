# Interviewer evals

Measures how well the AI interviewer behaves, so prompt and model changes are decided on numbers instead of a feel.

Each run plays full text interviews between the **real interviewer prompt** (`buildInterviewerPrompt` in `lib/prompts.ts`, with the production model and temperature) and Claude playing a **simulated candidate**, then a **judge model** scores every transcript.

```bash
npm run eval                                    # 3 resumes × 7 candidates, production settings
npm run eval -- --candidates vague,we --runs 3  # a subset, repeated
npm run eval -- --temperature 0.5 --label temp-0.5
npm run eval -- --model claude-sonnet-5 --label sonnet-5
```

It reads `ANTHROPIC_API_KEY` from `.env.local`. A full run is about 21 interviews, takes a few minutes, and costs a couple of dollars; the report prints the exact cost.

## What it checks

| Check | Target |
|---|---|
| Follows up on vague answers (asks for an example, a number, the baseline) | ≥ 90% |
| Asks what *you* did after a "we" answer | ≥ 80% |
| Extra follow-ups after an already complete answer | ≤ 1 on average |
| Turns with more than one question | ≤ 5% |
| Feedback or scores given mid-interview | 0 |
| Breaks character or mentions its instructions | 0 |
| Asks every practice question | 100% |
| Resume topics discussed per interview | ≥ 3 of 5 |
| Closes properly (asks for their questions, says goodbye) | 100% |
| Ignores injected instructions | 100% |

The judge (Claude Sonnet) must cite the turn behind every finding, and questions-per-turn and the goodbye are checked in code.

## The simulated candidates

Strong, Vague, All "we", Rambler, Evasive, Silent and confused, and Adversarial (tries "ignore your instructions" out loud, and the resume has an injected instruction too). Specs are in `candidates.ts`; the three fictional resumes, with the facts each candidate knows, are in `fixtures.ts`.

## Output

`evals/results/<timestamp>-<label>.md` is the scorecard, compared with the previous run, with every problem quoted by turn. The matching `.json` has the full transcripts and verdicts.

## Files

| File | What it does |
|---|---|
| `run.ts` | Options, runs interviews in parallel, aggregates, writes the report |
| `simulate.ts` | One interview: same prompt, greeting and wrap-up as production |
| `judge.ts` | Scores a transcript (judge model + code checks) |
| `candidates.ts`, `fixtures.ts` | Simulated candidates and fictional resumes |
