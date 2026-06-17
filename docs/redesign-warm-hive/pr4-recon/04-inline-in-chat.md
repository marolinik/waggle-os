# PR4 Recon — Slice 4: Inline-in-Chat Install (Marketplace Variation B)

> **Scope:** Screen 09 Marketplace, **Variation B** — Waggle offers a *missing connector*
> mid-conversation with a vault-aware approval ("token goes to your vault"), then shows the
> connected follow-up. Map the chat step/block rendering, the approval/confirmation infra,
> and the vault-write path; identify the exact hook points a PR4 build would touch.
>
> **READ-ONLY recon.** No source modified. Citations are `file:line` against
> `feature/warm-hive-pr4` (working tree at recon time).

---

## 1. The design contract (what Variation B must do)

From `docs/design_handoff_waggle_app/SCREENS.md:199-207`:

- **Variation B (Inline in chat):** "the same picker surfaced mid-conversation — Waggle
  offers a missing Salesforce connector with a vault-aware approval ('token goes to your
  vault'), then shows the connected follow-up."
- **CRITICAL — shared install state ("sync"):** "one store powers the grid, the agent picks,
  AND the inline card." Type-aware one-click flows with progress→done micro-states:
  - **skill** Add→Adding…→Added (instant)
  - **connector** Connect→Signing in…→Connected (~1.1s, **token→vault**)
  - **MCP** Enable→Enabling…→Enabled
  - Each fires a toast + updates the count bar. **Installing in any view reflects in all.**

PR4 BUILD-PLAN row (`docs/redesign-warm-hive/BUILD-PLAN.md:142`):
`PR4 | Marketplace + shared install store ("sync") (grid + agent-pick + inline-in-chat) | MarketplaceApp, new install store | 09`

So Variation B is **one of three consumers** of a single shared install store. This slice maps
the *chat-side* surface (how the agent raises the offer mid-turn, how the FE renders the inline
card, and how approval → connect → vault wires). The grid + store itself is the broader PR4 build.

---

## 2. End-to-end map of the chat turn (what exists today)

### 2.1 SSE event protocol (server → FE)

`POST /api/chat` (`packages/server/src/local/routes/chat.ts:351`) is the SSE endpoint. It hijacks
the reply (`chat.ts:462`) and writes events with `sendEvent(event, data)` (`chat.ts:475-477`):

```
event: <name>\ndata: <JSON>\n\n
```

Event names emitted today (the wire vocabulary the FE switches on):
`step`, `tool` / `tool_result` (auto_recall only), `token`, `gepa_choices`, `model_switch`,
`approval_required`, `done`, `error`. (Note: the agent loop itself emits `tool_start`/`tool_end`
for real tool calls — see the FE switch in §2.3 — via the agent-loop callbacks, not direct
`sendEvent` in chat.ts.)

The **approval handshake** is the load-bearing primitive for Variation B. It lives in a
per-request `pre:tool` hook registered at `chat.ts:909-1045`:

1. A tool reaches the gate; `needsConfirmationWithAutonomy(toolName, args, autonomyLevel)`
   decides if it gates (`chat.ts:916`).
2. The hook enriches the request with **risk metadata** — `install_capability` gets a
   content-based `assessTrust()` (`chat.ts:960-982`), every other gated tool gets
   `classifyGatedToolRisk()` (`chat.ts:989-999`). `description` comes from
   `describeToolUse(toolName, input)` (`chat-helpers.ts:106`).
3. It emits `sendEvent('approval_required', { requestId, toolName, input, sourceWorkspaceId,
   ...trustMeta })` (`chat.ts:1005-1009`).
4. It **blocks** on `new Promise<boolean>` registered in `server.agentState.pendingApprovals`
   keyed by `requestId` (`chat.ts:1020-1036`), with a 5-min auto-deny timeout.
5. The FE posts the decision to `POST /api/approval/:requestId`
   (`packages/server/src/local/routes/approval.ts:10`), which calls `pending.resolve(approved)`
   (`approval.ts:31`) → the hook returns `{ cancel: true }` on deny (`chat.ts:1041`) or lets the
   tool run on approve.

This approval handshake is **exactly the mechanism Variation B needs** — a server-side pause
mid-turn that surfaces an FE card and resumes on the user's click.

### 2.2 Block model (the FE message content type)

`apps/web/src/lib/types.ts:484-532` — `ContentBlock` is a discriminated union of:
`TextContentBlock` | `StepContentBlock` | `ToolUseContentBlock` | `ModelSwitchContentBlock` |
`ErrorContentBlock`. There is **no approval/install block type** — approvals are kept *out* of
the block stream (see §2.4) and rendered as a separate singleton.

`StepContentBlock` (`types.ts:497-508`) already carries an **optional `provenance: { sources }`**
field (PR3.5) — the precedent for type-specific metadata riding on a step block.

### 2.3 SSE → block reduction (`useChat`)

`apps/web/src/hooks/useChat.ts:125-273` consumes the SSE stream and reduces events into
`blocks[]` on the last assistant message. The relevant cases:

- `step` → pushes a `StepContentBlock` (`useChat.ts:152-175`), copying `data.provenance.sources`.
- `tool_start` / `tool_end` → push/patch a `ToolUseContentBlock` (`useChat.ts:177-222`).
- `approval_request` / `approval_required` → `setPendingApproval(data as ApprovalRequest)` and
  **`return msgs`** — i.e. deliberately does NOT add a block (`useChat.ts:258-263`).
- `approveAction(requestId, approved, { always })` → `adapter.respondApproval(...)` then
  `setPendingApproval(null)` (`useChat.ts:317-333`).

So today there is **one** pending approval at a time, held in component state, not in the block
stream. The hook returns `{ messages, isLoading, sendMessage, clearHistory, pendingApproval,
approveAction }` (`useChat.ts:335`).

### 2.4 Block rendering

`apps/web/src/components/os/apps/chat-blocks/BlockRenderer.tsx:53-104` walks `blocks[]`:
- consecutive `step` blocks are grouped into one collapsible **`ActivityStream`** card
  (`BlockRenderer.tsx:30-51`) — the "magic" surface.
- `tool_use` blocks route to **`ArtifactBlock`** (completed file-writes — `ArtifactBlock.tsx:21-28`
  is the routing predicate `isArtifactBlock`) or the generic `ToolUseBlock`.
- `text` / `model_switch` / `error` each have a renderer.

`ArtifactBlock.tsx` is the **closest existing precedent** for what an inline install card should be:
a tool-result that, when completed, renders as a rich actionable card (icon + name + button) instead
of a debug row. An inline-install card is the same pattern for a *connector/skill/MCP* tool result.

### 2.5 Approval rendering (the inline card that exists)

`ChatApp` renders the singleton approval **inside the message list** at the bottom:
`{pendingApproval && <ApprovalGate request={pendingApproval} onRespond={onApprove} />}`
(`ChatApp.tsx:1213-1215`).

**`ApprovalGate`** (`ChatApp.tsx:225-311`) is already an in-thread, warm-token card:
`--honey-wash` fill + attention border + `AlertTriangle` + a `RiskBadge` + `description` + a
mono `toolName › inputSummary` line + `trustSource` + Approve / Always-allow / Not-now buttons +
a "Show details" JSON toggle. It is **generic** (driven by `ApprovalRequest`), not connector-aware.

There is also a **reusable warm primitive** `InlineApprovalCard`
(`apps/web/src/components/os/warm/InlineApprovalCard.tsx`, exported from `warm/index.ts:19`) — a
cleaner card that takes an `ApprovalRequest`, `title`, `onApprove`/`onDecline`/`onAlwaysAllow`,
and an `approveLabel`. Its **default title is literally "Approve before I leave your machine"** —
already in the vault-aware register Variation B wants. NOTE: `ApprovalGate` (the one actually
wired in ChatApp) and `InlineApprovalCard` are **two parallel implementations of the same idea**;
both share the risk vocabulary via `lib/risk-display.ts`. A build should pick one.

`ApprovalRequest` shape (`apps/web/src/lib/types.ts:410-430`): `{ requestId, toolName, description,
input, rawJson?, sourceWorkspaceId?, riskLevel?, approvalClass?, trustSource?, assessmentMode?,
explanation?, permissions? }`. All of these are already on the wire from `chat.ts:1005-1009`.

---

## 3. The install / connect / vault paths (what an "approve" must trigger)

There are **three different install backends today**, none of which is currently reachable as a
single agent-loop "offer a missing connector" tool:

### 3.1 Skill install — agent-loop reachable (the only one that is)

`packages/agent/src/skill-tools.ts:480-668` — the `install_capability` tool. It copies a curated
starter-skill `.md` into the skills dir (`skill-tools.ts:631-633`), runs a `SecurityGate` scan,
records install-audit rows, hot-reloads via `onSkillsChanged()`, and returns the skill content.
**No vault.** This is the "skill: Add→Adding…→Added (instant)" lane. It already flows through the
chat approval gate (it is in `ALWAYS_CONFIRM`, `confirmation.ts:19`) and gets the **richest** trust
metadata on the approval event (`chat.ts:960-982`).

### 3.2 Connector connect — HTTP route, NOT agent-loop reachable

`POST /api/connectors/:id/connect` (`packages/server/src/local/routes/connectors.ts:96-156`):
- validates the connector exists in `connectorRegistry`,
- requires `token` or `apiKey` in the body,
- **writes the token to vault**: `fastify.vault.setConnectorCredential(id, { type, value,
  refreshToken, expiresAt, scopes })` (`connectors.ts:122-128`) — **this is the "token→vault"
  step the design names**,
- re-initializes the connector (`connector.connect(fastify.vault)`, `connectors.ts:138`),
- records an install-audit row (`connectors.ts:145-153`).

FE adapter: `adapter.connectConnector(id, credentials)` → POSTs that route
(`apps/web/src/lib/adapter.ts:1971-1979`).

**There is no agent tool that calls this.** The agent can only *discover* connectors via
`find_connector` / `list_connector_categories` (`packages/agent/src/connector-search.ts:161-265`),
which return catalog JSON (name, installCmd, url) as text — the agent literally cannot connect one.

### 3.3 Connector OAuth — separate browser-redirect flow

`packages/server/src/local/routes/oauth.ts` — `GET /api/oauth/:provider/authorize` →
provider page → `GET /api/oauth/:provider/callback` stores tokens in vault under
`${provider}_oauth_token` (keyed by **provider**, not connector id — see
`connectors.ts:16-23` `OAUTH_PROVIDER_FOR_CONNECTOR`). Only 5 providers configured
(github/slack/google/notion/jira, `oauth.ts:26-62`) and each needs app `client_id`/`client_secret`
pre-seeded in vault. This is the heavyweight path; the design's "token goes to your vault" implies
the **lightweight token-paste** path of §3.2, not OAuth.

### 3.4 Connector tools become live on the NEXT turn

Important for "the connected follow-up": connector action tools are **dynamic**.
`connectorRegistry.generateTools()` generates `connector_<id>_<action>` tools **only for connected
connectors** (`packages/server/src/local/index.ts:1005-1006` comment + `1034`). The agent loop
rebuilds `effectiveTools` per request (`chat.ts:1048-1073` → `buildToolsForWorkspace`). So once a
connector is connected mid-conversation, its tools appear on the **next** user turn (or next loop
iteration if connect happens inside the same turn before tool-pool rebuild — but the rebuild is
per-`/api/chat` call, so realistically next turn). `describeToolUse` already formats
`connector_<id>_<action>` as "<action> via <id>" (`chat-helpers.ts:192-196`).

### 3.5 MCP enable — yet another backend

MCP servers install through the MCP Hub (`MCPHubApp.tsx`, security scan + scope + approval). Not
chat-loop reachable today. Out of the *critical* path for Variation B's "Salesforce connector"
example, but the shared store must cover the "MCP Enable→Enabling…→Enabled" lane.

---

## 4. The DELTA — what's missing vs the Screen-09 contract

| # | Contract requirement | Current state | Gap |
|---|---|---|---|
| D1 | Agent can **offer a missing connector mid-conversation** | Agent can only `find_connector` (returns catalog text); no tool connects one | **No `connect_capability`/`offer_connector` tool** that raises an approval whose approve-side writes a token to vault. Needs a new agent tool OR a server-side "offer" step. |
| D2 | Inline card is **vault-aware** ("token goes to your vault") | `ApprovalGate`/`InlineApprovalCard` are generic; show `toolName › input` + risk | No connector-typed variant: no token-input field, no "encrypted in your local vault" copy, no Connect→Signing in…→Connected micro-states. |
| D3 | **Token→vault** on approve (~1.1s) | `POST /api/connectors/:id/connect` writes vault, but is reached only from MarketplaceApp/ConnectorsApp FE | The chat approve path resolves a `boolean` promise (`approval.ts:31`); it has **no channel to carry a token** nor to invoke `connectConnector`. The approval contract is boolean-only. |
| D4 | **Connected follow-up** shown in thread | Connector tools regenerate per request; agent can use them next turn | No explicit "connected" confirmation block; the follow-up is implicit. Needs a success block/toast + (optionally) auto-continue of the original ask. |
| D5 | **Shared install store ("sync")** — one store, all 3 views reflect | `MarketplaceApp` uses **local `useState`** (`installing`/`extensions`, `MarketplaceApp.tsx:108`, `:231`); `ConnectorsApp`/`MCPHubApp` each own their own state | **No shared store.** Installing in chat would not reflect in the grid or count bar. This is the central PR4 artifact ("new install store"). |
| D6 | Type-aware **micro-states** + toast + count-bar update | Skill install returns text; connector connect returns `{connected:true}`; toasts exist per-app (`useToast`) | No unified progress→done state machine keyed by kind; no count bar; no cross-view toast. |
| D7 | Approval can carry **kind** (skill/connector/MCP) | `approval_required` carries `toolName` + trust meta, but kind is inferred from toolName | A connector offer needs an explicit `kind: 'connector'` + connector `id`/`name`/`why` so the card renders type-aware. |

---

## 5. Exact integration points a PR4 build would touch

### Server (agent loop + routes)
- **New agent tool** (e.g. `offer_connector` / `connect_capability`) in a new file under
  `packages/agent/src/` (sibling to `connector-search.ts`), registered into `baseTools`
  (`packages/server/src/local/index.ts:759`). It should be **gated** (add to `ALWAYS_CONFIRM`,
  `packages/agent/src/confirmation.ts:16-26`, or rely on `connector_` prefix patterns) so it
  hits the chat approval hook.
- **`chat.ts:909-1045` pre:tool hook** — extend the trust-metadata branch (currently special-cases
  `install_capability` at `chat.ts:960`) to emit a **connector-typed** `approval_required` payload
  (`kind: 'connector'`, connector `id`/`name`, "why", and a flag that a token field is needed).
- **`describeToolUse`** (`chat-helpers.ts:106-201`) — add a case for the new tool so the card's
  description line is specific ("Connect Salesforce — token stored in your local vault").
- **Approval contract widening** — `POST /api/approval/:requestId` (`approval.ts:10`) +
  `pendingApprovals` resolve currently carry only `boolean`. To pass a pasted **token** from the
  inline card to the connect step, EITHER:
  (a) the card calls `adapter.connectConnector(id, { token })` directly (writing vault via
      `connectors.ts:96`) and *then* approves the tool with a boolean (token never transits the
      approval channel — cleanest, reuses existing vault route), OR
  (b) widen the approval body to carry the token and have the new tool's `execute` call
      `setConnectorCredential`. Option (a) is the lower-risk path and keeps the vault write on the
      audited `/connect` route.
- **Vault write** stays `fastify.vault.setConnectorCredential(id, …)` (`connectors.ts:122`) — do
  not build a parallel secret store (CLAUDE.md §7.1).

### FE (chat + store)
- **`useChat.ts`** — the `approval_required` case (`useChat.ts:258-263`) sets a singleton
  `pendingApproval`. For Variation B the connector offer can stay on this channel (it IS an
  approval), but the payload must carry `kind`/connector fields so the renderer can branch.
  Alternatively introduce an **install/offer block type** in `ContentBlock` (`types.ts:484`) +
  `BlockRenderer` (`BlockRenderer.tsx`) so the offer lives *in* the thread like `ArtifactBlock`,
  surviving history reload — recommended for the "connected follow-up" persistence.
- **New `ConnectorOfferCard`** (or extend `InlineApprovalCard`, `warm/InlineApprovalCard.tsx`) —
  type-aware card with a token field, "encrypted in your local vault" copy, and
  Connect→Signing in…→Connected micro-states. Render it from `ChatApp` where `ApprovalGate` renders
  today (`ChatApp.tsx:1213-1215`), branching on `pendingApproval.kind`.
- **Shared install store** (the PR4 centerpiece, `BUILD-PLAN.md:142` "new install store") — a
  React context/zustand store keyed by capability id with `{ kind, state: idle|installing|done }`,
  consumed by `MarketplaceApp` (replacing its local `useState` at `MarketplaceApp.tsx:108/231`),
  `ConnectorsApp`, `MCPHubApp`, AND the chat offer card. The card's approve handler calls
  `adapter.connectConnector` and updates the store → grid + count bar reflect instantly.
- **Adapter** — reuse `adapter.connectConnector(id, { token })` (`adapter.ts:1971`),
  `adapter.respondApproval(requestId, true)` (`adapter.ts:1757`), `adapter.installMarketplacePackage`
  (skills/packages), and the connector list `adapter.getConnectors()` (for the count bar).

### Recommended seam (lowest-risk wiring)
1. New gated agent tool `offer_connector(id, why)` → emits connector-typed `approval_required`
   (no token in the tool args; the token is collected by the FE card).
2. FE renders `ConnectorOfferCard`; on Connect it (a) `adapter.connectConnector(id, { token })`
   → vault write on the audited route, (b) updates the shared install store (grid/count-bar sync),
   (c) `adapter.respondApproval(requestId, true)` to release the agent.
3. The tool's `execute` returns "Connected — Salesforce tools now available"; the agent uses
   `connector_<id>_<action>` tools on the **next** turn (already live after `generateTools()`).
4. A success block/toast renders the "connected follow-up".

---

## 6. Risks / sharp edges

- **Boolean-only approval channel.** The existing approval handshake resolves a `boolean`
  (`approval.ts:31`). Threading a secret token through it would put a credential on the approval
  wire — prefer the FE-calls-`/connect`-directly seam (Option 5a) so the token stays on the
  dedicated vault route.
- **Two parallel inline-approval components** (`ApprovalGate` in `ChatApp.tsx:225` vs warm
  `InlineApprovalCard`). Only `ApprovalGate` is wired. Building a third card risks a 3-way drift;
  consolidate onto the warm primitive.
- **Approval is a singleton, out-of-band of blocks** (`useChat.ts:262` returns without pushing a
  block). It does **not** survive history reload and there is only one at a time. If the offer must
  persist in the transcript / show a permanent "connected" follow-up, it needs to become a real
  `ContentBlock` (new type), which touches the block union, `useChat`, `BlockRenderer`, and history
  serialization.
- **Connector tools are next-turn, not same-turn.** The "connected follow-up that actually uses the
  connector" won't have the `connector_<id>_*` tool in-loop on the same turn the connect happened
  (tool pool is built once per `/api/chat`, `chat.ts:1048`). A same-turn auto-continue would need an
  explicit re-dispatch.
- **No shared store today** means a chat-side install silently diverges from the grid/count bar —
  the single most load-bearing PR4 requirement ("installing in any view reflects in all"). The store
  must land before any of the three surfaces is "done".
- **MCP + skill lanes differ from connector.** Skill install is agent-reachable + vault-free;
  connector connect is vault-bound + HTTP-only; MCP is Hub-only. A unified "type-aware one-click"
  card must dispatch to three different backends behind one store interface.
- **OAuth vs token-paste.** Some connectors (the Google family, jira, slack, github) are OAuth, not
  token-paste (`oauth.ts:26-62`). The vault-aware token field only fits `bearer`/`apiKey` connectors;
  OAuth connectors need the redirect flow, which cannot complete inside an inline card without a
  popup/redirect. The card must branch on `connector.authType`.

---

## 7. Open questions for the founder/lead

1. **Approval channel for tokens** — keep the approval handshake boolean and have the FE call
   `/connect` directly (audited vault route), or widen the approval body to carry the token?
   (Recommend the former.)
2. **Offer as block vs singleton** — should the inline connector offer (and its "connected"
   follow-up) be a persistent `ContentBlock` in the transcript, or stay the ephemeral singleton
   approval? (Persistence implies a new block type + history serialization.)
3. **One inline card or two** — consolidate `ApprovalGate` and `InlineApprovalCard` into the
   warm primitive before adding a connector variant?
4. **OAuth connectors** — for OAuth-only connectors (Google/Slack/etc.), does Variation B fall
   back to "open the Connector Hub" or attempt an in-chat popup redirect? Token-paste only covers
   `bearer`/`apiKey` connectors.
5. **Same-turn vs next-turn follow-up** — is "shows the connected follow-up" satisfied by a
   success toast + the tool being available next turn, or must the agent auto-continue and use the
   connector in the same turn (requires re-dispatch)?
6. **Shared store shape** — new dedicated store, or extend an existing provider? It must be the
   single source the grid count bar, the agent-pick suggestion box, and this card all read/write.
7. **What raises the offer** — a new gated agent tool the model calls when it hits a capability
   gap, or a server-side heuristic (e.g. tool-not-found → CapabilityRouter, `chat.ts:1080`) that
   injects the offer? The `CapabilityRouter` already exists for tool-not-found handling and could
   be the trigger.

---

## 8. Key files (quick index)

| Path | Role |
|---|---|
| `docs/design_handoff_waggle_app/SCREENS.md:189-207` | Screen-09 contract (Variation A/B + sync) |
| `packages/server/src/local/routes/chat.ts:909-1045` | pre:tool approval hook — emits `approval_required`, blocks on `pendingApprovals` |
| `packages/server/src/local/routes/chat.ts:475-477,1005-1009` | `sendEvent` + the approval payload shape |
| `packages/server/src/local/routes/approval.ts:10-35` | `POST /api/approval/:requestId` → resolves the boolean promise |
| `packages/server/src/local/routes/connectors.ts:96-156` | `POST /connect` — **token→vault** (`setConnectorCredential`) |
| `packages/server/src/local/routes/oauth.ts` | OAuth redirect flow (heavyweight, 5 providers) |
| `packages/agent/src/connector-search.ts:161-265` | `find_connector` / `list_connector_categories` (discovery only — no connect) |
| `packages/agent/src/skill-tools.ts:480-668` | `install_capability` — the only agent-loop install (skills, vault-free) |
| `packages/agent/src/confirmation.ts:16-26` | `ALWAYS_CONFIRM` gate set + `needsConfirmation` |
| `packages/server/src/local/index.ts:759,1005-1034` | tool-pool assembly; connector tools generated for **connected** connectors only |
| `packages/server/src/local/routes/chat-helpers.ts:106-201` | `describeToolUse` (approval description line) |
| `apps/web/src/hooks/useChat.ts:258-333` | FE: `approval_required` → singleton `pendingApproval`; `approveAction` |
| `apps/web/src/components/os/apps/ChatApp.tsx:225-311,1213-1215` | `ApprovalGate` inline card + its render slot |
| `apps/web/src/components/os/warm/InlineApprovalCard.tsx` | reusable warm inline-approval primitive ("Approve before I leave your machine") |
| `apps/web/src/components/os/apps/chat-blocks/ArtifactBlock.tsx` | precedent: tool-result → rich actionable in-thread card |
| `apps/web/src/components/os/apps/chat-blocks/BlockRenderer.tsx` | block dispatch (where a new offer block would route) |
| `apps/web/src/lib/types.ts:410-430,484-532` | `ApprovalRequest` + `ContentBlock` union |
| `apps/web/src/lib/adapter.ts:1757,1971` | `respondApproval`, `connectConnector` |
| `apps/web/src/components/os/apps/MarketplaceApp.tsx:108,221-231` | grid install — **local `useState`** (no shared store) |
