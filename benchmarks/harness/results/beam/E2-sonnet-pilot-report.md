# BEAM-1M E2 "protocol-match" pilot — Sonnet 4.6 answerer, dual judge

**Goal:** isolate how much of Eywa's BEAM lead is pure *answer-model + self-judge*
vs architecture, by re-answering our matched 50-Q pilot with Claude Sonnet 4.6 as
the ANSWERER and judging the SAME answers twice: Sonnet 4.6 (Eywa-style self-judge)
and gpt-5 (our canonical judge).

## Route + models
- **Answerer route:** OpenRouter (`https://openrouter.ai/api/v1`), key `OPENROUTER_API_KEY`.
  LiteLLM proxy (`localhost:4000`) was **down**, so per plan we used the OpenRouter fallback.
- **Answerer model id:** `anthropic/claude-sonnet-4.6` (verified via OpenRouter `/models`; 1-call smoke returned `OK`, provider=Anthropic).
- **Canonical judge model:** `gpt-5` (direct OpenAI, unchanged transport).
- **Self-judge model:** `anthropic/claude-sonnet-4.6` (same OpenRouter route as answerer).
- **Config (identical to gpt-5 baseline):** cell=retrieval, prompt=v2, top_k=30, raw dated turns, minds-1M. Only the answerer model changed; `buildAnswerGenerationPromptV2` and retrieval untouched.

## Cost
| item | $ |
|---|---|
| Sonnet answer + Sonnet self-judge run (50 Q) | 5.5584 |
| gpt-5 re-judge of the 50 Sonnet answers | 1.1050 |
| smokes (1-call + 1-question pipeline) | ~0.16 |
| **total** | **~6.82** |

(Slightly over the ~$6 soft cap. Sonnet's answers are long/verbose, inflating both
answer-output and judge-input tokens; the gpt-5 re-judge was cheap and is the core deliverable.)

## The 50 instance_ids (5 per ability × 10) — the EXACT prior gpt-5 matched sample
Reused verbatim (all prior 50-row pilots — rawv2/retv2-outline/retv3/ipbv2/hybrid — share the identical id set; verified by diff). Convs {1,10,11}.

```
conv 1  (q0,q1 each): abstention, contradiction_resolution, event_ordering,
        information_extraction, instruction_following, knowledge_update,
        multi_session_reasoning, preference_following, summarization, temporal_reasoning
conv 10 (q0,q1 each): same 10 abilities
conv 11 (q0 only):    same 10 abilities
```
Full list: `beam_1M_{1,10}_{ability}_{q0,q1}` + `beam_1M_11_{ability}_q0` for the 10 abilities above (50 ids). Saved to scratchpad `matched50.txt`.

## Headline results (same 50 Qs, all three arms)

| arm | answerer | judge | avg_score | pass% (n=50) |
|---|---|---|---|---|
| Baseline | gpt-5 | gpt-5 | **0.5533** | 64.0% (32) |
| Arm A (Eywa-style) | Sonnet 4.6 | Sonnet 4.6 (self) | **0.5808** | 62.0% (31) |
| Arm B | Sonnet 4.6 | gpt-5 | **0.6297** | 68.0% (34) |

> Note: the FULL-700 gpt-5 headline is 0.6482/74.0%; this specific 50-Q subset is
> harder for gpt-5 (0.5533/64%). All comparisons here are apples-to-apples on the SAME 50 ids.

## Per-ability avg_score (n=5 each)

| ability | Base (gpt5A/gpt5J) | Arm A (sonA/sonJ) | Arm B (sonA/gpt5J) |
|---|---|---|---|
| abstention | 0.200 | 0.350 | 0.300 |
| contradiction_resolution | 0.450 | 0.350 | 0.375 |
| event_ordering | 0.339 | 0.156 | 0.267 |
| information_extraction | 0.733 | 0.975 | 1.000 |
| instruction_following | 0.750 | 0.650 | 0.700 |
| knowledge_update | 0.500 | 0.700 | 0.800 |
| multi_session_reasoning | 0.717 | 0.717 | 0.692 |
| preference_following | 0.733 | 0.600 | 0.783 |
| summarization | 0.511 | 0.511 | 0.581 |
| temporal_reasoning | 0.600 | 0.800 | 0.800 |

## Decomposition (per-question paired deltas, avg_score)
- **Answer-model effect** (Arm B − Baseline; gpt-5 judges BOTH): **+0.0764** (0.6297 vs 0.5533). Pass% +4pp (68 vs 64).
- **Self-judge effect** (Arm A − Arm B; SAME Sonnet answers, judge swapped): **−0.0489** (Sonnet self-judge 0.5808 vs gpt-5 judge 0.6297).

## Read (one paragraph)
Under our own canonical gpt-5 judge, **Sonnet 4.6 is the better BEAM answerer**:
Sonnet answers score **+0.076 avg (+4pp pass)** above gpt-5 answers on the identical
50 Qs and identical retrieval/prompt — so the answer-model swap *helps*, and a real
chunk of any Sonnet-based system's BEAM number is genuine answer quality (biggest
gains: knowledge_update, information_extraction, preference_following, temporal;
regressions concentrated in contradiction_resolution and event_ordering). The
"self-judge" half tells the opposite of the inflation story: on the very same Sonnet
answers, **Sonnet's self-judge is *harsher* than gpt-5 by −0.049** (0.5808 vs 0.6297),
i.e. **no self-judge inflation is observed here — if anything, self-judge deflation**.
So Eywa's protocol (Sonnet answer + Sonnet self-judge) does *not* win by grading its
own homework leniently; on this matched sample it actually under-credits itself
relative to gpt-5. The answer-model contribution is positive and real (~+7.6 avg),
while the judge-swap contribution is small and negative — meaning the bulk of any
Eywa-vs-us BEAM gap that survives is attributable to the answer model and
architecture, not to judge leniency. Caveat: n=5/ability (n=50 total), single run,
no temperature averaging — treat per-ability cells as directional.

## Artifacts
- Sonnet answers + self-judge: `benchmarks/results/beam/E2-sonnet-answers.jsonl` (+ `.summary.json`)
- Same answers re-judged by gpt-5: `benchmarks/results/beam/E2-sonnet-answers.judged-gpt5.jsonl` (+ `.summary.json`)
- Baseline (gpt-5/gpt-5, full 700): `benchmarks/results/beam/beam-1m-FULL700-gpt5-retv2.jsonl` (filtered to the 50 ids)

## Code changes (local, uncommitted — pilot only)
- `src/beam-openai-client.ts`: `createBeamOpenAiClient` now routes Claude ids (`/claude|^anthropic\//`) through OpenRouter (`OPENROUTER_API_KEY`); added `anthropic/claude-sonnet-4.6` pricing (3/15 per 1M). gpt-*/o-series path unchanged.
- `scripts/beam-run-1m.ts`: added `--instance-ids <file>` exact-allowlist flag (reuses a prior matched sample; overrides `--per-ability`). Answer/retrieval/prompt logic untouched.
- `scripts/beam-rejudge.ts` (new): standalone re-judge — re-scores an existing answers jsonl with any judge model via the same transport-agnostic `judgeQuestion`; rubric recovered from each row's `nugget_scores[].nugget`.
