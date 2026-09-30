# 04 — Code map for the areas touched by plan v1.2

> **English translation** of [04-CODEBASE-MAP.md](04-CODEBASE-MAP.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Document revision:** handoff 1.0 · 29.09.2026 · reviewed code revision `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (`main`, hereinafter `2af0904d`)
**Document revision:** 1.2.1 DRAFT · 30.09.2026 · final closure (H-01..H-12)
**Changes in 1.2.1:** H-04 — §13 pt.7 and the STOP block: pointers to the [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.en.md) proposal (TSA-02; NOT APPROVED), §14 N-6 → TSA-01 pt.2 · H-05 — §1 "Data dir": writes bypassing `WAGGLE_DATA_DIR` (05 N-28, W0-PR20; code not fixed), §13 pt.7 BTP · H-09 — STOP block and §12: the exception of controlled step K and W8-PR7 (Delivery §5.1) · H-01 — §12 repo visibility re-checked 30.09.2026. The description of the code at `2af0904d` has not been changed; the revision is not an implementation approval.
**Audience:** tech lead, developers and QA taking over Waggle from the founder.
**Purpose:** orientation in the code for the areas changed by [Delivery plan v1.2](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md). This is neither a specification nor a plan: contracts are in [FRD v1.2](../Waggle_FRD_v1.2_DRAFT.en.md), ordering and PRs in the Delivery plan, migrations in [WAGGLE-MIGRATIONS-v1.2.md](../plans/WAGGLE-MIGRATIONS-v1.2.en.md), evidence in the [phase-A findings](../plans/v1.2-evidence/phaseA/).

> **STOP before code.** Implementation **is not approved**. Coding starts only when the founder approves the Delivery plan (ratifications RAT-01..RAT-09 and approvals ODB-01/ODB-02 are in Delivery plan §6.1). What the team may do today, and what after approval: [00 §2](00-START-HERE.en.md); the proposed team operating model is [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.en.md) (NOT APPROVED, not valid before the founder's written confirmation). Every PR, agent and session goes through the **mandatory** safe strategy: Delivery plan §0 (DP-0.01..DP-0.16) and [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md). A single "no" on the checklist stops work. No merge into `main`, no `v*` tags, no release (DP-0.11, DP-0.12); the only exception is controlled step K, approved in writing by the founder ([Delivery §5.1](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md)), and it is not team work. The founder's decisions D-01..D-18 ([brief §3](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.en.md)) are closed and this document does not reopen them.

---

## 0. How to read this document

**Status labels** are the same as in the package: **DECISION** (only D-01..D-18) · **CONFIRMED AT REVISION** (read in the code at `2af0904d`) · **AUDIT FINDING — TO VERIFY** (an audit claim not yet reproduced) · **PARTIAL/UNWIRED** (the mechanism exists, the flow is not closed) · **PROPOSAL** (plan, not approved) · **DEFERRED** · **UNKNOWN**. The package also uses **ALREADY CLOSED** (an S1 audit claim already resolved at the revision). Nowhere is "module exists" evidence that an E2E function works.

**What was verified in this pass (29.09.2026, read-only):**
- The existence of **every file path** in this document, via `git ls-tree -r 2af0904d`. Paths are correct at that revision, except where it says "does not exist at `2af0904d`" (new files from the plan).
- A spot-check of content at the revision (`git show 2af0904d:<fajl>`): `shouldSkipVerify` (`workflow-harness.ts:474-482`), `'run_harness'` in `verification-gate.ts:33`, `listPersonas()` (`personas.ts:67-70`), `resolvePersona` (`chat.ts:439-440`), close→abort (`chat.ts:1604-1612`), `local/index.ts:538,565,585,612-616`, `ci.yml:3-6`, `release.yml:12-15`, `OLLAMA_TARGET_VERSION` (`managed-ollama-runtime.ts:28-29`), `dock-tiers.ts:82`, `createKvarkTools` (0 production callers), `recallHookFrames` (`hook-runtime.ts:227-240`), `useHasWorkingModel.ts:174,244`, pull `stream:false` + 45 min (`local-inference.ts:330-331`), `cost-tracker.ts:24-33,66`, leak (`external-tool-runs.ts:964-977`), `hardware-detect.ts:330`, `interruptInFlightInternalRuns` (`agent-run-registry.ts:510-520`), `fleet-run-executor.ts:101-106`, `tauri.conf.json:4,21`, `vitest.config.ts:28`, and the pinned test lines `workflow-tools-harness.test.ts:135-140`, `harness-trace-bridge.test.ts:82-92`, `cost-tracker.test.ts:54-57`, `fleet-isolation.test.ts:200-205`, `useHasWorkingModel.test.ts:271-275`. Everything matches phase-A.
- **Other `path:line` citations** are carried over from the phase-A findings and the Delivery plan with their status label; they were not re-read line by line here. Line numbers are valid only at `2af0904d`: after the first W0 merges on the integration branch they **shift**. Anchor by symbol, not by line number (§13).

**Path corrections found by this pass** (CONFIRMED AT REVISION, `git ls-tree`):

| As cited elsewhere | Actual path at `2af0904d` |
|---|---|
| `chat-collaboration.ts` in the `routes/chat-*.ts` group (DP-0.14) | `packages/server/src/local/chat-collaboration.ts` (not in `routes/`) |
| `retrieval-agent-loop.ts` alongside `long-task/` (phase-A durable §2) | `packages/agent/src/retrieval-agent-loop.ts` |
| `data-erase.ts` (ADR-10-K7, W1-PR14) | `packages/server/src/local/routes/data-erase.ts` + `packages/server/src/local/data-erase-helpers.ts` |
| `THREAT_MODEL.md` (W4-PR7) | repo root: `THREAT_MODEL.md` (175 lines) |
| `executor-brief.ts` | `packages/server/src/local/executor-brief.ts` (not in `packages/agent`) |
| `agent-groups.ts:87` | `packages/server/src/local/routes/agent-groups.ts` |
| `MultiMind` (CLAUDE.md §2 places it in `packages/core/src/`) | `packages/hive-mind-core/src/multi-mind.ts`; at the revision `packages/core/src/` has no `multi-mind.ts`, `multi-mind-cache.ts` or `logger.ts` |
| `EvolutionTab.tsx` | `apps/web/src/components/os/apps/memory/EvolutionTab.tsx` |

**Doc drift to be aware of** (CONFIRMED AT REVISION): `docs/ARCHITECTURE.md` ("Storage Locations") says that personal memory is `~/.waggle/default.mind`, while the code opens `path.join(dataDir, 'personal.mind')` (`packages/server/src/local/index.ts:565`). `CLAUDE.md` §2 says "94 .ts files" for `packages/agent/src/`; at the revision there are 150 top-level `.ts` files. There is no PR in the plan for this item. Do not fix it without a ticket: the permitted doc-drift PR is W0-PR15, with an exactly stated scope.

---

## 1. Topology on one page

**Processes.** The Tauri 2 shell (`app/src-tauri/`) launches a bundled Node sidecar. The sidecar is a Fastify server whose composition root is `packages/server/src/local/index.ts`. That file creates all the stores and decorates them onto `server`. The UI is `apps/web/src` (React 19). The Teams cloud server (`packages/server/src/index.ts`) and the BullMQ worker (`packages/worker/src/*`) do not start in the Solo package: that happens only with `DATABASE_URL` and `CLERK_SECRET_KEY` (`local/index.ts:3585-3614`, F-TK-08, CONFIRMED AT REVISION).

**Dependency rule** ([ARCHITECTURE.md](../ARCHITECTURE.md), "Layer Map"): `shared ← hive-mind-core ← core ← agent ← server`. Fastify is imported only in `packages/server`.

**Data dir.** Resolved as `option > WAGGLE_DATA_DIR > ~/.waggle` (`packages/server/src/local/service.ts:112-121`, DP-0.08). Not all writes respect it: `routes/documents.ts:37`, `routes/pins.ts:32` and several other places write under `os.homedir()/.waggle` (CONFIRMED AT REVISION by reading the code; list in [05 N-28](05-RISKS-DECISIONS-ESCALATION.en.md) and [01 §9.5](01-ONBOARDING-DEV-ENV.en.md)). The fix is W0-PR20 with a sentinel test; the code is not fixed, and until confirmation runs go only in the safe test profile (checklist "Safe test profile (BTP)"). The composition root creates:

| State | Where it is created (`2af0904d`) | Note |
|---|---|---|
| `agent-runs.json` (run registry) | `local/index.ts:538` `new AgentRunRegistry(path.join(dataDir,'agent-runs.json'))` | whole-file JSON (F-DUR-02); becomes the run store in W1-PR2 (MIG-01) |
| `personal.mind` (SQLite) | `local/index.ts:565-566` `new MultiMind(personalPath)` | carries both semantic memory **and** execution state: cron tables and `pending_actions` ([MIG §1.1](../plans/WAGGLE-MIGRATIONS-v1.2.en.md)) |
| `CronStore` over `personal.mind` | `local/index.ts:585` `new CronStore(multiMind.personal)` | routines, leases, `pending_actions` |
| `HarnessTraceBridge` | `local/index.ts:612-616` (without a context resolver) | writes `execution_traces` |
| `workspaces/<id>/workspace.mind` | `hive-mind-core/src/workspace-manager.ts:139-140` | minds isolation (D-12) |
| `{dataDir}/personas/*.json`, `behavioral-overrides/*.json` | evolution deploy (`evolution-deploy.ts`) | override files (MIG-03) |
| `config.json` (`tier`, `trialStartedAt`) | 5 readers, 3 writers (F-TK-07) | read-compatible via `parseTier` |

**Ports.** By default the sidecar uses `WAGGLE_PORT` 3333 (`service.ts:124-127`), and the Teams server uses `PORT` 3100 (`packages/server/src/config.ts:13`). The installed desktop prefers 3333 (`app/src-tauri/src/lib.rs:103`). Isolation for agents and tests is prescribed in DP-0.08 and in the checklist ("Env isolation"). Tests are never run against `~/.waggle`.

---

## 2. Hotspot files and merge owners (DP-0.14, roles not names)

Two PRs that touch the same hotspot are not merged on the same day without an integration test.

| Hotspot | Merge owner |
|---|---|
| `packages/server/src/local/routes/chat.ts` + `chat-*.ts` (and `packages/server/src/local/chat-collaboration.ts`) | Harness/Chat owner (DP-0.14; compound label = two roles). Wave rows list only Chat owner: open question, see below the table |
| `packages/agent/src/agent-loop.ts` + `loop-gates.ts` | Harness owner |
| `packages/agent/src/orchestrator.ts` + `prompt-assembler.ts` | Memory owner |
| `packages/server/src/local/index.ts` | Server owner |
| `packages/shared/src/tiers.ts` + `packages/server/src/middleware/assert-tier.ts` | Boundary owner |
| `packages/agent/src/workflow-harness.ts` + `workflow-tools.ts` | Harness owner in W0 → **Durable owner from W1** |
| `packages/core/src/cron-store.ts` + `packages/server/src/local/cron.ts` | Durable owner |
| `packages/hive-mind-core/src/**` | Memory owner + OSS drift duty (`CLAUDE.md` §7.5) |

**Open question: who approves merges of the chat hotspot** (UNKNOWN). For `chat.ts` + `chat-*.ts`, DP-0.14 lists `Harness/Chat owner`, and those are two roles. Delivery §2 W0 "Hotspot merge owner (per DP-0.14)" nevertheless lists only Chat owner for `chat.ts` (PR9), `chat-agent-run.ts` (PR8) and `chat-collaboration.ts` (PR11). The "Hotspot merge owner" rows of W1, W2, W3, W3e, W4, W5 and B1–B3 do the same, as do the "Hotspot owner" rows in §5–§9 of this document, which copy them. The plan does not say whether the Harness owner co-approves the merge, and the handoff does not choose silently. The question goes to the tech lead and the founder per [02 §10](02-WORKING-AGREEMENT.en.md) and must be resolved before the first merge of a PR that touches these files (W0-PR8, W0-PR9, W0-PR11). The SAFE checklist (the item on hotspot files) lists the same files, but does not name the role.

The canonical list of roles is Harness, Chat, Durable, Memory, Server, Boundary, Capability, Security, External-executor, Evolution, Model/Runtime, UX, Attention, Channels, Benchmark, Release and OSS/License owner. The founder decides only on the decision queue and external gates. All of this is a PROPOSAL (brief §15.3).

---

## 3. Harness and verification

**What it does today.** Harness phases are driven by the **model**: it calls the `run_harness` tool and self-reports `phase_output.tool_calls`. The server has no phase executor (F-DUR-13). Run state lives in an in-memory `Map` and does not survive a restart.

**Key files** (all exist at `2af0904d`):

| File | Role |
|---|---|
| `packages/agent/src/workflow-harness.ts` | `HarnessRunState` (`:110-128`), `PhaseStatus` (`:23`), `PhaseOutput.toolCalls` (`:76`), `advancePhase` state machine (`:213-374`), global `harnessEvents` (`:132`), `shouldSkipVerify` (`:474-482`) |
| `packages/agent/src/workflow-tools.ts` | `run_harness`/`compose_workflow` tools (`:84-119`, `:362-434`), in-memory `activeHarnessRuns` (`:447`), self-reported `phase_output` (`:330-358,412-422`) |
| `packages/agent/src/builtin-harnesses.ts` | deterministic gate helpers (`:13-89`), 3 built-in harnesses (`:94-259`, including `code-review-fix` `:138`), `VERDICT` regex (`:125-128`), bash gate (`:181`) |
| `packages/agent/src/verification-gate.ts` | `VERIFICATION_TOOL_EXACT` (`:25-39`; `'run_harness'` at `:33`), D3 `assertsUnverifiedCompletion` (`:220-239`) |
| `packages/agent/src/loop-gates.ts` | D3 disclosure (`:902-935`), budget stop (`:697`) |
| `packages/agent/src/harness-trace-bridge.ts` | `harness:phase:complete` → `'verified'` (`:91`), `ok:true`/`durationMs:0` (`:125-148`), per-event context resolver (`:54-56,80-86`) |
| `packages/agent/src/trace-recorder.ts` | `completeToolCall` (`:142-166`); `ok:true` hardcoded (`:281,288`) |
| `packages/agent/src/eval-dataset.ts` | `positiveOutcomes` (`:66,208`), `build()` with secret scan and split (`:96-145,207-325`), `redactSecrets` (`:133`) |
| `packages/agent/src/system-tools.ts` / `system-tools-helpers.ts` / `tool-executor.ts` | the exit code is observed (`system-tools-helpers.ts:732-734`) and then discarded (`system-tools.ts:681-691`); `succeeded` (`tool-executor.ts:285-298`) |
| `packages/agent/src/task-shape.ts`, `workflow-composer.ts`, `capability-router.ts`, `feature-flags.ts` | `detectTaskShape` (`:145`) does not pick a recipe; `composeWorkflow` (`:70,99-139`); `CapabilityRouter` (`:51-186`); `ADVANCED_WORKFLOWS` (`:14`), dead `VERIFIER_AUTO_RUN` (`:26`) |
| `packages/hive-mind-core/src/mind/execution-traces.ts`, `mind/schema.ts` | `TraceOutcome` (`:20`) with `CHECK` (`execution-traces.ts:150-151`, `schema.ts:242-243`) |

**What the plan changes.** W0-PR1..PR8 (G1): verify fail-closed, `VERDICT` value, exit code, `run_harness` removed from verification, budget stop, bridge truthfulness with the `gate_passed` tag (MIG-04(A)), additive `runId`, labeled self-reported evidence. The order is mandatory: PR1 → PR8 → PR2/PR3 (Delivery plan W0 "Risk"). W1-PR4 introduces the server-driven executor, and `run_harness` becomes a thin client. W1-PR7 brings `ProofReceipt` and the `gate_passed` enum through a table-rebuild migration. W3-PR1..PR8 bring the router, the recipe registry and validators. Contracts: FRD-05.1..05.8, [ADR-01](../decisions/2026-09-27-ADR-01-conversation-work-modes.en.md) (RAT-03 before W3-PR2).

**What is preserved and why** ([harness.md §2](../plans/v1.2-evidence/phaseA/harness.en.md), 12 items). `advancePhase` is an immutable state machine and the basis of the W1 executor. The gate helpers and the 3 harnesses become "recipe v1" without deletion (W3). `run_id` scoping prevents bleed between sessions. The D3 disclosure path is preserved, as are the server-observed ledger primitives (`TraceRecorder`, `TurnToolActivity`), the supervisor that sees the exit code, `detectTaskShape` and `CapabilityRouter`. The advisory fields `allowedTools/requiresApproval/timeoutMs` (`workflow-harness.ts:47-68`) preserve semantics for W1. The configurable `positiveOutcomes` allows exclusion without a schema change. Reason: BORROW from our own code (D-17), no new engine.

**Known defects at `2af0904d`** (source: [harness.md](../plans/v1.2-evidence/phaseA/harness.en.md) + [harness.refute.md](../plans/v1.2-evidence/phaseA/harness.refute.en.md)):

| Finding | Status | Essence |
|---|---|---|
| F-HARN-01 | CONFIRMED AT REVISION | verify is skipped when `WAGGLE_AUTO_VERIFY` is not set, and `catch` returns `true` |
| F-HARN-02 | CONFIRMED AT REVISION | the regex accepts `VERDICT: FAIL`; CONDITIONAL has no policy |
| F-HARN-03 | CONFIRMED AT REVISION | any bash call passes as a test; the exit code is lost |
| F-HARN-04 | CONFIRMED AT REVISION | `run_harness` counts as a verification tool |
| F-HARN-05 | CONFIRMED AT REVISION | budget stop disables D3 (`agent-loop.ts:1531`) |
| F-HARN-06 | CONFIRMED AT REVISION (refute WEAKENED for the enum part) | completed phase → `verified`; tool records `ok:true/durationMs:0`; context null |
| F-HARN-07 | PARTIAL/UNWIRED | state is isolated per `run_id`, events are not |
| F-HARN-08 | CONFIRMED AT REVISION | the gate reads evidence supplied by the model |
| F-HARN-09 | PARTIAL/UNWIRED | the classifier exists, the harness is chosen by the model (W3, not G1) |

**Tests that pin current behavior** (paths exist):

| Test | What it pins | Fate under the plan |
|---|---|---|
| `packages/agent/tests/workflow-tools-harness.test.ts:135-179` | relies on auto-skip verify | **updated** in W0-PR1; `:82-106` survives W0-PR8 |
| `packages/agent/tests/harness-trace-bridge.test.ts:82-92,327` | `outcome === 'verified'` | **updated** in W0-PR6; `:146-156` (`toContain`) survives the additive `runId` |
| `packages/agent/tests/system-tools.test.ts:365-370` | `toContain('err')` | does not break (W0-PR3) |
| `packages/agent/tests/verification-gate.test.ts` | D3 | gets a regression test (W0-PR4) |
| `packages/agent/tests/verification-gate-loop.test.ts` | D3 in the loop | RED for W0-PR5 |
| `packages/agent/tests/agent-loop-budget.test.ts` | exact asserts | do not break (they do not match `SUCCESS_ASSERTION`) |
| `packages/agent/tests/task-shape.test.ts`, `workflow-composer.test.ts`, `capability-router.test.ts`, `eval-dataset.test.ts`, `trace-recorder.test.ts` | module coverage | content not read in this pass: run them before and after the change |

**Hotspot owner:** Harness owner. From W1, `workflow-*` moves to the Durable owner. `execution-traces.ts`/`schema.ts` belong to the Memory owner (drift baseline).

---

## 4. Agent loop and chat route

**Flow** ([ARCHITECTURE.md](../ARCHITECTURE.md), "Chat Message Flow"): `POST /api/chat` → turn preparation (recall, persona, tools, governance) → `runAgentLoop()` → SSE events → turn completion (signals, trace). Today, closing the SSE socket **aborts** the run (R3-008, intentional).

| File | Role |
|---|---|
| `packages/agent/src/agent-loop.ts` | the loop; `budgetStopResponse` (`:895-920`), budget stop branch (`:1507-1550`, `enableVerification:false` `:1531`), AbortSignal (`:125-126,973-975,1090-1108,1458-1468`), verification gate call (`:1826`) |
| `packages/server/src/local/routes/chat.ts` | the route; `resolvePersona` (`:439-440`), `systemPromptCache` (`:993`), "# User Corrections" (`:1485-1496`), socket close → abort (`:1604-1612`) |
| `packages/server/src/local/routes/chat-turn-preparation.ts` | recall (`:237`), `detectTaskShape` (`:381`), persona filter (`:454,530,553`), governance fail-closed (`:694-738`), CapabilityRouter (`:1101-1117`); the W3-PR2 router and the W4-PR1 envelope enter here |
| `packages/server/src/local/routes/chat-agent-run.ts` | SSE `step` channel (`:155-199`), `onToolResult` (`:214-225`) |
| `packages/server/src/local/routes/chat-turn-completion.ts` | `analyzeAndRecordCorrection` (`:253-261`), `finalizeOnce` (`:371-383`) |
| `packages/server/src/local/routes/chat-approval-hook.ts` | approval hook; abort/timeout → `resolve(false)` (`:81,123`), deny (`:496-506`) |
| `packages/server/src/local/routes/chat-governance.ts` | `blockedTools` chain, team-only (`:73-134`, `:87-89`) |
| `packages/server/src/local/routes/chat-turn-recall-context.ts`, `chat-turn-execution-trace.ts`, `chat-bounded-read-tools.ts` | recall render, per-turn trace, bounded read tools |
| `packages/server/src/local/chat-collaboration.ts` | subagent/collab flow (`:110-128,302-308`); leak into the personal mind (`:802-814`) |
| `packages/agent/src/subagent-orchestrator.ts` | subagents (preserved, D-16) |
| `apps/web/src/components/os/apps/ChatApp.tsx`, `apps/web/src/hooks/useChat.ts` | "Stop generating" (`ChatApp.tsx:2428-2432`), handling of `step` events (`useChat.ts:925-948`) |

**What the plan changes:** W0-PR5 (budget stop in disclose-only mode + `budgetStop` meta), W0-PR8 (observed tool calls from `chat-agent-run.ts`), W0-PR9 (resolver in `chat.ts`), W0-PR11 (leak in `chat-collaboration.ts`), W0-PR16 (copy for Stop), W1-PR9 (detach ≠ cancel for `work`; R3-008 remains only for `conversation`; [ADR-03](../decisions/2026-09-27-ADR-03-detach-cancel-supersedes-r3-008.en.md), RAT-02), W2-PR1 (ContextBuilder around the existing recall callers), W3-PR2, W4-PR1/PR2 and W5-PR1 (`step` payload).

**What is preserved:** the AbortSignal chain (fetch, body read, between turns), D3 disclosure without a new turn, the approval hook and the governance chain, the SSE `step` channel and `ActivityStream` (`aria-live`), subagents without a new "fusion" product (DECISION D-16). The chat route is split into characterized slices. **Before changing it, read the "Safety Net Map" in [docs/TESTING.md](../TESTING.md)**: every extracted behavior of `chat.ts` is pinned there, with known QUIRKs (e.g. TD-CHAT-36, TD-CHAT-38).

**Known defects:** F-HARN-05 and F-HARN-08 (CONFIRMED AT REVISION); F-DUR-06 (CONFIRMED AT REVISION, intentional behavior; refute WEAKENED for the copy: it exists, but does not say what is lost); F-DUR-12 (CONFIRMED AT REVISION; refute WEAKENED citation → `packages/server/tests/tools-routes-launch.test.ts:1148-1170`); F-EVO-01 (resolver in `chat.ts`, §8); F-HM-05 (leak from `chat-collaboration.ts`, §6).

**Pinning tests:** `packages/agent/tests/agent-loop.test.ts:1981-2010` (abort), `packages/agent/tests/agent-loop-budget.test.ts`, `packages/agent/tests/verification-gate-loop.test.ts`, `packages/server/tests/local/chat-approval-hook-characterization.test.ts`, `packages/server/tests/local/chat-approval-timeout.test.ts`, `packages/server/tests/local/chat-agent-run-characterization.test.ts`, `packages/server/tests/local/persona-acceptance-prompt-budget.test.ts` (risk for W4: the tool set in the prompt changes), plus the complete list of characterizations in TESTING.md.

**Hotspot owner:** `agent-loop.ts`/`loop-gates.ts` → Harness owner. `chat.ts`, `chat-*.ts`, `chat-collaboration.ts` → Harness/Chat owner per DP-0.14, while the wave rows list Chat owner (open question, §2).

---

## 5. Durable: run registry, cron/routines, held actions

**What it does today.** `AgentRunRegistry` is a durable record of room/worker runs with an event log, in whole-file JSON. On restart **all** active internal runs become terminally `interrupted` and there is no resume (F-DUR-01, a test asserts this). Routines go through `CronStore` + `LocalScheduler`, and held actions through `pending_actions`.

| File | Role |
|---|---|
| `packages/server/src/local/agent-run-registry.ts` | `MAX_EVENTS=2_000` (`:29`), `ALLOWED_TRANSITIONS` (`:41`), pid reconcile for external tools (`:381-395`), `interruptInFlightInternalRuns` (`:510-520`), `version!==1` → empty store (`:510-537`), atomic tmp+rename with a Windows retry (`:539-574`) |
| `packages/server/src/local/routes/agent-runs.ts` | `/api/agent-runs/events?since=` + `/snapshot` + `/:id/control` (`:61-116`), zod enum (`:15`), `since`/`resetRequired` (`:20-22,73-84`) |
| `packages/shared/src/types.ts` | `COLLABORATION_RUN_STATUSES` (`:398-405`), `AGENT_RUN_STATES` (`:381-384`, does not map to run status), `Automation.status` (`:777`) |
| `packages/server/src/local/fleet-run-executor.ts`, `routes/fleet.ts`, `routes/agents.ts`, `routes/agent-groups.ts` | fleet and saved-agent runs (spawn 202, abort `:480-515`, persona snapshot `:589-591`) |
| `packages/agent/src/long-task/checkpoint.ts`, `long-task/recovery.ts`, `packages/agent/src/retrieval-agent-loop.ts` | `CheckpointStore` (`CHECKPOINT_SCHEMA_VERSION=1`), `RecoveryRunner` (0 production callers), cross-process resume of the retrieval loop |
| `packages/server/src/local/held-action-executor.ts` | atomic claim; ADR comment "never mid-run suspend/resume" (`:6-10`); a crash between `approved` and execution leaves `approved` forever (`:233-235`) |
| `packages/core/src/cron-store.ts` | `PendingActionRow` (`:88-100`), `computeNextRun`/`getDue` (`:203-206,367-382,442-447`), held queue (`:505-586`) |
| `packages/server/src/local/cron.ts` | `LocalScheduler` (`:19,90`), tick and lease (`:245-314,366-389`) |
| `packages/server/src/local/loop-executor.ts` | Loop L1/L2 (TOOLLESS maker, judge gate, one held proposal; `:212-230,311-322`) |
| `packages/hive-mind-core/src/mind/awareness.ts` | `toContext()` (`:142-168`) renders `- Loop: <name>` into recall |
| `packages/server/src/local/routes/automations.ts`, `routes/cron.ts`, `apps/web/src/components/os/apps/AutomationCenterApp.tsx` | `/api/automations*` (emits only `active|paused`, `:128-148`); Automation Center UI |
| `apps/web/src/components/os/apps/RoomApp.tsx`, `apps/web/src/lib/room-state-reducer.ts`, `apps/web/src/components/os/apps/ApprovalsApp.tsx` | UI consumers of the status and the held queue (`RoomApp.tsx:51-66`, `ApprovalsApp.tsx:182,301`) |
| `packages/server/src/local/index.ts` | executor for 8 `job_type` kinds (`:1913-2706`), Loop producer (`:2588-2648`), `memory_compact` (`:2033-2058`); `setup-crons.ts:35` `30 3 * * *` |

**What the plan changes.** W0-PR14 (RED repro for `getDue` ISO-vs-`datetime('now')`), W0-PR19 (golden legacy-datadir fixture; the path `tests/fixtures/legacy-datadir/` is a PROPOSAL, the generator is UNKNOWN until design) and all of W1: PR1 spike (Reflow vs minimal BUILD) → PR2 run store → PR3 status map → PR4 executor → PR5 lease/fencing → PR6 `ToolAction`/`ToolAttempt` → PR7 `ProofReceipt` → PR8 per-run bus → PR9 detach → PR10 Loop state → PR11 routines → PR12 crash-injection (dev) → PR13 MIG-09 runner → PR14 export/erasure → PR15 `revocations.json`. Then W5-PR2/PR3 (UI statuses and the Routines block). Contracts: FRD-02.1..02.5, FRD-04.x, FRD-09.3..09.5; [ADR-02](../decisions/2026-09-27-ADR-02-durable-store-phase-resume-action-idempotency.en.md) and ADR-03 (RAT-02 before the W1-PR2 merge), [ADR-07](../decisions/2026-09-27-ADR-07-routines-vs-toolless-loops.en.md) (RAT-06 before W1-PR11); migrations MIG-01, MIG-02, MIG-08, MIG-09. The risk is **HIGH** (Delivery plan W1): PR4 goes behind a feature flag.

**What is preserved and why** ([durable.md §2](../plans/v1.2-evidence/phaseA/durable.en.md)). `AgentRunRegistry` remains an adapter, and the `/api/agent-runs/*` API is retained. Also preserved: the atomic persist pattern, pid reconcile (the precedent for surviving a restart), `CheckpointStore`/`RecoveryRunner` (BORROW), the held-action atomic claim (the starting point for DIR-06), the AbortSignal chain, CronStore with leases/5-strike/history, Loop L1/L2 TOOLLESS, Automation Center and the daily spend ledger. `COLLABORATION_RUN_STATUSES` is **not shortened**: the zod enum, `RoomApp.tsx` and `routes/agents.ts:149-160` depend on it (FRD-02.12). "L2 assist stays TOOLLESS" is a HISTORICAL FOUNDER DECISION (memory, 2026-06-29), aligned with brief §11.5/C15.

**Known defects** ([durable.md](../plans/v1.2-evidence/phaseA/durable.en.md), [durable.refute.md](../plans/v1.2-evidence/phaseA/durable.refute.en.md)):

| Finding | Status |
|---|---|
| F-DUR-01 restart → terminal `interrupted` | CONFIRMED AT REVISION |
| F-DUR-02 whole-file JSON, no migration/retention | CONFIRMED AT REVISION (refute WEAKENED: the `resetRequired` false branch is tested) |
| F-DUR-03 10 states, `paused` without semantics | CONFIRMED AT REVISION |
| F-DUR-04 checkpoint/recovery unwired | PARTIAL/UNWIRED |
| F-DUR-05 held actions without `unknown_outcome` or a provider key | CONFIRMED AT REVISION; PARTIAL for DIR-06 |
| F-DUR-06 socket close aborts the run | CONFIRMED AT REVISION (intentional, R3-008) |
| F-DUR-07 per-run budget does not exist in the checkpoint | PARTIAL/UNWIRED |
| F-DUR-08 `harnessEvents` without `runId` | CONFIRMED AT REVISION |
| F-DUR-09 Loop state in Awareness enters recall | CONFIRMED AT REVISION (refute HOLDS+) |
| F-DUR-10 misfire implicit, lease without fencing, no timezone; hypothesis that `getDue` returns nothing | CONFIRMED AT REVISION (policy); AUDIT FINDING — TO VERIFY (`getDue` probe, W0-PR14); UNKNOWN (DST) |
| F-DUR-11 Automation Center already covers most of it | CONFIRMED AT REVISION; PARTIAL for "block state" |
| F-DUR-12 background tied to the parent turn | CONFIRMED AT REVISION |
| F-DUR-13 no server-driven executor | CONFIRMED AT REVISION (absence) |
| F-DUR-14 TD-CHAT-46 ledger anchor stale (`docs/TECH-DEBT.md:65`) | ALREADY CLOSED (code) + AUDIT FINDING — TO VERIFY (ledger); goes into W0-PR15 |

**Pinning tests:**

| Test | What it pins | Fate |
|---|---|---|
| `packages/server/tests/local/agent-run-registry.test.ts:84-94` | terminal semantics of `interrupted` | remains: resume goes through an explicit API (W1-PR5), not through changing `ALLOWED_TRANSITIONS` |
| `packages/server/tests/local/agent-run-registry.test.ts:104-105` | `resetRequired` false branch | remains; overflow and corrupt-load tests are missing (W1-PR2) |
| `packages/server/tests/local/cron-scheduler-hardening.test.ts:227-250` | lease/sweep | does not assert `next_run_at` → does not break (W0-PR14) |
| `packages/server/tests/local-scheduler.test.ts`, `packages/server/tests/local/cron-error-handling.test.ts`, `packages/server/tests/local/automations.test.ts`, `packages/core/tests/cron-store.test.ts` | scheduler, errors, alias layer, store | none of them exercises a real `create()→getDue()` (which is why W0-PR14 RED exists) |
| `packages/server/tests/local/loop-executor.test.ts` | L1/L2 | regression for W1-PR10 |
| `packages/agent/tests/long-task-loop-integration.test.ts:221-330` | cross-process resume (unit = LLM turn) | BORROW reference for W1 |
| `packages/server/tests/tools-routes-launch.test.ts:1148-1170` | external run survives a restart | precedent for W1-PR9 |
| `packages/server/tests/local/held-action-executor.test.ts`, `packages/server/tests/local/approval-held.test.ts` | held queue | extended in W1-PR6 |
| `apps/web/src/test/phase3b-automation-center.test.tsx`, `apps/web/src/lib/room-state-reducer.test.ts` | UI | regression for W5 |
| `packages/server/tests/local-mode.test.ts:1067-1075` | daily spend survives a restart | remains |

**Hotspot owner:** Durable owner (`cron-store.ts`, `cron.ts`, `workflow-*` from W1). `local/index.ts` → Server owner. Detach in `chat.ts` → Chat owner.

---

## 6. Hive Mind: recall, prompt assembler, hooks, memory MCP, external executors

**What it does today.** `recallMemory` is a 7-lane engine with a RAWDETAIL lane. It has pin tests and LoCoMo 86.49% pinned offline (`benchmarks/results/locomo-sota-2026-06/recount.mjs`, EXPECT 1332/1540; "SOTA" status = AUDIT FINDING — TO VERIFY). There is no `ContextPackage`/`ContextBuilder`/`WAGGLE_CONTEXT_INJECTED` (F-HM-08). Workspace run summaries leak into the personal mind in **four** places (F-HM-05).

| File | Role |
|---|---|
| `packages/agent/src/orchestrator.ts` | `recallMemory` (`:582-978`), exclusion of `temporary`/`deprecated` (`:728-737`), render line (`:839-856`), RAWDETAIL reader (`:873`), reranker default ON (`:70-86,554-580`), stale comment (`:106-109`) |
| `packages/agent/src/prompt-assembler.ts` | W4.5 single-render of the recall block (`:433-457`), `FRAME_LIMITS` (`:118,165-169,369-489`) |
| `packages/agent/src/context-loader.ts` | exclusion of `temporary` (`:77-89`) |
| `packages/agent/src/tools.ts` | `save_memory` B1 guardrail and cross-mind dedup (`:405-515`) |
| `packages/hive-mind-core/src/hook-runtime.ts` | write path: scoped `resolveMind`, ingress guard, dedup (`:121-225`); read path `recallHookFrames` (`:227-258`) filters **only** `deprecated` |
| `packages/hive-mind-core/src/memory-ingress-guard.ts`, `injection-scanner.ts` | `evaluateExternalMemoryIngress`, `scanForInjection` |
| `packages/hive-mind-core/src/multi-mind.ts`, `workspace-manager.ts` | personal/workspace minds; layout `workspaces/<id>/` |
| `packages/hive-mind-core/src/mind/frames.ts` | content-hash dedup (`:109-111,289-294`), `compact()`: TTL `temporary` 30 d, `deprecated` 90 d (`:404-483`, `:427-433`) |
| `packages/hive-mind-core/src/mind/raw-detail-lane.ts`, `mind/inprocess-reranker.ts`, `harvest/raw-turns.ts` | RAWDETAIL (kill switch `WAGGLE_RAWDETAIL`) and reranker (`WAGGLE_RERANKER=0`) |
| `packages/hive-mind-hooks-core/src/handlers-core.ts`, `packages/hive-mind-hooks-claude-code/src/hooks/session-start.ts` | hook lifecycle (recall+inject `:77-90`, PreCompact `:237`); claude-code has its own copies (`session-start.ts:46-60`) |
| `packages/hive-mind-shim-core/src/cli-bridge.ts` | `WAGGLE_WORKSPACE_ID` → active workspace (`:240,404-408`) |
| `packages/memory-mcp/src/**`, `packages/hive-mind-mcp-server/src/**` | two live MCP servers; `erase` exists in only one (F-HM-17; merging DEFERRED, FRD-07.9) |
| `packages/server/src/local/executor-brief.ts` | bounded, redacted, scanned brief with a hash (`:46-154`) |
| `packages/server/src/local/routes/external-tool-runs.ts` | `/api/tools/run` (`attribution.briefHash` `:103`), self-reported `toolsUsed` (`:922-932`), `recordResultToMinds` (`:941-1005`, leak `:964-977`) |
| `packages/agent/src/external-process-env.ts`, `external-tool-runner.ts`, `tool-launcher.ts` | fail-closed env allowlist (`:29-35`, `WAGGLE_RUN_ID` already at `:31`), redaction in event text |
| `packages/server/src/local/routes/route-proposals.ts` | the only path that currently hands a brief to an external executor (`:205-211`) |
| `packages/weaver/src/consolidation.ts`, `packages/server/src/local/memory-lane-cron.ts`, `packages/server/src/local/dream-journal.ts` | consolidation and dedup; `memory_compact` record (`dream-journal.ts:75-77`) |
| `scripts/oss-drift-check.mjs`, `scripts/oss-drift-baseline.json` | OSS drift gate (not in CI) |

**What the plan changes.** G1: W0-PR10 (hook read path trio: exclude `temporary`, scan per hit, redact secrets), W0-PR11 (leak in 4 places + redefinition of the fleet policy gate `fleet-run-executor.ts:101-106`), W0-PR15 (only the comment `:106-109`), W0-PR18 (MIG-05(i): the label `metadata.recallExcluded`, **never** `importance='temporary'`, because the nightly `compact()` would delete it; exact files UNKNOWN until design). G2: W2-PR1..PR10. Key point: **W2-PR3 changes the bytes of the recall block**, so the LoCoMo same-judge check must pass before merge (process gate, DQ-04 budget). Contracts: FRD-02.7, FRD-07.1..07.9; [ADR-05](../decisions/2026-09-27-ADR-05-rawdetail-context-hook-precedence.en.md) (RAT-04 before W2-PR1; W0-PR10/PR11/PR18 do not wait); MIG-04, MIG-05, MIG-08.

**What is preserved and why.** `recallMemory` **remains the engine** and is only wrapped. This is DECISION D-12 ("no rewrite of the memory engine") and DIR-09. Also preserved: minds isolation (D-12, AT-13), RAWDETAIL, the reranker, the executor brief, fail-closed env, the write-side ingress guard, the workspace layout, extraction dedup and the isolation pin tests ([hivemind.md §2](../plans/v1.2-evidence/phaseA/hivemind.en.md)). Every change in `packages/hive-mind-core/**` lands here first, and the mirror gets a curated forward-port later (`CLAUDE.md` §7.5). Before any hive-mind release, run `node scripts/oss-drift-check.mjs <mirror>`. State at the revision: exit 1, 22 blockers, 3 unreviewed (F-REL-07).

**Known defects** ([hivemind.md](../plans/v1.2-evidence/phaseA/hivemind.en.md), [hivemind.refute.md](../plans/v1.2-evidence/phaseA/hivemind.refute.en.md)):

| Finding | Status |
|---|---|
| F-HM-01 RAWDETAIL active, indexes only harvest; the reranker is not bundled | CONFIRMED AT REVISION; offline consequence AUDIT FINDING — TO VERIFY (W2-PR9) |
| F-HM-02 hooks store the prompt as `temporary` | CONFIRMED AT REVISION (refute WEAKENED: `compact` exists, S1 "no compact" refuted) |
| F-HM-03 `temporary` excluded on the Waggle side, but not on the hook/MCP side | PARTIAL/UNWIRED |
| F-HM-04 hook read path does not scan | CONFIRMED AT REVISION |
| F-HM-05 workspace → personal leak in 4 places | CONFIRMED AT REVISION (WEAKENED at the minimalChange level: policy gate + ≥5 tests) |
| F-HM-06 trust labels are not in the render line | CONFIRMED AT REVISION (WEAKENED) |
| F-HM-07 token budget only at the assembler level | PARTIAL/UNWIRED |
| F-HM-08 no `ContextPackage`; possible double injection | CONFIRMED AT REVISION |
| F-HM-09 engine with 7 lanes (asset) | CONFIRMED AT REVISION |
| F-HM-10 fleet/harness/subagent without multi-lane recall | PARTIAL/UNWIRED |
| F-HM-11 handoff only on the route-proposal path | PARTIAL/UNWIRED |
| F-HM-12 run id does not reach hook frames | PARTIAL/UNWIRED |
| F-HM-13 key leakage (one hole) | CONFIRMED AT REVISION |
| F-HM-14 external `toolsUsed` is self-reported | PARTIAL/UNWIRED |
| F-HM-15 a LoCoMo gate before merge does not exist | PARTIAL/UNWIRED (per the refuter; manual process, no CI gate) |
| F-HM-16 no dedup key `(runId, outputHash)` | PARTIAL/UNWIRED |
| F-HM-17 two MCP servers | CONFIRMED AT REVISION; merging DEFERRED |
| F-HM-18 no checkpoint-bound context | PARTIAL/UNWIRED |

**Pinning tests:**

| Test | Fate |
|---|---|
| `packages/server/tests/local/external-tool-runs.test.ts:259`, `packages/server/tests/local/agent-groups.test.ts:362`, `packages/server/tests/local/fleet-isolation.test.ts:203,496-525` | **pin the leak as desirable: they break and are rewritten in W0-PR11** (`fleet-isolation.test.ts:519-522` survives if the label remains) |
| `packages/hive-mind-core/tests/hook-runtime.test.ts:126-137` | does not pin the inclusion of `temporary` → safe for W0-PR10 |
| `packages/hive-mind-hooks-claude-code/tests/hooks/session-start.test.ts` (+ codex/cursor/hermes variants), `packages/hive-mind-hooks-core/tests/handlers-core.test.ts` | AUDIT FINDING — TO VERIFY: they may pin the exact injection string |
| `packages/agent/tests/r2-recall-closure.test.ts:27-40` | pins the exclusion of `temporary` in Waggle recall; remains |
| `packages/agent/tests/w46-rawdetail-recall.test.ts`, `w41-temporal-recall.test.ts`, `orchestrator-recall-hardening.test.ts`, `packages/hive-mind-core/tests/mind/raw-detail-lane.test.ts` | engine pins; stay green through W2 |
| `packages/agent/tests/orchestrator-memory-boundary-pins.test.ts`, `packages/server/tests/local/memory-stats-isolation.test.ts`, `packages/agent/tests/subagent-isolation.test.ts` | isolation; remain, sentinel AT-13 is added |
| `packages/server/tests/local/executor-brief.test.ts`, `packages/hive-mind-shim-core/tests/cli-bridge.test.ts`, `packages/hive-mind-core/tests/mind/erasure.test.ts` | handoff, workspace env, erasure; regression for W2-PR2/PR6 |
| `vitest.setup.ts:25-26` | the reranker is **OFF in tests**: test results are not the same as production recall |

Phase-A did not execute these tests (repo read-only). The command that phase-A recommends for the first pass is in [hivemind.md §3](../plans/v1.2-evidence/phaseA/hivemind.en.md).

**Hotspot owner:** `orchestrator.ts`/`prompt-assembler.ts`/`hive-mind-core/**` → Memory owner. `chat-turn-preparation.ts` → Chat owner. `external-*.ts` → External-executor owner.

---

## 7. Capabilities: capability resolver, marketplace, connectors, approvals, IM channels

**What it does today.** There are four independent engines without a facade (F-CAP-11), and none of them filters by permissions before ranking (F-CAP-01). The install path is already constrained: the starter-pack and the marketplace proposal go behind `install_capability` ALWAYS_CONFIRM + SecurityGate (F-CAP-06). The approval stack exists and is tested. Approval via IM channels is documented as "Not in v1" (`docs/plans/CHANNELS-ARC-2026-07-09.md:23`).

| File | Role |
|---|---|
| `packages/agent/src/capability-acquisition.ts` | `searchCapabilities` (`:187`), `CapabilityCandidate` (`:27-36`), sort (`:299-311`), `validateInstallCandidate` (`:447`) |
| `packages/agent/src/capability-router.ts` | unknown-tool fallback (called from `tool-executor.ts:143-151`) |
| `packages/server/src/local/routes/agent-search.ts` | `scoreConnectors` (`:56`), "D3" comment (`:79`; S1 incorrectly cited `apps/web/src/lib/agent-search.ts:81`), merge (`:158`) |
| `packages/agent/src/skill-tools.ts` | `install_capability` (`:484-580`), skill promotion that is always rejected (`:755-765`) |
| `packages/server/src/local/persona-tool-filter.ts` | `applyPersonaToolFilter`/`filterMcpToolsForPersona` (`:98-153`) |
| `packages/agent/src/confirmation.ts`, `trust-model.ts` | approval classification (`confirmation.ts:337-358`), `assessTrust` |
| `packages/server/src/local/routes/capability-proposals.ts` | server-issued proposal store, claim-once, TTL (`:35-101,232-268`) |
| `apps/web/src/components/os/apps/chat-blocks/CapabilityRequestCard.tsx`, `capability-request-parser.ts` | card: returns `null` for connector/mcp (`:94-99`); the HTML comment is parsed with a regex |
| `packages/server/src/local/routes/oauth.ts` | loopback OAuth, CSRF `state` (`:64-71,137-150,200-209,290-311`); **no PKCE and no binding to the run** |
| `packages/server/src/local/routes/approval.ts`, `approval-grants.ts`, `held-action-executor.ts`, `routes/chat-approval-hook.ts` | `/api/approval/*` (not tier-gated), `ApprovalGrantStore.revoke` (`approval-grants.ts:286`), `DELETE /api/approval/grants/:id` (`approval.ts:120`) |
| `packages/server/src/local/command-registry.ts` | closed `ACTION_REGISTRY` (4 actions, `:108-192`), only for the NL command bar |
| `packages/marketplace/src/installer.ts`, `security.ts`; `routes/marketplace.ts`, `routes/mcps.ts`, `routes/connectors.ts` | install + SecurityGate + audit |
| `packages/agent/src/connector-registry.ts`; `packages/agent/src/connectors/{gmail,gcal,outlook,slack}-connector.ts`; `packages/server/src/local/connector-harvest.ts` | connectors (E2E not verified: PARTIAL); injection scan on ingest (`connector-harvest.ts:189-191`) |
| `packages/server/src/local/channels/{manager,pairing,chat-client,routes}.ts` | IM: deny-by-default, `/pair`, in-memory pairing code (`pairing.ts:95-123`), `APPROVAL_NEEDED_REPLY` (`chat-client.ts:11-13`) |
| `packages/core/src/install-audit.ts`, `packages/core/src/vault.ts` | install audit trail; vault (`:286` hook for the revocation ledger, W1-PR15) |
| `THREAT_MODEL.md` (root) | 175 lines; does not cover the inline install boundary, the MCP binary, egress profiles or PostHog (AUDIT FINDING — TO VERIFY, W4-PR7) |

**What the plan changes:** W4-PR1..PR7 in G2 (envelope, `filterCandidates` facade before `sort`, typed `CapabilityRequest`, `BLOCKED_CAPABILITY` resume, OAuth state + PKCE, negative grant and revoke test, THREAT_MODEL addendum), W4-PR8 in G3 (`ActionDescriptor`), W7-PR1..PR7 in G3 (WorkItem, sync; depends on DQ-06), W8-PR3/PR4 in G3 (Telegram approve token, PROPOSAL conditional on DQ-07). Contracts: FRD-06.x, FRD-09.1/09.2, FRD-11.2; [ADR-04](../decisions/2026-09-27-ADR-04-inline-capability-oauth.en.md) (RAT-07 before W4-PR3). New durable W4 stores must have a MIG-06/MIG-08 mapping from day one, otherwise the PR does not pass.

**What is preserved and why** ([capability.md §2](../plans/v1.2-evidence/phaseA/capability.en.md), 16 items). The engines stay, and only a **contract** joins them (facade, DIR-11), not a physical merge. Installation stays in Settings with SecurityGate. Also preserved: the approval stack, the governance chain (team-only, not moved into a "tier" step), injection defense, the pairing/allowlist format (`channels.json`) and the fabrication prohibition in `behavioral-spec.ts:303-317`. D-10 says: inline does not mean that OAuth or secrets are processed in LLM text. D-01 says: Approvals are core for the individual user.

**Known defects:** F-CAP-01 (CONFIRMED AT REVISION), F-CAP-02 (CONFIRMED AT REVISION, with a path correction), F-CAP-03 (CONFIRMED as a fact / PARTIAL as a defect), F-CAP-04 (PARTIAL/UNWIRED), F-CAP-05 (per sub-item; the hook read path returns `temporary` = a new hole), F-CAP-06 (PARTIAL), F-CAP-07 (CONFIRMED AT REVISION: Approvals and cost behind TEAMS), F-CAP-08 (PARTIAL/UNWIRED), F-CAP-09 (ALREADY CLOSED partially: expiry and revoke exist, decline is one-shot), F-CAP-10 (CONFIRMED, intentionally excluded in v1), F-CAP-11 and F-CAP-12 (CONFIRMED AT REVISION), F-CAP-13 (PARTIAL/UNWIRED).

**Pinning tests** (`it(` count per phase-A): `packages/agent/tests/capability-acquisition.test.ts` (20), `packages/agent/tests/capability-acquisition-trust.test.ts` (13; `:126` locks that `trust` does not affect the rank), `packages/marketplace/tests/installer-security.test.ts` (40; `:825` provenance), `packages/server/tests/local/capability-proposals.test.ts` (9), `packages/server/tests/routes/approval-flow.test.ts` (4), `packages/server/tests/local/approval-held.test.ts` (14), `packages/server/tests/local/held-action-executor.test.ts` (18), `packages/server/tests/local/chat-approval-timeout.test.ts` (4), `packages/server/tests/local/chat-approval-hook-characterization.test.ts` (15), `packages/server/tests/local/oauth-callback-escaping.test.ts` (2), `packages/server/tests/channels-manager.test.ts` (22), `packages/server/tests/channels-pairing.test.ts` (13), `packages/server/tests/routes/connectors-tier.test.ts:13-29` (connectors are not paywalled), `packages/server/tests/local/connector-registry-integration.test.ts`, `packages/agent/tests/trust-model.test.ts`, `packages/agent/tests/injection-scanner.test.ts`, `apps/web/src/test/pr4-agent-search.test.tsx`. Test "no vault values in the system prompt/trace": UNKNOWN whether it exists (W4-PR7).

**Hotspot owner:** Capability owner. `oauth.ts`/`approval-*` → Security owner. `tool-executor.ts` → Harness owner. `chat-turn-preparation.ts` → Chat owner. `channels/*` → Channels owner. `connector-harvest.ts`/`connectors/*` → Attention owner.

---

## 8. Evolution / GEPA

**What it does today.** GEPA deploy writes the persona override to disk, but chat **does not see it**. `listPersonas()` returns `[...PERSONAS, ...custom]`, and `resolvePersona` takes the first match, i.e. the built-in persona (F-EVO-01, repro [`repro-shadow.mjs`](../plans/v1.2-evidence/phaseA/repro-shadow.mjs)). The behavioral-spec override path **works** (F-EVO-11). The map "who calls → what it produces → where it is stored → next run" is in FRD-08.1.

| File | Role |
|---|---|
| `packages/agent/src/personas.ts`, `persona-data.ts`, `custom-personas.ts`; `packages/server/src/local/routes/personas.ts` | `listPersonas` (`:67-70`); custom loader with protection of built-in IDs (`custom-personas.ts:34-70`; 409/403 in `routes/personas.ts:72-74,208-210`); deploy intentionally bypasses that protection |
| `packages/agent/src/evolution-deploy.ts` | persona writer/rollback (`:68-135,277-305`; rollback 0 callers), behavioral-spec deploy (`:184-259`) |
| `packages/agent/src/evolution-orchestrator.ts`, `evolution-llm-wiring.ts`, `iterative-optimizer.ts`, `compose-evolution.ts`, `evolve-schema.ts`, `evolution-gates.ts` | running judge + GEPA guard (`evolution-llm-wiring.ts:415-452`, `iterative-optimizer.ts:173-184`), `EvolutionTarget` enum (`iterative-optimizer.ts:88-93`), stale comment (`:393-397`), `frozenSchema` is not passed through (`compose-evolution.ts:191-196`), gates (`evolution-gates.ts:99-135`) |
| `packages/agent/src/eval-dataset.ts` | `build()` without a production caller; the orchestrator uses `sourceFromTraces` (`evolution-orchestrator.ts:319-325`) |
| `packages/agent/src/agent-learning.ts`, `improvement-wiring.ts`, `improvement-detector.ts` | `AgentLearning` (0 callers), `processInteractionForImprovement` (0), `analyzeAndRecordCorrection` (live, `:81-98`) |
| `packages/server/src/local/routes/evolution.ts`, `packages/server/src/local/services/evolution-service.ts`, `routes/feedback.ts` | deploy (`:51-82`), targets (`:228-240`), baseline (`:259,269-284`), SSE run (`:437-488`); opt-in daemon (`WAGGLE_EVOLUTION_AUTO_ENABLED`); thumbs-down → signal (`feedback.ts:91-94`) |
| `packages/hive-mind-core/src/mind/evolution-runs.ts`, `improvement-signals.ts`, `execution-traces.ts` | `EvolutionRunStatus` with `CHECK` (`:23-28,95-96`), `markCorrected` (0 callers, `:473-490`) |
| `apps/web/src/components/os/apps/memory/EvolutionTab.tsx` | "deployed/score-verified" copy (`:191-249,759-771,883`), static cost disclaimer (`:1296`) |
| `packages/server/src/local/fleet-run-executor.ts:127,589-591`, `routes/agent-groups.ts:87`, `routes/fleet.ts:354` | the same `find()` pattern; fleet persona snapshot = precedent for "a run stays on its own version" |

**What the plan changes.** W0-PR9 (G1): `listPersonas()` as a Map keyed by `id` with custom last, the same resolver in all 5 places, **then** the F-EVO-10 activation check (`written_not_active`) in the same PR. The order is mandatory because `evolution-routes.test.ts:169-188` pins `deployed`. W3e-PR1..PR8 in G2: active-version pointer + rollback route + `rolled_back` (CHECK rebuild, MIG-03), `EvolutionLLM` via the router, paired scoring + drift watch, `build()` with a holdout, local evaluator + consent + cap + abort, EvolveSchema wire-or-drop, learning wiring, route test. W3e-PR9a..e is bounded recipe evolution and depends on ODB-02 (if not approved: DEFERRED). Contracts: FRD-08.x; [ADR-06](../decisions/2026-09-27-ADR-06-active-override-promotion-rollback.en.md) (RAT-05 before W3e-PR1). Every W3e PR changes persona resolution, so it requires a new **P** (persona) receipt before F2.

**What is preserved and why** ([evolution.md §2](../plans/v1.2-evidence/phaseA/evolution.en.md)): the running judge and GEPA guard (F-EVO-03 ALREADY CLOSED for production paths), the behavioral-spec pipeline (works), the `EvolutionRunStore` audit trail, gates, `EvalDatasetBuilder.build()`, the atomic override writer, custom persona protection, the live corrections flow → `# User Corrections`, `ExecutionTraceStore`, the opt-in daemon (never auto-deploy), SSE progress and the fleet snapshot. D-13: evolution is part of the product thesis and is not reduced to a demo.

**Known defects:** F-EVO-01, -02, -04, -05, -06, -07, -08, -10: CONFIRMED AT REVISION (F-EVO-07 repro: an `sk-ant-…` key reached the judge; F-EVO-08 has one WEAKENED sub-claim). F-EVO-03 and F-EVO-11: ALREADY CLOSED / works. F-EVO-09: CONFIRMED (dead code) + PARTIAL/UNWIRED; the refute pass refuted the sub-claim "only thumbs-down", because text corrections already produce signals. F-EVO-12: PARTIAL/UNWIRED. UNKNOWN: production caller of `markSurfaced` (W3e-PR7).

**Pinning tests:**

| Test | Fate |
|---|---|
| `packages/server/tests/evolution-routes.test.ts:169-188` (and `:184-188` disk-only assert) | pins `deployed`: order F-EVO-01 → F-EVO-10 in W0-PR9 |
| `packages/agent/tests/evolution-deploy.test.ts:116` | the predicate that let F-EVO-01 through; RED for AT-04 goes through `resolvePersona`/`buildSystemPrompt`, not through `find(includes)` |
| `packages/agent/tests/personas.test.ts:43-47`, `packages/server/tests/local/personas-routes.test.ts:121-140` | do not break |
| `packages/agent/tests/compose-evolution.test.ts:342-371` (and `:223,370`) | **breaks** if `combinedDelta` is removed; the plan keeps it as a field (W3e-PR3/PR6) |
| `packages/server/tests/evolution-run-route.test.ts:37-58,267-360` | stub `callCount()` exists; W3e-PR8 adds a route test |
| `packages/agent/tests/iterative-optimizer.test.ts:424-445`, `packages/agent/tests/evolution-llm-wiring.test.ts:266-330` | GEPA guard; they stay |
| `packages/agent/tests/evolution-gates.test.ts`, `packages/server/tests/services/evolution-service.test.ts`, `packages/agent/tests/evolution-orchestrator.test.ts`, `packages/hive-mind-core/tests/mind/evolution-runs.test.ts`, `apps/web/src/components/os/apps/memory/EvolutionTab.test.tsx` | regression; `EvolutionTab.test.tsx` probably pins copy that W0-PR9 changes (content not read: TO VERIFY) |
| `packages/server/tests/local/fleet-isolation.test.ts:455-485` | fleet persona snapshot; stays |

**Hotspot owner:** `routes/evolution.ts`/`evolution-service.ts` → Evolution owner. Resolver in `chat.ts:439-440` → Chat owner.

---

## 9. UX shell: Home, onboarding, ModelGate, telemetry

**What it does today.** HomeCockpit has AskBar, RecallStrip, StartHere, OvernightHero and "Pick up where you left off", but has **no** Routines block and no WorkItem list (F-UXM-13). Onboarding has 6 steps and can be resumed after an interruption. The first task is "Hello! What can you help me with?" (`OnboardingWizard.tsx:107`). Approvals is hidden behind TEAMS only in navigation, in 3 places. PostHog is opted-in by default when the key is baked in (ADR-10-K3).

| File | Role |
|---|---|
| `apps/web/src/components/os/apps/HomeCockpit.tsx`, `apps/web/src/routes/HomeRoute.tsx`, `apps/web/src/components/os/warm/{AskBar,OvernightHero,ActivityStream}.tsx` | Home (`HomeCockpit.tsx:902-1046`, AskBar `:1040-1044`), `aria-live` in ActivityStream |
| `apps/web/src/components/os/AppShell.tsx`, `Sidebar.tsx`, `apps/web/src/lib/dock-tiers.ts`, `apps/web/src/lib/command-catalog.ts` | Approvals gate (`dock-tiers.ts:82`, `AppShell.tsx:727-728`, `command-catalog.ts:89`), simple dock (`dock-tiers.ts:121-131`), "New Agent" on all tiers (`Sidebar.tsx:180-191`), "Upgrade to Team" (`command-catalog.ts:80`) |
| `apps/web/src/components/os/overlays/OnboardingWizard.tsx`, `overlays/onboarding/{ModelGateStep.tsx,constants.ts}`, `apps/web/src/hooks/useOnboarding.ts` | wizard (`:97,112-116`, `onboarding_complete` capture `:463`); `ModelGateStep.tsx` has 77 lines (the earlier citation `:107` was wrong); dead `ALL_ONBOARDING_PERSONAS`/`getPersonasForTemplate` (`constants.ts:102,125`) |
| `apps/web/src/components/os/model-gate/{ModelGate.tsx,NoModelBanner.tsx}`, `apps/web/src/hooks/useHasWorkingModel.ts` | readiness (§10) |
| `apps/web/src/components/os/apps/SettingsApp.tsx`, `apps/web/src/providers/ShellContext.tsx`, `apps/web/src/hooks/useDeveloperMode.ts`, `apps/web/src/lib/{settings,onboarding}-tier-filter.ts` | telemetry toggle (`SettingsApp.tsx:722-731`), two toggles: experience tier (`ShellContext.tsx:157`) and Developer Mode (F-UXM-08) |
| `apps/web/src/lib/posthog.ts`, `apps/web/src/lib/clerk.ts`, `apps/web/src/app-entry.tsx` | PostHog (`:39,42,49-60,72,84,114-127,133-166`), Clerk (`clerk.ts:42-43`), init (`app-entry.tsx:19-22`) |
| `apps/web/src/lib/activity-labels.ts`, `notification-copy.ts`, `apps/web/src/lib/types.ts` | centralized copy (seed for DQ-08); `StepContentBlock` (`types.ts:575-586`) |
| `apps/web/src/components/os/apps/MemoryCenterApp.tsx`, `chat-blocks/ChatWorkCanvas.tsx`, `chat-blocks/BlockRenderer.tsx` | Memory Center (`:57-67`); ChatWorkCanvas is an artifacts panel, not Work Progress |
| `apps/web/src/lib/run-status-labels.ts` | **does not exist at `2af0904d`**: created in W5-PR2 |
| `tests/e2e/runtime-a11y.spec.ts` | axe, 43 routes × 2 viewports (`:10-60`); the wizard and ModelGate are not covered |

**What the plan changes:** W0-PR12 (UI de-gate Approvals, Boundary owner), W0-PR16 (Stop copy), W0-PR17 (one telemetry toggle for the local store and PostHog, with disclosure before the first `onboarding_complete`), W5-PR1..PR7 (G2: `step` payload + View-work drawer; G3: Routines block, nav/⌘K + one advanced toggle A23, first-task artifact, Playwright baseline, axe for the wizard), W6-PR8 (wizard reorder, G3), W7-PR5 (What-Needs-Me), WB-PR5 (Team upsell copy, after DQ-03). D-07/D-08/D-09 and DIR-16: **no UI rewrite**, only additions.

**What is preserved and why** ([ux-model.md §2](../plans/v1.2-evidence/phaseA/ux-model.en.md)): the wizard, the shared ModelGate, `useHasWorkingModel` (fix, do not replace), SSE `step` + `ActivityStream`, HomeCockpit panels, Sidebar/⌘K/dock tiers, Memory Center, CronStore/Automation Center (reuse for Routines), axe e2e and the centralized copy modules. DECISION D-07: Home is preserved, not redesigned.

**Known defects:** F-UXM-07, F-UXM-13 (PARTIAL/UNWIRED); F-UXM-08, -09, -10, -14, -15 (CONFIRMED AT REVISION); F-UXM-11, -12 (CONFIRMED for the building blocks / PARTIAL for the contract and the first-task artifact); F-TK-02 (PARTIAL/UNWIRED: the gate exists only in UI navigation); ADR-10-K3 PostHog (AUDIT FINDING — TO VERIFY); F-UXM-01 installer `0.2.0` (`tauri.conf.json:4`) vs `app/package.json` `0.1.0` (CONFIRMED AT REVISION; resolved only together with DQ-01).

**Pinning tests:** `apps/web/src/lib/posthog.test.ts` (RED addition in W0-PR17), `apps/web/src/components/os/overlays/OnboardingWizard.test.tsx:13,31` (the `captureOnboardingComplete` mock stays; a disclosure assertion is added), `apps/web/src/test/p1a-routes.test.ts:232-239` (`:235` pins that FREE does not see Approvals; rewritten in W0-PR12; `p7-a6-approval-gating.test.tsx` does not pin the tier gate — CONFIRMED AT REVISION, 03 W0-PR12), `apps/web/src/lib/command-catalog.test.ts`, `apps/web/src/lib/activity-labels.test.ts`, `apps/web/src/lib/onboarding-tier-filter.test.ts:14` (the only consumer of `ALL_ONBOARDING_PERSONAS`), onboarding step tests in `apps/web/src/components/os/overlays/onboarding/*.test.tsx`, `apps/web/src/test/phase5b-usechat.test.ts`, `apps/web/src/components/os/StatusBar.test.tsx`, `tests/e2e/runtime-a11y.spec.ts`, Playwright/vision baselines (W5-PR6; cascade risk).

**Hotspot owner:** `AppShell.tsx`/`HomeCockpit.tsx`/`ModelGate.tsx`/`OnboardingWizard.tsx` → UX owner. `chat-agent-run.ts` → Chat owner.

---

## 10. Local model runtime and hardware detection

**What it does today.** "Ready" is not evidence that generation works. Cloud readiness is `verified || (!rejected && transient)` (`useHasWorkingModel.ts:174`), and local readiness is `localModelCount > 0` (`:244`). Both are false positives (F-UXM-02). Pull is `stream:false` with a timeout of 45 minutes (`local-inference.ts:330-331`). Hardware detection sees only NVIDIA, Apple and CPU (`hardware-detect.ts:330` "STAGED TAIL"). Managed Ollama is pinned to `0.32.3`, with rollback to `0.32.0`: this is **older than the first Qwen 3.8 release** (AUDIT FINDING — TO VERIFY, external.md §1). The certify model is `qwen2.5:0.5b` (`certify-windows-installer.ps1:2099`) and serves as a smoke test, not as the target.

| File | Role |
|---|---|
| `packages/server/src/local/managed-ollama-runtime.ts` | pins (`:28-29`), sha256 artifacts (`:158-237`), Range-resume download of the runtime (`:1109-1204`) |
| `packages/server/src/local/routes/local-inference.ts` | pull (`:313-332`), post-pull digest + generation probe (`:338-377`, **keep**) |
| `packages/server/src/local/hardware-detect.ts` | NVIDIA/Apple/CPU; W6-PR5 adds `detectWindowsWmi` |
| `packages/server/src/local/routes/settings.ts` | live probe route + `probeConfiguredModel` (`:103-164,844-889`) |
| `packages/agent/src/cookbook/catalog.ts`, `cookbook/model-fit.ts` | catalog without qwen3.5/3.6/3.8 (`catalog.ts:44-51`), fit rules without `qwen3.8` (`model-fit.ts:207-214`) |
| `apps/web/src/hooks/useHasWorkingModel.ts`, `apps/web/src/components/os/model-gate/ModelGate.tsx` | readiness (`ModelGate.tsx:257-261`), a single neutral error message (`:843-858`) |
| `litellm-config.yaml` | Qwen3.6-35B-A3B in the production router is a cloud DashScope route (`:211-215`); the local control goes through `benchmarks/harness/config/models.json:61-67` |

**What the plan changes:** W6-PR1..PR4, PR6, PR7 (G2): readiness truthfulness, `reason` in the probe, tool round-trip probe, pull stream + resume, Ollama repin **after online confirmation** + catalog + arch check + certify fields, hardware ladder on ≥3 profiles. W6-PR5 (WMI) and W6-PR8 (wizard) go into G3. Model tuning is B2-PR3. Contracts: FRD-10.1..10.5. Open: DQ-05 (exact model/hardware configuration; blocks W6-PR6 and B2). DECISION D-15: the target is the Qwen 3.8 27B class. The older model is a control baseline, not a silent substitute for the target.

**What is preserved:** ModelGate shared between Settings and onboarding, the live probe route, pin + sha256 + rollback, Range resume, post-pull generation probe, fit engine.

**Known defects:** F-UXM-02..05 (CONFIRMED AT REVISION); F-UXM-06 (CONFIRMED for "not re-baselined"; **UNKNOWN** whether Ollama 0.32.3 serves the `qwen3_5` architecture). No official VRAM/RAM per quant exists (UNKNOWN → measured in W6-PR7).

**Pinning tests:** `apps/web/src/hooks/useHasWorkingModel.test.ts:271-281,301-307,486-495` pins false positives, introduced intentionally in `5e2de2b8`. W6-PR1 **breaks and rewrites** them. Coverage (content not read in this pass): `packages/server/tests/local/managed-ollama-runtime.test.ts`, `packages/server/tests/local/local-inference-route.test.ts`, `packages/server/tests/hardware-detect.test.ts`, `packages/agent/tests/cookbook-model-fit.test.ts`, `apps/web/src/components/os/model-gate/ModelGate.test.tsx`, `apps/web/src/components/os/overlays/onboarding/ModelGateStep.test.tsx`, `apps/web/src/components/os/model-gate/NoModelBanner.test.tsx`.

**Hotspot owner:** `managed-ollama-runtime.ts`/`local-inference.ts` → Model/Runtime owner. `ModelGate.tsx`/`OnboardingWizard.tsx` → UX owner. A pin change changes the **I** (installer) and **R** (router) receipts.

---

## 11. Tiers, KVARK, Stripe, Teams server

**What it does today.** The code still contains a live system of 4 tiers, TRIAL/FREE/TEAMS/ENTERPRISE (F-TK-01). Actual FREE gates (F-TK-19): `embeddingProviders` without `litellm` (`tiers.ts:85`, `routes/embedding.ts:106-119`), sessions 10/25 (`tier-session-cap.ts:4`), routes `/api/cost/*`, `/api/cloud-sync/toggle`, `/api/admin/*`, `/api/team/connect`, `/api/marketplace/enterprise-packs`, `/api/team/governance/permissions` and the UI Approvals/Team zone. Ten decorative flags have 0 consumers. KVARK is not wired: `createKvarkTools` has 0 production callers, and `KvarkClient` is never instantiated anywhere (F-TK-11). This pass confirmed both with a grep at the revision.

| File | Role |
|---|---|
| `packages/shared/src/tiers.ts` | `TIERS`, `TierCapabilities`, `connectorLimit=-1` everywhere, `parseTier`/`LEGACY_TIER_MAP`/`getEffectiveTier` (`:154-197`) |
| `packages/server/src/middleware/assert-tier.ts` | `requireTier`/`readTierFromDataDir` (`:21-63`) |
| `packages/server/src/local/routes/cost.ts`, `routes/settings.ts`, `routes/team.ts`, `routes/marketplace.ts`, `routes/embedding.ts`, `packages/server/src/local/tier-session-cap.ts` | gates: `cost.ts:210,272`; `settings.ts:1192` (audit export), `:1051` (KVARK on `tier==='ENTERPRISE'`), `:1060-1090` (`PATCH /api/tier`), `:1092-1137` (start-trial); `marketplace.ts:190-208`; `team.ts:143-331` |
| `packages/server/src/stripe/{index,webhook,checkout,sync,portal}.ts` | TEAMS-only; `tierFromPriceId` PRO→FREE precedent (`index.ts:68-107`), webhook signature + idempotency (`webhook.ts:25-79,88-170`) |
| `packages/server/src/kvark/{kvark-client,kvark-auth,kvark-config,kvark-types,index}.ts`; `packages/agent/src/kvark-tools.ts` (`createKvarkTools` `:127`, `:123-296`), `combined-retrieval.ts`, `result-formatter.ts` | KVARK: code and tests exist, but production wiring does not; `handleKvarkError` has no cloud fallback (good for D-03) |
| `packages/server/src/local/routes/vault.ts` | generic vault upsert (`:153-171`): it can already accept `kvark:connection`, so a gate on the mere presence of the key is **not** sufficient (DIR-20) |
| `packages/core/src/team-sync.ts`; `local/index.ts:1440-1503,1661-1704` | team-sync push/pull into the **workspace** mind |
| `packages/server/src/index.ts`, `packages/worker/src/**` | Teams cloud server and worker; the worker has its own chat semantics (F-TK-10, C20) |
| `apps/www/app/_components/Pricing.tsx`, `apps/www/messages/en.json`, `apps/web/src/components/os/billing/PlanCards.tsx`, `apps/web/src/components/os/overlays/{UpgradeModal,TrialExpiredModal}.tsx`, `apps/web/src/components/os/apps/WorkspaceDesktopApp.tsx` | copy that still sells Team $49/seat (`en.json:196-250`, `Pricing.tsx:10-58`); PRO remnants (`PlanCards.tsx:59`) |

**What the plan changes:** W0-PR12 in G1 (de-gate Approvals in 3 UI places, `cost.ts:210,272`, `settings.ts:1192`; `tier-enforcement-matrix.test.ts` rows → `minTier:'FREE'`), WB-PR1 (inventory + review of ADR-08/09), WB-PR2 in G1 (**only** the KVARK RED test as `it.fails`, without registration), WB-PR3..PR6 in G3 (registration of 4 KVARK tools gated by `getKvarkConfig(vault)!==null && health.ok`, connect/validate/disconnect/revoke, dead tier code, `LEGACY_TIER_MAP` after DQ-03, fate of team-sync). Contracts: FRD-01.6, FRD-11.3/11.4; [ADR-08](../decisions/2026-09-27-ADR-08-individual-tiers-kvark-boundary.en.md) and [ADR-09](../decisions/2026-09-27-ADR-09-secondary-worker-parity.en.md) (RAT-08 before WB-PR3); MIG-07. **Stripe is not touched** until DQ-03: no cancellations, refunds or billing changes (DP-0.11).

**What is preserved and why** ([tiers-kvark.md §2](../plans/v1.2-evidence/phaseA/tiers-kvark.en.md)): `parseTier`/`LEGACY_TIER_MAP` (read-compatible migration of `config.json`), `requireTier` fail-closed, the tier-enforcement tripwire matrix, the Stripe webhook (signature, idempotency, atomic write), the `tierFromPriceId` precedent, the KVARK client and tools (BORROW once they are wired), `handleKvarkError` without fallback, team-sync binding, OSS export guard. DECISIONS D-01 (free for the individual user), D-02 (no Waggle Team SKU) and D-03 (KVARK on-prem only, no cloud fallback).

**Known defects:** F-TK-01, -03, -04, -05, -06, -07, -08, -09, -10, -11, -13, -14, -15, -18, -19 (CONFIRMED AT REVISION for the code; F-TK-04 stub, F-TK-05 link to the repo, F-TK-07 minor inconsistency and F-TK-13 contradictions are AUDIT FINDING — TO VERIFY); F-TK-02, -12, -17 (PARTIAL/UNWIRED); F-TK-16 (PARTIAL: the code pattern exists, the business part UNKNOWN). **UNKNOWN:** Stripe live products and active subscribers (DQ-03; requires an authorized read-only inventory).

**Pinning tests:** `packages/server/tests/tier-enforcement-matrix.test.ts` (tripwire `:43-49`; in W0-PR12 rows `:53`, `:56` → `minTier:'FREE'`, while the TRIAL/403 tests `:131-180`, which use `/api/cost/by-workspace` as the TEAMS canary, move to a route that stays TEAMS — 03 W0-PR12), `apps/web/src/test/p1a-routes.test.ts:232-239` (Approvals hidden for FREE; rewrite in W0-PR12; not in the F-TK-18 list of 21 — CONFIRMED AT REVISION), `packages/server/tests/routes/connectors-tier.test.ts`, `packages/server/tests/kvark/*.test.ts` (6 files, including `kvark-wiring.test.ts`), `packages/agent/tests/kvark-tools.test.ts`, `kvark-pipeline-smoke.test.ts`, `combined-retrieval.test.ts`, `conflict-detection.test.ts`, `packages/server/tests/stripe/{webhook,checkout,sync,status,smoke-e2e}.test.ts`, `packages/core/tests/team-sync.test.ts`, `apps/www/__tests__/Pricing.test.tsx`, `apps/www/__tests__/stripe-checkout-route.test.ts`. In total, 21 test files lock tier behavior (F-TK-18). The list is in [tiers-kvark.md](../plans/v1.2-evidence/phaseA/tiers-kvark.en.md) F-TK-18.

**Hotspot owner:** `tiers.ts`/`assert-tier.ts` → Boundary owner. Tool registration in `local/index.ts` → Server owner.

---

## 12. Release, CI, installer, licenses, pricing

**What it does today.** CI triggers only on `main` (`ci.yml:3-6`). `release.yml` triggers on **any** `v*` tag (`:12-15`), and the repo has 10 historical `v*` tags (DP-0.12). The signing chain has 6 jobs and fail-closed guards. The router and auth-canary receipt tools have no npm/CI caller. A crash-injection receipt tool does not exist (F-REL-03). There is no SBOM and no `THIRD_PARTY_NOTICES` (F-REL-04). `npm audit` is `continue-on-error: true` (`ci.yml:108-110`).

| File | Role |
|---|---|
| `.github/workflows/ci.yml` | blocking gates (`:30-106,120-146`); W0-PR0 adds `integration/**` |
| `.github/workflows/release.yml` | chain `build-windows-prebuilt → prepare-windows-signing → sign-windows → certify-windows → attest-windows → publish-windows`; certify at `:1884,1900`; **not touched** without founder review |
| `.github/workflows/tauri-build-pr.yml` | PR build; certify `:202`; W0-PR0 adds `integration/**` |
| `scripts/certify-windows-installer.ps1` | 3422 lines; clean-profile certification; `Refusing …` refusals (`:1724,1960-1962,2258,2271`) stop the run; seeds only the embedding model (`:2904`) |
| `scripts/bundle-node.mjs`, `bundle-native-deps.mjs` (`:113-130`, binaries only), `stage-sidecar-deps.mjs` (`:16-18,111`) | staging; native LICENSE text is missing (`onnxruntime-node@1.21.0`, `sqlite-vec-windows-x64@0.1.9`) |
| `scripts/qualify-smart-router.ts` (+ `.test.ts`), `scripts/test-windows-official-auth-canaries.ps1`, `scripts/seal-persona-acceptance.ts` (`npm run persona:seal`) | R, A and P receipt tools; W8-PR1 adds entry points in G1 before F1 |
| `scripts/oss-drift-check.mjs`, `scripts/oss-drift-baseline.json`, `scripts/oss-subtree-split.sh` (`:117-133` abort guard) | OSS drift (not in CI); the split script serves only for inspection |
| `app/src-tauri/tauri.conf.json` (`:4` `0.2.0`, `:21` `installMode: "currentUser"`), `app/src-tauri/src/{service.rs,lib.rs}`, `app/package.json` | Tauri; `WAGGLE_DESKTOP_PORT_FALLBACK` (`service.rs:163`), port 3333 (`lib.rs:103`) |
| `LICENSE`, `packages/optimizer/LICENSE`, `packages/weaver/LICENSE`, `packages/hive-mind-{cli,mcp-server,wiki-compiler}/NOTICE` | license contradictions (F-REL-08/F-TK-13): "proprietary" LICENSE alongside `"license":"MIT"`; NOTICE references a nonexistent `EXTRACTION.md` |
| `packages/agent/src/cost-tracker.ts`, `benchmarks/harness/config/models.json:88-89`, `packages/server/src/local/model-spend-meter.ts` | pricing table (`:24-68`): Opus 4.6/4.7/4.8 at $15/$75, fallback `:66`; feeds into the hard daily budget (F-REL-06) |
| `docs/production-readiness/09-LAUNCH_RECOMMENDATION.md`, `README.md`, `CLAUDE.md`, `AGENTS.md` | candidate doc drift (F-REL-01) → W0-PR15; the sentences on visibility and license (`CLAUDE.md:84`, `AGENTS.md:68`, `README.md:110,118`) are **exempt** until DQ-02 rules on them |
| `vitest.config.ts` (`maxWorkers: 4`, `:28`), `vitest.setup.ts`, `playwright.config.ts` (`:36-44,57,116`), `playwright-e2e.config.ts` (`:9` hardcoded `localhost:3333`), `tests/vision/_helpers.ts:13-22` | test infrastructure; E2E isolation per the checklist |

**What the plan changes:** W0-PR0 (CI filter), W0-PR13 (pricing: 4 rows + fallback + Haiku 3.5 + provenance comment; **no** cherry-pick of `fe7804bf`; updates `cost-tracker.test.ts:54-57`), W0-PR15 (doc drift), W8-PR1 (G1, before F1), W8-PR2 (G2, before F2: crash-injection receipt on the packaged build), W8-PR5/PR6 (G3), W8-PR7 (conditional, gate REL-BOOT; founder review of the `release.yml` change), OSS-PR1..PR5 (OSS-PR2 in report mode in G1; PR3/4/5 after DQ-02), W3-PR8 (cherry-pick from `origin/feature/harness-sota-bench` @ `18e5b36a` **without rebase**). Receipt and freeze rules: Delivery plan §5; release path F3a → K → F3b → public GO: §5.1. Contracts: FRD-12, FRD-13.5; [ADR-10](../decisions/2026-09-27-ADR-10-release-privacy-profiles.en.md) (RAT-09 before W8-PR6).

**What is preserved and why** ([release-oss.md §6](../plans/v1.2-evidence/phaseA/release-oss.en.md)): the signing chain and immutable guards, the certify script, staging that preserves first-party LICENSE/NOTICE, Ollama pins, the `CostTracker` reservation ledger (the logic is correct, only the table is wrong), the persona seal tool, blocking CI gates, Dependabot. Windows Solo contract (`CLAUDE.md` §1): the installed desktop must not depend on developer Node, Python, Docker, an external LiteLLM or a separately installed Ollama. That is why the τ² Python tool and Harbor/Docker stay on the bench machine (AT-30).

**Known defects:** F-REL-01, -04, -06, -10 (CONFIRMED AT REVISION); F-REL-02 (CONFIRMED / PARTIAL); F-REL-03, -08 (PARTIAL/UNWIRED); F-REL-05 (CONFIRMED for npm audit, license CI not found); F-REL-07, -09 (code CONFIRMED; live GitHub state AUDIT FINDING — TO VERIFY: repo public, `WINDOWS_PUBLIC_RELEASE_AUTHORIZED` undefined, no branch protection; visibility `public` re-confirmed read-only 30.09.2026, H-01); F-REL-11 (UNKNOWN: Authenticode and Deep Security are external gates); F-REL-12 (CONFIRMED + inventory for cherry-pick). The target official prices in W0-PR13 are AUDIT FINDING — TO VERIFY and are re-checked at merge.

**Pinning tests:** `packages/agent/tests/cost-tracker.test.ts:54-57` (pins $15/$75; updated in W0-PR13), `scripts/qualify-smart-router.test.ts`, `tests/oss-subtree-split.test.ts`, `packages/server/tests/local/model-spend-meter.test.ts`.

**Hotspot owner:** `release.yml`/`scripts/certify-*`/`scripts/{bundle-*,stage-*}` → Release owner (not touched without founder review). `oss-drift-baseline.json` → Memory owner (maintainer). Licenses → OSS/License owner. GitHub settings (rulesets, environments, secret scanning, Actions variables) are owner actions through W8 and **are not PR work** (DP-0.11).

---

## 13. How to search (mandatory discipline)

Phase-A showed repeatedly that the first claim was wrong. S1 cited `apps/web/src/lib/agent-search.ts:81` instead of `packages/server/src/local/routes/agent-search.ts:79`. S1 placed `system-tools.ts` in the server package, but it is in `packages/agent/src/`. The citation `ModelGateStep.tsx:107` pointed to a file of 77 lines. Ledger row TD-CHAT-46 is stale, and the map in `CLAUDE.md` §2 and `ARCHITECTURE.md` does not match the code (§0). **A wrong ledger row is itself a defect.** Rules:

1. **Search by capability, not by name.** Do not ask "does `ContextPackage` exist". Ask "who assembles the context for the model". The example patterns (always combine them) are in **ERE** syntax (POSIX extended: `|` is alternation, `\(` is a literal parenthesis), so run them only through `git grep -nE` or `rg`, never through a bare `git grep -n`:
   - *who writes to the personal mind:* `multiMind\.personal|createIFrame|new FrameStore\(personal|personal\.mind`
   - *who skips or fakes verification:* `shouldSkipVerify|WAGGLE_AUTO_VERIFY|VERIFIER_AUTO_RUN|VERDICT|'verified'|ok: true`
   - *tier gate (also without quotes):* `requireTier|minBillingTier|minTier|isPro|isEnterprise|TEAMS|ENTERPRISE|TRIAL`
   - *durable state:* `writeFileSync|renameSync|\.json'\)|CREATE TABLE|CHECK \(`
   - *events and channels:* `harnessEvents\.(on|emit)|eventBus\.on\(|'persona:reloaded'|sendEvent\(`
   - *env switches:* `process\.env\.WAGGLE_|VITE_[A-Z_]+`
   - *routes:* the string `'/api/<nešto>'` in `packages/server/src/**` **and** the client in `apps/web/src/lib/adapter.ts`
2. **One grep is never enough** (`CLAUDE.md` §3.5). For every symbol, cover: direct references; types (`import type`, `satisfies`, generic parameters); string literals (tool names such as `'run_harness'`, event names, SQL tables and `CHECK` values, zod enums); dynamic `import(`; re-exports and barrels (`packages/agent/src/index.ts`, `packages/*/src/index.ts`); `server.decorate('x')` → `fastify.x`/`server.x`; tests (`packages/*/tests/**`, `apps/web/src/**/*.test.ts(x)`, `apps/web/src/test/**`, `tests/e2e/**`, `tests/vision/**`); scripts and workflows (`scripts/**`, `.github/workflows/**`); documents (`docs/**`, `CLAUDE.md`, `AGENTS.md`, `docs/TECH-DEBT.md`).
3. **Grep against the revision, not against the working tree or `dist`.** Verify baseline claims with `git grep -nE '<obrazac>' 2af0904df01ca3d374cc78ba95b60dc579dd6a7a -- 'packages/*/src/**' 'apps/web/src/**'` and `git show 2af0904df01ca3d374cc78ba95b60dc579dd6a7a:<putanja>`. Without `-E`, `git grep` uses POSIX basic regex, in which `|`, `(`, `)` and `?` are literal characters. CONFIRMED AT REVISION (git 2.51): `git grep -n "from '.*/workflow-harness(\.js)?'" 2af0904d -- 'packages/*/src/**'` yields 0 matches, while the same pattern with `-nE` yields 5; `shouldSkipVerify|WAGGLE_AUTO_VERIFY` yields 0 without `-E` and 4 with `-E` (against `packages/*/src/**` and `apps/web/src/**`). Build outputs (`packages/*/dist`) may be stale. The Phase-A repro scripts read `dist` and checked that it was newer than the source.
4. **How to find callers.** (a) `git grep -nE '\bimeSimbola\b'` (or `git grep -nw 'imeSimbola'`) and discard the definition, the barrel and the tests. If 0 remain, that is "0 production callers", as in the case of `createKvarkTools`, `RecoveryRunner`, `rollbackPersonaOverride` and `markCorrected`. A zero is valid only if the pattern was run with `-E` (or through `rg`); a zero from a bare `git grep -n` over a pattern containing `|`, `(`, `)` or `?` proves nothing. (b) Find the import sites of the file: `git grep -nE "from '.*/<fajl-bez-ekstenzije>(\.js)?'"`. (c) For routes, follow the registration in `packages/server/src/local/index.ts` and the client method in `adapter.ts`, then the UI caller. (d) For agent tools, search for the tool name as a string, the persona filter (`persona-tool-filter.ts`), approval classification (`confirmation.ts`) and `selectToolsForTurn` (see the reachability note in [TESTING.md](../TESTING.md)). (e) For DB columns, search for both the SQL string and the TS type, because `CHECK` constraints require a table-rebuild migration (`execution-traces.ts:150-151`, `evolution-runs.ts:95-96`).
5. **Before a new file, grep** (`CLAUDE.md` §3.6, §8 "Already Built"). The plan has already inventoried what is borrowed from Waggle (BORROW, D-17). See [Build-vs-Borrow](../plans/WAGGLE-BUILD-VS-BORROW-v1.2.en.md) BB-01..BB-13.
6. **Line numbers shift.** After every merge to `integration/waggle-next`, re-anchor citations by symbol. In the PR description, cite `putanja:simbol` and the SHA at which the line was valid.
7. **Verification is not claimed, it is run:** `npm run build:packages` (the only authoritative tsc chain, TD-TEST-12), `npm run typecheck:server-tests`, `npm run lint`, `npm run test -- --run --maxWorkers=6` (DP-0.06). Node must be **22.23.2**, because `better-sqlite3` is built for ABI 127 ([TESTING.md](../TESTING.md), "Runtime"). These commands are run only once the plan is approved, in your own worktree and with an isolated env per the checklist (root suite until W0-PR20 is merged only in the BTP, 05 N-28). Before approval they are not run anywhere, not even in a separate fresh clone on your own machine (same rule as [00 §2](00-START-HERE.en.md) and [01 §0](01-ONBOARDING-DEV-ENV.en.md); PROPOSAL, exception only through founder question (o) in 00 §6, proposal TSA-02 in [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.en.md)).

---

## 14. UNKNOWN register for this document

The IDs `N-1..N-6` are valid only in this document. Outside it they are written as "04 N-n", because [03 §7](03-BACKLOG.en.md) and [05 §2](05-RISKS-DECISIONS-ESCALATION.en.md) have their own `N` registers with a different meaning (05 §0, "IDs are local per document").

| # | Item | Where it is closed |
|---|---|---|
| N-1 | Exact files of W0-PR18 (extension of the recall filter to the MCP/hook path) and the path of the W0-PR19 generator | PR design (Memory owner / Durable owner) |
| N-2 | Whether `session-start.test.ts` / `handlers-core.test.ts` and `EvolutionTab.test.tsx` pin the exact string that W0 changes. The W0-PR12 part was resolved on 29.09.2026: `p7-a6-approval-gating.test.tsx` does not pin the tier gate; the gate is pinned by `p1a-routes.test.ts:232-239` and `tier-enforcement-matrix.test.ts:53,56,131-180` (CONFIRMED AT REVISION; 03 W0-PR12) | first read before W0-PR10/PR9; W0-PR12 rewrites the two tests named above |
| N-3 | Whether the pinned Ollama `0.32.3` serves the `qwen3_5` architecture; official VRAM/RAM per quant | online check + W6-PR6/PR7 (DQ-05) |
| N-4 | Production caller of `markSurfaced`; whether a test "no vault values in the prompt/trace" exists; whether Claude Code `--safe-mode` suppresses SessionStart hooks | W3e-PR7, W4-PR7, W2-PR6 |
| N-5 | Whether `VITE_POSTHOG_KEY` is baked into the candidate build (depends on `apps/web/.env.local` on the build host); Stripe subscribers (DQ-03); DST behavior of routines; status of Authenticode and Deep Security | W0-PR17 checklist grep, DQ-03, W1-PR11, W8 external gates |
| N-6 | Whether a merge of `chat.ts` + `chat-*.ts` is approved only by the Chat owner (wave rows) or also by the Harness owner (DP-0.14 `Harness/Chat owner`), §2 | tech lead / founder per [02 §10](02-WORKING-AGREEMENT.en.md), before the first merge of W0-PR8/PR9/PR11; proposal: both (Chat owner and Harness owner), TSA-01 pt.2 in [TEAM-START-AUTHORIZATION](TEAM-START-AUTHORIZATION.en.md) (NOT APPROVED) |

---

## Sources

- [Delivery plan v1.2](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md): §0 (DP-0.01..DP-0.16), §2 (waves and PR tables), §6/§6.1 (DQ, RAT, ODB).
- [FRD v1.2](../Waggle_FRD_v1.2_DRAFT.en.md): §1 (layers), §2.12 (compatibility map), §15 (AT-01..AT-30 with test location and owner). [PRD v1.2](../Waggle_PRD_v1.2_DRAFT.en.md).
- Phase-A: [harness](../plans/v1.2-evidence/phaseA/harness.en.md), [durable](../plans/v1.2-evidence/phaseA/durable.en.md), [hivemind](../plans/v1.2-evidence/phaseA/hivemind.en.md), [capability](../plans/v1.2-evidence/phaseA/capability.en.md), [evolution](../plans/v1.2-evidence/phaseA/evolution.en.md), [ux-model](../plans/v1.2-evidence/phaseA/ux-model.en.md), [tiers-kvark](../plans/v1.2-evidence/phaseA/tiers-kvark.en.md), [release-oss](../plans/v1.2-evidence/phaseA/release-oss.en.md), [external](../plans/v1.2-evidence/phaseA/external.en.md), and the refute passes `*.refute.md`.
- [ADR-INDEX](../decisions/ADR-INDEX.en.md), [Migrations](../plans/WAGGLE-MIGRATIONS-v1.2.en.md), [Build-vs-Borrow](../plans/WAGGLE-BUILD-VS-BORROW-v1.2.en.md), [Benchmark protocol](../plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.en.md), [Audit disposition](../plans/WAGGLE-AUDIT-DISPOSITION-v1.2.en.md), [Open LOW findings](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.en.md), [SAFE checklist](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md).
- Repo guides: [CLAUDE.md](../../CLAUDE.md), [AGENTS.md](../../AGENTS.md) (canonical contract), [ARCHITECTURE.md](../ARCHITECTURE.md), [TESTING.md](../TESTING.md), [TECH-DEBT.md](../TECH-DEBT.md), [THREAT_MODEL.md](../../THREAT_MODEL.md), `package.json`.
- Founder brief: [Waggle_Planner_Brief_v1.0_2026-09-27.md](../plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.en.md) (§3 D-01..D-18).
