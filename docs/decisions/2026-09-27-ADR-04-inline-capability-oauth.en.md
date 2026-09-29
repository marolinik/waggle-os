# ADR-04 — Inline capability setup and OAuth as work continuity; supersedes the held-action ADR ("never mid-run suspend/resume") and D3 ("OAuth can't finish inline")

> **English translation** of [2026-09-27-ADR-04-inline-capability-oauth.md](2026-09-27-ADR-04-inline-capability-oauth.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Document revision:** 1.2 DRAFT · 27.09.2026 · reviewed code revision `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`
**Date:** 2026-09-27
**Status:** DRAFT — contract proposal; depends on ADR-02 (BLOCKED_* is a run state)
**Author:** planner (Fable 5.1)
**Ratified by:** founder — pending (in particular: BYO OAuth client vs Waggle-owned verified client, R12 = **DQ-06** alias — OAuth path of the first mail/calendar scenario, brief §20.3; ADR-INDEX §3)
**Supersedes / refines:** inline ADR in `packages/server/src/local/held-action-executor.ts:6-10` and `packages/core/src/cron-store.ts:83-87` ("Self-contained descriptor + execute-on-approve, never mid-run suspend/resume (a headless tick must finish; the only 'suspend' primitive in the codebase is request-bound and restart-fatal)"); D3 from the PR4 recon (`docs/redesign-warm-hive/pr4-recon/04-inline-in-chat.md:205`, enforced in `packages/server/src/local/routes/agent-search.ts:79` `// OAuth can't finish inline (D3)`); FRD v1.1 §6 "Blocked run stores requested capability and resumes after successful setup" without a definition of "inline"; S1 A12 precedence with the `tier` layer
**Binds:** W4 (resolver facade, CapabilityRequest, cards, BLOCKED_CAPABILITY resume, PKCE), W1 (run before blocking), W7 (mail/calendar OAuth), WB (Approvals de-gating), FRD v1.2 §"Capability"
**Cross-references:** ADR-02, ADR-07 (routines without silent acquisition), ADR-08 (envelope without tier, KVARK layer), ADR-10; brief §9 (DIR-11, DIR-12); AT-11, AT-12, AT-17, AT-18, AT-19, AT-25

---

## §1 — Context

**ADR-04-K1 (CONFIRMED AT REVISION — S1 path correction).** S1 cites `agent-search.ts:81`; the file `apps/web/src/lib/agent-search.ts` has 59 lines and does not contain the comment. The comment is in `packages/server/src/local/routes/agent-search.ts:79`: OAuth connector → `{ mode: 'open-in', appId: 'connectors' } // OAuth can't finish inline (D3)`; api_key/bearer → `{ mode: 'store', extensionId: 'connector:<id>', kind: 'federated' }` (`:76-80`). "D3" is a label from the PR4 recon table ("approval contract is boolean-only"), not a formal ADR. The test `packages/server/tests/routes/agent-search.test.ts:44` ("routes an OAuth connector to the Hub (open-in), never an inline token") locks in the current behavior. [capability.md §0, F-CAP-02]

**ADR-04-K2 (CONFIRMED AT REVISION).** The held-action ADR (`held-action-executor.ts:6-10`) and `cron-store.ts:83-87` say verbatim: "never mid-run suspend/resume". Mechanism: self-contained `{tool,args}` row, atomic claim, TTL 7 d, execute-on-approve re-materializes **only that tool** from `buildToolsForWorkspace` (`:213-233`) — without continuing the conversation/run. Live approval timeout (300 s) → `[BLOCKED] Approval for X moved to Approvals inbox` and the turn is aborted (`chat-approval-hook.ts:36,95-105,283-301`; test `chat-approval-hook-characterization.test.ts:714`). `BLOCKED_CAPABILITY|BLOCKED_APPROVAL` grep = 0. [F-CAP-02, F-CAP-08, F-DUR-05]

**ADR-04-K3 (CONFIRMED AT REVISION).** OAuth: `routes/oauth.ts:64-65,138-139` `pendingStates: Map<state,{provider,createdAt}>` in memory, `state=randomBytes(24)`, **without** run/session/workspace binding; `:200-209` validates only the state; `:290-311` writes the token into the vault and returns HTML "You can close this tab". **No PKCE** (grep `pkce|code_challenge|code_verifier` in `packages/server/src` = 0). No internal event after the callback. [F-CAP-02]

**ADR-04-K4 (CONFIRMED AT REVISION).** `CapabilityProposalStore` (`routes/capability-proposals.ts:12-13,35`) is an in-memory Map, TTL 10 min, max 256, scope `workspaceId+sessionId`, claim-once (`:232-268`; tests `capability-proposals.test.ts` ×9) — a good pattern, but it does not survive a restart and has no notion of a run. The capability request marker is an HTML comment in the tool result text (`capability-acquisition.ts:411-413`) parsed by regex (`capability-request-parser.ts:9,14`; `capability-proposals.ts:10-11`) — not a typed SSE event; `CapabilityRequestCard.tsx:94-99` renders only `starter-pack`/`marketplace`, connector/mcp → `return null`. [F-CAP-12]

**ADR-04-K5 (CONFIRMED AT REVISION).** Four engines without a facade: `searchCapabilities` (`capability-acquisition.ts:187`; sort by `matchScore`, lane only through `NATIVE_TOOL_HINTS`), `CapabilityRouter.resolve` (`capability-router.ts:62-170`; fixed per-lane confidence native 1.0 → connector 0.75 → skill 0.7 → plugin 0.6 → mcp 0.45 → subagent 0.4; called only as the unknown-tool fallback `tool-executor.ts:143-151`), `scoreConnectors` (`routes/agent-search.ts:56`), marketplace FTS. None of them filters by permissions/egress/readonly/trust **before** ranking; `capability-acquisition-trust.test.ts:126` locks in "trust assessment does not change candidate scoring/ranking". [F-CAP-01, F-CAP-11]

**ADR-04-K6 (PARTIAL/UNWIRED).** Envelope layers exist separately, without a single contract: persona allowlist/read-only (`persona-tool-filter.ts:98-153`, called from `chat-turn-preparation.ts:454,530,553`); governance `blockedTools` **only with `wsConfig.teamId`** (`chat-turn-preparation.ts:694-738`; `chat-governance.ts:87-89` → Solo has no governance layer); executor approval floor (`tool-executor.ts:129,160-226`); user policy = `ApprovalGrantStore` (`approval-grants.ts:172-304`; non-grantable `bash/run_code/cli_execute/install_capability` `:20-25`) + autonomy level (`confirmation.ts:337-358`). The resolver consults none of them. Tier: `requireTier` gates routes, not tools; the action-level `requiredTier` (`command-registry.ts:91,227-236`) has 0 descriptors → dead. [F-CAP-04, F-TK-17]

**ADR-04-K7 (CONFIRMED AT REVISION / ALREADY CLOSED).** The installation path is already bounded: chat installs only a `starter-pack` skill (`skill-tools.ts:521`, `capability-acquisition.ts:453-456`) and a marketplace package through a server-issued proposal, both behind `install_capability` ALWAYS_CONFIRM (`confirmation.ts:21`) + SecurityGate; MCP install goes through `/api/marketplace/install` with `forceInsecure` from the client body, with audit (`marketplace.ts:228,482-503`). There is no silent binary install. `THREAT_MODEL.md` exists at the repo root (AUDIT FINDING — TO VERIFY, own read-only check outside phase-A, see ADR-10 "Anchor provenance": 175 lines, `c520bfb0` 2026-08-24; Controls + Known Gaps) — whether it covers the inline MCP/binary install boundary = TO VERIFY (addendum, P3/ADR-10-P6). Missing: a test "no secrets in prompt/trace" (UNKNOWN whether it exists; `installer-security.test.ts:825` covers provenance, not the prompt). [F-CAP-06]

**ADR-04-K8 (CONFIRMED AT REVISION).** Approvals gate: `dock-tiers.ts:82` `minBillingTier:'TEAMS'`, `AppShell.tsx:727-728`, `command-catalog.ts:89` — navigation only; the `/approvals` route and `routes/approval.ts` are not gated (`ApprovalsRoute.tsx:1-6` states this explicitly). Decline is one-shot: `resolve(false)` is at `chat-approval-hook.ts:81` (abort) and `:123` (timeout); the user deny path `:496-506` only does `sendEvent('step', …denied by user)` + audit `approval_denied` + `return { cancel: true, reason: 'User denied …' }`, nothing persistent — the next identical call asks for approval again (**anchor correction from F-CAP-09:** the cited `:469-474` is not the deny — at HEAD those are the `sendEvent`/`signal` arguments and the start of the `onHeld` timeout→held callback, which is `:471-486`; aligned with PRD-08-11); expiry/revoke exist (`approval-grants.ts:111,233-246,286-292`). Approve/deny via IM is intentionally "Not in v1" (`channels/manager.ts:30-31`; `docs/plans/CHANNELS-ARC-2026-07-09.md:23`). [F-CAP-07, F-CAP-09, F-CAP-10, F-TK-02]

**ADR-04-K9 (DECISION — D-09, D-10, D-17 · PROPOSAL — BRIEF DIRECTION — DIR-11, DIR-12, brief §9.1).** DECISION: skills and connectors are used inline, and "inline" does not mean that OAuth or secrets are handled in LLM text (D-10); technical agents and MCP plumbing stay below the surface (D-09); existing Waggle first, then OSS, then new code (D-17). PROPOSAL — BRIEF DIRECTION (planner direction, not the user's approval): one resolver contract, not necessarily one big rewrite (DIR-11, brief §9.1); the same functionality through the UI, the agent and a routine (DIR-12).

## §2 — Decision (contract proposal)

**ADR-04-O1 (PROPOSAL) — definition of "inline" (brief §9.3).** A card in the flow of work explains what is missing, why, the required scope and the consequence. The secret is entered into a protected field of the card (api_key/bearer) or OAuth is opened in the **system browser** (loopback redirect, as today). The run is durable (`BLOCKED_CAPABILITY`, ADR-02 O3). After a valid callback the server emits `SetupCompleted {requestId, runId, capabilityId}`; the model **does not see the token**; the same run resumes **only** with a valid grant and a re-check of the envelope (ADR-02 O2 step 6). Closed window, callback for a different request, expired consent → no resumption.

**ADR-04-O2 (PROPOSAL) — durable `CapabilityRequest`.** Fields: `requestId`, `runId`, `workspaceId`, `sessionId`, `capability {kind: connector|skill|mcp|starter, id, authType}`, `scope[]`, `reason`, `status: proposed|awaiting_user|granted|declined|expired`, `expiresAt`. Persisted in the run store (ADR-02), not in memory; the `CapabilityProposalStore` semantics (claim-once, scope, expiry) are **carried over**, the storage changes. A typed `RunEvent {type:'capability_request'}` replaces the HTML-comment marker during the transition period (the marker remains for backward-compat parsing until W5 switches to the event).

**ADR-04-O3 (PROPOSAL) — OAuth binding.** `pendingStates` gets `{requestId, runId, workspaceId, sessionId, codeVerifier?}` and persistence (survives a restart within the TTL limits); the callback checks `state` ↔ `requestId` ↔ run; PKCE where the provider supports it; the callback origin/redirect allowlist remains loopback `127.0.0.1`; after success: token → vault (existing), `SetupCompleted` event, the card switches to "Connected — resuming". The token never enters a `RunEvent`, the prompt or the trace (ADR-10 test "no secrets in prompts/traces").

**ADR-04-O4 (PROPOSAL) — initial scope (R11, R12).** G2 minimal capability path = starter skills + **api_key/bearer connectors** inline (existing `POST /api/connectors/:id/connect`, `connectors.ts:118-142`, behind the card). The OAuth inline block-and-resume mechanism is proven on a provider without a verification hurdle; **Gmail/Outlook through a Waggle-owned client depends on founder decision R12 (= DQ-06, OAuth path of the first mail/calendar scenario)** (BYO-client pilot or verified client; Google restricted scopes → OAuth verification + CASA, external.md §5). MCP binary and remote-marketplace installations: resolve/propose inline, install in Settings with SecurityGate; returning to work does not lose the intent (the request stays `awaiting_user`).

**ADR-04-O5 (PROPOSAL) — permission envelope as an intersection, without tier (A12 AMEND TIER PART).** `PermissionEnvelope` = intersection of: (1) system security/egress limits (ALWAYS_CONFIRM, non-grantable, critical-never-autopass), (2) KVARK policy/ACL **when the connection is live** (ADR-08), (3) user grants/declines (`ApprovalGrantStore` + negative grant), (4) Workspace and persona/role/read-only restrictions (`applyPersonaToolFilter`), (5) capabilities of the specific tool. It is computed once in `chat-turn-preparation` and passed to both the resolver and the executor (single source of truth). **Tier is not a layer** (D-01; the F-TK-17 dead `requiredTier` is removed). The resolver never widens permissions; "mount silently" applies only to already active capabilities within the envelope.

**ADR-04-O6 (PROPOSAL) — resolver facade (DIR-11, C13 REFINE).** `resolveCapabilities(need, envelope): CapabilityCandidate[]` — a thin layer over the existing four engines: (1) `filterCandidates(envelope)` (permissions, egress, readonly, availability, trust) **before** ranking; (2) rank by task fit, reliability, setup and runtime cost; (3) the lane order native → skill → connector → plugin → mcp → subagent is a **tie-breaker** among valid candidates, not a priority. The engines are not physically merged.

**ADR-04-O7 (PROPOSAL) — approvals are core for the individual (A15).** Remove `minBillingTier:'TEAMS'` in 3 places (`dock-tiers.ts:82`, `AppShell.tsx:727-728`, `command-catalog.ts:89`); `BLOCKED_APPROVAL` as a durable run state (ADR-02); decline gets an optional negative grant in `ApprovalGrantStore` (same `keyForTool`), checked before `pendingApprovals`; expiry/decline/revoke survive a restart and **cannot** be overridden by the model, a hook or an IM message (AT-12). Approve/deny from an IM channel = G3/W8 with a one-time token per `actionId`, payload fingerprint, expiry (AT-25); free text is not a grant.

**ADR-04-O8 (PROPOSAL) — shared actions (DIR-12, AT-18).** For Waggle's own side-effect actions, the same typed action contract (input schema, scope, side-effect class, validation, approval, result, audit, idempotency): extend the existing `ACTION_REGISTRY` (`command-registry.ts:108-192`, today only the NL command bar) to be the source of truth for the endpoints the UI already uses (`/api/connectors/:id/connect`, `/api/marketplace/install`); the agent tool and the held action already share `ToolDefinition` (`held-action-executor.ts:213-233`) — this is kept. The agent does not confirm its own approval. UI/browser automation of external applications remains a separate capability.

## §3 — What it supersedes and why

| Previous | Where | Why |
|---|---|---|
| "never mid-run suspend/resume; the only suspend primitive is request-bound and restart-fatal" | `held-action-executor.ts:6-10`; `cron-store.ts:83-87` | Was correct while the run was not durable; with `DurableRun` (ADR-02) a suspend primitive exists as a `BLOCKED_*` state, not as a Promise. The held-action queue is **kept** as the ToolAction pattern; "never" narrows to "never in the middle of a model turn/agent loop" (ADR-02 O4) |
| D3: OAuth → `open-in` Hub, never inline; the turn ends | `routes/agent-search.ts:76-80`; PR4 recon 04-inline-in-chat.md:205; test `agent-search.test.ts:44` | It remains true that OAuth **does not complete in chat text**; what changes is that the run stays blocked and resumes after the callback. The test is rewritten: `open-in` → `awaiting_user` card + browser, not the end of the work |
| In-memory `pendingStates` without run binding, without PKCE | `oauth.ts:64-65,138-139,200-209` | A callback for a different run must not start work (AT-11); PKCE where applicable (brief §9.3) |
| S1 A12 precedence `governance > tier > persona > user policy > resolver` | S1 A12 | Tier is not an individual boundary (D-01, brief §9.2); governance only with a live team/KVARK layer |
| Lane order as a strict priority (`CapabilityRouter` confidence) and a pure score (`searchCapabilities`) | `capability-router.ts:62-170`; `capability-acquisition.ts:299-311` | Two different behaviors, neither of them "permissions first" (C13) |
| Approvals behind TEAMS navigation | `dock-tiers.ts:82` etc. | D-01 (A15 ACCEPT) |

**ADR-04-Z1 (DECISION — not reopened).** D-10 (inline) and D-01 (no paywall for approvals) are implemented, not decided.

## §4 — Consequences

**ADR-04-P1 (PROPOSAL).** Tests to be rewritten: `agent-search.test.ts:44`; `capability-proposals.test.ts` (storage change, same semantics); `p7-a6-approval-gating.test.tsx` (not read — TO VERIFY); `chat-approval-hook-characterization.test.ts:714` stays (timeout → held) until the run becomes durable.

**ADR-04-P2 (PROPOSAL).** Persona prompt-budget tests (`persona-acceptance-prompt-budget.test.ts`) may react to the new card/instruction in the prompt — receipt persona surface (A1).

**ADR-04-P3 (PROPOSAL).** Addendum to the existing `THREAT_MODEL.md` for inline installations (A14; the document exists at `2af0904d`, addendum = ADR-10 P6) + a test that `buildSystemPrompt`/trace do not contain vault values of a connected connector — part of the ADR-10 profile.

**ADR-04-P4 (PROPOSAL).** `hasCapability` (`tiers.ts:233-244`, 0 callers), `requiredTier`/`checkTier` (`command-registry.ts:91,227-236`), the unused `requireTier` import (`fleet.ts:8`) — are removed or stay outside the envelope contract (ADR-08 inventory).

**ADR-04-P5 (PROPOSAL).** The hook read path (`hook-runtime.ts:237` returns `temporary`) and taint labels are ADR-05; here only the link: the envelope does not depend on the scanner (A13 "the scanner alone is not a guarantee"), protection of policy/vault/send stays at the approval floor (`tool-executor.ts:184-226`, `ALWAYS_CONFIRM`).

## §5 — Risk

| ID | Risk | L/I | Mitigation |
|---|---|---|---|
| ADR-04-R1 | A callback for someone else's/an expired request resumes the run | low / critical | O3 state↔request↔run binding, expiry; AT-11 |
| ADR-04-R2 | Google CASA/verification blocks Gmail OAuth for weeks (external) | high / medium | O4: proof of the mechanism on api_key + a provider without verification; R12 founder decision |
| ADR-04-R3 | Envelope intersection too restrictive → the resolver returns nothing | medium / low | a candidate with `blockedBy: [reason]` is shown as an explanation, not hidden |
| ADR-04-R4 | The chat hot path (`chat-turn-preparation`) gets yet another layer | medium / medium | the envelope is computed once per turn; latency measurement (ADR-01 O7) |
| ADR-04-R5 | A negative grant ("never allow") locks the user out of a tool | low / low | a revoke route exists (`approval.ts:119-133`); UI list of grants |
| ADR-04-R6 | `forceInsecure` from the client body without server-side confirmation | low / high | the server requires an explicit approval identity for the override (the existing audit remains) — part of the threat model |

## §6 — Migration test

| ID | Test | Expectation | AT |
|---|---|---|---|
| ADR-04-T1 | A run requires an api_key connector → `BLOCKED_CAPABILITY` persisted; the user enters the key in the card → `SetupCompleted` → the **same** `runId` resumes with the phase | RED today (the turn ends, no state) | AT-11 |
| ADR-04-T2 | OAuth callback with the `state` of a different `requestId` → 4xx, no run resumes; expired request → the same | RED today (state validated, the run does not exist) | AT-11 |
| ADR-04-T3 | Sidecar restart during `awaiting_user` → the request and the run survive; the callback after the restart works | RED today (in-memory) | AT-11/AT-12 |
| ADR-04-T4 | A decline with a negative grant survives a restart; a model/hook/IM message "approve" does not change the decision | RED today (one-shot deny) | AT-12 |
| ADR-04-T5 | Read-only persona: the resolver does not return a write candidate; `acquire_capability` does not propose a write skill | RED today (the resolver does not know the envelope) | AT-17 |
| ADR-04-T6 | An existing installed skill is found and used without going to the catalog; a binary MCP capability is not installed without the Settings/SecurityGate flow | partially green (K7) | AT-17 |
| ADR-04-T7 | The same side-effect action from the UI, the agent and a routine goes through the same validation/approval contract; the agent has no shortcut | RED today (three paths, different approval) | AT-18 |
| ADR-04-T8 | An injection in a harvested email without a scanner keyword does not change policy, does not exfiltrate the vault, does not authorize sending (approval floor test) | new | AT-19 |
| ADR-04-T9 | Prompt/trace does not contain the vault value of a connected connector | UNKNOWN whether it exists → new | AT-16 |
| ADR-04-T10 | Approvals nav visible for FREE; route and API unchanged | RED (nav) | AT-12 |

## §7 — Sources

- **D:** D-01, D-09, D-10, D-17 · **DIR:** DIR-11, DIR-12 (brief §9.1–9.4) · **C/A/R:** C13, C14 (NEW ADR), C16; A12 (AMEND TIER PART), A13, A14, A15; R11, R12, R13 · **AT:** AT-11, AT-12, AT-16, AT-17, AT-18, AT-19, AT-25
- **Phase A:** `docs/plans/v1.2-evidence/phaseA/capability.md` §0, F-CAP-01..13; `docs/plans/v1.2-evidence/phaseA/tiers-kvark.md` F-TK-02, F-TK-17; `docs/plans/v1.2-evidence/phaseA/durable.md` F-DUR-05; `docs/plans/v1.2-evidence/phaseA/external.md` §5 (Gmail restricted scopes/CASA)
- **S1:** C13, C14, A12–A15, W4 · **Code (at `2af0904d`):** `packages/server/src/local/routes/agent-search.ts:56,76-80,158`; `held-action-executor.ts:6-10,154-166,213-235`; `packages/core/src/cron-store.ts:83-88`; `routes/oauth.ts:64-65,138-139,200-209,290-311`; `routes/capability-proposals.ts:12-13,35,232-268`; `packages/agent/src/capability-acquisition.ts:187,299-311,411-413,453-456`; `capability-router.ts:62-170`; `tool-executor.ts:129,143-151,160-226`; `packages/server/src/local/persona-tool-filter.ts:98-153`; `routes/chat-turn-preparation.ts:454,530,553,694-738`; `routes/chat-governance.ts:87-89`; `approval-grants.ts:20-25,111,172-304`; `routes/chat-approval-hook.ts:36,81,95-105,123,283-301,471-486 (onHeld),496-506`; `command-registry.ts:91,108-192,227-236`; `apps/web/src/lib/dock-tiers.ts:82`; `apps/web/src/components/os/AppShell.tsx:727-728`; `apps/web/src/lib/command-catalog.ts:89`; `apps/web/src/components/os/apps/chat-blocks/CapabilityRequestCard.tsx:94-99`; `docs/redesign-warm-hive/pr4-recon/04-inline-in-chat.md:205`; `docs/plans/CHANNELS-ARC-2026-07-09.md:23`
