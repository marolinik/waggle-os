# WAGGLE — Build-vs-Borrow record (Preserve → Borrow → Adapt → Build)

> **English translation** of [WAGGLE-BUILD-VS-BORROW-v1.2.md](WAGGLE-BUILD-VS-BORROW-v1.2.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Document revision: 1.2 DRAFT · 27.09.2026 · reviewed code revision 2af0904df01ca3d374cc78ba95b60dc579dd6a7a**

**Document revision: 1.2.1 DRAFT · 30.09.2026 · final closure (H-01..H-12)**

Changes in 1.2.1: H-03 (re-check 30.09.2026) — BB-01 `HarnessRunState` range `workflow-harness.ts:118-128` → `:110-128` (LOW `finish/facts/f1/06`; read-only `git show 2af0904d`: the interface starts at line 110); §5 BB-COST.6 aligned with BB-13 and marked as live external data (LOW `finish/facts/f1/04`). The rest of the document is unchanged; the "two untracked `.docx`" state above and in BB-00 refers to the working tree `D:/Projects/waggle-os` at `2af0904d`.

Working tree `D:/Projects/waggle-os` == HEAD (`git status --porcelain` reports only two untracked `.docx` files in `docs/`), so every `path:line` below applies to the stated revision. The repo was treated as read-only; this document does not change code, does not select a dependency for production and does not approve anything (BRIEF §20.4). Date baseline: 27.09.2026; 12–17 weeks = 20.12.2026–24.01.2027.

**Status legend (mandatory on every claim; aligned with PRD v1.2):** DECISION (only D-01..D-18) · HISTORICAL FOUNDER DECISION (memory, date) — aligned with D-xx / the brief's direction (founder records from project memory before 27.09.2026; brief §2.1/§21: not a D authority) · PROPOSAL — BRIEF DIRECTION (DIR-nn, brief §17–§19 resolutions, brief §k — planning direction, never a DECISION; prohibitions from DIR-01 = "PROPOSAL — BRIEF DIRECTION (DIR-01, authority boundary)") · CONFIRMED AT REVISION · AUDIT FINDING — TO VERIFY · PARTIAL/UNWIRED · PROPOSAL · DEFERRED · UNKNOWN. "Module exists" is never evidence of an E2E function. "Not found" is stated only after multiple grep passes by capability, not by name.

---

## 0. Purpose, baseline and reading rules

**BB-00.1 — What this document is.** The per-area record required by BRIEF §14 (DIR-24), FRD v1.1 FR-OSS-01/-02/-03/-12 (FRD v1.1 §18; FRD v1.2 has no separate OSS section — §16.1/§16.2 note that FR-OSS-01..12 remain valid) and PRD v1.1 §14 / PRD v1.2 §15: for every major area — existing Waggle (with callers), OSS candidates with an assessment, a Preserve/Borrow/Adapt/Build decision, rationale, owner (role). It includes the provenance inventory schema (FR-OSS-04) and the seed list. **DECISION** (D-17 "BORROW → ADAPT → BUILD") + **PROPOSAL — BRIEF DIRECTION** (DIR-24).

**BB-00.2 — What it is not.** It is not an approval to add dependencies, it is not an ADR and it is not an implementation. Every "Borrow/Adapt" decision below is a **PROPOSAL** until the founder confirms it and until the test criterion from §3 passes. Decisions D-01..D-18 are not reopened; "Option A ship first" is not the plan; the working baseline is G1 → G2 → G3 (BRIEF §5.1). **DECISION** (D-01..D-18 are not reopened) + **PROPOSAL — BRIEF DIRECTION** (§5.1 working baseline; ratification: founder).

**BB-00.3 — Source authority.** Phase-A findings (`docs/plans/v1.2-evidence/phaseA/*.md`) and refuter verdicts (`*.refute.md`) override S1 where they differ — **CONFIRMED AT REVISION** for findings derived from the repo (sources cited in the footnote). External data (repo/version/commit/license/maintenance/stars of OSS candidates) comes from `docs/plans/v1.2-evidence/phaseA/external.md` and represents the live state of GitHub/registries, not a property of revision `2af0904d`: **AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §2–3, §8)**; the same applies to model, benchmark and channel data (external §1, §4, §5). Where phase A did not research an OSS area, it is marked **UNKNOWN** and what would close it is stated — candidates are not invented.

**BB-00.4 — Decision definitions.**

| Decision | Meaning in this document |
|---|---|
| **Preserve** | Existing Waggle code remains the core; only the contract/wiring/test changes. It is prohibited to "preserve" a no-op as a finished capability (BRIEF §14, DIR-13). |
| **Borrow** | OSS is used as a dependency, or code/a pattern is taken over without changing its semantics, with license and provenance recorded in the inventory (§4). |
| **Adapt** | OSS is wrapped/forked/ported with modifications; an upstream-sync or long-term ownership plan is mandatory (FRD v1.1 §19 OSS acceptance; in FRD v1.2 via the §16.1/§16.2 note on FR-OSS-01..12). |
| **Build** | New code, with a short rationale for why Preserve/Borrow/Adapt does not suffice (PRD v1.1 §14 "OSS Harvest gate" / PRD v1.2 §15, PRD-15-01). |

**BB-00.5 — Assessment criteria (FRD v1.1 FR-OSS-03, PRD v1.1 §14 / PRD v1.2 §15).** License; maintenance/activity; security/supply chain; dependency weight; Windows; offline/local-first; API/architectural fit; tests; performance; upstream cost/probability of divergence; exit strategy. The columns in the tables below follow this order. **PROPOSAL** (inherited requirement FRD v1.1 FR-OSS-03; S5 draft, not D-nn).

**BB-00.6 — Repo boundaries that affect all areas (CONFIRMED AT REVISION).**
- The Windows Solo package must not depend on developer Node/Python/Docker/external LiteLLM/a separately installed Ollama (CLAUDE.md §1). Python and Docker are allowed only on the dev/bench machine, not in the installer.
- Already shipped native/runtime components: `better-sqlite3` **12.6.2** (`package.json:73`), `sqlite-vec-windows-x64` **0.1.9** (`package.json:133`), `onnxruntime-node` **1.21.0** (lock), `@huggingface/transformers` **3.8.1** (`package.json:114`), `cron-parser` **4.9.0** (`packages/core/package.json:22`), `@ax-llm/ax` **24.0.23** (lock; declared `^24.0.20` in `packages/agent/package.json:35`), `@modelcontextprotocol/sdk` **1.30.1**, `fastify` **5.12.5**, Node desktop pin **22.23.2** (`scripts/bundle-node.mjs:39`), Ollama pin **0.32.3** / rollback **0.32.0** (`packages/server/src/local/managed-ollama-runtime.ts:28-29`).
- The substrate `packages/hive-mind-core/src/{mind,harvest}` is subject to the curated OSS forward-port (CLAUDE.md §7.5); every change there carries a re-baseline cost in `scripts/oss-drift-baseline.json`. The drift checker currently returns exit 1 with 22 known blockers + **3** unreviewed (`docs/plans/v1.2-evidence/phaseA/oss-drift-check-output.txt`; F-REL-07).

**BB-00.7 — Control pass over the working tree (== HEAD `2af0904d`; `git status --porcelain` = only two untracked `.docx`). CONFIRMED AT REVISION.** Independently of phase A, the following anchors were re-read and match the text of this document: `package.json:73,114,133`; `scripts/bundle-node.mjs:39`; `managed-ollama-runtime.ts:28-29`; `agent-run-registry.ts:29` (`MAX_EVENTS = 2_000`); `held-action-executor.ts:6-10` (inline ADR "never mid-run suspend/resume"); `workflow-harness.ts:313` (`shouldSkipVerify()`); `builtin-harnesses.ts:128,181`; `verification-gate.ts:33` (`'run_harness'`); `command-registry.ts:108`; `capability-router.ts:51`; `evolution-runs.ts:23-28` (enum without `rolled_back`); `execution-traces.ts:150-151` (`CHECK` without `gate_passed`); `iterative-optimizer.ts:88-93` (`EvolutionTarget` without a recipe value); `oss-drift-check.mjs:22-28`; `bundle-native-deps.mjs:113-130` (copies binaries without LICENSE); `certify-windows-installer.ps1:2596-2600,2904`; `.github/workflows/ci.yml:108-110` (`npm audit` `continue-on-error: true`); `hardware-detect.ts:7-19`; `cookbook/catalog.ts:44-51` (newest Qwen = `qwen3:*`); `local-inference.ts:313-332` (`stream: false`, 45-min timeout); `inprocess-embedder.ts:32`; `inprocess-reranker.ts:55`; `packages/core/package.json:22`; `packages/agent/package.json:35`; `packages/shared/package.json:16`. Counts: 18 `starter-skills/*.md`, 30 connectors (excluding `index.ts`), 148 `id:` entries in `mcp-catalog.ts` (one hit for `license`, and that one inside `capabilities`). `node_modules`: `onnxruntime-node` 1.21.0 MIT, `sqlite-vec-windows-x64` 0.1.9 "MIT OR Apache", `sqlite-vec` 0.1.9, `@ax-llm/ax` 24.0.23 Apache-2.0 — all four **without** a LICENSE file; `better-sqlite3` 12.6.2, `cron-parser` 4.9.0, `@huggingface/transformers` 3.8.1, `@modelcontextprotocol/sdk` 1.30.1, `fastify` 5.12.5, `undici` 8.11.2, `zod` 4.6.5, `stripe` 22.6.2 — with a LICENSE file. `vendor/pptxgenjs/LICENSE` exists; `git ls-files` has no `THIRD_PARTY*|SBOM|NOTICES`; `tauri.conf.json` has no `licenseFile`; `packages/{optimizer,weaver}/LICENSE` "proprietary and confidential" alongside `"license": "MIT"` (`optimizer/package.json:17`, `weaver/package.json:24`); 9 manifests without a `license` field (list in BB-12). No spot check deviated from the text.

---

## 1. Decision overview (one row per area)

| ID | Area | Existing Waggle (summary) | OSS candidate(s) | Decision | Decision status |
|---|---|---|---|---|---|
| BB-01 | Durable run store | `AgentRunRegistry` (JSON file), `CheckpointStore`/`RecoveryRunner` (unwired), held-action queue, `CronStore` leases | Reflow (MIT, SQLite), persistasaurus/Morling (reference), DBOS/Temporal/Restate/Inngest/Absurd (do not meet the conditions) | **Preserve** existing + **spike Adapt(Reflow) vs Build(minimal SQLite)** per §3 | PROPOSAL |
| BB-02 | Harness engine/router | `advancePhase` state machine, deterministic gate helpers, `detectTaskShape`, `composeWorkflow`, `CapabilityRouter`, `HarnessTraceBridge` | agent-native (pattern only), Omnigent (pattern only) | **Preserve + Build** (server-side router and observed-evidence gates are net-new) | PROPOSAL |
| BB-03 | Context package | `recallMemory` 7 lanes + RAWDETAIL, `PromptAssembler`, `executor-brief.ts`, hook runtime | none researched in phase A | **Preserve** engine + **Build** typed contract (wrapper) | PROPOSAL (candidates UNKNOWN) |
| BB-04 | Capability resolver | 4 engines without a facade; `CapabilityProposalStore`; `PermissionEnvelope` does not exist as an object | agent-native "shared actions" (pattern only) | **Preserve** engines + **Build** thin facade and envelope | PROPOSAL |
| BB-05 | Shared actions (UI/agent/routine) | `ACTION_REGISTRY` (4 actions, ⌘K only), `ToolDefinition` shared agent↔held action, UI goes to REST directly | agent-native `@agent-native/core` (MIT per package.json, no root LICENSE) | **Preserve** `ToolDefinition` + **Adapt** the existing `ActionDescriptor`; agent-native pattern only | PROPOSAL |
| BB-06 | Evolution/promotion | GEPA (`@ax-llm/ax`), running judge, `EvalDatasetBuilder.build()` (unwired), `evolution_runs`, deploy/rollback functions (rollback without a caller) | `@ax-llm/ax` (Apache-2.0, already a dependency); other optimizers not researched | **Preserve + Borrow(ax)** + **Build** active-version pointer, holdout, manifest | PROPOSAL |
| BB-07 | Attention / WorkItem sync | Gmail/GCal/Outlook/Slack connectors, `connector-harvest.ts`, `home.ts` briefing; WorkItem store does not exist; incremental sync (historyId/syncToken/delta) does not exist | none researched in phase A | **Preserve** connectors + **Build** WorkItem store and delta sync; ToS profile per channel | PROPOSAL (OSS UNKNOWN) |
| BB-08 | Local inference / hardware detect | managed Ollama runtime (sha256 pin, Range resume), `hardware-detect.ts` (NVIDIA/Apple/CPU), `model-fit.ts`, `cookbook/catalog.ts` (without Qwen 3.5/3.6/3.8) | Ollama (MIT), vLLM (Apache-2.0; server path), llama.cpp/LM Studio as OpenAI-compatible presets (R17), odysseus `hwfit` (AGPL — concept only) | **Preserve + Borrow(Ollama/vLLM/OpenAI-compat)** + **Build** WMI/AMD detection and catalog re-baseline | PROPOSAL |
| BB-09 | Benchmark runners | `benchmarks/gaia2/adapter.ts` (narrow-proxy), `benchmarks/harness` (4-cell), τ² adapter only on branch `feature/harness-sota-bench` | APEX-Agents 1.1 (CC-BY-4.0) + Harbor 0.20.0, τ²-bench v1.0.1 (MIT), ARE (MIT)+gaia2 (CC-BY-4.0), GDPval (license UNKNOWN), FORTE (MIT, 15/180), OdysseyBench (MIT) | **Borrow** official runners/scorers; **Build** only a Harbor/HTTP shim to the production sidecar (DIR-22); cherry-pick of the τ² adapter without a rebase | PROPOSAL (primary test not approved) |
| BB-10 | Skills pack | 18 first-party starter skills (`packages/sdk/src/starter-skills/*.md`), skill create/distill/audit/hygiene paths | `anthropics/knowledge-work-plugins` and `anthropics/skills` — license/version **not checked** in phase A | **Preserve** first-party pack; OSS import **DEFERRED** until a per-repo license check | PROPOSAL / UNKNOWN |
| BB-11 | Connectors / MCP | 30 first-party connectors (`packages/agent/src/connectors/`), MCP catalog of 148 entries (`packages/shared/src/mcp-catalog.ts`), `MarketplaceInstaller`+`SecurityGate`, `mcp-runtime.ts` | OSS MCP servers from the catalog (license per server; the catalog carries a `license` field only in marketplace sync) | **Preserve** connectors and installer; **Borrow** MCP servers exclusively through SecurityGate + inventory; no silent install (R11) | PROPOSAL |
| BB-12 | Licenses / SBOM tooling | `oss-drift-check.mjs`, `bundle-node.mjs` NODE-LICENSE, `stage-sidecar-deps.mjs` (preserves LICENSE), `certify-windows-installer.ps1:2596-2600`; **no** SBOM/THIRD_PARTY_NOTICES/license CI | CycloneDX/SPDX generators for npm, `license-checker`-class tools, `cargo-deny`/`cargo-about` — **not researched** in phase A | **Borrow** a standard SBOM/notices tool after evaluation; **Build** only the aggregation for native binaries and model/runtime entries | PROPOSAL (tools UNKNOWN) |

---

