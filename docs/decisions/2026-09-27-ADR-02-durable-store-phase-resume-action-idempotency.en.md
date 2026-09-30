# ADR-02 — Durable run store, phase as the unit of recovery, stable action identity (`actionId` ≠ `attemptId`)

> **English translation** of [2026-09-27-ADR-02-durable-store-phase-resume-action-idempotency.md](2026-09-27-ADR-02-durable-store-phase-resume-action-idempotency.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Document revision:** 1.2 DRAFT · 27.09.2026 · reviewed code revision `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`
**Document revision:** 1.2.1 DRAFT · 30.09.2026 · final closure (H-01..H-12)
**Changes in 1.2.1:** H-03 (finding `finish/facts/f1/06`) — `HarnessRunState` anchor corrected from `workflow-harness.ts:118-128` to `:110-128` in K5 and §7 (at `2af0904d` the interface starts at `:110`; CONFIRMED AT REVISION, `git show 2af0904d:packages/agent/src/workflow-harness.ts`). Decision content unchanged.
**Date:** 2026-09-27
**Status:** DRAFT — contract proposal; the store choice goes through Build-vs-Borrow (brief §14) and is NOT decided by this ADR
**Author:** planner (Fable 5.1)
**Ratified by:** founder — pending (ratification of the ADR as a whole, review in W1-PR1; the A8 store decision, the `runs.db` location and the status map are engineering decisions of the owner (MDQ-01 / Build-vs-Borrow Q1 after the two-branch spike; MDQ-02) whose outcome is recorded in this ADR and ratified with it — they are not a separate DQ; ADR-INDEX §3)
**Supersedes / refines:** the `agent-runs.json` whole-file JSON store (`AgentRunRegistry`, `packages/server/src/local/agent-run-registry.ts`); the restart policy "all active internal runs → terminal `interrupted`" (`:510-520`); the S1 A7 key `runId+phaseId+attempt+callIndex`; the FRD v1.1 §3 ordering (run created in step 7, after context and blocking) and the §4 state set (including `PAUSED`); S1 §3 "Build ~600–1000 LOC" as a foregone conclusion
**Binds:** W1 (run store, server-driven phases, checkpoints, journal, budgets), W2 (context reference in the checkpoint), W5 (Work Progress), W7 (WorkItems), migrations (brief §12.4), FRD v1.2 §"Contracts" and §"State map"
**Cross-references:** ADR-01 (modes), ADR-03 (detach/cancel/sinceSeq), ADR-04 (BLOCKED_CAPABILITY), ADR-07 (routine occurrence identity), ADR-10 (erasure boundary); brief §6.2–6.5 (DIR-04, DIR-05, DIR-06), §12.4 (DIR-21); AT-07, AT-08, AT-09, AT-10, AT-15, AT-23, AT-27

---

## §1 — Context

**ADR-02-K1 (CONFIRMED AT REVISION).** Restart marks all active internal runs as terminal: `AgentRunRegistry.interruptInFlightInternalRuns()` (`agent-run-registry.ts:510-520`, called from the constructor `:137`) writes `status:'interrupted'`, `result.error='Waggle restarted before this run finished'`; `ALLOWED_TRANSITIONS.interrupted = new Set()` (`:41`); `control()` on a terminal run throws (`:282`). No transition out of `interrupted` exists in `packages/server/src`. The test `packages/server/tests/local/agent-run-registry.test.ts:195-218` pins this as the desired behavior. Context from the refute: there is a second resume pattern for harvest runs (M-08: `routes/harvest.ts:128`, `adapter.ts:4018`) — a BORROW candidate; fleet `pause` is an abort, not a suspend (`workspace-sessions.ts:241-259`, `fleet.ts:419`). [durable.md F-DUR-01; refute HOLDS]

**ADR-02-K2 (CONFIRMED AT REVISION).** The store is whole-file JSON: `persist()` tmp+rename with a Windows `.bak` fallback (`:539-574`), persist on every upsert (`:497-508`), `MAX_EVENTS = 2_000` (`:29`), `load()` → empty store on `version !== 1` or corrupt JSON without a warning (`:522-535`), no GC over `runs[]`. `eventsSince(since)` returns `resetRequired` (`:243-257`); only the `false` path is tested (`agent-run-registry.test.ts:104-105`), overflow and corrupt-load tests are missing. Instance: `packages/server/src/local/index.ts:538` `agent-runs.json` in `dataDir`. [F-DUR-02; refute WEAKENED only for the claim about the test]

**ADR-02-K3 (CONFIRMED AT REVISION).** `COLLABORATION_RUN_STATUSES` (`packages/shared/src/types.ts:398-402`) = 10 states; `starting`, `waiting_for_approval`, `paused` have no production setter (grep `status: 'waiting_for_approval'|'starting'` = 0; `capabilities.pause = true` = 0); `paused` only from `control('pause')` (`:330`), which requires a capability that nobody grants. The zod enum on the route (`routes/agent-runs.ts:15`) and the UI maps (`RoomApp.tsx:51-66`, `routes/agents.ts:149-160`, `room-state-reducer.ts:228` `interrupted→'failed'`) depend on all values — deleting any of them breaks the contract. The FRD §4 states `BLOCKED_CAPABILITY|BLOCKED_APPROVAL|FAILED_RETRYABLE|FAILED_FINAL` have no equivalent (grep = 0 in `packages/` and `apps/`). [F-DUR-03, F-CAP-02]

**ADR-02-K4 (PARTIAL/UNWIRED).** `packages/agent/src/long-task/checkpoint.ts` (`CheckpointStore`, atomic save `:170-211`, `verifyIntegrity` `:267-290`, `CHECKPOINT_SCHEMA_VERSION=1`, per-step `cost_usd`) and `recovery.ts` (`RecoveryRunner`) exist and are tested cross-process (`long-task-loop-integration.test.ts:221-330`), but the only non-test consumer is the optional `retrieval-agent-loop.ts:153,568-579,713-755`; `/api/agent/run`, chat, fleet, cron do not pass `checkpointStore`; `RecoveryRunner` has 0 production callers. The unit of recovery is the LLM turn, not the phase. [F-DUR-04]

**ADR-02-K5 (CONFIRMED AT REVISION).** There is no server-driven phase executor: `createHarnessRun/advancePhase` have no callers in `packages/server/src` (only a re-export in `packages/agent/src/index.ts:315`); `HarnessRunState` (`workflow-harness.ts:110-128`) is a serializable shape (phaseStatuses, checkpoints, totalTokens) but lives only in the `activeHarnessRuns` Map. `latestDurableRun()` in `routes/agents.ts:106,153,490` is a local helper over the registry, not a system. Grep `DurableRun|ProofReceipt|ToolCallJournal|runs\.db|idempotencyKey|Idempotency-Key` across `packages/**/*.ts` = 0 relevant hits. [F-DUR-13; refute HOLDS]

**ADR-02-K6 (CONFIRMED AT REVISION).** The only idempotency pattern for an external action is the held-action queue: a `pending_actions` row = one action, atomic claim `held→approved` (`held-action-executor.ts:154-160` → `packages/core/src/cron-store.ts:551-556` `UPDATE … WHERE id=? AND status='held'`), TTL 7 d, re-validation at execute (`:191-206`), `tool.execute` then `updatePendingActionResult('executed')` (`:233-235`). A crash between `:233` and `:235` leaves the row `approved` forever — there is no `unknown_outcome`, no `attemptId`, no `providerIdempotencyKey` (grep 0); `routes/approval.ts:66-68` returns 409 `already_decided` without the executed result. `PendingActionStatus = 'held'|'approved'|'denied'|'executed'|'failed'|'expired'` (`cron-store.ts:88`). `job-service.ts:38` is a team-mode Postgres id collision, not a provider key. The S1 A7 key (`runId+phaseId+attempt+callIndex`) is not present in the code; the existing pattern is closer to DIR-06 than to S1 A7. [F-DUR-05; refute HOLDS]

**ADR-02-K7 (PARTIAL/UNWIRED).** Budget: daily spend survives restart (`local-mode.test.ts:1067-1075`); per-run `metrics` are written to the registry only on the terminal patch (`fleet-run-executor.ts:746-766,825-840,883`), so an `interrupted` run has no recorded spend; a checkpoint with `total_cost_usd` exists only in the unwired retrieval loop. [F-DUR-07]

**ADR-02-K8 (CONFIRMED AT REVISION).** Loop execution state lives in semantic memory: `loop-executor.ts:212-230,311-322` `stateKey='loop:<id>'` as an `AwarenessLayer` item (`pending`); for `workspace_id null/'*'` in the **personal** mind (`index.ts:2596-2597`); `AwarenessLayer.toContext()` (`awareness.ts:142-168`) renders all `pending` items without a filter → one `- Loop: <name>` line per Loop enters the recall context (`context-loader.ts:111-120`, `orchestrator.ts:315-316`). [F-DUR-09; refute HOLDS+, UNKNOWN resolved]

**ADR-02-K9 (AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §3, §8) / PROPOSAL; only Waggle `better-sqlite3` 12.6.2 = CONFIRMED AT REVISION, `package.json:73`).** Build-vs-Borrow for the durable engine: no candidate meets all 5 criteria (external.md §3 (a)–(e): embedded in Node/Fastify without a separate server, SQLite, Windows, permissive license, maturity). DBOS TS = Postgres-only; Absurd Postgres; Inngest/Restate/Temporal/Resonate = separate server (Restate BSL, Inngest SSPL server); LangGraph SqliteSaver = `better-sqlite3 ^11` conflict with 12.6.2 + LangGraph runtime; Vercel Workflow Local World = JSON files "not production". Closest fit: **Reflow** (`danfry1/reflow-ts`, MIT, v0.7.0, `sqlite-node` over better-sqlite3 ≥9, lease/heartbeat, retries, `AbortSignal` cancel, idempotent enqueue) — 41★, a single author (bus factor 1). BuilderIO/agent-native: Postgres/PGlite + Nitro, root license `ISC` without a LICENSE file, durable/replay claims unproven from the docs — pattern reference only. [external.md §2.1, §3, §8]

