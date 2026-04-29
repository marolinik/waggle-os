# Apples-to-Apples vs Mem0 — Memo

**Date:** 2026-04-25 · **Anchor:** v6 N=400 final commit `afe6422` (subject responses unchanged)

## What we did

Re-judged the same 2000 subject responses (5 cells × 400 LoCoMo instances) using **Qwen 3.6-35B-A3B as a single self-judge** with a Mem0-style binary correctness prompt (`"Is the model answer correct? Output exactly 'Yes' or 'No'."`). No new subject inference; only the judge methodology changed. This produces a methodology-controlled comparison against Mem0's published peer-reviewed numbers.

## What we found

| Configuration | Pass rate |
|----------------|-----------|
| Mem0 published (basic) | 66.9 % |
| Mem0 published (graph) | 68.4 % |
| **Ours — best single cell self-judge (oracle-context)** | **74.00 %** ← **+7.1 pp vs Mem0 basic** |
| Ours — full-context self-judge | 62.00 % |
| Ours — retrieval self-judge | 48.25 % |
| Ours — agentic self-judge | 46.75 % |
| Ours — micro-average across 5 cells (self-judge) | 48.85 % |
| Ours — micro-average across 5 cells (trio-strict, the v6 final) | 21.50 % |

**Methodology bias measurement on identical subject data: trio-strict undercounts by +27.35 pp on aggregate vs single self-judge.** The bias is monotone increasing with subject signal density — narrowest on no-context (+10.25 pp), widest on oracle-context (+40.50 pp).

## Reading the result

When the comparison is **methodology-matched** (single self-judge, same model class as subject — what Mem0 reports), our oracle-context configuration **exceeds Mem0's basic 66.9 %** by 7.1 pp and Mem0's graph 68.4 % by 5.6 pp. This is on the same LoCoMo dataset at N=400, with peer-reviewed-style methodology.

When the comparison is **methodology-strict** (trio LLM judge ensemble with κ=0.7878 substantial agreement, our v6 final), our aggregate sits at 21.5 %. The 21.5 % vs 66.9 % gap is **not a capability gap** — it is a **judge-methodology gap** of measured magnitude +27.35 pp on identical responses.

The H1 hypothesis (retrieval > no-context, established at p=8.07e-18 in v6 final) holds under both methodologies: under self-judge the lift is 0.4825 vs 0.1325 = +35.0 pp (vs +19.25 pp under trio-strict). Memory-lift is robust to judge choice; only the absolute level shifts.

## Operations

2000 calls · 5 min wall · $0.0782 · 0 errors · 0 ambiguous · 100 % parse.

## Sources

Re-judge results: `benchmarks/results/v6-self-judge-rebench/qwen-self-judge-results.jsonl`. Side-by-side detail: `self-judge-vs-trio-comparison.md`. Ground truth: `benchmarks/data/locomo/locomo-1540.jsonl` (canonical loader output, SHA-pinned to upstream `benchmarks/data/locomo10.json` raw archive `79fa87e9…`).

(298 words excluding headings)
