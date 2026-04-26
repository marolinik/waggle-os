---
decision_id: 2026-04-26-agent-fix-sprint-plan
date: 2026-04-26
authority: PM (Marko) — sprint authorized post-pilot-FAIL
type: sprint phasing proposal — PM ratification requested before phase 1 kick
predecessor: decisions/2026-04-26-pilot-verdict-FAIL.md
---

# Agent-Fix Sprint — Phasing Plan

**Goal:** most powerful model-agnostic agent achievable. Bolji od plain prompt-a na svakom modelu (Opus 4.7, Qwen 3.6 35B-A3B, GPT-5.4, future). Production agent (`packages/agent/`) i benchmark setup (`benchmarks/harness/`) konsolidovani — single source of truth.

**Constraints:**
- 1-2 weeks PRIMARY (5-10 working days)
- SECONDARY (GEPA) tek posle PRIMARY PASS via re-pilot
- Substrate claim (Stage 3 v6 oracle 74%) NE SME da regresuje
- Cross-model robustness gate blokira candidate koji improve Claude ali degraduje Qwen >2pp

---

## Phase ordering — dependency-driven

```
Phase 1 — Foundations (independent, parallel-safe)
    Item 1: output-normalize.ts       (no deps; pure utility)
    Item 2: prompt-shapes/             (no deps; pure config + logic)
    Item 7: run-meta.ts                (no deps; mostly utility)

Phase 2 — Architectural consolidation
    Item 3: agent-loop unification     (consumes Items 1 + 2)
            — pull scripts/run-pilot-2026-04-26.ts logic into
              packages/agent/src/agent-loop.ts
            — deprecate hardcoded "compressed" scaffold in
              benchmarks/harness/src/cells.ts; refactor to consume
              packages/agent/ public API

Phase 3 — Resilience layer
    Item 4: long-task/{checkpoint,recovery,context-manager}.ts
            (extends Item 3)

Phase 4 — Quality refinements
    Item 5: skills + tools audit (model-aware refactor; uses Item 2)
    Item 6: failure-classify.ts + report.ts (uses Item 1)

Phase 5 — Validation
    Mini re-pilot N=12-20 (5 cells × 3-5 tasks)
    Acceptance gates from work order

→ HALT for PM ratification
→ SECONDARY: GEPA evaluation with labeled corpus (separate sprint)
```

Phases 1, 4 can have parallel sub-items. Phases 2, 3, 5 are sequential.

---

## Phase 1 detail — proposed deliverables (3-4 days)

### 1.1 — `packages/agent/src/output-normalize.ts` (NEW)

**API surface:**
```typescript
export interface NormalizationConfig {
  stripThinkTags: boolean;        // <think>...</think> for Qwen
  stripAnswerLabels: boolean;     // "Answer:", "Final answer:"
  stripMarkdownFences: boolean;   // ```...``` in non-code outputs
  stripCopiedMetadata: boolean;   // [memory:synth], # Recalled Memories
  unknownAliases: string[];       // → "unknown"
  preset?: 'production' | 'benchmark-strict' | 'benchmark-lenient';
}

export interface NormalizationResult {
  raw: string;
  normalized: string;
  actions: Array<{ rule: string; before: string; after: string }>;
}

export function normalize(text: string, config: NormalizationConfig): NormalizationResult;
export const PRESETS: Record<string, NormalizationConfig>;
```

**Hard rule (from work order):** "unknown" → "" silently strips legitimate abstention signal — DON'T DO. Map "unknown" / "Unknown" / "Unknown." / "N/A" → canonical "unknown" (preserved).

**Test coverage:** all rules unit-tested with raw/normalized/actions audit; round-trip property tests.

### 1.2 — `packages/agent/src/prompt-shapes/` (NEW directory)

```
prompt-shapes/
├── claude.ts          — narrative + explicit step instruction; works well with thinking
├── qwen-thinking.ts   — minimal scaffolding; thinking handles its own structure
├── qwen-non-thinking.ts — explicit step instruction; structured output template
├── gpt.ts             — terse + structured; reasoning model defaults
├── generic-simple.ts  — fallback; works for any model
├── selector.ts        — auto-select by model alias; CLI override
└── README.md          — how to add a new model class
```

Key principle (from work order): **empirical, ne ideoloski.** If probe shows Qwen does better with markdown than plain, use markdown. Each shape includes a `metadata.evidence_link` field pointing to the empirical evaluation that justified its existence.