**ADR-02-K10 (DECISION — D-14, D-17 · PROPOSAL — BRIEF DIRECTION — DIR-04, DIR-05, DIR-06, DIR-21).** DECISION: long-running work is part of the product (D-14); BORROW → ADAPT → BUILD (D-17). PROPOSAL — BRIEF DIRECTION (planner direction, not user approval): the run exists before side effects, blocking and durable context (DIR-04); the phase is the unit of recovery (DIR-05); stable business action identity (DIR-06); rollback does not restore erased rights (DIR-21). This ADR implements the decisions and elaborates the brief direction as the working basis of the draft.

## §2 — Decision (contract proposal)

**ADR-02-O1 (PROPOSAL) — minimal data contracts (brief §6.3, carried over as a contract; align names with the existing types via a compatibility map):**

| Contract | Fields / responsibilities |
|---|---|
| `DurableRun` | `runId`, `workspaceId`, `sessionId`, `requestFingerprint`, `status` (canonical, §O3), `interaction/mode` (ADR-01), `recipeId/recipeVersion`, `modelId/runtimeId`, `budget {limit, spent}`, `contextRef` (ADR-05), `cursor {phaseId, attempt}`, `permissionEnvelopeRef` (ADR-04), `createdAt/updatedAt/completedAt`, `schemaVersion`, `leaseOwner/leaseUntil` |
| `PhaseAttempt` | `runId`, `phaseId`, `attempt`, `inputRefs[]`, `startedAt/endedAt`, `observedToolCalls[]` (server ledger), `evidenceRefs[]`, `gateResults[] {gate, passed, verdict?, reason}`, `abortReason?` |
| `Checkpoint` | `runId`, `phaseId`, `attempt`, `phaseOutput`, `artifactRefs[] {path, sha256}`, `evidenceRefs[]`, `contextRef + contextHash`, `spent {tokens, usd}`, `nextPhaseId`, `schemaVersion`; written only at a **confirmed phase boundary** (gates passed) |
| `ToolAction` / `ToolAttempt` | `actionId` (server-persisted, stable across retries), `runId`, `phaseId`, `tool`, `argsFingerprint`, `sideEffectClass`, `grantRef?`, `status` (§O5), `providerIdempotencyKey?`, `receipt?`; `ToolAttempt {attemptId, actionId, startedAt, endedAt, ok, exitCode?, resultRef}` |
| `RunEvent` | `runId`, monotonic `seq`, `phaseId/attempt`, `type`, `label` (user-facing), `status`, `evidenceRefs[]`, `at`; no secrets in the payload |
| `ProofReceipt` | `runId`, `level: structural\|defined_elements\|content_review` (ADR-01 O5, FRD-02.6; `gate_passed` is only a `TraceOutcome`, not a level), `verifierVersions`, `observedEvidence[]`, `mandatoryGates[]`, `optionalGates[]`, `warnings[]`, `unresolved[]`; not a general seal of truthfulness |

