---
decision_id: 2026-04-26-phase-1-acceptance-gate-results
date: 2026-04-26
authority: PM (Marko) — Phase 1 gate ratified PASS WITH WAIVER
type: acceptance gate close-out + Phase 2 authorization
predecessors:
  - decisions/2026-04-26-pilot-verdict-FAIL.md
  - decisions/2026-04-26-agent-fix-sprint-plan.md
phase: 1 — Foundations (output-normalize + prompt-shapes + run-meta)
verdict: PASS_WITH_WAIVER
---

# Phase 1 Acceptance Gate — Results

**Sprint:** agent-fix sprint (2026-04-26 → ~2026-05-10)
**Phase:** 1 — Foundations (3 sub-commits)
**Outcome:** ✅ **PASS WITH WAIVER** on 4 of 5 criteria; criterion 4 (substrate-reproduction smoke) **WAIVED** at this gate, deferred to Phase 2.

---

## Per-criterion results

### Criterion 1 — `tsc --noEmit` strict clean on `packages/agent/`

**Status:** ✅ **PASS**
**Evidence:** `cd packages/agent && npx tsc --noEmit` → exit 0 (no errors).
**Notes:** TypeScript strict mode active per `packages/agent/tsconfig.json`. All Phase 1.x files conform.

---

### Criterion 2 — Phase 1.x test suite (134 tests)

**Status:** ✅ **PASS**
**Evidence:** `npx vitest run` on three new test files; output recorded in commits `4a557cc`, `bc5b54f`, `12c7334`.

| Sub-phase | Tests | Wall | Source file |
|-----------|-------|------|-------------|
| 1.1 output-normalize | 43 | 14 ms | `packages/agent/tests/output-normalize.test.ts` |
| 1.2 prompt-shapes | 65 | 12 ms | `packages/agent/tests/prompt-shapes.test.ts` |
| 1.3 run-meta | 26 | 52 ms | `packages/agent/tests/run-meta.test.ts` |
| **Phase 1.x total** | **134** | — | — |

All Phase 1 acceptance sub-criteria from sprint plan covered:
- Output normalization round-trip property test (100 random adversarial inputs preserve abstention) ✅
- Prompt-shapes selector picks correctly for 4+ shapes (5 shipped) + override + default fallback ✅
- Run-meta byte-identical replay verifier on greedy decoding ✅

---

### Criterion 3 — GEPA regression (121 tests)

**Status:** ✅ **PASS** (zero regression)
**Evidence:** Same vitest run as Criterion 2; 121 GEPA tests included in batch.

| Suite | Tests | Status |
|-------|-------|--------|
| compose-evolution | 21 | ✅ |
| evolution-orchestrator | 21 | ✅ |
| evolution-gates | 42 | ✅ |
| iterative-optimizer | 37 | ✅ |
| **GEPA total** | **121** | ✅ |

**Combined Criteria 2+3 total: 255/255 in 1.52s wall.**

---

### Criterion 4 — Stage 3 v6 oracle reproduction smoke (substrate no-regression)

**Status:** 🟡 **WAIVED at Phase 1 gate; deferred to Phase 2 acceptance gate**
**Rationale (CC-1 analysis, PM-accepted):**

Phase 1 added only new files in `packages/agent/src/`:
- `output-normalize.ts` (Phase 1.1)
- `prompt-shapes/` directory (Phase 1.2)
- `run-meta.ts` (Phase 1.3)

No code path changes in `packages/core/src/mind/` or `packages/core/src/harvest/`. Substrate behavior cannot have regressed because substrate code was not touched. Per behavioral rule 3.2 ("simplicity first; no error handling for impossible scenarios"), running a smoke at this gate has no detectable risk surface.

The substrate-reproduction smoke is appropriately scheduled for **Phase 2 acceptance gate** — when loop unification will actually consume substrate via the public API (`HybridSearch`, `FrameStore`, `SessionStore`, `MindDB` from `@waggle/core`) and could plausibly regress it through misuse.

#### PM brief authoring — methodology baseline confusion (acknowledged)

The PM Phase 1 gate kickoff specified BOTH:
- "Trio-strict ensemble (Opus + GPT + MiniMax) with judge max_tokens=3000"
- "consistent with full-run 74% (e.g., 70-78% range acceptable)"

**These cannot share one baseline.** Stage 3 v6 reality (verified by reading binding evidence committed at `b7e19c5` and `afe6422`):

| Methodology | Source artefact | Oracle baseline |
|-------------|------------------|-----------------|
| Trio-strict (Opus + GPT + MiniMax) | `benchmarks/results/pilot-2026-04-26/...` and `benchmarks/results/stage3-n400-v6-final-5cell-summary.md` | **33.5%** (134/400) |
| Self-judge (Qwen subject + Qwen judge, Mem0-style) | `benchmarks/results/v6-self-judge-rebench/qwen-self-judge-results.jsonl` | **74.0%** (296/400) |

This is the **second config-inheritance class failure** in the current sprint cycle (first was the Qwen alias bridge `qwen3.6-35b-a3b-via-openrouter` actually routing to Qwen 3.5 in pilot brief amendment v1, also surfaced post-smoke). Both fall under the binding rule established in pilot amendment v2 §5: **`INHERITED_CONFIGS_REQUIRE_TASK_TYPE_AUDIT`**.

#### PM brief path correction (recorded for audit)