`packages/agent/config/model-prompt-shapes.json` — alias → shape name mapping.

### 1.3 — `packages/agent/src/run-meta.ts` (NEW)

Captures: `run_id`, `config_snapshot` (frozen JSON), `dataset_sha256` if applicable, `model_versions`, `provider_routing`, `prompt_shape_per_model`, `seed`, `git_sha`, `timestamp_iso`, `normalization_actions_per_prediction[]`, `raw_api_responses[]` (gzipped), `judge_call_traces[]`.

Deterministic reproduction for greedy decoding (temperature=0): given run_meta, replay must produce identical predictions.

---

## Phase 1 commit boundaries (proposed)

```
commit 1.1: feat(agent): output-normalize layer with raw/normalized/actions audit
commit 1.2: feat(agent): model-aware prompt shapes + selector + config
commit 1.3: feat(agent): run-meta capture for deterministic reproduction
commit 1.* tests: unit + round-trip property tests for 1.1-1.3
```

Each commit type-checks + tests pass; commits don't ship without green CI.

---

## Phase 1 acceptance gates (must pass before Phase 2 kick)

- `npm run test --workspace=@waggle/agent` green for new files
- `tsc --noEmit` clean on `packages/agent/`
- Existing 121 GEPA-related tests still pass (no regression)
- Output normalization round-trip: 100 random adversarial inputs → no semantic drift; abstention signal preserved
- Prompt shapes: at least 4 shapes shipped (claude / qwen-thinking / qwen-non-thinking / generic-simple); selector picks correctly for known aliases
- Run-meta produces byte-identical replay on greedy decoding (verify with smoke test)

---

## Phase 2-5 high-level scope (briefed for PM situational awareness; full plans drafted phase-by-phase)

### Phase 2 — Multi-step agent loop unification (3-5 days)
- Pull `scripts/run-pilot-2026-04-26.ts` `runCellMultiStep` logic into `packages/agent/src/agent-loop.ts` as the unified entry point
- Parametrize: `MAX_STEPS` (default 5; configurable), `MAX_RETRIEVALS_PER_STEP` (default 8), per-call halt, multi-step pattern
- Production agent in Tauri desktop + MCP server (`packages/server/`) consumes new entry point
- `benchmarks/harness/src/cells.ts` deprecates hardcoded "compressed" scaffold; refactors to consume `runAgentLoop` via public API
- Pilot wrapper (`scripts/run-pilot-2026-04-26.ts`) becomes thin wrapper around `packages/agent/` (no separate implementation)
- Risk: Stage 3 v6 oracle 74% must reproduce — gate on this before Phase 3 kick

### Phase 3 — Long-task persistence (2-3 days)
- `long-task/checkpoint.ts` — serialize state per step
- `long-task/recovery.ts` — restore from checkpoint; retry-with-backoff; tool-failure fallback
- `long-task/context-manager.ts` — intelligent context summarization; hive-mind retrieval over accumulated state
- Progress callbacks + telemetry hooks
- Test scenario: simulate process kill mid-step → resume → complete → identical final output

### Phase 4 — Skills/tools audit + failure taxonomy (1-2 days)
- Audit `packages/agent/src/*-tools.ts` for Claude-narrative-shaped descriptions
- Refactor to consume prompt-shapes infrastructure
- `failure-classify.ts` 10-category classifier (thinking_leakage, correct_answer_with_extra_text, unknown_false_negative, metadata_copy, format_violation, punctuation_or_case_only, wrong_span, wrong_entity, hallucination, retrieval_or_harness_error)
- `benchmarks/harness/src/report.ts` (or `packages/agent/src/report.ts`) emits per-cell + per-model summary.{json,md} + predictions.jsonl + failures.jsonl

### Phase 4 acceptance gate — pilot 2026-04-26 RE-SCORE (PM addendum 2026-04-26, BINDING)

After Phase 4 ships (output-normalize from 1.1 + failure-classify from 4) and BEFORE Phase 5 mini re-pilot kicks:

**(i) Re-score 2026-04-26 pilot artefacts** — read all 12 cell JSONLs (4 cells × 3 tasks), apply Phase 1.1 normalization layer to each `candidate_response`, run Phase 4 failure-classifier on each (response, ground-truth-question, materials, judge_rationale) tuple. **NO new LLM calls** — analysis-only on existing artefacts.