## 2. Per-area records

### BB-01 — Durable run store (run lifecycle, checkpoint, actions, lease)

**What we need (contract):** `DurableRun`, `PhaseAttempt`, `Checkpoint`, `ToolAction`/`ToolAttempt` (stable `actionId` ≠ `attemptId`), `RunEvent` with a monotonic `seq`, `ProofReceipt` (BRIEF §6.3); canonical states with a legacy map (§6.4); lease/fencing (§6.5); migration of `agent-runs.json` (§12.4). Linked tests: AT-07, AT-08, AT-09, AT-10, AT-27.

**Existing Waggle — CONFIRMED AT REVISION (callers verified by grep; source F-DUR-01..14 + refute):**

| Asset | Path | Callers / tests | Reuse assessment |
|---|---|---|---|
| `AgentRunRegistry`: run record before execution, revision/seq event log, `eventsSince(since)` + `resetRequired`, atomic tmp+rename persist with a Windows fallback, `reconcileExternalProcesses` | `packages/server/src/local/agent-run-registry.ts` (`:243-257`, `:497-508`, `:522-574`) | `index.ts:538`, `fleet-run-executor.ts:413,480-496,551`, `chat-collaboration.ts:119-622`, `routes/agent-runs.ts`, `routes/agents.ts:106-160`, `routes/tools.ts:211-336` | **Preserve** as an adapter/facade over the future store (S1 A8 direction). Limitations: whole-file JSON, `MAX_EVENTS=2_000` (`:29`), `load()` silently yields an empty store on `version!==1`/corrupt (`:522-535`), restart → all internal runs terminally `interrupted` (`:510-520`, constructor `:137`), no transition out of `interrupted` (0 in `packages/server/src`). |
| `CheckpointStore` (schema_version=1, atomic save, `verifyIntegrity`) + `RecoveryRunner` (retry/backoff/fallback/exhaust) | `packages/agent/src/long-task/checkpoint.ts:31,85,170-211,267-290`; `recovery.ts:250-386` | the only non-test consumer is `retrieval-agent-loop.ts:153,568-579,713-755` (optional); `RecoveryRunner` 0 production callers; `/api/agent/run`, gaia2 adapter, `agent-loop.ts` = 0 | **PARTIAL/UNWIRED** → asset for **Adapt**: the unit of recovery is an LLM turn, not a phase (DIR-05); a `CheckpointStepState → Checkpoint` mapping is needed. Cross-process resume proven only in `packages/agent/tests/long-task-loop-integration.test.ts:221-330`. |
| Held-action queue: `pending_actions`, atomic claim `held→approved` (`UPDATE … WHERE id=? AND status='held'`), TTL 7d, re-validation on execute | `packages/server/src/local/held-action-executor.ts:6-10,29,154-166,191-235`; `packages/core/src/cron-store.ts:83-88,505-586` | producers `index.ts:2632-2645`, `chat-approval-hook.ts:301-323`; consumer `routes/approval.ts:58-99`; tests `held-action-executor.test.ts` (18) | **Preserve** as the starting pattern for a stable `actionId` (closer to DIR-06 than the S1 A7 key `runId+phaseId+attempt+callIndex`, which does not exist in code). Gap: no `unknown_outcome`/`dispatching` status; a crash between `tool.execute` (`:233`) and the result write (`:235`) leaves the row `approved` forever (F-DUR-05 HOLDS). The inline ADR "never mid-run suspend/resume" (`:6-10`) requires a superseding ADR (BRIEF §20.2 (2),(4)). |
| `CronStore` + `LocalScheduler`: `getDue/markRun`, run leases + boot sweep, rate-limit resume, 5-strike auto-disable, history retention 30d, `ai_task` daily cap | `packages/core/src/cron-store.ts:203-206,367-382,442-447`; `packages/server/src/local/cron.ts:219-389` | `index.ts:1913-2706` (8 job types); tests `local-scheduler`, `cron-scheduler-hardening`, `cron-error-handling`, `automations`, `core/tests/cron-store` | **Preserve** the schedule; separate the execution state (BRIEF §12.4). Gaps: the lease is a plain `INSERT` without UNIQUE → not fencing (AT-09); the executor has no occurrence id; `computeNextRun` without `tz`; **AUDIT FINDING — TO VERIFY:** `getDue()` compares an ISO `'T'` string with `datetime('now')` (space) → a same-day due time may never be reached (refute F-DUR-10; SQL probe over `:memory:`, not over `CronStore`). |
| Harvest resume pattern (`interrupted` → resume in another domain) | `packages/server/src/local/routes/harvest.ts:128`; `apps/web/src/lib/adapter.ts:4018`; `HarvestTab.tsx:100-227` | UI M-08 | **Borrow from Waggle** for the W1 resume API (refute F-DUR-01 context). |
| Serializable `HarnessRunState` (`phaseStatuses`, `checkpoints`, `totalTokens`) | `packages/agent/src/workflow-harness.ts:110-128` | in-memory `workflow-tools.ts:447` | A shape that can be serialized into `Checkpoint`. |
| Registry stream `GET /api/agent-runs/events?since=` | `routes/agent-runs.ts:61-116` | `RoomApp.tsx`, `room-state-reducer.ts` | A compatible equivalent of `sinceSeq` for run status, **not** for chat text/cards (chat SSE has no `Last-Event-ID`; 0 in `packages/server/src`). |

**What was NOT found (multiple grep passes by capability, F-DUR §3): CONFIRMED AT REVISION** — `DurableRun|ProofReceipt|ToolCallJournal|runs.db|idempotencyKey|Idempotency-Key` = 0 relevant (the only `latestDurableRun` in `routes/agents.ts:106,153,490` is a local helper over the registry); `sinceSeq|Last-Event-ID` in chat SSE = 0; timezone/misfire configuration = 0; server-driven phase executor = 0 (`createHarnessRun|advancePhase(` in `packages/server/src` = 0).

**OSS candidates — AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §3, §8; not a property of the revision) — 5 criteria per external.md §3: (a) embedding in the Node/Fastify sidecar without a separate server, (b) SQLite, (c) Windows, (d) permissive license, (e) maturity/maintenance:**

| Candidate | Repo / version | License | Maintenance | Security (supply chain) | Windows | Offline | Deps weight | API fit | Tests | Perf | Exit strategy | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Reflow** | `danfry1/reflow-ts` v0.7.0 (push 2026-09-14) | MIT | 1 author, 41★, created 2026-03-11 → **bus factor 1** | not reviewed (UNKNOWN); small surface | yes (Node) | yes | `reflow-ts/sqlite-node` requires `better-sqlite3 ≥9` → **compatible with 12.6.2** (no second native build) | lease/heartbeat, retries, cooperative cancel (`AbortSignal`), `sleep`/`waitFor` with lease release, idempotent enqueue, `getRunStatus()` → covers part of AT-09/AT-10; **no** ProofReceipt/PhaseAttempt/actionId semantics | UNKNOWN (test suite not read) | UNKNOWN (not measured) | vendor/fork under MIT; small codebase = easy to take over maintenance | **Closest fit** — candidate for an Adapt spike |
| persistasaurus / Morling blog | `gunnarmorling/persistasaurus`, blog 2025-11-20 | Apache-2.0 | reference | n/a | Java | n/a | n/a (not imported) | "<1000 LOC, not production-ready"; no retry/backoff, parallelism, compensation | — | — | design reference | **Reference for Build** |
| DBOS Transact TS | `dbos-inc/dbos-transact-ts` v5.1 | MIT | active, 1,376★ | — | yes | no | **Postgres required** (SQLite only in Go SDK v0.17) | does not meet (b) | — | — | — | Rejected |
| Temporal | `temporalio/temporal` + `sdk-typescript` | MIT | mature, 23k★ | — | `temporal.exe` dev server | partially | separate binary server + Rust core | "sidecar of a sidecar" too heavy for desktop | — | — | — | Rejected for desktop; possible for the KVARK server profile (DEFERRED) |
| Restate | `restatedev/restate` | server **BSL 1.1**, SDK MIT | active | — | **no Windows binaries** | no | separate server, RocksDB | — | — | — | — | Rejected |
| Inngest | `inngest/inngest` + SDK `inngest@4.21.0` | server SSPL + delayed Apache; SDK `package.json` Apache-2.0 (GitHub detection GPL-3.0 → UNKNOWN) | active, 5,894★ | — | known Win11 issues | no | separate dev server | — | — | — | — | Rejected |
| Absurd | `earendil-works/absurd` | Apache-2.0 | "experiment", push 2026-08-10 | — | — | no | Postgres-only | — | — | — | — | Rejected |
| LangGraph JS `SqliteSaver` | `@langchain/langgraph-checkpoint-sqlite` | MIT | maintained | — | yes | yes | `better-sqlite3 ^11.7.0` → **conflict with 12.6.2** (two native builds) | only a checkpointer for LangGraph graphs; requires the LangGraph runtime | — | — | — | Rejected |
| Vercel Workflow DevKit | `vercel/workflow` | Apache-2.0 | 2,439★, public beta | — | yes | "Local World" = JSON files, "not production" | custom World over SQLite = Build work | partial | — | — | — | Rejected as a dependency; the "World" concept = reference |
| iterativeflow / OpenWorkflow / Resonate / durabletasks | various | MIT / Apache / Apache / **no license** | immature / UNKNOWN / separate server / dead | — | — | — | — | — | — | — | — | Rejected |

**Decision (PROPOSAL):** **Preserve** `AgentRunRegistry` (as an adapter), the held-action pattern, `CheckpointStore` semantics, the `CronStore` schedule, the AbortSignal chain (`agent-loop.ts:1090-1108`). For the run store core itself: **a bounded spike in two branches — (1) Adapt Reflow (vendor or fork, MIT) vs (2) Build a minimal engine over `better-sqlite3` with Reflow/persistasaurus as references** — the decision is made by **the test criterion from §3 (R22)**, not by LOC. SQLite is a candidate, not a decision (BRIEF §6.3, A8 "CANDIDATE + ADR"). A new database is not added if the existing storage can demonstrably satisfy the contract; execution state is not placed in semantic memory (Loop `loop:<id>` state today lives in the personal `.mind` Awareness layer and enters recall as a "Pending Items" row — refute F-DUR-09 HOLDS+).

**Rationale:** no candidate meets all 5 conditions (a)–(e) (AUDIT FINDING — TO VERIFY, live 27.09.2026, source: external.md §3, §8; the summary in external §0 row 7 says "all 4 conditions", but lists five — the list (a)–(e) in §3 is authoritative). Reflow is the only one without a separate process and it uses a compatible `better-sqlite3`, but it has bus factor 1 and does not cover the ProofReceipt/PhaseAttempt/action-attempt separation — in either case that would be Waggle code. S1 "Build ~600–1000 LOC" remains a valid option, but **is not concluded in advance** (R22).

**Owner (role):** Runtime/W1 owner; ADR (2) and (3) from BRIEF §20.2; merge owner for `agent-run-registry.ts`, `held-action-executor.ts`, `cron-store.ts`.

**Open:** Reflow test suite and security review (UNKNOWN); `getDue()` format bug (FINDING — TO VERIFY, repro: `store.create({cronExpr:'* * * * *'})` → after >60 s `getDue()` expected 1, hypothesis 0); whether an `interrupted → queued` transition breaks `agent-run-registry.test.ts:84-94` (refute: yes, if the transition table is changed — hence an explicit resume API).

---

### BB-02 — Harness engine and router (phases, gates, modes)

**What we need:** server-side separation of `conversation`/`work` and `normal`/`strict`/`benchmark` (DIR-03), the server as the authority on evidence (DIR-07), three levels of verification (§7.2), a run-scoped event bus (§6.4). Tests: AT-01, AT-02, AT-03, AT-06, AT-21.

**Existing Waggle — CONFIRMED AT REVISION (F-HARN-01..09, repro 25/25 over `packages/agent/dist`; refute 7/7 HOLDS):**

| Asset | Path | Callers | Assessment |
|---|---|---|---|
| `advancePhase` state machine: gates → checkpoint → retry (`maxRetries`) → abort; immutable state | `packages/agent/src/workflow-harness.ts:213-374` | `workflow-tools.ts:424`; test `harness-trace-bridge.test.ts:323` | **Preserve** the machine; replace the evidence source |
| Deterministic gate helpers (`hasToolCalls`, `hasMinSections`, `hasPattern`, `hasMinLength`, `hasSpecificImprovement`) | `builtin-harnesses.ts:13-89` | 3 built-in harnesses `:94-238` | **Preserve**; fix the semantics (VERDICT value, exit code) |
| Three built-in harnesses + `matchHarness`/`getHarnessById` | `builtin-harnesses.ts:94-259` | `workflow-composer.ts:19,82,102`; `workflow-tools.ts:10,307,366` | **Preserve** as the seed for two knowledge-work recipe paths (W3) |
| `run_harness` run_id scoping (state does not bleed between sessions, `93ff7813`) | `workflow-tools.ts:371-390,440-465` | tests `workflow-tools-harness.test.ts` (8) | **Preserve**; `runId` should go into the event payload (F-HARN-07) |
| D3 `assertsUnverifiedCompletion` + disclosure path without a new turn | `verification-gate.ts:220-239`; `loop-gates.ts:907-920` | `agent-loop.ts:1523-1534,1649-1662` | **Preserve**; remove `'run_harness'` from `VERIFICATION_TOOL_EXACT` (`verification-gate.ts:33`) |
| `HarnessTraceBridge` with a per-event `context` resolver and a scoped emitter | `harness-trace-bridge.ts:54-56,80-86` | `packages/server/src/local/index.ts:612-616` (without a resolver) | **Preserve**; change the `complete → 'verified'` mapping (`:91`) and `ok:true/durationMs:0` (`:139-148`) |
| Server-observed ledger primitive: `TraceRecorder.completeToolCall`, `TurnExecutionTrace`, `TurnToolActivity.recordResult`, `isReportedToolFailure` | `packages/agent/src/trace-recorder.ts:142-166`; `packages/server/src/local/routes/chat-turn-execution-trace.ts:46`; `chat-agent-run.ts:214-225`; `routes/chat-bounded-read-tools.ts:13-34` | `agent-loop.ts:489`; `chat.ts:1653` | **Preserve** — this is the "observed evidence" source that `run_harness` does not see today (`grep phase_output packages/server/src` = 0) |
| The process supervisor observes the exit code, the tool discards it | `packages/agent/src/system-tools-helpers.ts:732-735` → `system-tools.ts:681-691` | — | **Preserve** the supervisor; fix the tool boundary (the paths are `packages/agent/src/`, not `server/local` — a correction from the refute) |
| `detectTaskShape` (heuristic), `composeWorkflow`/`selectExecutionMode`, `FEATURE_FLAGS.ADVANCED_WORKFLOWS` (default ON) | `task-shape.ts:145`; `workflow-composer.ts:70,99-139`; `feature-flags.ts:14` | `chat-turn-preparation.ts:381,1119-1123`, `chat.ts:746`, `prompt-assembler.ts:375`, `subagent-orchestrator.ts:336`, `fleet-run-executor.ts:639` | **Preserve** the classifier; **harness selection is not a server router** — `compose_workflow` only prints the mode (`workflow-tools.ts:84-119`) |
| Advisory fields `allowedTools/requiresApproval/timeoutMs` (declared, not enforced) | `workflow-harness.ts:47-68` | no enforcing callers | keep the semantics for the W1 executor |

