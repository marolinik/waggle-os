# Phase A — revalidation of the "hivemind" group at revision `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`

> **English translation** of [hivemind.md](hivemind.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Revision:** `main` = `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (2026-09-27 05:08 +0200). `git status --porcelain` reports only two untracked `.docx` files in `docs/`; every tracked file cited below is identical to HEAD (working tree == HEAD).

**Verification method:** read-only source review (`git grep`, `git blame`, `sed`, file reading). Tests **were not executed** (the repo is read-only for this pass; vitest writes a cache into `node_modules`, and the local ABI trap for better-sqlite3 requires Node 22.23.2). Where I cite a test, it means "the test exists and pins the behavior", not "the test was run in this pass". No E2E flow was executed against a running sidecar.

**Input sources:** docs/plans/v1.2-evidence/inputs/Waggle_Planner_Brief_v1.0_2026-09-27.md §8 (DIR-09, DIR-10), §16 AT-13..AT-16; docs/plans/v1.2-evidence/inputs/S1-audit-2026-09-27.md C11, A13 (hook read path), A26, W2, §3 row "Consolidating the two MCP servers", spot-check "ContextPackage has zero occurrences"; PRD §8; FRD §7.

**Statuses:** DECISION / CONFIRMED AT REVISION / AUDIT FINDING — TO VERIFY / PARTIAL/UNWIRED / PROPOSAL / DEFERRED / UNKNOWN / ALREADY CLOSED / NOT CONFIRMED.

---

## 1. Findings (one record per S1 claim / AT)

### F-HM-01 — RAWDETAIL verbatim lane exists and is active by default (S1 C11, part a)

- **Claim from S1:** "RAWDETAIL verbatim lane (the driver behind the LoCoMo 86.49% result)" exists and must be preserved.
- **Status:** CONFIRMED AT REVISION.
- **Commit:** `2af0904d`.
- **Path/symbol:** `packages/agent/src/orchestrator.ts:858-894` (render of the `## Raw dialogue excerpts (verbatim)` section), `packages/hive-mind-core/src/mind/raw-detail-lane.ts:116-187` (`fetchRawDetailLane`: pool FTS/window → CE rerank top-K=6 → ±1 neighbor → dedup), `packages/hive-mind-core/src/harvest/raw-turns.ts` (write side, `MIND_RAWTURN_PREFIX = '[mind-rawturn'`, kill switch `WAGGLE_RAWDETAIL`).
- **Input:** a query that is not catch-up and a mind with `[mind-rawturn …]` frames; reranker available.
- **Current output:** verbatim excerpts are rendered LAST in the recall block, in the format `- [YYYY-MM-DD] (speaker) tekst` (orchestrator.ts:885-893); the lane requires the reranker (`if (reranker && process.env['WAGGLE_RAWDETAIL'] !== '0')`, :866). The reranker is **default ON** (`orchestrator.ts:564`: only `WAGGLE_RERANKER === '0'` turns it off); the comment at `orchestrator.ts:106-109` ("IF the WAGGLE_RERANKER=1 flag is set") is stale. First use downloads a ~22 MB ONNX model into `~/.waggle/models/reranker` (`packages/server/src/local/index.ts:792,800,1364`); after a 1 s grace period, recall falls back to RRF without the lane (:566-579).
- **Lane corpus:** raw-turn frames are written ONLY by harvest paths: `packages/server/src/local/routes/harvest.ts:660-662`, `packages/memory-mcp/src/tools/harvest.ts:316`, `packages/hive-mind-mcp-server/src/tools/harvest.ts:318`. Live chat turns are **not** stored as raw turns → RAWDETAIL today covers imported conversations, not ongoing work in the Workspace.
- **Repro test / verification limitation:** `packages/agent/tests/w46-rawdetail-recall.test.ts` (5 `it`: render, count, kill switch, "no reranker → no lane", no double-render), `packages/hive-mind-core/tests/mind/raw-detail-lane.test.ts`, `packages/server/tests/local/w46-harvest-raw-turns.test.ts`. Not executed in this pass. It was not verified whether the reranker model is bundled into the installer (grep `reranker|ms-marco|MiniLM` in `scripts/check-sidecar-resources.mjs`, `bundle-native-deps.mjs`, `build-sidecar.mjs` = 0 hits) → on an offline installed desktop, the lane may be silently inactive.
- **Expected (brief §8.2):** preserve RAWDETAIL as "source material / retrieval evidence", not as a learned fact; do not remove it.
- **Minimal change:** no code change; fix the stale comment (`orchestrator.ts:106-109`); in FRD v1.2, explicitly record that RAWDETAIL currently indexes only harvested conversations and that it depends on the reranker model (offline profile = UNKNOWN).
- **AT:** AT-14.

### F-HM-02 — Hooks store every prompt as a `temporary` frame (S1 C11, part b)

- **Claim from S1:** "hooks that store every prompt as a temporary frame".
- **Status:** CONFIRMED AT REVISION.
- **Commit:** `2af0904d`.
- **Path/symbol:** `packages/hive-mind-hooks-core/src/handlers-core.ts:126-152` (`runUserPromptBody`, `encodeFrame(event, { importance: 'temporary' })` at :148 — used for codex/codex-desktop/cursor/hermes/openclaw), `packages/hive-mind-hooks-claude-code/src/hooks/user-prompt-submit.ts:50` (Claude Code copy).
- **Input:** any UserPromptSubmit event with a non-empty `prompt`.
- **Current output:** the entire prompt is written into the active mind (`workspace` from `WAGGLE_WORKSPACE_ID`, otherwise personal) as an I-frame with `importance='temporary'`, `source` from the adapter. The write-side ingress guard rejects unsafe content (`hook-runtime.ts:191-193`). TTL: `FrameStore.compactFrames` deletes `temporary` > 30 days (`packages/hive-mind-core/src/mind/frames.ts:404-433`), but the only callers are `hive-mind-cli maintenance.ts:501`, MCP `cleanup_frames` (`memory-mcp/src/tools/cleanup.ts:319`) and the PreCompact hook (`handlers-core.ts:232-240`); in `packages/server/src` there is no scheduled compact call (grep `compactFrames(` = 0 in the server).
- **Repro test / limitation:** `packages/hive-mind-hooks-core/tests/handlers-core.test.ts:55-65,162-172`; `packages/hive-mind-hooks-claude-code/tests/hooks/user-prompt-submit.test.ts:12-29` — pin `temporary`. Not executed.
- **Expected (brief §8.2):** temporary hook content may serve an operational purpose; it is not promoted to long-lived facts; separate channel/TTL/retrieval exclusion.
- **Minimal change:** no storage change; PROPOSAL: a Waggle-side periodic `compactFrames` (personal + every workspace) so that the TTL is real, not merely available via CLI/MCP.
- **AT:** AT-14.

### F-HM-03 — Excluding `temporary` from recall: Waggle side YES, hook/MCP side NO (S1 C11 part c, A13)

- **Claim from S1:** "Hooks should exclude `temporary` from recall."
- **Status:** PARTIAL/UNWIRED.
- **Commit:** `2af0904d`.
- **Path/symbol:**
  - Waggle recall excludes: `packages/agent/src/orchestrator.ts:728-737` (`isAuthoritativeForRecall`: `temporary` and `deprecated`), the importance lane selects only critical/important (:707-714), `fetchRecentFrames(..., { excludeTemporary: true })` (:647-649), `packages/agent/src/context-loader.ts:77-88`, `packages/server/src/local/routes/workspace-context.ts:283,342,361`, `packages/server/src/local/executor-brief.ts:66`.
  - Hook recall does NOT exclude: SessionStart → `recallPersonalAndWorkspace` (`packages/hive-mind-shim-core/src/context-recall.ts:10-33`) → `cli-bridge.ts:345-377` (`hook-call recall_memory`) → `packages/hive-mind-cli/src/commands/hook-call.ts:112-155` → `packages/hive-mind-core/src/hook-runtime.ts:227-258` (`recallHookFrames`): SQL `WHERE importance != 'deprecated'` (:237) — `temporary` gets in, ranked last (:238-243).
  - MCP `recall_memory` (`packages/memory-mcp/src/tools/memory.ts:94-135`, same in `hive-mind-mcp-server`) calls `HybridSearch.search` without `excludeDeprecated`; `HybridSearch` treats importance as a SCORE, not as an exclusion (`search.ts:37-43`) → `temporary`/`deprecated` can surface, only downweighted.
- **Input (repro):** fresh `dataDir`, `saveHookFrame({content:'temporary recent item', importance:'temporary'})`, then `recallHookFrames({ limit: 20 })`.
- **Current output:** the temporary frame is in the result (when there are no more than `limit` better frames) → injected into a new Claude Code/Codex/Hermes session as `additionalContext`.
- **Repro test / limitation:** `packages/hive-mind-core/tests/hook-runtime.test.ts:126-137` uses `limit: 2` with three frames, so the temporary one drops out by rank — the test does NOT pin inclusion, hence exclusion does not break it. The Waggle side is pinned by `packages/agent/tests/r2-recall-closure.test.ts:27-40`.
- **Expected (brief §8.2, S1 C11):** temporary hook text is not automatically a long-lived fact and is not returned as authoritative context.
- **Minimal change:** `hook-runtime.ts:237` → `WHERE importance NOT IN ('deprecated','temporary')` + test; for MCP `recall_memory`, a post-filter identical to `isAuthoritativeForRecall` (or a new `excludeTemporary` option in `HybridSearch`).
- **AT:** AT-14.

### F-HM-04 — The hook read path does not scan injected content (S1 A13)

- **Claim from S1:** add "The hook read path also runs the scan and excludes `temporary`."
- **Status:** CONFIRMED AT REVISION (gap confirmed: no scanner exists on the read path).
- **Commit:** `2af0904d`.
- **Path/symbol:** `hook-runtime.ts:227-258` (`recallHookFrames` without scanning), `packages/hive-mind-hooks-claude-code/src/hooks/session-start.ts:46-60,80` (`formatHitsForContext` injects `content` directly), `handlers-core.ts:77-90,110-123` (same for the other tools). A write-side guard exists (`hook-runtime.ts:191`). Grep `scanForInjection|evaluateExternalMemoryIngress` in `hive-mind-hooks-*/src`, `hive-mind-shim-core/src` = 0 hits (the only hits are CLI `cognify.ts`/`harvest-local.ts`).
- **Input:** a frame written bypassing the hook guard (e.g. an import or MCP `save_memory` from another tool) with injection content.
- **Current output:** the content enters SessionStart `additionalContext` without a read-side check. Waggle recall scans on the read path (`orchestrator.ts:923-933`).
- **Repro test / limitation:** no test; limitation = static analysis.
- **Expected (brief §8.3, §11.4):** defense-in-depth; the hook does not accept untrusted content without a scope/taint check.
- **Minimal change:** in `recallHookFrames` (or in `formatHitsForContext`), apply `evaluateExternalMemoryIngress` per hit and drop unsafe ones; fail-open (no injection rather than a hook failure).
- **AT:** AT-14, AT-19.

### F-HM-05 — Workspace run summary is copied into the personal mind, in FOUR places (S1 A26 "leak")

- **Claim from S1:** "fix the leak where workspace run summaries are copied into the personal mind (`external-tool-runs.ts:964-976`)".
- **Status:** CONFIRMED AT REVISION — and broader than in S1.
- **Commit:** `2af0904d`; introduced in `920a276c9` (2026-07-11, `git blame -L 964,977`).
- **Path/symbol:**
  1. `packages/server/src/local/routes/external-tool-runs.ts:964-977` (`recordResultToMinds`): personal I-frame `[External agent run]\nRun…\nWorkspace: ${workspaceId}\n…\nSummary: ${safeSummary.slice(0,1_000)}`, `'normal'`, `'agent_inferred'`, session `agent-runs`.
  2. `packages/server/src/local/chat-collaboration.ts:802-814`: `[${label}]\nRun…\nWorkspace…\nSummary: ${result.slice(0,1_000)}`.
  3. `packages/server/src/local/fleet-run-executor.ts:924-936`; default `memoryScopes = savedAgentPolicy?.memoryScopes ?? ['personal','workspace']` (:729) → every fleet run without an explicit policy also writes to personal.
  4. `packages/server/src/local/routes/agent-groups.ts:719-729`.
- **Input:** any external/fleet/group/chat-collaboration run in Workspace A.
- **Current output:** the result summary (up to 1000 characters) sits in `personal.mind` with `importance='normal'`; `recallMemory` searches the personal mind on every query and renders `## Personal Memory` (`orchestrator.ts:847-856`), and the MCP `recall_memory` default scope is `personal` → content from Workspace A can surface in Workspace B and in external tools. The personal `agent-runs` index has no reader (grep `'agent-runs'` outside tests hits only 4 writers) — it is used only indirectly, through recall.
- **Repro test / limitation:** existing tests PIN the current behavior as correct: `packages/server/tests/local/external-tool-runs.test.ts:245-260,319-335`, `packages/server/tests/local/fleet-isolation.test.ts:519-522` (`expect(personalFrame?.content).toContain('[Agent run]')`), `packages/server/tests/local/agent-groups.test.ts:346-362`. There is no test with sentinel data "Workspace A → not in the recall of Workspace B/personal".
- **Expected (brief §8.3, AT-13, founder rule 2026-06-12 "no memory leakage between minds"):** the run summary stays in the workspace mind; personal gets at most a content-free pointer.
- **Minimal change:** in all 4 places, remove the content write into personal (option: a content-free pointer `Run/Workspace/Status` without `Summary`, `importance='temporary'` so that it is recall-invisible); keep the `CollaborationRunMemoryRefs` shape (`personalFrameIds` may remain empty; adjust the `status` semantics); update the 4 tests; add a sentinel isolation test (AT-13). For fleet, change the default `memoryScopes` to `['workspace']`.
- **AT:** AT-13.

### F-HM-06 — Trust labels from `frame.source` do not enter the recall text (S1 A26)

- **Claim from S1:** "trust labels from `frame.source`".
- **Status:** CONFIRMED AT REVISION (gap confirmed; partially covered in the executor brief).
- **Commit:** `2af0904d`.
- **Path/symbol:** `orchestrator.ts:843,854` render `[date, importance] content` — without `source`; `source` is collected only for the UI pill (`recalledFrames`, :910-917). The hook inject renders `(importance)[from] ts: content` (`session-start.ts:54-58`) — without source. The executor brief renders `[date | source | frameId]` (`executor-brief.ts:186`). `FrameSource = 'user_stated'|'tool_verified'|'agent_inferred'|'import'|'system'` (`frames.ts:28`).
- **Input:** recall with frames from different sources.
- **Current output:** the model does not see the difference between `user_stated` vs `agent_inferred` vs `import` in the chat recall block.
- **Repro test / limitation:** rendering is pinned by `orchestrator-recall-hardening.test.ts`, `w41-temporal-recall.test.ts` (byte-sensitive block).
- **Expected (PRD §8 "provenance-bearing Context Package", brief §8.1):** trust/taint labels with every source.
- **Minimal change:** add a source token to the render line (e.g. `[date, importance, source]`) — this changes the bytes of the recall block, so it requires a LoCoMo same-judge check (W2 risk) and updating the pinning tests. PROPOSAL, not a quick fix.
- **AT:** AT-14, AT-16.

### F-HM-07 — Token budget per model tier: partial, at the assembler level, not at the recall-lane level (S1 A26)

- **Claim from S1:** "token budget per model tier with a priority order".
- **Status:** PARTIAL/UNWIRED.
- **Commit:** `2af0904d`.
- **Path/symbol:** `packages/agent/src/prompt-assembler.ts:165-169` (`FRAME_LIMITS` small 3 / mid 6 / frontier 10), `:118` (`DEFAULT_MAX_CHARS = 32_000`), `:369,376,487-489` (sections are dropped until `system.length <= maxChars`). With the W4.5 pre-rendered `recalledText` (:437-445), the entire multi-lane block is ONE section → `FRAME_LIMITS` is not applied to it; lane caps are fixed regardless of tier (`orchestrator.ts:765` facts 60, `:771` events 40, `RAW_DETAIL_K = 6`, `RECALL_LINE_LENGTH`). `PROMPT_ASSEMBLER` is default ON (`feature-flags.ts:38`, `!== '0'`) — CLAUDE.md §10 claims "PA on for Claude, default OFF" (doc drift).
- **Input:** the same query on a small vs a frontier model.
- **Current output:** identical recall block; the only difference is dropping whole sections when 32k characters are exceeded.
- **Repro test / limitation:** `packages/server/tests/local/persona-acceptance-prompt-budget.test.ts` exists (not read in detail); not executed.
- **Expected (brief §8.1):** `ContextPackage` carries a token budget and priority.
- **Minimal change:** nothing now; the W2 contract defines the per-tier budget at the package level; correct the CLAUDE.md §10 claim about the default.
- **AT:** AT-06, AT-14.

### F-HM-08 — No `ContextPackage`/`ContextBuilder`/`WAGGLE_CONTEXT_INJECTED`; double injection is possible (S1 spot-check + A26)

- **Claim from S1:** "`ContextPackage` has zero occurrences"; proposal "hook-precedence marker (`WAGGLE_CONTEXT_INJECTED`)".
- **Status:** CONFIRMED AT REVISION.
- **Commit:** `2af0904d`.
- **Path/symbol:** grep `ContextPackage|WAGGLE_CONTEXT_INJECTED|ContextBuilder` over the entire repo (excluding `node_modules`) = 0 files. Double injection: the route-proposal path prepends the brief to the prompt (`route-proposals.ts:205-207`: `` `${brief.text}\n\n${proposal.prompt}` ``) AND hooks in the external process inject their own recall at SessionStart (`session-start.ts:80`) — there is no coordination. `WAGGLE_SIGNAL_EMIT='0'` for headless (`external-tool-runner.ts:389`) turns off only signal emission, not recall/save.
- **Input:** a headless run via route-proposal with Claude Code hooks installed.
- **Current output:** two independent memory blocks in the same session (brief + SessionStart recall), potentially the same frames twice.
- **Repro test / limitation:** no test; static analysis.
- **Expected (brief §8.3):** a coordination marker paired with a run/context ID; it is not authorization.
- **Minimal change:** add an env marker to `WAGGLE_ENV_ALLOWLIST` (`external-process-env.ts:29-35`) alongside `WAGGLE_RUN_ID`; SessionStart skips/shortens recall when the marker + run id are present; the scope/taint check remains.
- **AT:** AT-16.

### F-HM-09 — `recallMemory` engine with 7 lanes at exactly the stated lines (S1 W2 "preserve")

- **Claim from S1:** "`orchestrator.ts:582-978` recallMemory (7 lanes, engine unchanged)".
- **Status:** CONFIRMED AT REVISION.
- **Commit:** `2af0904d`.
- **Path/symbol:** `packages/agent/src/orchestrator.ts:582-978`. Lanes: (1) importance K5 (:700-725), (2) semantic personal (:682), (3) semantic workspace (:683-685), (4) date-window since/until + fallback (:673-693) and the "Events during X" section (:826-837), (5) profiles (:759-762, :800-807), (6) facts, newest 60 (:763-766, :808-815), (7) events, last 40 (:767-771, :816-822), plus RAWDETAIL (:858-894; comment :878 "the other 6 lanes stand"). Catch-up branch (:628-665). Empty-mind fast path (:591-607). Read-side injection scan (:923-933). Temporal anchor (:935-957).
- **Callers (grep `recallMemory(`):** `packages/server/src/local/routes/chat-turn-preparation.ts:237`, `chat.ts:390`, `command.ts:266`, `commands.ts:74`.
- **Input/output:** see the code; `{ text, count, recalled, recalledFrames }`.
- **Repro test / limitation:** `packages/agent/tests/orchestrator-recall-hardening.test.ts`, `w41-temporal-recall.test.ts`, `r2-recall-closure.test.ts`, `w46-rawdetail-recall.test.ts`, `orchestrator-memory-boundary-pins.test.ts`. Not executed.
- **Expected (D-12, DIR-09):** preserve; wrap in a typed contract without duplication.
- **Minimal change:** none.
- **AT:** AT-13, AT-14.

### F-HM-10 — Fleet/spawn/subagent/harness: fleet uses the assembler without multi-lane recall; harness and subagent have no recall (S1 W2 net-new "wiring")

- **Claim from S1:** net-new "wiring into fleet/spawn/sub-agents/harness phases".
- **Status:** PARTIAL/UNWIRED.
- **Commit:** `2af0904d`.
- **Path/symbol:** `packages/server/src/local/fleet-run-executor.ts:647-648` and `routes/fleet.ts:350-356` call `orchestrator.buildAssembledPrompt(task, persona, …)` without `recalledText` → the "Direct search for raw frames" branch (`orchestrator.ts:463-470`: two semantic searches, limit 10, without the importance/facts/events/RAWDETAIL lanes). `packages/agent/src/subagent-orchestrator.ts` and `workflow-harness.ts`: grep `recallMemory|buildAssembledPrompt|recalledText` = 0.
- **Input:** a fleet run or harness phase with the same query as chat.
- **Current output:** poorer context than in chat (loss of lane fidelity); harness phases have no memory.
- **Repro test / limitation:** there is no test that compares chat vs fleet context.
- **Expected (FRD §7 "context injection before native or external execution"):** the same context contract.
- **Minimal change:** for fleet: call `recallMemory` and pass `recalledText` into `buildAssembledPrompt` (the W4.5 path already exists); harness/subagent = W2 design.
- **AT:** AT-06, AT-16.

### F-HM-11 — Context handoff to an external executor exists only on the route-proposal path (DIR-10, W2 "external-executor injection")

- **Claim from S1/brief:** "context handoff" to an external executor; S1 W2 net-new "external-executor injection (file handoff)".
- **Status:** PARTIAL/UNWIRED.
- **Commit:** `2af0904d`.
- **Path/symbol:** `packages/server/src/local/executor-brief.ts:46-123` (`buildExecutorBrief`: workspace `HybridSearch`, `excludeDeprecated`, drops `temporary`/unreviewed imports, `redactSecrets`, discards items >30% redacted, cap of 8000 characters / 6 items, injection scan of the whole brief, sha256 `briefHash`), `:130-154` (`filterExecutorBrief`: never re-runs retrieval). Callers: `routes/route-proposals.ts:14,188,296`; the brief is prepended to the prompt (:205-207) and `briefHash` goes into `attribution` (:211) → `/api/tools/run` schema (`external-tool-runs.ts:103`) → frame `metadata` (`:956`). Direct `/api/tools/run` (dock/LauncherApp) and interactive `/api/tools/launch` (`routes/tools.ts:514-525`) do NOT attach the brief — the external tool receives the prompt + env IDs; memory arrives only if hooks are installed. Prompt transport: `temp-file` or `stdin` per manifest (`external-tool-runner.ts:128-130,364`).
- **Input:** (a) a run via route-proposal; (b) a run directly via `/api/tools/run`; (c) an interactive launch.
- **Current output:** (a) a bounded, redacted, scanned brief with a hash; (b),(c) no context from Hive Mind.
- **Repro test / limitation:** `packages/server/tests/local/executor-brief.test.ts` (6 `it`), `route-proposals.test.ts`. Not executed.
- **Expected (PRD §8 "native and external executors receive equivalent context contracts", DIR-10):** an explicit handoff for every path.
- **Minimal change:** reuse `buildExecutorBrief` in `/api/tools/run` when `attribution.briefHash` is missing (opt-in) — the final shape is for the spec writers to decide (not an architectural proposal of this pass).
- **AT:** AT-16.

### F-HM-12 — Capture with the workspace ID works; the run ID does not reach hook frames (DIR-10, `WAGGLE_WORKSPACE_ID`)

- **Claim from the brief:** capture "with the exact workspace/run identity".
- **Status:** PARTIAL/UNWIRED (workspace: CONFIRMED; run id: NOT WIRED).
- **Commit:** `2af0904d`.
- **Path/symbol:** the env is built by the fail-closed `buildExternalProcessEnv` (`packages/agent/src/external-process-env.ts:8-35,49-72`; allowlist `WAGGLE_WORKSPACE_ID`, `WAGGLE_RUN_ID`, `HIVE_MIND_DATA_DIR`…); headless: `external-tool-runner.ts:369-392` (`WAGGLE_RUN_ID`, `WAGGLE_WORKSPACE_ID`, `HIVE_MIND_DATA_DIR: request.dataDir`); interactive: `tool-launcher.ts:371-393`, `routes/tools.ts:514-525` (`dataDir`, `runId`, `roomId`, `runToken`). Hook side: `cli-bridge.ts:240,404-408` reads `WAGGLE_WORKSPACE_ID` → `workspace` arg on save/recall (:329-330,352-355) → `hook-runtime.ts:121-187` (`resolveMind`: `<dataDir>/workspaces/<id>/workspace.mind` + `workspace.json` id check, symlink/hardlink defense), which matches `packages/hive-mind-core/src/workspace-manager.ts:139-140,234,264`. Run id: grep `WAGGLE_RUN_ID|runId` in `hive-mind-shim-core/src`, `hive-mind-hooks-core/src`, `hive-mind-hooks-claude-code/src` = 0 → hook frames carry a `session:<id>` token (`frame-encoder.ts:112`), not a run id; the run id exists only in the `recordResultToMinds` metadata (`external-tool-runs.ts:950-958`).
- **Input:** a headless run with hooks; Stop hook.
- **Current output:** the frame lands in the correct workspace mind, without a link to `runId`.
- **Repro test / limitation:** `packages/hive-mind-shim-core/tests/cli-bridge.test.ts` (WAGGLE_WORKSPACE_ID), `hive-mind-core/tests/hook-runtime.test.ts`, `agent/tests/external-tool-runner.test.ts`, `tool-launcher.test.ts`. Not executed.
- **Expected (DIR-10):** capture linked to the run identity.
- **Minimal change:** `cli-bridge` reads `WAGGLE_RUN_ID` and `frame-encoder.ts` adds a `run:<id>` token to the header/metadata.
- **AT:** AT-16.

### F-HM-13 — Preventing key leakage to an external executor (AT-16)

- **Claim (AT-16):** "no key leakage".
- **Status:** CONFIRMED AT REVISION (the mechanisms exist), with one hole.
- **Commit:** `2af0904d`.
- **Path/symbol:** the env allowlist does not pass provider keys through (`external-process-env.ts:8-35`); the runner redacts the values of env variables matching `/(KEY|TOKEN|SECRET)$/` from event text (`external-tool-runner.ts:588-595`, applied in `emit` :169) — this also covers `WAGGLE_RUN_TOKEN`; the brief redacts (`executor-brief.ts:72-82`). Hole: the hook SessionStart inject (`session-start.ts:46-60`) does not redact secrets from recalled content.
- **Input:** a frame with a secret in the personal mind + a SessionStart hook in an external tool.
- **Current output:** the secret can enter the external context through hook recall.
- **Repro test / limitation:** env and redaction: `external-tool-runner.test.ts`, `external-process-env` covered in `tool-launcher.test.ts`. Hook hole: no test.
- **Expected:** no secrets in the injected context.
- **Minimal change:** `redactSecrets` over the hits in `formatHitsForContext` (both places: claude-code and handlers-core).
- **AT:** AT-16.

### F-HM-14 — External-tool `tool` events are self-reported, not server-verified (AT-16)

- **Claim (AT-16, brief §8.4):** "no claim about unobserved internal tool actions".
- **Status:** PARTIAL/UNWIRED.
- **Commit:** `2af0904d`.
- **Path/symbol:** `external-tool-runner.ts:519,531` emits `'tool'` from the tool's parsed JSON stream (`tool_use`, `command_execution`); `external-tool-runs.ts:922-932` writes into `metrics.toolsUsed` without a provenance label.
- **Input:** an external tool that claims in its stream that it called a tool.
- **Current output:** the registry records `toolsUsed` as fact; the UI provenance label was not checked in this pass.
- **Repro test / limitation:** static analysis; UI not reviewed.
- **Expected (brief §8.4):** do not label as server-verified when Waggle receives only a text stream.
- **Minimal change:** in the registry, mark `toolsUsed` as `tool-reported`; UI copy "reported by the tool".
- **AT:** AT-16.

### F-HM-15 — A LoCoMo same-judge regression gate before merge does not exist (S1 A26)

- **Claim from S1:** add "a LoCoMo same-judge regression gate before merge".
- **Status:** NOT CONFIRMED (the gate does not exist).
- **Commit:** `2af0904d`.
- **Path/symbol:** `.github/workflows/` (ci.yml, deploy-www.yml, hive-mind-cli-cross-platform.yml, installer-smoke.yml, mind-parity-check.yml, release.yml, sync-mind.yml, tauri-build-pr.yml) — grep `locomo` = 0. There are `benchmarks/harness`, `benchmarks/results`, `recount.mjs` (offline recount) — a manual process.
- **Input:** a PR that changes the recall block render.
- **Current output:** no automatic regression detection.
- **Repro test / limitation:** n/a.
- **Expected (S1 W2 risk "LoCoMo regression"):** a controlled re-run before merging changes to the recall render.
- **Minimal change:** a process gate (manual same-judge run + `recount.mjs`) documented in the plan; CI is not required for G1.
- **AT:** AT-28.

### F-HM-16 — Idempotency of extraction/consolidation: content-hash dedup exists; there is no run/output version key (brief §8.2, AT-14)

- **Claim from the brief:** "Memory consolidation must be idempotent per run/output version."
- **Status:** PARTIAL/UNWIRED.
- **Commit:** `2af0904d`.
- **Path/symbol:** `packages/hive-mind-core/src/mind/frames.ts:109-111,289-294` (`createIFrame` → `findDuplicate` by `content_hash`, updates access_count); `harvest/extract-memory-lanes.ts:284` (facts/events idempotent via dedup, profiles replaced); `packages/weaver/src/consolidation.ts:226-236` (`distillSessionContent` replace-on-update via `deleteByContentPrefix`), `:181-189` (B-frame pair dedup); `packages/agent/src/cognify.ts:64-70` (`cognify` creates a P-frame when an I-frame exists — P-frame dedup not verified). The external run record dedups only identical content (runId is in the text → same run/same summary = 1 frame; a retry with a different summary = a second frame).
- **Input:** the same extraction repeated / the record of the same run repeated.
- **Current output:** identical content is not duplicated; different text for the same run is duplicated.
- **Repro test / limitation:** `hive-mind-core/tests/harvest/extract-memory-lanes.test.ts:111-122`, `hive-mind-core/tests/hook-runtime.test.ts:96-121`, `server/tests/local/memory-lane-cron.test.ts:74-86`, `weaver/tests/consolidation-enhanced.test.ts:127`. Not executed.
- **Expected (AT-14):** re-running the same extraction does not duplicate memory.
- **Minimal change:** a dedup key `(runId, outputHash)` in metadata for run records; verify `createPFrame` dedup.
- **AT:** AT-14.

### F-HM-17 — The two MCP servers are both live on different paths; `erase` exists in only one (S1 §3 "defer")

- **Claim from S1:** "Consolidating the two MCP servers — Defer (debt)".
- **Status:** CONFIRMED AT REVISION (two exist); the merge decision = DEFERRED (S1).
- **Commit:** `2af0904d`.
- **Path/symbol:** `packages/memory-mcp` (`name: waggle-memory-mcp`, server `waggle-memory`, data `WAGGLE_DATA_DIR`/`~/.waggle`, has `tools/erase.ts`) vs `packages/hive-mind-mcp-server` (`@waggle/hive-mind-mcp-server`, server `hive-mind-memory`, `HIVE_MIND_DATA_DIR`/`~/.hive-mind`, without erase). `diff -rq` = 14 differing files, 289 diff lines in total. Consumers: the sidecar bundles `waggle-memory-mcp` (`scripts/check-sidecar-resources.mjs:955`, `stage-sidecar-deps.mjs:53`, `build-hook-runtime.mjs:25,55`); the claude-desktop hooks register `waggle-memory-mcp` (`hive-mind-hooks-claude-desktop/src/install.ts:52,110`); `hive-mind-cli mcp start|call` launches `@waggle/hive-mind-mcp-server` (`hive-mind-cli/src/commands/mcp-start.ts:36`) — the hook bridge `mcp call` path (`cli-bridge.ts:260-266`) goes to the hive-mind server.
- **Input:** a GDPR erase through a tool that uses the hive-mind server.
- **Current output:** the `erase` tool is unavailable via that path; behavioral divergence between the two servers.
- **Repro test / limitation:** `hive-mind-mcp-server/src/integration.test.ts`, `tests/scope.test.ts`; not executed.
- **Expected:** a single semantics or a documented difference.
- **Minimal change:** no merge (S1: defer); record the `erase` divergence as a risk for AT-15/GDPR and decide whether the hook path needs erase.
- **AT:** AT-15.

### F-HM-18 — No checkpoint-bound context, and therefore no invalidation of an erased source after resume (AT-15)

- **Claim (AT-15):** "A revoked/erased source from checkpoint context is not used after resume."
- **Status:** PARTIAL/UNWIRED (erasure exists; the checkpoint↔context link does not exist).
- **Commit:** `2af0904d`.
- **Path/symbol:** the only durable context reference is `briefHash` in `attribution` (`route-proposals.ts:211`, `external-tool-runs.ts:103`); resuming an external run uses only `sessionId` (`external-tool-runner.ts:55-56,138`) without re-validating the brief. Erasure: `hive-mind-core/tests/mind/erasure.test.ts`, `memory-mcp/src/tools/erase.ts`, `erased_subjects` (memory arc 2026-07-02).
- **Input:** a frame from the brief is erased, then the run is resumed.
- **Current output:** there is no mechanism that would re-resolve the context; the external tool continues with its own session.
- **Repro test / limitation:** no test; static analysis.
- **Expected (brief §8.1):** a snapshot does not override erasure; mark the invalidation.
- **Minimal change:** W2 design (outside this pass); at minimum: on resume, check that the `briefHash` frames still exist, or refuse silent continuation.
- **AT:** AT-15.

---

## 2. What already works or exists (existingAssetsToPreserve; callers verified with grep)

| What | Path | Callers / tests |
|---|---|---|
| `recallMemory` multi-lane engine (7 lanes + RAWDETAIL, read-side scan, temporal anchor) | `packages/agent/src/orchestrator.ts:582-978` | `server/src/local/routes/chat-turn-preparation.ts:237`, `chat.ts:390`, `command.ts:266`, `commands.ts:74`; tests `agent/tests/orchestrator-recall-hardening`, `w41-temporal-recall`, `r2-recall-closure`, `w46-rawdetail-recall` |
| Exclusion of `temporary`/`deprecated` from Waggle recall | `orchestrator.ts:728-737`; `agent/src/context-loader.ts:77-88`; `server/src/local/routes/workspace-context.ts:283,342,361`; `server/src/local/executor-brief.ts:66` | pin `agent/tests/r2-recall-closure.test.ts:27-40` |
| RAWDETAIL write/read + kill switch `WAGGLE_RAWDETAIL` | `hive-mind-core/src/harvest/raw-turns.ts`; `hive-mind-core/src/mind/raw-detail-lane.ts:116-187` | writers `server/src/local/routes/harvest.ts:661`, `memory-mcp/src/tools/harvest.ts:316`, `hive-mind-mcp-server/src/tools/harvest.ts:318`; reader `orchestrator.ts:873`; tests `w46-*`, `raw-detail-lane.test.ts` |
| Cross-encoder reranker, default ON, kill switch `WAGGLE_RERANKER=0` | `orchestrator.ts:70-86,554-580`; `hive-mind-core/src/mind/inprocess-reranker.ts` | `server/src/local/index.ts:792,800,1364` (`rerankerCacheDir`); `vitest.setup.ts:25-26` pins it OFF in tests |
| PromptAssembler W4.5 single-render of the recall block + `TurnRecalledContext` | `agent/src/prompt-assembler.ts:433-457`; `server/src/local/routes/chat-turn-recall-context.ts` | `chat-turn-preparation.ts:377-387`, `chat.ts:1235,1347`, `fleet-run-executor.ts:647`, `routes/fleet.ts:350` |
| Executor brief (bounded, redacted, scanned, hashed) | `server/src/local/executor-brief.ts:46-154` | `routes/route-proposals.ts:14,188,296`; `/api/tools/run` `attribution.briefHash` (`external-tool-runs.ts:103`); tests `executor-brief.test.ts` (6), `route-proposals.test.ts` |
| Fail-closed env for external processes + secret redaction in event text | `agent/src/external-process-env.ts:8-72`; `agent/src/external-tool-runner.ts:588-595` | `external-tool-runner.ts:375`, `tool-launcher.ts:393`; tests `external-tool-runner.test.ts`, `tool-launcher.test.ts` |
| Hook runtime: scoped resolveMind, write-side ingress guard, content dedup | `hive-mind-core/src/hook-runtime.ts:121-225` | `hive-mind-cli/src/commands/hook-call.ts:115,143`; `shim-core/src/cli-bridge.ts:258`; test `hive-mind-core/tests/hook-runtime.test.ts` |
| Hook lifecycle bodies (recall+inject, save-temporary, stop summarize, pre-compact) | `hive-mind-hooks-core/src/handlers-core.ts` | hooks codex/codex-desktop/cursor/hermes/openclaw; claude-code has its own copies (`hooks-claude-code/src/hooks/*`); tests `handlers-core.test.ts` |
| `WAGGLE_WORKSPACE_ID` → active workspace in the hook bridge | `shim-core/src/cli-bridge.ts:240,404-408`; `context-recall.ts:10-33` | all hook packages via `createCliBridge`; test `shim-core/tests/cli-bridge.test.ts` |
| Workspace mind layout `workspaces/<id>/{workspace.json,workspace.mind}` | `hive-mind-core/src/workspace-manager.ts:139-140,234,264` | `hook-runtime.ts:140-186` same layout; test `hive-mind-core/tests/workspace-manager.test.ts` |
| Extraction idempotency (content-hash dedup, lane dedup, distill replace-on-update) | `hive-mind-core/src/mind/frames.ts:109-111,289-294`; `harvest/extract-memory-lanes.ts:284`; `weaver/src/consolidation.ts:181-189,226-236` | `server/src/local/memory-lane-cron.ts`; tests `extract-memory-lanes.test.ts:111`, `memory-lane-cron.test.ts:74`, `consolidation-enhanced.test.ts:127`, `hook-runtime.test.ts:96` |
| TTL for `temporary` (30 days) and `deprecated` (90) | `hive-mind-core/src/mind/frames.ts:404-483` (`compactFrames`) | `hive-mind-cli/src/commands/maintenance.ts:501`; `memory-mcp/src/tools/cleanup.ts:319`; PreCompact hook `handlers-core.ts:237` — NO server-side cron caller |
| Mind isolation pin tests | `agent/tests/orchestrator-memory-boundary-pins.test.ts`; `server/tests/local/memory-stats-isolation.test.ts`; `agent/tests/subagent-isolation.test.ts`; `server/tests/local/fleet-isolation.test.ts` | they pin: two orchestrations do not share a layer; a workspace save does not go to personal; stats personal-only; subagent fresh window |
| `save_memory` B1 guardrail (workspace signal → workspace) + F7 cross-mind dedup | `agent/src/tools.ts:405-515` | agent tool registry; tests in `agent/tests` (name not verified) |
| `recordResultToMinds` metadata with `runId/roomId/workspaceId/toolId/briefHash` + ingress quarantine | `server/src/local/routes/external-tool-runs.ts:941-1005` | `external-tool-runs.ts:803-806`; test `external-tool-runs.test.ts:240-336` |
| Two MCP servers (`waggle-memory-mcp`, `@waggle/hive-mind-mcp-server`) | `packages/memory-mcp/src`, `packages/hive-mind-mcp-server/src` | sidecar bundle `scripts/check-sidecar-resources.mjs:955`; claude-desktop `install.ts:110`; `hive-mind-cli mcp-start.ts:36` |

---

## 3. Notes and limitations

- The tests listed as "pin" were not executed in this pass (read-only directive; vitest cache in `node_modules`; the better-sqlite3 ABI trap requires Node 22.23.2). Recommendation for the next pass with write permission: `npm run test -- --run packages/agent/tests/r2-recall-closure.test.ts packages/agent/tests/w46-rawdetail-recall.test.ts packages/hive-mind-core/tests/hook-runtime.test.ts packages/server/tests/local/external-tool-runs.test.ts packages/server/tests/local/fleet-isolation.test.ts`.
- No E2E flow (sidecar + Claude Code/Codex/Hermes with hooks) was run; F-HM-08/11/12/13 are static analysis.
- Doc drift noticed along the way (not a separate finding): CLAUDE.md §10 "PA … default OFF" vs `feature-flags.ts:38` default ON; `orchestrator.ts:106-109` "IF WAGGLE_RERANKER=1" vs `:564` default ON.
- F-HM-05 extends S1 A26: the leak is not in one place but in four (`external-tool-runs.ts`, `chat-collaboration.ts`, `fleet-run-executor.ts`, `agent-groups.ts`), and three test files pin it as desired behavior — the fix must go together with changes to those tests and a new sentinel test (AT-13).
- There are no architectural proposals in this document; "minimal change" describes the boundary of the fix, not a design of the `ContextPackage` (that is the spec writers' job).
