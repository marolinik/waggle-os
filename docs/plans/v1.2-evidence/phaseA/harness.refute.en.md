# Refute pass — group "harness" @ 2af0904df01ca3d374cc78ba95b60dc579dd6a7a

> **English translation** of [harness.refute.md](harness.refute.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Reviewer:** skeptical review (Fable 5.1), 2026-09-27
**Revision:** `git rev-parse HEAD` = `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`; `git status --porcelain` → only two untracked `.docx` in `docs/` → working tree == HEAD for all cited `.ts` files. Repo READ-ONLY; no test was run, no file in the repo was modified.
**Method:** for every finding with status CONFIRMED AT REVISION, the cited code + callers + tests were read; searched for a guard elsewhere, a test that locks in the opposite, or a production default that changes the behavior. For `minimalChange`, grepped for tests that would break. `git grep` (tracked files) instead of a repo-wide grep because `.scratch/` contains three old copies of the repo that would pollute the results.

**Overall outcome:** 7/7 CONFIRMED findings HOLDS. None REFUTED. Two WEAKENED only at the level of `minimalChange`/cited paths (F-HARN-03 file paths; F-HARN-06 migration due to SQL CHECK). Two PARTIAL findings (F-HARN-07, F-HARN-09) out of refute scope, spot-check consistent.

---

## F-HARN-01 — verify phase is skipped by default

```
verdict: HOLDS
```

**Why (CONFIRMED AT REVISION):**
- `packages/agent/src/workflow-harness.ts:313` `if (nextPhase.id.includes('verify') && shouldSkipVerify())` → `:314` status `'skipped'`; `:317-319` if verify is the last phase → `completed = true` without any event for the skipped phase (only `harness:phase:start` is emitted, for the phase AFTER the skip, `:322-326`).
- `packages/agent/src/workflow-harness.ts:474-482` `shouldSkipVerify()`: `return env !== 'true' && env !== '1'` → unset or `'0'` = skip. `catch { return true; }` (`:480`) — dead code because `process.env` does not throw, but the direction is fail-open; I agree with the finding.
- `packages/agent/src/workflow-harness.ts:424` `getRunSummary` writes `**Status:** Completed` when `state.completed`, with no indication that verify was skipped.
- **Production default check:** `git grep -n WAGGLE_AUTO_VERIFY` across all tracked files → only `packages/agent/src/feature-flags.ts:26`, `packages/agent/src/workflow-harness.ts:477`, a comment in `packages/agent/tests/workflow-tools-harness.test.ts:137`, and `waggle-cowork/waggle-prompt-improvement-plan.md:466`. Targeted grep in `app/`, `sidecar/`, `scripts/`, `.env.example`, `package.json`, `apps/web`, docker/render files → 0 hits. No `vitest.setup.ts`/config sets it. **Conclusion: production default = skip. No guard elsewhere.**
- `FEATURE_FLAGS.VERIFIER_AUTO_RUN` (`feature-flags.ts:26`) has no consumer in `packages/` or `apps/` (`git grep VERIFIER_AUTO_RUN` → only the definition) → the claim "the harness does not use it" is correct; the flag is dead.
- Commit `93ff7813` (2026-04-15) message verbatim: *"Behavior kept: harness event emissions, gate validation, retry logic, auto-skip of 'verify' phases when WAGGLE_AUTO_VERIFY is unset."* → the skipping was deliberately kept, not accidental.

**Does `minimalChange` break an existing test (CONFIRMED AT REVISION):**
- **YES — `packages/agent/tests/workflow-tools-harness.test.ts:135-179`** (`'captures real duration_ms and tokens when provided in phase_output'`): the comment `:136-138` explicitly says it relies on the auto-skip; after the Synthesize phase the test expects `finalOutput` to contain `'Tokens:'`, `'300 input'`, `'170 output'` (`:176-178`), which only `getRunSummary` produces on completion. With the inverted default, the third call would return the Verify phase instruction → the test fails. The finding already states this; I confirm.
- **NO** — `workflow-tools-harness.test.ts:182-230` (`'advancing past the final phase deletes the tracked run'`): passes in both modes (the third call with `VERDICT: PASS` has no assert; the fourth expects `Unknown run_id`, which holds in both cases).
- **NO** — `packages/agent/tests/harness-trace-bridge.test.ts:290-331`: uses the custom harness `test-hn` with phase `id: 'only'` → `includes('verify')` false → insensitive to the change.
- No other test runs the `research-verify`/`code-review-fix` verify phase (`git grep` across `packages/*/tests`).

**Additional note (AUDIT FINDING — TO VERIFY):** since verify is the last phase in `research-verify`, under the production default the whole run ends with `completed=true` right after the Synthesize gate — finding F-HARN-02 (VERDICT gate) is reachable in production only once F-HARN-01 is fixed or when `WAGGLE_AUTO_VERIFY=1`.

---

## F-HARN-02 — VERDICT gate accepts FAIL and CONDITIONAL

```
verdict: HOLDS
```

**Why (CONFIRMED AT REVISION):**
- `packages/agent/src/builtin-harnesses.ts:128` `hasPattern(output, /VERDICT:\s*(PASS|CONDITIONAL|FAIL)/i, 'VERDICT: assessment')`; `hasPattern` `:43-51` returns `passed: pattern.test(content)` — the capture group is not read. The instruction `:125` asks for a VERDICT line; it does not define the outcome.
- The `code-review-fix` verify phase (`:177-184`) has no VERDICT gate at all, so a CONDITIONAL/FAIL policy does not exist there either.
- **Guard elsewhere?** `git grep CONDITIONAL -- packages/agent/src packages/server/src` → only `:125` and `:128` (the rest is `UNCONDITIONAL` in comments). `advancePhase` (`workflow-harness.ts:213+`) reads only `gateResults[].passed`. None.
- **Test that locks in the opposite?** No. `packages/agent/tests/verification-gate.test.ts:74` contains `'**VERDICT: FAIL** - Production readiness is not established.'` but that is a fixture for the D3 `SUCCESS_ASSERTION` classifier, not for the harness gate.

**Does `minimalChange` break a test:** NO, per grep. The only test that feeds the verify phase is `workflow-tools-harness.test.ts:226` with `'VERDICT: PASS'` (and under the current default that phase is not even reached). `harness-trace-bridge.test.ts:54` uses `harnessId: 'code-review-fix'` only as a string in an event fixture.

**Nuance (PARTIAL/UNWIRED):** under the production default the gate is unreachable (see F-HARN-01) — the severity depends on the order of fixes, the validity of the finding does not.

---

## F-HARN-03 — bash gate passes on any bash call; exit code is lost

```
verdict: HOLDS (WEAKENED samo za citirane putanje fajlova)
```

**Path correction (CONFIRMED AT REVISION):** the finding cites `system-tools.ts`, `system-tools-helpers.ts` and `tool-executor.ts` as `packages/server/src/local/...`. **Actual locations at HEAD** (`git ls-files`): `packages/agent/src/system-tools.ts`, `packages/agent/src/system-tools-helpers.ts`, `packages/agent/src/tool-executor.ts`. `chat-bounded-read-tools.ts` is in `packages/server/src/local/routes/`. The line numbers in the finding are CORRECT at those paths — only the directory is wrong. The writer should correct this before citing.

**Why HOLDS:**
- `packages/agent/src/builtin-harnesses.ts:181` `hasToolCalls(output, ['bash','Bash','run_command'], 1)`; `:13-24` substring match on `tc.tool.toLowerCase().includes(name)`, counts names, does not read `args.command` or `result`.
- `packages/agent/src/workflow-harness.ts:76` `toolCalls: Array<{ tool; args; result: string }>` — no `ok`/`exitCode`.
- The exit code is observed: `packages/agent/src/system-tools-helpers.ts:732-735` (`code !== 0` → `finish(errorCode, 'Process exited with code N')`), type `TimedProcessResult.errorCode/errorMessage` `:208-215`.
- The exit code is discarded: `packages/agent/src/system-tools.ts:681-691` — on `result.errorMessage` it returns `truncateOutput(stderr + stdout)`; `:691` `return output || \`Error: ${result.errorMessage}\`` → `Error:` prefix (and thus the exit code) exists **only when the output is empty**. A failing test runner always prints something → the failure is invisible downstream.
- Downstream: `packages/agent/src/tool-executor.ts:285-287` `executionSucceeded = trimmedResult.length > 0 && !/^(?:error|failed|failure|denied|blocked)\b/i.test(...)`; `:298` `countedAsUsed = true` unconditionally. Server `packages/server/src/local/routes/chat-agent-run.ts:214-225` `isError = isReportedToolFailure(result)`; `chat-bounded-read-tools.ts:13-34` matches only `^(error|failed|denied|blocked)`, `[BLOCKED]`, `Tool "x" not found`, or JSON `{ok:false|success:false|error}`. **No guard that would see a non-zero exit with non-empty output.**
- Background path `packages/agent/src/system-tools.ts:1261-1262` `parts.push(\`Exit code: ${task.exitCode}\`)` — asymmetry confirmed.
- The bash tool name is exactly `'bash'` (`system-tools.ts:598`), so the `hasToolCalls` substring match also catches `my_bash_like_tool` (repro F-HARN-03c).

**Does `minimalChange` break a test:**
- (a) `Exit code: N` in foreground output: `packages/agent/tests/system-tools.test.ts:365-370` `'returns stderr on failure'` expects only `toContain('err')` → the prefix does NOT break it. `packages/agent/tests/background-bash.test.ts:129` `toContain('Exit code: 0')` is the background path → untouched. No test locks in the exact foreground output format on a non-zero exit (`git grep -i "exit 1|non-zero|exited with"` across `system-tools*.test.ts`, `tool-executor*.test.ts` → 0).
- (b) `tool-executor` does not see the exit code (only a string) — the change requires a marker/structure from (a); `tool-executor-critical-floor.test.ts:42-51` uses a fake `bash` that returns `'BASH_RAN'` → untouched.
- (d) gate on a test/typecheck pattern: no test feeds the `code-review-fix` verify phase with bash calls → safe.

---

## F-HARN-04 — `run_harness` counts as a verification tool

```
verdict: HOLDS
```

**Why (CONFIRMED AT REVISION):**
- `packages/agent/src/verification-gate.ts:33` `'run_harness'` in `VERIFICATION_TOOL_EXACT` (`:25-39`); `assertsUnverifiedCompletion` `:220-239`, line `:227` `if (toolsUsed.some(isVerificationToolName)) return false;`.
- `toolsUsed` are bare names: `packages/agent/src/agent-loop.ts:1826` `if (r.countedAsUsed) toolsUsed.push(r.toolName)`; `tool-executor.ts:298` `countedAsUsed = true` even when `executionSucceeded === false`.
- **Origin (intent sought):** `git log -S"'run_harness',"` → `9fce1d2f` (2026-07-20, *"fix(agent): align verification gates with exposed tools"*). The diff shows that the previous regex `/test|build|\brun\b|run_|verif|.../i` ALREADY caught `run_harness` via `run_`, so when switching to the explicit Set the name was simply carried over. The commit body is empty — **no documented decision** that `run_harness` is verification. It is not a founder decision D-01..D-18 (the checked list in BRIEF §3 does not mention this).
- **Test that locks in the opposite?** No. In `packages/agent/tests/verification-gate-loop.test.ts:104-114`, the `isVerificationToolName` table contains `run_tests`, `bash`, `lsp_diagnostics`, `inspect_file`, `execute_action`, `create_plan` — without `run_harness`. `git grep run_harness -- packages/agent/tests` → 0. Hits in `packages/server/tests/local/chat-helpers.test.ts:1526-1579` and `chat-collaboration.test.ts:31` concern tool-policy sets, not the gate.

**Does `minimalChange` break a test:** NO (no test uses `run_harness` in `toolsUsed`). Note: after removal, D3 could fire on a turn that called only `run_harness` and claims "tests pass" — that is the desired behavior per DIR-07.

---

## F-HARN-05 — budget stop disables D3 verification

```
verdict: HOLDS (jedna korekcija putanje)
```

**Correction:** the finding says "budgetStopResponse :895-920" under `loop-gates.ts`; `budgetStopResponse` is in **`packages/agent/src/agent-loop.ts:895-920`** (`git grep budgetStopResponse` → only agent-loop.ts `:895`, `:1039`, `:1542`). `loop-gates.ts:895-935` is the D3 block, which the finding also cites correctly.

**Why HOLDS (CONFIRMED AT REVISION):**
- `packages/agent/src/agent-loop.ts:1507-1550`: branch `maxTokenBudget` exhausted; `:1523-1534` `maybeFireCompletionGate({..., enableVerification: false, enableSkillDistillation: false, ...})`.
- `packages/agent/src/loop-gates.ts:697` default `enableVerification = true`; `:902-935` D3: `:907-920` disclosure path (no tools → `contentSuffix += VERIFICATION_NO_TOOL_DISCLOSURE`, no new turn) — **it too is disabled** by the flag because `enableVerification &&` is the first condition `:903`.
- `agent-loop.ts:899-904` `budgetStopResponse` picks `preservedContent ?? usableAnswer ?? 'Token budget exhausted...'` + `appendFetchedSourceFooter` — no `partial/unverified` marker when a usableAnswer exists.
- **Guard elsewhere?** The integrity gate (`rejectIncompleteReason`, `:1535-1540`) also runs on budget stop, but it catches structurally incomplete content, not unverified success claims. None.
- **Test that locks in the opposite?** `packages/agent/tests/verification-gate-loop.test.ts:1718-1737` `'fails closed when the abandoned scaffold exhausts the hard token budget'` expects `INCOMPLETE_COMPLETION` — it confirms that the integrity gate stays; it does not lock in the absence of D3. `packages/agent/tests/agent-loop-budget.test.ts` has exact-content asserts on budget stop (`:962`, `:994`, `:1023`, `:1393-1440`) but none of the content matches `SUCCESS_ASSERTION` (grep `tests pass|verified|it works` → only `'Verified source: URL'` `:705/:733` in web_fetch citation tests; the pattern `\bverified\s+(that\s+)?(everything|it|the)\b` does not catch it).

**Does `minimalChange` break a test:** NO, per grep — the disclose-only suffix is added only when `assertsUnverifiedCompletion` fires, and no budget-stop test sends such content. `budgetStop: true` in `AgentResponse` metadata is additive (`toMatchObject` asserts tolerate it). The LIMIT remains as in the finding: the full loop with a real provider was not executed.

---

## F-HARN-06 — bridge maps a completed phase to `verified`, tool records to `ok:true/durationMs:0`

```
verdict: HOLDS (WEAKENED na nivou minimalChange: nije type-edit, već SQLite migracija)
```

**Why HOLDS (CONFIRMED AT REVISION):**
- `packages/agent/src/harness-trace-bridge.ts:11` documented mapping `complete → 'verified'`; `:91` `this.completeListener = (ev) => this.writeTrace(ev, 'verified')`; `:139-148` `recordToolCall({..., ok: true, durationMs: 0, ...})` without reading `ev.output.durationMs`; `:125` `const ctx = this.resolveContext(ev) ?? {}` → `:127-130` all `null` without a resolver.
- Boot: `packages/server/src/local/index.ts:612-616` `new HarnessTraceBridge({ recorder: traceRecorder })` — WITHOUT `context`. The only construction in production (`git grep "new HarnessTraceBridge"` → only this one + tests).
- Downstream, REAL: `packages/agent/src/eval-dataset.ts:208` `positiveOutcomes ?? ['success', 'verified']`; `EvalDatasetBuilder` is used in `packages/agent/src/evolution-orchestrator.ts:319` → a harness phase with a skipped verify (F-HARN-01) or a FAIL verdict (F-HARN-02) enters as a positive eval example. Confirmed.
- Second hardcoded `ok:true`: `packages/agent/src/trace-recorder.ts:281-282` (fallback `recordToolCall`) and `:288` (`completeToolCall(handle, callId, result, true)`); this is active in a chat turn because `agent-loop.ts:488-489` `wireAgentLoopCallbacks` and the server `chat-agent-run.ts:320` passes `traceRecording`.
- `packages/hive-mind-core/src/mind/execution-traces.ts:20` `TraceOutcome = 'success' | 'corrected' | 'abandoned' | 'verified' | 'pending'` — no `gate_passed`.
- **Test that locks in the opposite?** Yes, but it locks in the CURRENT behavior, not correctness: `packages/agent/tests/harness-trace-bridge.test.ts:82-92` (`expect(traces[0].outcome).toBe('verified')`) and `:327`. No test pins `ok: true`/`durationMs: 0` (grep in the test file → `ok` only as a content string `:299/:317`).

**Why WEAKENED for `minimalChange` (AUDIT FINDING — TO VERIFY):**
- The `outcome` column has a **SQL CHECK constraint** in two places: `packages/hive-mind-core/src/mind/execution-traces.ts:150-151` and `packages/hive-mind-core/src/mind/schema.ts:242-243` `CHECK (outcome IN ('success','corrected','abandoned','verified','pending'))`. SQLite does not allow `ALTER` of a CHECK constraint → adding `gate_passed` requires a table-rebuild migration (new table, copy, drop, rename) + indexes `:159-160`/`schema.ts:250-253`. Existing `execution_traces` in user databases would reject an INSERT with the new outcome without a migration. **It is not a "minimal" change; it should be planned as a migration in G1.**
- An alternative that stays minimal: map `complete → 'success'` instead of a new enum? NO — `'success'` is also in the default `positiveOutcomes`, so it does not solve the eval contamination. Or: the bridge writes `'pending'`/tag `gate_passed` into `tags[]` (`:134`) and eval-dataset filters by tag — no schema change. **PROPOSAL for the writer, not a decision.**
- OSS note (CONFIRMED AT REVISION from CLAUDE.md §7.5): `execution-traces.ts` is OSS-EXCLUDED → the change carries no obligation to port to the mirror; but `schema.ts:235-253` (part of `mind/schema.ts`) IS part of the substrate that gets ported → the drift-check baseline should be updated. UNKNOWN whether the `oss-drift-check.mjs` baseline currently covers this block (not checked).

---

## F-HARN-07 — global emitter without a run ID (status: PARTIAL/UNWIRED — out of refute scope)

```
verdict: HOLDS (spot-check, nije pun refute pass)
```

- `packages/agent/src/workflow-harness.ts:132` `export const harnessEvents = new EventEmitter()`; `:135` `createHarnessRun(harness: WorkflowHarness)` one parameter; `HarnessRunState` `:110-128` without `runId`/`workspaceId`/`sessionId`; payload interfaces `:169-207` only `harnessId, phaseId, phaseName, ...`.
- `packages/agent/src/workflow-tools.ts:374` `generateHarnessRunId` → `:447` `activeHarnessRuns` (process-global Map); run_id is NOT passed into `createHarnessRun` or `advancePhase` (`:374`, `:425`).
- `WorkflowToolsConfig` `:39-51` has no session/workspace fields → the bridge resolver cannot map.
- Tests `workflow-tools-harness.test.ts:71-106` prove only state isolation, as the finding says. Consistent.

---

## F-HARN-08 — gates read model-supplied `phase_output.tool_calls`

```
verdict: HOLDS
```

**Why (CONFIRMED AT REVISION):**
- `packages/agent/src/workflow-tools.ts:330-358` schema `phase_output` (the model fills in `tool_calls`, `artifacts`, `duration_ms`, `tokens`); `:412-422` `PhaseOutput` is built verbatim: `toolCalls: (phaseOutput.tool_calls as PhaseOutput['toolCalls']) ?? []`.
- `git grep phase_output -- packages/server/src` → 0. `git grep "activeHarnessRuns|harnessEvents" -- packages/server/src` → only a comment `index.ts:595` and the barrel `agent/src/index.ts:316`.
- The server HAS observed data: `packages/server/src/local/routes/chat-agent-run.ts:214-225` `onToolResult` computes `isError` + `toolActivity.recordResult(name, result, isError)` (`TurnToolActivity`, `:36/:113`) — but none of it reaches the `createWorkflowTools` config (`:39-51`).
- **Refutation attempted — is `run_harness` reachable by the model in production at all?** YES: in `WORKSPACE_COLLABORATION_TOOL_NAMES` (`packages/server/src/local/index.ts:280-288`), keyword-gated in `packages/agent/src/tool-filter.ts:242-246` (regex `agent|delegate|workflow|orchestrate|synthesi[sz]e...`), and withheld only when `policy.denyAgentLaunch` (`chat-helpers.ts:1173` `broadDenial || agentLaunchDenial`, derived from the user's text; filter `:1394`). So in an ordinary chat turn with the word "workflow", the tool is visible and self-reported evidence passes.
- **Test that locks in the opposite?** No — all harness tests in fact feed fabricated `tool_calls` (`workflow-tools-harness.test.ts:86-91, :147-155`), which is itself evidence for the finding.

**Does `minimalChange` break a test:** YES, if strict mode is introduced as the default — `workflow-tools-harness.test.ts:82-106` and `:135-179` pass the Gather gate exclusively on self-reported `search_memory`/`recall_memory` calls. The transitional proposal from the finding (`selfReported: true` + strict opt-in) avoids this; a full replacement requires updating those tests or injecting an `observedToolCalls` provider into `makeConfig()` (`:14-32`).

---

## F-HARN-09 — harness router map (status: PARTIAL/UNWIRED — out of refute scope)

```
verdict: HOLDS (spot-check)
```

- `packages/agent/src/workflow-tools.ts:84-119` `compose_workflow.execute` only formats `plan.executionMode` into text; it does not call `run_harness` and does not start a harness (`:113-117` mentions only `orchestrate_workflow`).
- `packages/agent/src/workflow-composer.ts:99-104` `selectExecutionMode` returns `'harnessed'` when `FEATURE_FLAGS.ADVANCED_WORKFLOWS && matchHarness(task)`; `matchHarness` callers: only `workflow-composer.ts:82, :102`. `'harnessed'` consumers: only inside `workflow-composer.ts`. No server-side classification. Consistent with the finding.

---

## Cross-cutting notes for the writer

1. **Paths (CONFIRMED AT REVISION):** `system-tools.ts`, `system-tools-helpers.ts`, `tool-executor.ts` → `packages/agent/src/`, not `packages/server/src/local/`. `budgetStopResponse` → `agent-loop.ts:895`, not `loop-gates.ts`. The line numbers are correct.
2. **Dependency order (AUDIT FINDING — TO VERIFY):** the F-HARN-02 and F-HARN-03 gate fixes are invisible in production until F-HARN-01 (skip default) and F-HARN-08 (self-reported evidence) are resolved — a gate that reads fabricated data is worthless even when it is strict.
3. **The only real "WEAKENED" point:** F-HARN-06 `gate_passed` = SQLite table-rebuild migration due to the CHECK constraint (`execution-traces.ts:150-151`, `schema.ts:242-243`), not a type edit. Proposal without a schema change: tag-based differentiation in `tags[]` + eval-dataset filter — PROPOSAL, not a decision.
4. **Nothing is REFUTED.** No guard elsewhere, no production default that changes the behavior, no test that pins the opposite (the tests that exist pin the CURRENT behavior: `workflow-tools-harness.test.ts:135-179`, `harness-trace-bridge.test.ts:82-92,:327`).
