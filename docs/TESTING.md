# Testing

Safety-net record for the `/remove-technical-debt` journey (tracker:
`docs/REMOVE-TECHNICAL-DEBT-PLAN.md`). Phase 1 owner: agent, 2026-09-14.

## Test Strategy

- **Pyramid.** Vitest unit + route-level integration through `buildLocalServer` (Fastify
  `inject`, real SQLite in a temp `dataDir`, LLM replaced at the `server.agentRunner` seam);
  Playwright API/E2E on top. `npm run test -- --run` is the deterministic gate; infra suites
  (Postgres/Redis) and `packages/server/tests/performance/**` run in dedicated lanes.
- **Runtime.** Run tests under **Node 22.23.2** (the packaged sidecar runtime). The fnm default
  shell is Node 24; `better-sqlite3` is built for ABI 127, so Node 24 fails 123/236 server test
  files with `ERR_DLOPEN_FAILED`. Bash prefix:
  `eval "$(fnm env --shell bash)" && fnm use 22.23.2`. Never `npm rebuild` for 24.
- **Baseline (2026-09-14, Node 22.23.2):** `packages/server` 235 files passed, 1 skipped;
  3893 tests passed, 1 skipped.
- **Characterization discipline.** Tests in `*-characterization.test.ts` pin *observed*
  behavior (probe with a known-wrong assertion, read the failure, pin the real value). They
  are not specs. A bug found while pinning is pinned with a `// QUIRK` comment and a
  `docs/TECH-DEBT.md` ledger row, never fixed in the same commit.
- **Pinch points for `routes/chat.ts`.** The 3594-line `POST /api/chat` handler (measured from the
  `}>('/api/chat', …)` line to the `// DELETE /api/chat/history` comment at base `44baa77d`) is reachable
  only through HTTP, but two seams make that cheap: (1) `server.agentRunner` — an object seam
  the route reads per turn, so a test-supplied runner replaces the whole agent loop and doubles
  as a sensing point; (2) `commandRegistry.isCommand(message)` — slash commands terminate before
  the agent loop, so `/skills`, `/status`, `/memory` exercise the request/persistence/SSE path
  with zero LLM involvement. Message-text classifiers (`chat-helpers.ts`) select most branches,
  so a directive suffix such as `- do not use my saved memory` steers the turn-mutation policy
  from the request body alone.
- **Seam caveat.** Setting `server.agentRunner` flips `hasCustomRunner`, which skips roughly two
  thirds of the handler's side effects: tool-pool construction, automatic recall, GEPA expansion,
  the pre-tool approval hook, knowledge-graph entity writes, correction detection, auto-save, and
  the retry / model-fallback / credential-rotation chain (`runAgentAttempt` 4806,
  `runModelFallbackChain` 4967, 5064–5146). The only harness that reaches those is the
  **link seam on `globalThis.fetch`** (8 tests in `chat-api.test.ts` stub the OpenAI-compatible
  provider and let the real `runAgentLoop` run). New pins for that region must use the fetch-spy
  shape, not `agentRunner`.
- **Nested closures reachable only over HTTP** (no direct unit path): `buildSystemPrompt` 1852,
  `buildTurnContextSuffix` 2156, `acquireChatRuntime` / `releaseChatRuntime` 1641 / 1683,
  `pruneChatRuntimes` 1632, `loadProfile` 1687, the state-key helpers 1745–1774, the pre-tool
  hook closure 3387–3620, and every `agentConfig` callback 4455–4682. Module-level mutable state
  (`systemPromptCache`, `chatRuntimes`, `activeChatTurns`, `compressionSummaries`,
  `credentialPools`, `sessionToolSequences`, `dismissedCaptureSuggestions`,
  `retainedSessionStateLru`, `profileCache`) is reachable only via
  `server.agentState.chatStateController`. The Phase 1 effect sketch (phase table, effect exits,
  steering inputs) is summarized in `docs/TECH-DEBT.md` TD-CHAT-3 and will be reproduced as the
  Phase 2 extraction plan.

