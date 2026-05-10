# §1.3g Judge Swap Validation — Memo

**Date:** 2026-04-24 · **Target:** PM-RATIFY-JUDGE-SWAP-VALIDATION.

## Aggregate verdict: **MULTI_PASS** — all 4 candidates κ=1.0 vs Opus+GPT consensus (parsed subset).

| Cand | κ | parse | p50 lat | routing |
|------|-----|-------|---------|---------|
| kimi-k2.6 | 1.0000 | 20/20 | 32 s | direct api.moonshot.ai |
| minimax-m2.7 | 1.0000 | 20/20 | 12 s | openrouter |
| deepseek-v4-pro | 1.0000 | 18/20 | 12 s | direct api.deepseek.com |
| glm-5.1 | 1.0000 | 19/20 | 9 s | direct api.z.ai |

**Sample caveat:** 0/20 Opus-GPT splits vs 7/100 full-set → first-4-per-
cell biased toward agreement; κ=1.0 is "match on biased subset", not
arbitrary LoCoMo. Task 2.6: stratified split-oversampled re-probe.

## Ranking (κ-tied → speed × parse × direct)

1. **ZHIPU GLM-5.1** (primary) — fastest, direct.
2. **DEEPSEEK V4-Pro** (backup) — direct, 18/20.
3. MiniMax — 20/20 but OpenRouter dep.
4. Kimi — 20/20 but p50=32 s → ~20 hr N=400 judge thread, deal-breaker.

## Notes

- Kimi: `temperature` omitted + `max_tokens=4096` (reasoning; parallels Opus/GPT-5.x at judge-client.ts:88).
- MiniMax direct: `invalid api key` (implied missing GroupId); OR fallback per brief §2.2.

**Cost:** ~$0.25 (<< $8). **Wall-clock:** ~35 min. **SDKs:** stdlib urllib only.