**ADR-02-O2 (PROPOSAL) — run creation order (DIR-04; corrects C8):** (1) resolve the user/Workspace, save the intent + `requestFingerprint`; (2) classify (ADR-01 O2), choose the recipe/version; for `conversation` the session path remains; (3) **create the `DurableRun`** with scope/mode/budget/envelope; (4) assemble and link the `ContextPackage` (it may be prepared in memory before 3, but no durable reference may depend on a package without a run); (5) resolve capabilities → `BLOCKED_CAPABILITY` if needed (ADR-04); (6) after the grant, re-check the envelope and fresh availability, continue the **same** run; (7) execute the phase; gates read the server ledger; checkpoint at the confirmed boundary; (8) `ProofReceipt` → `COMPLETED`; memory consolidation as a separately recorded, idempotent operation (ADR-05).

**ADR-02-O3 (PROPOSAL) — canonical states and the mapping to the existing contract (C12 ACCEPT):**

| Canonical | Legacy `CollaborationRunStatus` | Note |
|---|---|---|
| `QUEUED` | `queued` | 1:1 |
| `RUNNING` | `starting`, `running` | `starting` remains in the enum (zod/UI), maps to RUNNING |
| `BLOCKED_CAPABILITY` | — (new) | ADR-04; legacy clients see `waiting_for_approval` through a compatible projection |
| `BLOCKED_APPROVAL` | `waiting_for_approval` | no setter today; becomes a real run state (not just a held tool call) |
| `FAILED_RETRYABLE` | `failed` (+ `retryable:true`) | the model/tool/infra/budget/evaluator classification (brief §7.3) is mandatory in `reason` |
| `FAILED_FINAL` | `failed` | |
| `CANCELLED` | `cancelling` → `cancelled` | `cancelling` remains transitional |
| `COMPLETED` | `completed` | only with a `ProofReceipt` in `strict`/`benchmark`; in `normal` with the recipe minimum met |
| `interrupted` (legacy) | `interrupted` | does **not** automatically become `COMPLETED` or `RUNNING`; migration preserves the reason + the last cursor; an explicit resume API checks for a valid checkpoint → `QUEUED`; without a checkpoint → `FAILED_RETRYABLE` with reason `no_checkpoint` |
| `PAUSED` | `paused` | **DEFERRED** (R10): there is no suspension primitive; waiting for approval ≠ user pause; the value remains in the enum, without a setter |

