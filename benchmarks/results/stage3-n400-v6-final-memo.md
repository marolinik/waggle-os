# Stage 3 v6 N=400 — Final Memo

**Date:** 2026-04-25 · **Anchor:** `608f466` · **Manifest:** v6 (SHA `5d5c1023…`)

## Verdict

🟢 **H1 PASSES.** Retrieval pass-rate 22.25% > no-context 3.00%; **Δ = +19.25 pp**, Fisher one-sided **p = 8.07 × 10⁻¹⁸**. Far above the v6 §1 ≥5 pp + p<0.10 thresholds. Memory-lift at conv-scope retrieval is established for Qwen 3.6-35B-A3B + LoCoMo.

## Per-cell (N=400 each, full-N denominator)

| Cell | Pass rate | Δ vs no-context |
|---|---|---|
| no-context | 3.00 % | — |
| oracle-context | 33.50 % | +30.50 pp |
| full-context | 27.25 % | +24.25 pp |
| retrieval | 22.25 % | +19.25 pp |
| agentic | 21.50 % | +18.50 pp |

Ordering: oracle > full > retrieval ≳ agentic ≫ none. Retrieval ≈ agentic (Δ −0.75 pp, indistinguishable).

## Agentic 395/400 caveat (PM-required disclosure)

The agentic cell completed **395/400 cleanly + 5 instances with `failure_mode = agentic_error_TypeError`.**

Confirming the error class:
- These are **TypeScript runtime errors in the runner agent-loop**, NOT judge ensemble failures, NOT subject-model failures, NOT evaluator_loss in the §5.2.1 sense.
- Signature: `model_answer = null`, `usd_per_query = $0.00`, `judge_verdict = null`, `latency_ms ≈ 4892` (±11 ms cluster across all 5). The subject LLM was never called and the judge was never invoked. The runner caught the error pre-LLM and emitted `failure_mode = agentic_error_TypeError`.
- All 5 occurred in only 3 conversations (conv-26 ×2, conv-44 ×2, conv-49 ×1) — clustered to ∼6% of conversations; suggests substrate-shape or tool-call-shape interaction.

Effect on H1: **NONE.** H1 compares retrieval vs no-context; the agentic cell is a secondary endpoint S4. The 5 errors are correctly counted as misses in the canonical full-N pass-rate (0.2150 = 86/400). The "completed-only" descriptive metric (86/395 = 0.21772) is shown for transparency but is **not** the headline metric.

> **Footnote:** Five agentic instances (`locomo_conv-26_q019`, `conv-26_q111`, `conv-44_q029`, `conv-44_q117`, `conv-49_q071`) had TypeScript runtime errors in the runner's agent-loop and were excluded from the descriptive completion-rate metric only. The canonical pass-rate (full-N denominator) counts them as misses, consistent with v6 §9 (no post-hoc exclusion).

Follow-up: open Task 2.7 to re-run these 5 instance IDs in isolation under a verbose runner trace; investigate tool-call-shape mismatch + conv-26/44 substrate quirk + tool-registration race. **Not** a v6 launch blocker.

## Cumulative cost

$29.75 / $60 cap (49.6 %) — comfortably under the v6 §14 envelope.

## Reproducibility

Five JSONL evidence files at `benchmarks/results/{no-context,raw,full-context,retrieval,agentic}-locomo-*.jsonl` (400 lines each). Manifest pinned at `5d5c1023…`. Subject `qwen3.6-35b-a3b-via-dashscope-direct`; judges Opus 4.7 + GPT-5.4 + MiniMax M2.7 (via OpenRouter); seed 42; concurrency 1.

**PM-action requested:** ratify Stage 3 v6 closure (PM-RATIFY-V6-N400-COMPLETE).

(297 words)
