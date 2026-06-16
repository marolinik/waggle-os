# Harness Capability Audit — `benchmarks/harness/`

**Question:** Can the 4-cell ablation harness host a new *harness-capability* (agentic/tool-use) SOTA benchmark, and does its statistics machinery support an **equivalence (TOST)** claim?

**Date:** 2026-06-16
**Scope:** Read of `benchmarks/harness/{README.md, src/*, config/*, tests/*}` plus `packages/agent/src/agent-loop.ts` and root `package.json`.
**Bottom line:** The harness is **already more than QA-only** — it ships real `retrieval` (HybridSearch) and `agentic` (`runAgentLoop`) cells, a per-model registry, three external datasets, and a rigorous pre-registration + audit surface. But (a) the agentic cell is hard-wired to a **single `search_memory` tool over LoCoMo turn frames** (memory-recall agentic, *not* general tool-use), (b) there is a **memory toggle conflation** (`raw` embeds oracle context), and most importantly (c) **the stats module has NO inferential hypothesis test at all** — not superiority, not equivalence. It computes descriptive CIs (Wilson, cluster-bootstrap) and judge agreement (Fleiss κ). A published equivalence (TOST) claim needs net-new statistics code.

---

## PART 1 — EXACT CURRENT CAPABILITIES

### 1.1 Cells and controls that exist

**Cells** (`src/cells.ts:291-487`, type `CellName` at `src/types.ts:65-72`). There are **7 cells**, not 4 — the README is stale (it documents only the original quartet):

| Cell | Memory source | Prompt | Real substrate? | Source |
|---|---|---|---|---|
| `raw` | `instance.context` (oracle, embedded verbatim) | baseline persona | no | `cells.ts:292` |
| `filtered` | `instance.context` framed "as retrieved memory" | baseline persona | no (scaffold proxy) | `cells.ts:300` |
| `compressed` | `instance.context` | "strict-extraction" evolved persona | no (GEPA proxy) | `cells.ts:308` |
| `full-context` | `instance.context` framed as memory | strict persona | no (scaffold proxy) | `cells.ts:316` |
| `retrieval` | **real `@waggle/core::HybridSearch.search()`** top-K turn frames, scoped to `instance.conversation_id` (gopId) | baseline persona | **YES** | `cells.ts:337` |
| `agentic` | **real `@waggle/agent::runAgentLoop`** with a single `search_memory` tool, 3-turn cap, AbortController timeout, forced-answer fallback | `SYSTEM_AGENTIC` | **YES** | `cells.ts:370` |
| `no-context` | none (question-only prompt) | baseline persona | n/a (true zero-memory baseline) | `cells.ts:480` |

> CRITICAL nuance for a skeptical reviewer: `filtered`/`compressed`/`full-context` as labelled in the README are **Sprint-9 scaffold proxies** — they all just reshape the oracle-supplied `instance.context`; they do NOT exercise memory retrieval or GEPA. The *real* memory cell is `retrieval`; the *real* agentic cell is `agentic`. The 4-cell README grid is no longer the operative ablation.

**Controls** (`src/controls.ts:30-38`, type `ControlName` at `types.ts:73`): exactly one — `verbose-fixed`. It deliberately tells the model to answer verbosely; on a substring-match factoid metric it should *underperform* `raw`. If it doesn't, the scoring is broken. Controls are diagnostic, excluded from the ablation grid.

**How a cell is defined:** A cell is a pure-ish async function `CellFn = (input: CellInput) => Promise<LlmCallResult>` registered in the `cells: Record<CellName, CellFn>` map (`cells.ts:168, 291`). `CellInput` (`cells.ts:143-166`) carries `{instance, model, llm, turnId, substrate?, litellm?, retrievalTopK?, agenticMaxTurns?, agenticTimeoutMs?, runAgentLoopFn?}`. The runner dispatches `cells[name](input)` (`runner.ts:409-420`). Adding a cell = (1) extend the `CellName` union, (2) add the function to the map, (3) extend `isCellName()` (`cells.ts:490`), (4) add it to `VALID_CELLS` and `buildRuns` (`runner.ts:700`). Cells are selected via `--cell`, `--all-cells` (legacy quartet only), or repeatable `--per-cell` (`runner.ts:146-187, 691-728`).