## Safety Net Map

| Module | Pinned behaviors | Test files | Gaps |
|---|---|---|---|
| `packages/server/src/local/routes/chat.ts` — request validation | `retry` non-boolean → 400 `INVALID_FIELD_TYPE`; malformed `retryTarget` (9 shapes) → 400 `INVALID_RETRY_TARGET`; well-formed `retryTarget` without `retry: true` → 400; non-string `workspace`/`workspaceId`/`session`/`sessionId` → 400 `INVALID_FIELD_TYPE`; >200-char segment → 400 `INVALID_FIELD_LENGTH`; 200-char boundary proceeds to SSE; rejected requests never reach `agentRunner` | `tests/local/chat-route-characterization.test.ts` | `SESSION_ID_CONFLICT` |
| `routes/chat.ts` — workspace resolution | supplied workspace with a missing `directory` → 409 `WORKSPACE_ROOT_UNAVAILABLE`; authorized literal `default` with no config → 409 `WORKSPACE_NOT_READY`; active workspace with a missing `directory` → 409 `WORKSPACE_ROOT_UNAVAILABLE` (pinned after the fact in `a55a1712` — commit `acd7ec0c` extracted these while they were still gaps); unknown named workspace → 404 `WORKSPACE_NOT_FOUND` with no orphan history (`chat-api.test.ts:3111-3128` at `b248ce38`); `default` history layout in `recovery-required` → 409 `CHAT_HISTORY_RECOVERY_REQUIRED` on POST and DELETE (`chat-api.test.ts:4522-4599` at `b248ce38`) | `tests/local/chat-route-characterization.test.ts`, `tests/chat-api.test.ts` | 403 `VIEWER_READ_ONLY` viewer exit inside `resolveChatWorkspacePaths` (`chat.ts:303-311` at `b248ce38`) — the only `VIEWER_READ_ONLY` pin (`chat-api.test.ts:4085` at `b248ce38`) is satisfied by `security-middleware.ts:895-903`, not by `chat.ts` (see TD-CHAT-18) |
| `routes/chat.ts` — slash-command turns | `/skills` renders every loaded skill verbatim; `/skills`, `/status`, `/memory <q>` stream one `done` event with `toolsUsed: []` and zero `usage`; memory-deny directive flips `listSkills`→`[]`, `searchMemory`→"disabled" sentinel; `/status` leaks the disabled sentinel as a section (QUIRK TD-CHAT-1); `/memory` echoes the directive in its heading (QUIRK TD-CHAT-2); reroute-to-agent-loop command with no model available streams the `requires AI` canned reply (`persona-acceptance-prompt-budget.test.ts:4650-4690`, body fragment only); `/marketplace installed|sync|install` under memory-deny → marketplace-disabled sentinel (`persona-acceptance-prompt-budget.test.ts:4709-4739`) | `tests/local/chat-route-characterization.test.ts`, `tests/local/persona-acceptance-prompt-budget.test.ts` | `/catchup`, `/now` under deny; reroute-to-agent-loop command (`AGENT_LOOP_REROUTE_PREFIX`) with an available model (the `Processing /… via AI` step has no test hit) |
| `routes/chat.ts` — `buildChatCommandContext` (module-level since `d242ec05`, exported in `80006984`) | `workspaceId` falls back to `Personal`; `searchMemory` renders the first five recall hits as a numbered `1. …` list, `count === 0` → `No relevant memories found.`, a recall outage (the shape `Orchestrator.recallMemory` returns from its own catch) → `No relevant memories found.` (QUIRK TD-CHAT-29), a throwing `recallMemory` → `Memory search unavailable.`, memory-deny short-circuits before the orchestrator is called; `getWorkspaceState` precedence: persisted-memory sentinel → conversation-history sentinel (reached only through an explicit history denial — every bounded `contextScope` is caught by the memory gate first) → `No workspace state available.` for a personal chat, an unknown workspace, or a mind with no frames → `formatWorkspaceNowPrompt(buildWorkspaceNowBlock(…))` for a managed workspace with memory | `tests/local/chat-command-context-characterization.test.ts` (14 direct pins, stub orchestrator + stub server) | `listSkills` is covered by the slash-command route pins only; `activateWorkspaceMind` / `cronSchedules` inputs not varied |
| `routes/chat.ts` — streaming, approvals, persistence, governance (pre-existing net) | SSE headers/ordering, single-flight per session, approval timeouts, governance tool filtering, prompt packaging, history persistence, LiteLLM key routing, retry-tail replacement; provider endpoint-down mapping to one actionable outage message (`chat-api.test.ts:2390-2440` at `b248ce38`); raw `err.message` passthrough for empty-response / LiteLLM-unavailable failures (`chat-api.test.ts:1254, 1337, 2384, 2494` at `b248ce38`); setup-required `No AI model is ready` reply (`sse-resilience.test.ts:95, 173, 232, 1474`) | `tests/chat-api.test.ts` (92), `tests/local/chat-approval-timeout.test.ts`, `chat-governance.test.ts`, `chat-helpers.test.ts`, `chat-persistence.test.ts`, `chat-prompt-packaging.test.ts`, `sse-resilience.test.ts`, `persona-acceptance-prompt-budget.test.ts`, `smart-router-chat.test.ts`, `chat-goal-ancestry.test.ts`, +4 | See Characterization Backlog |
| `routes/chat.ts` — team governance lookup (Phase 4, 2026-09-16) | role-matched `blockedTools` reach the agent-loop config through the injected-runner seam (the lookup is not gated by that seam), one policy call per workspace, bearer token on the request; an unreadable policies payload is cached before it is read, so turn one reports no policy (QUIRK TD-CHAT-30) and turn two throws out of the helper from the cache-hit path; since `f3d21adf` a thrown lookup **refuses the turn** (SSE `error`, no `done`, runner never invoked) instead of running it ungoverned; a team turn that fails before commit persists a `GENERATION_FAILED_PREFIX` assistant message | `tests/local/chat-route-characterization.test.ts` (3 route pins), `tests/local/chat-governance.test.ts` (3 direct pins + the pre-existing 20) | a **soft** lookup failure (no team server, network failure, non-2xx) still returns `undefined` and still runs the turn ungoverned — pinned as current behavior at `chat-governance.test.ts:255-281, 315-349`, open as TD-CHAT-23; `allowedSources` is never populated by `extractRolePolicy` |
| `routes/chat.ts` — pre-tool approval hook (Phase 4, 2026-09-16) | a gated `write_file` through the real agent loop emits `approval_required` carrying the tool name and arguments, `assessmentMode: heuristic`, `riskLevel: medium`, `approvalClass: elevated` and a `description` string, with no `trustSource`; with no client answering, the configured timeout denies the call, the denial reaches the model as a tool result, the turn still ends with `done` and `toolsUsed: []`, and the file is never written | `tests/local/chat-approval-hook-characterization.test.ts` (fetch link seam, no injected runner) | the `install_capability` content-based assessment and its catch; the `proposeHeld` reviewer branch; the saved-grant auto-pass; the `hold` timeout action; the enrichment catch itself (TD-CHAT-31), which needs a child sub-agent to reach |
| `routes/chat.ts` — `DELETE /api/chat/history` | clears session file + in-process state; 409 while a turn is active; 409 `CHAT_HISTORY_RECOVERY_REQUIRED` when the default layout needs recovery (`chat-api.test.ts:4522-4599` at `b248ce38`) | `tests/chat-api.test.ts`, `tests/workspace-sessions-concurrency.test.ts` | `rmSync` non-ENOENT failure (EBUSY/EPERM on Windows) → generic 500 without in-process eviction (TD-REL-5, unverified) |
| Exported helpers (`resolveChatAncestry`, `hasRegulatedDisclaimer`, `isExplicit*`, `parseDirectReadFileDirective`, `filter*ForConversationalTurn`, `waitForApprovalDecision`, …) | Direct unit pins | `tests/chat-api.test.ts`, `tests/local/chat-prompt-packaging.test.ts`, `chat-approval-timeout.test.ts` | `isClosedDbError`, `resolveRealPath` never executed |