The PM brief referenced `benchmarks/manifests/v6-2026-04-24.yaml` as the Stage 3 v6 manifest path. **That path does not exist.** The actual binding manifest lives at:

```
benchmarks/preregistration/manifest-v6-preregistration.yaml
benchmarks/preregistration/manifest-v6-preregistration.md
```

(SHA verified 2026-04-25 in commit `afe6422` audit chain: `5d5c1023421cd1a79f4913bb4c0a59415e21f50797255bff7dfec8e16b68e3ed`.)

Phase 2 acceptance gate brief should reference the actual path.

---

### Criterion 5 — Sub-criteria from sprint plan

**Status:** ✅ **PASS** (all covered by Phase 1.1/1.2/1.3 tests; no separate execution)

| Sub-criterion | Phase | Test |
|---------------|-------|------|
| Round-trip property: 100 adversarial inputs preserve abstention | 1.1 | `output-normalize.test.ts` "hard constraint — abstention preservation property" |
| Prompt shapes ≥ 4 + selector picks correctly | 1.2 | `prompt-shapes.test.ts` "selector — alias resolution" + "every shape — required metadata" |
| Run-meta byte-identical replay (greedy decoding) | 1.3 | `run-meta.test.ts` "verifyDeterministicReplay — HARD GATE" |

---

## Commit chain (Phase 1)

| Commit | Phase | Description | Files |
|--------|-------|-------------|-------|
| `4a557cc` | 1.1 | output-normalize layer | 2 (src + tests) |
| `bc5b54f` | 1.2 | prompt-shapes/ + selector + config + README | 11 |
| `12c7334` | 1.3 | run-meta capture + deterministic replay verifier | 2 |
| `2ad3688` | 1.0 | sprint plan addendum (Phase 4 re-score gate) | 1 |
| `4f6a962` | (pred) | pilot 2026-04-26 close-out | 32 |

---

## Phase 2 acceptance gate substrate smoke — DUAL METHODOLOGY (PM-ratified)

PM has authorized **both** methodologies at the Phase 2 gate to close the methodology-baseline confusion definitively:

### (a) Trio-strict reproduction smoke
- Subject: `qwen3.6-35b-a3b-via-dashscope-direct` (thinking=on, max_tokens=16000)
- Judges: Opus 4.7 + GPT-5.4 + MiniMax M2.7 (max_tokens=3000)
- Sample: N=20 oracle-context cell, seed=42 random subset of `benchmarks/data/locomo/locomo-1540.jsonl`
- Baseline: **33.5%** (Stage 3 v6 trio-strict oracle)
- Pass range: **28-38%**
- Cost cap: $0.50 hard, $0.40 halt
- Manifest: `benchmarks/preregistration/manifest-v6-preregistration.yaml`

### (b) Self-judge reproduction smoke
- Subject + Judge: `qwen3.6-35b-a3b-via-dashscope-direct` (thinking=on, max_tokens=16000 for subject; thinking=off, max_tokens=3000 for judge per Mem0-style binary correctness)
- Sample: same N=20, seed=42 for replay determinism
- Baseline: **74.0%** (apples-to-apples Mem0 methodology)
- Pass range: **70-78%**
- Cost cap: $0.10 hard, $0.08 halt

### (c) Joint pass: BOTH (a) and (b) must pass
If either drifts outside expected range → halt + investigate before merging Phase 2.

### Total Phase 2 substrate smoke envelope
- Cost: ~$0.55 expected, $0.50 halt threshold
- Wall: ~5-10 min for N=20

---

## Phase 2 authorization

PM has authorized Phase 2 (multi-step agent loop unification) per sprint plan §"Phase 2 — Multi-step agent loop unification (3-5 days)". Commit boundaries (proposed, CC-1 may adjust):

- **Commit 2.1**: extract `runAgentLoop` (or new `runRetrievalAgentLoop` for the pilot pattern) into `packages/agent/src/agent-loop.ts` + tests; halt + PM review
- **Commit 2.2**: refactor `scripts/run-pilot-2026-04-26.ts` to consume `packages/agent/` public API; halt + PM review
- **Commit 2.3**: refactor `benchmarks/harness/src/cells.ts` to consume `packages/agent/` public API + deprecate hardcoded "compressed" scaffold; halt + PM review
- **Phase 2 acceptance gate**: dual-methodology substrate smoke (a)+(b) + standard regression (tsc + 255 baseline + new Phase 2 tests + grep verifications)

---

## Audit chain SHAs

```
amendment_v2_doc_sha256   = 1ab5082ff773538a26b3c3294f7fbee4e30063a8d994bdb3753bdc9dd6d6cd99
amendment_v1_doc_sha256   = 3946d3e00fbb1996fb7e63096ecef51abf1e209e5ff166fd0d8758e9a3a14aad
cc1_brief_sha256          = 9805adae478333178d36d71b88795afc37f8fb543c2ebccaecb7b01faf06afee
v6_manifest_yaml_sha256   = 5d5c1023421cd1a79f4913bb4c0a59415e21f50797255bff7dfec8e16b68e3ed
phase_1_head_sha          = 12c7334 (Phase 1.3 close)
sprint_plan_doc_path      = decisions/2026-04-26-agent-fix-sprint-plan.md
```

---

**End of Phase 1 acceptance gate results. Phase 2 (loop unification) authorized. Standing GREEN for Commit 2.1.**
