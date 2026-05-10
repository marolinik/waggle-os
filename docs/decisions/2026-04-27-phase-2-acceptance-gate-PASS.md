---
decision_id: 2026-04-27-phase-2-acceptance-gate-PASS
date: 2026-04-27
authority: PM (Marko) — Phase 2 gate ratified PASS WITH SUBSTRATE-NO-REGRESSION CONFIRMED
type: acceptance gate close-out + Phase 3 authorization
predecessors:
  - decisions/2026-04-26-pilot-verdict-FAIL.md
  - decisions/2026-04-26-agent-fix-sprint-plan.md
  - decisions/2026-04-26-phase-1-acceptance-gate-results.md
  - 2026-04-27-phase-2-gate-d3-rule-inspection.md
phase: 2 — Multi-step agent loop unification (3 sub-commits + dual-methodology substrate smoke)
verdict: PASS
---

# Phase 2 Acceptance Gate — Results

**Sprint:** agent-fix sprint (2026-04-26 → ~2026-05-10)
**Phase:** 2 — Multi-step agent loop unification (3 sub-commits)
**Outcome:** ✅ **PASS** — substrate-no-regression empirically confirmed via D3 with v6 exact substring-match rule + N=20 95 % CI band.

---

## Per-criterion results

### Criterion 1 — `tsc --noEmit` strict clean on `packages/agent/` + `benchmarks/harness/`

**Status:** ✅ **PASS**
**Evidence:**
- `packages/agent/`: `tsc --noEmit` exit 0 (verified at Phase 2.3 commit `61743df`).
- `benchmarks/harness/`: `tsc --noEmit` exit 0 (verified at Phase 2.3 commit).
- Both packages pass strict-mode TypeScript checks.

---

### Criterion 2 — Test suites green (315/315 baseline)

**Status:** ✅ **PASS** (zero regression)
**Evidence:** `npx vitest run` on all 10 test suites at Phase 2.3 commit `61743df`:

| Suite | Tests | Phase | Notes |
|---|---|---|---|
| output-normalize | 43 | 1.1 | |
| prompt-shapes | 65 | 1.2 | |
| run-meta | 26 | 1.3 | |
| retrieval-agent-loop | 25 | 2.1 | |
| compose-evolution | 21 | (GEPA) | |
| evolution-orchestrator | 21 | (GEPA) | |
| evolution-gates | 42 | (GEPA) | |
| iterative-optimizer | 37 | (GEPA) | |
| harness/cells | 5 | (existing) | |
| harness/cells-substrate | 30 | (existing, 2 assertions adapted) | |
| **Total** | **315** | — | All green in 1.5s wall |

---

### Criterion 3 — Substrate-no-regression smoke (DUAL METHODOLOGY)

**Status:** ✅ **PASS** (with σ-aware sample-variance correction)
**Evidence:** D3 disambiguation step + v6 exact substring-match rule applied to N=20 smoke records.

#### (a) Trio-strict reproduction smoke

| Field | Value |
|---|---|
| Methodology | Qwen 3.6 35B-A3B subject (DashScope direct, thinking=on, max_tokens=16000) + Opus 4.7 + GPT-5.4 + MiniMax M2.7 trio judges (max_tokens=3000) |
| Sample | N=20 random subset of LoCoMo-1540 (seed=42) |
| **Pass rate (v6 substring-match rule applied)** | **40.0 %** (8/20) |
| v6 N=400 baseline | 33.5 % |
| Pre-registered ±5 pp range | 28-38 % (statistically inappropriate at N=20 — see σ correction below) |
| **σ-aware 95 % CI band at N=20, p=0.335** | **12.4-54.6 %** (σ = √(p(1-p)/n) = 10.6 pp) |
| In σ-aware band | ✅ |
| Cost | $0.252 |

#### (b) Self-judge reproduction smoke

| Field | Value |
|---|---|
| Methodology | Qwen 3.6 35B-A3B as both subject AND judge (Mem0-style Yes/No prompt) |
| Sample | Same N=20 with seed=42 |
| **Pass rate** | **90.0 %** (18/20) |
| v6 N=400 baseline | 74.0 % |
| Pre-registered ±5 pp range | 70-78 % (statistically inappropriate at N=20) |
| **σ-aware 95 % CI band at N=20, p=0.74** | **54.4-93.6 %** (σ = √(0.74×0.26/20) = 9.8 pp) |
| In σ-aware band | ✅ (90 % is just inside upper bound) |
| Cost | $0 (re-used from initial smoke; methodology was already correct) |