### 1.2 How datasets are loaded

**Registry:** `config/datasets.json` (a `Record<string, DatasetSpec>`). Five entries: `synthetic`, `locomo`, `longmemeval`, `beam-128k`, `beam-1m`. `DatasetSpec` (`types.ts:96-104`) = `{id, displayName, dataPath (relative to benchmarks/data/), source: 'synthetic'|'external'}`.

**Loader** (`src/datasets.ts`):
- `synthetic` → 60 hard-coded `DatasetInstance`s built in-file (`datasets.ts:153-169`). Used by smoke tests and as a dev fallback.
- `locomo`/`longmemeval`/`beam-*` → read JSONL at `benchmarks/data/<dataPath>`. **No silent fallback**: a missing archive throws `DatasetMissingError` (`datasets.ts:35-48, 181`) unless `BENCH_SYNTHETIC_DATASET=1` is set (dev-only escape hatch with a console.warn). This is a deliberate anti-footgun added in Sprint 12 Task 1 Blocker #1 (absent data used to masquerade as a 60-instance synthetic run).
- JSONL line shape parsed into `DatasetInstance` (`types.ts:76-94`): `{instance_id, question, context, expected[], conversation_id?}`. Malformed lines are tolerated/skipped (`datasets.ts:212-215`).
- **Sample-lock path** (`--sample-lock`): bypasses the dataset adapter entirely and loads `loadPreflightSampleLock()` (`datasets.ts:106-145`), which asserts a **13/13/12/12** single-hop/multi-hop/temporal/open-ended distribution over exactly 50 instances and throws on any mismatch (tamper-evidence). Conversation id is regex-derived from the `locomo_conv-N_qNNN` id pattern.

**Sampling** (`datasets.ts:221-237`): `sampleInstances(all, seed, limit)` — deterministic Fisher-Yates via a xorshift32 PRNG seeded by `--seed`. Sample-lock runs **skip** the shuffle and honor lock order verbatim (`runner.ts:374-376`) so cell comparisons see identical instance order.

**Dataset versioning** (`datasets.ts:53-64`): `getDatasetVersion()` returns the SHA-256 of the archive bytes (or `synthetic-scaffold-v1`), stamped onto every JSONL row as `dataset_version` (`runner.ts:492`) — the per-row audit anchor.

**Builders** (`scripts/`): `build-locomo-canonical.ts`, `build-longmemeval-canonical.ts`, `build-beam-canonical.ts`, `build-preflight-samples.ts`, plus `run-v8.ts` (a BEAM v8 driver). Raw LoCoMo turn ingest for the substrate cells lives in `src/ingest.ts` (frame-per-turn, `extractTurnsFromLocomoRaw` + `ingestLoCoMoCorpus`). There are also `ingest-longmemeval.ts` and `ingest-beam.ts` in `src/`.

### 1.3 How models are added — `config/models.json` schema

Registry is a `Record<string, ModelSpec>` keyed by model id (the key MUST equal `entry.id`, enforced by `models-config.test.ts:56`). `ModelSpec` (`types.ts:145-192`):

```
id, displayName, provider (ModelProvider union: alibaba|anthropic|ollama|litellm-proxy|local|
  openai_via_openrouter|google_via_openrouter|xai_via_openrouter),
litellmModel  (the route string the LiteLLM proxy resolves),
pricePerMillionInput, pricePerMillionOutput, contextWindow,
pinning_surface?  ('anthropic_immutable' | 'floating_alias' | 'revision_hash_pinned'),
pinning_surface_carve_out_reason?  (MUST be null for anthropic_immutable; MUST be non-null
  and contain the substring "B3 addendum" for the others — enforced by models-config.test.ts:102-117),
judge_role?  ('primary'|'secondary'|'tertiary'|'reserve'),
stage2Config?  ({thinking: bool, maxTokens: number, reasoningShape: 'openrouter-unified'|'dashscope-native'})
```

