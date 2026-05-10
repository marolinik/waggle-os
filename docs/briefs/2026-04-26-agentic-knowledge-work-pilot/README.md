# Agentic Knowledge Work Pilot — N=3 Direction Validator

**Date:** 2026-04-26
**Type:** Pilot test (pre-full multiplier benchmark gate)
**Owner:** PM authoring brief, CC-1 executing
**Scope:** 3 tasks × 4 cells = 12 candidate runs + 36 judge calls (trio ensemble)
**Cost ceiling:** $5 hard cap, $4 halt
**Time budget:** 4-6 hours wall-clock

## Why this pilot exists

Stage 3 v6 N=400 LoCoMo proved the **memory substrate** thesis (oracle 74% > Mem0 66.9%). That's paper claim #1 — architecture beats peer-reviewed baseline on memory recall.

This pilot is paper claim #2 — **agentic knowledge work multiplier**. Question: does adding hive-mind memory + GEPA agent harness lift candidate model performance on real CEO/consultant work, not just memory recall?

PA V5 (April 2026) gave H1 PASS Opus 4.6 +5.2pp on knowledge work but on small N. This pilot replicates direction signal on N=3 across 4 cells. If pilot passes (H2/H3/H4 directional signs hold), full N=400 multiplier benchmark is authorized for paper claim #2 evidence.

If pilot fails (any of H2/H3/H4 reverses sign), we don't waste $150 on full benchmark — we go back to retrieval V2 work first.

## Files in this folder

| File | Purpose | Audience |
|---|---|---|
| `README.md` | This index — overview + sequencing | Marko, PM, CC-1 |
| `cc1-brief.md` | Technical execution brief | CC-1 primary |
| `task-1-strategic-synthesis.md` | Multi-document synthesis test materials | CC-1, judges |
| `task-2-cross-thread-coordination.md` | Cross-thread project coordination test | CC-1, judges |
| `task-3-decision-support.md` | Decision support under conflict test | CC-1, judges |
| `judge-rubric.md` | Likert 1-5 × 6 dimensions trio rubrika | Judge ensemble |

## Hypotheses pilot validates

- **H2:** Opus 4.7 + memory + harness > Opus 4.7 solo (multiplier on frontier model)
- **H3:** Qwen 3.6 35B-A3B + memory + harness > Qwen solo (multiplier on sovereign model)
- **H4:** Qwen + memory + harness ≥ Opus solo (SOTA-on-local proof, sovereignty bridge)

PASS criteria (binary):
- All 3 hypotheses show correct directional sign across ≥ 2 of 3 tasks (6/9 cells minimum)
- No catastrophic failure (any cell scoring < 2.0/5 overall on majority of judges)

If PASS → green-light full N=400 multiplier benchmark (Opus + Qwen + GPT-5.4 × 4 cells × N=400)
If FAIL → halt expansion, prioritize retrieval V2 work, schedule pilot retry post-V2

## Cost & time envelope

- Candidate model spend: ~$1.50 (12 runs, Opus dominates cost)
- Judge ensemble spend: ~$2.50 (36 calls × ~$0.07/call across Opus + GPT + MiniMax)
- Buffer: ~$1.00
- Total ceiling: $5.00, halt at $4.00
- Wall-clock target: 4-6 hours (parallel cell execution where possible)

## Sequencing

1. **PM** (you, now): generates pilot package — this folder
2. **Marko**: ratifies brief (1 review pass, optional adjustments)
3. **CC-1**: executes pilot — kicks runner, monitors halt rules, produces JSONL + summary
4. **PM**: adjudicates direction signal post-results, drafts go/no-go for full benchmark
5. **Marko**: ratifies go/no-go decision

## Notes on synthetic materials

All test materials in tasks 1-3 are **synthetic but realistic**, designed to mirror Marko's ICP work (CEO of mid-stage SaaS company, boutique consulting Partner, executive decision-maker). Documents are detailed enough to require genuine synthesis, not surface-level pattern matching.

Synthetic ≠ proxy. Each task has a clear "right answer shape" the judge rubric calibrates against — not a single correct answer, but a quality bar a real CEO/Partner would recognize as professional output.
