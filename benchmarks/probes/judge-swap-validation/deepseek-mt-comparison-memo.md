# DeepSeek `max_tokens` 1024→2048 — Comparison Memo

**Date:** 2026-04-24  **Parent:** `ae0d312`  **Target:** PM-RATIFY-DEEPSEEK-PARSE-FIX

## Parse issue: **truncation_fixable**

| Metric | mt=1024 | mt=2048 | Δ |
|--------|---------|---------|---|
| Parse | 5/7 (71%) | **7/7 (100%)** | +29 pp |
| Agree w/ Opus (= verified-correct) | 2/5 (40%) | **1/7 (14%)** | **−26 pp** |
| Agree w/ GPT | 3/5 (60%) | 6/7 (86%) | +26 pp |
| Latency p50 | 21.2 s | 15.0 s | −6.2 s |

Both recovered NULLs (completion_tokens=1053, 886) and 1 flipped verdict (conv-50_q015 oracle-context: `correct → incorrect`) land on GPT-side.

## Finding

Parse is TRUNCATION_FIXABLE at `max_tokens=2048`. **But correctness regressed under PM's corrected metric** — longer reasoning makes DeepSeek more GPT-strict, reducing its agreement with the verified-correct Opus reference on oriented splits. Gap in PM's decision matrix: parse improved + correctness regressed.

**Spirit-of-matrix → MiniMax primary + Kimi backup.** DeepSeek (14% correct) and Zhipu (0%) both fail correctness bar regardless of parse fix.

**Cost:** ~$0.05 (cap $0.50).  **Wall-clock:** ~2.4 min.

`cc1_state: HALTED`