**Known defects that determine the order (CONFIRMED AT REVISION):** verify is skipped by default (`workflow-harness.ts:313,474-482`; no configuration in the repo sets `WAGGLE_AUTO_VERIFY`); `VERDICT: FAIL` passes (`builtin-harnesses.ts:128`); any bash passes as a test (`:181`); a budget stop disables D3 (`agent-loop.ts:1523-1534`). Refute note: gate fixes are invisible until the skip default (F-HARN-01) and self-reported evidence (F-HARN-08) are resolved. The `gate_passed` outcome requires a **SQLite table-rebuild migration** because of the `CHECK` constraint (`hive-mind-core/src/mind/execution-traces.ts:150-151`, `mind/schema.ts:242-243`) — it is not a type edit; the schema-free alternative = a tag in `tags[]` + an eval filter (PROPOSAL).

**OSS candidates:**

| Candidate | Repo / version | License | Maintenance | Security | Windows | Offline | Weight | API fit | Tests | Exit | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BuilderIO/agent-native | v0.1.271 (2026-09-27), 6,863★ | root `package.json` **ISC**, GitHub `license: null` (no root LICENSE), the `@agent-native/*` packages declare MIT without LICENSE text in the package → **per-file rights UNKNOWN** | very active | not reviewed | Node/Nitro | Postgres/PGlite | Postgres + Nitro | **low** (Waggle = SQLite/Fastify/Tauri) | `docs/agent-run-stop-conditions.md`: watchdog patched "≥6 times in 4 months" | n/a | **Pattern reference only** (actions-once, event log, proof receipts); no code copying until the per-file license is clear (R20, FR-OSS-05 condition "license-compatible" not met) |
| Omnigent | `omnigent-ai/omnigent` v0.15.0 (2026-09-24), 10,293★ | Apache-2.0 (+NOTICE) | active, **alpha** | not reviewed | "native but degraded" (no terminal wrapper, sandbox, egress proxy) | — | **Python 3.12+** + Node 22 → violates the no-Python package | adapter contracts (ACP over stdio, result return, policy) | — | n/a | **Reference only** (R21, FR-OSS-06) |

**Decision (PROPOSAL):** **Preserve** the state machine, gate helpers, classifier and trace primitives; **Build** (a) a server-side router `conversation/work × normal/strict/benchmark`, (b) an `observedToolCalls` provider that the server populates from `onToolResult`, (c) `runId` in event payloads and a per-run bus. agent-native and Omnigent = pattern reference without a dependency (D-17, BRIEF §14 rows 2–3).

**Rationale:** there is no OSS "harness router" that could be plugged in without a framework migration, and D-17 prohibits automatic migration. All the required code is a thin layer over the existing `advancePhase` and `TurnToolActivity`; copying agent-native code is not allowed until a per-file LICENSE exists.

**Owner (role):** Harness/W0→W3 owner; merge owner for `agent-loop.ts`, `workflow-harness.ts`, `chat.ts` (hotspot, BRIEF §15.3).

**Tests that will go red with the fix (CONFIRMED AT REVISION):** `workflow-tools-harness.test.ts:135-179` (relies on auto-skip), `harness-trace-bridge.test.ts:82-92,327` (pins `'verified'`), `:82-106` (Gather gate on self-reported calls).

---

### BB-03 — Context package (retrieval → typed contract)

**What we need:** `ContextPackage` (identity/version, run/workspace/session, selected source/frame IDs, revisions/hash, scope/provenance, trust/taint, token budget/priority, allowed payload, omission reasons) as a **wrapper** around the existing retrieval (DIR-09), invalidation after deletion (AT-15), isolation (AT-13), RAWDETAIL preserved (AT-14), external handoff (AT-16).

**Existing Waggle — CONFIRMED AT REVISION (F-HM-01..18; refute: 0 REFUTED):**

| Asset | Path | Callers | Assessment |
|---|---|---|---|
| `recallMemory` 7 lanes + RAWDETAIL + read-side injection scan + temporal anchor | `packages/agent/src/orchestrator.ts:582-978` | `chat-turn-preparation.ts:237`, `chat.ts:390`, `command.ts:266`, `commands.ts:74` | **Preserve, engine unchanged** (D-12, S1 W2) |
| RAWDETAIL write/read + kill switch `WAGGLE_RAWDETAIL` | `hive-mind-core/src/harvest/raw-turns.ts`; `mind/raw-detail-lane.ts:116-187` | writers `routes/harvest.ts:661`, `memory-mcp/src/tools/harvest.ts:316`, `hive-mind-mcp-server/src/tools/harvest.ts:318`; reader `orchestrator.ts:873` | **Preserve**. Note: the corpus is populated **only by harvest paths** (live chat does not write raw turns); the lane depends on a reranker model that is **not bundled** into the installer (`certify-windows-installer.ps1:2904` seeds only the embedding) → on an offline desktop the lane is probably inactive until the first online recall (AUDIT FINDING — TO VERIFY) |
| Cross-encoder reranker default ON (`WAGGLE_RERANKER=0` disables it) | `orchestrator.ts:70-86,554-580`; `hive-mind-core/src/mind/inprocess-reranker.ts:55` (`Xenova/ms-marco-MiniLM-L-6-v2`) | `packages/server/src/local/index.ts:792-800` | **Preserve**; the comment at `orchestrator.ts:106-109` is outdated |
| PromptAssembler W4.5 single-render + `TurnRecalledContext`; per-tier `FRAME_LIMITS` do not apply to the pre-rendered block | `prompt-assembler.ts:118,165-169,433-457`; `routes/chat-turn-recall-context.ts` | `chat-turn-preparation.ts:377-387`, `chat.ts:1235,1347`, `fleet-run-executor.ts:647` | **Preserve**; the per-package token budget = W2 contract (F-HM-07 PARTIAL) |
| Executor brief (bounded, redacted, scanned, `briefHash`) | `packages/server/src/local/executor-brief.ts:46-154` | `routes/route-proposals.ts:14,188,296`; `/api/tools/run` `attribution.briefHash` (`external-tool-runs.ts:103`) | **Preserve** — the closest existing "package" for an external executor; direct `/api/tools/run` and `/api/tools/launch` do **not** attach the brief (F-HM-11 PARTIAL) |
| Fail-closed env for external processes + secret redaction in event text | `packages/agent/src/external-process-env.ts:8-72`; `external-tool-runner.ts:588-595` | `external-tool-runner.ts:375`, `tool-launcher.ts:393` | **Preserve**; gap: the hook SessionStart inject does not redact (`hooks-claude-code/src/hooks/session-start.ts:46-60`, `hooks-core/src/handlers-core.ts:77-90`); `redactSecrets` lives in `@waggle/agent` (`eval-dataset.ts:133`), so hook packages cannot import it without a new dependency |
| Hook runtime: scoped `resolveMind`, write-side ingress guard, content dedup | `hive-mind-core/src/hook-runtime.ts:121-225` | `hive-mind-cli/src/commands/hook-call.ts:115,143`; `shim-core/src/cli-bridge.ts:258` | **Preserve**; the read path returns `temporary` (`:237` `WHERE importance != 'deprecated'`) and does not scan (F-HM-03/04) |
| Exclusion of `temporary`/`deprecated` from Waggle recall | `orchestrator.ts:728-737`; `context-loader.ts:77-88`; `workspace-context.ts:283,342,361`; `executor-brief.ts:66` | pin `r2-recall-closure.test.ts:27-40` | **Preserve** |
| TTL compaction (`temporary` 30d / `deprecated` 90d) + **server cron `memory_compact`** | `hive-mind-core/src/mind/frames.ts:404-483`; `packages/server/src/local/index.ts:2033-2058`; `setup-crons.ts:35` (`'30 3 * * *'`) | cron | **ALREADY EXISTS** (refute F-HM-02 WEAKENED: S1/the finding claimed the opposite); E2E on desktop UNKNOWN |
| Extraction idempotency (content-hash dedup, lane dedup, distill replace-on-update) | `frames.ts:109-111,289-294`; `harvest/extract-memory-lanes.ts:284`; `weaver/src/consolidation.ts:181-189,226-236` | `memory-lane-cron.ts` | **Preserve**; there is no `(runId, outputHash)` key (F-HM-16) |
| Isolation pin tests | `agent/tests/orchestrator-memory-boundary-pins.test.ts`; `server/tests/local/{memory-stats-isolation,fleet-isolation}.test.ts`; `agent/tests/subagent-isolation.test.ts` | — | **Preserve**; the sentinel test AT-13 is missing |

**Known defects (CONFIRMED AT REVISION):** the workspace run summary (up to 1000 characters) is written into the personal mind in **4 places** (`external-tool-runs.ts:964-977`, `chat-collaboration.ts:802-814`, `fleet-run-executor.ts:924-936`, `agent-groups.ts:719-729`), and at least 5 tests pin this as desirable (refute F-HM-05); the fleet policy gate `fleet-run-executor.ts:101-106` makes the `personal` scope mandatory (`fleet-isolation.test.ts:203`) — the fix changes the policy gate, not just the default. There is no `ContextPackage|ContextBuilder|WAGGLE_CONTEXT_INJECTED` (0 files); a double injection of brief + SessionStart hook is possible (F-HM-08; UNKNOWN whether `--safe-mode` suppresses hooks). There is no checkpoint↔context link, and therefore no invalidation of a deleted source after resume (F-HM-18).

**OSS candidates:** **UNKNOWN** — phase A did not research external "context assembly" libraries. Reason: D-12/DIR-09 require that the existing engine be wrapped, not replaced; a candidate would make sense only for the typed package schema (JSON schema/zod), and `zod` **4.6.5** is already a dependency (`packages/shared/package.json:16`). What would close it: a short check of 2–3 reference "retrieval provenance" schemas (e.g. from an OSS RAG framework) for field naming, without importing a runtime. **PROPOSAL**.

**Decision (PROPOSAL):** **Preserve** the engine and all listed assets; **Build** a typed `ContextPackage` contract (zod) as a wrapper over the `recallMemory`/`executor-brief` output, with `briefHash` as the existing reference; **do not introduce a parallel memory engine** (BRIEF §14 last paragraph, GluoMem note). Changing the render bytes of the recall block (e.g. source token, F-HM-06) requires a LoCoMo same-judge check before merge (manual process; a CI gate does not exist — F-HM-15).

**Owner (role):** Memory/W2 owner + substrate maintainer (OSS forward-port, CLAUDE.md §7.5); merge owner for `orchestrator.ts`, `hook-runtime.ts`.

**Substrate cost (CONFIRMED AT REVISION):** changes in `hive-mind-core/src/{mind,harvest}` and `hook-runtime.ts` require a re-baseline of `oss-drift-baseline.json`; `hook-runtime.ts` is already an "only-canonical; product-curation" blocker.

---

### BB-04 — Capability resolver (inventory, envelope, blocked/resume)

**What we need:** a single resolver contract over the existing engines (DIR-11), a permission envelope as the intersection of constraints without tier (§9.2, A12), inline setup as work continuity with a durable request and server-side OAuth binding (§9.3), no silent binary install (R11). Tests: AT-11, AT-12, AT-17, AT-19.

**Existing Waggle — CONFIRMED AT REVISION (F-CAP-01..13):**

| Asset | Path | Callers / tests | Assessment |
|---|---|---|---|
| `searchCapabilities` (matchScore + availabilityOrder), `validateInstallCandidate` (only `starter-pack`), types | `packages/agent/src/capability-acquisition.ts:187,299-311,447-461` | `skill-tools.ts:13,454,521`; `routes/agent-search.ts:11,143`; tests (20+13) | **Preserve** engine; trust does not affect ranking (`capability-acquisition-trust.test.ts:126` pins this) |
| `CapabilityRouter.resolve` (fixed per-lane confidence native 1.0 → subagent 0.4) | `capability-router.ts:51-186` | sole consumer `tool-executor.ts:143-151` (unknown-tool fallback) | **Preserve**; not a permission filter (C13) |
| `scoreConnectors` + marketplace FTS merge | `routes/agent-search.ts:56,132,158` | web suggestion box; tests `agent-search.test.ts` | **Preserve** |
| Server-issued `CapabilityProposalStore` (claim-once, TTL 10 min, max 256, ws/session scope) | `routes/capability-proposals.ts:12-13,35-101,232-268` | `InstallProvider.tsx:104` → `CapabilityRequestCard.tsx:108`; tests (9) | **Preserve**; in-memory, does not survive a restart, has no notion of a run |
| `ConnectorRegistry` (vault-hydrated, `connector_<id>_<action>`, audit) | `packages/agent/src/connector-registry.ts:24-212` | `agent-search.ts:157`; `routes/connectors.ts`; `held-action-executor.ts:221-224` | **Preserve** |
| Approval stack (`createChatApprovalHook`, `/api/approval/*`, `ApprovalGrantStore`, held actions, `needsConfirmation`/`isCriticalNeverAutopass`, executor approval floor) | `routes/chat-approval-hook.ts`; `routes/approval.ts`; `approval-grants.ts:20-25,172-304`; `packages/agent/src/confirmation.ts:16-29,337-358`; `tool-executor.ts:184-226` | tests: approval-flow (4), approval-held (14), held-action-executor (18), chat-approval-timeout (4), characterization (15) | **Preserve** — this is the "user policy" layer; decline is one-shot (no negative grant, F-CAP-09) |
| Persona tool policy `applyPersonaToolFilter`/`filterMcpToolsForPersona` | `packages/server/src/local/persona-tool-filter.ts:98-153` | `chat-turn-preparation.ts:454,530,553` | **Preserve** |
| Governance `blockedTools` chain (only `wsConfig.teamId`) | `routes/chat-governance.ts:73-134` → `chat-turn-preparation.ts:694-738` → `tool-executor.ts:129` | fail-closed on `unavailable/invalid` | **Preserve**; does not exist for Solo (`chat-governance.ts:87-89`) — do not move it into a "tier" step |
| `MarketplaceInstaller` + `SecurityGate` (blocked → refuse without `forceInsecure`) | `packages/marketplace/src/installer.ts:109-118,392`; `security.ts` | `routes/marketplace.ts:420-432`; `routes/mcps.ts:227-301`; `skill-tools.ts:540-560`; `installer-security.test.ts` (40) | **Preserve**; `forceInsecure` comes from the client body, with audit (`marketplace.ts:228,482-503`) |
| `InstallAuditStore` (`install_audit`, governance schema) | `packages/core/src/install-audit.ts:67-143` | `skill-tools.ts`; `marketplace.ts`; `mcps.ts` | **Preserve** |
| OAuth loopback routes (CSRF `state`, 127.0.0.1 redirect, vault write) | `routes/oauth.ts:64-71,137-150,200-209,290-311` | tests `oauth-callback-escaping.test.ts` (2) | **Preserve**; `pendingStates` in memory, **no run/session binding and no PKCE** (`grep pkce\|code_challenge` = 0) |
| `CapabilityRequestCard` + parser (marker = HTML comment in the tool result) | `chat-blocks/{CapabilityRequestCard.tsx,capability-request-parser.ts}` | `TextBlock.tsx`; test `pr4-agent-search.test.tsx` | **Preserve**; renders only `starter-pack`/`marketplace` (`:94-99`), connector/mcp → `null` (F-CAP-12) |
| `install_capability` (starter-pack only, path traversal guard, heuristics gate, non-grantable) | `skill-tools.ts:484-580`; `approval-grants.ts:20-25` | `behavioral-spec.ts:291-317` | **Preserve** |

