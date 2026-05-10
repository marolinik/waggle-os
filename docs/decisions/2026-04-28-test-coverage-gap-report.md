---
decision_id: 2026-04-28-test-coverage-gap-report
date: 2026-04-28
phase: parallel work — test coverage gap analysis (report-only)
verdict: heuristic estimate. Real P1 gaps small after false-positive correction; ~6-8 modules genuinely below 80%. Bulk of "below 80%" signal is connector files (P2-bordering-P3) and a few legacy utility modules. Recommended Sprint 12 additions: small focused list, not a wholesale test-debt cleanup.
constraint: report-only; no code changes; no test additions; no package.json modifications
methodology_caveat: vitest @vitest/coverage-v8 not installed; package.json constraint forbids adding it. Static src→test heuristic used as fallback. KNOWN false-positive class: per-file source matched against per-file test only — multi-source-per-test conventions (e.g., prompt-shapes.test.ts covers 7 source files) flagged as 0-coverage incorrectly. Correction pass applied below.
---

# Test Coverage Gap Report

## 1. Methodology

The repo's `vitest.config.ts` declares a `coverage` block with provider `v8`, but the corresponding package `@vitest/coverage-v8` is not in `node_modules`. Running `npx vitest run --coverage` returns:

```
MISSING DEPENDENCY  Cannot find dependency '@vitest/coverage-v8'
```

Attempting `npx --package=@vitest/coverage-v8 -- vitest run --coverage` fails because the local vitest install can't resolve a package outside its own `node_modules`. The PM constraint "DO NOT modify package.json" forbids the obvious fix (`npm install --no-save -D @vitest/coverage-v8` would persist a lockfile change).

**Fallback methodology used here:** static source-to-test mapping via filename stem matching, with test-file-LoC-to-source-file-LoC ratio as a coverage proxy.

For each `.ts` file in `packages/agent/src/` and `packages/core/src/` (excluding `.d.ts`), the scan:
1. Counts non-comment, non-empty LoC (`srcLoc`)
2. Searches `tests/` (recursive) for `*.test.ts` files matching one of:
   - `<stem>.test.ts` exact match
   - `<dir-parts-joined-with-dash>-<stem>.test.ts` (waggle-os convention: `long-task-checkpoint.test.ts` for `src/long-task/checkpoint.ts`)
   - Loose match: filename contains stem AND path contains all dir parts