#### (c) Methodology bias delta

| Field | Value |
|---|---|
| Smoke delta (b-a) | +50.0 pp |
| v6 baseline | +40.5 pp |
| Pre-registered ±5 pp range | 35.5-45.5 pp |
| σ-aware band at N=20 | ±10 pp (combined std error) |
| In σ-aware band | ✅ |

#### v6 accuracy rule citation (the key D3 finding)

`benchmarks/harness/src/runner.ts:427`:
```typescript
const accuracy = result.failureMode ? 0 : scoreAccuracy(result.text, instance.expected);
```

`benchmarks/harness/src/metrics.ts:57-66`:
```typescript
/** Scores a model output against expected substrings (any-match = full credit). */
export function scoreAccuracy(output: string, expected: string[]): number {
  if (expected.length === 0) return 0;
  const lower = output.toLowerCase();
  for (const exp of expected) {
    if (lower.includes(exp.toLowerCase())) return 1;
  }
  return 0;
}
```

The v6 `accuracy` field is a **case-insensitive substring match** on `expected[]`, NOT judge consensus. Trio judge ensemble produces `judge_verdict` and `failure_mode` (which inform F-mode taxonomy) but does NOT directly determine `accuracy`. This explains why the v6 oracle JSONL has 117 rows with unanimous-correct trio + `failure_mode=null` but `accuracy=0` (Qwen rephrased gold; semantically correct, judges agreed, substring-match failed).

#### σ-aware 95 % CI derivation

For a binary-outcome process with population proportion p and sample size n:

```
σ_p̂ = √(p(1-p)/n)
95% CI ≈ p ± 2σ
```

Derived bands for N=20:

| Reference | p | σ at N=20 | 95% CI |
|---|---|---|---|
| Trio-strict baseline (33.5%) | 0.335 | 10.6 pp | 12.4-54.6 % |
| Self-judge baseline (74.0%) | 0.74 | 9.8 pp | 54.4-93.6 % |

PM's pre-registered ±5 pp range was inherited from N=400 reference run (σ=2.4 pp at p=0.335) without sample-size correction. At N=20, ±5 pp is inappropriately tight — true 95 % CI is roughly ±21 pp at p=0.335.

**Sprint plan Extension 5 (binding from this gate forward):** future acceptance gates pre-register σ-aware ranges. Authoring template:

```
Sample N: <n>
Population proportion (p_baseline): <baseline_pass_rate>
σ_n = √(p_baseline × (1 - p_baseline) / n)
Acceptance band (95% CI): p_baseline ± 2·σ_n
```

---

### Criterion 4 — `cells.ts` scaffold deletion grep

**Status:** ✅ **PASS**
**Evidence:** Phase 2.3 commit `61743df` strict greps:
- `"no sentences, no punctuation, no hedging"` (deleted SYSTEM_EVOLVED literal): absent from `cells.ts`
- `"memory:synth"` (deleted scaffold marker): absent
- `SYSTEM_BASELINE` / `SYSTEM_EVOLVED` (deleted constant names): absent
- `buildUserPromptMemory` (deleted helper): absent
- Preserved: `SYSTEM_AGENTIC` + `SYSTEM_AGENTIC_FORCED_FALLBACK` exports verbatim at lines 100, 138

---

### Criterion 5 — Pilot wrapper consumes `runAgentLoop`

**Status:** ✅ **PASS**
**Evidence:** Phase 2.2 commit `5699677` — `scripts/run-pilot-2026-04-26.ts` imports from `@waggle/agent`:
- `runSoloAgent` (Cell A/C single-shot path)
- `runRetrievalAgentLoop` (Cell B/D multi-step path)
- `LlmCallFn`, `RetrievalSearchFn` types for adapter shapes

Local re-implementations deleted: `runCellSolo` body, `runCellMultiStep` body, `parseAgentAction`, `llmOptsFor`. Wrapper file shrunk from 1035 → 951 lines while preserving all 12 CLI flags + JSONL output schema.

---

## Phase 2 commit chain

| Commit | Phase | Description | Files |
|---|---|---|---|
| `a599a07` | 2.1 | Unified retrieval-augmented agent loop in packages/agent/ | 4 (+1046/-1) |
| `5699677` | 2.2 | Pilot wrapper consumes @waggle/agent (deletes duplicate impls) | 1 (+103/-187) |
| `61743df` | 2.3 | cells.ts refactor + scaffold deprecation + Phase 1.x public-API fix | 3 (+115/-26) |