Currently registered (`config/models.json`): 6 Qwen variants (`qwen3.6-35b-a3b` canonical + `-stage2`, `-via-openrouter`, `-via-dashscope-direct`, `-local`), `llama-3.1-8b-instruct` (placeholder, price 0, local route), `claude-opus-4-6`, `claude-opus-4-7` (primary judge), `gpt-5.4` (primary judge), `gemini-3.1` + `gemini-3.1-pro` (primary judge), `grok-4.20` (reserve tie-break). **No Opus 4.8 entry exists.** No generic OSS-model entries beyond the Llama placeholder + local-vLLM Qwen.

Adding a model = add a JSON entry with the fields above + ensure the `litellmModel` route resolves in `litellm-config.yaml`. The runner looks the model up by `--model <id>` (`runner.ts:741`) and throws with the valid-id list if absent. The model registry is also consumed by the pre-registration emitter to attach pinning surfaces (`runner.ts:602-631`).

### 1.4 Pre-registration mechanism — what gets locked, how

Implemented in `src/preregistration.ts`. Emits a single structured event `bench.preregistration.manifest_hash` once per `runOne()` *before the first instance* (`runner.ts:363-370`), via `createCoreLogger('bench.preregistration').info()` (routes to **stderr**, so stdout machine-consumers aren't corrupted).

**What is locked / carried in `PreregistrationManifestPayload`** (`preregistration.ts:66-89`):
- `manifest_hash` — SHA-256 of the frozen **bench-spec manifest YAML bytes** (`computeBenchSpecManifestHash`, `preregistration.ts:152`). This is the H-AUDIT-2 anchor tying a run to the committed pre-registration doc. Provided via `--manifest-hash <64-hex>` (validated, lowercased; `runner.ts:165-172`) OR auto-resolved from `BENCH_SPEC_MANIFEST_PATH` → sibling `../PM-Waggle-OS/decisions/2026-04-22-bench-spec-locked.manifest.yaml` → throw `ManifestNotFoundError` (`preregistration.ts:115-143`).
- `manifest_path`, `manifest_locked_at` (regex-extracted `locked_date:` from the YAML, normalized to ISO-8601; no YAML-parser dep).
- `dataset_version` (SHA-256), `dataset_path`, `dataset_instance_count`.
- `per_cell` (full invocation cell scope), `judge_tiebreak` (`quadri-vendor`|`pm-escalation`|`majority`, default quadri-vendor), and `judge_models[]` — each with `{model_id, provider, judge_role, pinning_surface, pinning_surface_carve_out_reason}` resolved against `models.json` (`runner.ts:602-631`).
- Provenance: `emitted_at`, `runner_version` (git short SHA via `execFileSync`, fallback `'unknown'`), `runner_invocation.{argv, cwd}` with **API keys/tokens redacted** by `sanitizeArgv` (`preregistration.ts:227-244`).

**Per-row** the runner also stamps `dataset_version`, `model_pinning_surface`, `model_pinning_carve_out_reason`, `model_revision_hash` (currently always null) onto every JSONL line (`runner.ts:492, 522-532`), so any single line is self-describing for replication. Tests: `tests/preregistration.test.ts` (10 criteria), `tests/cli-flags.test.ts`, `tests/models-config.test.ts`.

### 1.5 Full statistics inventory — `src/stats/`

Three modules, all from "Sprint 12 Task 1 Blocker #5". **All three are descriptive/agreement statistics. None is an inferential hypothesis test.**

| Module | What it computes | Granularity | Notes / locked params |
|---|---|---|---|
| `fleiss-kappa.ts` (`computeFleissKappa`) | Fleiss' κ (1971) inter-rater agreement over a fixed N judges × K categories vote matrix. Returns κ, P_bar, P_e, per-category marginals. | **Judge ensemble** (3-vendor primary), per-item over the run's instances. K=2 (correct/incorrect) verdict matrix in the smoke pipeline. | NaN when P_e=1 (uniform). A3 LOCK §4 HALT threshold κ<0.60 is checked *outside* this module (runner-level). Validates rectangular shape + row-sum=n_judges. |
| `wilson-ci.ts` (`computeWilsonCI`) | Wilson score 95% binomial CI on a proportion (correctness rate). Returns point_estimate, ci_lower, ci_upper, half_width. | **Per-cell accuracy** (binary correctness). Assumes i.i.d. instances. | `z=1.959964` hardcoded; **only confidence=0.95 supported** (throws otherwise). Clamped to [0,1]. A3 LOCK §2 "STRONG-PUBLISHABLE" gate = Wilson lower bound ≥ 91.6% — that gate logic lives in the aggregate writer, not here. |
| `cluster-bootstrap.ts` (`computeClusterBootstrapCI`) | Non-parametric 95% CI that **resamples whole conversations** (cluster = `conversation_id`) with replacement — respects LoCoMo's hierarchical, non-independent structure (Wilson under-estimates uncertainty under intra-cluster correlation). | **Per-cell accuracy, conversation-clustered.** | LOCKED: n_bootstrap=10000, seed=42, quantiles 2.5/97.5, Mulberry32 PRNG (deterministic, no dep). Only confidence=0.95. Returns n_clusters + n_rows. |

Barrel: `src/stats/index.ts`. Consumers: `tests/smoke/smoke-run.test.ts` (the end-to-end stats pipeline), `tests/stats/*`. Failure-mode taxonomy (`src/failure-taxonomy/`) is a separate axis: 8-value codes (null|F1–F6|F_other), a deterministic judge-rubric block builder, a validator (F_other needs ≥10-token rationale), and `computeFailureDistribution` (counts + F_other rate + >10% review flag).

**KEY GAP (load-bearing for Part 3):** there is **no two-proportion z-test, no p-value, no significance test, and no equivalence test** anywhere in `src/stats/` (verified by grep for `pnorm|qnorm|erf|cdf|p_value|reject|hypothesis|TOST|equivalence|z-test`). "Superiority" in the README (`README.md:8-9`) is conceptual — "difference between a baseline cell and a treatment cell isolates the causal contribution" — and is operationalized **only via descriptive CIs** (non-overlap is the implied test). The MEMORY.md handoffs quote inferential numbers (e.g. "Fisher one-sided p=8.07e-18", "z=4.42", "+5.71 vs Memori") — those z/Fisher computations were done in **external/throwaway analysis scripts** (e.g. `D:/Projects/hive-mind-test/scripts/locomo/`), NOT in this harness's stats module. The harness emits the raw correctness rows + CIs; the inferential test is computed elsewhere.

---

## PART 2 — CRITICAL ASSESSMENT (agentic / tool-use readiness)

### 2.1 Is this harness QA-only, or can it run agentic/tool-use tasks?

**It is NOT purely QA-only.** It already runs a real agentic cell:
- `cells.agentic` (`cells.ts:370-462`) invokes `@waggle/agent::runAgentLoop` — the production agent loop (`packages/agent/src/agent-loop.ts:143`) with full tool-calling, SSE streaming, loop-guard, governance, hooks, capability router, trace recording, verification gate, and skill-distillation gate.
- It threads a real `search_memory` `ToolDefinition` (`makeSearchMemoryTool`, `cells.ts:223-267`) bound to a live `HybridSearch` over an ephemeral `:memory:` MindDB ingested from raw LoCoMo turns (`substrate.ts`, `ingest.ts`).
- It has an AbortController timeout, a hard `maxTurns=3` cap, captured tool results, and a forced-answer fallback (`cells.ts:407-461`), all unit-tested (`tests/agent-loop-exhaustion.test.ts`, 11 cases including the `runAgentLoopFn` injection seam).

**BUT** the agentic surface is narrow in three ways that matter for a *general* harness-capability benchmark:
1. **Single tool.** The allowlist is exactly `[search_memory]` — a memory-recall agent, not a general tool-use agent (no web/file/exec/MCP tools wired into a cell). `AgentLoopConfig` supports arbitrary `tools[]`, `pluginTools`, `capabilityRouter`, `governancePolicies.blockedTools` — none are exercised by the cell.
2. **Scoring is substring-match QA.** `scoreAccuracy` (`metrics.ts:57-64`) is "any expected substring present = full credit". An agentic *task* benchmark (did the agent accomplish a multi-step goal?) needs a different success function — the judge path (`runJudge`) is binary correct/incorrect over (question, ground_truth, answer), still QA-shaped.
3. **Outcome = a single final string.** `AgentResponse` is `{content, toolsUsed[], usage}`. The harness records `text` + latency + cost + `failure_mode`. It does NOT record per-tool-call traces into the JSONL (though `runAgentLoop` supports `traceRecording` + `onToolUse`/`onToolResult` callbacks that the cell could capture).

### 2.2 What it would take to add the four requested capabilities

**(a) An agentic task dataset.** The `DatasetInstance` shape (`{instance_id, question, context, expected[], conversation_id?}`) is QA-centric. For agentic tasks you need: a task/goal prompt (fits `question`), an environment/seed state, available tools, and a *verifiable success oracle* (not a substring). Minimum viable path:
   - Add a dataset entry + a loader (or extend `DatasetInstance` with optional `task_spec`/`tools`/`success_check` fields — additive, the existing optional `conversation_id` precedent shows the pattern).
   - Add a builder script under `scripts/` (mirror `build-locomo-canonical.ts`) and stamp a `dataset_version` SHA.
   - Decide the success metric: either a programmatic checker (env state assertion) or an LLM judge with a task-completion rubric (the failure-taxonomy F5 "tool-use-error" code already exists, `codes.ts:36`).
   Effort: **medium** (new loader + scorer; the registry/version/seed machinery is reusable as-is).

**(b) Per-cell agent-loop vs raw model call.** Already solved — `cells.agentic` is the template. To add a *general-tool* agentic cell: clone `cells.agentic`, swap the `tools` array (and supply real tool implementations + `litellm` routing — agent-loop talks to LiteLLM directly, not via the cell `LlmClient`), register it in the `cells` map + `isCellName` + `VALID_CELLS`. The runner already plumbs `substrate`, `litellm`, and per-cell knobs through `RunConfig → CellInput` (`runner.ts:408-420`). Effort: **low–medium** (mostly tool wiring + a success scorer; the dispatch is generic).

**(c) New models (Opus 4.8, OSS models).** Add JSON entries to `config/models.json`:
   - Opus 4.8 → `provider: 'anthropic'`, `litellmModel: 'claude-opus-4-8'` (or the dated snapshot), `pinning_surface: 'anthropic_immutable'`, `pinning_surface_carve_out_reason: null`, pricing + 200K context. (Note: the global instruction set names the model id `claude-opus-4-8[1m]`; confirm the actual LiteLLM route/snapshot id before pinning — the `[1m]` suffix is a context-window variant, not necessarily the API model string.)
   - OSS models → `provider: 'local'` or `'ollama'`, `litellmModel` pointing at the vLLM/Ollama route, price 0, `pinning_surface: 'floating_alias'` with a carve-out reason containing "B3 addendum" (the test enforces this substring, `models-config.test.ts:115`).
   Then ensure `litellm-config.yaml` resolves the route. Effort: **low** (config-only), *but* the `pinning_surface` test contract is strict — OSS/local entries MUST carry the "B3 addendum" rationale string or `models-config.test.ts` fails.

**(d) The memory toggle as a cell.** Conceptually already present as the `retrieval` (memory-on) vs `no-context` (memory-off) pair — that *is* the honest memory toggle. The catch a reviewer will raise: the README's `raw` cell is NOT memory-off (it embeds LoCoMo's oracle-selected `instance.context`, see the `no-context` rationale at `cells.ts:464-479` and `types.ts:50-63`). For a clean toggle on an *agentic* task: define two cells that share everything except whether `search_memory` (and a populated substrate) is available — e.g. `agentic` (memory on) vs an `agentic-no-memory` cell (same loop, empty/forbidden tool list, or a substrate with no ingested frames). Effort: **low** (clone + drop the tool/substrate).

