# Phase A — revalidation of the "capability" group at `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`

> **English translation** of [capability.md](capability.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Revision:** `main = 2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (`git rev-parse HEAD` confirmed; `git status --porcelain` shows only two untracked `.docx` in `docs/`, no cited file is modified — working tree == HEAD for all listed paths).
**Date:** 2026-09-27. **Method:** read-only file reading + `grep`/`rg` by capability (not by name), without executing tests (`npm ci` is not allowed). All paths are relative to `D:/Projects/waggle-os`.
**Scope (S1):** C13, C14, C16, A12–A15, W4; spot-check `dock-tiers.ts:82`, `cost.ts:210,272`; AT-11, AT-12, AT-17, AT-18, AT-19, AT-25.

> Statuses: **CONFIRMED AT REVISION** = S1 claim reproduced at this revision by reading the code; **PARTIAL/UNWIRED** = part exists and part does not, or it exists without a caller/contract; **ALREADY CLOSED** = S1 finding already resolved at HEAD; **UNKNOWN** = not verified sufficiently. Nothing below is the result of an executed test; "repro test" cites an *existing* test or a verification limitation.

---

## 0. Correction of S1 references (first of all)

| S1 citation | Actual at `2af0904d` |
|---|---|
| `agent-search.ts:81` "OAuth can't finish inline (D3)" | The file `apps/web/src/lib/agent-search.ts` has 59 lines and does not contain that comment. The comment is in **`packages/server/src/local/routes/agent-search.ts:79`** (`{ mode: 'open-in', appId: 'connectors' } // OAuth can't finish inline (D3)`). "D3" is a label from the PR4 recon table `docs/redesign-warm-hive/pr4-recon/04-inline-in-chat.md:205` ("Token→vault on approve … the approval contract is boolean-only"), not an ADR. |
| `held-action-executor.ts:6-10` "never mid-run suspend/resume" | Confirmed verbatim: `packages/server/src/local/held-action-executor.ts:8-10`. |
| `dock-tiers.ts:82` Approvals TEAMS | Confirmed: `apps/web/src/lib/dock-tiers.ts:82` `minBillingTier: 'TEAMS'`. The same gate is also in `apps/web/src/components/os/AppShell.tsx:727-728` and `apps/web/src/lib/command-catalog.ts:89`. |
| `cost.ts:210,272` TEAMS | Confirmed: `packages/server/src/local/routes/cost.ts:210` (`/api/cost/by-workspace`) and `:272` (`/api/costs` alias) are both `requireTier('TEAMS')`; `/api/cost/summary` (`:85-88`) is intentionally FREE. |

---

## 1. Findings (finding records)

### F-CAP-01 — C13: lane order (native → … → marketplace) vs ranking
- **S1 claim:** FRD §6 gives a strict lane order and at the same time "rank by task match"; it is unclear whether this is a priority or a tie-breaker.
- **Status:** **CONFIRMED AT REVISION** (the code has *two different* behaviors, neither of which is "permissions first").
- **Path/symbol:**
  - `packages/agent/src/capability-acquisition.ts:299-311` `searchCapabilities()` — sorts by `matchScore` desc; only if the difference is ≤0.05 does it apply `availabilityOrder` (active < installed_inactive < installable). The lane (native/skill/starter/marketplace) is not a criterion except through the `NATIVE_TOOL_HINTS` score.
  - `packages/agent/src/capability-router.ts:62-170` `CapabilityRouter.resolve()` — fixed per-lane confidence: native 1.0/0.8 → connector 0.75 → skill 0.7/0.5 → plugin 0.6 → mcp 0.45 → subagent 0.4; sort by confidence (i.e. a *strict* lane order disguised as a score).
  - `packages/server/src/local/routes/agent-search.ts:158` — merges engine candidates and the connector lane by `matchScore` only.
  - None of the three engines filters by permissions/egress/readonly/trust *before* ranking; `trust` is only attached (`capability-acquisition.ts:220,241,265,294`) and does not affect rank (the test `capability-acquisition-trust.test.ts:126` explicitly locks this: "trust assessment does not change candidate scoring/ranking").
- **Input:** `need = "send an email to the team"` with Gmail connected and the starter skill `email-drafting`.
- **Current output:** `searchCapabilities` → skill/starter by keyword score; `CapabilityRouter` → connector 0.75 above skill 0.7 regardless of fit; `agent-search` → merge by score. Three answers to the same question.
- **Repro test / limitation:** existing `packages/agent/tests/capability-acquisition.test.ts:131` ("prefers native tools over installable skills when native matches well") and `capability-router.test.ts`; there is no test covering "permission-filter before rank".
- **Expected (brief §9.1, C13 CLARIFY):** first filter by permissions/egress/readonly/availability/trust, then rank by task fit; the lane order is a tie-breaker among valid candidates.
- **Minimal change:** a single `filterCandidates(envelope)` step before `candidates.sort` in `searchCapabilities` (and the same step in the `agent-search` merge), plus a test "read-only persona does not get a write candidate". Do not physically merge the engines (brief DIR-11).
- **Related AT:** AT-17.

### F-CAP-02 — C14: "missing connector blocks inline and continues the same run" vs D3 and the held-action ADR
- **S1 claim:** FRD §6/§15 promises inline block+resume; the code says OAuth cannot finish inline (D3) and "never mid-run suspend/resume".
- **Status:** **CONFIRMED AT REVISION** (with the path correction from §0).
- **Path/symbol:**
  - `packages/server/src/local/routes/agent-search.ts:76-80` — OAuth connector → `{ mode: 'open-in', appId: 'connectors' }`; api_key/bearer → `{ mode: 'store', extensionId: 'connector:<id>', kind: 'federated' }`.
  - `packages/server/src/local/held-action-executor.ts:6-10` — ADR: a held action is a self-contained `{tool,args}`, "execute-on-approve, never mid-run suspend/resume".
  - `packages/server/src/local/routes/oauth.ts:64-65,138-139` — `pendingStates: Map<state,{provider,createdAt}>` in memory; the state is `randomBytes(24)`; there is **no** run/session/workspace binding; `:200-209` validates only the state; `:290-311` writes the token to the vault and returns the HTML "You can close this tab". No PKCE (`grep -i "pkce|code_challenge|code_verifier"` → 0 hits in `packages/server/src`).
  - `packages/server/src/local/routes/capability-proposals.ts:12-13,35` — `CapabilityProposalStore` is an in-memory `Map`, TTL 10 min, max 256; bound to `workspaceId+sessionId` (good), but it does not survive a restart and has no notion of a run.
  - `grep -rn "BLOCKED_CAPABILITY|BLOCKED_APPROVAL"` in `packages/` and `apps/` → **0** hits. Existing run status set: `packages/shared/src/types.ts:398-402` (`…'waiting_for_approval'…'interrupted'`), `packages/server/src/local/agent-run-registry.ts:24-35`.
- **Input:** mid-turn, the agent concludes that it needs the Gmail (OAuth) connector.
- **Current output:** there is no server-side event; the UI card `CapabilityRequestCard` renders only `starter-pack`/`marketplace` (`apps/web/src/components/os/apps/chat-blocks/CapabilityRequestCard.tsx:94-99`); connector/mcp kind → `return null`. The user goes to the Connector Hub; after the OAuth callback there is no signal back to the chat/run; the turn has already ended.
- **Repro test / limitation:** `packages/server/tests/routes/agent-search.test.ts:44` ("routes an OAuth connector to the Hub (open-in), never an inline token") locks the *current* behavior; `capability-proposals.test.ts:100,114,171` lock the proposal's scope/expiry/replay. There is no test for "a callback for a different request does not trigger work" because the mechanism does not exist.
- **Expected (brief §9.3, C14 NEW ADR, DIR-04):** the run exists before blocking; a durable capability request (run/request ID, tool, scope, state, deadline); OAuth state/nonce bound to the actual request and verified server-side; SetupCompleted → the same run continues only with a valid grant.
- **Minimal change (without architecture):** (1) `pendingStates` gets `requestId/workspaceId/sessionId` and persistence in the same store as proposals; (2) the callback emits an internal event instead of only HTML; (3) a superseding ADR for `held-action-executor.ts:6-10`. The rest depends on W1 (DurableRun).
- **Related AT:** AT-11, AT-12.

### F-CAP-03 — C16: "agents hidden" vs 22 personas exposed
- **S1 claim:** the PRD says agents are hidden; PersonaSwitcher and onboarding expose 22 personas.
- **Status:** **CONFIRMED AT REVISION** as a fact; **PARTIAL** as a "defect" — brief §17 C16 says CLARIFY (an optional understandable role may remain). Not a code bug.
- **Path/symbol:** `packages/agent/src/persona-data.ts` — 23 `id:` entries (22 user-facing + the internal `session-reviewer`). `apps/web/src/components/os/overlays/PersonaSwitcher.tsx:3,77-83,176-179` (UNIVERSAL_MODE_IDS + `getSpecialistsForTemplate` + fallback to the whole `PERSONAS`). `apps/web/src/components/os/overlays/onboarding/constants.ts:102,127-129` `ALL_ONBOARDING_PERSONAS` (3 tiers).
- **Input/output:** opening PersonaSwitcher → two groups; onboarding → a picker with 19 (per CLAUDE.md §5).
- **Repro test / limitation:** persona-tier UI tests exist (CLAUDE.md §10 "26/26"); I did not execute them.
- **Expected:** persona as an optional "role/mode" with understandable copy; technical configuration hidden; no mandatory choice before the first task.
- **Minimal change:** a copy/IA decision (W5), not runtime.
- **Related AT:** —

### F-CAP-04 — A12: capability precedence envelope (governance > tier > persona > user policy > resolver)
- **S1 claim:** an envelope is needed; "mount silently" only within it.
- **Status:** **PARTIAL/UNWIRED** — all layers *except tier* exist as separate filters, but not as a single contract; the resolver does not read them. The S1 "tier" step does not exist in tool filtering (and brief A12 says not to introduce it).
- **Path/symbol (actual order in the chat path):**
  1. Persona allowlist/denylist/read-only: `packages/server/src/local/persona-tool-filter.ts:98-129` `applyPersonaToolFilter` (READ_ONLY_ALLOWED_TOOLS allowlist :72-88), `filterMcpToolsForPersona:145-153`; called from `packages/server/src/local/routes/chat-turn-preparation.ts:454,530,553`.
  2. Governance `blockedTools`: `chat-turn-preparation.ts:694-738` — **only when `wsConfig.teamId`**; `packages/server/src/local/routes/chat-governance.ts:87-89` returns `{status:'none'}` without a team server → a Solo user has no governance layer. The turn is refused if the policy is `unavailable/invalid` (:701-729).
  3. Executor defense-in-depth: `packages/agent/src/tool-executor.ts:129` governance block; `:160-182` `pre:tool` hook; `:184-226` approval floor (`needsConfirmation`/`isCriticalNeverAutopass` without `authorize` → `[BLOCKED]`).
  4. "User policy" = only `ApprovalGrantStore` (`packages/server/src/local/approval-grants.ts:172-304`, per (tool,targetKey,sourceWorkspaceId), non-grantable `bash/run_code/cli_execute/install_capability` :20-25) + autonomy level (`packages/agent/src/confirmation.ts:337-358`).
  5. Resolver (`searchCapabilities`, `CapabilityRouter`) — does not consult 1–4 (see F-CAP-01).
  - Tier: `packages/server/src/middleware/assert-tier.ts` `requireTier` gates *routes* (cost, team), not tools.
- **Input:** read-only persona `planner` + candidate `write_file`.
- **Current output:** the tool is removed from the serialized schema (persona filter), but `acquire_capability` could still propose a write-skill (the resolver does not know about the persona restriction).
- **Repro test / limitation:** persona-tool-filter tests (CLAUDE.md mentions them), `chat-approval-hook-characterization.test.ts` (15 tests); there is no test that ties the resolver to the envelope.
- **Expected (brief §9.2):** the intersection of system/egress, KVARK (when connected), user grants, workspace/role/read-only, and tool capabilities; the resolver never expands permissions.
- **Minimal change:** a typed `PermissionEnvelope` object computed in `chat-turn-preparation.ts` and passed to both the resolver and the executor (same source of truth); no new policy engine.
- **Related AT:** AT-17, AT-18.

### F-CAP-05 — A13: prompt injection from harvested content (scan on ingest, taint, convert-to-work, hook read path)
- **S1 claim:** four sub-items.
- **Status per sub-item:**
  - (a) `scanForInjection` on ingestion — **ALREADY CLOSED.** `packages/hive-mind-core/src/harvest/pipeline.ts:108-142` Pass 0 `evaluateExternalMemoryIngress` (drop + log); `packages/server/src/local/connector-harvest.ts:189-191` scan before `writeFrame`; `packages/hive-mind-core/src/harvest/extract-memory-lanes.ts:298` scan of LLM output; `extract-kg-entities.ts:172`. The guard adds normalization projections (`packages/hive-mind-core/src/memory-ingress-guard.ts:709-745`).
  - (b) taint by provenance — **NOT CONFIRMED** (no typed field exists). `grep -rn -i taint` → only comments in `extract-kg-entities.ts:19,137` and `extract-memory-lanes.ts:20,286`. Provenance is stored as a `source` frame column, not as a taint marker in the context.
  - (c) convert-to-work without external effect — **N/A at this revision**: `grep -rn -i "convert.?to.?work|WorkItem|toWorkItem"` in `packages/server/src` and `apps/web/src` → 0. The feature does not exist (W7).
  - (d) hook read path scans and excludes `temporary` — **CONFIRMED AT REVISION as a gap.** `packages/hive-mind-core/src/hook-runtime.ts:227-256` `recallHookFrames` reads `WHERE importance != 'deprecated'` (:237) → `temporary` frames (UserPromptSubmit, `packages/hive-mind-hooks-core/src/handlers-core.ts:148`) ARE returned to the hook; the scan is on the *write* side (`hook-runtime.ts:191`), not on read. The main app recall excludes temporary (`packages/agent/src/orchestrator.ts:648` `excludeTemporary:true`, `:734`).
- **Input:** a hostile email/file with `SYSTEM: ignore previous instructions` → (a) blocked at ingest; a variant without the keyword (AT-19) passes the scanner (regex-only: `packages/hive-mind-core/src/injection-scanner.ts:22-56`).
- **Current output:** the content enters the context as plain text; the policy/vault/send protection does *not depend* on the scanner but on the approval floor (`tool-executor.ts:184-226`) and `ALWAYS_CONFIRM` (`confirmation.ts:16-29`) — which is correct; there is no test tying this together (AT-19 "path without a detected keyword").
- **Repro test / limitation:** `packages/agent/tests/injection-scanner.test.ts`; `connector-harvest.test.ts`; there is no test for the hook recall `temporary` exclusion.
- **Expected (brief §11.4, A13 "ACCEPT WITH LIMITATION"):** scan + taint + provenance + permission boundary; the scanner is not a guarantee.
- **Minimal change:** (d) `recallHookFrames` adds `AND importance != 'temporary'` (or an opt-in flag) + a test; (b) a `trust/taint` field in the future `ContextPackage` (W2), not a new engine; an AT-19 test without a keyword through the approval floor.
- **Related AT:** AT-19, AT-14.

### F-CAP-06 — A14: threat model for inline MCP install + test "no secrets in prompts/traces"
- **S1 claim:** a threat model for inline binary installs and a test that there are no secrets in the prompt/trace are missing.
- **Status:** **PARTIAL** — the install path is already bounded (there is no inline MCP/binary install from the chat), but a formal threat-model document and a "no secrets in prompts/traces" test are not confirmed.
- **Path/symbol:**
  - The chat can install only a `starter-pack` skill (`packages/agent/src/skill-tools.ts:521` → `validateInstallCandidate`, `capability-acquisition.ts:453-456` "Only starter-pack") and a marketplace package through a server-issued proposal (`capability-proposals.ts:184-226`), both behind `install_capability` ALWAYS_CONFIRM (`confirmation.ts:21`) and the heuristics SecurityGate (`skill-tools.ts:540-560`).
  - MCP: `packages/server/src/local/routes/mcps.ts:227-301` → `/api/marketplace/install`; `packages/marketplace/src/installer.ts:392` `scanResult.blocked && !request.forceInsecure` → refuse; `forceInsecure` is accepted from the client body (`marketplace.ts:228`, `mcps.ts:235`) with an audit (`marketplace.ts:482-503`, `mcps.ts:399-416`). MCP binaries are launched through `packages/agent/src/mcp/mcp-runtime.ts:152-158` (`spawnSidecarOwnedProcess`).
  - Secrets: `packages/marketplace/tests/installer-security.test.ts:825` ("secret-free provenance for a canonical MCP install"); connector tool results are JSON from `connector.execute` (`connector-registry.ts:198`), the token never enters the args. A dedicated test "no secrets in the system prompt/trace" — **UNKNOWN** (I did not find one via the capability grep `secret.*prompt|redact.*trace` in the tests; I did not search exhaustively).
- **Input:** `POST /api/marketplace/install {packageId, forceInsecure:true}` on a package with a HIGH finding.
- **Current output:** it is installed with a "SECURITY OVERRIDE" audit record; there is no additional override-specific UI confirmation on the server (the client sends the flag).
- **Repro test / limitation:** `installer-security.test.ts` (40 tests, supply-chain), `capability-proposals.test.ts` (9).
- **Expected (brief §9.3 last paragraph, R11):** propose inline, install in Settings with the SecurityGate; no silent binary install — **already holds**; it should be *documented* as a threat model and a secrets test should be added.
- **Minimal change:** an ADR/threat-model document + one test asserting that `buildSystemPrompt`/trace do not contain vault values for a connected connector.
- **Related AT:** AT-17.

### F-CAP-07 — A15(a): Approvals behind the TEAMS paywall; cost view TEAMS
- **S1 claim:** `dock-tiers.ts:82` gates Approvals to TEAMS; `cost.ts:210,272` TEAMS.
- **Status:** **CONFIRMED AT REVISION.**
- **Path/symbol:** `apps/web/src/lib/dock-tiers.ts:81-82` (comment "Pro gets inline chat approvals"); `apps/web/src/components/os/AppShell.tsx:727-728`; `apps/web/src/lib/command-catalog.ts:89`. Server: `packages/server/src/local/routes/approval.ts` is **not** tier-gated (no `requireTier`); the `/approvals` route exists without a guard (`apps/web/src/App.tsx:150`). Cost: `cost.ts:210,272` `requireTier('TEAMS')`, `cost.ts:85-88` summary FREE.
- **Input:** a FREE (Solo) user; a held action arises from an IM channel (`APPROVAL_NEEDED_REPLY`) or an approval timeout `hold`.
- **Current output:** the inline approval card works (`apps/web/src/hooks/useChat.ts:846,1072`), but **the Approvals inbox is not in the navigation** for Solo — held actions wait in `pending_actions` with no visible entry point except the direct URL `/approvals` or the notification `actionUrl:'/approvals'` (`held-action-executor.ts:96`).
- **Repro test / limitation:** `apps/web/src/test/p7-a6-approval-gating.test.tsx` (I did not read its content); `approval-held.test.ts` covers the server path.
- **Expected (D-01, brief §12.2, A15):** individual approvals are not behind a paywall.
- **Minimal change:** remove `minBillingTier:'TEAMS'` in three places (dock-tiers, AppShell, command-catalog) + tests; move the cost `requireTier('TEAMS')` at `:210,:272` into the WB inventory (per-workspace cost is Solo functionality per the brief).
- **Related AT:** AT-12.

### F-CAP-08 — A15(b): persisted BLOCKED_APPROVAL
- **S1 claim:** a durable blocked run is needed.
- **Status:** **PARTIAL/UNWIRED** — what is durably stored is the *tool call* (held action), not the run.
- **Path/symbol:** `packages/server/src/local/routes/chat-approval-hook.ts:36` `APPROVAL_HOLD_TTL_MS = 24h`; `:95-105` timeout `policy.action==='hold'` → `cronStore.savePendingAction`; `:283-301` `proposeHeldTurn` → `decideReviewTurnTool` → `{cancel:true}`; `held-action-executor.ts:29` 7-day TTL for L2. Live approvals are the in-memory `server.agentState.pendingApprovals` Map (`approval.ts:33`). `waiting_for_approval` exists only for collaboration/fleet runs (`agent-run-registry.ts:24,35`, `fleet.ts:49`).
- **Input:** a gated tool in the chat; the user does not respond for 300 s (`chat-approval-timeout.test.ts:68`).
- **Current output:** the turn is aborted (`[BLOCKED] Approval for X moved to Approvals inbox`), the action remains in the inbox; after approval, `executeHeldAction` executes *only that tool* from `buildToolsForWorkspace` (`held-action-executor.ts:213-233`), without continuing the conversation/run.
- **Repro test / limitation:** `chat-approval-hook-characterization.test.ts:714` ("moves an unanswered card to the Approvals inbox and blocks the live call"); `chat-approval-timeout.test.ts` (4).
- **Expected (brief §6.4, AT-12):** `BLOCKED_APPROVAL` as a durable run state; decline/expiry/revoke survive a restart.
- **Minimal change:** depends on the W1 store; until then, a `held action ↔ run` mapping is not needed for G1 if it is clearly documented that the unit of durability is the tool call.
- **Related AT:** AT-12, AT-11.

### F-CAP-09 — A15(c): expiry / decline / revoke semantics
- **S1 claim:** needed.
- **Status:** **ALREADY CLOSED (partially)** — expiry and revoke exist and are tested; decline is one-shot (it is not remembered).
- **Path/symbol:** `held-action-executor.ts:159` atomic claim `held→approved`; `:163-166` expiry guard; `:191-202` re-validation (allowlist, critical, injection) at execution time; `approval.ts:77-82` deny = `claimPendingAction(...,'denied')`; `approval-grants.ts:111,233-246` `expiresAt` + prune; `:286-292` `revoke`; `approval.ts:119-133` DELETE/clear routes. Live deny: `chat-approval-hook.ts:469-474` only `resolve(false)` + audit `approval_denied`, nothing durable.
- **Input:** the same gated tool after "Deny".
- **Current output:** the next identical call asks for approval again (there is no "never allow" grant).
- **Repro test:** `held-action-executor.test.ts:187,198,292`; `approval-held.test.ts:302,313`; `approval-flow.test.ts:75`.
- **Expected:** decline with an optional duration; the model/hook/IM cannot override it.
- **Minimal change:** a negative grant in `ApprovalGrantStore` (the same `keyForTool`), checked before `pendingApprovals`.
- **Related AT:** AT-12.

### F-CAP-10 — A15(d): approve/deny from an IM channel (replace `APPROVAL_NEEDED_REPLY`)
- **S1 claim:** IM cannot approve; this should be replaced.
- **Status:** **CONFIRMED AT REVISION** — intentionally excluded in v1 (code + document).
- **Path/symbol:** `packages/server/src/local/channels/manager.ts:30-31` constant; `:265-275` usage; `packages/server/src/local/channels/chat-client.ts:11-13` "we do NOT approve over IM"; `docs/plans/CHANNELS-ARC-2026-07-09.md:23` "Tool approvals over IM — Not in v1". Pairing: `pairing.ts:95-123` single-use 8-character code, 10 min TTL, in memory only; allowlist by `platform+senderId` (`:132`), persisted in `channels.json`. Dedup by `platform:chatId:messageId` for 24h in memory (`manager.ts:320-341`); rate limit 10/min (`:348-357`). `proposeHeld:true` (`manager.ts:261`) → gated proposable tool → held action (`chat-approval-hook.ts:283-301`), non-proposable → deny.
- **Input:** a paired Telegram user sends "send email X".
- **Current output:** `send_email` becomes a held action; reply `APPROVAL_NEEDED_REPLY`; there is no token/nonce that would bind the IM reply to the action (the mechanism does not exist, so neither does a replay risk of that type).
- **Repro test:** `channels-manager.test.ts:143` ("replies with the approval message when the turn stalls on approval"), `:159` dedup, `:256` rate limit; `channels-pairing.test.ts` (13).
- **Expected (brief §11.6, AT-25):** a confirmation bound to the run/action, payload fingerprint, expiry, unique token; replay/forward does not yield a grant; senderId alone is not sufficient.
- **Minimal change:** when this is done (G3/W8): confirmation through a short-lived one-time token per `pending_action.id`, verified in the `executeHeldAction` claim; not through free text.
- **Related AT:** AT-25, AT-12.

### F-CAP-11 — W4 "one resolver merges 4 engines"
- **S1 claim:** there are 4 engines.
- **Status:** **CONFIRMED AT REVISION** (at least 4, without a facade).
- **Path/symbol:** (1) `searchCapabilities` `packages/agent/src/capability-acquisition.ts:187`; (2) `CapabilityRouter.resolve` `capability-router.ts:58` — called only as an unknown-tool fallback in `packages/agent/src/tool-executor.ts:143-151`; (3) `scoreConnectors` `routes/agent-search.ts:56`; (4) marketplace FTS `fastify.marketplace.search` (`agent-search.ts:132`, `skill-tools.ts:446-448` `deps.searchMarketplace`). Plus the `find_connector` tool and SkillRecommender (`persona-tool-filter.ts:27-30` ALWAYS_AVAILABLE).
- **Input/output:** the same `need` yields different lists (see F-CAP-01).
- **Repro test:** `agent-search.test.ts:92,109` (three-up), `capability-router.test.ts`.
- **Expected (DIR-11):** a common interface, with the engines remaining behind it.
- **Minimal change:** a thin `resolveCapabilities(need, envelope)` facade that calls the existing functions and returns a single `CapabilityCandidate[]`.
- **Related AT:** AT-17.

### F-CAP-12 — W4 "typed CapabilityRequest event + card variants (api_key, OAuth)"
- **S1 claim:** they are missing.
- **Status:** **CONFIRMED AT REVISION.**
- **Path/symbol:** the marker is an HTML comment in the tool result text (`capability-acquisition.ts:411-413`), parsed with a regex on the client (`apps/web/src/components/os/apps/chat-blocks/capability-request-parser.ts:9,14`) and on the server (`capability-proposals.ts:10-11`, `chat-persistence.ts:26`); it is not a typed SSE event. The `CapabilityRequest` type (`CapabilityRequestCard.tsx:8-30`) has `connectorId/authType` marked "Reserved … not authorized". The card renders only starter/marketplace (`:94-99`). The behavioral spec prohibits the model from fabricating the marker (`packages/agent/src/behavioral-spec.ts:303-317`).
- **Input:** an api_key connector as a candidate.
- **Current output:** `agent-search` returns `install.mode:'store'` for the FE suggestion box, but the chat card does not render it; the user goes to the Hub.
- **Repro test:** `capability-proposals.test.ts:41,59,73`; `apps/web/src/test/pr4-agent-search.test.tsx`.
- **Expected (brief §9.3):** the card explains what/why/scope; the secret goes into a protected field; OAuth in the system browser.
- **Minimal change:** extend the existing server-issued proposal (`CapabilityProposalStore.issue`) to `kind:'connector'` with `authType`, then a card for api_key that calls the existing `POST /api/connectors/:id/connect` (`packages/server/src/local/routes/connectors.ts:118-142`).
- **Related AT:** AT-11, AT-17.

### F-CAP-13 — W4 / DIR-12: shared action registry (UI, agent, routine share the same contract)
- **S1 claim / task question:** does a typed action registry exist?
- **Status:** **PARTIAL/UNWIRED** — a closed registry exists, but only for the NL command bar; agent/UI/routine have three paths, partially shared.
- **Path/symbol:** `packages/server/src/local/command-registry.ts:108-181` `ACTION_REGISTRY` (4 actions: `open_app`, `open_workspace`, `create_workspace`, `install_mcp`; `sideEffect`, `riskLevel`, `build()`), `:192` `validateAndBuildAction`; the only caller is `packages/server/src/local/command-interpret.ts:17,93,135` → `routes/command.ts`; UI confirmation for `sideEffect` in `apps/web/src/components/os/overlays/CommandCenter.tsx:94,538`. Agent: `ToolDefinition` (`packages/agent/src/tools.ts`) + approval hook. Routine/held: `held-action-executor.ts:213-233` re-materializes the *same* `ToolDefinition` from `buildToolsForWorkspace` (agent and routine share the contract for proposable tools). UI clicks go directly to REST (`/api/connectors/:id/connect`, `/api/marketplace/install`) without the registry.
- **Input:** "install MCP X" from the command bar vs from the chat vs from the Marketplace UI.
- **Current output:** three entry paths, one shared server endpoint (`/api/mcps/install` → `/api/marketplace/install`) — validation and the SecurityGate are on the endpoint (good), but the approval semantics differ (UI click vs CommandCenter modal vs chat card).
- **Repro test / limitation:** `packages/server/tests/local/command-registry*.test.ts` (I did not open them); `held-action-executor.test.ts:140,158`.
- **Expected (DIR-12, AT-18):** the same input schema/scope/side-effect class/approval/audit/idempotency; the agent has no shortcut around confirmation.
- **Minimal change:** not a new engine; extend `ActionDescriptor` to be the source of truth for the side-effect endpoints that the UI already uses, and state in an ADR that the agent tool + held action already share `ToolDefinition`.
- **Related AT:** AT-18.

---

## 2. What already works / exists (existingAssetsToPreserve) — callers confirmed via grep

| # | What | Path | Callers / tests |
|---|---|---|---|
| 1 | `searchCapabilities`, `validateInstallCandidate`, `CapabilityCandidate`/`AcquisitionProposal` types | `packages/agent/src/capability-acquisition.ts:187,447` | `packages/agent/src/skill-tools.ts:13,454,521`; `packages/server/src/local/routes/agent-search.ts:11,143`; tests `packages/agent/tests/capability-acquisition.test.ts` (20), `capability-acquisition-trust.test.ts` (13) |
| 2 | `CapabilityRouter.resolve` (unknown-tool fallback) | `packages/agent/src/capability-router.ts:51-186` | `packages/agent/src/tool-executor.ts:143-151`; `packages/agent/tests/capability-router.test.ts` |
| 3 | `MarketplaceInstaller` + `SecurityGate` (blocked → refuse without `forceInsecure`, approval identity, provenance) | `packages/marketplace/src/installer.ts:109-118,392`; `packages/marketplace/src/security.ts` | `packages/server/src/local/routes/marketplace.ts:420-432`; `routes/mcps.ts:227-301`; `routes/capability-proposals.ts:105-116`; `packages/agent/src/skill-tools.ts:540-560`; `packages/marketplace/tests/installer-security.test.ts` (40) |
| 4 | Server-issued scoped `CapabilityProposalStore` + `POST /api/capability-proposals/:id/confirm` (claim-once, expiry, ws/session scope) | `packages/server/src/local/routes/capability-proposals.ts:35-101,232-268` | `apps/web/src/providers/InstallProvider.tsx:104` → `CapabilityRequestCard.tsx:108`; `packages/server/tests/local/capability-proposals.test.ts` (9) |
| 5 | `ConnectorRegistry` (vault-hydrated, `connector_<id>_<action>` tools, audit log) | `packages/agent/src/connector-registry.ts:24-212` | `routes/agent-search.ts:157`; `routes/connectors.ts`; `held-action-executor.ts:221-224` (send_email alias); `packages/server/tests/local/connector-registry-integration.test.ts` |
| 6 | Approval stack: `createChatApprovalHook`/`waitForApprovalDecision`, `/api/approval/*`, `ApprovalGrantStore`, `enqueueHeldAction`/`executeHeldAction`/`decideReviewTurnTool`, `needsConfirmation`/`isCriticalNeverAutopass`/`needsConfirmationWithAutonomy`/`classifyGatedToolRisk`, executor approval floor | `packages/server/src/local/routes/chat-approval-hook.ts`; `routes/approval.ts`; `approval-grants.ts`; `held-action-executor.ts`; `packages/agent/src/confirmation.ts`; `packages/agent/src/tool-executor.ts:184-226` | tests: `routes/approval-flow.test.ts` (4), `local/approval-held.test.ts` (14), `local/held-action-executor.test.ts` (18), `local/chat-approval-timeout.test.ts` (4), `local/chat-approval-hook-characterization.test.ts` (15) |
| 7 | `InstallAuditStore` (install_audit table, governance schema) | `packages/core/src/install-audit.ts:67-143` | `skill-tools.ts` (`deps.auditStore.record`); `routes/marketplace.ts:482-503`; `routes/mcps.ts:399-416`; tests `packages/core/tests/install-audit*.test.ts` |
| 8 | `assessTrust`/`deriveApprovalClass`/`formatTrustSummary` | `packages/agent/src/trust-model.ts:203,345,420` | `capability-acquisition.ts:14`; `chat-approval-hook.ts:24,378`; `confirmation.ts:9`; `packages/agent/tests/trust-model.test.ts` |
| 9 | Persona tool policy `applyPersonaToolFilter`/`filterMcpToolsForPersona` (allowlist + READ_ONLY allowlist) | `packages/server/src/local/persona-tool-filter.ts:98-153` | `routes/chat-turn-preparation.ts:454,530,553` |
| 10 | Governance `blockedTools` chain (team-only) | `routes/chat-governance.ts:73-134` → `chat-turn-preparation.ts:694-738` → `tool-executor.ts:129` → `packages/agent/src/subagent-orchestrator.ts:429-456` | fail-closed on `unavailable/invalid` (`chat-turn-preparation.ts:701-729`) |
| 11 | IM channels: `ChannelManager` (deny-by-default, `/pair`, dedup, rate limit, `proposeHeld`), `PairingStore`, `runChannelChatTurn` | `packages/server/src/local/channels/{manager,pairing,chat-client,routes}.ts` | `packages/server/tests/channels-manager.test.ts` (22), `channels-pairing.test.ts` (13) |
| 12 | Injection defense: `scanForInjection` + `evaluateExternalMemoryIngress` (normalization) | `packages/hive-mind-core/src/injection-scanner.ts:59`; `memory-ingress-guard.ts:709` | `harvest/pipeline.ts:108-142`; `connector-harvest.ts:191`; `tool-executor.ts:48`; `routes/chat.ts:786`; `chat-turn-preparation.ts:242,471,652`; `orchestrator.ts:479,924`; `held-action-executor.ts:77,199`; `mcp/mcp-runtime.ts:529`; `skill-audit.ts:265,304,350`; `hook-runtime.ts:191` (write); `packages/agent/tests/injection-scanner.test.ts` |
| 13 | Closed `ACTION_REGISTRY` + `validateAndBuildAction` (NL command bar) | `packages/server/src/local/command-registry.ts:108-192` | `command-interpret.ts:17,93,135` → `routes/command.ts:213`; `CommandCenter.tsx:538` approval for `sideEffect` |
| 14 | OAuth loopback routes (CSRF `state`, 127.0.0.1 redirect, vault write, escaping) | `packages/server/src/local/routes/oauth.ts:64-71,137-150,200-209,290-311` | `packages/server/tests/local/oauth-callback-escaping.test.ts` (2); **without PKCE and without run binding** (F-CAP-02) |
| 15 | `CapabilityRequestCard` + `segmentText` parser (strict marketplace identity contract) | `apps/web/src/components/os/apps/chat-blocks/{CapabilityRequestCard.tsx,capability-request-parser.ts}` | `chat-blocks/TextBlock.tsx`; `apps/web/src/test/pr4-agent-search.test.tsx` |
| 16 | `install_capability` tool (starter-pack only, path traversal guard, heuristics SecurityGate, audit, non-grantable) | `packages/agent/src/skill-tools.ts:484-580`; `approval-grants.ts:20-25` | `behavioral-spec.ts:291-317`; `persona-tool-filter.ts:28` |

---

## 3. Notes

1. **The S1 path `agent-search.ts:81` is wrong** (see §0) — the same claim stands, but at `packages/server/src/local/routes/agent-search.ts:79`.
2. **Connectors are not paywalled**: `getCapabilities(tier).connectorLimit === -1` on all tiers (`packages/server/tests/routes/connectors-tier.test.ts:13-29`, `packages/shared/src/tiers.ts:62,83,104,125`). The WB inventory for this group = Approvals nav (3 places) + `cost.ts:210,272`.
3. **Governance is exclusively a team-server layer** (`chat-governance.ts:87-89`); for a Solo user the "envelope" = persona filter + approval floor + grants. It should not be moved into the A12 "tier" step.
4. **Approval-over-IM is a documented decision "Not in v1"** (`docs/plans/CHANNELS-ARC-2026-07-09.md:23`), not an oversight; AT-25 is a new obligation for G3.
5. **The hook read path returns `temporary` frames** (`hook-runtime.ts:237`) — the only new concrete gap in A13 at this revision; the rest of A13(a) is already closed.
6. None of the above was executed as a test in this session (repo READ-ONLY, without `npm ci`); test counts were tallied with `grep` on `it(`.
7. I did not propose architecture; "minimal change" is the smallest intervention that closes the S1 claim and leaves the W1/W2 contracts to their authors.
