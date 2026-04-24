# §1.3h Judge Swap Re-Probe — Exit Memo

**Date:** 2026-04-24  **Target:** PM-RATIFY-JUDGE-SWAP-REPROBE  **Parent:** `8a2f0e6`

## Verdict: **INCONCLUSIVE_BUT_OPERATIONAL_SIGNAL**

Split pool n=7 (use-all-available per PM amendment §1.3H OPTION 1). All 7 splits are `Opus=correct / GPT=incorrect` → split-only κ is structurally degenerate; **p_opus/p_gpt balance is the discriminating signal**.

## Novel finding (supersedes §1.3g heuristic)

| Cand | p_opus | p_gpt | Profile | κ_agg_cons (n=27) |
|------|--------|-------|---------|---------------------|
| **DeepSeek** | 40% | 60% | **Independent** | **0.709 (only PASS)** |
| Kimi | 80% | 20% | Opus-lenient | 0.576 |
| MiniMax | 86% | 14% | Opus-lenient | 0.456 |
| Zhipu | **0%** | **100%** | **GPT-echo** | 0.444 |

§1.3g κ=1.0 tie was selection bias toward unanimous cases. §1.3h exposes Zhipu as GPT clone on splits (low ensemble value); DeepSeek as only balanced independent judge.

## Recommendation

**Primary: DEEPSEEK** (with `max_tokens=2048` bump to address split-parse 71%)
**Backup: ZHIPU** (independence compromise if DeepSeek parse unresolved)

A 3-judge ensemble needs independent calibration; Zhipu's 100% GPT-lock-step violates this. Parse risk is mitigable (token ceiling); echo risk is structural.

## MiniMax routing

**`direct_failed_fell_back_openrouter`.** `api.minimaxi.com` and `api.minimax.chat` v2 rejected `MINIMAX_GROUP_ID + Bearer`. OpenRouter fallback 7/7. **Manifest v6 must route MiniMax via OpenRouter**; direct is not viable without further account research.

## Cost / wall-clock

- 28 split calls + 4 MiniMax direct-discovery attempts
- **Cost: ~$0.30** (cap $1.50)
- **Wall-clock: ~9 min** (14:09-14:18 UTC)

## PM next step

Adjudicate: (A) DeepSeek-boosted primary + Zhipu backup, (B) Zhipu primary + DeepSeek-boosted backup (operational-first), (C) DeepSeek mini-confirmation probe with bumped max_tokens before v6 emission. `cc1_state: HALTED`.