Values are not deleted from `COLLABORATION_RUN_STATUSES` (zod enum `routes/agent-runs.ts:15`, `RoomApp.tsx:51-66`).

**ADR-02-O4 (PROPOSAL) — the phase is the unit of recovery (DIR-05, A6).** After a restart, an unfinished phase starts from the last valid `Checkpoint`, using the already confirmed outputs of the previous phases; there is no resume in the middle of the agent loop or between model thoughts. The existing step-level `CheckpointStore` may remain **internal** beneath the phase boundary (ADAPT, not a rewrite), with a `CheckpointStepState → Checkpoint` mapping. Resume validates: `schemaVersion`, the `recipeVersion` pinned for the run, model/runtime availability, `contextRef` validity (ADR-05 O6: a deleted/revoked source invalidates it), and the envelope.

**ADR-02-O5 (PROPOSAL) — stable action identity (DIR-06; corrects S1 A7).** `actionId` is the server-persisted identity of one intended/approved action, stable across retries and plan regeneration; `attemptId` identifies an attempt; `providerIdempotencyKey` is bound to `actionId` when the service supports it. Statuses: `planned → approved → dispatching → succeeded | failed | unknown_outcome`. `dispatching` is written **before** the provider call; if the process crashes before the local ack, the status remains `unknown_outcome` → first a provider state/receipt check, otherwise a user check; **no blind retry** for a non-idempotent service. A new `actionId` must not serve the model as a shortcut around an unresolved previous attempt of the same action (dedup by `runId + phaseId + tool + argsFingerprint` while an `unknown_outcome` exists). Two approved routine occurrences are two actions (ADR-07). There is no universal exactly-once promise.