**What was NOT found (CONFIRMED AT REVISION):** `BLOCKED_CAPABILITY|BLOCKED_APPROVAL` = 0 in `packages/` and `apps/`; typed `PermissionEnvelope` object = 0 (the layers exist separately, F-CAP-04); typed SSE `CapabilityRequest` event = 0 (F-CAP-12); taint field = 0 (comments only, F-CAP-05b); convert-to-work/WorkItem = 0.

**OSS candidates:** agent-native "shared actions / auth & permissions" — **pattern reference only** (per-file license UNKNOWN; API fit low; see BB-02). Other candidates were not researched in phase A (**UNKNOWN**). Conclusion: the resolver is a thin layer over Waggle engines; there is no point in looking for an external "policy engine" (BRIEF §9.2 "do not build a large Solo policy engine", R13).

**Decision (PROPOSAL):** **Preserve** all 4 engines and the approval stack; **Build** (a) a thin facade `resolveCapabilities(need, envelope)` that returns a single `CapabilityCandidate[]` after `filterCandidates(envelope)` before ranking; (b) a typed `PermissionEnvelope` computed in `chat-turn-preparation.ts` and passed to both the resolver and the executor; (c) a durable capability request bound to the run (depends on the BB-01 store); (d) OAuth `pendingStates` with `requestId/workspaceId/sessionId` + persistence + PKCE where applicable. MCP binary installs remain in Settings through SecurityGate (R11). Superseding ADR for `held-action-executor.ts:6-10` and "D3" (`routes/agent-search.ts:79`, not `apps/web/src/lib/agent-search.ts:81` as S1 states — correction).

**Owner (role):** Capability/W4 owner; ADR (4) from BRIEF §20.2; depends on W1.

**WB link (CONFIRMED AT REVISION):** the Approvals nav is TEAMS-gated only in the UI (`dock-tiers.ts:82`, `AppShell.tsx:727-728`, `command-catalog.ts:89`); the `/approvals` route and the API are not gated (F-TK-02). Connectors are not paywalled (`connectorLimit: -1` on all tiers).

---

### BB-05 — Shared actions (UI, agent and routine through the same contract — DIR-12)

**Existing Waggle — CONFIRMED AT REVISION (F-CAP-13; refute F-TK-17):**

| Asset | Path | Callers | Assessment |
|---|---|---|---|
| Closed `ACTION_REGISTRY` (4 actions: `open_app`, `open_workspace`, `create_workspace`, `install_mcp`; `sideEffect`, `riskLevel`, `build()`) + `validateAndBuildAction` | `packages/server/src/local/command-registry.ts:108-192` | sole caller `command-interpret.ts:17,93,135` → `routes/command.ts:213`; UI confirmation `CommandCenter.tsx:94,538` | **Adapt**: extend `ActionDescriptor` into the source of truth for side-effect endpoints; `requiredTier`/`checkTier()` (`:91,227-236`) is a dead branch (0 descriptors) — do not carry it over into the DIR-12 contract |
| `ToolDefinition` shared between the agent tool and the held action executor (re-materialization from `buildToolsForWorkspace`) | `packages/agent/src/tools.ts`; `held-action-executor.ts:213-233` | agent loop; approval | **Preserve** — agent and routine already share the contract for proposable tools |
| UI clicks go directly to REST (`/api/connectors/:id/connect`, `/api/marketplace/install`) without the registry; validation + SecurityGate at the endpoint | `routes/connectors.ts:118-142`; `routes/marketplace.ts`, `routes/mcps.ts` | web | three entry paths, different approval semantics (UI click vs CommandCenter modal vs chat card) |

**OSS candidates:**

| Candidate | What it offers | License / fit | Verdict |
|---|---|---|---|
| BuilderIO/agent-native `@agent-native/core` 0.195.0, `toolkit` 0.22.3, `dispatch` 0.38.15, `scheduling` 0.2.3 | "Shared actions" (agent, UI, HTTP, MCP, A2A, CLI), shared data/state, automations | packages declare MIT without LICENSE text; root ISC/`license: null`; Postgres/PGlite + Nitro → API fit low | **Pattern reference only** (R20). Durable/replay claims are not provable from README/PRODUCT (PARTIAL/UNWIRED; TO VERIFY by reading `packages/core/agent/production-agent.ts` if more than the pattern is ever considered) |

**Decision (PROPOSAL):** **Preserve** `ToolDefinition` as the shared contract; **Adapt** the existing `ActionDescriptor`/`ACTION_REGISTRY` to cover the actions the UI currently calls via REST (input schema, scope, side-effect class, validation, approval, audit, idempotency — BRIEF §9.4); UI/browser automation of external applications remains a separate capability. No dependency on agent-native.

**Owner (role):** Capability/W4 owner together with UX/W5 (callers in `CommandCenter.tsx`, Marketplace UI). Test: AT-18.

---

### BB-06 — Evolution and promotion (GEPA, holdout, active pointer, rollback)

**What we need:** actual execution of candidates through the target runtime, evaluation, explicit activation, rollback (D-13, DIR-13/14/15); local evaluator default (§10.4); paired comparison on the same examples (AT-29); override enters the next prompt (AT-04); the candidate is executed before scoring (AT-05).

**Existing Waggle — CONFIRMED AT REVISION (F-EVO-01..12; refute: F-EVO-09 WEAKENED, the rest HOLDS):**

| Asset | Path | Callers | Assessment |
|---|---|---|---|
| Running judge + brand + GEPA guard (the candidate is executed before scoring) | `packages/agent/src/evolution-llm-wiring.ts:415-452`; `iterative-optimizer.ts:173-184`; `compose-evolution.ts:142-149` | `routes/evolution.ts:377,404`; `services/evolution-service.ts:310,332`; tests `iterative-optimizer.test.ts:424-445`, `evolution-llm-wiring.test.ts:266-330` | **Preserve** (ALREADY CLOSED for production paths, F-EVO-03); comment `iterative-optimizer.ts:393-397` is outdated |
| GEPA engine over `@ax-llm/ax` | `iterative-optimizer.ts`; `evolve-schema.ts` | `compose-evolution.ts:174-196` | **Preserve + Borrow** (`@ax-llm/ax` 24.0.23 Apache-2.0 — already a dependency; the npm package **has no LICENSE file** → generate notices from upstream) |
| Behavioral-spec override pipeline (deploy → load → active spec → chat prompt) | `evolution-deploy.ts:184-259`; `behavioral-spec.ts:409-437`; `packages/server/src/local/index.ts:626-635`; `chat.ts:1264-1314,1441-1444` | test `evolution-routes.test.ts:190` | **Preserve** — works (F-EVO-11) |
| Persona override writer/rollback (atomic write, `.bak`, Windows rename retry) | `evolution-deploy.ts:68-135,277-305` | deploy `routes/evolution.ts:57`; rollback **0** callers | **Preserve** + **wire** rollback; single-level `.bak` = one-step rollback |
| `EvolutionRunStore` audit trail (`evolution_runs`, `winner_schema_json`) | `hive-mind-core/src/mind/evolution-runs.ts` | `index.ts:622-623`; `routes/evolution.ts`; `evolution-orchestrator.ts:219-253` | **Preserve**; no `rolled_back` in the enum or in the SQL `CHECK` (`:23-28,95-96`) → table-rebuild migration |
| Gates (size/growth/structure/regression) | `evolution-gates.ts:99-135` | `evolution-orchestrator.ts:194-204` | **Preserve**; the regression gate currently compares unpaired samples (F-EVO-06) |
| `EvalDatasetBuilder.build()` (secret scan, heuristics, dedup, 60/20/20 split) + `detectSecrets`/`redactSecrets` | `eval-dataset.ts:96-145,207-325` | `build()` **without a production caller** (the orchestrator calls `sourceFromTraces`, `evolution-orchestrator.ts:319-325`) | **PARTIAL/UNWIRED** → **wire** (a `sk-ant-…` secret from a trace reaches the judge; repro `docs/plans/v1.2-evidence/phaseA/repro-gepa-delta.mjs (b)`) |
| `ExecutionTraceStore` (`persona_id`, `workspace_id`, `model`, `markCorrected`) | `hive-mind-core/src/mind/execution-traces.ts:56-61,473-490` | `index.ts:591`; `chat.ts:1653`; `chat-turn-completion.ts:374-383` | **Preserve**; `markCorrected` 0 callers |
| Live learning flow: text correction → `analyzeAndRecordCorrection` → `improvement_signals('correction')` → "# User Corrections" in the prompt; thumbs-down likewise | `chat-turn-completion.ts:253-270`; `improvement-detector.ts:81-98`; `improvement-signals.ts:116-146`; `chat.ts:1485-1496`; `feedback.ts:91-94` | wired | **Preserve** (refute F-EVO-09: improvement-detector IS wired; the proposal "wire `processInteractionForImprovement`" would duplicate the path). Dead: `AgentLearning` (0 instances), `improvement-wiring.ts` (0), `recordPersonaTask` (0). `markSurfaced` caller in production UNKNOWN |
| `EvolutionService` opt-in daemon (only `proposed`, never auto-deploy) | `services/evolution-service.ts`; `index.ts:2747-2767` | env `WAGGLE_EVOLUTION_AUTO_ENABLED` | **Preserve** |
| Fleet persona snapshot (precedent "a run stays on its own version") | `fleet-run-executor.ts:589-591` | `fleet-isolation.test.ts:455-485` | **Borrow from Waggle** for the AT-04 pinned version |

**Known defects that determine the order (CONFIRMED AT REVISION):** persona override shadowed by the built-in one (`personas.ts:67-70` + `chat.ts:439-440` `find` → first match; same pattern in `fleet-run-executor.ts:127,590`, `agent-groups.ts:87`, `fleet.ts:354`; repro `repro-shadow.mjs`); the baseline endpoint reads the built-in one (`routes/evolution.ts:259`); `persona:reloaded` has no consumer; a single Anthropic Haiku LLM is the executor **and** the judge **and** the mutator (`routes/evolution.ts:365,376-379`; `createAnthropicEvolutionLLM` hard-codes `Claude45Haiku`); 422 without an Anthropic key (`routes/evolution.ts:355-363`) → no local evaluator, no cost cap/consent/abort (SSE close intentionally does not abort the run `:458-462`); `frozenSchema` goes neither into Stage 2 nor into deploy (`compose-evolution.ts:184,191-196`); UI "Accept & Deploy"/"deployed lift"/"score-verified" (`EvolutionTab.tsx:759,771,883,237-249`) without an activation check. Fix order: F-EVO-01 → F-EVO-10 (`evolution-routes.test.ts:169-188` pins `status==='deployed'`).

**OSS candidates:**

| Candidate | Version | License | Fit | Verdict |
|---|---|---|---|---|
| `@ax-llm/ax` (GEPA, signatures) | 24.0.23 installed (`^24.0.20` declared) | Apache-2.0 (package.json; **no LICENSE file in the package**) | already core; contract `complete(prompt)` | **Borrow (existing)**; notices from upstream (BB-12) |
| Other prompt-optimization frameworks (e.g. Python DSPy/GEPA reference implementations) | — | — | Python → outside the no-Python package; not researched in phase A | **UNKNOWN / DEFERRED** — not needed for DIR-13/15 (the work is activation, holdout, manifest — all Waggle code) |

**Decision (PROPOSAL):** **Preserve** the GEPA/running judge/gates/store/deploy functions; **Build**: (a) an `EvolutionLLM` adapter over the existing provider router (local model default; BYOK judge with explicit consent, cap, `AbortController` bound to SSE close — the `IterativeGEPAOptions.signal` plumbing already exists), (b) active-version pointer + `rolled_back` (CHECK migration), (c) a resolver that places a custom/evolved persona ahead of the built-in one (Map by `id`), (d) `build()` instead of `sourceFromTraces` with `traceFilter {personaId, workspaceId}`, `includeCorrections:false`, frozen holdout + hash, (e) manifest (`executorModel`, `judgeModel`, per-example outputs redacted). Bounded recipe evolution (DIR-14) is net-new (the `EvolutionTarget` enum has no harness-recipe value, `iterative-optimizer.ts:88-93`) — a separate scope, not a "defer" of existing code.

**Rationale:** everything that is missing is wiring and a contract over existing modules; no external package solves this, and KVARK mode (D-03) prohibits a cloud judge fallback — which is Waggle policy code.

**Owner (role):** Evolution/W3e owner; ADR (6) from BRIEF §20.2; OSS note: `evolution-runs.ts`, `execution-traces.ts`, `improvement-signals.ts` are OSS-EXCLUDED (`oss-drift-check.mjs:22-28`) → changes carry no porting obligation, but the NOTICE files of 3 hive-mind packages declare them proprietary (BB-12).

**Test warnings (CONFIRMED AT REVISION):** removing/renaming `combinedDelta` breaks `compose-evolution.test.ts:342-371`; an activation check before F-EVO-01 breaks `evolution-routes.test.ts:169-188`.

---

### BB-07 — Attention / WorkItem sync (mail/calendar, delta sync, dedup)

**What we need:** a single `WorkItem` (Action/Commitment/Decision/Signal) with status, provenance, source time, workspace, confidence and user correction (DIR-18); one initial mail/calendar scenario with real authorization; background incremental sync with cursor/delta persistence, lost-cursor handling, dedup, revoked credentials, retention; labeled eval (AT-24); taint/provenance on harvested content (AT-19). ToS profile per channel (C6).

**Existing Waggle — CONFIRMED AT REVISION (git ls-files, grep by capability; F-CAP-05c; external §5):**

| Asset | Path | Assessment |
|---|---|---|
| First-party connectors: `gmail`, `gcal`, `gdocs`, `gdrive`, `gsheets`, `outlook`, `onedrive`, `onenote`, `ms-teams`, `slack`, `discord`, `email`, `notion`, `linear`, `jira`, `confluence`, `asana`, `trello`, `monday`, `airtable`, `hubspot`, `salesforce`, `pipedrive`, `github`, `gitlab`, `bitbucket`, `dropbox`, `obsidian`, `postgres`, `composio` (30 files + `index.ts`) | `packages/agent/src/connectors/*.ts` | **Preserve**; none of them was E2E-verified in phase A (UNKNOWN) |
| `connector-harvest.ts` (scan before `writeFrame`), `harvest-autosync-service.ts`, `harvest-autosync-frame.ts` | `packages/server/src/local/connector-harvest.ts:189-191`; `services/harvest-autosync-service.ts` | **Preserve** as the entry point; **incremental sync does not exist**: `grep historyId\|syncToken\|deltaLink\|delta` in `connectors/` and `connector-harvest.ts` = 0 (CONFIRMED AT REVISION) |
| Home briefing/ranking (`PENDING_BOOST_CAP`) | `packages/server/src/local/routes/home.ts:132,304` | **Preserve**; no WorkItem type |
| IM channels: `ChannelManager` (deny-by-default, `/pair`, dedup, rate limit, `proposeHeld`), adapters Telegram (Bot API), Discord (bot), WhatsApp (Baileys — the file itself says it violates the ToS) | `packages/server/src/local/channels/{manager,pairing,chat-client,routes}.ts`; `channels/{telegram,discord,whatsapp}-adapter.ts` | **Preserve** the Telegram/Discord bot profile; WhatsApp Baileys **is not a shipping default** (external §5, R01) |
| Injection defense at ingest (Pass 0 `evaluateExternalMemoryIngress`) | `hive-mind-core/src/harvest/pipeline.ts:108-142`; `connector-harvest.ts:189-191` | **ALREADY CLOSED** (F-CAP-05a); the taint field does not exist (F-CAP-05b) |
| Erasure/`erased_subjects`/`stableHarvestId` | `hive-mind-core/tests/mind/erasure.test.ts`; `memory-mcp/src/tools/erase.ts` | **Preserve**; `erase` exists only in `waggle-memory-mcp`, not in `hive-mind-mcp-server` (F-HM-17) |

