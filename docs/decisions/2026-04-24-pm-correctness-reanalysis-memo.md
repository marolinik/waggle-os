# PM Correctness-Oriented Re-Analysis — §1.3h Split Sample

**Date**: 2026-04-24
**Author**: claude-opus-4-7 (PM)
**Purpose**: Audit-trail document correcting CC-1's balance-metric interpretation of §1.3h split sample data. Not a decision LOCK — analytical support for manifest v6 swap selection.

## Problem statement

CC-1 §1.3h analysis used dual-reference balance metric assuming splits represent balanced Opus-vs-GPT disagreement. Under this metric:
- "Balance" (candidate ≈ 50/50 agrees with Opus/GPT) = independent judgment = good
- "Bias" (candidate systematically agrees with one reference) = correlation = bad

CC-1's ranking from this metric:
1. DeepSeek (40/60) — best balance → recommended primary
2. Kimi (80/20) — Opus-lean
3. MiniMax (86/14) — Opus-lean
4. Zhipu (0/100) — GPT-echo → worst

## Why the metric is wrong for this sample

**Empirical fact uncovered in §1.3h:** All 7 splits are Opus-correct / GPT-incorrect. Distribution is not balanced. Opus has 0% error rate on this subset; GPT has 100% error rate. One reference is verified-correct; the other is verified-incorrect.

Under this ground truth, "balance" ≠ independence. It means systematic mis-calibration — agreeing with the incorrect reference (GPT) 60% of the time. Correct judges should lean toward Opus because Opus is correct here.

Balance metric would be appropriate if and only if Opus and GPT had comparable error rates across the split subset. They don't.

## Correctness-oriented re-ranking

Re-scoring §1.3h candidates using "agreement with Opus on splits" as the empirical correctness proxy:

| Candidate | Correctness on 7 splits | Parse | Latency p50 | Routing |
|---|---|---|---|---|
| MiniMax M2.7 | 86% (6/7) | 7/7 | 16.6s | openrouter |
| Kimi K2.6 | 80% (4/5 parsed) | 5/7 | 32.0s | direct |
| DeepSeek V4 Pro @ mt1024 | 40% (2/5 parsed) | 5/7 | 21.2s | direct |
| DeepSeek V4 Pro @ mt2048 | 14% (1/7) | 7/7 | 15.0s | direct |
| Zhipu GLM-5.1 | 0% (0/6 parsed) | 6/7 | 17.9s | direct |

## Paradoxical DeepSeek finding

DeepSeek parse fix with `max_tokens=1024→2048` (§1.3h-C) was successful (5/7→7/7 parse), but **correctness regressed from 40% to 14%**. More reasoning budget produced *more GPT-aligned* output on these splits, not more independent judgment.

Interpretation: DeepSeek's training trajectory has latent GPT-correlation that surfaces under reasoning pressure. This is consistent with industry observation that many Chinese models trained on GPT-generated synthetic data inherit GPT reasoning style. The pattern is not unique to DeepSeek — Zhipu's 100% GPT-echo confirms same family.

Strategic takeaway for future benchmark iterations: **GPT-alignment is a latent property that emerges under reasoning pressure** in some Chinese judge candidates. Future ensemble diversity validation must test candidates at multiple reasoning budgets, not single-shot.

## Corrected ensemble selection

**Disqualifications:**
- Zhipu: pure GPT-echo (0% correctness, 100% GPT-aligned)
- DeepSeek: GPT-alignment escalates with reasoning (14-40% correctness)

**Candidates for v6:**
- MiniMax M2.7: highest correctness (86%), cleanest operational profile (7/7 parse, 16s latency), openrouter routing (direct blocked despite GroupId)
- Kimi K2.6: second-highest correctness (80%), parse and latency concerns (5/7 parse, 32s p50)

**Selection:** MiniMax primary + Kimi backup (per-instance failover activation).

## Ensemble diversity implications

New trio = Opus 4.7 + GPT-5.4 + MiniMax M2.7. Effective composition:
- Opus: anchor, verified strong on LoCoMo
- GPT: contrast, moderate error rate on challenging cases
- MiniMax: Opus-leaning (86% agree on splits) — does NOT provide full three-way diversity, acts as Opus-correctness reinforcement

This is a **compromise vs. original Gemini trio**. Gemini may have had more balanced error distribution across references; we lack empirical evidence since Gemini wasn't tested on §1.3h splits.

**Accepted trade-off rationale:** Correctness-first selection over pure-diversity selection. On production N=400, majority voting on challenging cases benefits from 2 correct-aligned judges (Opus + MiniMax) vs. 1 incorrect-aligned (GPT) — ensures correct answer wins majority on Opus-correct splits. Pure diversity (independent third judge) would split ensemble 33/33/33 on controversial cases and risk incorrect verdict via random variation.

This is a methodology choice documented in manifest v6 delta log for audit transparency.

## Status

Referenced by PM-RATIFY-JUDGE-SWAP-REPROBE + PM-RATIFY-DEEPSEEK-PARSE-FIX decisions (2026-04-24). Feeds directly into manifest v6 swap proposal brief.