**ADR-02-O6 (PROPOSAL) — one authorized executor per phase (AT-09).** `DurableRun.leaseOwner/leaseUntil` with a conditional claim (`UPDATE … WHERE leaseOwner IS NULL OR leaseUntil < now`) and a fencing token in every side-effect call; an old process with an expired lease must not start a new side-effecting action. Apply the same pattern to the routines' `acquireRunLease` (today a plain `INSERT`, `cron-store.ts:442-447`, without UNIQUE — F-DUR-10).

**ADR-02-O7 (PROPOSAL) — the budget survives restart (A10).** `Checkpoint.spent` is a mandatory field; `DurableRun.budget.spent` is updated at the turn boundary, not only at the terminal state; restart does not reset spend; judge/evaluator cost (ADR-06) counts against the same run budget.

**ADR-02-O8 (PROPOSAL) — store: a candidate, not a decision (A8, R22, brief §14).** Criteria: embedded in the Fastify sidecar, SQLite (better-sqlite3 12.6.2 already shipped), Windows, permissive license, migrations with `schemaVersion`, retention/GC, no Postgres/separate process. A bounded spike with two branches: (a) ADAPT Reflow (`reflow-ts/sqlite-node`, MIT) — code/test review, vendor or fork, bus-factor risk assessment; (b) a minimal BUILD over better-sqlite3 with Reflow/Morling/persistasaurus as references. The selection criterion is tests ADR-02-T1..T3 (AT-07/08/09; = BvB §3 T1–T3) and BvB T9 (dependencies), executed against a throwaway prototype of both branches in a dev Node environment, not LOC; ADR-02-T4..T10 (incl. ADR-02-T6 `MAX_EVENTS` overflow/`resetRequired` → AT-10 and the packaged crash-injection T10; `sinceSeq` reconnect is BvB T4 → W1-PR8, not in the ADR-02-T set) are exit criteria of the selected branch in W1/F2, not a spike criterion (Delivery plan W1-PR1, 28.09.2026: they depend on the choice itself). `runs.db` as a separate file in `dataDir` is the candidate location (execution state is **not** in `.mind`, brief §6.3/§8.2); the final location = an engineering decision of the Durable owner (MDQ-01, BvB Q1, after the two-branch spike), recorded in O8 and ratified with ADR-02 (RAT-02); it is not a DQ (outside DQ-01..09, brief §20.3; ADR-INDEX §3). `AgentRunRegistry` becomes an adapter over the new store, keeps `eventsSince/resetRequired`, and the atomic write is not lost.