**What was NOT found (CONFIRMED AT REVISION):** `WorkItem|toWorkItem|convert.?to.?work` = 0 in `packages/server/src`, `apps/web/src`, `packages/shared/src`; cursor/delta persistence = 0; Viber adapter = 0.

**Channel profile (AUDIT FINDING — TO VERIFY: live 27.09.2026, source external §5, §8 — not a property of the revision; the legal part is TO VERIFY):**

| Channel | Profile | Key constraint |
|---|---|---|
| Microsoft Graph (Outlook/Calendar/Teams) | **live API — the most favorable path** | delegated `Mail.Read/ReadWrite/Send`, `Calendars.Read` without admin consent; publisher verification for multitenant; MSA personal accounts TO VERIFY |
| Gmail/GCal | live API with verification / BYO-client / Takeout import | `gmail.readonly/modify/compose` = **Restricted** → OAuth verification (weeks) + annual CASA; the exemption for local-only desktop **is not explicit** (TO VERIFY); unverified cap 100 users |
| Slack | live API (user token) | API ToS 10.10.2025: no LLM training, no bulk export; "persistent copies" clause vs local memory — legal review (TO VERIFY) |
| Telegram | bot/forward (now); user API on the roadmap with an ADR | Bot API sees only the chat with the bot |
| Discord | bot/forward | self-bot prohibited; `MESSAGE_CONTENT` privileged intent |
| WhatsApp | export/import (+roadmap) | WABP prohibits general-purpose AI assistants from 15.01.2026; personal inbox only unofficial |
| Viber | bot or drop | only Chat Bot API; "not for personal use" |

**OSS candidates:** **UNKNOWN** — phase A did not research OSS sync/WorkItem libraries (e.g. IMAP/Graph delta clients, a dedup engine). What would close this: an evidence card for 1–2 maintained clients for the chosen first ecosystem (proposal: MS Graph because of delegated permissions without CASA), with license, Windows/offline behavior and weight. Until then the assumption is **Build** of the WorkItem store (in the BB-01 store or a separate table — W1/W7 decision) and delta sync over the existing connectors. **PROPOSAL**.

**Decision (PROPOSAL):** **Preserve** connectors, ingest scan, channels, erasure; **Build** WorkItem store, cursor/delta persistence, dedup key, labeled eval set; **DEFERRED** WhatsApp/Viber live (R01). First scenario: **PROPOSAL MS Graph mail+calendar** (per the retrieved sources, without CASA/restricted-scope verification; publisher verification for multitenant — a verified Microsoft AI Cloud Partner Program account + publisher domain, because tenants with risk-based step-up consent cannot approve an unverified multitenant application — remains an external dependency, `docs/plans/v1.2-evidence/phaseA/external.md` §5) — not approved; BRIEF §20.3 "First mail/calendar scenario" remains open.

**Owner (role):** Attention/W7 owner; depends on W1 (convert-to-work without an unapproved effect) and W4 (envelope). Test: AT-19, AT-24.

---

### BB-08 — Local inference and hardware detect (runtime, model lifecycle, ladder)

**What we need:** exact ID/revision/quant/runtime for Qwen 3.8 27B (D-15, C19); hardware ladder (A21); live readiness (DIR-17, AT-20); resumable pull with progress; installation paths: managed runtime / existing Ollama / OpenAI-compatible endpoint / BYOK (§11.3). FR-OSS-09: no in-house serving.

**Existing Waggle — CONFIRMED AT REVISION (F-UXM-02..06; external §1):**

| Asset | Path | Assessment |
|---|---|---|
| Managed Ollama runtime: pin `0.32.3`/rollback `0.32.0`, per-platform zip URL + sha256, Range resume, size+sha256 verification, retry/backoff, 45-min timeout | `packages/server/src/local/managed-ollama-runtime.ts:28-29,158-237,1109-1204` | **Preserve**; **the pin is older than the first Ollama release with Qwen 3.8 27B (v0.32.12, 14.08.2026)** → repin ≥0.32.12 (reasonably ≥0.32.15) + pull/generate/tool test + new receipt (AUDIT FINDING — TO VERIFY) |
| Post-pull digest check + live `/api/generate` probe (`verifiedGeneration:true`) | `routes/local-inference.ts:338-377` | **Preserve** — a high-quality part |
| Pull `stream:false`, 45-min timeout, without progress/resume advertising | `routes/local-inference.ts:313-332` | fix (`stream:true` + relay); do not touch the runtime download |
| `hardware-detect.ts` (NVIDIA `nvidia-smi`, Apple, CPU floor; AMD/Intel/WMI "intentionally NOT built") | `packages/server/src/local/hardware-detect.ts:7-19,95-109,174-198,315-333` | **Preserve** the pattern (injectable `CommandRunner`); **Build** `detectWindowsWmi` (registry `HardwareInformation.qwMemorySize` because of the 4 GB `AdapterRAM` cap) |
| `model-fit.ts` + `cookbook/catalog.ts` (newest Qwen = `qwen3:*` 2025; no 3.5/3.6/3.8) | `packages/agent/src/cookbook/model-fit.ts:207-214,296-301`; `catalog.ts:44-51` | **Preserve** the engine; re-baseline the catalog; `model-fit.ts` has no rule for `qwen3.8` (falls back to generic `qwen3`=4) |
| Readiness: `probeConfiguredModel` (1-token, `verified = content.length>0`, no tool round-trip; every non-auth failure gives the same output) and `useHasWorkingModel` false positives | `routes/settings.ts:103-164`; `apps/web/src/hooks/useHasWorkingModel.ts:129-136,171-174,244-245` | fix (AT-20); tests `useHasWorkingModel.test.ts:271-281,301-307,486-495` pin the wrong behavior |
| Managed model certificate = `qwen2.5:0.5b` smoke, not the reference target | `scripts/certify-windows-installer.ps1:2099,2951-3005` | in the receipt, separate `certificateModel` vs `recommendedModel` |
| Embedding in-process `Xenova/all-MiniLM-L6-v2` (bundled/seeded), reranker `Xenova/ms-marco-MiniLM-L-6-v2` (not bundled) | `hive-mind-core/src/mind/inprocess-embedder.ts:32`; `inprocess-reranker.ts:55`; `certify:2904` | **Preserve**; reranker offline profile TO VERIFY (BB-03) |

**Target model — AUDIT FINDING — TO VERIFY (live 27.09.2026, HF/Ollama; source external §1, §8; the year of the Ollama dates is derived — external §7):** `Qwen/Qwen3.8-27B`, HF sha `1d4bf0f2ff6012fd82039f2fa52739d0dd7c60c0`, 2026-08-14, Apache-2.0, **dense** VL (`model_type: qwen3_5`), 262k ctx, thinking default-on, chat template with `<tool_call>`/`<function=` markers (E2E with the Waggle tool loop TO VERIFY). Ollama tags: `qwen3.8:27b` 18 GB (Q4_K_M class), `q8_0` 30 GB, `bf16` 56 GB; GGUF `unsloth/Qwen3.8-27B-GGUF` (Apache-2.0) UD-Q4_K_M 16.5 GB. **An official VRAM/RAM figure per quant does not exist** (UNKNOWN; secondary: Q4_K_M 17.6 GB @8k → 33.5 GB @262k) → measure (A21). The control baseline `Qwen/Qwen3.6-35B-A3B` is MoE; in the production router it goes to **cloud DashScope** (`litellm-config.yaml:211-215`), while the benchmark harness has a local vLLM entry `qwen3.6-35b-a3b-local` (`benchmarks/harness/config/models.json:61-67`) and the runbook `benchmarks/gaia2/PILLAR1-QWEN-LOCAL-RUNBOOK.md` (CONFIRMED AT REVISION); whether the old results are local or cloud — TO VERIFY.

**OSS candidates:**

| Candidate | Version | License | Windows | Offline | Fit | Verdict |
|---|---|---|---|---|---|---|
| Ollama | pin 0.32.3 → ≥0.32.12/0.32.15 needed; latest 0.34.4 (23.09.2026) | MIT | yes (zip, pinned sha256) | yes after pull | already integrated (managed + optional user-installed) | **Borrow (existing)**; repin + receipt |
| vLLM | HF card: "use latest", no min version (UNKNOWN); the Qwen3.6 card requires `vllm>=0.19.0`; the tool parser for 3.8 is not officially stated (`qwen3_xml`/`qwen3_coder` family — TO VERIFY) | Apache-2.0 | not as a native one-click | server | self-host/server or a validated OpenAI-compatible endpoint (§11.3) | **Borrow as an endpoint profile**, not as a Windows install |
| llama.cpp / LM Studio | — | MIT / proprietary app | yes | yes | OpenAI-compatible preset (R17); llama.cpp directly requires `--jinja` for the template | **Borrow as a preset**, without a separate integration |
| SGLang / TokenSpeed | — | Apache-2.0 / UNKNOWN | no | server | server profile | **DEFERRED** (not researched) |
| odysseus `hwfit`/`llmfit` | — | **AGPL-3.0** | — | — | ranking math + detection checklist | **Concept only, clean-room** (`docs/analysis/odysseus-adoption-2026-06-28.md:3,99`); never binary or code |

**Decision (PROPOSAL):** **Preserve** the managed runtime, digest+generation probe, `hardware-detect` pattern, fit engine; **Borrow** Ollama (repin), vLLM/llama.cpp/LM Studio as OpenAI-compatible profiles; **Build** WMI/AMD detection (clean-room), catalog rows for the confirmed target (`releaseDate`, `contextLength`, `quant`), `/api/show` arch check against the pinned runtime, `reason` in `ModelProbeResult`, an optional tool round-trip probe for the work profile, stream pull. No in-house inference server (FR-OSS-09).

**Owner (role):** Model/W6 owner + Release (receipt); dependency: hardware matrix NVIDIA/AMD/Intel/CPU (external cost, BRIEF §15.3). Test: AT-20, AT-30.

---

### BB-09 — Benchmark runners (official tasks, scorers, production-path adapter)

**What we need:** one primary professional-work test with an evidence card (§13.1); production sidecar path (DIR-22); two separate comparisons (§13.2); manifest (§13.6); contamination firewall (§13.4). FR-OSS-10: official runners/scorers, changes isolated and published.

**Existing Waggle — CONFIRMED AT REVISION (external §4; F-REL-12):**

| Asset | Path | Assessment |
|---|---|---|
| GAIA2 ARE narrow-proxy adapter ("NOT a full Gaia2 evaluation; cost-projection") + LOCKED config, Phase 3 HALT $4.09/invocation | `benchmarks/gaia2/adapter.ts:1-12`; `config.yaml`; `README.md` | **Preserve** for cost-projection; **not** production-path evidence (`grep api/chat\|/api/agent/run` in `adapter.ts` = 0 → not a production path, CONFIRMED AT REVISION) |
| 4-cell ablation harness (`@waggle/benchmarks-harness`), pre-registration, `results/`, `E6-LOCKED-CONFIG.md` | `benchmarks/harness/` (`package.json` engines `>=20`, deps `@waggle/agent`, `@waggle/core`) | **Preserve**; `config/models.json:88-89` has wrong Opus prices (F-REL-06) |
| LoCoMo/LongMemEval/BEAM data + `recount.mjs` offline recount | `benchmarks/data/*`, `benchmarks/results/locomo-sota-2026-06/` | **Preserve** (memory benchmark, D-12) |
| τ² adapter — **only on the branch** `origin/feature/harness-sota-bench` @ `18e5b36a` (66 commits ahead, 2022 behind `main`) | `benchmarks/harness/src/tau2/*`, `benchmarks/tau2/bridge/*`, `benchmarks/tau2/agent/*.py` | **Adapt via cherry-pick**, without rebase; skip `fe7804bf` (`cost-tracker.ts` conflict with the reservation ledger); do not carry over pilot results (`9eb454bd`, `16b4dc3d`, `df159ac2` — N=114 n.s., DIR-23); whether `waggle-bridge-server.ts` uses the production `/api/chat` — **UNVERIFIED** |
| `cost-tracker.ts` reservation ledger | `packages/agent/src/cost-tracker.ts` | **Preserve** the logic; the table is wrong (Opus 4.6/4.7/4.8 15/75 vs official 5/25; Sonnet 5 3/15 vs 2/10; three retired IDs) — product impact on the daily budget. Repo state (values `cost-tracker.ts:28-30,32,34-35,39-40,66`; A29): CONFIRMED AT REVISION; official prices and the retired status of the IDs: AUDIT FINDING — TO VERIFY (live 27.09.2026, platform.claude.com; source: external.md §6, §8) |

**OSS candidates (external §4, checked 27.09.2026):**

| Benchmark | Source / version | License (tasks / runner) | Public tasks | Runner/scorer | Local / Windows | Baselines | Integration | Verdict |
|---|---|---|---|---|---|---|---|---|
| **APEX-Agents 1.1** (Mercor) | HF `mercor/apex-agents-v1.1`; Harbor 0.20.0; Archipelago (Apache-2.0, 282★) | CC-BY-4.0 / Apache-2.0 | **240** (IB, consulting, corporate law; documents/spreadsheets/PDF/email/chat/calendar) | Harbor + rubrics; judge DeepSeek-v4-Flash-0731 (cloud) | Docker `linux/amd64` → WSL2 on the **bench machine**, not in the product | Claude Fable 5.1 68.6% pass@1; GPT-6 Astra 56.3% pass^4 (same protocol) | Harbor agent shim → production sidecar (DIR-22); effort M–H | **PROPOSAL for the primary test** (not approved) |
| τ²-bench (Sierra) | `sierra-research/tau2-bench` v1.0.1 (July 2026), 2,111★ | MIT | airline 50, retail 114, telecom (full set TO VERIFY), banking ≈100 | open; DB-hash + `communicate_info`; **requires an LLM user-simulator** (cloud) | Python ≥3.12, no Docker | taubench.com leaderboard | adapter on the branch (see above); domain = customer-service tool agent, **not** a knowledge-work deliverable | **Secondary (tool-use control)** |
| GAIA2 / ARE (Meta) | `facebookresearch/meta-agents-research-environments` (MIT, 558★); dataset `gaia2` | CC-BY-4.0 (synthetic data under Llama licenses) / MIT | 800 validation / `gaia2-mini` 160 | `are-benchmark`; judge Llama 3.3 70B + EM | Docker not required | in the HF blog (not extracted — UNKNOWN) | adapter exists (narrow-proxy); economics H | **Preserve for cost-projection** |
| GDPval (OpenAI) | HF `openai/gdpval` (sha `11e7900c`) | **dataset license UNKNOWN**; paper CC-BY-4.0 | 220 gold | humans or the OpenAI hosted grader (cloud) | file in → file out | UNKNOWN | grading validity H; **not permitted in KVARK mode** (D-03) | **DEFERRED** |
| FORTE (AGI-Eval) | `AGI-Eval-Official/FORTE` (MIT, 20★, push 2026-06-30) | MIT | **15 of 180** public | OpenClaw agent in Docker; all-or-nothing LLM judge | Docker Desktop+WSL2 | leaderboard (not extracted) | tied to OpenClaw (roadmap-only) | Rejected as primary |
| OdysseyBench (Microsoft) | `microsoft/OdysseyBench` (MIT, 18★, push 2026-06-11) | MIT | 300 + 302 | OfficeBench Docker + LLM judge | Docker | in the paper (UNKNOWN) | long-horizon memory — relevant for D-12; low activity | **DEFERRED (secondary memory test)** |

