# Manifest v6 Phase 1 κ Re-Calibration — Exit Memo

**Date:** 2026-04-24  **Target:** PM-RATIFY-V6-KAPPA  **v6 anchor:** `60d061e`

## Verdict: **PASS** (κ_conservative_trio = 0.7878 ≥ 0.70)

## Three pairwise Cohen's κ (n=100)

| Pair | Agree | κ |
|------|-------|-----|
| Opus vs GPT | 93/100 | **0.8480** |
| Opus vs MiniMax | 93/100 | **0.8549** |
| GPT vs MiniMax | 90/100 | **0.7878** (min) |

**Notable:** MiniMax agrees with Opus *more* than GPT does (0.8549 > 0.8480). Swap validated empirically. v5 historical baseline (Fleiss κ=0.7458 three-way) is consistent with v6's pairwise Opus-GPT of 0.8480 — sanity check PASSES.

## MiniMax operational metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Parse rate | ≥95/100 | **100/100** | MET |
| Latency p50 | ≤25 s | **11.9 s** | MET |
| Latency p95 | — | 31.4 s | — |
| OR routing errors | <5% | **0/100** | MET |
| Retries | — | 0 | clean |

## Per-cell κ_trio (lowest of three pairwise per cell)

| Cell | κ_trio | Notes |
|------|--------|-------|
| no-context | 1.0000 | perfect unanimity |
| retrieval | 0.8936 | strong |
| full-context | 0.7000 | acceptable |
| oracle-context | 0.7059 | acceptable |
| **agentic** | **0.6875** | **BORDERLINE at cell-level** (GPT-MiniMax pair) |

Agentic dips into borderline band at cell level — flag for PM but does not block PASS verdict since aggregate trio meets bar.

## Cost / wall-clock

- 100 calls, 0 retries, 0 failures
- Tokens: 53,855 prompt + 48,920 completion
- **Cost actual: ~$0.075** (cap $30 Phase 1)
- **Wall-clock: ~24.2 min** (14:09-14:34 UTC) (cap 90 min)

## PM next step

Phase 1 complete. Awaiting `PM-RATIFY-V6-KAPPA` for Phase 2 (N=400) authorization. `cc1_state: HALTED`.