### 2.3 Reusable scaffolding (free with the harness)
Per-row JSONL with turnId correlation (`turnId` matches `packages/agent/src/turn-context.ts`), seed reproducibility, USD budget cap (`--budget`, hard stop), single-runner PID+heartbeat lock (`runner-lock.ts`), pre-cell health check (`health-check.ts`), consecutive-failure streak halt (`streak-tracker.ts`), fetch-retry on transport TypeError (`llm.ts:129-166`), dataset/manifest SHA audit anchors, judge ensemble + 4th-vendor tie-break + PM-escalation, reasoning-content capture with hard read-path exclusion. This is publication-grade plumbing already.

---

## PART 3 — EQUIVALENCE (TOST) SUPPORT

### 3.1 What exists today
- **No superiority hypothesis test in the harness.** Despite the task framing ("it currently does superiority (z-test/CI)"), the harness stats module does **not** contain a z-test or any p-value. It has Wilson CI + cluster-bootstrap CI + Fleiss κ. "Superiority" is asserted informally (a treatment cell's CI sits above a baseline cell's CI). The inferential numbers in the project's published claims (Fisher exact, z-scores) were computed in external scripts, not here.
- The bootstrap module already produces the empirical resample distribution of the correctness *mean* per cell — the raw material a paired/two-sample comparison needs, but it only emits the marginal 2.5/97.5 quantiles, not a between-cell difference distribution.

