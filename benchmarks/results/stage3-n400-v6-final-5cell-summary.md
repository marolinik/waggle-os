# Stage 3 — Manifest v6 N=400 — Final 5-Cell Summary

**Run window:** 2026-04-24T16:29:14Z → 2026-04-25T20:44Z (∼28 hours wall)
**Manifest:** `benchmarks/preregistration/manifest-v6-preregistration.yaml` (SHA-256 `5d5c1023421cd1a79f4913bb4c0a59415e21f50797255bff7dfec8e16b68e3ed`)
**Anchor commit:** `608f466` (recovery-patched wrapper)
**Subject model:** `qwen3.6-35b-a3b-via-dashscope-direct` (fallback `qwen3.6-35b-a3b-via-openrouter`)
**Judge ensemble:** Claude Opus 4.7 + GPT-5.4 + MiniMax M2.7 (via OpenRouter); 2-of-2 quorum on MiniMax failure per v6 §5.2.1 (Kimi backup retracted)
**Dataset:** LoCoMo v1531 raw (SHA-256 `79fa87e90f04081343b8c8debecb80a9a6842b76a7aa537dc9fdf651ea698ff4`); canonical jsonl SHA `39e415e2...`
**Sample design:** N=400 per cell, seed=42, `--parallel-concurrency 1` (cells executed sequentially per v6 §3 + §1.1 lock-semantics waiver)

## Per-cell results

| Cell | n_total | n_completed | n_failed (failure_mode) | accuracy=1 | pass_rate (full N) | pass_rate (completed) | median p50 | p95 of p95 | Subject $ | Judge $ |
|------|---------|-------------|--------------------------|------------|---------------------|------------------------|------------|------------|-----------|---------|
| no-context | 400 | 384 | **16 (`timeout`)** | 12 | **0.0300** | 0.03125 | 15,118 ms | 180,009 ms | $0.834 | $5.608 |
| oracle-context | 400 | 400 | 0 | 134 | **0.3350** | 0.3350 | 5,962 ms | 14,093 ms | $0.329 | $5.284 |
| full-context | 400 | 400 | 0 | 109 | **0.2725** | 0.2725 | 7,579 ms | 14,538 ms | $0.379 | $5.071 |
| retrieval | 400 | 400 | 0 | 89 | **0.2225** | 0.2225 | 8,554 ms | 20,520 ms | $0.514 | $5.736 |
| **agentic** | 400 | **395** | **5 (`agentic_error_TypeError`)** | 86 | **0.2150** | 0.21772 | 4,952 ms | 19,417 ms | $0.403 | $5.594 |

**Pass rate denominators (per v6 §9 — no post-hoc exclusion):** the canonical pass-rate uses the full-N denominator (n=400). Subject failures count as misses (0). The `pass_rate (completed)` column is descriptive only and is **not** used for H1.

## Run timeline

| Cell | Started (UTC) | Finished (UTC) | Wall clock |
|------|----------------|------------------|--------------|
| no-context | 2026-04-24 16:29:14 | 2026-04-24 ∼22:00 | ∼5h 30m (16 timeouts inflated tail) |
| oracle-context | 2026-04-24 21:49:17 | 2026-04-25 ∼02:00 | ∼4h 10m |
| full-context | 2026-04-24 23:59:21 | 2026-04-25 ∼04:46 | ∼4h 47m |
| retrieval | 2026-04-25 08:29:02 | 2026-04-25 11:33:09 | 3h 04m |
| agentic | 2026-04-25 16:12:23 | 2026-04-25 ∼20:44 | 2h 32m (9140.6 s wrapper duration) |

**Two execution gaps:**
- 04:46 → 08:29 (∼3h44m): comp restart blocked retrieval re-kick; wrapper recovery patch shipped at 10:27Z (commit `608f466`) before retrieval restarted.
- 11:33 → 16:12 (∼4h39m): comp restart killed agentic mid-startup; Docker Desktop required manual restart before agentic re-kicked at 16:12Z.

## Cumulative cost

| Item | USD |
|------|-----|
| Subject (Qwen 3.6-35B via DashScope-intl direct) | **$2.459** |
| Judge ensemble (5,995 calls; 20 judge-side failures = 0.33%) | **$27.293** |
| **Cumulative total** | **$29.752** |
| v6 §14 expected envelope | $50.00 |
| v6 §14 halt envelope | $55.00 |
| v6 §14 cap | $60.00 |
| **Headroom under cap** | **$30.248 (50.4%)** |

**Phase 1 spend (κ re-cal — pre-existing, inherited)** is separate and tracked under commit `01f7ead`. The above $29.752 is Phase 2 N=400 only.

## Judge ensemble operations (across 5 cells)

| Metric | Value |
|--------|-------|
| Total judge calls (Opus + GPT + MiniMax × 5 cells × ∼400 instances) | **5,995** |
| Judge calls OK | 5,975 |
| Judge calls failed (any judge transport / parse) | **20 (0.33%)** |
| MiniMax-side failures (rolled into `judge_failed`) | embedded; per-cell breakdown in JSONL `judge_ensemble[*].failure_mode` |
| Per-instance evaluator_loss (`judge_failure_mode != null`) | distributed across cells; predominant in `incorrect` verdicts (counted via `judge_failure_mode` field but not load-bearing for accuracy bit) |
| Per-instance majority verdict yields (correct / incorrect / null) | sum visible in per-cell breakdown above (`accuracy=1` count is canonical) |

## Result artefacts

| File | Bytes | Lines |
|------|-------|-------|
| `benchmarks/results/no-context-locomo-2026-04-24T16-29-14-400Z.jsonl` | 4,796,275 | 400 |
| `benchmarks/results/raw-locomo-2026-04-24T21-49-17-592Z.jsonl` | 2,370,471 | 400 |
| `benchmarks/results/full-context-locomo-2026-04-24T23-59-21-397Z.jsonl` | 2,671,714 | 400 |
| `benchmarks/results/retrieval-locomo-2026-04-25T08-29-02-314Z.jsonl` | 2,910,455 | 400 |
| `benchmarks/results/agentic-locomo-2026-04-25T16-13-29-924Z.jsonl` | 819,311+ (final size at commit) | 400 |

All five files are tamper-immutable evidence base. Phase C does NOT modify them.

## Halt-ping reference

H1 PASS (Δ=+19.25pp, p=8.07×10⁻¹⁸); MiniMax operated as primary_judge_3 throughout; no Kimi backup invocations (Kimi orphan per §5.2.1); five agentic instances had subject-side TypeErrors documented in [`stage3-n400-v6-final-analysis.md`](stage3-n400-v6-final-analysis.md). Detailed verdict in [`stage3-n400-v6-final-memo.md`](stage3-n400-v6-final-memo.md).
