# ADR-01 — Conversation vs work and execution modes (`normal` / `strict` / `benchmark`)

> **English translation** of [2026-09-27-ADR-01-conversation-work-modes.md](2026-09-27-ADR-01-conversation-work-modes.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Document revision:** 1.2 DRAFT · 27.09.2026 · reviewed code revision `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`
**Document revision:** 1.2.1 DRAFT · 30.09.2026 · final closure (H-01..H-12)
**Changes 1.2.1:** H-07 — O3 rows `work · normal/strict/benchmark`, O4 (`CONDITIONAL` only in `normal`), new ADR-01-O9 (outcome per the FRD-05.9 table), T2 supplement, new T11 · H-08 — O4 pointer to FRD-05.2 "Validator invocation", T3 replaced (VI-1..VI-9, AT-02-P1..P2, N1..N15) · H-07 (supplement) — O4 and T6 aligned with the single rule for self-reported evidence (FRD-05.9 R3); T11 supplemented with cases R3a–R3c. Everything remains a PROPOSAL until RAT-03.
**Date:** 2026-09-27
**Status:** DRAFT — contract proposal; not approved, not implemented, no test has been run against the change
**Author:** planner (Fable 5.1), per the founder brief "Guidance for replanning and resolving PRD/FRD v1.1" (27.09.2026)
**Ratified by:** founder — pending
**Supersedes / refines:** the implicit "harness = opt-in tool that the model calls on its own" contract from `93ff7813` (2026-04-15) and `fb341aad` (2026-07-30); FRD v1.1 §3 step 3 ("Classify TaskShape and choose harness version") without a separate interaction kind; S1 A4 (a single `ExecutionMode` table)
**Binds:** W0 (status truthfulness), W1 (DurableRun creation), W3 (server router + two recipe paths), B1–B3 (benchmark mode), FRD v1.2 §"Modes"
**Cross-references:** ADR-02 (durable store), ADR-03 (detach/cancel), ADR-10 (release/privacy profiles); brief §6.1 (DIR-03), §7.2, §13.3; AT-01, AT-02, AT-03, AT-06, AT-21, AT-28

---

## §1 — Context

**ADR-01-K1 (CONFIRMED AT REVISION).** At `2af0904d` there is no server-side separation of "conversation" from "work". `detectTaskShape` (`packages/agent/src/task-shape.ts:145`) is a purely heuristic classifier (`research|compare|draft|review|decide|plan-execute|mixed` + `complexity`) that the chat path uses only as input to the prompt assembler and the budget (`packages/server/src/local/routes/chat-turn-preparation.ts:381,1119-1123`; `chat.ts:746` only `complexity === 'simple'`). It does not select a harness or a recipe. [docs/plans/v1.2-evidence/phaseA/harness.md F-HARN-09]

**ADR-01-K2 (CONFIRMED AT REVISION).** Harness selection is model-invoked text: `compose_workflow` (`packages/agent/src/workflow-tools.ts:84-119`) only prints `executionMode` from `selectExecutionMode` (`workflow-composer.ts:99-104`, `'harnessed'` when `FEATURE_FLAGS.ADVANCED_WORKFLOWS` — default ON, `feature-flags.ts:14` — and `matchHarness(task)`), it does not start the harness; the model may then call `run_harness`. `run_harness` is visible in an ordinary chat turn when the message contains `agent|delegate|workflow|orchestrate|synthesi[sz]e…` (`tool-filter.ts:242-246`). [F-HARN-09; harness.refute.md F-HARN-08]

**ADR-01-K3 (CONFIRMED AT REVISION).** There is no concept of an execution mode. The verify phase is skipped by default: `workflow-harness.ts:313` + `shouldSkipVerify()` `:474-482` (`env !== 'true' && env !== '1'`; `catch → true`); no configuration in the repo sets `WAGGLE_AUTO_VERIFY` (`git grep` over `app/`, `sidecar/`, `scripts/`, `.env.example`, `package.json`, `apps/web` = 0). `FEATURE_FLAGS.VERIFIER_AUTO_RUN` (`feature-flags.ts:26`) reads the same variable with different semantics and has no consumer. Commit `93ff7813` deliberately kept the auto-skip ("Behavior kept: … auto-skip of 'verify' phases when WAGGLE_AUTO_VERIFY is unset"). [F-HARN-01; refute HOLDS]

**ADR-01-K4 (CONFIRMED AT REVISION).** Gates read model-supplied evidence: in `workflow-tools.ts:330-358` the schema `phase_output.tool_calls/artifacts/duration_ms/tokens` is filled in by the model, `:412-422` builds `PhaseOutput` verbatim; `git grep phase_output packages/server/src` = 0. The server has observed data (`chat-agent-run.ts:214-225` `onToolResult` → `isError`, `TurnToolActivity`), but it does not reach `run_harness`. The VERDICT regex accepts `FAIL` and `CONDITIONAL` as PASS (`builtin-harnesses.ts:128`, `hasPattern` `:43-51`); the bash gate passes on any call whose name contains `bash` (`:181`, `:13-24` substring), the exit code is observed (`packages/agent/src/system-tools-helpers.ts:732-735`) and then discarded (`packages/agent/src/system-tools.ts:681-691`: `Error:` prefix only when the output is empty). `run_harness` is in `VERIFICATION_TOOL_EXACT` (`verification-gate.ts:33`; origin `9fce1d2f`, with no documented decision). Budget stop switches off D3 including the disclosure path (`agent-loop.ts:1523-1534` `enableVerification:false`; `loop-gates.ts:903`; `budgetStopResponse` `agent-loop.ts:895-920` without a partial marker). [F-HARN-02/03/04/05/08; refute: all HOLDS; paths corrected per the refute — `system-tools*.ts`/`tool-executor.ts` are in `packages/agent/src/`]

**ADR-01-K5 (CONFIRMED AT REVISION).** A completed phase writes a trace `outcome:'verified'` without a content check (`harness-trace-bridge.ts:91`; tool records `ok:true/durationMs:0` `:139-148`; boot without `context` `packages/server/src/local/index.ts:612-616`), and `eval-dataset.ts:208` `positiveOutcomes ?? ['success','verified']` treats those rows as positive examples for evolution. `TraceOutcome` (`packages/hive-mind-core/src/mind/execution-traces.ts:20`) has no `gate_passed`; SQL `CHECK` at `:150-151` and `schema.ts:242-243` → adding a value is a table-rebuild migration, not a type edit. [F-HARN-06; refute WEAKENED only at the minimalChange level]

**ADR-01-K6 (CONFIRMED AT REVISION).** `harnessEvents` is a process-global `EventEmitter` (`workflow-harness.ts:132`); payloads `:169-207` carry `harnessId` (template id), not `runId`; `run_harness` generates `run_id` (`workflow-tools.ts:374,453-457`, in-memory `activeHarnessRuns` `:447`) and does not pass it into the engine. Two concurrent Workspace runs of the same harness are indistinguishable in events/traces. [F-HARN-07, F-DUR-08]

**ADR-01-K7 (DECISION — D-06, D-08, D-13, D-18 · PROPOSAL — BRIEF DIRECTION — DIR-03, DIR-07, DIR-08, DIR-22).** DECISION: knowledge work is the primary job (D-06); chat stays inside the Workspace (D-08); evolution is part of the product thesis (D-13); benchmark is key evidence (D-18). PROPOSAL — BRIEF DIRECTION (planner direction, not user approval): a mode must not grant greater permissions (DIR-03, brief §6.1); the server is the authority on execution evidence (DIR-07); budget stop does not create success (DIR-08); benchmark goes through the production path (DIR-22). This ADR enforces the decisions and does not re-decide them; it elaborates the brief direction as the working basis of the draft.

**ADR-01-K8 (AUDIT FINDING — TO VERIFY).** S1 A4 asks for a "default for everyday chat and latency budget". Brief §6.1 prohibits adopting the earlier general "ten minutes" target. Measured latency budgets per task shape do not exist in the repo (no test measures classification→first token for `work`). The threshold is set ahead of a locked test (brief §16).

## §2 — Decision (contract proposal)

**ADR-01-O1 (PROPOSAL).** Introduce two orthogonal axes, both server-side and persisted in `DurableRun` (ADR-02):
- `interaction: 'conversation' | 'work'` — the interaction kind;
- `mode: 'normal' | 'strict' | 'benchmark'` — the execution mode (applies only to `work`; `conversation` has no mode).

**ADR-01-O2 (PROPOSAL).** Classification is server-side, deterministic in the first scope (the existing `detectTaskShape` + explicit signals: Routine trigger, Ask Waggle intent with an artifact type, `/work` command), visible to the user ("This looks like work: research brief. Run as work / Stay in conversation") and correctable before the run moves to `RUNNING`. A misclassification does not start silent, expensive long-running work (DIR-03). An LLM classifier is not a prerequisite for G1/G2.

**ADR-01-O3 (PROPOSAL) — mode table (brief §6.1, carried over as a contract):**

| Mode | Behavior | Invariant |
|---|---|---|
| `conversation` | existing lightweight agent flow (`/api/chat`), retrieval + allowed tools; no DurableRun except when the turn explicitly starts work | does not fabricate verification (D3 stays); scope/egress/approvals/budget apply |
| `work · normal` | selected recipe/version; only justified phases; mandatory gates of the specific task; a failure is not displayed as verified complete | the verify phase is not silently skipped; opt-out (only in this mode) is explicit, recorded in the run with a reason, and displayed ("Completed (verify skipped)"); `CONDITIONAL` follows the recipe `conditionalPolicy`; a mandatory `FAIL`/`NOT_RUN` does not yield COMPLETED (FRD-05.9 N1–N8) |
| `work · strict` | all mandatory checks; evidence minimum defined by the recipe; block/partial when evidence or budget is missing | no skip verify and no opt-out, no self-reported tool success, no relaxing of D3 after a retry; COMPLETED only when all mandatory gates have PASS — CONDITIONAL (except FRD-05.9 R4), NOT_RUN and "Completed (verify skipped)" do not substitute for it (FRD-05.9 S1–S8) |
| `work · benchmark` | the same production semantics as the tested configuration; locked manifest; selected ablation profile; independent scoring | does not unlock additional data/tools/approvals; the full Waggle configuration does not skip mandatory verify; outcomes as in `strict`, with no continuation outside the manifest (FRD-05.9 B1–B8, R11) |

**ADR-01-O4 (PROPOSAL).** Server-observed evidence is the only input to gates (DIR-07): `WorkflowToolsConfig` gets an `observedToolCalls(sinceMarker)` provider that the server fills from `onToolResult`; `phase_output.tool_calls` from the model is ignored in `strict`/`benchmark`, and in `normal` it is marked as `selfReported:true`. The rule is FRD-05.9 R3: self-reported evidence in `strict`/`benchmark` yields `FAIL`; on a test/build gate it yields `FAIL` in every mode; in `work · normal` a gate that is not a test/build gate accepts it transitionally with `selfReported:true`, and the outcome is determined by the gate's verdict (N1–N8). The verify gate reads the **value** of the verdict (`PASS` passes; `FAIL` → retry, then block; `CONDITIONAL` → recipe-defined `conditionalPolicy` (supplement | user review | completion with an explicit limitation) only in `normal`; in `strict`/`benchmark` a mandatory gate with `CONDITIONAL` passes only when it meets the mandatory criterion (FRD-05.9 R4), and otherwise the run does not get COMPLETED; never a silent PASS). The bash/test gate reads `ok/exitCode` from the tool boundary (non-zero exit ≠ success; `echo` is not a test). Supplement 1.2.1 (H-08; PROPOSAL): a test/build gate passes only on a server-observed call of an approved validator (executor, argv, cwd, exit from process metadata, freshness after the last change; FRD-05.2 "Validator invocation", VI-1..VI-9); a regex over the command text is not evidence, and a universal shell interpreter is not introduced.

**ADR-01-O5 (PROPOSAL).** Three levels of confirmation instead of a single `verified` (brief §7.2), as the `ProofReceipt.level` enum from FRD-02.6: `structural` (execution/structural: the file exists and parses, sections, tool completed with an observed status), `defined_elements` (check of defined elements: numbers/dates/citations/references against the marked sources), `content_review` (content review against a rubric). `ProofReceipt` (ADR-02) carries the level. `gate_passed` remains exclusively a `TraceOutcome` value (the trace of a phase that passed the structural gate, P2), not a `ProofReceipt` level; `verified` is reserved for a receipt of level ≥ `defined_elements` (FRD-02.6). Existing `verified` trace rows with `task_shape LIKE 'harness:%'` become `legacy/unqualified` and do not enter the eval positives until a ProofReceipt exists (DIR-13 link: ADR-06).

**ADR-01-O6 (PROPOSAL).** Budget stop (DIR-08): keep D3 in "disclose-only" mode before `budgetStopResponse`; `AgentResponse` gets `budgetStop:true`; run status → `FAILED_RETRYABLE` with reason `budget_exhausted_before_verify` and the consumed budget preserved; the user may approve additional budget or accept a clearly marked draft; a mandatory gate is not removed retroactively.

**ADR-01-O7 (PROPOSAL).** The latency budget per task shape is **measured**, not adopted (brief §6.1): the measured median and p90 for `conversation` (classification + first token) and for each of the two recipe paths (classification → first phase start), on the reference local model and the reference hardware, are measured in W3 (Delivery plan §2 W3 Output: "latency budget per task shape (measured, not the 10-min assumption)") and serve as an **input to DQ-09** (Delivery plan §6: "latency budget per task shape (measured in W3)", locked before B3/F2), before the threshold is locked (brief §16 introductory paragraph). This is **not** a separate G2 exit criterion: Delivery plan §1 G2 (a)–(i) does not contain it, and this ADR does not add it.

**ADR-01-O8 (PROPOSAL).** The order of fixes in W0 is mandatory: F-HARN-01 (skip default) and F-HARN-08 (self-reported evidence) before F-HARN-02/03 (gate values) — a strict gate that reads fabricated data is worthless; F-HARN-04 (`run_harness` out of the verification set) and F-HARN-05 (budget disclose-only) independently. [harness.refute.md cross-cutting 2]

**ADR-01-O9 (PROPOSAL; H-07, 30.09.2026).** The outcome of a `work` run is determined exclusively by the FRD-05.9 table: mode × mandatory/optional gate × verdict → `DurableRun.status`, `ProofReceipt.verdict`, `ProofReceipt.level`. O3, O4 and O6 are derived from it and must not contradict it. `conversation` is listed in the O3 table for comparison; it has no `mode`, gates or `ProofReceipt` (O1). A mandatory gate in `strict`/`benchmark` cannot be bypassed through `CONDITIONAL`, `NOT_RUN` or "Completed (verify skipped)". Ratification of this rule goes together with ADR-01 (RAT-03); until then it is a PROPOSAL.

## §3 — What it supersedes and why

| Previous decision / state | Where | Why it changes |
|---|---|---|
| Auto-skip of the verify phase when `WAGGLE_AUTO_VERIFY` is not set (deliberately kept) | `93ff7813` commit message; `workflow-harness.ts:313,474-482` | Fail-open default contrary to DIR-03/07; production default = skip; "Completed" without a marker (CONFIRMED AT REVISION) |
| `run_harness` as a verification tool | `9fce1d2f` (2026-07-20), `verification-gate.ts:33` | Carried over mechanically from the old regex (`run_`), without a decision; orchestration is not verification (CONFIRMED AT REVISION) |
| Harness selection = the model reads the `compose_workflow` text | `workflow-tools.ts:84-119` | No server-side classification and no mode; the user neither sees it nor can correct it (CONFIRMED AT REVISION) |
| FRD v1.1 §3 step 3 and §5 "Verification is mandatory in strict/benchmark recipes" without a definition of modes | docs/plans/v1.2-evidence/inputs/Waggle_FRD_v1.1_2026-09-27.md:45,89 | Refined by table O3; `conversation` gets explicit treatment (S1 A4 ACCEPT/REFINE) |
| S1 A4 "a single ExecutionMode table (normal/strict/benchmark)" | docs/plans/v1.2-evidence/inputs/S1-audit-2026-09-27.md A4 | Split into two axes per brief §6.1; a mode does not expand permissions |
| `harness:phase:complete → 'verified'` | `harness-trace-bridge.ts:11,91` | Structural gate ≠ content confirmation; contaminates the eval set (CONFIRMED AT REVISION) |

**ADR-01-Z1 (DECISION — not reopened · PROPOSAL — BRIEF DIRECTION — brief §5.1).** DECISION: D-01..D-18 are not the subject of this ADR. PROPOSAL — BRIEF DIRECTION: "Option A ship first" is not the working basis (brief §5.1 planner direction: G1 → G2 → G3).

## §4 — Consequences

**ADR-01-P1 (PROPOSAL).** Tests that turn red and must be updated together with the fix (CONFIRMED AT REVISION that they exist and pin the current behavior): `packages/agent/tests/workflow-tools-harness.test.ts:135-179` (relies on the auto-skip), `:82-106` (Gather gate on self-reported `search_memory`), `packages/agent/tests/harness-trace-bridge.test.ts:82-92,327` (pins `'verified'`). No test pins `ok:true/durationMs:0`.

**ADR-01-P2 (PROPOSAL).** `gate_passed` as a new `TraceOutcome` requires a SQLite table-rebuild migration (`execution-traces.ts:150-151`, `schema.ts:242-243` CHECK). Schema-free alternative: the bridge writes `'pending'` + a `gate_passed` tag in `tags[]` (`harness-trace-bridge.ts:134`), and `EvalDatasetBuilder.positiveOutcomes` (already configurable, `eval-dataset.ts:66,208`) excludes those rows. The choice is made in the ADR-02 migration map; `schema.ts` is part of the OSS substrate (CLAUDE.md §7.5), `execution-traces.ts` is OSS-EXCLUDED — the drift baseline should be updated (UNKNOWN whether the baseline covers the block `schema.ts:235-253`).

**ADR-01-P3 (PROPOSAL).** `run_harness` becomes an internal execution primitive beneath the server router (W3), not a tool that the model chooses; keep it exposed in `power` mode for advanced users until W3 is complete, with the `selfReported` marker in `normal`.

**ADR-01-P4 (PROPOSAL).** Every `harness:phase:*` payload gets `runId` (+ `workspaceId/sessionId`), `createHarnessRun(harness, {runId,…})`, `advancePhase(state, harness, output, runId)`; the `HarnessTraceBridge` resolver reads `ev.runId` (the resolver mechanism already exists: `harness-trace-bridge.ts:54-56,80-86`, tests `:197-237`). A full per-run bus with `seq` = ADR-02/ADR-03.

**ADR-01-P5 (PROPOSAL).** Receipt impact: the changes touch the chat/harness/verify surface → every W0 fix invalidates carry-forward and goes into the next freeze (S1 A1; brief §15.4). No receipt covers `2af0904d` (CONFIRMED AT REVISION, release-oss.md F-REL-02).

**ADR-01-P6 (PROPOSAL).** UX: Work Progress shows `interaction/mode`, phase, status (`running|done|failed|blocked|skipped`), the blocker and "View work"; no percentage and no ETA (brief §11.1). `getRunSummary` `**Status:** Completed` gets a suffix when a `skipped` phase exists.

## §5 — Risk

| ID | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| ADR-01-R1 | Misclassification `conversation`→`work` introduces latency and cost into ordinary chat | medium / high (UX regression; UX score arc 2026-07) | O2 visible/correctable decision before RUNNING; O7 measurement; `conversation` as default for short queries |
| ADR-01-R2 | Inverting the skip default breaks existing harness tests and the behavior of `research-verify` in production | high / medium | P1 list; feature flag `WAGGLE_AUTO_VERIFY=0` as an explicit opt-out only in `normal` |
| ADR-01-R3 | `gate_passed` migration on users' `execution_traces` databases | medium / medium | schema-free tag-based variant (P2) or migration with dry-run and rollback (ADR-02 §6) |
| ADR-01-R4 | Strict mode without a server-observed provider blocks every run (fail-closed until W1) | high if strict is enabled before O4 | O8 order; strict opt-in until `observedToolCalls` exists |
| ADR-01-R5 | Benchmark mode exploited to "loosen" gates for a better score | low / critical (DIR-22/23) | O3 invariant rule; the manifest records `mode` and gate outcomes; AT-28 |
| ADR-01-R6 | Persona/prompt changes for `mode` change the persona receipt surface | high / medium | batching into the freeze (A1) |

## §6 — Migration test (RED before the fix, GREEN after)

| ID | Test | Location (proposal) | Expectation | AT |
|---|---|---|---|---|
| ADR-01-T1 | `research-verify` run without `WAGGLE_AUTO_VERIFY` reaches the verify phase; `completed=false` until verify passes | `packages/agent/tests/workflow-tools-harness.test.ts` (new `it`) | RED today (repro 01a–d CONFIRMED: `verify='skipped'`, `completed=true`) | AT-01 |
| ADR-01-T2 | Verify with `VERDICT: FAIL` → `passed:false`; `CONDITIONAL` → non-PASS outcome per `conditionalPolicy`; under the strict flag no policy yields `completed=true` (FRD-05.9 S3) | `packages/agent/tests/builtin-harnesses.test.ts` (new) | RED today (repro 02a–d: FAIL `passed:true`) | AT-01 |
| ADR-01-T3 | Test/build gate per FRD-05.2 VI-1..VI-9: self-reported `tool_calls:[{tool:'bash', args:{command:'echo hi'}}]` does not pass; observed `echo "npm test"`, `echo "pytest"`, `npm test \|\| true` and `npm test; exit 0` with a failing test do not pass; `Exit code: 1` does not pass; `my_bash_like_tool` does not pass; an observed approved `npm test` with exit 0 after the last change passes (AT-02-P1..P2, AT-02-N1..N15) | same | RED today (repro 03a–c); N1–N15 are new cases | AT-02 |
| ADR-01-T4 | `assertsUnverifiedCompletion('All tests pass…', ['run_harness'])` → `true` | `packages/agent/tests/verification-gate.test.ts` | RED today (`false`) | AT-01/02 |
| ADR-01-T5 | Budget stop with `SUCCESS_ASSERTION` content gets a disclosure suffix and `budgetStop:true` | `packages/agent/tests/verification-gate-loop.test.ts` | RED today (repro 05a: `fired:false`) | AT-03 |
| ADR-01-T6 | `run_harness` with fabricated `tool_calls` (FRD-05.9 R3): in `strict` → gate `FAIL`; in `normal` on a gate that is not a test/build gate (Gather: `search_memory`/`recall_memory`) → transitionally accepted, `selfReported:true` in the state, outcome per the verdict; in `normal` on a test/build gate (fabricated `bash`) → `FAIL` (T3) | `workflow-tools-harness.test.ts` | RED today (repro 08a: `Completed`) | AT-01/02 |
| ADR-01-T7 | Two `createHarnessRun` in two workspaces → two `harness:phase:complete` with different `runId`; bridge trace `workspaceId` populated | `packages/agent/tests/harness-trace-bridge.test.ts` (new) | RED today (repro 07a–b) | AT-06 |
| ADR-01-T8 | `harness:phase:complete` → trace outcome ≠ `'verified'`; `EvalDatasetBuilder` by default does not take that row as positive | `harness-trace-bridge.test.ts:82-92,327` (rewrite) | RED today | AT-01/AT-29 |
| ADR-01-T9 | Migration: existing rows `task_shape LIKE 'harness:%' AND outcome='verified'` marked `unqualified`; dry-run returns the count; rollback restores the marking without deleting history | `packages/hive-mind-core/tests/mind/execution-traces-migration.test.ts` (new) | n/a (new) | AT-27 |
| ADR-01-T10 | Classification: greeting → `conversation`; "make a research brief from the attached sources" → `work`; the user can change it before RUNNING; `mode` recorded in the run | `packages/server/tests/local/work-classifier.test.ts` (new, W3) | n/a (new) | AT-21 |
| ADR-01-T11 | FRD-05.9 table test: one case each for N1–N8, S1–S8, B1–B8; unstructured CONDITIONAL in strict → not COMPLETED (R4); `WAGGLE_AUTO_VERIFY=0` in strict → verify is executed (R5); self-reported evidence in strict → FAIL (R3a); self-reported on a test/build gate in normal → FAIL (R3b); self-reported on a gate that is not a test/build gate in normal → accepted with `selfReported:true` (R3c); two gates of different classes → the worst outcome (R12) | G1 subset: `packages/agent/tests/workflow-tools-harness.test.ts` (W0-PR1/PR2/PR8); full set: the test suite of the package that W3-PR6 changes (the PR names it) | n/a (new; at `2af0904d` `mode`, `conditionalPolicy` and `NOT_RUN` do not exist) | AT-01 |

**Verification boundary (CONFIRMED AT REVISION):** the repro against `packages/agent/dist` (docs/plans/v1.2-evidence/phaseA/repro-harness.mjs, 25/25) is mechanism-level; a real chat turn with a provider and a real `bash` were not executed; the repo suite was not run.

## §7 — Sources

- **D:** D-06, D-08, D-13, D-18 (brief §3)
- **DIR:** DIR-03, DIR-04, DIR-07, DIR-08, DIR-22, DIR-23 (brief §6.1, §6.2, §7.1–7.3, §13)
- **C/A/R:** C8, C12 (harness part), C21; A4, A5, A6, A11, A17 (outcome taxonomy); R04, R07
- **AT:** AT-01, AT-02, AT-03, AT-06, AT-21, AT-28
- **Phase A:** `docs/plans/v1.2-evidence/phaseA/harness.md` F-HARN-01..09; `docs/plans/v1.2-evidence/phaseA/harness.refute.md` (7/7 HOLDS; paths `packages/agent/src/system-tools*.ts`, `tool-executor.ts`; `budgetStopResponse` in `agent-loop.ts:895`); `docs/plans/v1.2-evidence/phaseA/durable.md` F-DUR-08, F-DUR-13; `docs/plans/v1.2-evidence/phaseA/evolution.md` F-EVO-12; `docs/plans/v1.2-evidence/phaseA/repro-harness.mjs`
- **S1:** spot-check L5–L10; A4, A5, A6, A11; W0, W1, W3
- **Code (at `2af0904d`, confirmed `git status` clean):** `packages/agent/src/workflow-harness.ts:132,313,474-482`; `builtin-harnesses.ts:128,181`; `verification-gate.ts:33`; `agent-loop.ts:895-920,1523-1534`; `loop-gates.ts:903-935`; `workflow-tools.ts:84-119,330-358,412-422,447`; `harness-trace-bridge.ts:91,139-148`; `system-tools.ts:681-691`; `system-tools-helpers.ts:732-735`; `task-shape.ts:145`; `workflow-composer.ts:99-104`; `feature-flags.ts:14,26`; `packages/server/src/local/index.ts:612-616`; `packages/hive-mind-core/src/mind/execution-traces.ts:20,150-151`; `schema.ts:242-243`