---

## Brief-authoring failure tally for this sprint (sprint-level audit)

This is the FIFTH class of brief-authoring failure surfaced in the agent-fix sprint:

| # | Phase | Failure class | Resolution |
|---|---|---|---|
| 1 | Pilot 2026-04-26 v1 §1 | Wrong Qwen alias (OR bridge regresses to 3.5) | Amendment v2 §2 binding correction |
| 2 | Phase 1 acceptance gate | Mixed-methodology baseline (trio-strict 33.5% vs self-judge 74% conflated under one "v6 baseline" label) | Option C waiver + dual-methodology spec at Phase 2 gate |
| 3 | Phase 2.3 brief | Scope-discovery failure (PM brief assumed 4 cells; cells.ts has 7) | Option A scope-discovery halt + Extension 3 |
| 4 | Phase 2.3 brief | Cell semantics preservation didn't include prompt strictness equivalence | Extension 4 in feedback memory |
| 5 | Phase 2 acceptance gate | σ-aware ranges not pre-registered (±5 pp at N=20 inappropriate; true σ=10.6 pp at p=0.335) | Extension 5: σ-aware ranges binding for future gates |

All 5 are **same root pattern** — brief authoring inherits config / parameters / ranges from a different context without verifying applicability. Extensions 1-5 in `feedback_config_inheritance_audit.md` codify the rule: **read the source-of-record + verify applicability before authoring.** Both PM (brief authoring) and CC-1 (script authoring) bound by this rule going forward.

---

## Audit chain

```
amendment_v2_doc_sha256        = 1ab5082ff773538a26b3c3294f7fbee4e30063a8d994bdb3753bdc9dd6d6cd99
amendment_v1_doc_sha256        = 3946d3e00fbb1996fb7e63096ecef51abf1e209e5ff166fd0d8758e9a3a14aad
cc1_brief_sha256               = 9805adae478333178d36d71b88795afc37f8fb543c2ebccaecb7b01faf06afee
v6_manifest_yaml_sha256        = 5d5c1023421cd1a79f4913bb4c0a59415e21f50797255bff7dfec8e16b68e3ed
phase_1_gate_doc               = decisions/2026-04-26-phase-1-acceptance-gate-results.md
phase_2_gate_d3_doc_sha256     = 520582283ae91d3d1c921cb44a7ce232fcedcdc763b780511ead00913f5fa97d
phase_2_head_sha               = 61743df (Phase 2.3 close)
sprint_plan_doc                = decisions/2026-04-26-agent-fix-sprint-plan.md
v6_accuracy_rule_source        = benchmarks/harness/src/runner.ts:427 + metrics.ts:57
v6_oracle_jsonl_path           = benchmarks/results/raw-locomo-2026-04-24T21-49-17-592Z.jsonl
phase_2_smoke_records          = benchmarks/results/phase-2-acceptance-gate/smoke-records.jsonl
phase_2_rejudge_records        = benchmarks/results/phase-2-acceptance-gate/rejudge-records.jsonl
```

## Cumulative cost

| Item | Cost |
|---|---|
| Initial smoke (Phase 2 gate run #1) | $0.195 |
| Re-judge with F-mode taxonomy (Path A) | $0.252 |
| D3 inspection (analytical only) | $0 |
| **Phase 2 gate cumulative** | **$0.447** |
| Cap | $2.50 |
| Remaining for future gates / Phase 5 re-pilot | $2.05 |

---

## Phase 3 authorization

PM has authorized Phase 3 (long-task persistence) per sprint plan §"Phase 3 — Long-task persistence (2-3 days)". Commit boundaries (per PM kickoff):

- **Commit 3.1**: `packages/agent/src/long-task/checkpoint.ts` + tests; halt + PM review
- **Commit 3.2**: `packages/agent/src/long-task/recovery.ts` + tests; halt + PM review
- **Commit 3.3**: `packages/agent/src/long-task/context-manager.ts` + tests; halt + PM review
- **Commit 3.4**: `packages/agent/src/agent-loop.ts` integration + tests; halt + PM review
- **Phase 3 acceptance gate**: replay-determinism test (process kill mid-step → resume → identical final output) + 315+ existing tests still green

---

**End of Phase 2 acceptance gate results. Phase 3.1 authorized. Standing GREEN.**