**Decision (PROPOSAL):** **Borrow** the official runners/scorers without reimplementing scorers (BRIEF §14 row "Benchmark projects"); **Build** only a thin shim (Harbor agent or HTTP client) that calls the production sidecar and collects the output; **Adapt** the τ² adapter via cherry-pick; **Preserve** the GAIA2 adapter for cost-projection and the memory benchmark tools. Pin the dataset sha, Harbor version, image digests, judge model/version; replacing the judge with a local model = a separate profile (breaks comparability). Python/Docker are permitted only on the bench machine.

**Owner (role):** Benchmark/B1–B3 owner; budget and primary test = founder decision (BRIEF §20.3). Test: AT-28.

---

### BB-10 — Skills pack (starter skills, import, provenance)

**Existing Waggle — CONFIRMED AT REVISION:**

| Asset | Path | Assessment |
|---|---|---|
| **18** first-party starter skills (`brainstorm`, `catch-up`, `code-review`, `compare-docs`, `daily-plan`, `decision-matrix`, `draft-memo`, `explain-concept`, `extract-actions`, `meeting-prep`, `plan-execute`, `research-synthesis`, `research-team`, `retrospective`, …) + loader `getStarterSkillsDir()`/`listStarterSkills()` | `packages/sdk/src/starter-skills/*.md`; `index.ts:11-25` | **Preserve**; no `.md` has a provenance/license header (`grep license\|source\|adapted` = instruction text only) → first-party assumption, record in the inventory as `origin: first-party` (TO VERIFY with the author) |
| `install_capability` (starter-pack only), `validateInstallCandidate`, `SecurityGate` heuristics, `skill-audit.ts` injection scan | `skill-tools.ts:484-580`; `capability-acquisition.ts:447-461`; `skill-audit.ts:265,304,350` | **Preserve** |
| Skill create/distill/hygiene/retire/recommend paths, `skill_promotion` signal | `chat-turn-completion.ts:199-212`; `SkillRecommender` (`persona-tool-filter.ts:27-30`) | **Preserve** (E2E not verified) |
| `promote_skill` in team/enterprise scope — always rejected (no `isEnterprise` provider) | `skill-tools.ts:67-68,755-765` | dead branch until KVARK connect (F-TK-12) |
| `.agents/skills/ax-*` (9 SKILL.md) | `.agents/skills/` | dev tool for Claude Code, **not** a user pack; not part of the installer (TO VERIFY) |

**OSS candidates:**

| Candidate | What | License / version | Verification status |
|---|---|---|---|
| `anthropics/knowledge-work-plugins` (11 plugins: Sales, Marketing, Legal, Finance, Data, PM, Support, Enterprise Search, Bio-Research, Productivity, Plugin Mgmt) | skills + slash commands + MCP connectors per role | **NOT VERIFIED** in phase A; S2 (04.09.2026) cites a different treatment vs document skills (historical finding, BRIEF §14) | **UNKNOWN** → license check per repo and per downloaded version before any import |
| `anthropics/skills` | general skills (docx/pptx/xlsx/pdf, etc.) | project memory cites "Apache seed", "Anthropic doc skills PROPRIETARY never port" — **verified neither at revision nor in phase A** | **UNKNOWN** → same check; "all Cowork skills are OSS" is not a shipping permission (BRIEF §14) |
| `minimax` doc skills / clean-room pptx (from the exploration backlog) | document production | not researched | **UNKNOWN / DEFERRED** (post-launch v1.1 backlog) |

**Decision (PROPOSAL):** **Preserve** the first-party pack as the G2 basis for two recipe paths (research brief, document production — DIR-02/W3); OSS import **DEFERRED** until a per-repo evidence card exists (license, version/commit, dependencies, tool naming, model-specific instructions, artifacts — BRIEF §9.5 "import ≠ successful use on Qwen"). Every imported skill gets a row in the inventory (§4) and passes `SecurityGate`/`skill-audit`. The FR-OSS-07 condition "license review" is currently **not met for any external source**.

**Owner (role):** Harness/W3 owner (recipe) + Release/OSS owner (license). Test: AT-17, AT-21.

---

### BB-11 — Connectors and MCP (adapters, catalog, install, runtime)

**Existing Waggle — CONFIRMED AT REVISION:**

| Asset | Path | Assessment |
|---|---|---|
| 30 first-party connectors (list in BB-07) + `ConnectorRegistry` + `find_connector` | `packages/agent/src/connectors/`; `connector-registry.ts:24-212` | **Preserve**; no per-connector inventory of ToS/scopes (the BB-07 table is a start) |
| MCP catalog of **148** entries (`id`, `author`, `installCmd`, `capabilities`; a `license` field **does not exist** in the catalog — only `capabilities: ['licenses']` on the Snyk entry) | `packages/shared/src/mcp-catalog.ts` (148 × `{ id: '…'`) | **Preserve**; per-server licenses come from the marketplace sync (`packages/marketplace/src/mcp-registry.ts:80,116,152,190,227,320`, `sync.ts:122,174` reads GitHub `license.spdx_id`) — coverage UNKNOWN |
| `MarketplaceInstaller` + `SecurityGate` + `InstallAuditStore`; `mcp-runtime.ts` spawn through `spawnSidecarOwnedProcess` | `packages/marketplace/src/installer.ts`; `packages/agent/src/mcp/mcp-runtime.ts:152-158,529` | **Preserve**; `forceInsecure` from the client body (audit exists) |
| Two memory MCP servers (`waggle-memory-mcp` bundled into the sidecar; `@waggle/hive-mind-mcp-server` in the CLI/hook path); `erase` only in the first | `packages/memory-mcp/`; `packages/hive-mind-mcp-server/`; `scripts/check-sidecar-resources.mjs:955`; `hive-mind-cli/src/commands/mcp-start.ts:36` | **Preserve both** (R23 merge DEFERRED); the `erase` divergence = risk for AT-15 |
| Composio connector (aggregator) | `connectors/composio-connector.ts` | **Preserve**; supply-chain/ToS profile UNKNOWN |

**OSS candidates:** OSS MCP servers from the catalog (per server: repo, version, license, maintenance, binary/remote profile). Phase A **did not** evaluate individual servers (**UNKNOWN**). Rule from BRIEF §14: "not every MCP binary as a silent install" — every server that is recommended inline or bundled must have a row in the inventory and pass SecurityGate.

**Decision (PROPOSAL):** **Preserve** connectors, catalog, installer, runtime; **Borrow** MCP servers exclusively through Settings + SecurityGate + inventory (R11, FR-OSS-08); **Build** only the `kind:'connector'` proposal + api_key card (F-CAP-12) and a wrapper behind the resolver contract (BB-04). No physical merging of MCP servers before a scope/auth/context contract (R23).

**Owner (role):** Capability/W4 owner + Release/OSS owner (inventory). Test: AT-11, AT-17.

---

### BB-12 — Licenses / SBOM / notices tooling

**Existing Waggle — CONFIRMED AT REVISION (F-REL-04/05/07/08; F-TK-13/14):**

| Asset | Path | Assessment |
|---|---|---|
| `oss-drift-check.mjs` + immutable `oss-drift-baseline.json` (parity 5, adaptations 38, known blockers 22, unreviewed 1 → live 3, forbidden exports 3 files + `vault.ts`, `compliance/`, `governance/`; **baseline ↔ live relationship:** baseline 38 intentional adaptations, live run 36 reviewed + 2 `BASELINE-DRIFT` (`harvest/url-egress-guard.ts`, `mind/transformers-model-load.ts`) which count toward the 3 unreviewed — PRD-15-04 states 36, here 38, no contradiction) | `scripts/oss-drift-check.mjs:22-36`; `scripts/oss-drift-baseline.json` | **Preserve**; manual gate (not in CI); exit 1 (`docs/plans/v1.2-evidence/phaseA/oss-drift-check-output.txt`) |
| Node runtime + `NODE-LICENSE` staging and verification | `scripts/bundle-node.mjs:39,89,165-166,273`; `certify-windows-installer.ps1:2596-2600` | **Preserve** |
| `stage-sidecar-deps.mjs` retains first-party LICENSE/NOTICE ("retain published runtime layout") | `scripts/stage-sidecar-deps.mjs:16-18,111` | **Preserve**; does not help packages without a LICENSE file |
| `bundle-native-deps.mjs` copies `better_sqlite3.node`, `vec0.dll`, `onnxruntime-node/bin/napi-v3/<os>/<arch>/*` — **without** LICENSE/NOTICE | `scripts/bundle-native-deps.mjs:113-130` | **Adapt**: place the license text alongside the binaries |
| `oss-subtree-split.sh` abort guard (`FORBIDDEN_FILES`) + test | `scripts/oss-subtree-split.sh:117-133`; `tests/oss-subtree-split.test.ts` | **Preserve** (inspection only) |
| Marketplace `license` field (spdx from GitHub) | `packages/marketplace/src/mcp-registry.ts`, `sync.ts:122,174` | **Preserve**; seed for the MCP server inventory |
| `npm audit` in CI `continue-on-error: true`; **no** license CI (neither npm nor cargo), **no** SBOM/THIRD_PARTY_NOTICES file (`git ls-files` grep = 0; `git grep cyclonedx\|spdx\|sbom\|syft` = marketplace only) | `.github/workflows/ci.yml:108-110` | gap (A28) |
| `tauri.conf.json` `bundle` without `licenseFile` | `app/src-tauri/tauri.conf.json` | gap |

**License state in the repo (CONFIRMED AT REVISION; the realization decision remains open — BRIEF §20.3):** root `LICENSE` MIT; `README.md:190-194` "MIT except hive-mind-* = Apache-2.0"; `packages/optimizer/LICENSE` and `packages/weaver/LICENSE` "proprietary and confidential" alongside `"license": "MIT"` in `package.json` (contradiction); NOTICE in `hive-mind-cli`, `hive-mind-mcp-server`, `hive-mind-wiki-compiler` declares `packages/agent/*`, evolution/traces/signals, vault, tiers, Tauri/web UI, WaggleDance proprietary and references a **nonexistent** `EXTRACTION.md`; 9 manifests without a `license` field (`admin-web`, `server`, `shared`, `waggle-dance`, `worker`, `apps/web`, `apps/www`, `app`, `sidecar`); `hive-mind-core` Apache-2.0 + `"private": true`. Live (27.09.2026, not a property of the revision): repo **public**, MIT; `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` is not defined; `main` without branch protection; secret scanning disabled. CLAUDE.md §1/AGENTS.md/README "remains private" **outdated**.

**Packages we ship without a LICENSE file in the npm package (CONFIRMED AT REVISION, `node_modules/*/package.json` + `ls`):** `onnxruntime-node` 1.21.0 (MIT), `sqlite-vec-windows-x64` 0.1.9 ("MIT OR Apache"), `sqlite-vec` 0.1.9, `@ax-llm/ax` 24.0.23 (Apache-2.0). With a LICENSE file: `better-sqlite3` 12.6.2 (MIT), `cron-parser` 4.9.0 (MIT), `@huggingface/transformers` 3.8.1 (Apache-2.0), `@modelcontextprotocol/sdk` 1.30.1 (MIT), `fastify` 5.12.5 (MIT), `undici` 8.11.2 (MIT), `zod` 4.6.5 (MIT), `stripe` 22.6.2 (MIT).

**OSS candidates (tools):** phase A did **not** evaluate SBOM/license tools (**UNKNOWN** for version, license, Windows behavior, maintenance). Tool classes that should be assessed per FR-OSS-03: (a) CycloneDX/SPDX generator for the npm closure (`resources/node_modules`), (b) license allowlist checker over `npm ls --json --omit=dev`, (c) `cargo-deny`/`cargo-about` for the Tauri Rust shell, (d) aggregated notices generator with manual entries for native binaries, the Ollama zip, model weights. **PROPOSAL**: a short evidence card (repo, version, license, Windows run, output format, maintenance) for one tool from each of classes (a)–(c) before selection; none is preselected.

**Decision (PROPOSAL):** **Preserve** the drift checker, Node/sidecar staging, split guard; **Borrow** a standard SBOM + license-check tool after evaluation (blocking CI step); **Build** only: aggregation of notices for packages without a LICENSE file (text from the upstream repo), manual entries for native/runtime/model components, one `Assert-True` group in `certify-windows-installer.ps1` for the presence of `THIRD_PARTY_NOTICES` and the SBOM, the inventory file (§4). Note: a change to the notices changes the installer SHA → new certification (S1 OSS gate row, correct).

**Owner (role):** Release/OSS owner; license realization (ownership, final texts, NOTICE corrections, `EXTRACTION.md` reference) = **founder decision-queue**, not implementation. Test: AT-30.

---

### BB-13 — FR-OSS-03 matrix for candidates from the abbreviated tables (BB-02, BB-05, BB-06, BB-08, BB-09, BB-10)

The tables in BB-02/05/06/08/09/10 carry only the columns relevant to the verdict; this matrix supplements the remaining criteria from BB-00.5 for every candidate mentioned as Borrow/Adapt or pattern reference, so that no criterion stays implicit. Values come from `docs/plans/v1.2-evidence/phaseA/external.md` (check 27.09.2026) or from the repo; where phase A did not measure/read, UNKNOWN is stated — nothing is assumed. **AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §1–4, §8)** for the external columns (maintenance, version/commit, stars, license, upstream state); **CONFIRMED AT REVISION** only for values with a repo source (e.g. `managed-ollama-runtime.ts:158-237`, `ci.yml:108-110`, `benchmarks/gaia2/README.md`); **UNKNOWN** where so marked.

