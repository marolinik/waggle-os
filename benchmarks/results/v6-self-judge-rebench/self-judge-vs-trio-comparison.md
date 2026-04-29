# Self-judge vs Trio-strict — Side-by-Side Comparison

**Date:** 2026-04-25 · **Companion:** [`apples-to-apples-memo.md`](apples-to-apples-memo.md)
**Anchor:** v6 N=400 final commit `afe6422` (2000 subject responses unchanged; only judge methodology re-applied)
**Self-judge model:** `qwen3.6-35b-a3b-via-dashscope-direct` (single judge; same model class as subject; thinking disabled; temperature=0)
**Self-judge prompt:** Mem0-style binary correctness (character-exact per PM brief)
**Trio-strict baseline:** Claude Opus 4.7 + GPT-5.4 + MiniMax M2.7 (via OpenRouter); majority verdict; v6 §5.2.1 quorum policy
**Subject responses:** unchanged from v6 N=400; reused verbatim from `*-locomo-2026-04-2{4,5}T*.jsonl`

## Per-cell side-by-side

| Cell | n | Self-judge ✓ | Self-judge acc | Trio-strict ✓ | Trio-strict acc | Δ (self − trio) |
|------|---|--------------|-----------------|----------------|-------------------|-------------------|
| no-context | 400 | 53 | **0.1325** (13.25 %) | 12 | 0.0300 | **+10.25 pp** |
| oracle-context | 400 | 296 | **0.7400** (74.00 %) | 134 | 0.3350 | **+40.50 pp** |
| full-context | 400 | 248 | **0.6200** (62.00 %) | 109 | 0.2725 | **+34.75 pp** |
| retrieval | 400 | 193 | **0.4825** (48.25 %) | 89 | 0.2225 | **+26.00 pp** |
| agentic | 400 | 187 | **0.4675** (46.75 %) | 86 | 0.2150 | **+25.25 pp** |
| **micro (all 5)** | **2000** | **977** | **0.4885 (48.85 %)** | **430** | **0.2150** | **+27.35 pp** |
| **macro (cell mean)** | — | — | **0.4885 (48.85 %)** | — | **0.2150** | **+27.35 pp** |

(micro = pooled-over-instances; macro = simple mean of per-cell accuracies. Both equal because every cell has n=400.)

## Methodology-bias finding

**Trio-strict ensemble (Opus + GPT + MiniMax majority) systematically returns lower accuracy than single self-judge on the same 2000 subject responses by an average of +27.35 pp.**

- Largest gap on **oracle-context** cell (+40.50 pp): the cell where the subject has the highest signal density; single self-judge accepts paraphrastic / partially-correct answers that trio-strict rejects.
- Smallest gap on **no-context** cell (+10.25 pp): when the subject has nearly nothing to work with, both judges agree most answers are wrong.
- The bias is **monotone increasing with subject signal**: higher-information cells produce wider self-judge / trio-strict gaps. This is the classic self-judging-bias signature.

## By-question-category breakdown

Aggregated across all 5 cells, ground-truth `category` field from `locomo-1540.jsonl`:

| Category | n (×5 cells) | Notes |
|----------|---------------|-------|
| single-hop | 1070 (214 × 5) | Plurality; biggest absolute count of judge disagreements |
| multi-hop | 370 (74 × 5) | Reasoning-chain questions |
| temporal | 425 (85 × 5) | Date/time recall — typically narrowest accuracy across both judges |
| open-ended | 135 (27 × 5) | Free-form answers — widest ambiguity gap |

Per-cell-per-category numbers in the source aggregate JSON (`tmp/stage3-runs/self-judge-aggregate.json`).
**Headline:** in oracle-context, self-judge gives single-hop answers 90.2 % accept rate vs trio-strict 33.5 % overall — exposing the categorical tightness of the trio's grading on paraphrastic answers.

## Operational stats (re-judge run)

| Metric | Value |
|--------|-------|
| Total instances re-judged | 2000 / 2000 |
| Errors (`self_judge_error`) | **0** |
| Ambiguous parses (neither Yes nor No) | **0** |
| Median p50 latency | **754 ms** |
| p95 latency | **852 ms** |
| Total cost | **$0.0782** |
| Wall clock | **301 s (5 min 1 s)** at concurrency=5 |
| Budget cap | $10.00 (halt $7.00) — 0.78 % used |

## Reproducibility footer

```
re_judge_model:           qwen3.6-35b-a3b-via-dashscope-direct
re_judge_thinking:        false
re_judge_temperature:     0.0
re_judge_max_tokens:      8
re_judge_concurrency:     5
re_judge_prompt_template: |
  Question: <question>
  Ground truth: <ground_truth>
  Model answer: <model_answer>
  Is the model answer correct? Output exactly 'Yes' or 'No'.

re_judge_results_jsonl:   benchmarks/results/v6-self-judge-rebench/qwen-self-judge-results.jsonl
ground_truth_source:      benchmarks/data/locomo/locomo-1540.jsonl
ground_truth_upstream:    benchmarks/data/locomo10.json (raw archive, SHA 79fa87e9...)
subject_responses:        unchanged from v6 N=400 final commit afe6422
trio_strict_anchor:       afe6422 (final-5cell-summary.md)
```
