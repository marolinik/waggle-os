# Phase 5 §0.3 Cost Probe Summary

**Date:** 2026-04-29T11:19:11.627Z
**Pricing snapshot:** 2026-04-29
**Branch:** phase-5-deployment-v2
**Endpoint:** http://localhost:4000 (LiteLLM proxy, matches Faza 1 runner pattern)

## Per-variant statistics

| Variant | Model alias | OK | Errors | p50 | p95 | max | mean | total |
|---|---|---|---|---|---|---|---|---|
| claude::gen1-v1 | claude-opus-4-7 | 5 | 0 | $0.0239 | $0.0432 | $0.0432 | $0.0250 | $0.1251 |
| qwen-thinking::gen1-v1 | qwen3.6-35b-a3b-via-dashscope-direct | 5 | 0 | $0.0064 | $0.0176 | $0.0176 | $0.0075 | $0.0377 |

## Canary cost ceiling (per brief §5.4)

Formula: `canary_cost_p95_ceiling = 740 requests × max(p95) × 1.2 (buffer)`

max(p95) = $0.0432
canary_cost_p95_ceiling = 740 × $0.0432 × 1.2 = **$38.34**

## Verdict

**HARD-CAP-EXCEED** — ceiling $38.34 > hard cap $25.

## Probe spend (this script)

Total: **$0.1628**
Brief §5.4 probe budget: $0.30-$0.50.

## JSONL anchor

Per-request rows: `gepa-phase-5/cost-probe-2026-04-29.jsonl`