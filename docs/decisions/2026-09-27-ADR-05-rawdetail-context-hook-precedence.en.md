# ADR-05 — RAWDETAIL, three storage responsibilities, `ContextPackage` reference and hook/central injection precedence

> **English translation** of [2026-09-27-ADR-05-rawdetail-context-hook-precedence.md](2026-09-27-ADR-05-rawdetail-context-hook-precedence.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Document revision:** 1.2 DRAFT · 27.09.2026 · reviewed code revision `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`
**Date:** 2026-09-27
**Status:** DRAFT — contract proposal; does not change the `recallMemory` engine (D-12, DIR-09 "preserve retrieval first")
**Author:** planner (Fable 5.1)
**Ratified by:** founder — pending
**Supersedes / refines:** FRD v1.1 §7 "transient reasoning is not memory; don't store every token" (C11 — without a carve-out for the verbatim lane); S1 A26 proposal of `WAGGLE_CONTEXT_INJECTED` as authorization; the "workspace run summary → personal mind" behavior introduced in `920a276c9` (2026-07-11) and pinned by tests; hook read path without the `temporary` exclusion (`packages/hive-mind-core/src/hook-runtime.ts:237`)
**Binds:** W0-PR10/PR11/PR18 (G1; O4 hook read path, O3 4 writers + redefinition of the fleet policy gate, MIG-05(i) reclassification as a consequence of O3 — these go ahead of ratification as a PROPOSAL, Delivery plan §6.1 RAT-04, TM-08), W2 (ContextPackage/reference contract, isolation, capture, external handoff), W1 (contextRef in the checkpoint), W3e (eval scope), OSS forward-port (`hive-mind-core` is the substrate, CLAUDE.md §7.5)
**Cross-references:** ADR-02 (contextRef, consolidation), ADR-06 (eval dataset scope), ADR-10 (erasure/revocation), ADR-08 (KVARK context boundary); brief §8 (DIR-09, DIR-10); AT-13, AT-14, AT-15, AT-16, AT-28

---

## §1 — Context

**ADR-05-K1 (CONFIRMED AT REVISION).** The RAWDETAIL verbatim lane exists and is active by default: `packages/agent/src/orchestrator.ts:858-894` (`## Raw dialogue excerpts (verbatim)`, rendered last), `packages/hive-mind-core/src/mind/raw-detail-lane.ts:116-187` (FTS/window → CE rerank top-K=6 → ±1 neighbor → dedup), write side `harvest/raw-turns.ts` (`[mind-rawturn` prefix, kill switch `WAGGLE_RAWDETAIL=0`). The reranker is ON by default (`orchestrator.ts:564`; comment `:106-109` is outdated). The corpus is populated **only** by harvest paths (`routes/harvest.ts:661`, `memory-mcp/src/tools/harvest.ts:316`, `hive-mind-mcp-server/src/tools/harvest.ts:318`) — live chat turns are not stored as raw turns. The reranker model (~22 MB ONNX) **is not bundled** in the installer (grep in `certify-windows-installer.ps1`, `check-sidecar-resources.mjs`, `bundle-native-deps.mjs`, `build-sidecar.mjs` = 0; certify seeds only the embedding model `:2904`) → on a fresh offline desktop the lane is probably inactive until the first online recall (AUDIT FINDING — TO VERIFY). [hivemind.md F-HM-01; refute HOLDS]

**ADR-05-K2 (CONFIRMED AT REVISION).** Hooks store every prompt as a `temporary` I-frame (`hive-mind-hooks-core/src/handlers-core.ts:148`; `hive-mind-hooks-claude-code/src/hooks/user-prompt-submit.ts:50`), a write-side ingress guard exists (`hook-runtime.ts:191-193`). TTL 30 d via `FrameStore.compact()` (`frames.ts:410-441`) — **the server cron `memory_compact` ALREADY EXISTS** (`packages/server/src/local/index.ts:2033-2058`, seed `setup-crons.ts:35` `30 3 * * *`, personal + every workspace); whether it runs on the desktop at 03:30 = PARTIAL/UNWIRED (not verified E2E). [F-HM-02; refute WEAKENED — minimalChange "add a cron" refuted]

**ADR-05-K3 (PARTIAL/UNWIRED).** Excluding `temporary` from recall: Waggle side YES (`orchestrator.ts:728-737` `isAuthoritativeForRecall`, `:647-649` `excludeTemporary:true`, `context-loader.ts:77-88`, `workspace-context.ts:283,342,361`, `executor-brief.ts:66`); hook side NO (`hook-runtime.ts:237` `WHERE importance != 'deprecated'` → `temporary` gets in, ranked last); MCP `recall_memory` (`memory-mcp/src/tools/memory.ts:94-135`) uses `HybridSearch`, where importance is a SCORE, not an exclusion (`search.ts:37-43`). Test `hook-runtime.test.ts:126-137` does not pin inclusion (limit 2). [F-HM-03, F-CAP-05(d)]

**ADR-05-K4 (CONFIRMED AT REVISION).** The hook read path neither scans nor redacts: `recallHookFrames` (`hook-runtime.ts:227-258`) is a plain SELECT; `formatHitsForContext` (`session-start.ts:46-60`; `handlers-core.ts:77-90`) injects `content` (240 characters) directly; grep `scanForInjection|evaluateExternalMemoryIngress|redact` in `hive-mind-hooks-*/src`, `hive-mind-shim-core/src` = 0. Waggle recall scans the whole block (`orchestrator.ts:923-933`). `redactSecrets` lives in `@waggle/agent` (`eval-dataset.ts:133`) — the hook packages cannot import it without a new dependency. [F-HM-04, F-HM-13; refute HOLDS]

**ADR-05-K5 (CONFIRMED AT REVISION — broader than S1).** The workspace run summary (up to 1000 characters, `importance:'normal'`, `source:'agent_inferred'`) is written to the **personal** mind in **four** places: `routes/external-tool-runs.ts:964-977`, `chat-collaboration.ts:802-814`, `fleet-run-executor.ts:924-936` (default `memoryScopes=['personal','workspace']` `:729`), `routes/agent-groups.ts:719-729`. Introduced by `920a276c9`. `recallMemory` searches personal on every query (`orchestrator.ts:682`), the frames pass `isAuthoritativeForRecall`/`notLaneFrame`; MCP `recall_memory` default scope `personal`. Tests pin this as desired: `external-tool-runs.test.ts:245-260,319-335`, `fleet-isolation.test.ts:519-522`, `agent-groups.test.ts:346-362`. The fleet policy gate (`fleet-run-executor.ts:101-106`) treats a saved-agent **without** `personal` in `memoryScopes` as UNSUPPORTED (fail-closed), pinned by `fleet-isolation.test.ts:203` → `personal` is mandatory today; a change requires redefining the gate, not just the default. There is no sentinel test Workspace A → not in the recall of B/personal. [F-HM-05; refute WEAKENED for minimalChange]

**ADR-05-K6 (CONFIRMED AT REVISION).** Trust labels from `frame.source` (`user_stated|tool_verified|agent_inferred|import|system`, `frames.ts:28`) do not enter the recall text (`orchestrator.ts:843,854` `[date, importance] content`); only the executor brief renders `[date | source | frameId]` (`executor-brief.ts:186`). There is no exact-line test pin (refute: grep `, normal] ` across tests = 0); the risk of a change is exclusively LoCoMo same-judge (render bytes). [F-HM-06; refute WEAKENED]

**ADR-05-K7 (CONFIRMED AT REVISION).** `ContextPackage|ContextBuilder|WAGGLE_CONTEXT_INJECTED` = 0 occurrences. Double injection is possible: route-proposal prepends the executor brief to the prompt (`route-proposals.ts:205-207`) **and** the hooks in the external process inject their own recall at SessionStart (`session-start.ts:80`); the env allowlist (`external-process-env.ts:29-35`) has no marker; the hooks do not read `WAGGLE_RUN_ID` (grep = 0 in shim/hooks). UNKNOWN: whether Claude Code `--safe-mode` (headless argv `shared/tool-detection.ts:124-125`) suppresses SessionStart hooks. [F-HM-08; refute HOLDS with one UNKNOWN premise]

**ADR-05-K8 (CONFIRMED AT REVISION).** The `recallMemory` engine with 7 lanes + RAWDETAIL at `orchestrator.ts:582-978` (importance K5, semantic personal/workspace, date-window, profiles, facts 60, events 40, RAWDETAIL K6; catch-up branch; empty-mind fast path; read-side scan; temporal anchor); callers `chat-turn-preparation.ts:237`, `chat.ts:390`, `command.ts:266`, `commands.ts:74`. Fleet uses `buildAssembledPrompt` without `recalledText` (`fleet-run-executor.ts:647-648`, `routes/fleet.ts:350-356` → the poorer branch `orchestrator.ts:463-470`); harness and subagent have no recall (grep = 0). [F-HM-09, F-HM-10]

**ADR-05-K9 (PARTIAL/UNWIRED).** The executor brief (`executor-brief.ts:46-154`: workspace HybridSearch, `excludeDeprecated`, drops `temporary`/unreviewed import, `redactSecrets`, cap 8000/6, injection scan, `briefHash`) exists only on the route-proposal path; direct `/api/tools/run` and interactive launch (`routes/tools.ts:514-525`) do not attach the brief. Capture carries `WAGGLE_WORKSPACE_ID` → the correct workspace mind (`cli-bridge.ts:240,404-408`; `hook-runtime.ts:121-187` scoped resolveMind with symlink defense) but not `runId` (frame-encoder yields `session:<id>`). The external tool's `tool` events are self-reported (`external-tool-runner.ts:519,531` → `metrics.toolsUsed` without a provenance label). There is no checkpoint-bound context → no invalidation of a deleted source after resume (the only durable reference is `briefHash` in `attribution`). [F-HM-11, F-HM-12, F-HM-14, F-HM-18]

**ADR-05-K10 (PARTIAL/UNWIRED).** Idempotency: content-hash dedup (`frames.ts:109-111,289-294`), lane dedup, distill replace-on-update (`weaver/consolidation.ts:226-236`); there is no `(runId, outputHash)` key → different text from the same run gets duplicated. Token budget: the per-tier `FRAME_LIMITS` in the assembler (`prompt-assembler.ts:165-169`) is **not applied** to the W4.5 pre-rendered recall block (a single section); lane caps are fixed. `PROMPT_ASSEMBLER` default ON (`feature-flags.ts:38`). Critic note: the earlier "CLAUDE.md §10 default OFF" drift does not exist in the repo (`CLAUDE.md` at `2af0904d` has no "default OFF"; the phrase exists only in the auto-memory outside the repo). [F-HM-07, F-HM-16]

**ADR-05-K11 (DECISION — D-11, D-12; HISTORICAL FOUNDER DECISION (memory, 2026-06-12; founder: "beware not to mix the personal and workspace minds... workspace minds are separate and no memory leakage between users is allowed") — aligned with D-12 · PROPOSAL — BRIEF DIRECTION — DIR-09, DIR-10).** DECISION: Hive Mind remains the memory foundation, the existing retrieval and isolation are preserved (D-12); scope isolation is immutable (D-12; historical founder rule 2026-06-12 aligned with D-12); the external executor is optional, and the result returns to the same Workspace (D-11). PROPOSAL — BRIEF DIRECTION (planner direction, not user approval): the existing retrieval is first mapped and wrapped in a typed contract, not duplicated (DIR-09); the executor is explicit and bound to the same Workspace, with verification of the entire flow (DIR-10).

## §2 — Decision (contract proposal)

**ADR-05-O1 (PROPOSAL) — three storage responsibilities (brief §8.2, corrects C11).**

| Layer | Role | Where today | Rule |
|---|---|---|---|
| Source material / RAWDETAIL | verbatim evidence for retrieval and exact citation; **not** a learned fact | `[mind-rawturn]` frames (harvest) | retained; the kill switch stays; FRD v1.2 records that today it covers only harvested conversations and depends on the reranker model; extending it to live work = a W2 decision, not done silently |
| Derived memory | facts/decisions/preferences/relations/summaries/confirmed outcomes/corrections with provenance | I/P/B frames, facts/events/profiles lanes | `temporary` hook content is **not promoted** automatically; TTL 30 d via the existing `memory_compact` cron (verify that it runs on the desktop) |
| Execution state | runs, checkpoints, retries, grants, leases, budgets | today partly in the Awareness `.mind` (Loop state) | ADR-02: not a semantic frame; it is moved out |

**ADR-05-O2 (PROPOSAL) — `ContextPackage` as a typed wrapper, not a new engine (DIR-09).** Fields: `contextId`, `version`, `runId/workspaceId/sessionId`, `queryOrTaskShape`, `sourceRefs[] {frameId|fileRef, revision/hash, scope, source, trust/taint}`, `tokenBudget + priority`, `payloadForExecutor` (reference-first; private content copied only when necessary and permitted), `omittedReasons[]`. `ContextBuilder` **calls the existing `recallMemory`** and packages `{text, recalledFrames}` + workspace file references; the render bytes of the recall block are **not changed** in W2 without a LoCoMo same-judge check (K6).

**ADR-05-O3 (PROPOSAL) — scope and isolation (AT-13).** The run summary stays in the **workspace** mind; the personal mind gets at most a content-free pointer (`Run/Workspace/Status`, without `Summary`, `importance:'temporary'`) or nothing. Requires: (a) a change in 4 places (K5), (b) redefinition of the fleet policy gate (`fleet-run-executor.ts:101-106`: `personal` is no longer a mandatory scope; `agents-store` already allows workspace-only, `agents.test.ts:238`), (c) updating ≥5 tests (`fleet-isolation.test.ts:203,519-522`, `agent-groups.test.ts:362`, `external-tool-runs.test.ts:259`, `:319-335`), (d) a new sentinel test. A derived fact inherits the restrictions of its source; the classifier/evolution cannot declare it public.

**ADR-05-O4 (PROPOSAL) — hook read path (A13, F-HM-03/04/13).** `recallHookFrames`: `WHERE importance NOT IN ('deprecated','temporary')`; per hit `evaluateExternalMemoryIngress` (fail-open: omit the hit, do not crash the hook) + secret redaction; `redactSecrets` moves into `hive-mind-core` (OSS substrate) or the filter is applied in `hook-runtime.ts`/`hook-call.ts`, which already depend on core. MCP `recall_memory` gets a post-filter identical to `isAuthoritativeForRecall` or an `excludeTemporary` option in `HybridSearch`.

**ADR-05-O5 (PROPOSAL) — precedence and marker (brief §8.3, A26).** Central Waggle injection is authoritative for harness-controlled work (FRD §7). Add `WAGGLE_CONTEXT_INJECTED={contextId}` to the env allowlist (`WAGGLE_ENV_ALLOWLIST`, `external-process-env.ts:29-35`; `WAGGLE_RUN_ID` already exists, `:31`); the hooks start reading both — the SessionStart hook, when it sees the marker + run id, **skips or shortens** its own recall and records `contextId` in the frame metadata. The marker is **coordination, not authorization**: the hook does not accept untrusted content that claims "already verified context" and therefore does not skip the scope/taint check. Content that the hook injects still goes through O4.

**ADR-05-O6 (PROPOSAL) — durable reference and invalidation (AT-15, DIR-21).** `Checkpoint.contextRef + contextHash` (ADR-02) points to a `ContextPackage` with `sourceRefs`; on resume it is checked that every `frameId`/fileRef exists, is not `deprecated`/erased (`erased_subjects`), and that the scope has not changed; otherwise `contextInvalidated` → a fresh resolution before continuing. **A snapshot does not override deletion or revocation.** Interim (before W2): resume of an external run checks that the `briefHash` frames still exist, or refuses a silent continuation.

**ADR-05-O7 (PROPOSAL) — trust/taint in context (A13(b), A26).** `sourceRefs[].source` (existing column) + `taint: 'harvested'|'external_tool'|'import'|'user'` in the package; in the recall block render line the source token is added **only after** a LoCoMo same-judge check (K6 risk); in the executor brief it already exists. The prompt-injection scanner is defense-in-depth; a harvested email is tainted data that cannot change policy (ADR-04 O5).

**ADR-05-O8 (PROPOSAL) — external executor (DIR-10, AT-16).** The same `ContextPackage` (or the executor brief as its `payloadForExecutor`) on all three paths: route-proposal (exists), `/api/tools/run` (opt-in reuse of `buildExecutorBrief` when `attribution.briefHash` is missing), interactive launch (marker + brief file); `cli-bridge` reads `WAGGLE_RUN_ID` → `run:<id>` token in the frame header/metadata; `metrics.toolsUsed` from the external stream labeled `tool-reported`, UI copy "reported by the tool"; no key leakage (env allowlist + runner redact remain; hook inject gets the O4 redaction).

**ADR-05-O9 (PROPOSAL) — idempotent consolidation (brief §8.2, AT-14).** Run-end extraction key `(runId, outputVersion/outputHash)` in the frame metadata; a repeated identical extraction does not duplicate; a different output of the same run version = replace-on-update (Weaver pattern `deleteByContentPrefix`), not append. Check `createPFrame` dedup (UNKNOWN).

**ADR-05-O10 (PROPOSAL) — per-tier token budget at the package level (A26).** `ContextPackage.tokenBudget` per model tier with lane priority (importance → RAWDETAIL → facts → events → semantic), applied in `ContextBuilder`, not in the assembler over an already rendered block. (Critic note: the earlier step "correct the CLAUDE.md §10 claim about the `PROMPT_ASSEMBLER` default" was removed — `CLAUDE.md` at `2af0904d` has no "default OFF"; the phrase exists only in the auto-memory outside the repo.)

## §3 — What it supersedes and why

| Previous | Where | Why |
|---|---|---|
| FRD v1.1 §7 "transient reasoning is not memory; don't store every token" without a carve-out | docs/plans/v1.2-evidence/inputs/Waggle_FRD_v1.1_2026-09-27.md:119 | Too broad: it would endanger the RAWDETAIL lane (LoCoMo 86.49 % driver according to memory) — C11 REFINE; O1 separates the three layers |
| Workspace run summary → personal mind (4 writers) | `920a276c9`; K5 | Violates mind isolation (founder 2026-06-12) and AT-13; content from Workspace A leaks into B and into external tools (CONFIRMED) |
| Fleet policy: `personal` mandatory in `memoryScopes` | `fleet-run-executor.ts:101-106`; `fleet-isolation.test.ts:203` | Prevents workspace-only isolation; the gate is redefined together with O3 |
| Hook recall `!= 'deprecated'` (temporary gets in) | `hook-runtime.ts:237` | A temporary prompt is not authoritative context (brief §8.2) |
| S1 A26 `WAGGLE_CONTEXT_INJECTED` as a "hook-precedence marker" | S1 A26 | Accepted as coordination, explicitly **not** as authorization (brief §8.3) |
| S1 W2 "net-new ContextBuilder + typed package" | S1 W2 | Accepted as a wrapper; the `recallMemory` engine is unchanged (DIR-09) |

**ADR-05-Z1 (DECISION — D-12; HISTORICAL FOUNDER DECISION (memory, 2026-06-12) — aligned with D-12; not reopened).** DECISION: D-12 (Hive Mind foundation, no engine rewrite). HISTORICAL FOUNDER DECISION (memory, 2026-06-12): the mind-isolation rule, which applies through D-12. Both are enforced.

## §4 — Consequences

**ADR-05-P1 (PROPOSAL).** OSS forward-port: changes in `hive-mind-core/src/{mind,harvest,hook-runtime}` are substrate → the `oss-drift-check.mjs` baseline is re-baselined through maintainer review; `execution-traces.ts` remains OSS-EXCLUDED; the drift check already exits 1 today (22 known blockers, 3 unreviewed; release-oss.md F-REL-07).

**ADR-05-P2 (PROPOSAL).** A LoCoMo same-judge regression gate **does not exist in CI** (F-HM-15; grep `locomo` in `.github/workflows` = 0) — a process gate (manual run + `recount.mjs`) is mandatory before the merge of any change to the render bytes of the recall block (feedback_benchmark_evidence_discipline). Not CI for G1.

**ADR-05-P3 (PROPOSAL).** Reranker model bundling/offline profile is an ADR-10 item (the offline profile must not silently lose the RAWDETAIL lane).

**ADR-05-P4 (PROPOSAL).** Tests to rewrite: the K5 list (5); hook tests (`hook-runtime.test.ts:126-137` stays green; `hooks-claude-code tests/hooks/session-start.test.ts`, `handlers-core.test.ts` might pin the exact `additionalContext` string — TO VERIFY); `external-tool-runner.test.ts` might pin the exact set of env keys (TO VERIFY) when the marker is added.

**ADR-05-P5 (PROPOSAL).** Doc drift to correct (doc-only): `orchestrator.ts:106-109` comment, `docs/backend-map/sections/05d-subsystem-evolution.md:94` (ADR-06).

## §5 — Risk

| ID | Risk | L/I | Mitigation |
|---|---|---|---|
| ADR-05-R1 | LoCoMo regression from changing the recall render bytes | medium / high (public claim 86.49 %) | O2 bytes unchanged in the W2 baseline; source token only with a same-judge run; pin `recount.mjs` |
| ADR-05-R2 | Removing the personal write loses the "Pick up where you left off" signal on Home | medium / low | content-free pointer + Home reads the run store (ADR-02), not the personal mind |
| ADR-05-R3 | Hook filter drops legitimate context (fail-open on scan) | low / low | logging of omitted hits; no hook crash |
| ADR-05-R4 | Double injection remains for Codex/Hermes headless if the marker is not read | medium / medium | O5 marker in all three hook packages + interactive launch; verify the UNKNOWN `--safe-mode` |
| ADR-05-R5 | Erasure does not reach checkpoint copies | medium / high | O2 reference-first; O6 invalidation; ADR-10 |
| ADR-05-R6 | `memory_compact` cron does not run on the desktop (03:30, laptop switched off) | medium / low | routine catch-up policy (ADR-07) + dream-journal entry as evidence |

## §6 — Migration test

| ID | Test | Expectation | AT |
|---|---|---|---|
| ADR-05-T1 | Sentinel `WSA-SECRET-7731` in the Workspace A run summary → not in the recall of personal or Workspace B; not in MCP `recall_memory` with the default scope | RED today (K5) | AT-13 |
| ADR-05-T2 | Fleet saved-agent with `memoryScopes:['workspace']` passes the policy gate and does not write personal | RED today (`fleet-isolation.test.ts:203` pins the rejection) | AT-13 |
| ADR-05-T3 | RAWDETAIL citation available in the permitted scope; `WAGGLE_RAWDETAIL=0` turns it off; without the reranker → no lane (existing `w46-*` stay green) | green today | AT-14 |
| ADR-05-T4 | `saveHookFrame(temporary)` → `recallHookFrames` does not return it; injection content in the frame → omitted from `additionalContext`; secret in the frame → redacted | RED today | AT-14/AT-19 |
| ADR-05-T5 | Re-run of the same run-end extraction → 0 new frames; different output of the same version → replace, not append | partial (content-hash) | AT-14 |
| ADR-05-T6 | Checkpoint `contextRef` with a deleted frame → resume `contextInvalidated`, no continuation with the stale copy | RED today (no link) | AT-15 |
| ADR-05-T7 | External executor via `/api/tools/run` receives the brief/package; the frame carries `run:<id>`; `toolsUsed` labeled `tool-reported`; env without provider keys | partial | AT-16 |
| ADR-05-T8 | Headless run with hooks + marker → one memory block (no duplication of the same frames) | RED today | AT-16 |
| ADR-05-T9 | LoCoMo same-judge rerun before the merge of W2 render changes: `recount.mjs` within the agreed tolerance of the same protocol | process | AT-28 |

## §7 — Sources

- **D:** D-11, D-12 · **DIR:** DIR-09, DIR-10, DIR-21 (brief §8.1–8.4, §12.4) · **C/A/R:** C11 (REFINE); A3, A13, A26 (REFINE); R23 · **AT:** AT-13, AT-14, AT-15, AT-16, AT-19, AT-28
- **Phase A:** `docs/plans/v1.2-evidence/phaseA/hivemind.md` F-HM-01..18; `docs/plans/v1.2-evidence/phaseA/hivemind.refute.md` (F-HM-02 cron exists; F-HM-05 fleet gate; F-HM-06 no byte pin; F-HM-08 `--safe-mode` UNKNOWN); `docs/plans/v1.2-evidence/phaseA/capability.md` F-CAP-05; `docs/plans/v1.2-evidence/phaseA/release-oss.md` F-REL-07
- **S1:** C11, A13, A26, W2, §3 "Consolidating the two MCP servers" · **Code (at `2af0904d`):** `packages/agent/src/orchestrator.ts:106-109,463-470,564,582-978,647-649,682,728-737,843,854,858-894,923-933`; `packages/hive-mind-core/src/mind/raw-detail-lane.ts:116-187`; `harvest/raw-turns.ts`; `hook-runtime.ts:121-193,227-258`; `mind/frames.ts:28,109-111,289-294,410-441`; `packages/hive-mind-hooks-core/src/handlers-core.ts:77-90,148`; `packages/hive-mind-hooks-claude-code/src/hooks/{session-start.ts:46-60,80,user-prompt-submit.ts:50}`; `packages/server/src/local/routes/external-tool-runs.ts:964-977`; `chat-collaboration.ts:802-814`; `fleet-run-executor.ts:101-106,647-648,729,924-936`; `routes/agent-groups.ts:719-729`; `executor-brief.ts:46-154,186`; `routes/route-proposals.ts:205-211`; `packages/agent/src/external-process-env.ts:29-35`; `external-tool-runner.ts:369-392,519,531,588-595`; `packages/server/src/local/index.ts:2033-2058`; `setup-crons.ts:35`; `packages/agent/src/prompt-assembler.ts:165-169,433-457`; `feature-flags.ts:38`