3. Sums matched test files' LoC (`testLoc`)
4. Computes `ratio = testLoc / srcLoc`
5. Estimates coverage bucket: 0 (no tests) / `<50` (ratio < 0.3) / `50-80` (0.3–0.7) / `>=80` (>= 0.7)
6. Classifies priority:
   - **P1**: critical agent-loop / substrate path (agent-loop, retrieval-agent-loop, orchestrator, personas, behavioral-spec, output-normalize, run-meta, prompt-shapes/*, long-task/*, mind/* core, vault, harvest pipeline, injection-scanner, cost-tracker, tool-filter, permissions)
   - **P3**: barrel / type-only (`index.ts`, `types.ts`, `*-types.ts`, `constants.ts`)
   - **P2**: everything else

**Caveats (honest disclosure):**
- The heuristic does NOT measure actual line coverage. A test file that imports the source but exercises only one function will still register a high `testLoc/srcLoc` ratio and read as "well-covered."
- The heuristic FALSE-POSITIVES on multi-source-per-test conventions: `tests/prompt-shapes.test.ts` (a single 1100-LoC test file covering all 7 prompt-shape source files) only matches `prompt-shapes/types.ts` via stem, so the other 6 prompt-shape files report as "zero tests." A correction pass below resolves the most obvious cases.
- Pure-data files (`persona-data.ts`, declarative arrays) are flagged as zero-test even when their data is exercised indirectly through the logic file's tests (`personas.test.ts`).
- `index.ts` barrel files are typed as P3 and excluded from priority analysis.

**Net interpretation:** the report is a directional signal, not a measurement. P1 gaps surfaced by this heuristic should be cross-checked manually before booking work. P2/P3 gaps are useful for backlog priority discussion.

## 2. Per-package summary

| Package | Modules total | With tests | Without tests | Est. ≥80% | Est. <80% | Rough cov% by LoC |
|---|---|---|---|---|---|---|
| `packages/agent` | 156 | 100 | 56 | 74 | 82 | 46% |
| `packages/core` | 64 | 37 | 27 | 32 | 32 | 56% |

The `<80%` count is inflated by the false-positive class noted above. Genuine gaps after correction: see §3.

Distribution of `<80%` modules across priority buckets (heuristic, pre-correction):
- **P1: 15** (mostly false positives — see §3 correction pass)
- **P2: 93** (real signal: connectors + heavy utility files)
- **P3: 6** (barrel files + types — out of scope per §5)

## 3. Module-by-module gap list

### P1 — critical path (correction pass applied)

The heuristic flagged 15 P1 modules. Cross-checking against the actual test directory shows most are covered through multi-source-per-test files. The corrected list:

| Module | LoC | Heuristic verdict | Corrected status | Action |
|---|---|---|---|---|
| `agent/persona-data.ts` | 911 | 0 tests | **covered indirectly** by `personas.test.ts` (PERSONAS array iterated via logic file). Pure data; not directly testable in isolation. | None — false positive |
| `agent/retrieval-agent-loop.ts` | 828 | ratio 0.55 / `50-80` | Likely well-covered: `retrieval-agent-loop.test.ts` (455 LoC, 25 tests) + `long-task-loop-integration.test.ts` (847 LoC, 34 tests including Phase 4.7 assertion suite). Combined test LoC ≈ 1300 against 828 src LoC → ratio ≈1.6. | None — heuristic missed cross-file integration test |
| `agent/behavioral-spec.ts` | 338 | ratio 0.19 / `<50` | **Real gap.** Only `behavioral-spec-overrides.test.ts` (65 LoC) tests the override mechanism. The main `BEHAVIORAL_SPEC` constant + section structure + `COMPACTION_PROMPT` export aren't directly verified by a dedicated suite. Mitigated by indirect testing through orchestrator, but no lock-in test. | Sprint 12 candidate: add a structural-shape test for the spec (sections present, COMPACTION_PROMPT non-empty, etc.) — small effort, high pin-value |
| `core/harvest/pipeline.ts` | 283 | ratio 0.53 / `50-80` | `pipeline-injection.test.ts` (66 LoC) + `pipeline-progress.test.ts` (83 LoC) cover injection scanning + progress reporting. End-to-end harvest flow not exercised. | Sprint 12 candidate: end-to-end harvest test against fixture data |
| `agent/cost-tracker.ts` | 123 | ratio 0.40 / `<50` | `cost-tracker.test.ts` exists but thin. `CostTracker` class methods have partial coverage. | Sprint 12 candidate: complete `CostTracker` method matrix (record / get / reset / aggregate) |
| `agent/prompt-shapes/selector.ts` | 116 | 0 tests | **covered** by `prompt-shapes.test.ts` (1100+ LoC, 65 tests including selector dispatch tests). | None — false positive |
| `agent/prompt-shapes/claude.ts` | 90 | 0 tests | **covered** by `prompt-shapes.test.ts` | None — false positive |
| `agent/prompt-shapes/types.ts` | 83 | 0 tests | Type-only module; no testable runtime behavior. Indirectly verified by tsc strict on consumers. | None — out of scope per §5 |
| `agent/prompt-shapes/qwen-thinking.ts` | 81 | 0 tests | **covered** by `prompt-shapes.test.ts` | None — false positive |
| `agent/prompt-shapes/qwen-non-thinking.ts` | 79 | 0 tests | **covered** by `prompt-shapes.test.ts` | None — false positive |
| `agent/prompt-shapes/generic-simple.ts` | 73 | 0 tests | **covered** by `prompt-shapes.test.ts` | None — false positive |
| `core/injection-scanner.ts` | 71 | 0 tests | **Real gap.** `agent/src/injection-scanner.ts` has a dedicated test (`agent/tests/injection-scanner.test.ts`); the duplicate `core/src/injection-scanner.ts` does NOT have a `core/tests/injection-scanner.test.ts`. Substantively the same scanning logic. Either dedupe (Sprint 12 cleanup candidate) or add core-side test. | Sprint 12 candidate: investigate dedup vs add test |
| `agent/prompt-shapes/gpt.ts` | 62 | 0 tests | **covered** by `prompt-shapes.test.ts` | None — false positive |
| `agent/prompt-shapes/index.ts` | 44 | 0 tests | Barrel. P3. | None — out of scope |
| `agent/custom-personas.ts` | 40 | 0 tests | **Borderline gap.** `loadCustomPersonas()` reads from disk; not exercised by personas.test.ts (which uses static PERSONAS). Small file. | Sprint 12 candidate: minimal test for loadCustomPersonas with fixture |

**Genuine P1 gaps after correction: 4 modules** (behavioral-spec, harvest/pipeline, cost-tracker, custom-personas) plus 1 dedup-or-test investigation (core/injection-scanner). All small / focused.

### P2 — supporting (top 25 by LoC)

These are real gap signals. Connector files are dominant — a known cluster of test debt that has accumulated as new connectors were added without test scaffolding.

| Module | LoC | Coverage est. | Notes |
|---|---|---|---|
| `agent/system-tools.ts` | 831 | `50-80` | 2 test files (system-tools + bash-sandboxing). Big surface; partial. |
| `agent/skill-tools.ts` | 777 | `<50` | 1 test file. 28 tools defined; thin coverage of CRUD paths. |
| `agent/evolve-schema.ts` | 734 | `50-80` | `evolve-schema.test.ts` covers main path; mutation kinds may be partial. |
| `agent/document-tools.ts` | 559 | `<50` | Document generation (docx/pdf/pptx) thin on output validation. |
| `agent/commands/workflow-commands.ts` | 537 | `50-80` | Command-registry handlers; partial. |
| `agent/lsp-tools.ts` | 406 | `<50` | LSP integration; partial. |
| `agent/workflow-harness.ts` | 406 | **0 tests** | Multi-phase harness; not tested directly. Real gap. |
| `core/file-store.ts` | 398 | `50-80` | File-store abstraction. |
| `core/mind/embedding-provider.ts` | 386 | `<50` | Embedding-provider switching (api / inprocess / litellm / ollama); likely thin. |
| `agent/subagent-tools.ts` | 333 | `50-80` | Subagent spawn/coord; partial. |
| `agent/workflow-tools.ts` | 319 | `50-80` | Workflow CRUD tools. |
| `agent/compliance-pdf.ts` | 315 | `50-80` | EU AI Act compliance PDF rendering. |
| `agent/browser-tools.ts` | 306 | `50-80` | Playwright browser tools. |
| `agent/connectors/obsidian-connector.ts` | 300 | **0 tests** | Connector cluster, no tests. |
| `core/harvest/claude-code-adapter.ts` | 300 | **0 tests** | Harvest adapter for Claude Code. |
| `agent/cross-workspace-tools.ts` | 294 | **0 tests** | Cross-workspace file ops. |
| `agent/git-tools.ts` | 274 | `50-80` | Git operations. |
| `core/telemetry.ts` | 273 | `50-80` | Telemetry pipeline. |
| `core/cron-store.ts` | 270 | `50-80` | Cron job persistence. |
| `agent/connectors/gdrive-connector.ts` | 266 | **0 tests** | Connector cluster. |
| `agent/connectors/notion-connector.ts` | 262 | **0 tests** | Connector cluster. |
| `agent/connector-search.ts` | 248 | `50-80` | Connector search (also exercised by harvest pipeline tests indirectly). |
| `agent/connectors/confluence-connector.ts` | 247 | **0 tests** | Connector cluster. |
| `agent/connectors/trello-connector.ts` | 247 | **0 tests** | Connector cluster. |
| `agent/connectors/outlook-connector.ts` | 244 | **0 tests** | Connector cluster. |

**Connector cluster:** 30+ connector files in `packages/agent/src/connectors/` are each ~100-300 LoC, mostly without dedicated tests. They share a common base class (`BaseConnector`) which IS tested (`connector-sdk.test.ts`). Argument for low-priority: connectors are mostly thin adapters around external APIs; integration testing each one requires real auth and external services. Argument for higher-priority: pre-launch product surface; P1 customer impact if a connector breaks silently.

### P3 — barrel / type-only

Out of scope per §5. Listed for completeness:

| Module | LoC | Reason |
|---|---|---|
| `agent/index.ts` | 409 | Barrel re-exports |
| `core/compliance/types.ts` | 161 | Type-only |
| `core/harvest/types.ts` | 103 | Type-only |
| `agent/connectors/index.ts` | 30 | Barrel |
| `core/harvest/index.ts` | 14 | Barrel |
| `core/compliance/index.ts` | 5 | Barrel |

## 4. Recommended Sprint 12 additions

Small focused list — not a wholesale test-debt cleanup. The 23-item Sprint 12 backlog from Phase 4.4/4.5 already exists; adding ~8 high-value test items here would bring Sprint 12 to ~31 items, still tractable.

**P1 — critical path test gaps (5 items, ~12-16 hours):**

1. **`agent/behavioral-spec.ts`** — structural-shape test (sections present, COMPACTION_PROMPT non-empty, BEHAVIORAL_SPEC_SECTIONS export consistent). Estimate: 2 hours.
2. **`core/injection-scanner.ts`** — investigate dedup vs add test against `agent/injection-scanner.ts`. Estimate: 1-2 hours (most of which is decision, not coding).
3. **`core/harvest/pipeline.ts`** — end-to-end harvest test against fixture data covering at least one adapter (chatgpt or claude-code). Estimate: 4 hours.
4. **`agent/cost-tracker.ts`** — complete `CostTracker` method matrix. Estimate: 2 hours.
5. **`agent/custom-personas.ts`** — `loadCustomPersonas` test with fixture directory. Estimate: 2 hours.

**P2 — biggest real gaps (top 3 by impact, ~16-20 hours):**

6. **`agent/workflow-harness.ts`** — `createHarnessRun` / `advancePhase` / `canRetry` not tested. 406 LoC of orchestration code. Estimate: 6 hours.
7. **`agent/skill-tools.ts`** — round-trip tests for `create_skill` + `discover_skills` + `auto_extract_skills`. 777 LoC; current coverage thin. Estimate: 6 hours.
8. **`agent/document-tools.ts`** — output-shape validation tests for docx/pdf/pptx generation. 559 LoC. Estimate: 4 hours.

**Connector cluster — discuss separately:**
The 6+ untested connector files (gdrive / obsidian / notion / confluence / trello / outlook + ~25 more) form a coherent gap. PM recommendation needed on whether to tackle as a single Sprint 12 work-item or spread across sprints. Each connector is ~100-300 LoC and ~3-5 hours to test against mocked HTTP. If all 30+ connectors → ~90-150 hours. Large effort; likely deferred to a dedicated "connector-test-debt" sprint rather than bundled into Sprint 12 cleanup.

## 5. Out-of-scope notes

The following modules are correctly NOT booked for test additions:

1. **Type-only files** (`prompt-shapes/types.ts`, `compliance/types.ts`, `harvest/types.ts`): no runtime behavior; tsc strict on consumers verifies type correctness.
2. **Barrel files** (`index.ts` at every level): re-exports only; tested transitively when consumers import them.
3. **Persona data array** (`persona-data.ts`, 911 LoC): pure declarative data; iterated through `personas.test.ts` via the logic file.
4. **Generated/legacy connectors** if any exist (none confirmed in this audit).
5. **Files with multi-source-per-test coverage**: `prompt-shapes/*.ts` (covered by `prompt-shapes.test.ts`), the `personas.test.ts` family. The static heuristic mis-flags these but they have substantive coverage through their shared test files.

## 6. Audit chain

| Item | Value |
|---|---|
| Branch HEAD | `c9bda3d` (Phase 4.7, unchanged) |
| Coverage tool | NOT installed (`@vitest/coverage-v8` absent); fallback static heuristic used |
| Scan script | `D:\Projects\waggle-os\tmp\coverage-gap-scan.mjs` |
| Scan output | `D:\Projects\waggle-os\tmp\coverage-gap-output.json` |
| Modules scanned | 220 (156 agent + 64 core) |
| Modules flagged <80% (heuristic) | 114 (82 agent + 32 core) |
| Genuine P1 gaps after correction | 4-5 (behavioral-spec / harvest pipeline / cost-tracker / custom-personas / core injection-scanner dedup-or-test) |
| Genuine P2 gaps prioritized | top 3 (workflow-harness / skill-tools / document-tools) |
| Connector cluster | flagged for separate PM decision (30+ files, large effort) |
| Cost | $0 |
| Code modified | 0 |
| Tests added | 0 |

## 7. PM ratification asks

1. **Accept the heuristic methodology disclaimer** — true coverage instrumentation requires installing `@vitest/coverage-v8` which violates the package.json constraint. Static src→test mapping is the next-best signal but has known false-positive class.
2. **Authorize a one-time install of `@vitest/coverage-v8`** for a future precise-measurement pass? (Optional follow-up; if approved would yield definitive numbers but requires lockfile change.)
3. **Add the 8 recommended Sprint 12 items** (5 P1 + 3 P2-top) to the existing 23-item Sprint 12 backlog → total Sprint 12 = ~31 items?
4. **Decide separately on the connector cluster** — single Sprint 12 work-item (~90-150 hours, dedicated focus) vs distributed across multiple sprints vs deferred to post-launch?

---

**End of test coverage gap report. Resuming Phase 5 standby.**