### 3.2 What an equivalence (TOST) claim needs — and what is missing
TOST (Two One-Sided Tests) for two proportions p_A (e.g. Opus 4.8) and p_B (e.g. an OSS model), with an equivalence margin ±δ, concludes equivalence iff the (1−2α) CI of the difference (p_A − p_B) lies entirely within [−δ, +δ]. Missing pieces, all net-new:

1. **An equivalence margin δ — pre-registered.** This is a *design decision*, not code: it must be in the locked manifest YAML *before* the run (the pre-registration surface can carry it, but nothing computes or stores δ today). A reviewer will reject a post-hoc δ.
2. **A difference estimator with a CI.** None exists. Options:
   - **Cluster-aware difference bootstrap** — the rigorous choice given LoCoMo's conversation clustering. Extend `cluster-bootstrap.ts` to resample paired conversations and emit the distribution of `(mean_A − mean_B)` per resample, then take the 90% (for α=0.05 TOST) percentile interval. This is the smallest correct change because the Mulberry32 + cluster-resample machinery is already there; it needs a two-arm variant.
   - **Newcombe/Wilson hybrid score interval for a difference of proportions** — closed-form, but assumes independence (wrong for clustered LoCoMo; would *understate* uncertainty and is exactly the bias `cluster-bootstrap.ts` was written to avoid).