`chat-api.test.ts` line references above are at `b248ce38`; commit `629a48b4` re-indented five tests on the
Phase 3 branch, shifting later lines by up to +4. `persona-acceptance-prompt-budget.test.ts` and
`sse-resilience.test.ts` are untouched on that branch.

**Coverage of `chat.ts` (Node 22.23.2, 2026-09-14, the 15-file set — the `## CI Gates` list below minus `chat-command-context-characterization.test.ts` —,
868 tests):** 86.5% lines · 83.8% branches · 92.6% functions (1623/1936 branches). Re-measured 2026-09-15 at `9a9f96b7` with the 16-file set below (the 15 plus `tests/local/chat-command-context-characterization.test.ts`, 884 tests): 86.97% lines · 84.37% branches · 92.91% functions (branches read 84.36% on one of three runs). A smaller
9-file set measured before the characterization file gave 83.9% / 82.8% / 88.2%. Different file
sets give different numbers — always quote the set with the figure (the 7-file subset alone
measures ≈71% lines).

## Characterization Backlog

Remaining uncovered ranges in `routes/chat.ts` (statement coverage, ≥8 lines), labeled by
behavior. Risk = blast radius if a refactor silently changes it.

- [ ] 4806–5146 retry / model-fallback / credential-rotation chain (`runAgentAttempt`, `runModelFallbackChain`, `runPrimaryWithSafeInterruptedRetry`) via the fetch-spy harness; includes the stale read-only-tool state carried across attempts (TD-CHAT-10) (risk: high — routing receipt surface; P1)
- [ ] 1852–1935 `buildSystemPrompt` early-return prompt variants given `server.activeBehavioralSpec` + persona (risk: high — persona receipt surface; P1)
- [ ] 1641–1683 `acquireChatRuntime` caching, LRU pruning, `toolContextKey` invalidation (risk: medium; P2)
- [ ] 2805–2826 workspace chat-runtime creation failure → turn error (risk: high — user-facing failure path; priority: P1)
- [ ] 3432–3458 `proposeHeldTurn` — headless reviewer tool proposal held/denied (risk: high — trust boundary; P1)
- [ ] 3469–3484 "Always allow" approval-grant auto-pass (risk: high — security; P1)
- [ ] 3499–3532 starter-skill trust assessment + `classifyGatedToolRisk` fallback when `trustMeta` absent (risk: high — security; P1)
- [ ] 3591–3619 approval timeout `onHeld` audit event + abort after wait (risk: high; P1)
- [ ] 3863–3885 compression-summary injection scan ≥0.7 blocks persistence (risk: high — injection defense; P1)
- [ ] 5570–5591 closed-DB / post-commit observer failure after response committed (risk: medium — fail-soft path; P2)
- [x] 2433–2443 `WORKSPACE_NOT_READY` / `WORKSPACE_ROOT_UNAVAILABLE` 409 exits — pinned in `a55a1712`
- [ ] 2880–2889 budget-model unavailable → fall back to primary (risk: medium — routing receipt surface; P2)
- [ ] 3299–3310 GEPA vague-prompt expansion step + choices event (risk: medium; P2)
- [ ] 3347–3354 template welcome context from workspace `templateId` (risk: low; P3)
- [ ] 4650–4682 TeamSync push after `save_memory` in a team workspace (risk: medium; P2 — needs team fixture)
- [ ] 5266–5312 skill-distillation directive + entity extraction into KG (max 10/turn) (risk: medium; P2)
- [ ] 5367–5377 capture-suggestion notification + dismissal memo (risk: low; P3)
- [ ] 5794–5802 defensive trace finalization `outcome: 'abandoned'` on exotic exit (risk: low; P3)
- [ ] 1547–1559 daily cost carry-over from `traceStore` at plugin init (risk: low; P3)
- [ ] 1587–1596 capability-gap recording on memory-write lint (risk: low; P3)
- [ ] 1830–1839 `onRestored` cache clear after backup restore (risk: medium; P2 — pair with `backup-restore.test.ts`)
- [ ] Slash commands: `/catchup`, `/now` under memory-deny; reroute prefix path with an available model (P2). `/marketplace installed|sync|install` under deny and the no-model reroute reply are already pinned in `persona-acceptance-prompt-budget.test.ts` (Safety Net Map row 3, corrected 2026-09-15)
- [x] `buildChatCommandContext` (module-level since `d242ec05`; the Phase 3 branch review found 13 of its moved lines have no executing route test): pin `/memory <q>` with a seeded personal mind (numbered `1. …` list and the `slice(0, 5)` cap); `/memory` when `recallMemory` throws → `Memory search unavailable.`; `/status` or `/now` with `- do not use conversation history` → `Conversation-derived workspace state is disabled for this turn.` (rendered as a section per TD-CHAT-1); `/status` or `/now` with a managed `workspace` → the `formatWorkspaceNowPrompt` block vs `No workspace state available.` when the block is null. Cheapest as direct unit pins with a stub orchestrator/server (risk: medium — Rule 8 disclosure; P1) — pinned 2026-09-15 in `9a9f96b7` (`tests/local/chat-command-context-characterization.test.ts`, 14 pins after the export in `80006984`); QUIRK TD-CHAT-29 found while pinning; the scope half of the history gate is unreachable from the route (every bounded `contextScope` fails the memory gate first)
- [ ] `apps/web/src/lib/adapter.ts` (4216 LOC, 157 commits/6mo) — 12 partial test files; map gaps before Phase 2 touches it (P2)
- [ ] `packages/server/src/local/index.ts` (3583 LOC, 150 commits/6mo) — bootstrap wiring; characterize the decorator contract (`agentRunner`, `sessionManager`, `workspaceManager`, `agentState`) that every route test relies on (P2)

