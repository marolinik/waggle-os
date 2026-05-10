---
decision_id: 2026-04-27-phase-3-acceptance-gate-results
date: 2026-04-27
phase: 3 acceptance gate — H6 long-task scenario validation
verdict: H6 INCONCLUSIVE — 2 of 3 models PASS Likert criteria; Opus partial only; compression criterion FAILED by design (Phase 3.4 audit-format gap)
predecessor: 2026-04-27-phase-3-acceptance-gate-pre-run-halt.md
sprint_plan: D:\Projects\waggle-os\decisions\2026-04-26-agent-fix-sprint-plan.md
branch_head: 8b8a940 (Phase 3.4)
---

# Phase 3 Acceptance Gate — Results

## TL;DR

**H6 verdict: INCONCLUSIVE.** Mixed result split cleanly along three axes:

- **Replay determinism + compression-preserves-meaning Likert criteria: PASS** for Qwen and GPT (both at exactly 0.3 — at the threshold). Cannot evaluate for Opus.
- **Self-judge accuracy on continuous baselines: 3/3 PASS** (Qwen, GPT, Opus all "Yes").
- **Cross-model coverage: PARTIAL FAIL.** Opus only completed 1 of 3 sub-runs (continuous baseline at $2.75 alone consumed 39% of total cap; crash-resume's first leg consumed another $2.27 + halted; compressed-context never started).
- **Compression criterion: HARD FAIL across all 3 models.** Zero compress events fired in any of the 8 completed sub-runs. Root cause: Phase 3.4's `accumulated_context` audit format is structurally too small to ever cross the 4K-token threshold within 30 turns.

The compression failure is **methodologically informative**, not a runtime bug. It surfaces a Phase 3.4 design gap that should be fixed before any production claim: ContextManager only compresses the *audit log*, but the LLM cost is dominated by the *messages array* (which ContextManager doesn't touch). Phase 4 must address this if compression is to provide real cost-bound value at scale.

Cumulative cost: **$6.15** (subject runs $3.85 + recovery analysis $0.03 + Opus crash-resume's first-leg waste $2.27, the last being the spike that tripped the cost halt). Wall: 17 min. Both within the ratified $7 hard cap and 30 min hard cap, but very close to the $6 halt threshold (which fired as expected at the Opus crash-resume boundary).

---

## Audit chain

| Item | Value |
|---|---|
| Branch HEAD | `8b8a940` (Phase 3.4 commit) |
| Subject run JSONL | `tmp/phase-3-gate-2026-04-27/results/runs.jsonl` (8 records) |
| Recovery summary | `tmp/phase-3-gate-2026-04-27/results/summary.json` |
| Per-task checkpoints | `tmp/phase-3-gate-2026-04-27/results/checkpoints/<task_id>/step-NNNNNN.json` |
| Subject corpus | `tmp/phase-3-gate-2026-04-27/corpus.ts` (30 events, deterministic) |
| Retrieval mock | `tmp/phase-3-gate-2026-04-27/retrieval-mock.ts` (top-K keyword) |
| Run script | `tmp/phase-3-gate-2026-04-27/run-scenario.ts` |
| Pre-run halt memo | `2026-04-27-phase-3-acceptance-gate-pre-run-halt.md` |

---

## Per-criterion results

### (1) All 3 models complete long-task without uncaught errors

| Model | continuous-baseline | crash-resume | compressed-context | Verdict |
|---|---|---|---|---|
| Qwen 3.6 35B-A3B | ✓ 30 steps, $0.23 | ✓ 30 steps, $0.13 | ✓ 30 steps, $0.11 | **PASS** |
| GPT-5.4 | ✓ 16 steps, $0.17 | ✓ 18 steps, $0.22 | ✓ 19 steps, $0.21 | **PASS** |
| Claude Opus 4.7 | ✓ 23 steps, $2.75 | ✗ failed (cost halt during resume leg) | ✗ never started | **PARTIAL FAIL** |

GPT and Opus finalized early (16-23 steps) — agent finalized before exhausting the 30-step budget. This is correct behavior (the agent decided it had enough info to rank the themes). Qwen used the full 30 steps each run.

### (2) Crash-resume Likert ≤ 0.30 from continuous baseline

| Model | Likert | Pass? |
|---|---|---|
| Qwen | 0.3 | ✓ at threshold |
| GPT-5.4 | 0.3 | ✓ at threshold |
| Opus | (cannot evaluate — no resume answer) | — |

Both Qwen and GPT crash-resumed cleanly: process A ran to step 14, threw the simulated crash at step 15, process B (fresh runner) loaded the latest checkpoint, restored the messages array, and continued from step 15 to a clean finalize. Final answers had **only minor differences** (citation reordering, one extra event mention) per the judge — well-aligned with the realistic Likert ≤ 0.30 standard PM ratified for real LLMs.

**This is the single most important Phase 3 result:** the runRetrievalAgentLoop + CheckpointStore + cross-process resume contract (Phase 3.1 + 3.4) works end-to-end on real LLMs across sovereign + frontier-API models.

### (3) Compressed Likert ≤ 0.30 from continuous baseline

| Model | Likert | Pass? |
|---|---|---|
| Qwen | 0.3 | ✓ at threshold |
| GPT-5.4 | 0.3 | ✓ at threshold |
| Opus | (cannot evaluate) | — |

But — see criterion (4): zero compressions actually occurred. The "compressed-context" sub-runs had ContextManager configured but **never triggered**, so we are effectively comparing "ContextManager configured-but-inactive" vs "no ContextManager". This Likert measure doesn't validate compression preservation; it validates that having ContextManager *configured* doesn't break the agent loop. Useful but weaker than the pre-registered claim.

### (4) Compress events fire ≥1 per model with 4K budget at 30 steps

**HARD FAIL.** Zero compressions across all 8 completed sub-runs.

#### Root-cause diagnosis

`accumulated_context` is built by `buildAccumulatedAudit()` in retrieval-agent-loop.ts — one short line per turn:

```
Turn 1: retrieve query="WWI"
Turn 2: retrieve query="industrial revolution"
...
```

Each line is ~50-70 chars. 30 turns × 60 chars = ~1.8KB raw text ≈ ~450 tokens.

ContextManager threshold = 4000 × 0.7 = 2800 tokens.

**Audit log grows ~6× slower than threshold can be reached.** Compression never triggers, by design.

This is a Phase 3.4 implementation gap: ContextManager only compresses the audit log, but LLM cost is dominated by the **messages array** (which grows by ~550 tokens per retrieval turn = 16K+ tokens by turn 30 on Opus). ContextManager doesn't touch the messages array.

#### What this means for cost

Opus continuous-baseline at 23 steps cost **$2.75**. That's ~$0.12/step average. By step 23, input was ~13K tokens × $15/M = $0.20 just for that step's input. The cost trajectory is super-linear in step count, exactly as the pre-run halt memo predicted, and ContextManager-as-implemented does nothing to bound it.

#### Phase 4 fix recommendations (in order of impact)

1. **Apply context compression to the messages array, not just the audit log.** This is the substantive fix and would actually deliver the cost-bound value the brief expected. Would integrate with the existing `context-compressor.ts` utilities.

2. **Expand `accumulated_context` content** to include retrieval-result snippets per turn. Would grow audit ~10× faster, making compression validation testable at 4K budget. Cheaper change but doesn't fix cost growth.

3. **Add a `messagesContextManager` config field** to `runRetrievalAgentLoop` that triggers `compressConversation()` on the messages array when needed. Most surgical; uses existing infra.

### (5) Self-judge accuracy ≥ 70% on continuous baseline final answers

| Model | continuous-baseline self-judge | Pass? |
|---|---|---|
| Qwen | Yes | ✓ |
| GPT-5.4 | Yes | ✓ |
| Opus | Yes | ✓ |

**3/3 = 100% PASS.** All three models produced rankings whose top-4 themes matched the ground-truth ordering (war_or_conflict → tech_breakthrough → social_movement → economic_transformation), with at least 3 supporting events cited per top-4 theme.

Note: GPT's compressed-context sub-run got a "No" verdict (the only "No" across all judged answers). Inspecting the answer: GPT reclassified scientific_discovery into a separate top-tier category, breaking the top-4 ordering. This is **not** evidence of compression-induced regression because no compression actually occurred — it's an example of run-to-run variation on real LLMs at the same temperature, exactly as the relaxation criterion (item #2 of pre-run halt) anticipated.

### (6) No infinite compression loops, no checkpoint corruption, no data loss

✓ **PASS.** All 8 completed sub-runs persisted full checkpoint chains (one file per turn at `checkpoints/<task_id>/step-NNNNNN.json`). Crash-resume scenarios verified: process B loaded the latest pre-crash checkpoint, restored messages_snapshot + running totals, and resumed cleanly. Zero file-system corruption, zero infinite loops.

### (7) tsc strict clean

✓ **PASS.** Verified pre-gate (`packages/agent` + `benchmarks/harness`).

### (8) All 5720+ unit tests still pass

✓ **PASS.** Verified pre-gate (5720 passed + 1 skipped at HEAD `8b8a940`).

---

## Cost + wall summary

| Item | Cost | Notes |
|---|---|---|
| Qwen 3 sub-runs | $0.47 | 3 × 30-step, audit-only "compression" |
| GPT 3 sub-runs | $0.60 | 3 × 16-19 steps (early finalize) |
| Opus continuous baseline | $2.75 | 23 steps; super-linear input growth |
| Opus crash-resume first leg | ~$2.27 | 14 steps before simulated crash; not in result.totalCostUsd (caller-side billed via guard) |
| Opus crash-resume second leg | $0.00 | Hit cost halt at $6.09 immediately on first call |
| Recovery analysis (self-judge + Likert) | $0.035 | 7 self-judge + 4 Likert calls via Qwen |
| **Total cumulative** | **$6.15** | Hard cap $7.00 / halt $6.00 |
| Wall | 17 min | Hard cap 30 min / halt 25 min |

The cost halt at $6.00 fired **exactly as designed** at the Opus crash-resume boundary. The pre-run halt memo predicted Opus runs would dominate cost; the live trajectory confirmed it (Opus continuous alone consumed ~45% of the entire budget).

---

## What this gate validated vs what it didn't

### Validated
1. CheckpointStore + cross-process resume work end-to-end on real LLMs (Qwen + GPT)
2. RecoveryRunner-style retry semantics work end-to-end
3. Replay determinism is preserved at the **semantic** level (Likert ≤ 0.30) for Qwen and GPT
4. Self-judge methodology gives stable Yes/No verdicts on the synthesis task
5. Phase 3.4's optional-fields backwards-compat: existing tests still pass; new fields don't break the loop
6. The integrated agent loop produces valid, human-readable theme rankings on a 30-doc corpus

### Did NOT validate
1. Cross-model coverage to Opus 4.7 — only the continuous baseline succeeded
2. ContextManager compression actually firing in production — design gap surfaced (audit-only, not messages)
3. Compress-vs-uncompressed Likert preservation — compression never occurred
4. Long-task semantics at >30 steps — agents finalized early on this corpus

---

## H6 verdict: **INCONCLUSIVE**

The pre-registered H6 hypothesis was:

> Long-task scenario sa checkpoints + recovery completes successfully on Opus 4.7 + Qwen 3.6 35B-A3B + GPT-5.4 bez data loss across simulated multi-hour synthesis task.

**For Qwen + GPT: PASSED.** Both completed all three sub-runs cleanly. Crash-resume preserves semantic answer (Likert 0.3). Self-judge accuracy 100% on baseline. No data loss.

**For Opus: PARTIAL FAIL.** Only the continuous baseline completed (and at $2.75 alone — way over the brief's $2.00 estimate). Crash-resume's first leg burned $2.27 before the simulated crash, then the resume leg hit cost halt and produced no answer.

**For compression validation: FAILED across all 3 models** due to a Phase 3.4 design gap (audit log structurally too small for 4K threshold). Not a runtime bug — the implementation does what was specified, but the specification didn't catch that ContextManager only compresses the audit log, not the cost-dominant messages array.

INCONCLUSIVE rather than FAIL because:
- 2 of 3 models passed cleanly
- The Opus shortfall is a budget issue, not a correctness issue
- The compression failure is informative (surfaces a real Phase 4 work item)

---

## PM ratification asks

1. **Accept H6 INCONCLUSIVE** with the partial Opus result as an explicit "scope caveat" rather than a re-run requirement?
   - Pro: cheap, gets us to Phase 4 with real signal on cross-model + cross-determinism
   - Con: Opus cross-model claim weaker than full H6 spec

2. **Authorize a tight Opus-only follow-up run** ($3 budget) to complete cross-model coverage?
   - Scope: Opus crash-resume + Opus compressed-context only (continuous already done)
   - Estimated cost: $3-4 (no buffer)
   - Estimated wall: ~5 min
   - Total cumulative cost would reach ~$9-10 (over the original $7 cap)

3. **Authorize Phase 4 kickoff** with **explicit Phase 4 work items** for:
   - **(a)** Fix the audit-vs-messages compression gap. Either (i) expand accumulated_context content (cheap), (ii) add messages-array compression hook to retrieval-agent-loop (substantive), or (iii) integrate existing context-compressor.ts utilities for the messages dimension (recommended).
   - **(b)** Re-score 2026-04-26 pilot with new normalization + classifier (Phase 4 acceptance gate from the sprint plan).
   - **(c)** Add a "compression-engaged-end-to-end" assertion test that would have caught this gap before the gate.

4. **Update the cost-modeling discipline** for future briefs to flag any per-step cost estimate that doesn't account for **both** input-growth dimensions (audit log + messages array). Extension 6 from the pre-run halt memo only covered super-linear input growth in the abstract — the gate result shows that even with that flag, briefs can still under-estimate when they assume ContextManager will bound BOTH dimensions.

---

## Key signals carried forward

| Signal | What it tells Phase 4 |
|---|---|
| Crash-resume Likert 0.3 on Qwen + GPT | The Phase 3.4 resume contract is correct end-to-end. No further work needed on resume itself. |
| Compressions = 0 across all runs | ContextManager-as-implemented does NOT bound real cost growth. Phase 4 must address this if cost-bound is a real production goal. |
| Opus continuous at $2.75 / 23 steps | Frontier-proprietary models on 30-step retrieval-loop tasks are not competitive on cost without messages-array compression. Has KVARK / sovereign-deployment implications. |
| GPT and Opus finalize early (16-23 steps) | Models self-terminate on this synthesis task before exhausting 30 steps. The 30-step budget is HEADROOM, not a real constraint. |
| All 3 models top-4 ranking matches ground truth | The agent loop produces real synthesis quality. Not a regression from anything in Phase 1-2. |

---

**End of Phase 3 acceptance gate. Standing AWAITING PM RATIFICATION on items 1-4 above.**
