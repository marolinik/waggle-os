# Judge-Delta — GAIA 2 search N=160 self-judge vs independent trio

**Date:** 2026-05-22 · Phase 1 (judge integrity) of the harness benchmark plan
**Purpose:** the search split is judged ~entirely by the LLM `user_message_checker`
(semantic equivalence of the agent's final answer vs the oracle answer; no app-action
oracle events to hard-match). The production run self-judged (Sonnet 4.6 judging a
Sonnet 4.6 agent), so we re-judged with an independent trio to detect inflation.

## Method (controlled — only the judge model varies)

Imported GAIA 2's **own** `user_message_checker` — same system prompt, same few-shot
examples, same `[[Success]]/[[Failure]]` parsing (`gaia2_core.judge.prompts` +
`LLMChecker`). For each of the 148 answerable scenarios extracted (task, agent final
message, oracle reference) and re-ran the checker with three independent judges. Only
the judge MODEL changed. Mirrors the C-1 LOCOMO trio-strict discipline.

Judges: **Opus 4.7 · Gemini 2.5 Pro · GPT-5** (M6 roster, all independent of the
Sonnet 4.6 agent+self-judge). Engine omits `temperature` uniformly (Opus 4.7 / GPT-5
reject it); `num_votes=1`. Script: `rejudge_user_message.py`. Raw: `runs/rejudge-search-n160.jsonl`.

Denominator = **148 answerable** (160 scenarios − 12 with no final answer / errored).

## Results

| Judge | PASS | Rate (n=148) |
|---|---:|---:|
| **Self — Sonnet 4.6** (production) | 134 | **90.5%** |
| Opus 4.7 | 134 | 90.5% |
| Gemini 2.5 Pro | 133 | 89.9% |
| GPT-5 | 132 | 89.2% |
| **Trio-strict** (all 3 independent agree PASS) | 129 | **87.2%** |
| Trio-majority (≥2/3 independent PASS) | 135 | 91.2% |

**Agreement with the self-judge:** Opus 98.6% · Gemini 98.0% · GPT-5 97.3%.

## Verdict — self-judge is NOT inflated

- Independent single judges land within **0.6–1.3pp** of the Sonnet self-judge.
- **Trio-strict is only −3.3pp** below self (90.5% → 87.2% on n=148) — well within
  cross-LLM-judge norms, and far tighter than LOCOMO's +5.3pp self-judge inflation.
- Only **6/148 (4%)** scenarios are marginal (self-PASS but not unanimous across the trio):
  `21_csyctc, 22_52pwi3, 23_onhtod, 26_oqrx9a, 30_69r1z7, 30_9uo633`.

**The 83.8% GAIA 2 search result was not a self-grading artifact.** The harness-quality
signal is real and independently confirmed.

## Mapping to the full split (N=160 denominator)

| Metric | Self (Sonnet) | Trio-strict |
|---|---:|---:|
| n=148 answerable | 90.5% | 87.2% |
| **N=160 full (errors/unanswerable count against)** | **83.8%** | **~80.6%** (129/160) |

**Defensible public framing:** *"GAIA 2 search split, N=160 — 83.8% self-judged,
independently confirmed at 80.6% trio-strict (Opus 4.7 + Gemini 2.5 Pro + GPT-5,
GAIA 2's own checker, judges agree 97–99%)."*

## Caveat (carried forward)

This validates the **harness-cell judging**, but the harness was **Hermes** (a third-party
reference agent), NOT Waggle's own `runAgentLoop`. Pillar-1 (Waggle harness SOTA) still
requires the `waggle_worker` build to put Waggle's loop in the same rig. See plan doc.