## CI Gates

- `.github/workflows/ci.yml` runs the default Vitest gate; `installer-smoke.yml` and
  `tauri-build-pr.yml` cover packaging. Coverage is not enforced in CI.
- Local re-measure for `chat.ts` (Node 22.23.2). This is the exact 16-file set behind the
  headline above; list files explicitly — Vitest treats a quoted glob as a name filter, and the
  summary line shows how many files ran:

```bash
npx vitest run \
  packages/server/tests/chat-api.test.ts \
  packages/server/tests/chat-goal-ancestry.test.ts \
  packages/server/tests/smart-router-chat.test.ts \
  packages/server/tests/skill-integration.test.ts \
  packages/server/tests/local/chat-approval-timeout.test.ts \
  packages/server/tests/local/chat-governance.test.ts \
  packages/server/tests/local/chat-helpers.test.ts \
  packages/server/tests/local/chat-persistence.test.ts \
  packages/server/tests/local/chat-prompt-packaging.test.ts \
  packages/server/tests/local/chat-route-characterization.test.ts \
  packages/server/tests/local/sse-resilience.test.ts \
  packages/server/tests/local/persona-acceptance-prompt-budget.test.ts \
  packages/server/tests/local/phase2-traversal-chat.test.ts \
  packages/server/tests/local/ambiguity-detection.test.ts \
  packages/server/tests/local/p5-skill-governance.test.ts \
  packages/server/tests/local/chat-command-context-characterization.test.ts \
  packages/server/tests/local/chat-approval-hook-characterization.test.ts \
  --coverage --coverage.include=packages/server/src/local/routes/chat.ts --coverage.reporter=text
```
