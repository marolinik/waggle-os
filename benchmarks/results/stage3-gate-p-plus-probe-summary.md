# Stage 3 Gate P+ Pre-Flight Probe — Summary

**Date:** 2026-04-24 · **Branch:** `feature/c3-v3-wrapper` · **Probe log:** `benchmarks/results/stage3-gate-p-plus-probe-log.jsonl` (50 rows).

**Verdict: FAIL — 24 / 50 HTTP 429.** Latency ms: min=2476, p50=4268, p95=5276, max=5512. Wall-clock 35.19 s.

**Root cause** (429 body, call 25): _"Quota exceeded for metric:
generate_requests_per_model, **limit: 25**, model: gemini-3.1-pro."_
Per-model 25 RPM cap on the preview model; NOT scaled by account Tier 2.
First 25 calls (t=0–14.7 s) = 200 OK; remainder 429 as bucket exhausted.

**Kickoff mechanism:** `claude_code_bash_tool_synchronous`, probe pid=46912,
parent Claude Bash pid=3828. Process-tree attached; no run_in_background.

**Do NOT re-kick.** Escalating.
