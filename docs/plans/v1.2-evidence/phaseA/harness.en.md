# Revalidation of the "harness" audit group — revision `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`

> **English translation** of [harness.md](harness.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Date:** 2026-09-27 · **Reviewed commit:** `2af0904d` (main; `git status` clean except two untracked `.docx` in `docs/`, working tree == HEAD) · **Repo treated as READ-ONLY** (only `git show/log`, file reads; repro run from the planning workspace (now `docs/plans/v1.2-evidence/`) against the already built `packages/agent/dist/`, verified that dist matches `src` at every cited line).

**Scope:** S1 spot-checks L5–L10, C8 (the run-identity part), C12 (harness statuses only), A4–A6, A11, W0, W1 (harness part); brief §6, §7, AT-01..03, AT-06.

**Status legend:** CONFIRMED AT REVISION · PARTIAL/UNWIRED · NOT CONFIRMED · ALREADY CLOSED · UNKNOWN. "Module exists" was nowhere used as evidence of an E2E function.

---

## 0. Summary

| ID | S1 claim | Status | Key evidence |
|---|---|---|---|
| F-HARN-01 | verify skipped by default and in `catch` (L5) | **CONFIRMED AT REVISION** | `workflow-harness.ts:313`, `:474-481`; repro 01a–d |
| F-HARN-02 | `VERDICT: FAIL` passes the regex (L7); CONDITIONAL without a policy | **CONFIRMED AT REVISION** | `builtin-harnesses.ts:128`; repro 02a–d; `CONDITIONAL` = 2 occurrences in the whole of `packages/`, both in that file |
| F-HARN-03 | any bash passes as a test; exit code ignored (L8, AT-02) | **CONFIRMED AT REVISION** (+ extended: the exit code is observed and then discarded in `system-tools.ts:691`) | `builtin-harnesses.ts:181`; `system-tools-helpers.ts:732-734` vs `system-tools.ts:682-693`; repro 03a–c, 08a |
| F-HARN-04 | `run_harness` = verification tool (L9) | **CONFIRMED AT REVISION** | `verification-gate.ts:33`; repro 04a–c |
| F-HARN-05 | budget stop `enableVerification:false` (L10, AT-03) | **CONFIRMED AT REVISION** | `agent-loop.ts:1531`; `loop-gates.ts:697,902-935`; repro 05a–c (mechanism) |
| F-HARN-06 | bridge: completed phase → `'verified'`, tool record `ok:true/durationMs:0`, context null | **CONFIRMED AT REVISION** | `harness-trace-bridge.ts:91,139-148`; `local/index.ts:612-616`; `eval-dataset.ts:6-7,208`; repro 06a–d |
| F-HARN-07 | global `harnessEvents` without runId (A11, AT-06) | **PARTIAL/UNWIRED** — state isolated per `run_id` since `93ff7813`, events/traces still not | `workflow-harness.ts:132,169-207`; `workflow-tools.ts:374,440-457`; repro 07a–b, 08b |
| F-HARN-08 | gates read model-supplied `phase_output.tool_calls`, not the server journal (A5) | **CONFIRMED AT REVISION** | `workflow-tools.ts:330-358,412-422`; `grep phase_output packages/server/src` = 0 |
| F-HARN-09 | harness router map: `task-shape` / `workflow-composer` / `capability-router` (W3) | **PARTIAL/UNWIRED** — the classifier exists, but harness selection is model-invoked text, not a server router | `workflow-composer.ts:99-104`; `workflow-tools.ts:84,86-119`; `chat-turn-preparation.ts:381,1101-1117` |

None of the L5–L10 findings is **ALREADY CLOSED**: S1 was written against the same revision (S1 L18 cites `main 2af0904d`), and the only fix commit touching the harness files (`93ff7813`, 2026-04-15) explicitly *keeps* the auto-skip of the verify phase ("Behavior kept: … auto-skip of 'verify' phases when WAGGLE_AUTO_VERIFY is unset") and closes only the cross-session state bleed in the `run_harness` Map (part of A11).

Repro: `docs/plans/v1.2-evidence/phaseA/repro-harness.mjs` — **25/25 claims hold** (Node v22.23.2, imported from `packages/agent/dist/*.js` built 2026-09-27 05:27; `grep` confirmed that dist contains identical lines for `env !== 'true' && env !== '1'`, `/VERDICT:\s*(PASS|CONDITIONAL|FAIL)/i`, `['bash', 'Bash', 'run_command']`, `'run_harness'`, `ok: true / durationMs: 0`, `enableVerification: false`).

---

## 1. Findings (brief §1 format)

### F-HARN-01 — `shouldSkipVerify()` default + `catch` (S1 L5; brief §7.1; AT-01, AT-03; DIR-03/07)

- **Status:** CONFIRMED AT REVISION
- **Commit:** `2af0904d`; file last changed in `93ff7813` (2026-04-15), which kept the skip intentionally.
- **Path/symbol:** `packages/agent/src/workflow-harness.ts:313` — `if (nextPhase.id.includes('verify') && shouldSkipVerify())`; `:474-482`:
  ```ts
  function shouldSkipVerify(): boolean {
    try {
      const env = process.env.WAGGLE_AUTO_VERIFY;
      return env !== 'true' && env !== '1';
    } catch {
      return true; // Skip by default if flag can't be read
    }
  }
  ```
  Related: `feature-flags.ts:26` `VERIFIER_AUTO_RUN: process.env['WAGGLE_AUTO_VERIFY'] === '1'` reads the same variable but with different semantics (`'true'` is not accepted), and the harness does not use it.
- **Input:** `research-verify` run; `gather` and `synthesize` pass the gates; `WAGGLE_AUTO_VERIFY` is not set. Grep over `app/`, `sidecar/`, `scripts/`, `.env.example`, `package.json`, `docs/production-readiness/` → **no configuration in the repo sets** `WAGGLE_AUTO_VERIFY`, hence the production default = skip.
- **Current output:** `phaseStatuses.get('verify') === 'skipped'`, `completed === true`, `currentPhase === 3`; `getRunSummary` returns `**Status:** Completed` along with the row `| 3 | Verify | SKIP | - | 0 |`. `WAGGLE_AUTO_VERIFY=0` → still skip. `=1` → verify `active`, `completed=false`.
- **Repro / verification boundary:** repro 01a–d (REPRO-OK ×4). There is no `harness:phase:*` event for the skip → the bridge does not see the skipping; the preceding `synthesize` phase has already been written as a `'verified'` trace. The `catch` branch is dead code (reading `process.env` does not throw), but its direction is fail-open. The existing test `packages/agent/tests/workflow-tools-harness.test.ts:135-179` **relies on the skip** so that the run completes after `synthesize` (comment `:136-138`) → it must be updated together with the fix.
- **Expected:** in work/strict mode the verify phase is never silently skipped; any opt-out is explicit, recorded in the state with a reason, and never shown as "Completed" without a marker; default fail-closed.
- **Smallest change:** invert the default (`skip` only when `WAGGLE_AUTO_VERIFY === '0'` or an explicit `harness`/run option), `catch` → `false`; `getRunSummary` status "Completed (verify skipped)" when a `skipped` status exists; emit a `harness:phase:skipped` event; unify with `FEATURE_FLAGS.VERIFIER_AUTO_RUN`; RED test: a run without the env must reach the `verify` phase.
- **AT:** AT-01, AT-03.

### F-HARN-02 — VERDICT regex accepts FAIL; CONDITIONAL without a policy (S1 L7; brief §7.2; AT-01)

- **Status:** CONFIRMED AT REVISION
- **Commit:** `2af0904d`; file unchanged since `72551d6e` (2026-04-14).
- **Path/symbol:** `packages/agent/src/builtin-harnesses.ts:128` — `hasPattern(output, /VERDICT:\s*(PASS|CONDITIONAL|FAIL)/i, 'VERDICT: assessment')`; `hasPattern` `:43-51` returns `passed: pattern.test(content)` without reading the value. The instruction at `:125` asks for PASS/CONDITIONAL/FAIL. `grep -rn CONDITIONAL packages --include=*.ts` → only `:125` and `:128` (the other two hits are the word "UNCONDITIONAL" in comments). There is no policy for CONDITIONAL anywhere.
- **Input:** verify phase with `content: 'VERDICT: FAIL — the synthesis contradicts both sources.'`; separately `'VERDICT: CONDITIONAL …'`, `'VERDICT: PASS'`, and text without a VERDICT.
- **Current output:** FAIL → `passed: true` ("Output contains VERDICT: assessment"); CONDITIONAL → identical to PASS; without a VERDICT → `passed: false` (the retry path works). A whole run with `VERDICT: FAIL` → `completed=true, aborted=false, verify='passed'`.
- **Repro / boundary:** repro 02a–d (REPRO-OK ×4).
- **Expected:** FAIL → gate does not pass → retry, then abort/blocked; CONDITIONAL → recipe-defined policy (amendment / user review / completion with an explicit limitation marker), never a silent PASS; only PASS passes unconditionally (brief §7.2).
- **Smallest change:** capture group → `passed = verdict === 'PASS'`; `GateResult` gets `verdict?: 'PASS'|'CONDITIONAL'|'FAIL'`; CONDITIONAL by default `passed:false` with a `reason` that requests an amendment, plus an optional per-phase `conditionalPolicy`; carry the verdict into the checkpoint and `HarnessPhaseCompleteEvent` so that the bridge/trace can distinguish it. RED tests: FAIL → phase fail; CONDITIONAL → non-PASS outcome.
- **AT:** AT-01.

### F-HARN-03 — bash-as-test gate ignores the command and the exit code (S1 L8; A5; AT-02; DIR-07)

- **Status:** CONFIRMED AT REVISION (extended: the exit code is observed in the supervisor and then discarded at the tool boundary)
- **Commit:** `2af0904d`.
- **Path/symbol:**
  - `builtin-harnesses.ts:181` — `hasToolCalls(output, ['bash', 'Bash', 'run_command'], 1)`; `hasToolCalls` `:13-24` does `tc.tool.toLowerCase().includes(name)` (substring), counts names only.
  - `workflow-harness.ts:76` — `toolCalls: Array<{ tool; args; result: string }>` — no `ok`/`exitCode`.
  - The evidence is model-supplied: `workflow-tools.ts:335-346` (`phase_output.tool_calls` in the tool schema), `:415` `toolCalls: (phaseOutput.tool_calls as PhaseOutput['toolCalls']) ?? []`.
  - Exit code at the tool boundary: `system-tools-helpers.ts:732-734` observes `code !== 0` → `TimedProcessResult.errorCode/errorMessage` (`:208-215`), but `system-tools.ts:682-693`:
    ```ts
    if (result.errorMessage) {
      const output = truncateOutput((result.stderr || '') + (result.stdout || ''));
      …
      return output || `Error: ${result.errorMessage}`;
    }
    ```
    → when a failed `npm test` prints anything at all, **only the output is returned, without the `Error:` prefix and without the exit code**. Consequently `tool-executor.ts:285-287` `executionSucceeded = true`, `:298 countedAsUsed = true`; the server-side `isReportedToolFailure` (`chat-bounded-read-tools.ts:13-34`) does not see the failure either. The background path (`system-tools.ts:1261-1262`) prints `Exit code: N`, the foreground path does not.
- **Input:** verify phase of `code-review-fix` with `tool_calls: [{tool:'bash', args:{command:'echo hi'}, result:'hi'}]`; then `result:'Exit code: 1\nFAIL 12 tests failed'`; then the tool `my_bash_like_tool`.
- **Current output:** all three `passed: true` ("Found 1 matching tool call(s)"). Via `run_harness` the whole `code-review-fix` finishes with `**Status:** Completed` solely on self-reported `tool_calls` (repro 08a).
- **Repro / boundary:** repro 03a–c, 08a (REPRO-OK ×4). The real `bash` tool was not run (host-wide execution; the repro is read-only).
- **Expected (AT-02):** the gate reads the phase's server-observed journal (tool name, command, exit code/ok); a non-zero exit ≠ success; `echo` is not a test; the substring match is replaced with exact names and a test/typecheck command pattern.
- **Smallest change:** (a) `system-tools.ts:684-691` — always include `Exit code: N` (or a structured `{ok:false, exitCode}`) on a non-zero exit; (b) `tool-executor.ts` `succeeded=false` on a non-zero exit; (c) `PhaseOutput.toolCalls[]` gets `ok?: boolean; exitCode?: number` populated **server-side** (see F-HARN-08); (d) gate: `tc.ok !== false` && `/(npm|pnpm|yarn)\s+(test|run\s+test)|vitest|jest|tsc|pytest|cargo test/`.
- **AT:** AT-02.

### F-HARN-04 — `run_harness` in `VERIFICATION_TOOL_EXACT` (S1 L9; DIR-07)

- **Status:** CONFIRMED AT REVISION
- **Commit:** `2af0904d`; file last changed in `9a0f1a17` (2026-09-07), entry present.
- **Path/symbol:** `packages/agent/src/verification-gate.ts:33` `'run_harness'` in `VERIFICATION_TOOL_EXACT` (`:25-39`); `assertsUnverifiedCompletion` `:220-239` — `if (toolsUsed.some(isVerificationToolName)) return false;`. `toolsUsed` are names only: `agent-loop.ts:1826` `if (r.countedAsUsed) toolsUsed.push(r.toolName)`, while `tool-executor.ts:298` sets `countedAsUsed = true` even when `executionSucceeded === false`.
- **Input:** `assertsUnverifiedCompletion('All tests pass and the build is green.', ['run_harness'])`; the same with `['read_file']`; the same with `['bash']`.
- **Current output:** `run_harness` → `false` (the gate does not fire); `read_file` → `true`; `bash` → `false` regardless of the bash outcome.
- **Repro / boundary:** repro 04a–c (REPRO-OK ×3).
- **Expected:** `run_harness` is orchestration, not verification; a success claim is grounded only by a tool whose **observed** result is a successful check.
- **Smallest change:** remove `'run_harness'` from the set + a regression test in `verification-gate.test.ts`; next step: the gate receives `{name, succeeded}` pairs (agent-loop already has `r.succeeded`) instead of bare names.
- **AT:** AT-01, AT-02.

### F-HARN-05 — budget stop `enableVerification:false` (S1 L10; DIR-08; AT-03)

- **Status:** CONFIRMED AT REVISION
- **Commit:** `2af0904d`; `agent-loop.ts` last changed in `fc25e95f` (2026-09-25), line present.
- **Path/symbol:** `packages/agent/src/agent-loop.ts:1507-1550` (branch where `maxTokenBudget` is exhausted); `:1523-1534` `maybeFireCompletionGate({ …, enableVerification: false, enableSkillDistillation: false })`; `loop-gates.ts:697` default `true`; `:902-935` D3 body: the directive path (`:921-933`) requires a new model turn, but the **disclosure path** (`:907-920`, `VERIFICATION_NO_TOOL_DISCLOSURE`) only appends a suffix without a new turn — and it too is disabled by the flag. `budgetStopResponse` `:895-920` does not add any "unverified/partial" marker.
- **Input (mechanism):** `maybeFireCompletionGate` with `content:'Done. All tests pass and the build is green.'`, `toolsUsed:[]`, `availableToolNames:['bash']`, `enableVerification:false` vs the default; and the default with `availableToolNames:[]`.
- **Current output:** `false` → `{fired:false}` without a suffix and without a reject (silent); default → `fired:true`; default without tools → `contentSuffix` "**Verification scope: EVIDENCE-ONLY**…" (evidence that a path without an extra turn exists).
- **Repro / boundary:** repro 05a–c (REPRO-OK ×3) at the gate-function level; **the full agent loop with a real budget was not executed** (requires a provider) — verification boundary.
- **Expected (DIR-08):** a budget stop leaves a clear partial/unverified outcome with the spent budget preserved; no "fully verified" marker; the user can approve an additional budget.
- **Smallest change:** at `:1523-1534` keep D3 in "disclose-only" mode (a new option `verificationMode: 'disclose-only'` in `MaybeFireCompletionGateArgs`, or a direct call to `assertsUnverifiedCompletion` + append `VERIFICATION_NO_TOOL_DISCLOSURE`) before `budgetStopResponse`; add `budgetStop: true` to the `AgentResponse` metadata; RED test in `verification-gate-loop.test.ts`.
- **AT:** AT-03.

### F-HARN-06 — `HarnessTraceBridge`: `'verified'`, `ok:true/durationMs:0`, null context (brief §7.1 para. 2; A17; W0 "bridge context")

- **Status:** CONFIRMED AT REVISION
- **Commit:** `2af0904d`; file unchanged since `5a84c8c1` (2026-04-14).
- **Path/symbol:** `packages/agent/src/harness-trace-bridge.ts:11` (documented mapping), `:91` `this.writeTrace(ev, 'verified')`, `:139-148`:
  ```ts
  this.recorder.recordToolCall(handle, { tool: tc.tool, args: …, result: …, ok: true, durationMs: 0, timestamp: … });
  ```
  `:125` `const ctx = this.resolveContext(ev) ?? {}` → `:127-130` null fields. Boot: `packages/server/src/local/index.ts:612-616` `new HarnessTraceBridge({ recorder: traceRecorder })` **without `context`**. Downstream: `eval-dataset.ts:6-7` and `:208` `positiveOutcomes ?? ['success', 'verified']` → a harness phase (whose verify was skipped or whose verdict was FAIL) becomes a positive eval example. `PhaseOutput.durationMs` is not passed through. Another hardcoded `ok: true`: `trace-recorder.ts:281` and `:288` (`wireAgentLoopCallbacks` → `completeToolCall(handle, callId, result, true)`), used by the chat turn (`agent-loop.ts:489`) → the per-turn trace never records `ok:false` either. Test `harness-trace-bridge.test.ts:82-92` and `:327` **lock in** the `'verified'` mapping.
- **Input:** `harness:phase:complete` with `toolCalls:[{tool:'bash', result:'Exit code: 1\nFAIL'}]`, `output.durationMs: 9876`, bridge without `context`.
- **Current output:** `finalize.outcome === 'verified'`; tool record `{ok:true, durationMs:0}`; `9876` nowhere in the trace; `start` payload `{sessionId:null, personaId:null, workspaceId:null, model:null, taskShape:'harness:research-verify'}`.
- **Repro / boundary:** repro 06a–d (REPRO-OK ×4) with a fake recorder; nothing was written to the real `execution_traces` table.
- **Expected (§7.2/7.3):** a completed phase = structural `gate_passed`, not content-level `verified`; tool records carry observed `ok/duration` or are omitted; context is resolved from run → session/workspace; existing `verified` harness rows go to quarantine/legacy.
- **Smallest change:** add `'gate_passed'` to `TraceOutcome` (`hive-mind-core/src/mind/execution-traces.ts:20`) and map complete → `'gate_passed'`; the `eval-dataset` default positives remain `['success','verified']` (they do not include `gate_passed`) until a ProofReceipt exists; in the bridge `ok: tc.ok ?? null` and no fabricated `durationMs`; `index.ts:612` passes a resolver once events get a `runId` (F-HARN-07); migration (A2): mark existing `task_shape LIKE 'harness:%' AND outcome='verified'` as unqualified. Update test `:82-92,:327`.
- **AT:** AT-01, AT-06.

### F-HARN-07 — global `harnessEvents`/`harnessId` without `runId` (A11; AT-06; DIR-04/09)

- **Status:** PARTIAL/UNWIRED — **state** isolation closed in `93ff7813` (run_id-keyed Map + 8 tests), **events/traces** still indistinguishable.
- **Commit:** `2af0904d`; `93ff7813` (2026-04-15) is an ancestor of HEAD.
- **Path/symbol:** `workflow-harness.ts:132` `export const harnessEvents = new EventEmitter()` (process singleton); the payload types `:169-207` have only `harnessId, phaseId, phaseName, phaseInstruction, output, gateResults` — no `runId/sessionId/workspaceId`; `createHarnessRun(harness)` `:135` and `advancePhase(state, harness, output)` `:213` do not receive the run identity. `run_harness` generates a `run_id` (`workflow-tools.ts:374`, `generateHarnessRunId` `:453-457`) and keeps it in `activeHarnessRuns` (`:447`, in-memory, process-global, without persistence) but **does not pass it** to the harness engine. `HarnessTraceContextResolver` (`harness-trace-bridge.ts:54-56`) receives only the event → it cannot map it to a workspace.
- **Input:** two `createHarnessRun(document-draft)` + `advancePhase` on both; a listener on `harness:phase:complete`.
- **Current output:** 2 events, keys `harnessId,phaseId,phaseName,phaseInstruction,output,gateResults`; both `harnessId='document-draft', phaseId='context'` — indistinguishable; with the default bridge both traces have `workspaceId:null`.
- **Repro / boundary:** repro 07a–b, 08b (REPRO-OK ×3). Not performed from two real workspace HTTP runs (requires the server).
- **Expected (AT-06):** every event carries a `runId` (+ `workspaceId/sessionId`); two concurrent workspace runs produce separate, correctly scoped traces; a run-scoped bus instead of the global one.
- **Smallest change (G1 scope):** `HarnessRunState.runId`, `createHarnessRun(harness, {runId, workspaceId?, sessionId?})`, `runId` in all payloads; `run_harness` passes its `run_id`; `WorkflowToolsConfig` gets the session/workspace context so that the bridge resolver reads `ev.runId` from a small run→context map. The full per-run bus with `seq` (brief §6.4) = W1.
- **AT:** AT-06.

### F-HARN-08 — `run_harness` accepts model-supplied evidence; the server journal does not participate (A5; DIR-07)

- **Status:** CONFIRMED AT REVISION (extension of L8/L9)
- **Commit:** `2af0904d`; `workflow-tools.ts` last changed in `fb341aad` (2026-07-30).
- **Path/symbol:** `workflow-tools.ts:330-358` (the `phase_output` schema with `tool_calls/artifacts/duration_ms/tokens`, populated by the model), `:412-422` builds `PhaseOutput` verbatim from the arguments; there is no cross-check against `toolsUsed` from the agent loop nor against the server `TurnToolActivity`. `grep -rn phase_output packages/server/src` → 0. The server **does have** observed data: `chat-agent-run.ts:214-225` (`onToolResult` → `isError`, `duration`), `TurnExecutionTrace` (`chat-turn-execution-trace.ts:46`), but none of it reaches `run_harness`.
- **Input:** `run_harness` for `code-review-fix`, all four phases with fabricated `tool_calls` (`read_file`, `edit_file`, `bash echo ok`) without a single real tool call.
- **Current output:** `**Status:** Completed`.
- **Repro / boundary:** repro 08a (REPRO-OK).
- **Expected (DIR-07):** the model may submit only `content`; gates read the server-observed ledger.
- **Smallest change:** `WorkflowToolsConfig` gets an `observedToolCalls(sinceMarker)` provider (the server populates it from `onToolResult`); `run_harness` ignores/overrides `phase_output.tool_calls`; during the transition period, mark `PhaseOutput.toolCalls` as `selfReported: true`, and in strict mode the gate rejects self-reported evidence.
- **AT:** AT-01, AT-02.

### F-HARN-09 — harness router map: `task-shape.ts` / `workflow-composer.ts` / `capability-router.ts` (W3; brief §6.1)

- **Status:** PARTIAL/UNWIRED — the classifier and the composer exist and have tests, but **harness selection is not a server-side router**; it is model-invoked text.
- **Commit:** `2af0904d`.
- **Map (callers verified with grep):**
  - `detectTaskShape` (`task-shape.ts:145`, purely heuristic, no LLM; types `research|compare|draft|review|decide|plan-execute|mixed`, `complexity`) — chat path: `chat-turn-preparation.ts:381` (input to the prompt assembler and `selectAgentRunBudget` `:1119-1123`), `chat.ts:746` (only a `complexity === 'simple'` check); others: `prompt-assembler.ts:375`, `subagent-orchestrator.ts:336`, `subagent-tools.ts:335`, `fleet-run-executor.ts:639`, `routes/fleet.ts:352`, `improvement-wiring.ts:175`, `workflow-tools.ts:76`. **Does not select a harness/recipe.**
  - `composeWorkflow` (`workflow-composer.ts:70`) — the only caller is `workflow-tools.ts:84` in the `compose_workflow` tool. `selectExecutionMode` `:99-104` returns `'harnessed'` when `FEATURE_FLAGS.ADVANCED_WORKFLOWS` (default **ON**, `feature-flags.ts:14`) and `matchHarness(task)` (regex triggers `builtin-harnesses.ts:97-100,140-143,193-196`). But `compose_workflow` only **prints** the mode (`:86-119`); it does not start the harness and does not mention `run_harness` (it mentions only `orchestrate_workflow` for the template `:113-117`). Hence the "router" = the model reads text → maybe calls `run_harness`.
  - `CapabilityRouter.resolve` (`capability-router.ts:58`) — constructed in `chat-turn-preparation.ts:1101-1117` (conditionally) and `worker/src/handlers/waggle-handler.ts:26`; the only consumer is `tool-executor.ts:299-309` for an **unknown tool name** (suggestions + an `acquire_capability` hint). It does not participate in recipe selection; the order native→connector→skill→plugin→mcp→subagent is a confidence sort (`:170`), not a permission filter (brief §9.1 requires permissions first).
  - Exposure of `run_harness`: `tool-filter.ts:242-246` (only when the message contains agent/workflow/orchestrate keywords), `chat-collaboration.ts:26-28` `COLLABORATION_TOOL_NAMES`, `chat-helpers.ts:1076/1086/1094` (mutation / code-exec / agent-launch sets), `workspace-turn-coordinator.ts:52` (checkout-touching set).
  - Advisory, unenforced fields: `HarnessPhase.allowedTools/requiresApproval/timeoutMs` (`workflow-harness.ts:47-68`, documented in `93ff7813`).
- **Expected (§6.1, DIR-03):** the server separates conversation/work and selects the recipe/version and the mode; the classification is visible and correctable.
- **Smallest change for G1:** none (record as an asset and a boundary); router design = W3, the writer's job.
- **AT:** AT-06 (run identity), AT-21 (indirectly).

---

## 2. What exists and works / exists but is not wired (existingAssetsToPreserve)

| # | What | Path | Callers (grep) |
|---|---|---|---|
| 1 | `advancePhase` state machine: gates → checkpoint → retry (`maxRetries`) → abort with `abortReason`; immutable state | `workflow-harness.ts:213-374` | `workflow-tools.ts:424`; test `harness-trace-bridge.test.ts:323` |
| 2 | Deterministic gate helpers (no LLM): `hasToolCalls`, `hasMinSections`, `hasPattern`, `hasMinLength`, `hasSpecificImprovement` | `builtin-harnesses.ts:13-89` | 3 harness definitions `:94-238` |
| 3 | Three built-in harnesses + `matchHarness`/`getHarnessById` | `builtin-harnesses.ts:94-259` | `workflow-composer.ts:19,82,102`; `workflow-tools.ts:10,307,366` |
| 4 | `run_harness` run_id scoping (state does not bleed between sessions) | `workflow-tools.ts:371-390,440-465` | tests `workflow-tools-harness.test.ts` (8) |
| 5 | D3 `assertsUnverifiedCompletion` with planning/attributed/negated exclusions + a disclosure path without a new turn | `verification-gate.ts:220-239`; `loop-gates.ts:907-920` | `loop-gates.ts:905`; `agent-loop.ts:1523-1534,1649-1662`; tests `verification-gate.test.ts`, `verification-gate-loop.test.ts` |
| 6 | `HarnessTraceBridge` with an **existing** per-event `context` resolver and a scoped emitter | `harness-trace-bridge.ts:54-56,80-86` | `local/index.ts:612` (without a resolver); tests `:197-237` prove that the resolver works |
| 7 | Server-observed ledger primitive: `TraceRecorder.completeToolCall` (real `durationMs`, `ok` param), `TurnExecutionTrace`, `TurnToolActivity.recordResult`, `isReportedToolFailure` | `trace-recorder.ts:142-166`; `chat-turn-execution-trace.ts:46`; `chat-agent-run.ts:214-225`; `chat-bounded-read-tools.ts:13-34` | `agent-loop.ts:489`; `chat.ts:1653`; `ok` hardcoded to `true` in `trace-recorder.ts:281,288` |
| 8 | The process supervisor observes the exit code | `system-tools-helpers.ts:732-734` → `TimedProcessResult.errorCode` `:208-215` | `system-tools.ts:670-693` (discards it at `:691`) |
| 9 | `detectTaskShape` + `composeWorkflow`/`selectExecutionMode` + `FEATURE_FLAGS.ADVANCED_WORKFLOWS` | `task-shape.ts:145`; `workflow-composer.ts:70,99-139`; `feature-flags.ts:14` | see F-HARN-09; tests `task-shape.test.ts`, `workflow-composer.test.ts` |
| 10 | `CapabilityRouter` (skills/plugins/mcp/connectors/subagent suggestions) | `capability-router.ts:51-186` | `chat-turn-preparation.ts:1101-1117`; `tool-executor.ts:299-309`; test `capability-router.test.ts` |
| 11 | Advisory fields `allowedTools/requiresApproval/timeoutMs` — declared, unenforced; preserve their semantics for the W1 executor | `workflow-harness.ts:47-68` | no enforcing callers (documented `93ff7813`) |
| 12 | `EvalDatasetBuilder.positiveOutcomes` is configurable | `eval-dataset.ts:66,208` | allows excluding harness `verified` rows without a schema change |

---

## 3. Notes and boundaries

- **Verification limitations:** the repro is a unit/mechanism-level check against `dist/`; no real chat turn with a provider and no real `bash` were executed; no real `execution_traces` were written. The repo test suite was not run (repo READ-ONLY, no `npm` commands).
- **Tests that will turn red with the fixes (expected; to be updated):** `workflow-tools-harness.test.ts:135-179` (relies on the verify auto-skip), `harness-trace-bridge.test.ts:82-92,327` (locks in `'verified'`).
- **TECH-DEBT.md:** no row covers these findings (`grep -i "harness|shouldSkipVerify|WAGGLE_AUTO_VERIFY" docs/TECH-DEBT.md` → only TD-TEST-1/TD-CHAT-16/TD-CHAT-32, in the sense of a *test* harness).
- **C12 (harness part):** `PhaseStatus` = `pending|active|validating|passed|failed|skipped` (`workflow-harness.ts:23`); `HarnessRunState` is not persisted (`activeHarnessRuns` in-memory) → a restart loses the run; there is no mapping to `CollaborationRunStatus`. This concerns AT-07 (durable group); it is only recorded here.
- **C8 (part):** `run_id` is created only on the first `run_harness` call (`workflow-tools.ts:374`), after classification and with no link to the chat `sessionId/workspaceId` — with respect to the brief §6.2 requirement that a run exist before durable context, there is currently no durable run object at all for the harness.
- Nothing in this document is an architecture recommendation; "smallest change" is the boundary for a RED test + minimal GREEN, in accordance with DIR-01.
