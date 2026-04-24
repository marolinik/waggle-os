# Stage 3 §1.3c Throttle Verification Probe — Summary

**Date:** 2026-04-24 · **Log:** `benchmarks/results/stage3-gate-p-plus-probe-v2-log.jsonl` (30 rows).

**Verdict: PASS — 30 / 30 HTTP 200, zero 429.** Latency ms: min=2611, p50=3094, p95=7861, max=16234. Wall-clock 99.5 s.

**Kickoff:** `claude_code_bash_tool_synchronous`; LiteLLM container `waggle-os-litellm-1` restarted post-Step-2 to load `rpm: 20`. Max 16 s latency = LiteLLM queuing under throttle (working as designed, no 429).