**ADR-02-O9 (PROPOSAL) — atomicity boundary (brief §6.3).** Only what is in the same transaction of the selected store is atomic (run + checkpoint + events + action status). An external email, a filesystem artifact and a separate `.mind` write are not in that transaction: artifacts are referenced by hash (content, not business correctness), memory writes go through idempotent consolidation (ADR-05), external actions through the `ToolAction` status model (O5) with outbox/reconciliation semantics.

## §3 — What it supersedes and why

| Previous | Where | Why |
|---|---|---|
| "All active internal runs → `interrupted` (terminal) on restart" | `agent-run-registry.ts:510-520`; test `:195-218` | Intentional and tested, but without any resume path; a gap relative to DIR-05/AT-07 (CONFIRMED AT REVISION). Remains as a **legacy state** with a reason, gains an explicit resume |
| `agent-runs.json` v1 whole-file store | `agent-run-registry.ts:29,497-574`; `index.ts:538` | No migration schema/retention, `MAX_EVENTS` discards history, corrupt → silent loss (CONFIRMED). Becomes an adapter/import source |
| S1 A7 idempotency key `runId+phaseId+attempt+callIndex` | docs/plans/v1.2-evidence/inputs/S1-audit-2026-09-27.md A7 | Identifies the attempt, not the action; a change of `attempt` changes the key (brief §6.5 DIR-06 "important correction of A7") |
| Held-action "one action = one attempt", without `unknown_outcome` | `held-action-executor.ts:233-235`; `cron-store.ts:88` | A crash after provider success leaves `approved` forever (CONFIRMED). The atomic claim pattern is **kept** (BORROW), the status model is extended |
| FRD v1.1 §3 ordering (run in step 7) and §4 `PAUSED` | docs/plans/v1.2-evidence/inputs/Waggle_FRD_v1.1_2026-09-27.md:41-69 | C8 ACCEPT: run before blocking and durable context; C12: PAUSED deferred until it has semantics |
| S1 §3 "Build ~600–1000 LOC on better-sqlite3" as a conclusion | docs/plans/v1.2-evidence/inputs/S1-audit-2026-09-27.md §3 row "Durable-execution engines" | R22: Build-vs-Borrow decides; Reflow is a realistic ADAPT candidate (external.md §3) |
| Loop execution state in `AwarenessLayer` `.mind` | `loop-executor.ts:212-230,311-322` | Execution state is not a semantic frame (brief §8.2); it pollutes recall (`toContext()`) |

**ADR-02-Z1 (DECISION — not reopened).** D-14 (long-running work is part of the product) and D-17 (BORROW→ADAPT→BUILD) are not decided again; this ADR applies them.

## §4 — Consequences

**ADR-02-P1 (PROPOSAL).** Migration map (brief §12.4, A2), all with `schemaVersion`, dry-run, snapshot, rollback:
1. `agent-runs.json v1 → runs store`: statuses 1:1 per O3; `interrupted` keeps `result.error` as `reason`, `progress` as the cursor; it is not started automatically.
2. Cron leases / Loop `loop:<id>` Awareness state → execution store; the schedule remains in `cron_schedules`; the report frame remains in the mind (it is not execution state); occurrence identity (ADR-07).
3. `pending_actions` → `ToolAction` model or adapter: existing rows get `actionId = id`, status mapped (`held→planned/approved`, `executed→succeeded`).
4. Harness `verified` traces → `unqualified` (ADR-01 P2).
5. New stores are included in erasure/export (`erased_subjects`, `stableHarvestId` pattern) — checkpoint and artifact references are user/third-party content (A3; ADR-10).