| Candidate (area) | Maintenance (2026-09-27) | Security / supply chain | Windows | Offline / local-first | Deps weight | Tests (upstream) | Perf | Update / exit strategy |
|---|---|---|---|---|---|---|---|---|
| BuilderIO/agent-native (BB-02, BB-04, BB-05) | commit `4f899f1d` 27.09.2026, v0.1.271, 6,863★/617 forks, very active | not reviewed; watchdog "patched ≥6× in 4 months" (`docs/agent-run-stop-conditions.md`) = run-loop instability signal | Node/Nitro — yes | **no** (Postgres/PGlite) | Postgres + Nitro host + 21 packages in the monorepo | UNKNOWN (not read) | UNKNOWN | pattern-only → no exit cost; never a dependency until a per-file LICENSE exists |
| Omnigent (BB-02) | `56c6a7f7` 27.09.2026, v0.15.0, 10,293★, **alpha** | Apache-2.0 + NOTICE; security review not done; sandbox (bwrap/seatbelt) and egress proxy **unavailable on Windows** | "native but degraded" | partial (server + web UI locally) | Python 3.12+, Node 22, uv, tmux, pnpm | UNKNOWN | UNKNOWN | pattern-only (ACP/stdio contract); no exit cost |
| `@ax-llm/ax` (BB-06) | 24.0.23 installed; dependabot active (`^24.0.20`) | npm package without a LICENSE file; `npm audit` in CI informational only (`ci.yml:108-110`) | yes (pure TS) | yes | already in `packages/agent` | upstream suite UNKNOWN; Waggle covers `iterative-optimizer.test.ts`, `evolution-llm-wiring.test.ts`, `compose-evolution.test.ts` | GEPA cost = number of LLM calls (cap/consent = Waggle code) | replaceable via the `complete(prompt)` adapter; exit = own mutator (Build) — not planned |
| Ollama (BB-08) | latest 0.34.4 (23.09.2026); Waggle pin 0.32.3 outdated for Qwen 3.8 | zip + sha256 pin + Range resume (`managed-ollama-runtime.ts:158-237`); license MIT, text not in the package | yes (managed zip) | yes after pull | separate process (sidecar-owned) ~ GB | Waggle: `managed-ollama-runtime` tests; upstream UNKNOWN | UNKNOWN for Qwen 3.8 27B on Windows GGML (A21) | manual-pin + rollback version (`0.32.0`); exit = OpenAI-compatible profile (llama.cpp/LM Studio/vLLM) — already planned (§11.3) |
| vLLM / llama.cpp / LM Studio as an OpenAI-compatible profile (BB-08) | vLLM: HF card "use latest"; llama.cpp active; LM Studio proprietary app | outside the Waggle package; user endpoint → response validation and tool round-trip probe (Build) | vLLM not native; llama.cpp/LM Studio yes | yes (local server) | 0 in the package (preset only) | n/a | UNKNOWN (min. vLLM version for 3.8 not officially stated) | the preset is removed without a trace; no exit cost |
| APEX-Agents 1.1 + Harbor 0.20.0 + Archipelago (BB-09) | Archipelago push 25.09.2026, 282★; dataset HF (revision not pinned) | judge = cloud DeepSeek-v4-Flash-0731 → API key and data leave the machine (bench profile, not product) | Docker `linux/amd64` → WSL2 on the bench machine | no (judge cloud) | Docker + Harbor + Python | Harbor runner tests UNKNOWN | 240 tasks × pass@1/pass^4 → budget is a founder decision | dataset pin (HF sha) + Harbor version + image digest; exit = drop the primary test (no code in the product) |
| τ²-bench v1.0.1 (BB-09) | 2,111★, July 2026 | user-simulator = cloud LLM; MIT | Python ≥3.12, without Docker | no (simulator cloud) | Python venv on the bench machine | upstream suite exists (not read → UNKNOWN) | airline 50 / retail 114 (+telecom/banking TO VERIFY) | vendor pin `7bec6062` on a branch; cherry-pick without rebase; exit = deletion of `benchmarks/tau2/` |
| ARE / gaia2 (BB-09) | push 26.08.2026, 558★; commit **not pinned** | judge Llama 3.3 70B (cloud or local GPU); MIT/CC-BY-4.0 | Docker optional | partial | Python | UNKNOWN | Phase 3 HALT $4.09/invocation (CONFIRMED AT REVISION, `benchmarks/gaia2/README.md`) | `Preserve` adapter only for cost-projection; exit trivial |
| `anthropics/knowledge-work-plugins`, `anthropics/skills` (BB-10) | UNKNOWN | UNKNOWN (not read; skill text = prompt injection surface → mandatory `skill-audit` on import) | n/a (markdown) | yes | 0 runtime deps; MCP connectors per plugin = separate assessment (BB-11) | n/a | n/a | not used; DEFERRED until an evidence card |
| Reflow `danfry1/reflow-ts` v0.7.0 (BB-01, repeated for completeness) | push 14.09.2026, 41★, 1 author | UNKNOWN (not reviewed) | yes | yes | `better-sqlite3 ≥9` (shared build) | UNKNOWN (not read) | UNKNOWN (not measured) | vendor/fork under MIT; long-term ownership mandatory if Adapt (FRD v1.1 §19) |
| odysseus `hwfit` (BB-08) | — | **AGPL-3.0** → never code or binary | — | — | 0 | n/a | n/a | clean-room concept (CONFIRMED AT REVISION: AGPL-3.0 + binding license note of the project analysis `docs/analysis/odysseus-adoption-2026-06-28.md:3`; not D-nn) |

**Matrix conclusion (PROPOSAL):** a security review **has not been done for any** external candidate (column = UNKNOWN or "not reviewed"); the upstream test suite has not been read for any. This is expected for the planning phase and means that every "Borrow/Adapt" passes `securityReview.status ≥ manual` in the inventory (§4) and a reading of the tests before implementation — a condition, not a formality (BRIEF §14 "an automated scanner is not complete verification").

---

## 3. Decision criterion for the durable engine (R22) — tests, not LOC

**BB-R22.1 — Rule.** The decision "Adapt Reflow" vs "Build a minimal SQLite engine" is made **exclusively** by the outcome of a spike over the same set of tests (spike criterion: T1–T3 + T9, BB-R22.2); the "600–1000 LOC" figure from S1 is not a criterion (BRIEF R22, §14 last row). **PROPOSAL — BRIEF DIRECTION** (§19 R22, §14).

**BB-R22.2 — Tests (mapped to ATs; thresholds are set before running, BRIEF §16). Spike selection criterion (Delivery plan W1-PR1, 28.09.2026) = T1–T3 + T9, executed over a throwaway prototype of both branches in a dev Node environment (+ BB-R22.3 for Reflow). T4–T8 and T10 are exit criteria of the selected branch in W1/F2 (T4 → W1-PR8, T5/T6 → W1-PR2, T7 → W1-PR14 + W1-PR15 (erasure/export of the run store; revocation ledger `revocations.json` + Class B restore with re-application of erasure and revocation, GDPR-H-05), T10 → W1-PR11, T8 → F2 C receipt W8-PR2), because they depend on the selection itself (W8-PR2 → W1-PR4/PR5 → W1-PR2 → spike: circular dependency) and do not fit into the spike time-box. PROPOSAL:**

| # | Test | What it proves | AT |
|---|---|---|---|
| T1 | Crash after a confirmed phase → restart continues with the next phase using the same references; the previous phase's spend is preserved (`Checkpoint.spent`) | phase-level resume, budget | AT-07 |
| T2 | Crash between provider success and local ack → same `actionId`, status `unknown_outcome`/equivalent, no blind resend; provider receipt/user verification | stable action identity | AT-08 |
| T3 | Two processes over the same `dataDir` attempt to take over the same run → only one may start a new side effect (lease + fencing) | fencing | AT-09 |
| T4 | SSE reconnect with `sinceSeq` → no duplicated cards/actions; detach ≠ cancel; cancel prevents new actions | run-scoped bus, `seq` | AT-10 |
| T5 | Migration of `agent-runs.json` v1 → store: repeatable (dry-run), `interrupted` retains the reason and does not become `COMPLETED`/`RUNNING`, statuses mapped 1:1 (the `packages/shared/src/types.ts:398-402` enum is not deleted — the zod route `routes/agent-runs.ts:15` and `RoomApp.tsx:51-66` depend on it) | lossless migration | AT-27 |
| T6 | Retention/GC: >2 000 events and >N runs do not break `eventsSince` (`resetRequired` overflow path — untested today) and do not grow without bound | retention | AT-10 |
| T7 | Erasure/export: the run store joins the existing erasure/export mechanisms (W1-PR14); rollback does not restore deleted data/revoked grants (W1-PR15: revocation ledger + Class B restore, MIG-00.6) | A3, DIR-21, GDPR-H-05 | AT-27 |
| T8 | Packaged Windows candidate without developer Node/Python/Docker: T1–T4 executed against the installed sidecar (crash-injection receipt — tool currently **NOT FOUND**, F-REL-03) | no-prereq package | AT-30 |
| T9 | No Postgres, no separate process, one native build of `better-sqlite3` 12.6.2 (no second ABI) | dependency conditions | — |
| T10 | Routines: occurrence identity, misfire policy (skip / one catch-up), DST/restart without a duplicate action; `getDue()` format bug resolved (repro from BB-01) | routines over the same store | AT-23 |

**BB-R22.3 — Additional criteria for Adapt Reflow (must be recorded in the §4 inventory):** code and test review (security), vendor/fork plan under MIT, bus factor 1 → long-term ownership obligation (FRD v1.1 §19), the API gap we would have to write ourselves (ProofReceipt, PhaseAttempt, action/attempt separation). If the self-written part exceeds the borrowed part, the spike must show this with a figure, and the decision falls to Build. **PROPOSAL**.

**BB-R22.4 — What the spike must not do:** change the semantics of foreground chat (R3-008 stays until the W1 contract), place lease/lock in `.mind`, promise exactly-once for non-idempotent services (BRIEF §6.5). **PROPOSAL — BRIEF DIRECTION** (§6.5).

---

## 4. Provenance inventory (FR-OSS-04) — schema and seed list

**BB-INV.1 — Format.** One machine-readable file (proposed location: `docs/oss/PROVENANCE-INVENTORY.json`, alongside a generated `THIRD_PARTY_NOTICES.md`); changes via PR; CI validates the schema and completeness (FR-OSS-11). This is a **PROPOSAL** of the structure, not a claim that the file exists at the revision (it does not — CONFIRMED AT REVISION).

**BB-INV.2 — Fields (required unless marked optional):**

| Field | Type | Description |
|---|---|---|
| `id` | string | stable key (`npm:better-sqlite3`, `bin:ollama-windows-amd64`, `model:Qwen/Qwen3.8-27B`, `dataset:mercor/apex-agents-v1.1`) |
| `kind` | enum | `npm` · `cargo` · `native-binary` · `runtime` · `model-weights` · `dataset` · `benchmark-runner` · `skill` · `mcp-server` · `vendored-source` · `pattern-reference` |
| `name`, `sourceUrl` | string | repo/registry URL |
| `version` | string | semver or tag |
| `commitOrHash` | string | commit SHA, HF `sha`, artifact `sha256`, npm `integrity` or Ollama digest |
| `license` | string (SPDX) | declared license |
| `licenseEvidence` | enum | `LICENSE-file` · `package.json-field-only` · `repo-metadata` · `NONE` |
| `licenseTextIncluded` | bool | whether the text goes into the notices |
| `usage` | enum | `shipped-desktop` · `shipped-sidecar` · `dev-only` · `bench-only` · `pattern-only` |
| `decision` | enum | `preserve` · `borrow` · `adapt` · `build-reference` |
| `modifications` | string / null | description of local modifications (for `adapt`) |
| `attribution` | string / null | obligations (NOTICE, CC-BY author, …) |
| `securityReview` | object | `{status: none\|scanner\|manual\|sealed, date, owner, findingsOpen}` — an automated scanner is not complete verification (BRIEF §14) |
| `windows`, `offline` | enum | `verified` · `claimed` · `unknown` · `not-applicable` |
| `updateStrategy` | enum + string | `dependabot` · `manual-pin` · `vendor-sync` · `frozen` + note |
| `exitStrategy` | string | how it is replaced/removed |
| `owner` | string (role) | responsible role |
| `addedIn`, `lastVerified` | date | 
| `notes` | string, optional | |

**BB-INV.3 — Seed list (values are the state at revision `2af0904d` or the external check of 27.09.2026; `licenseEvidence` is what was actually found):**