3. **Paired vs unpaired structure.** The 4-cell design runs the *same instances in the same order* across cells (`runner.ts:374`), so cell-vs-cell comparisons are **paired** — the TOST should be paired (difference computed per-instance/per-conversation, then bootstrapped over conversations). Model-vs-model on the same dataset is likewise paired. The current per-cell summary writes only marginal accuracy; **no per-instance join across arms is performed at aggregate time** — that join would have to be added (the JSONL rows carry `instance_id`, so the join key exists).
4. **Confidence-level generalization.** Both CI modules **hard-reject any confidence ≠ 0.95** (`wilson-ci.ts:71`, `cluster-bootstrap.ts:94`). TOST conventionally uses a 90% interval (α=0.05 each side). The modules must be extended to support 0.90 (and the Wilson z-lookup table widened) or a dedicated TOST function added.
5. **Multiplicity.** If the benchmark makes several equivalence claims (multiple model pairs / cells), the design needs a pre-registered correction policy — purely a design artifact, but a reviewer will ask.

### 3.3 Recommended minimal-surface implementation
Add `src/stats/equivalence-tost.ts`:
- `computePairedDiffClusterBootstrapCI({rowsA, rowsB, conversation_id, n_bootstrap=10000, seed=42, confidence=0.90})` → returns `{diff_point, ci_lower, ci_upper, n_clusters}` reusing the Mulberry32 + cluster-resample idiom from `cluster-bootstrap.ts` (resample conversations once per iteration, apply the *same* picks to both arms to preserve pairing).
- `tostEquivalence({diffCI, margin})` → `{equivalent: boolean, margin, ci}` (equivalent iff `[ci_lower, ci_upper] ⊆ [−margin, +margin]`).
- Plumb the pre-registered `margin` + `confidence` into the manifest payload so the equivalence threshold is locked before the run (extend `PreregistrationManifestPayload`).
- Unit tests mirroring `tests/stats/cluster-bootstrap.test.ts` (determinism, pairing, known fixtures).