**ADR-02-P2 (PROPOSAL).** Tests that break or must be rewritten (CONFIRMED AT REVISION that they exist): `agent-run-registry.test.ts:84-94` ("rejects illegal terminal transitions" — which is why resume goes through an explicit API, not through `ALLOWED_TRANSITIONS`), `:195-218` (pins `interrupted`); `held-action-executor.test.ts:108-131` stay green if the terminal statuses remain `executed/failed`, but the `PendingActionStatus` union widens — check for a `switch` without a default (grep: none in non-test code; `ApprovalsApp.tsx:182,301` filters by `source`, not by status).

**ADR-02-P3 (PROPOSAL).** Assets that are kept (BORROW from Waggle): the `AgentRunRegistry` revision/seq log + `eventsSince/resetRequired` + atomic persist (`:243-257,539-574`); `reconcileExternalProcesses` (`:381-395`, pid-based survival of external runs, test `tests/tools-routes-launch.test.ts:1148-1170` — path corrected per the refute); `CheckpointStore`/`RecoveryRunner` semantics; the held-action atomic claim + TTL + execute-time re-validation; `AbortSignal` through the agent loop (`agent-loop.ts:1090-1108`); the harvest M-08 resume pattern.

**ADR-02-P4 (PROPOSAL).** `fleet spawn` (`POST /api/fleet/spawn`, 202; `fleet-run-executor.ts:480-515` creates room+worker before execution) is the closest existing internal flow that continues without a client socket — a candidate for the first ADAPT onto `DurableRun`; it does not survive restart (the registry marks it `interrupted`). The BORROW precedent for surviving restart is the external-tool pid-reconcile (P3; F-DUR-12 refute).

**ADR-02-P5 (PROPOSAL).** Receipt: it touches the chat/harness/run surface → a new candidate SHA + fresh receipts + a **crash-injection receipt on the packaged Windows candidate** are mandatory (brief §15.4; release-oss.md F-REL-03: such a tool was NOT FOUND, new work).

**ADR-02-P6 (PROPOSAL).** Retention/GC: the run store gets a retention policy (e.g. terminal runs > N days → archive/GC; artifact references remain while the artifact exists); `MAX_EVENTS` semantics replaced by per-run `seq` + `resetRequired` (ADR-03).

## §5 — Risk

| ID | Risk | L/I | Mitigation |
|---|---|---|---|
| ADR-02-R1 | Touches `agent-loop.ts` and the chat hot path; conflicts between parallel workstreams | high / high | hotspot merge owner (brief §15.3); server-driven executor as a new module behind an interface, agent-loop changes only the AbortSignal/ledger callback |
| ADR-02-R2 | Side-effect replay on resume (duplicate email) | medium / critical | O4 confirmed outputs + O5 `unknown_outcome` + AT-08 |
| ADR-02-R3 | Reflow bus factor 1 / lack of maintenance | medium / medium | vendor + fork strategy in the Build-vs-Borrow record; exit plan (the contract is ours, the engine is replaceable) |
| ADR-02-R4 | Migration of `agent-runs.json` loses history or revives old runs | low / high | dry-run + snapshot; `interrupted` never auto-RUNNING (O3) |
| ADR-02-R5 | A new database alongside `.mind` and `cron-store` — three SQLite files, three migration chains | high / low | a single `schemaVersion` registry; the store decision in the §14 record may choose the existing `cron-store.ts` DB for execution tables if the tests allow it |
| ADR-02-R6 | Erasure does not cover checkpoint copies of content | medium / high (GDPR) | O1 reference-first; ADR-10; AT-15/AT-27 |

## §6 — Migration test