**(ii) Output:** `D:\Projects\PM-Waggle-OS\decisions\2026-04-26-pilot-rescored-delta-report.md` with:
- Per-cell raw vs normalized score (which cells now PASS post-normalization)
- Failure category distribution per cell (10-bucket histogram per failure-classify taxonomy)
- Specifically for the 8 FAIL cells (Tasks 2+3 H2 + all 3 tasks H3 + all 3 tasks H4 = covers `task-2/{B,D}`, `task-3/{B,D}`, `task-1/D`, `task-2/D`, `task-3/D` after de-dup), report counts of:
  - `thinking_leakage` failures (would be removed by 1.1 normalization)
  - `unknown_false_negative` failures (would be flagged by classifier)
  - `metadata_copy` failures (would be removed by 1.1 normalization)
  - `format_violation` failures (would be flagged by classifier)
- **Empirical conclusion:** how many of the pilot reversals were normalization-fixable artefacts vs real harness-design issues.

**(iii) HALT + PM ratify** the delta report before Phase 5 mini re-pilot kicks. The delta is the empirical signal for PM scope decision: if most reversals are normalization-fixable, Phase 5 re-pilot is a confirmation step; if most are real harness-design issues, Phase 5 may need scope expansion (e.g. raise MAX_STEPS, alternative agent loop pattern).

**Reason for binding addition:** without this signal we don't know whether Phase 2 loop unification was enough fix or whether Phase 5+ needs extra investigation. The re-score is cheap ($0 LLM cost; pure analysis) and gives PM the data needed for the Phase 5 scope call.

### Phase 5 — Mini re-pilot validation (1-2 days)
- 4-5 cells × 3-5 tasks (3 from current pilot + 1-2 new long-task scenarios)
- Pre-registered hypotheses identical to 2026-04-26 + H5 (across-model variance < 0.15) + H6 (long-task scenario completes)
- Cost cap $30, halt $25, trio-strict ensemble with max_tokens=3000
- Acceptance gates per work order

---

## What does NOT happen in this sprint (deferred to SECONDARY)

- True GEPA self-evolve evaluation (needs labeled corpus authored separately)
- Per-model GEPA optimization candidates
- Multi-model objective GEPA score function
- 4-way eval split (train/dev/holdout/golden)

These are SECONDARY scope. PM kicks off after PRIMARY confirmed PASS via re-pilot.

---

## Halt-and-ping triggers (binding for whole sprint)

1. **Stage 3 v6 reproduction shows >2pp regression with new agent code** — halt before merging Phase 2; investigate; fix or roll back.
2. **Re-pilot reveals problem was NOT multi-step harness pattern** but something else (model capability ceiling, judge methodology, retrieval quality) — flag for PM scope re-evaluation.
3. **Long-task scenario reveals hive-mind retrieval gap** — flag (do not block agent fix; hive-mind hooks land as separate post-sprint work).

---

## What is NOT permitted (hard rules from work order)

- Fix that works for Claude but fails for Qwen (current bug)
- Hardcoded "this model gets this prompt" without configurable layer
- Output normalization that silently changes semantics (`unknown` → `""` strips abstention)
- Skills/tools that are Claude-narrative-shaped without audit
- Evolution-gates that are not blocking for cross-model regression
- `benchmarks/harness/` remaining proxy scaffold separate from production agent
- GEPA testing without labeled corpus

---

## Proposed start point — PM RATIFICATION REQUESTED

**Phase 1 (Foundations) is parallel-safe and has no dependencies.**

Two options for kickoff:

**Option A (recommended): Phase 1 in 3 sub-commits over 3-4 days.**
1.1 output-normalize + tests → commit
1.2 prompt-shapes + tests → commit
1.3 run-meta + tests → commit
HALT → PM ratifies Phase 1 → Phase 2 kicks

**Option B: All 3 Phase 1 items in a single commit (faster, larger review surface).**
Same 3-4 day timeline, harder to review, single rollback handle.

**Option C: Start Phase 2 first** (loop unification) and let Phase 1 land alongside as needed.
Higher risk — unification without normalization + prompt-shapes ready means we're building on incomplete foundations and may have to rework. Not recommended.

---

**Awaiting PM ratification of phasing + start option.**
