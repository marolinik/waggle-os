# Phase A — revalidation of the "durable" group (Durable runs & routines)

> **English translation** of [durable.md](durable.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

- **Revision:** `main = 2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (`git rev-parse HEAD` confirmed; `git status --porcelain` shows only two untracked `.docx` files in `docs/`, so working tree == HEAD for all cited source files).
- **Date:** 2026-09-27. Repo treated as read-only; nothing was changed, installed or run in the repo.
- **Scope (from the task):** S1 L12, C12, C15, A6–A10, W1, W5; brief §6.2–6.5, §11.5, AT-07..AT-10, AT-23.
- **Note on S1:** S1 was done at the same revision `2af0904d` (S1 introduction). Therefore no finding could have been "fixed after the audit"; the status **ALREADY CLOSED** is given only to what S1 reported incorrectly or what was already closed in code at that revision.
- **Method:** file reading + multiple greps by capability (not by name): `DurableRun|ProofReceipt|ToolCallJournal|runs.db|idempotencyKey|actionId` (0 hits in the durable sense), `sinceSeq|Last-Event-ID|lastEventId` (0 in server/src), `CheckpointStore|RecoveryRunner` (callers), `pause:|resume:|status: 'paused'|'waiting_for_approval'|'starting'` (setters), `timezone|tz|misfire|catch-up|DST` (cron), `background|detach` (chat).

---

## 1. Findings register

Format per brief §1: commit · path/symbol · input · current output · repro test or verification boundary · expected · smallest change · AT.

### F-DUR-01 — Restart marks ALL active internal runs as terminal `interrupted` (S1 L12, A6, A8)
- **Status:** CONFIRMED AT REVISION
- **Path/symbol:** `packages/server/src/local/agent-run-registry.ts:510-520` `AgentRunRegistry.interruptInFlightInternalRuns()`, called from the constructor `:137`; `ALLOWED_TRANSITIONS.interrupted = new Set()` (`:41`), `TERMINAL_STATUSES` includes `interrupted` (`:26-28`); `control()` on a terminal run throws `Run is already interrupted` (`:282`).
- **Input:** `agent-runs.json` with a run whose `source !== 'external_tool'` and status in `ACTIVE_STATUSES` (`queued|starting|running|waiting_for_approval|paused|cancelling`, `:23-25`), then a new process.
- **Current output:** status `interrupted`, `result.error = 'Waggle restarted before this run finished'`, `completedAt` set (`:452`). No resume path: no place in `packages/server/src` transitions out of `interrupted` (grep `'interrupted'` — all hits are terminal filters: `index.ts:1811`, `chat-collaboration.ts:29,665`, `fleet-run-executor.ts:821,866`, `agent-groups.ts`, `tools.ts`, `external-tool-runs.ts`). The UI maps `interrupted → 'failed'` (`apps/web/src/lib/room-state-reducer.ts:228`, `packages/server/src/local/routes/agents.ts:155`).
- **Repro test / boundary:** `packages/server/tests/local/agent-run-registry.test.ts:195-218` (`restored.get(internal.id)?.status === 'interrupted'`). Not executed in this session (read-only); the test exists and asserts exactly this behavior as the desired one.
- **Expected (brief §6.4, DIR-05):** `interrupted` preserves the interruption reason and the phase cursor; it does not automatically become `COMPLETED` nor unconditionally `RUNNING`; an explicit resume that validates the checkpoint.
- **Smallest change:** keep the `interrupted` marking, but (a) write the reason + the last known `progress`/cursor instead of only `result.error`, (b) allow the transition `interrupted → queued` exclusively through an explicit resume API that checks for the existence of a valid checkpoint; until then the UI must display `interrupted` as failure/partial (AT-22), which it already does today.
- **AT:** AT-07, AT-22, AT-10.

### F-DUR-02 — `agent-runs.json` is a whole-file JSON store with no schema migration and no retention (S1 A2, A8)
- **Status:** CONFIRMED AT REVISION
- **Path/symbol:** `agent-run-registry.ts:539-574` `persist()` (tmp + rename, Windows fallback with `.bak`), `:497-508` `record()` (persist on EVERY upsert), `:29` `MAX_EVENTS = 2_000`, `:522-537` `load()` (`version !== 1` → empty store; corrupt JSON → silently empty store, comment `:534-535`), `:243-257` `eventsSince()` returns `resetRequired` when `since` is older than the oldest retained event. Instantiation: `packages/server/src/local/index.ts:538` `new AgentRunRegistry(path.join(fullConfig.dataDir, 'agent-runs.json'))`.
- **Input:** >2 000 upsert events or a corrupt file.
- **Current output:** the oldest events are discarded; a client with an old `since` gets `resetRequired + snapshot`; corrupt file = loss of run history without any warning to the user.
- **Repro test / boundary:** `packages/server/tests/waggle-dance-routes.test.ts:225,291` reads the file; there is no test for corrupt/version-mismatch nor for MAX_EVENTS overflow (verification boundary: not found by grep for `resetRequired` in tests).
- **Expected (brief §6.3, §12.4):** `schemaVersion`, dry-run migration, retention/GC, status mapping; the store choice goes through §14 (BORROW→ADAPT→BUILD), SQLite is a candidate, not a decision.
- **Smallest change:** document in the plan the migration map `agent-runs.json v1 → ciljni store` (statuses 1:1, `interrupted` keeps the reason); do not introduce a new database without a §14 record. The atomic write logic (`:548-573`) is an asset that should be preserved.
- **AT:** AT-07, AT-10.

### F-DUR-03 — `CollaborationRunStatus` vs FRD §4: 10 states, three practically dead, `paused` without semantics (S1 C12)
- **Status:** CONFIRMED AT REVISION
- **Path/symbol:** `packages/shared/src/types.ts:398-402` `COLLABORATION_RUN_STATUSES = ['queued','starting','running','waiting_for_approval','paused','cancelling','completed','failed','cancelled','interrupted']`; `:404-405` controls `cancel|pause|resume|message`; `:445-450` `capabilities`. A separate union `AGENT_RUN_STATES` (`types.ts:381-384`) has its own `paused` (lifecycle of a saved Agent blueprint, comment `:376-380`).
- **Input/check:** grep for setters in `packages/server/src`: `status: 'waiting_for_approval'` — 0 hits; `status: 'starting'` — 0 hits; `capabilities.pause/resume = true` — 0 hits (only `DEFAULT_CAPABILITIES` false, `agent-run-registry.ts:46-47`); `status: 'paused'` only in `control('pause')` (`:330`), which requires a capability+handler that nobody registers, and in `derivedStatus` (`:613`).
- **Current output:** `starting`, `waiting_for_approval`, `paused` exist in the type, the transitions and the UI mapping (`RoomApp.tsx:51-66`, `routes/agents.ts:149-160`, `room-state-reducer.ts:228`, `routes/agent-runs.ts:15` zod enum, `external-tool-runs.ts:1450`, `tools.ts:149,216`, `fleet-run-executor.ts:48`, `anthropic-proxy.ts:483`, `security-middleware.ts:667-673`, `index.ts:1811`) but nothing produces them. The FRD §4 states (`BLOCKED_CAPABILITY`, `BLOCKED_APPROVAL`, `FAILED_RETRYABLE`, `FAILED_FINAL`) have no equivalent; `interrupted`/`cancelling`/`starting` have no FRD equivalent.
- **Repro test / boundary:** `agent-run-registry.test.ts` covers transitions; there is no test that produces `paused`/`waiting_for_approval` through the production flow (searched `tests/local/*.test.ts` for `'paused'` — only unit transitions).
- **Expected (brief §6.4, C12 ACCEPT):** a canonical/legacy state map while preserving the API contract; defer `PAUSED` until it has semantics (waiting for approval ≠ user pause).
- **Smallest change:** mapping table in FRD v1.2: `queued→QUEUED`, `starting|running→RUNNING`, `waiting_for_approval→BLOCKED_APPROVAL`, `cancelling→(prelazno, zadržati)`, `completed→COMPLETED`, `cancelled→CANCELLED`, `failed→FAILED_FINAL` (until a classification exists), `interrupted→(legacy, razlog + resume provera)`, `paused→ODLOŽENO`. Do not delete values from `COLLABORATION_RUN_STATUSES` (the zod enum on the route + the web types depend on them).
- **AT:** AT-07, AT-10, AT-22.

### F-DUR-04 — `long-task/checkpoint.ts` + `recovery.ts` exist and are tested, but are not wired to any production run (S1 W1 "preserve semantics")
- **Status:** PARTIAL/UNWIRED
- **Path/symbol:** `packages/agent/src/long-task/checkpoint.ts` (`CheckpointStore`, `save` tmp+rename `:170-211`, `verifyIntegrity` `:267-290`, `CHECKPOINT_SCHEMA_VERSION=1` `:31`, per-step `cost_usd` `:85`); `recovery.ts` (`RecoveryRunner.run` `:250-344`, `_resolveStartingPoint` `:350-386` — fresh/resume_clean/resume_from_error; persistence cadence only on success/exhaustion `:31-35`). The only non-test consumer: `packages/agent/src/retrieval-agent-loop.ts:153` (optional `checkpointStore`), resume `:568-579` (checks `latest.run_id === runId`, "finalized → cached result"), per-turn save `:713-755` with `total_cost_usd/total_tokens_*` in `step_output` (`:729-733`). `RecoveryRunner`: 0 non-test callers (only the export `packages/agent/src/index.ts:152`). `agent-loop.ts`: 0 hits for `checkpoint`. `routes/agent-run.ts` (`/api/agent/run`, calls `runRetrievalAgentLoop` `:305`): 0 hits for `checkpointStore`. `benchmarks/gaia2/adapter.ts`: 0 hits.
- **Input:** production chat (`/api/chat`), fleet spawn, `/api/agent/run`, cron `ai_task`.
- **Current output:** none of these flows writes a checkpoint; on restart the run becomes `interrupted` (F-DUR-01) without data for continuation.
- **Repro test / boundary:** cross-process resume is proven only in the test `packages/agent/tests/long-task-loop-integration.test.ts:221-284` (`mid-loop crash → fresh runner → resumes from next turn`; `finalized checkpoint → cached result`; `:286` "resume preserves running totals across processes"). The recovery unit is the LLM turn (step), not the phase (DIR-05).
- **Expected (brief §6.4 DIR-05, AT-07):** the phase as the recovery unit, a checkpoint at a confirmed boundary with references and consumed budget.
- **Smallest change:** no code change in this phase; in the plan mark it as an **asset for ADAPT**, not as a "finished durable feature". For W1 it is sufficient to: define the mapping `CheckpointStepState → Checkpoint` (brief §6.3) and decide whether step granularity is kept as an internal level below the phase boundary.
- **AT:** AT-07, AT-03.

### F-DUR-05 — Held-action executor: idempotent claim + ADR "never mid-run suspend/resume" exists inline; no `unknown_outcome` and no provider key (S1 C14, A7)
- **Status:** CONFIRMED AT REVISION (ADR and idempotency), PARTIAL for DIR-06
- **Path/symbol:** `packages/server/src/local/held-action-executor.ts:6-10` (ADR text: "never mid-run suspend/resume … the only 'suspend' primitive in the codebase is request-bound and restart-fatal"), `:154-160` atomic claim `held→approved` via `cronStore.claimPendingAction` (`packages/core/src/cron-store.ts:551-556`, `UPDATE … WHERE id=? AND status='held'`), `:29` TTL 7 days, `:162-166` expiry guard, `:191-206` re-validation of allowlist/critical/injection/workspace at execute, `:221-225` alias `send_email → connector_*_send_email` on the LIVE pool, `:233-235` `tool.execute` then `updatePendingActionResult('executed')`. `PendingActionStatus = 'held'|'approved'|'denied'|'executed'|'failed'|'expired'` (`cron-store.ts:88`). Producers: Loop L2 (`index.ts:2632-2645`), `proposeHeld` turns — ai_task (`index.ts:2439`), channel (`channels/manager.ts:261`), session-reviewer (`index.ts:2728`) — through `chat-approval-hook.ts:301-323`. Consumer: `routes/approval.ts:58-82` (`POST /api/approval/:requestId`), list `:90-99` (`/api/approval/pending`, union of live+held).
- **Input:** double approve; approve after TTL; crash between `tool.execute` (`:233`) and the result write (`:235`).
- **Current output:** double approve → `already decided` (no second execution); expired → `failed`; crash after provider success → the row stays `approved` forever: no `unknown_outcome`, no reconciliation, but also no blind retry (re-approve is rejected). No `providerIdempotencyKey` (grep 0). Action identity = `pending_actions.id` (one action = one attempt); no separate `attemptId`.
- **Repro test / boundary:** `packages/server/tests/local/held-action-executor.test.ts:120-128` (idempotent), `:193` (expired), `:292-317` (no longer proposable). No test for crash-after-provider-success.
- **Expected (brief §6.5 DIR-06, AT-08):** `actionId` stable across retries, `attemptId`, an `unknown_outcome` status with a provider check or user confirmation; no universal exactly-once promise.
- **Smallest change:** add an `unknown_outcome` status (or equivalent) that is written BEFORE `tool.execute` (e.g. `dispatching`) and resolved afterwards; the UI displays it as "outcome unknown — check". The superseding ADR for C14 is the writers' job (brief §20 ADR list (4)). Note: the S1 key proposal `runId+phaseId+attempt+callIndex` is not present in the code; the existing pattern is closer to DIR-06 (stable action id) than to S1 A7.
- **AT:** AT-08, AT-10.

### F-DUR-06 — Closing the SSE socket aborts the run (R3-008); Stop in the UI == closing the socket; no detach and no `sinceSeq` for chat (S1 A9)
- **Status:** CONFIRMED AT REVISION (intentional behavior)
- **Path/symbol:** server `packages/server/src/local/routes/chat.ts:1604-1612` (`raw.once('close', () => { if (!raw.writableEnded) abortController.abort(); })`, comment "must abort the provider/tool run immediately"); `packages/agent/src/agent-loop.ts:1090-1108` (R3-008: `config.signal` combined via `AbortSignal.any` with the timeout signals and passed into fetch `:1147`), `:973-975` check between turns, `:1458-1468` post-read guard, `:1663,1827,1872` additional checks. Client: `apps/web/src/lib/adapter.ts:1122-1148` (fetch with controller.signal), `:1184-1192` `finally` → `controller.abort()` + `reader.cancel()`, `:1196-1208` `abortAgent()`; `apps/web/src/hooks/useChat.ts:463-469` (Stop) and `:473-487` (unmount also aborts). Subagents inherit the parent's abort: `chat-collaboration.ts:110-128` `linkParentCancellation` → `registry.control(runId,'cancel')`.
- **Input:** the user clicks Stop / closes the tab / the network drops during the `/api/chat` stream.
- **Current output:** the turn and all child subagent runs are cancelled; there is no "continue in background" option (grep `background|detach` in `useChat.ts`: 0). For replay: `GET /api/agent-runs/events?since=` exists for registry upsert events (`routes/agent-runs.ts:20-22,73-84`, `agent-run-registry.ts:243-257`, `resetRequired`), but chat SSE has no `sinceSeq`/`Last-Event-ID` (grep `packages/server/src`: 0); `/api/events/stream` (`routes/events.ts:328-359`) is live-only.
- **Repro test / boundary:** `packages/agent/tests/agent-loop.test.ts:1981-2010` (R3-008 forwarding); origin of the decision `docs/audits/2026-05-29-prod-readiness/REPORT.md:103,157`. The UX copy that communicates this to the user was not verified (no string found in the web code; verification boundary).
- **Expected (brief §6.4):** losing the connection is not a user cancel; a foreground path that deliberately aborts must say so clearly; the durable path has a separate contract; a `sinceSeq` equivalent for reconnect.
- **Smallest change:** (a) UX text on Stop/disconnect: "aborting stops the work"; (b) do not change R3-008 for foreground chat before W1; (c) for the registry stream, `since` already exists — document it as a compatible `sinceSeq` equivalent for run-status, not for text/cards.
- **AT:** AT-10.

### F-DUR-07 — Budget: daily spend survives restart, per-run budget does not exist in the checkpoint (S1 A10)
- **Status:** PARTIAL/UNWIRED
- **Path/symbol:** per-run metrics are written to the registry only at the end: `packages/server/src/local/fleet-run-executor.ts:746-766, 825-840, 883` (`metrics.inputTokens/outputTokens/costUsd`), progressively only `toolsUsed` (`:698`); the daily total through `costTracker` + `modelSpendBudget` reservations (in-memory, `agent-loop.ts` does not persist). The checkpoint (retrieval loop) carries `total_cost_usd` (`retrieval-agent-loop.ts:731`) but is not in production (F-DUR-04). Cron ai_task has a daily cap `AI_TASK_DAILY_CAP=24` via `cronStore.countExecutionsToday` (`index.ts:1917, 2414-2418`; `cron-store.ts:406-411`, UTC `date('now')`).
- **Input:** restart in the middle of a fleet run; restart after 23 ai_task executions.
- **Current output:** run → `interrupted` without recording that run's consumed tokens (metrics remain from the last terminal patch, i.e. there are none); the daily total survives (`packages/server/tests/local-mode.test.ts:1067-1075` asserts `getDailyTotal()` == 0.018 after a `buildLocalServer` restart); the ai_task cap survives (history table).
- **Repro test / boundary:** `local-mode.test.ts:1030-1117` (daily budget after restart); no test for per-run consumption after restart.
- **Expected (brief §6.3 Checkpoint "consumed budget", §6.5 "restart does not reset consumption").**
- **Smallest change:** in the W1 plan: `Checkpoint.spent` as a mandatory field; until then progressively patch `metrics` in the registry at the turn boundary (a small addition in `fleet-run-executor.ts`), so that an `interrupted` run at least carries its consumption.
- **AT:** AT-03, AT-07, AT-23.

### F-DUR-08 — `harnessEvents` is a global emitter without `runId`; the run id exists in the tool layer but is not emitted (S1 A11, AT-06)
- **Status:** CONFIRMED AT REVISION
- **Path/symbol:** `packages/agent/src/workflow-harness.ts:132` `export const harnessEvents = new EventEmitter()`; payloads `:169-183` (`HarnessPhaseStartEvent/CompleteEvent`: `harnessId, phaseId, phaseName…`), emit `:144-148, 243-256, 292-300, 323-335, 344-353, 359-369` — `runId` nowhere. `harnessId` = template id (`getHarnessById(harnessId)`, `workflow-tools.ts:366`), not an instance. A run instance exists: `workflow-tools.ts:447` `activeHarnessRuns` (module-level Map, in-memory), `:453-457` `generateHarnessRunId`, `:373-375` creation, `:405,429` deletion on completion. `HarnessTraceBridge` tags only `harnessId` (`harness-trace-bridge.ts:22-24, 131-133, 159`); `index.ts:612-616` a single global bridge instance.
- **Input:** two concurrent Workspaces run the same harness (same `harness_id`).
- **Current output:** events and trace tags are indistinguishable per instance (AT-06); the harness run state disappears on restart (Map).
- **Repro test / boundary:** `packages/agent/tests/harness-trace-bridge.test.ts:306-309` uses the shared emitter; no test with two parallel runs.
- **Expected (brief §6.4 "run-scoped event bus; a global harnessId is not enough").**
- **Smallest change:** an additive `runId` field in all three event payloads (source: `providedRunId`/`runId` from `workflow-tools.ts:364,374`) and in the bridge tags; `advancePhase` should receive the runId (signature `:213`). Does not touch gate semantics (W0 group).
- **AT:** AT-06, AT-10.

### F-DUR-09 — Loops L2: maker TOOLLESS, one proposed action goes into the held queue; cross-tick state lives in the Awareness layer of `.mind` (S1 C15, A2)
- **Status:** CONFIRMED AT REVISION
- **Path/symbol:** `packages/server/src/local/loop-executor.ts:9-18` (L1 guarantee), `:99-102` `mode: 'report'|'assist'`, `:212-230` state `stateKey = loop:<id>` from `AwarenessLayer.getByStatus`, `:224-230` throttle `minIntervalMs` by `lastTickAt` (not by `schedule.last_run_at`), `:254-262` toolless `chat()`, `:271-274` `parseProposal`, `:295-303` frame write `createIFrame('loop', …)` (default `writeToMemory=true`), `:311-322` `awareness.add('pending', …)/updateMetadata` with `result/lastTickAt/score`. Mind selection: `index.ts:2596-2597` (workspace mind if `workspace_id` is not null/`'*'`, otherwise **personal**). L2 enqueue: `index.ts:2632-2645` → `enqueueHeldAction` (F-DUR-05).
- **Input:** a loop with `workspace_id = null` or `'*'`.
- **Current output:** execution state (last result, `lastTickAt`, score) written as an Awareness item in the **personal** `.mind`; report frame in the same mind. The decision "L2 stays TOOLLESS" is respected in the code.
- **Repro test / boundary:** `packages/server/tests/local/loop-executor.test.ts` (283 lines; not read line by line — boundary), `apps/web/src/test/phase3b-automation-center.test.tsx`.
- **Expected (brief §8.2 "Execution state … is not a semantic memory frame"; §11.5; §12.4 "Cron leases / Loop state — separate the schedule from the execution state").**
- **Smallest change:** move the `loop:<id>` state (not the report frame) into the execution store from W1; until then add a `retrieval exclusion` for Awareness items with a `status` prefix `loop:` if recall sees them (not verified whether `getByStatus` items enter recall — UNKNOWN).
- **AT:** AT-23.

### F-DUR-10 — Routines: implicit misfire policy, re-execution of the same occurrence after a crash, lease without fencing, no timezone field (AT-23, AT-09)
- **Status:** CONFIRMED AT REVISION (the policy exists implicitly and is undocumented); UNKNOWN for DST
- **Path/symbol:** `packages/core/src/cron-store.ts:367-371` `getDue()` = `enabled=1 AND next_run_at <= datetime('now')`; `:374-382` `markRun()` = `last_run_at=now`, `next_run_at=computeNextRun(cron_expr)`; `:203-206` `computeNextRun` = `parseExpression(cronExpr).next()` **without the `tz` option** (cron-parser `^4.9.0`, `packages/core/package.json:22`; installed 4.9.0; `node_modules/cron-parser/lib/expression.js:28` → `_tz = options.tz` → the local zone of the process). No `timezone` field in the schema/routes (grep `timezone|\btz\b` in `cron-store.ts`, `routes/cron.ts`, `routes/automations.ts`: 0). Scheduler: `packages/server/src/local/cron.ts:219-243` `tick()`, `:245-314` `runSchedule()` — `markRun` **only after success** (`:276`); failure → `failCounts`, auto-disable after `MAX_CONSECUTIVE_FAILURES=5` (`:55, :307-311`, persists `job_config.auto_disabled` `:429-453`); rate-limit → one-shot resume timer (`:316-347`, in-memory). Lease: `:253-254` `acquireRunLease` = a plain `INSERT` (`cron-store.ts:442-447`), without a conditional claim; `:366-389` `sweepInterruptedRuns` at startup writes `failed_interrupted: process exited mid-run` into history and deletes all leases, **does not touch `next_run_at`**. The executor receives only `schedule` (`cron.ts:19`), without an occurrence id.
- **Input and current output (derived from the code, not executed):**
  1. The laptop sleeps across multiple slots → on the first tick one catch-up fire (all missed occurrences collapse into one; `next_run_at` is computed from `now`, not from the scheduled slot).
  2. The job throws an error → `next_run_at` stays in the past → **re-run on every tick (60 s)** until it succeeds or until 5 failures disable the job.
  3. Crash in the middle of execution → on restart history gets `failed_interrupted`, leases are cleared, and **the same occurrence is immediately re-executed** on the first tick (no occurrence identity, no check for partial side effects; for `ai_task` with `proposeHeld` this can mean two held rows for the same intent).
  4. Two processes over the same `dataDir` (e.g. a duplicate sidecar) → both can execute the same job (single-flight is only `this.ticking` per process; the lease is not fencing).
  5. DST: cron-parser has `_applyTimezoneShift` (`expression.js:411`), the behavior at the transition is not tested in the repo → UNKNOWN.
- **Repro test / boundary:** `packages/server/tests/local/cron-scheduler-hardening.test.ts:227-250` (stale lease sweep → history + notification; `getFailCount === 1`), `:44-73` (rate-limit resume), `:180` (lease release on throw). No test for "re-fire after crash", "catch-up after sleep", "two processes", nor DST.
- **Expected (brief §11.5 DIR-19, AT-23):** an explicit misfire policy (skip / one catch-up / bounded rule), timezone, occurrence identity, no duplicate actions, the budget does not reset.
- **Smallest change:** (a) document the existing implicit policy as "one catch-up + retry-every-tick + 5-strike disable" and decide whether it stays; (b) before re-execution after `failed_interrupted` require an explicit flag (e.g. `job_config.rerunAfterInterrupt`) or move `next_run_at` in `sweepInterruptedRuns`; (c) occurrence id = `cron_execution_history.id` or `lease.id` passed to the executor; (d) `acquireRunLease` as a conditional `INSERT … WHERE NOT EXISTS` (fencing). The timezone field is a schema extension — the writers' decision.
- **AT:** AT-23, AT-09, AT-08.

### F-DUR-11 — AutomationCenterApp already covers next run / last result / pause / run now / history / L2 approvals; no block state and no misfire/timezone display (S1 W5)
- **Status:** CONFIRMED AT REVISION (exists and wired), PARTIAL for "block"
- **Path/symbol:** `apps/web/src/components/os/apps/AutomationCenterApp.tsx:29` tabs `overview|running|scheduled|triggers|history|logs`; `:74-99` refresh + per-automation logs (`getAutomationLogs`, C27); `:111-127` engine status poll + L2 held approvals (`getPendingApprovals` filter `source==='held'`); `:176-178` pause/resume (`adapter.pauseAutomation` / `updateAutomation({enabled:true})`); `:536-546, 669-670` next run; `:478-489` approve/deny buttons; `:679-680` history. Backend: `packages/server/src/local/routes/automations.ts:128-148` `toAutomation` (`status: enabled ? 'active' : 'paused'`, `lastRun`, `nextRun`), `:320-324` pause → `cronStore.update(enabled:false)`, `:272-298` run → `scheduler.executeJob`; `routes/cron.ts:201-215` run-now auto-enable + `resetFailure`. Engine pill: `cron.ts:183-199` `getStatus()`.
- **Current output:** the user sees the next slot and the last result (history), and can pause/disable the routine and run it immediately; L2 proposals are approved inline in this app (independently of the TEAMS-gated Approvals dock icon, `apps/web/src/lib/dock-tiers.ts:82` — finding A15, another group). There is no "blocked" status (Automation status only `active|paused`; the UI references `'running'` `:308,536,669`, which the backend never emits — a dead branch). No timezone/misfire controls. An interrupted history row (`failed_interrupted`) is displayed as a failure in the history tab (M-09 Home failure items `:129`).
- **Repro test / boundary:** `apps/web/src/test/phase3b-automation-center.test.tsx`, `packages/server/tests/local/automations.test.ts:284` (pause), `:256-267` (run aliases). Not executed.
- **Expected (brief §11.5):** the user sees the next slot, the last result, the block, and pause/disable of the routine itself.
- **Smallest change:** add a derived `blocked` status when a held action with `source = loop:<id>` exists or the last history row is `failed_interrupted`/rate-limited; remove the dead `'running'` branch or populate it from the `scheduler` lease. Do not build a new surface (DIR-16).
- **AT:** AT-23.

### F-DUR-12 — Subagent/workflow "background" is tied to the lifetime of the parent turn; no detach
- **Status:** CONFIRMED AT REVISION
- **Path/symbol:** `packages/agent/src/subagent-orchestrator.ts:93` `signal?: AbortSignal` ("Abort all workers when the owning async job is cancelled"), `:119-124` in-memory `workers` Map, `:439-458` `runLoop({... signal: this.config.signal})`, results only in `WorkerState` + `emit('worker:status')`. Registration in the registry: `chat-collaboration.ts:236-269` (`chat_subagent`), `:455-478` (`workflow`), controls `:280-301` (cancel → `controller.abort()` + settlement), `:302-308` `linkParentCancellation(parentSignal)` → aborting the parent SSE cancels the children; fleet `fleet-run-executor.ts:480-515` creates room+worker BEFORE execution (`lifecycle.trackExecution`), `:551-564` cancel control; `agent-groups.ts:315-328`.
- **Current output:** subagents are created and finish within a single HTTP turn; when the user closes the stream, the children are cancelled (F-DUR-06); restart → `interrupted` (F-DUR-01). Fleet spawn (`POST /api/fleet/spawn`, 202) is the only flow that continues without an open client socket — but it does not survive restart.
- **Repro test / boundary:** `packages/server/tests/local/chat-collaboration.test.ts`, `tools-routes-launch.test.ts:1152-1167` (an external tool run survives restart while the pid is alive). Not executed.
- **Expected (brief §6.4 "Detach means that the UI detaches, while approved background work continues").**
- **Smallest change:** no code change in this phase; in the plan distinguish "request-bound subagent" (existing) from "detached durable run" (W1 net-new). The fleet spawn path is the closest existing candidate for ADAPT.
- **AT:** AT-06, AT-10.

### F-DUR-13 — No server-driven phase executor: harness phases are driven by the model through the `run_harness` tool with self-reported `tool_calls` (S1 A6 context, W1 net-new)
- **Status:** CONFIRMED AT REVISION (absence)
- **Path/symbol:** `packages/agent/src/workflow-tools.ts:362-434` (`execute`: the first call creates the run, later calls pass `phase_output` from the model's arguments → `advancePhase`), `:393-399, 412-422` (`phase_output.tool_calls/artifacts/duration_ms/tokens` are model-supplied; `durationMs` default 0), `:447` in-memory `activeHarnessRuns`. `createHarnessRun/advancePhase` have no callers in `packages/server/src` (grep 0).
- **Current output:** no phase checkpoint, no phase recovery, no server-observed log for gates (the content part belongs to the W0 group). Restart wipes the run state.
- **Repro test / boundary:** N/A (absence confirmed by grep by capability: `createHarnessRun|advancePhase(` in server/src = 0; `DurableRun|ProofReceipt|ToolCallJournal|runs.db` = 0 in the durable sense).
- **Expected (brief §6.2 DIR-04, §6.4 DIR-05, §7 DIR-07).**
- **Smallest change:** none; this is W1 net-new and the subject of ADR (2) from brief §20. Record that `HarnessRunState` (`workflow-harness.ts:118-128`: `phaseStatuses`, `checkpoints`, `totalTokens`, `startedAt`) already has a shape that can be serialized.
- **AT:** AT-07, AT-06.

### F-DUR-14 — TD-CHAT-46 (held-proposal branch unreachable) is closed in code, but the ledger row still says "Pinned, not fixed"
- **Status:** ALREADY CLOSED (code) + AUDIT FINDING — TO VERIFY (ledger drift; outside the narrow group, affects the F-DUR-05 producers)
- **Path/symbol:** `packages/server/src/local/routes/chat-approval-hook.ts:290-323` — the branch `if (proposeHeldTurn)` without the `allowDerivedPersistence` guard, the comment explicitly cites TD-CHAT-46 as the reason; `docs/TECH-DEBT.md:65` still describes the branch as unreachable and cites the old lines `routes/chat.ts:3611/3618`, which no longer exist (handler refactored, TD-CHAT-3 closed).
- **Consequence for the durable group:** `ai_task` routines (`index.ts:2433-2441`, `proposeHeld:true`) really do park gated proposable tools as held actions → F-DUR-10 point 3 (duplicate occurrence → two held rows) is a real scenario.
- **Smallest change:** update the ledger row (a document, not code). No test was executed; `packages/server/tests/local/held-action-executor.test.ts` covers the executor, not the hook branch (verification boundary).
- **AT:** AT-08.

---

## 2. What already works or exists-but-is-not-wired (existingAssetsToPreserve)

| What | Path | Callers (grep) |
|---|---|---|
| `AgentRunRegistry` — durable room/worker record before execution, revision/seq event log, `eventsSince(since)` with `resetRequired`, atomic tmp+rename persist with Windows fallback, credential issue/revoke, `reconcileExternalProcesses` | `packages/server/src/local/agent-run-registry.ts` | `index.ts:538` (instance), `fleet-run-executor.ts:413,480-496,551`, `chat-collaboration.ts:119-622`, `routes/agent-runs.ts`, `routes/agents.ts:106-160`, `routes/agent-groups.ts:315-627`, `routes/tools.ts:211-336`, `routes/external-tool-runs.ts:146-152,445,478,838`, `security-middleware.ts:667-673`, `index.ts:1809-1813` (workspace delete cancels active work) |
| `/api/agent-runs/events?since=` + `/snapshot` + `/:id/control` | `packages/server/src/local/routes/agent-runs.ts:61-116` | web `RoomApp.tsx`, `room-state-reducer.ts` (revision-based merge), `security-middleware.ts:61` rate limit |
| External tool runs survive restart while the pid is alive; pid reconcile at boot | `agent-run-registry.ts:381-395`; `routes/tools.ts:280-336` | `tools.ts:336` `reconcileExternalProcesses(startupAlive)`; test `tools-routes-launch.test.ts:1152-1167` |
| `CheckpointStore` (schema_version, atomic save, integrity check, dispose) and `RecoveryRunner` (retry/backoff/fallback/exhaust, deterministic decisions) | `packages/agent/src/long-task/checkpoint.ts`, `recovery.ts` | Only `retrieval-agent-loop.ts:153,534-579,713-755` (optional) + tests; `RecoveryRunner` 0 production callers; `/api/agent/run` and the gaia2 adapter do not pass it |
| Cross-process resume of the retrieval loop with cached-final and running totals | `retrieval-agent-loop.ts:568-579,713-755`; test `long-task-loop-integration.test.ts:221-330` | unwired in production |
| Held-action queue: `pending_actions` table, atomic claim, TTL, execute-time re-validation, alias resolve | `held-action-executor.ts`; `cron-store.ts:179-198,505-586`; `routes/approval.ts:58-99` | producers: `index.ts:2632-2645` (Loop L2), `chat-approval-hook.ts:301-323` (ai_task/channel/session-reviewer); UI: `AutomationCenterApp.tsx:65-70,119-122,478-489`, ApprovalsApp (`/approvals`) |
| AbortSignal through the agent loop (fetch, body read, between turns) | `agent-loop.ts:125-126,973-975,1090-1108,1458-1468` | `routes/chat.ts:1607-1612` (socket close), `subagent-orchestrator.ts:450`, `chat-collaboration.ts:254,466`, `fleet-run-executor.ts:501-515`; test `agent-loop.test.ts:1981-2010` |
| CronStore + LocalScheduler: `getDue/markRun`, run leases + boot sweep, rate-limit resume, 5-strike auto-disable persisted in `job_config`, history + retention 30d, `ai_task` daily cap | `packages/core/src/cron-store.ts`; `packages/server/src/local/cron.ts` | `index.ts:1913-2706` (executor for 8 `job_type`s, `cronStore.ts:15`), `routes/cron.ts`, `routes/automations.ts`; tests `local-scheduler.test.ts`, `cron-scheduler-hardening.test.ts`, `cron-error-handling.test.ts`, `automations.test.ts`, `core/tests/cron-store.test.ts` |
| Loop L1/L2 executor (toolless maker, judge gate, one held proposal, injection scan on recall/prior state) | `packages/server/src/local/loop-executor.ts` | `index.ts:2588-2648`; test `loop-executor.test.ts` |
| Automation Center UI (next run, pause/run-now, history, engine pill, L2 approvals) + `/api/automations*` alias layer | `apps/web/src/components/os/apps/AutomationCenterApp.tsx`; `routes/automations.ts` | `adapter.ts:2238-2310` (`pauseAutomation/runAutomation/getAutomationLogs`); test `phase3b-automation-center.test.tsx`, `automations.test.ts` |
| `harnessEvents` + `HarnessTraceBridge` (channel for progress/trace; it needs a runId) | `workflow-harness.ts:132`; `harness-trace-bridge.ts`; `index.ts:612-616` | `workflow-tools.ts:373-434` (the only driver), `agent/src/index.ts:315-316` |
| Serializable `HarnessRunState` shape (phaseStatuses, checkpoints, totalTokens) | `workflow-harness.ts:118-128` | in-memory `workflow-tools.ts:447` |
| Daily spend ledger survives restart | `agentState.costTracker` (test `local-mode.test.ts:1067-1075`) | fleet executor spend meter `fleet-run-executor.ts:593-595` |

---

## 3. What was NOT found (after multiple greps by capability)
- A durable run store with schema/migration, `DurableRun`, a `Checkpoint` at the phase boundary, `ToolCallJournal`, `ProofReceipt`, `actionId/attemptId/providerIdempotencyKey` (grep `DurableRun|ProofReceipt|ToolCallJournal|runs\.db|idempotencyKey|idempotency_key|Idempotency-Key` in `packages/**/*.ts`: 0 relevant; `actionId` exists only in the command-registry/Composio/KVARK context).
- `sinceSeq`/`Last-Event-ID` reconnect for chat SSE (0 in `packages/server/src`).
- Timezone/misfire configuration of routines (0).
- Any resume from `interrupted` (0 transitions in the code).
- Occurrence identity for routines in the executor signature (`JobExecutor = (schedule) => Promise<void>`).

## 4. Notes for the writers (no architectural proposals)
- S1 claim L12 is correct and intentional (the test asserts it). It is not a bug in the sense of a code error; it is a gap relative to DIR-05/AT-07.
- The S1 A7 key proposal (`runId+phaseId+attempt+callIndex`) has no counterpart in the code; the existing held-action pattern (stable action id, atomic claim) is closer to brief DIR-06 — use it as the starting point (BORROW from Waggle).
- The S1 A9 description "socket-close-aborts behavior is deliberate today (R3-008)" is correct; origin in `docs/audits/2026-05-29-prod-readiness/REPORT.md:103`.
- Ledger `docs/TECH-DEBT.md:65` (TD-CHAT-46) is stale relative to the code — a wrong ledger row is a defect in itself (rule from MEMORY.md).
- Date arithmetic of the brief: 12–17 weeks from 27.09.2026 = 20.12.2026–24.01.2027 (not relevant for this group, carried over for consistency).