| id | kind | version / hash | license (evidence) | usage | decision | Windows/offline | update | Status |
|---|---|---|---|---|---|---|---|---|
| `runtime:node` | runtime | **22.23.2** (`scripts/bundle-node.mjs:39`); artifact sha is verified by `bundle-node.mjs`/`certify` | MIT-style Node license (`NODE-LICENSE` staged) | shipped-desktop | borrow | verified (certify 64/64 on an earlier candidate; **not** on `2af0904d`) | manual-pin | CONFIRMED AT REVISION |
| `npm:better-sqlite3` | npm (native) | 12.6.2 | MIT (LICENSE-file) | shipped-sidecar | borrow | verified (bundled `.node`) | dependabot | CONFIRMED AT REVISION |
| `npm:sqlite-vec-windows-x64` | native-binary | 0.1.9 (`vec0.dll`) | "MIT OR Apache" (**package.json-field-only, NONE LICENSE file**) | shipped-sidecar | borrow | verified | dependabot | CONFIRMED AT REVISION — generate the license text from upstream |
| `npm:onnxruntime-node` | native-binary | 1.21.0 | MIT (**package.json-field-only, NONE**) | shipped-sidecar | borrow | verified | dependabot | CONFIRMED AT REVISION — same |
| `npm:@huggingface/transformers` | npm | 3.8.1 | Apache-2.0 (LICENSE-file) | shipped-sidecar | borrow | claimed | dependabot (major 4 blocked — TD-DEP-4) | CONFIRMED AT REVISION |
| `model:Xenova/all-MiniLM-L6-v2` | model-weights | HF revision **UNKNOWN** (not pinned in code; `inprocess-embedder.ts:32`) | Apache-2.0 (upstream sentence-transformers; TO VERIFY on the HF card) | shipped-sidecar (seed in certify `:2904`) | borrow | offline after seed | frozen (proposal: pin the revision) | AUDIT FINDING — TO VERIFY |
| `model:Xenova/ms-marco-MiniLM-L-6-v2` | model-weights | revision UNKNOWN (`inprocess-reranker.ts:55`) | Apache-2.0 (TO VERIFY) | shipped-sidecar (**not bundled**; download on first use) | borrow | offline **unknown** (soft-fail → RRF) | frozen (proposal: pin + seed) | AUDIT FINDING — TO VERIFY |
| `npm:@ax-llm/ax` | npm | 24.0.23 | Apache-2.0 (**package.json-field-only, NONE**) | shipped-sidecar | borrow | claimed | dependabot | CONFIRMED AT REVISION |
| `npm:cron-parser` | npm | 4.9.0 | MIT (LICENSE-file) | shipped-sidecar | borrow | verified | dependabot | CONFIRMED AT REVISION; `tz` unused |
| `npm:@modelcontextprotocol/sdk` | npm | 1.30.1 | MIT (LICENSE-file) | shipped-sidecar | borrow | claimed | dependabot | CONFIRMED AT REVISION |
| `npm:fastify` / `undici` / `zod` / `stripe` | npm | 5.12.5 / 8.11.2 / 4.6.5 / 22.6.2 | MIT (LICENSE-file) | shipped-sidecar (stripe: server/www) | borrow | — | dependabot | CONFIRMED AT REVISION |
| `bin:ollama-windows-amd64` | runtime | **0.32.3** target / **0.32.0** rollback; rollback sha256 `56561a8f…b89e` (`managed-ollama-runtime.ts:160-184`); target sha in the same block | MIT (Ollama repo; text **not** in the package — TO VERIFY) | shipped-desktop (managed download) | borrow | verified (Range resume, sha256) | manual-pin → **repin ≥0.32.12/0.32.15 required for Qwen 3.8** | AUDIT FINDING — TO VERIFY |
| `model:qwen2.5:0.5b` (Ollama) | model-weights | digest in the receipt (`09-LAUNCH:47-48`) | Apache-2.0 (Qwen2.5; TO VERIFY) | certification smoke model | borrow | offline after pull | frozen | CONFIRMED AT REVISION (role = smoke, not target) |
| `model:Qwen/Qwen3.8-27B` | model-weights | HF sha `1d4bf0f2ff6012fd82039f2fa52739d0dd7c60c0` (2026-08-14); Ollama `qwen3.8:27b-q4_K_M` digest `25b843619e94`; `unsloth/Qwen3.8-27B-GGUF` UD-Q4_K_M 16.5 GB | Apache-2.0 (LICENSE in the HF repo) | target (not yet on the production path) | borrow | Windows/offline: **unknown** until measured (A21) | manual-pin | AUDIT FINDING — TO VERIFY (identity; live 27.09.2026, external §1, §8) / UNKNOWN (VRAM/RAM) |
| `model:Qwen/Qwen3.6-35B-A3B` | model-weights | sha `995ad96eacd98c81ed38be0c5b274b04031597b0` (2026-04-24) | Apache-2.0 | control baseline (production router: cloud DashScope `litellm-config.yaml:211-215`; benchmark harness: local vLLM entry `models.json:61-67`) | borrow | n/a | frozen | AUDIT FINDING — TO VERIFY (sha/license; live 27.09.2026, external §1.5, §8); role in the router/harness CONFIRMED AT REVISION |
| `bench:meta-agents-research-environments` (ARE) | benchmark-runner | commit **UNKNOWN** (not pinned; push 2026-08-26) | MIT | bench-only | borrow | Docker optional; bench machine | manual-pin | AUDIT FINDING — TO VERIFY (license/push; live 27.09.2026, external §4.2, §8) |
| `dataset:gaia2` | dataset | HF revision UNKNOWN | CC-BY-4.0 (synthetic data under Llama 3.3/4 licenses) | bench-only | borrow | — | frozen | AUDIT FINDING — TO VERIFY (live 27.09.2026, external §4.2, §8) |
| `bench:tau2-bench` | benchmark-runner | v1.0.1 (July 2026); vendor pin `7bec6062` on a branch | MIT | bench-only (Python ≥3.12) | adapt (cherry-pick) | bench machine | manual-pin | AUDIT FINDING — TO VERIFY (version/license; live 27.09.2026, external §4.1, §8); vendor pin `7bec6062` exists only on `origin/feature/harness-sota-bench`, not on `2af0904d` |
| `dataset:mercor/apex-agents-v1.1` + `bench:harbor` + `bench:archipelago` | dataset + runner | HF revision UNKNOWN; Harbor **0.20.0**; Archipelago push 2026-09-25 | CC-BY-4.0 / (Harbor license **UNKNOWN**) / Apache-2.0 | bench-only (Docker/WSL2) | borrow | bench machine | manual-pin | PROPOSAL (primary test not approved) |
| `dataset:openai/gdpval` | dataset | sha `11e7900c` | **UNKNOWN** | bench-only | deferred | — | — | DEFERRED |
| `vendored:pptxgenjs` | vendored-source | `vendor/pptxgenjs/LICENSE` | MIT | shipped (agent pptx runtime — `scripts/stage-agent-pptx-runtime.mjs`) | adapt | — | vendor-sync | CONFIRMED AT REVISION (existence); version/modifications TO VERIFY |
| `pattern:BuilderIO/agent-native` | pattern-reference | v0.1.271, commit `4f899f1d` | ISC/MIT/**null** (root) | pattern-only | build-reference | n/a | n/a | AUDIT FINDING — TO VERIFY (live 27.09.2026, external §2.1, §8); no code |
| `pattern:omnigent` | pattern-reference | v0.15.0, `56c6a7f7` | Apache-2.0 | pattern-only | build-reference | n/a | n/a | AUDIT FINDING — TO VERIFY (live 27.09.2026, external §2.2, §8) |
| `pattern:reflow-ts` | pattern-reference → candidate `adapt` | v0.7.0 | MIT | spike | TBD (§3) | Node | vendor/fork | PROPOSAL |
| `concept:odysseus-hwfit` | pattern-reference | — | **AGPL-3.0** | concept only (clean-room) | build-reference | n/a | n/a | CONFIRMED AT REVISION (AGPL-3.0; license note `docs/analysis/odysseus-adoption-2026-06-28.md:3`; not D-nn) |
| `skills:first-party-starter (18)` | skill | `packages/sdk/src/starter-skills/` @ `2af0904d` | MIT (root) — no provenance header exists | shipped-sidecar | preserve | — | repo | CONFIRMED AT REVISION |
| `skills:anthropics/knowledge-work-plugins`, `skills:anthropics/skills` | skill | — | **UNKNOWN** | not used | deferred | — | — | UNKNOWN |
| `mcp:*` (148 catalog + installed) | mcp-server | per server | per server (`spdx_id` from sync) | user-installed via SecurityGate | borrow (conditional) | per server | marketplace sync | UNKNOWN (license coverage) |

**BB-INV.4 — Inventory maintenance rules (PROPOSAL):** a new material dependency decision → a new row + an amendment to this record (BRIEF §14 "a material new dependency decision requires an amendment", R24 without per-PR bureaucracy); `securityReview.status = scanner` is not sufficient for `shipped-*` — an unresolved finding has an owner, a decision and a usage restriction; model weights and native binaries are components just like npm packages.

---

## 5. Upstream, security and maintenance — the most important costs

| ID | Cost | Area | Status |
|---|---|---|---|
| BB-COST.1 | Repin Ollama 0.32.3 → ≥0.32.12/0.32.15: new installer receipt + router receipt (CLAUDE.md §1 release contract); Qwen 3.8 pull/generate/tool test on Windows GGML | BB-08 | AUDIT FINDING — TO VERIFY |
| BB-COST.2 | Notices/SBOM change the installer SHA → new certification; extend `certify` | BB-12 | CONFIRMED AT REVISION (consequence) |
| BB-COST.3 | Substrate (`hive-mind-core`) and `hook-runtime.ts` changes → drift checker re-baseline + curated forward-port; already 22 blockers + 3 unreviewed | BB-03, BB-06 | CONFIRMED AT REVISION |
| BB-COST.4 | SQLite `CHECK` constraint migrations (table-rebuild) for `execution_traces.outcome` (`gate_passed`) and `evolution_runs.status` (`rolled_back`) | BB-02, BB-06 | CONFIRMED AT REVISION |
| BB-COST.5 | Reflow bus factor 1 → fork/vendor maintenance obligation if Adapt is selected | BB-01 | PROPOSAL (conditional) |
| BB-COST.6 | The DeepSeek judge (APEX) and the LLM user simulator (τ²) are cloud APIs → cost + KVARK mode excluded for those profiles; the GAIA2 judge Llama 3.3 70B can also run locally (BB-13) | BB-09 | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| BB-COST.7 | The `cost-tracker.ts` table overestimates Opus ×3 and Sonnet 5 ×1.5 → the hard daily budget trips prematurely (BYOK user) | BB-09 (manifest) / product | CONFIRMED AT REVISION (table values `cost-tracker.ts:28-32,39-40,66`) + AUDIT FINDING — TO VERIFY (official prices, and hence the ×3/×1.5 factors: live 27.09.2026, source: external.md §6, §8) |
| BB-COST.8 | Gmail restricted scopes → OAuth verification + CASA (weeks, external); MS Graph delegated without admin consent | BB-07 | AUDIT FINDING — TO VERIFY (Gmail/MS Graph rules: live 27.09.2026, source: external.md §5, §8; CASA exemption for local-only separately open) |
| BB-COST.9 | License contradictions (optimizer/weaver LICENSE vs package.json; NOTICE "proprietary" + nonexistent `EXTRACTION.md`; 9 manifests without `license`) on a public repo | BB-12 | CONFIRMED AT REVISION → founder decision-queue |
| BB-COST.10 | The repo is public without branch protection, secret scanning disabled; `production` env without reviewers | BB-12 (release) | AUDIT FINDING — TO VERIFY (live 27.09.2026) |

---

## 6. Sub-list (map to DQ) (short; does not open D-01..D-18)

The founder queue is exclusively Delivery plan §6 `DQ-01..09` (= brief §20.3, PRD v1.2 §17 `O-1..O-9`); `Q1..Q6` below are a sub-list and do not redefine `DQ-nn`. Map (same as Delivery plan §6): Q2 → DQ-04, Q3 → DQ-06, Q4 → DQ-02, Q5 → DQ-05; **Q1 and Q6 are owner engineering decisions** (Q1: Runtime/W1 owner, with ADR-02 ratification for the outcome; Q6: Release/OSS owner), not the founder queue. **PROPOSAL**.

| # | Decision | Recommendation of this record (PROPOSAL) | Impact |
|---|---|---|---|
| Q1 | Durable core: two-branch spike (Adapt Reflow vs Build SQLite) per §3 — **engineering** (Runtime/W1 owner) | run the spike in an isolated worktree; selection after T1–T3 + T9 on the prototype of both branches (BB-R22.2); T4–T8/T10 are the W1/F2 exit of the selected branch; Borrow/Adapt remains a PROPOSAL until confirmed (BB-00.2) | W1 critical path |
| Q2 | Primary benchmark: APEX-Agents 1.1 (+ τ² control) and judge API budget | approve the evidence card as primary; τ² secondary | B1–B3, G2/G3 |
| Q3 | First mail/calendar ecosystem | MS Graph (delegated, without CASA) before Gmail | W7, G3 |
| Q4 | License realization: final texts, NOTICE corrections, `EXTRACTION.md`, `license` fields; SBOM/license tool selection after the evidence card | separate decision; does not block G1 code | OSS gate, AT-30 |
| Q5 | Repin Ollama + re-baseline of the catalog to Qwen 3.8 27B (D-15 stands) | approve as an early W6 step | W6, receipts |
| Q6 | Import of external skill packages — **engineering** (Release/OSS owner) | DEFERRED until a per-repo license check | W3/G3 |

---

## 7. Register of UNKNOWN / open items

| # | Item | Area | What would close it |
|---|---|---|---|
| U1 | OSS candidates for context package, WorkItem/delta sync, SBOM/license tools — **not researched in phase A** | BB-03, BB-07, BB-12 | short evidence cards per class (repo, version, license, Windows, maintenance) |
| U2 | Licenses/versions of `anthropics/knowledge-work-plugins`, `anthropics/skills`, Harbor, GDPval dataset; HF revisions of the ONNX models and the gaia2/apex datasets | BB-09, BB-10, §4 | per-repo check and pin in the inventory |
| U3 | Reflow: test suite, security review, perf | BB-01 | reading the repo + spike |
| U4 | `getDue()` ISO-vs-`datetime('now')` comparison (routines do not come due on the same UTC day) | BB-01 | repro against `CronStore` (not `:memory:`) |
| U5 | Whether Ollama 0.32.3 serves the `qwen3_5` arch (Qwen 3.8 27B) on Windows GGML; official min. vLLM/SGLang; tool parser for 3.8; VRAM/RAM per quant | BB-08 | pull/generate/tool test; measurement (A21) |
| U6 | Reranker model offline on a fresh desktop; `memory_compact` cron E2E on the desktop | BB-03 | installation test |
| U7 | Whether `waggle-bridge-server.ts` (τ² branch) goes through production `/api/chat`; τ² telecom/banking full task count | BB-09 | reading the branch / paper |
| U8 | Gmail CASA exemption for a local-only desktop; Slack "persistent copies" vs local memory; MS Graph for MSA accounts; Discord policy citation | BB-07 | legal/vendor review |
| U9 | Coverage of the `license` field in marketplace sync for the 148 catalog MCP servers | BB-11 | query against the marketplace DB |
| U10 | Who calls `markSurfaced` in production; whether Claude Code `--safe-mode` suppresses SessionStart hooks (double injection) | BB-06, BB-03 | grep/test; Claude Code documentation |
| U11 | Actual subscribers/Stripe products; the date the repo became public | WB (outside this record) | authorized inventory |
| U12 | Security review and reading of upstream tests — **not done for any** external candidate (BB-13 matrix) | all Borrow/Adapt areas | `securityReview.status ≥ manual` + a test record in the inventory before the first PR that introduces the dependency |
| U13 | Inngest SDK license (Apache-2.0 in `package.json` vs GPL-3.0 GitHub detection) and OpenWorkflow (not evaluated) — irrelevant to the decision (both rejected/UNKNOWN), recorded for completeness | BB-01 | reading `LICENSE*` in the repos if they are ever reconsidered |
| U14 | HF revisions of the datasets `mercor/apex-agents-v1.1`, `gaia2`, `openai/gdpval` and the ARE commit — **not pinned** in the repo or in phase A; Harbor license | BB-09, §4 | pin in the inventory before the first benchmark run (§13.6 manifest) |

---

## Sources

- **D** — user decisions of 27.09.2026: D-01, D-02, D-03, D-05, D-06, D-11, D-12, D-13, D-15, D-17, D-18 (BRIEF §3).
- **DIR** — DIR-01, DIR-02, DIR-03, DIR-04, DIR-05, DIR-06, DIR-07, DIR-09, DIR-10, DIR-11, DIR-12, DIR-13, DIR-14, DIR-15, DIR-17, DIR-18, DIR-19, DIR-21, DIR-22, DIR-23, DIR-24 (BRIEF §4–§14).
- **C** — C5, C6, C10, C11, C12, C13, C14, C19, C20, C22 (BRIEF §17; S1 §1).
- **A** — A1, A2, A3, A5, A6, A7, A8, A9, A10, A11, A12, A13, A15, A16, A17, A18, A19, A20, A21, A26, A27, A28, A29 (BRIEF §18; S1 §2).
- **R** — R01, R11, R13, R17, R20, R21, R22, R23, R24 (BRIEF §19; S1 §3).
- **BRIEF** — `docs/plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md` §2.2, §5.1, §6, §7, §8, §9, §10, §11.3, §11.4, §12.3, §13, §14, §15.3, §16, §20.
- **S1** — `docs/plans/v1.2-evidence/inputs/S1-audit-2026-09-27.md` (spot-checks, §2 A1–A29, §3 cuts, §4 OSS gate row).
- **PRD/FRD v1.1** — `docs/plans/v1.2-evidence/inputs/Waggle_PRD_v1.1_2026-09-27.md` §14 (OSS-first), `docs/plans/v1.2-evidence/inputs/Waggle_FRD_v1.1_2026-09-27.md` §18 FR-OSS-01..12, §19.
- **Phase A** — `docs/plans/v1.2-evidence/phaseA/{harness,durable,evolution,hivemind,capability,ux-model,tiers-kvark,release-oss}.md` + `{harness,durable,evolution,hivemind}.refute.md`, `external.md` (external checks 27.09.2026), `oss-drift-check-output.txt`, `repro-harness.mjs`, `repro-shadow.mjs`, `repro-gepa-delta.mjs`.
- **Repo (read-only, revision `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`)** — `package.json`, `package-lock.json`, `packages/*/package.json`, `node_modules/*/package.json` (versions/licenses), `packages/sdk/src/starter-skills/`, `packages/agent/src/connectors/`, `packages/shared/src/mcp-catalog.ts`, `scripts/{bundle-node,bundle-native-deps,stage-sidecar-deps,oss-drift-check}.mjs`, `packages/server/src/local/managed-ollama-runtime.ts`, `benchmarks/gaia2/{adapter.ts,config.yaml,README.md}`, `benchmarks/harness/package.json`, `docs/analysis/odysseus-adoption-2026-06-28.md`.
