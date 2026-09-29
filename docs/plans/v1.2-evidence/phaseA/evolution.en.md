# Phase A — revalidation of the "evolution" group at revision `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`

> **English translation** of [evolution.md](evolution.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

Date: 2026-09-27. Repo: `D:/Projects/waggle-os`, branch `main`, `git status` clean (working tree == HEAD; the only untracked files are two `.docx` files in `docs/`). All `path:line` references were read from the working tree at that revision. Reproductions were run **read-only** against `packages/agent/dist` (ESM build; key functions `listPersonas`, `isRunningJudge` guard, `scoreCandidate(baseline, microSample…)`, `sourceFromTraces([...], true, …)` compared with `src` and found identical); scripts and temporary files live exclusively in the planner workspace (now `docs/plans/v1.2-evidence/phaseA/repro-shadow.mjs`, `docs/plans/v1.2-evidence/phaseA/repro-gepa-delta.mjs`).

Sources: BRIEF §10 (DIR-13/14/15), AT-04, AT-05, AT-29; S1 L11, L13, C10, A16–A19, W3e; PRD §9; FRD §8/§14/§15.

Status labels: **CONFIRMED AT REVISION** (finding reproduced or proven by reading code at 2af0904d), **ALREADY CLOSED** (the S1 claim has already been fixed, with evidence), **PARTIAL/UNWIRED** (the mechanism exists, but is not wired or only part of it is closed), **UNKNOWN** (not verified in this pass), **PROPOSAL** (only the "smallest change" — not approved, not architecture).

---

## 0. Map "who calls → what it produces → where it is stored → how the active version is selected → which next run uses it" (DIR-13)

| Module | Callers (git grep, excluding dist/tests) | Produces | Stored in | Active version | Next run uses it? |
|---|---|---|---|---|---|
| `AgentLearning` (`packages/agent/src/agent-learning.ts:43`) | **0** — only the barrel export `packages/agent/src/index.ts:231`; no `new AgentLearning` anywhere | `LearningSnapshot`, `formatLearningPrompt()` | `improvement_signals` (via `ImprovementSignalPort`) | n/a | **No** (dead code) |
| `processInteractionForImprovement` (`improvement-wiring.ts:97`) | **0** in src; the header `improvement-wiring.ts:2` says "Not exported from index.ts — future feature, tested but not wired" | correction/capability gap/workflow pattern | nothing (pure detector) | n/a | **No** |
| `detectCorrection` (`correction-detector.ts`), `improvement-detector.ts`, `ExecutionTraceStore.markCorrected` (`hive-mind-core/src/mind/execution-traces.ts:473`) | **0** production callers (`markCorrected(` — 0; `correction-detector`/`improvement-detector` is imported only by `improvement-wiring.ts`) | outcome `corrected` | `execution_traces` | n/a | **No** — `corrected` is **never written** in production (`chat-turn-completion.ts:371-375` always `outcome: 'success'`; the comment "correction-detector may downgrade it" is not true) |
| Thumbs-down → `signalStore.record('correction', …)` (`packages/server/src/local/routes/feedback.ts:91-94`) → `getActionable()` → `# User Corrections` in the prompt (`routes/chat.ts:1485-1496`) | wired | correction text in the volatile tail of the prompt | `improvement_signals` (personal mind) | threshold `count >= threshold` (`improvement-signals.ts:112-128`) | **Yes** — this is the only live "learning" flow. `markSurfaced` is called by no one except the unwired `improvement-detector.ts:206-208`, so the signal is injected into every subsequent prompt until it passes the thresholds — this behavior was not verified through a test in this pass (UNKNOWN) |
| `EvolveSchema` (Stage 1 in `compose-evolution.ts:174-184`) | `ComposeEvolution.run` ← `EvolutionOrchestrator.runOnce` ← `POST /api/evolution/run` (`routes/evolution.ts:468,492`) and `EvolutionService.defaultRunner` (`evolution-service.ts:320`) | `frozenSchema`, `winner_schema_json` | `evolution_runs.winner_schema_json` (`evolution-orchestrator.ts:224`) | none | **No** — Stage 2 does not receive the schema (`compose-evolution.ts:191-196`), deploy ignores it (`routes/evolution.ts:51-82`), the UI does not render it (type only: `EvolutionTab.tsx:32,45`) |
| GEPA winner (`IterativeGEPA.run`) | same as above | `winner.prompt` → `winner_text` | `evolution_runs` | `.json` override file (`{dataDir}/personas/<id>.json` or `behavioral-overrides/<section>.json`) + one `.bak` | persona: **No** (shadowed, F-EVO-01); behavioral-spec: **Yes** (`index.ts:626-635`, `chat.ts:1441-1444`) |

---

## 1. Findings

### F-EVO-01 — The evolved persona override is shadowed by the built-in persona in the chat consumer (S1 L11, C10; AT-04)
- **Status:** CONFIRMED AT REVISION
- **Commit:** `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`
- **Path/symbol:** `packages/agent/src/personas.ts:67-70` `listPersonas()` returns `[...PERSONAS, ...custom]` (built-ins first). `packages/server/src/local/routes/chat.ts:439-440` `resolvePersona(id) = listPersonas().find(p => p.id === id)` — `find` returns the **first** match = the built-in one. Callers: `chat.ts:761` (turnPersona), `:1292`, `:1303`, `:1311`, `:1508` (activePersona for the system prompt). Same pattern: `packages/server/src/local/fleet-run-executor.ts:127,590`, `routes/agent-groups.ts:87`, `routes/fleet.ts:354`.
- **Input:** `deployPersonaOverride(dataDir, { personaId: 'coder', systemPrompt: 'EVOLVED ROUTING v2' })` (exactly what `deployFromRun` in `routes/evolution.ts:53-62` does), then `setPersonaDataDir(dataDir)` (as in `server/src/local/index.ts:552`), then `resolvePersona('coder')`.
- **Current output (repro `docs/plans/v1.2-evidence/phaseA/repro-shadow.mjs`):** `listPersonas()` has 2 entries with `id=coder`; `entry[0]` = built-in, `entry[1]` = evolved; `resolvePersona('coder').systemPrompt includes EVOLVED? false`. So after "Accept & Deploy" the status becomes `deployed`, the file is written, the `persona:reloaded` event is emitted — and no chat turn uses the new prompt.
- **Repro test / limitation:** the script above, against `dist`. The existing test `packages/agent/tests/evolution-deploy.test.ts:109-123` stays green because the predicate is `p.id === 'coder' && p.systemPrompt.includes('EVOLVED ROUTING')` (it matches the **second** entry); `packages/server/tests/evolution-routes.test.ts:169-188` checks only the file on disk and `status === 'deployed'`. No test checks the next effective prompt. The historical document `docs/GEPA-SCOPE-AUDIT-2026-04-30.md` §3 proposed switching `getPersona → listPersonas`; the switch was done (comment `chat.ts:427-438`), but the ordering in `listPersonas` makes the fix ineffective for shadow IDs.
- **Expected behavior:** an activated override enters the next actual prompt; rollback changes the next run; an existing run stays on its own version (AT-04).
- **Smallest change (PROPOSAL):** in `listPersonas()` a custom persona with the same `id` must replace the built-in one (e.g. a `Map` keyed by `id`, custom last), or `resolvePersona` picks custom first; RED test: `resolvePersona('coder').systemPrompt === override` + a route test that `POST /api/chat` after accept contains the override in the system prompt; apply the same to the fleet/agent-groups consumers.
- **Related AT:** AT-04

### F-EVO-02 — No active-version pointer; the baseline for the next round reads the built-in persona; rollback functions have no caller; no `rolled_back`; `persona:reloaded` has no consumer (S1 A2/A18, W3e; AT-04)
- **Status:** CONFIRMED AT REVISION
- **Commit:** `2af0904d…`
- **Path/symbol:** `routes/evolution.ts:259` (`GET /api/evolution/baseline` → `getPersona(name)` = built-in only, see `personas.ts:54-57`); `services/evolution-service.ts:277` `resolveBaseline` → `getPersona`; the UI loads the baseline from there (`EvolutionTab.tsx:1042`). `evolution-deploy.ts:119-135` `rollbackPersonaOverride` and `:220-235` `rollbackBehavioralSpecOverride` — **0 callers** in `packages/server/src` and `apps/web/src` (grep `rollback*Override|rollback`). `hive-mind-core/src/mind/evolution-runs.ts:23-28,95-96` status enum + SQL `CHECK` without `rolled_back`. `routes/evolution.ts:185` emits `persona:reloaded`; `eventBus.on('persona:reloaded')` does not exist anywhere (the only `on` is `behavioral-spec:reloaded`, `index.ts:630`). The backup is a single-level `.bak` (`evolution-deploy.ts:79-82`).
- **Input:** deploy an override for `coder`, then `GET /api/evolution/baseline?kind=persona-system-prompt&name=coder`.
- **Current output:** the built-in prompt (repro: `getPersona('coder') includes EVOLVED? false`). The second evolution round starts from the built-in version; a "version" exists only as a row in `evolution_runs` with no link to the file on disk.
- **Repro test / limitation:** same repro; the absence of rollback = grep evidence; a server restart was not tested.
- **Expected behavior:** a versioned registry with an explicit active pointer per target; rollback restores the previous active version and changes the next run; the baseline endpoint reads the active version.
- **Smallest change (PROPOSAL):** the baseline endpoints use the same resolver as chat (after F-EVO-01); a `POST /api/evolution/runs/:uuid/rollback` that calls the existing `rollback*Override` + a new status `rolled_back` (migration of the `CHECK` constraint in `evolution_runs`); a UI button; `evolution_runs` records `active_from/active_until`.
- **Related AT:** AT-04

### F-EVO-03 — "The candidate is executed before scoring" (S1 W0/W3e, PRD §9 "Audit/fix production evolution"; AT-05)
- **Status:** ALREADY CLOSED (for production paths), with a caveat in F-EVO-04
- **Commit:** `2af0904d…`
- **Path/symbol:** `packages/agent/src/evolution-llm-wiring.ts:415-452` `RUNNING_JUDGE_BRAND` + `makeRunningJudge` (executes `buildRunPrompt(candidate, input)` through `llm.complete`, then `baseJudge.score({...args, actual: modelOutput})`); `iterative-optimizer.ts:173-184` `IterativeGEPA.run` throws an error for a bare judge without `allowBareJudge` (H-09 G3); `compose-evolution.ts:142-149` preserves the brand after `filterJudgeFeedback`. Production callers pass the running judge: `routes/evolution.ts:376-377,404`; `services/evolution-service.ts:309-310,332`. Stage 1 (`evolve-schema.ts:350-379` `scoreSchemaCandidate`) also executes (`execute` then `judge`).
- **Input/output:** tests `packages/agent/tests/iterative-optimizer.test.ts:424-445` (guard) and `tests/evolution-llm-wiring.test.ts:266-330` (the running judge calls the LLM with the candidate and scores the output).
- **Verification limitation:** no live provider run was performed; the comment in `iterative-optimizer.ts:393-397` ("We treat it as the model's actual response…") is stale and describes the old prompt-as-output behavior. The guard can be bypassed with `allowBareJudge: true` (allowed in tests).
- **Expected:** as in AT-05 — the test recognizes the prompt-as-output case. It exists for the GEPA stage; there is no end-to-end route-level test that `llm.complete` was called with the candidate before the judge call (UNKNOWN — not found by grep `running|RUNNING_JUDGE` in `packages/server/tests/evolution-run-route.test.ts`).
- **Smallest change (PROPOSAL):** update the comment; add a route test that counts `complete()` calls per example (2 = execute + judge).
- **Related AT:** AT-05

### F-EVO-04 — Executor == judge (the same Haiku LLM), execution goes neither through the target model/router nor through the composed system prompt; no model/runtime manifest and no saved outputs (S1 A19; BRIEF 10.2, 10.4; AT-05)
- **Status:** CONFIRMED AT REVISION
- **Commit:** `2af0904d…`
- **Path/symbol:** `routes/evolution.ts:365,376-379` and `evolution-service.ts:304,309-312`: a single `llm` builds `baseJudge`, `makeRunningJudge(baseJudge, llm)`, `buildSchemaExecuteFn(llm)`, `buildGEPAMutateFn(llm)`. `evolution-llm-wiring.ts:214-260` `createAnthropicEvolutionLLM` hard-codes `AxAI.create({name:'anthropic'})` + `Claude45Haiku`. `buildRunPrompt` (`:454-461`) = `candidatePrompt + "USER INPUT:" + input` in **a single user turn** (`:240-242` `chatPrompt:[{role:'user'}]`), without `composePersonaPrompt` (core prompt + behavioral spec), without tools, without the user's selected model. Run artifacts: `evolution-orchestrator.ts:230-235` store only `runSeed/generations/paretoFrontSize/exampleCount` — no model, no per-example outputs.
- **Input:** target `persona-system-prompt`/`behavioral-spec-section`.
- **Current output:** the persona prompt evolves in isolation from the runtime it will operate in; the evaluator and the generator are the same model with no bias-risk label; there is no saved output with which to verify post-hoc what was executed (BRIEF 10.2 "Save the outputs and the model/runtime manifest").
- **Repro/limitation:** code reading; the effect on quality was not measured.
- **Expected:** execution through the target runtime (local model/provider router) with the composed prompt; a different model family is preferred, not mandatory (BRIEF A19 "CHANGE THE ABSOLUTE CONDITION"); manifest and outputs saved.
- **Smallest change (PROPOSAL):** an `EvolutionLLM` adapter over the existing provider router (the contract is `complete(prompt)`); replace `buildRunPrompt` with a call that uses `composePersonaPrompt(core, {systemPrompt: candidate})` as the system message; write `{executorModel, judgeModel, perExampleOutputs (redigovano)}` into `artifacts`.
- **Related AT:** AT-05, AT-26 (KVARK without cloud fallback)

### F-EVO-05 — The EvolveSchema winning schema is used neither in Stage 2 execution nor in deploy (S1 C10, R19; PRD §9 "Preserve EvolveSchema"; AT-05)
- **Status:** CONFIRMED AT REVISION
- **Commit:** `2af0904d…`
- **Path/symbol:** `compose-evolution.ts:184` `frozenSchema = schemaResult.winner.schema`; `:191-196` `new IterativeGEPA().run({...options.instructions, judge: filteredJudge, …})` — the schema is **not** passed; `makeRunningJudge`/`buildRunPrompt` have no schema parameter; `routes/evolution.ts:51-82` `deployFromRun` writes only `run.winner_text`; `winner_schema_json` exists in the database (`evolution-orchestrator.ts:224`) and in the GET detail (`routes/evolution.ts:133-136`), the UI does not display it (`EvolutionTab.tsx:32,45` types only). Stage 1 consumes the default `populationSize 5 × generations 3 × evalSize 32 + anchor 100` LLM calls (`evolve-schema.ts:830-835`).
- **Input:** any run.
- **Current output:** the Stage 1 result affects only `combinedDelta`/`fullyImproved` (`compose-evolution.ts:198-201`) and the `paretoFrontSize` artifact.
- **Repro/limitation:** code reading (function signatures); `repro-gepa-delta.mjs (c)` shows that `runOnce` goes through Stage 1 and returns `frozenSchema`, but there is no channel to Stage 2.
- **Expected:** either the schema is used in target execution and deploy, or the stage is removed from the default compose (BRIEF R19: "Preserve the useful effect, not a no-op").
- **Smallest change (PROPOSAL):** pass `frozenSchema` into the Stage 2 executor (schema-fill part of the prompt, like `buildSchemaFillPrompt`) and into the deploy artifact; an AT-05 test that the Stage 2 executor sees the schema.
- **Related AT:** AT-05

### F-EVO-06 — Delta and the regression gate compare different samples; `combinedDelta` subtracts different metrics; null drops out of the denominator; infrastructure error = 0 (S1 A18; BRIEF DIR-15; AT-29)
- **Status:** CONFIRMED AT REVISION
- **Commit:** `2af0904d…`
- **Path/symbol:** `iterative-optimizer.ts:205-211` the baseline is scored **only** on `microSample` (`microScreenSize` 50); `:302-311` the anchor scores only `survivors` (the baseline is there only if it is not dominated); `:315-325` `delta = winner.score.overall − baseline.score.overall` (score = last phase). `evolution-orchestrator.ts:187-189` the same (`history[0].score.overall` vs `winner.score.overall`), the comment `:184-186` "Both are scored… on the same eval stage" is not accurate in the dominated case; `:194-199` the regression gate uses those numbers; `evolution-runs.delta_accuracy` = that number; the UI displays it as `deployed lift`. `compose-evolution.ts:198-200` `combinedDelta = gepa.winner.overall − schema.history[0].accuracy` (GEPA metric vs schema metric). `iterative-optimizer.ts:398-416` `scoreOne` returns `null` on abort/throw and filters them out before `aggregateScores` → `n` shrinks; `judge.ts:141-151` and `evolution-llm-wiring.ts:439-447` LLM/infra errors become score 0 (mixed with model failure).
- **Input (repro `docs/plans/v1.2-evidence/phaseA/repro-gepa-delta.mjs (a)`):** 400 examples, deterministic running judge (baseline 0.5/0.9 alternating → true mean 0.7; child 0.95), `microScreenSize 50`, `anchorEvalSize 400`, `seed 1`.
- **Current output:** `history[0].score.n = 50`, `winner.score.n = 400`; baseline (micro) `0.6840`; `GEPARunResult.delta = 0.2660`, whereas on the same sample it would be `0.2500`.
- **Repro/limitation:** the repro is synthetic; the direction of the error depends on the sample (it can overestimate or underestimate); not verified on real traces.
- **Expected:** baseline and candidate re-scored on the same examples and budget; CI/margin; errors do not drop out of the denominator; separate model/tool/infra/evaluator failure.
- **Smallest change (PROPOSAL):** in the anchor phase always score `baseline` as well (a separate `anchorScore` field, do not overwrite the micro score), compute delta/gate from the anchor pair; remove or rename `combinedDelta`; `aggregateScores` returns `n_failed` and `n_aborted`.
- **Related AT:** AT-29

### F-EVO-07 — The orchestrator bypasses `EvalDatasetBuilder.build()`: no secret scan, heuristics, dedup, split/holdout; correction = gold; no persona/workspace scope (S1 A16, A17; AT-29, AT-13, AT-19)
- **Status:** CONFIRMED AT REVISION
- **Commit:** `2af0904d…`
- **Path/symbol:** `evolution-orchestrator.ts:311-326` `buildExamplesFromTraces` → `builder.sourceFromTraces(['success','verified'], true, {...traceFilter, limit:500})`; `build()` (`eval-dataset.ts:207-325`, with secret scan `:232-245` and a 60/20/20 split) **has no production caller** (git grep: the only `EvalDatasetBuilder` in src is the orchestrator with `sourceFromTraces`). `eval-dataset.ts:359-381` `traceToExample`: for `corrected` `expected_output = correctionFeedback` (correction as gold). `traceFilter = options.autoTrigger?.traceFilter ?? {}` — `routes/evolution.ts:387-416` and `evolution-service.ts:320-339` do not pass `autoTrigger` → filter `{}`; the service filters `personaId` only for the dataset gate (`:229-236`), not for the run itself. `traceStore = new ExecutionTraceStore(multiMind.personal)` (`index.ts:591`), rows carry `persona_id`/`workspace_id` (`execution-traces.ts:59-60`), but are not filtered → traces of all personas and workspaces enter the candidate for a single persona. All examples go into the same micro/mini/anchor samples (no frozen holdout).
- **Input (repro `(b)`):** a trace with a `sk-ant-…` key in `payload.input`.
- **Current output:** `detectSecrets` = `anthropic-key` (build() would reject it), yet the secret **reached both the judge and the schema executor** (in production: sent to Anthropic).
- **Repro/limitation:** in-memory store; the actual SQLite `queryParsed` was not tested.
- **Expected:** frozen holdout + hash, provenance/scope per example, correction is a signal and not gold (BRIEF 10.4/10.5, A17).
- **Smallest change (PROPOSAL):** replace `sourceFromTraces` with `await builder.build({ traceFilter: { personaId, workspaceId }, includeCorrections: false, seed })`; GEPA phases on `train+val`, the final paired score on `holdout`; `artifacts` records the set hash and the number of views of the holdout.
- **Related AT:** AT-29, AT-13, AT-19

### F-EVO-08 — Evolution requires an Anthropic key in the vault; no local evaluator; no cost estimate, cap, or abort (S1 L13, A16; BRIEF 10.4; D-03/D-05)
- **Status:** CONFIRMED AT REVISION
- **Commit:** `2af0904d…`
- **Path/symbol:** `routes/evolution.ts:355-363` (`server.vault?.get('anthropic')` → 422 "No Anthropic API key configured"); `evolution-service.ts:177-180`; `index.ts:2751` `getApiKey: () => server.vault?.get('anthropic')`; `evolution-llm-wiring.ts:214-260` is the only production `EvolutionLLM` (Anthropic/Haiku), the only alternative is the test hook `__waggleEvolutionLlmFactory` (`routes/evolution.ts:632-641`). Grep `budget|maxCost|cost cap|estimate|consent|AbortController` over the evolution files and `EvolutionTab.tsx`: 0 relevant hits. An SSE client disconnect does not abort the run (`routes/evolution.ts:458-462`, intentional). Retry of up to 6 attempts with backoff of up to 150 s (`:87-93`) increases consumption without an upper bound.
- **Input:** a local profile without an Anthropic key, or KVARK mode.
- **Current output:** evolution unavailable (422) or covertly cloud-dependent; no display of where the data goes (traces of the user's work go to Anthropic, see F-EVO-07).
- **Repro/limitation:** the test `packages/server/tests/evolution-run-route.test.ts:132` confirms the 422; the actual cost was not verified.
- **Expected:** local evaluator by default; a BYOK judge with separate approval, minimization, budget, abort; in KVARK mode no cloud egress.
- **Smallest change (PROPOSAL):** an `EvolutionLLM` adapter over the provider router/selected local model; an explicit `consent` flag in the body for the cloud judge; an `AbortController` bound to SSE close + a `maxJudgeCalls` cap in `scoreCandidate`.
- **Related AT:** AT-29, AT-26

### F-EVO-09 — `AgentLearning` and the improvement wiring are dead code; `corrected` traces are not produced; a partial replacement exists (thumbs-down → signal → prompt) (S1 C10, R18; PRD §9 "Preserve behavior learning… persona effectiveness")
- **Status:** CONFIRMED AT REVISION (dead code) + PARTIAL/UNWIRED (the replacement exists only for a part)
- **Commit:** `2af0904d…`
- **Path/symbol:** see the table in §0. Additionally: `AgentLearning.recordPersonaTask` (`agent-learning.ts:69-77`) — the only source of "persona effectiveness" — has no caller, so the PRD claim about persona effectiveness learning has no producer. Live flow: `feedback.ts:91-94` → `improvement_signals('correction')` → `chat.ts:1485-1496` "# User Corrections (from prior sessions — follow these)". `capability_gap` signals are produced by `chat.ts:955-969` (`recordCapabilityGap`), `skill_promotion` is produced by `chat-turn-completion.ts:199-212`.
- **Input:** a textual user correction in the next turn ("no, I meant…").
- **Current output:** nothing is recorded as a correction (neither a `corrected` trace, nor a signal); only an explicit thumbs-down with a `reason` produces a signal.
- **Repro/limitation:** grep evidence; the end-to-end thumbs-down flow was not tested.
- **Expected:** BRIEF C10/R18: prove effective behavior; do not preserve a no-op; deletion is not "solved learning".
- **Smallest change (PROPOSAL):** a wire-vs-remove decision; if wire: `processInteractionForImprovement` in `chat-turn-completion` → `traceStore.markCorrected(prevTraceId, detail)` + `signalStore.record('correction', …)`; merge `AgentLearning.formatLearningPrompt()` with the existing "# User Corrections" section (one channel, not two); `recordPersonaTask` from `finalizeOnce`. If remove: remove the export `index.ts:231` and reword PRD §9.
- **Related AT:** (none direct; input for AT-29 correction ≠ gold)

### F-EVO-10 — The UI and documentation claim "deployed/hot-reload/score-verified", which the runtime does not confirm (S1 W0 "hide/guard Evolution 'deployed'"; DIR-13 "remove false UX claims")
- **Status:** CONFIRMED AT REVISION
- **Commit:** `2af0904d…`
- **Path/symbol:** `apps/web/src/components/os/apps/memory/EvolutionTab.tsx:759` "Accept & Deploy"; `:771` "Accepting writes an override file and hot-reloads the spec"; `:191-192, :212` "The run that actually shipped (status === 'deployed')"; `:883` `deployed lift`; `:237-247` `deriveProvenance` → "regression gate · score-verified". `evolution-runs.ts:192-201` `markDeployed` is set as soon as the `deploy` callback does not throw (file written), without an activation check. `docs/backend-map/sections/05d-subsystem-evolution.md:5` ("versioned, rollback-able override and hot-reloads the live spec") and `:94` (event "invalidate the chat route's system-prompt cache" — the consumer does not exist).
- **Input:** accepting a persona run.
- **Current output:** status `deployed` + "deployed lift" for a change that no chat turn uses (F-EVO-01); "score-verified" derived from a gate with unpaired samples (F-EVO-06). For `behavioral-spec-section` the claim "hot-reloads the spec" is accurate (F-EVO-11).
- **Repro/limitation:** reading of code/copy; the UI was not captured.
- **Expected:** the status reflects activation; the copy depends on the target kind.
- **Smallest change (PROPOSAL):** after F-EVO-01/02 — before `markDeployed` verify that the resolver returns the written prompt (activation check), otherwise status `written_not_active`/`failed` with a reason; remove "score-verified" until the gate compares a paired holdout.
- **Related AT:** AT-04

### F-EVO-11 — The behavioral-spec override path works (S1 did not claim otherwise; confirmation of a positive state)
- **Status:** ALREADY CLOSED / works (with a caveat)
- **Commit:** `2af0904d…`
- **Path/symbol:** `evolution-deploy.ts:184-259` (`deployBehavioralSpecOverride`, `loadBehavioralSpecOverrides`), `packages/agent/src/behavioral-spec.ts:409-437` `buildActiveBehavioralSpec`, `index.ts:626-635` (loading at boot + `on('behavioral-spec:reloaded')` re-decoration), `chat.ts:1264-1314,1441-1444` (`server.activeBehavioralSpec ?? BEHAVIORAL_SPEC`), test `evolution-routes.test.ts:190`.
- **Caveat:** `systemPromptCache` (`chat.ts:993,1318-1329`) is not explicitly invalidated on `behavioral-spec:reloaded`; the key is per session, validation is by `historyLength/personaId/model…`, so the new spec takes effect only when `historyLength` changes (in practice, the next turn). Not reproduced; this relies on code reading and the historical `GEPA-SCOPE-AUDIT` §2.
- **Related AT:** AT-04 (for the spec part)

### F-EVO-12 — The `verified` outcome in the eval set comes from `harness:phase:complete`, not from a content check (cross-cutting with the harness group; BRIEF §7.3; S1 A17)
- **Status:** PARTIAL/UNWIRED (owner: the harness group; here only the consequence for evolution data)
- **Commit:** `2af0904d…`
- **Path/symbol:** `packages/agent/src/harness-trace-bridge.ts:9-14, 91, 123, 155` (`harness:phase:complete → trace outcome 'verified'`), instantiated in `index.ts:612-618`; `evolution-orchestrator.ts:302` and `:321` treat `verified` as a positive/gold example; `evolution-service.ts:110` in the dataset gate. No other producer of `verified` was found in `packages/server/src` (grep `'verified'`).
- **Expected:** BRIEF §7.3 — legacy `verified` without evidence = unqualified; only qualified traces enter the eval set.
- **Smallest change (PROPOSAL):** in eval selection, separate `gate_passed` from `verified` (ProofReceipt) as soon as W1 defines ProofReceipt; until then `positiveOutcomes: ['success']` + an explicitly labeled qualification.
- **Related AT:** AT-29

---

## 2. What exists and should be preserved (existingAssetsToPreserve)

| What | Path | Callers (grep) |
|---|---|---|
| Running judge + brand + GEPA guard (candidate execution before scoring) | `packages/agent/src/evolution-llm-wiring.ts:415-452`; `iterative-optimizer.ts:173-184`; brand propagation `compose-evolution.ts:142-149` | `routes/evolution.ts:377,404`; `services/evolution-service.ts:310,332`; tests `iterative-optimizer.test.ts:424-445`, `evolution-llm-wiring.test.ts:266-330` |
| Behavioral-spec override pipeline (deploy → load → active spec → chat prompt) | `evolution-deploy.ts:184-259`; `behavioral-spec.ts:409-437`; `index.ts:626-635`; `chat.ts:1264-1314,1441-1444` | `routes/evolution.ts:63-73` (deploy), `routes/evolution.ts:269-284` (baseline reads the active spec), `evolution-service.ts:279-287`; test `evolution-routes.test.ts:190` |
| `EvolutionRunStore` audit trail (every run, including rejected ones) | `packages/hive-mind-core/src/mind/evolution-runs.ts` | `index.ts:622-623`; `routes/evolution.ts:113,130,166,210,218,518`; `evolution-orchestrator.ts:219-253`; `evolution-service.ts:222` |
| Gates (size/growth/structure/regression) | `packages/agent/src/evolution-gates.ts:99-135` | `evolution-orchestrator.ts:194-204`; test `tests/evolution-gates.test.ts` |
| `EvalDatasetBuilder.build()` with secret scan/heuristics/dedup/60-20-20 split + `detectSecrets`/`redactSecrets` | `packages/agent/src/eval-dataset.ts:96-145, 207-325` | `build()` **without a production caller** (only `sourceFromTraces` from `evolution-orchestrator.ts:319-325`); `redactSecrets` is used by `server/src/local/executor-brief.ts:72`; export `agent/src/index.ts:237` |
| Persona override writer/rollback (atomic write, `.bak`, Windows rename retry) | `evolution-deploy.ts:68-135, 277-305` | deploy: `routes/evolution.ts:57`; rollback: **0** callers (only tests `evolution-deploy.test.ts`) |
| Custom personas loader/CRUD with protection of built-in IDs | `packages/agent/src/custom-personas.ts:34-70`; `routes/personas.ts:72-74, 208-210` (409/403 for a built-in id) | `personas.ts:68`; `routes/personas.ts`; note: the deploy path (`deployPersonaOverride`) intentionally **bypasses** that protection and writes a shadow ID |
| Live "learning" flow: thumbs-down → `improvement_signals('correction')` → "# User Corrections" in the prompt; `capability_gap` and `skill_promotion` signals | `routes/feedback.ts:91-94`; `chat.ts:955-969, 1485-1496`; `chat-turn-completion.ts:199-212`; `hive-mind-core/src/mind/improvement-signals.ts:80-141` | `fastify.agentState.orchestrator.getImprovementSignals()`; `monthly-assessment.ts:136-138,246` |
| `ExecutionTraceStore` substrate with `persona_id`, `workspace_id`, `model`, `markCorrected` API | `hive-mind-core/src/mind/execution-traces.ts:56-61, 473-490` | `index.ts:591`; `chat.ts:1653` (`TurnExecutionTrace`), `chat-turn-completion.ts:374-383` (`finalizeOnce`), `fleet.ts:442`, `external-tool-runs.ts:795,851`, `agent-groups.ts:617` |
| `EvolutionService` opt-in daemon (only `proposed`, never auto-deploy) | `services/evolution-service.ts`; `index.ts:2747-2767`; env `WAGGLE_EVOLUTION_AUTO_ENABLED`, `WAGGLE_EVOLUTION_TICK_INTERVAL_MS`, `WAGGLE_EVOLUTION_MIN_TRACES` | `index.ts:2764-2766`; test `tests/services/evolution-service.test.ts` |
| SSE progress for `POST /api/evolution/run` + UI progress | `routes/evolution.ts:437-488`; `EvolutionTab.tsx:1096` | test `evolution-run-route.test.ts:267-360` |
| Fleet persona snapshot (precedent for "a run stays on its own version") | `fleet-run-executor.ts:589-591` (`savedAgentPolicy?.persona ?? listPersonas().find`) | test `tests/local/fleet-isolation.test.ts:455-485` |
| Static GEPA-evolved prompt shapes (Phase 1, LOCKED gen1-v1) | `packages/agent/src/prompt-shapes/index.ts:40-44`; `canary/phase-5-router.ts:35-36` | `routes/agent-run.ts:39-40` (`registerShape`) — **not** the chat path; `chat.ts:1235-1236` mentions PROMPT_ASSEMBLER (not checked in this group) |

---

## 3. Notes

- **Deploy for `tool-description`/`skill-body`/`generic`:** `validateRunBody` accepts them (`routes/evolution.ts:530-536`), while `deployFromRun` throws "not yet implemented" (`:74-81`) → the run ends as `failed` only after accept. The UI targets endpoint offers only personas and sections (`:228-240`), so the risk is low, but the API contract is inconsistent. (PARTIAL)
- **Recipe evolution (S1 §3 "defer"; BRIEF 10.3 limited scope):** no code exists for a harness-recipe target (the enum `EvolutionTarget` `iterative-optimizer.ts:88-93` has no such value). There is nothing to "defer" in the code; the limited scope from DIR-14 is net-new. (UNKNOWN → planner)
- **Cache after deploy:** `systemPromptCache` (`chat.ts:993`) has neither `on('persona:reloaded')` nor `on('behavioral-spec:reloaded')`; the effect of a new override takes hold only on a cache miss (key validation by `historyLength` etc., `chat.ts:1327-1329`). For the persona this is currently irrelevant because of F-EVO-01.
- **Test gap that allowed F-EVO-01:** the predicate in `evolution-deploy.test.ts:116` and the disk-only assert in `evolution-routes.test.ts:184-188`. The RED test for AT-04 must go through `resolvePersona`/`buildSystemPrompt`, not through `listPersonas().find(id && includes)`.
- **Repro files:** `docs/plans/v1.2-evidence/phaseA/repro-shadow.mjs`, `docs/plans/v1.2-evidence/phaseA/repro-gepa-delta.mjs` (both read `packages/agent/dist` and write only to the planner workspace (now `docs/plans/v1.2-evidence/`); the `dist` build from 2026-09-27 05:27 is newer than the last change to `personas.ts`/`chat.ts` from commit `fba2f94d`).
- **Nothing was changed in the repo.** Neither `npm`/`vitest` nor mutating git commands were run.