---

## APPENDIX — file:line index for verification
- 7 cells + dispatch: `src/cells.ts:65-72` (types), `:291-487` (impl), `:490-504` (guards). Runner dispatch `src/runner.ts:408-424`, cell roster `:691-728`.
- Agentic loop: cell at `src/cells.ts:370-462`; `runAgentLoop` signature `packages/agent/src/agent-loop.ts:24-143`; tool def `src/cells.ts:223-267`; tests `tests/agent-loop-exhaustion.test.ts`.
- Substrate: `src/substrate.ts` (MindDB + FrameStore + SessionStore + HybridSearch, `:memory:` + ollama-embedder); ingest `src/ingest.ts` (frame-per-turn).
- Datasets: registry `config/datasets.json`; loader `src/datasets.ts` (`loadDataset` `:171`, `getDatasetVersion` `:53`, `loadPreflightSampleLock` `:106`, `sampleInstances` `:221`).
- Models: `config/models.json` (12 entries, no Opus 4.8); schema `src/types.ts:145-192`; tests `tests/models-config.test.ts`.
- Pre-registration: `src/preregistration.ts` (payload `:66-89`, hash `:152`, path resolve `:115`, sanitize `:227`); emit site `src/runner.ts:363-370`; per-row stamps `:492, 522-532`.
- Stats: `src/stats/{fleiss-kappa,wilson-ci,cluster-bootstrap,index}.ts`. No hypothesis/z/p-value test (grep-verified). Pipeline test `tests/smoke/smoke-run.test.ts`.
- Failure taxonomy: `src/failure-taxonomy/{codes,rubric,aggregate,validator}.ts`.
- Scoring: substring match `src/metrics.ts:57-64`. Judge: `src/judge-runner.ts`, `src/judge-client.ts`, `src/judge-types.ts`.
- CLI: `bench` script = `npx tsx benchmarks/harness/src/runner.ts` (root `package.json:15`); harness-local `bench` = `tsx src/runner.ts` (`harness/package.json:17`). README examples say `npm run bench` (works from root).
- Stale doc: `README.md` documents only the 4 Sprint-9 cells; the operative grid is 7 cells (retrieval/agentic/no-context added Sprint 12 Task 2.5).