| ID | Test | Expectation | AT |
|---|---|---|---|
| ADR-02-T1 | Crash (SIGKILL of the sidecar) after confirmed phase 2 of 4; restart → the run continues with phase 3 with the same `contextRef`/artifact references; `spent` from phases 1–2 preserved | RED today (run → `interrupted`, no checkpoint) | AT-07 |
| ADR-02-T2 | Crash between provider success and the local ack (`dispatching`) → status `unknown_outcome`; resume does not resend; the UI shows "outcome unknown — verify" | RED today (the row stays `approved`, no status) | AT-08 |
| ADR-02-T3 | Two processes over the same `dataDir` attempt the same run → only one holds the lease; the other must not start a side effect | RED today (no lease for runs; cron lease is a plain INSERT) | AT-09 |
| ADR-02-T4 | An `interrupted` run from `agent-runs.json v1` after migration: status/reason preserved; `POST /api/runs/:id/resume` without a checkpoint → `FAILED_RETRYABLE(no_checkpoint)`; with a checkpoint → `QUEUED` | new | AT-27 |
| ADR-02-T5 | Migration is repeatable: the same input file twice → identical store; rollback restores the v1 file without duplicating actions | new | AT-27 |
| ADR-02-T6 | `MAX_EVENTS` overflow and a corrupt `agent-runs.json`: the client gets `resetRequired`; the user gets a warning (not a silent empty store) | RED today (the tests do not exist; refute F-DUR-02) | AT-10 |
| ADR-02-T7 | Budget: restart after 60 % spend → `budget.spent` ≥ 60 %; continuation does not reset it | RED today (F-DUR-07) | AT-03/AT-07 |
| ADR-02-T8 | Loop `loop:<id>` state after migration is not in the `AwarenessLayer.toContext()` output; the report frame remains | RED today (F-DUR-09 refute) | AT-23 |
| ADR-02-T9 | A strict run without a `ProofReceipt` cannot enter `COMPLETED` (the API rejects the transition) | new | AT-01 |
| ADR-02-T10 | Crash-injection on the packaged Windows build (certify step): kill the sidecar mid-phase → restart → T1 outcome | tool NOT FOUND (F-REL-03) — new receipt step | AT-07/AT-30 |

**Verification boundary:** none of the above has been executed; the F-DUR findings are code reading + two `node -e` probes (better-sqlite3 in-memory, cron-parser) outside the repo.

## §7 — Sources

- **D:** D-14, D-17 (brief §3)
- **DIR:** DIR-04, DIR-05, DIR-06, DIR-21 (brief §6.2–6.5, §12.4)
- **C/A/R:** C8, C12; A2, A6, A7 (FIX THE DESIGN), A8 (CANDIDATE + ADR), A10; R10, R20, R22
- **AT:** AT-07, AT-08, AT-09, AT-10, AT-15, AT-23, AT-27
- **Phase A:** `docs/plans/v1.2-evidence/phaseA/durable.md` F-DUR-01..05, 07, 09, 12, 13; `docs/plans/v1.2-evidence/phaseA/durable.refute.md` (HOLDS/WEAKENED, harvest M-08 context, `tests/tools-routes-launch.test.ts` path); `docs/plans/v1.2-evidence/phaseA/external.md` §2.1, §3, §8 (Reflow, DBOS, Temporal, agent-native license; live external data 27.09.2026 = AUDIT FINDING — TO VERIFY)
- **S1:** L12; A2, A6–A10; W1; §3 "Durable-execution engines", "BuilderIO agent-native"
- **Code (at `2af0904d`):** `packages/server/src/local/agent-run-registry.ts:29,41,137,243-257,282,330,497-574,510-520`; `packages/shared/src/types.ts:398-402`; `packages/agent/src/long-task/{checkpoint,recovery}.ts`; `retrieval-agent-loop.ts:153,568-579,713-755`; `packages/server/src/local/held-action-executor.ts:6-10,154-166,233-235`; `packages/core/src/cron-store.ts:83-88,442-447,551-556`; `packages/server/src/local/routes/approval.ts:58-85`; `fleet-run-executor.ts:480-515,746-766`; `loop-executor.ts:212-230,311-322`; `index.ts:538,2596-2597`; `packages/hive-mind-core/src/mind/awareness.ts:142-168`; `packages/agent/src/workflow-harness.ts:110-128`; `workflow-tools.ts:362-457`
