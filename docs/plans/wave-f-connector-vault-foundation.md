# Wave F — Connector + Vault Foundation

**Date**: 2026-03-16
**Status**: Foundation implemented, design documented

---

## What Was Implemented (Limited, High-Signal)

### 1. ConnectorCapability Types
- `ConnectorCredential` — typed credential model (api_key, oauth2, bearer, basic)
- `ConnectorStatus` — connected | disconnected | expired | error
- `ConnectorDefinition` — what the user sees (name, service, auth, capabilities, substrate, tools)
- `ConnectorHealth` — cockpit display model (status, lastChecked, expiry, error)
- Added `'connector'` to `CapabilitySource` and `CapabilitySourceType` in capability router/acquisition

### 2. Vault Extension
- `setConnectorCredential(connectorId, credential)` — stores with typed metadata (type, refreshToken, expiresAt, scopes)
- `getConnectorCredential(connectorId)` — returns typed credential with `isExpired` computed field
- Uses `connector:{id}` key prefix in vault to distinguish from provider keys

### 3. Connector REST API (4 endpoints)
- `GET /api/connectors` — list all connectors with vault-derived status
- `GET /api/connectors/:id/health` — live health check (GitHub: calls /user API)
- `POST /api/connectors/:id/connect` — store credential in vault
- `POST /api/connectors/:id/disconnect` — remove credential from vault

### 4. Proof Connector: GitHub
- Bearer auth (personal access token paste)
- Health check: calls `https://api.github.com/user` with 5s timeout
- Status correctly transitions: disconnected → connected → error (bad token) → disconnected
- Declares tools: github_repos, github_issues (shapes only — not implemented)

### 5. Tests
- 6 tests: route export, vault CRUD, expiry detection, disconnect, type compilation
- All 2466 tests pass (179 files)

---

## What Was Designed (Not Implemented)

### Connector Setup Flow
```
User wants to connect GitHub
  → Capabilities page shows "GitHub: disconnected"
  → User clicks "Connect"
  → Modal: "Enter your GitHub Personal Access Token"
  → User pastes token
  → POST /api/connectors/github/connect { token: "ghp_..." }
  → Vault stores encrypted
  → Health check verifies (GET /api/connectors/github/health)
  → Status: "connected" with green dot
  → Agent now has access to github_repos, github_issues tools
```

For OAuth2 connectors (future):
```
User wants to connect Slack
  → Click "Connect"
  → Redirect to Slack OAuth page (localhost callback)
  → Slack returns auth code
  → POST /api/connectors/slack/callback { code: "..." }
  → Server exchanges code for access + refresh tokens
  → Vault stores both tokens with expiresAt
  → Auto-refresh before expiry
```

### Connector Status in Cockpit (Design Only)
```
CONNECTORS
┌─────────────────────────────────────────┐
│  ● GitHub        connected    2m ago    │
│  ○ Slack         disconnected           │
│  ⚠ Google Drive  expired     1d ago    │
└─────────────────────────────────────────┘
```
- Green dot = connected, working
- Grey circle = disconnected (no credentials)
- Amber warning = expired token (needs refresh)
- Red = error (failed health check)

### KVARK Connector Merge Strategy

At Business/Enterprise tier, the user sees ONE connector list:

| Connector | Solo/Teams | Business |
|-----------|-----------|----------|
| GitHub | Waggle-managed (bearer token, read/write) | Same |
| Slack | Waggle-managed (OAuth, read/write) | KVARK augments: deep indexing, enterprise permissions |
| SharePoint | Not available | KVARK-managed (certificate auth, enterprise ACL) |
| Google Drive | Waggle-managed (OAuth, personal) | KVARK augments: org-wide indexing |

**Merge rules:**
1. Waggle substrate handles user-level auth (personal tokens, OAuth)
2. KVARK substrate handles enterprise auth (certificates, SSO, org admin)
3. When both exist for same service, KVARK augments (adds deep indexing, permissions) — does not replace Waggle's user-level actions
4. UI shows one connector with combined capabilities
5. Source attribution in agent responses distinguishes substrate

---

## Composio Evaluation

### Constraints (from strategy doc)

Composio is acceptable ONLY if:
1. Supports local / self-hosted / free-tier usage
2. Is OPTIONAL, not a hidden mandatory SaaS dependency
3. All credentials vault-backed (Composio never stores outside Waggle)
4. Users explicitly informed of any cloud dependency

### Assessment

| Constraint | Composio Status | Verdict |
|-----------|----------------|---------|
| Self-hosted | Composio Cloud is default; self-hosted is "enterprise" tier | CONCERN |
| Free tier | Free tier exists (1000 actions/month) but cloud-dependent | CONCERN |
| Vault-backed credentials | Composio manages its own auth — separate from Waggle vault | FAIL |
| No hidden SaaS | Composio's auth flows go through composio.dev servers | FAIL |

### Recommendation

**Do NOT adopt Composio as default connector engine.**

Reasons:
- Composio manages credentials outside Waggle's vault (violates foundational requirement)
- Auth flows route through composio.dev (hidden SaaS dependency)
- Self-hosted option is enterprise-priced, not free/open

**Alternative path:**
- Build Waggle-native connector SDK (simple: token-paste + health check per connector)
- Start with 3-5 connectors (GitHub, Slack, Google Drive, Jira, Notion)
- Each connector is a small module: auth config, health check, 2-3 tools
- OAuth flow: Waggle server handles redirect/callback, vault stores tokens
- Composio can be offered as OPTIONAL paid acceleration (user installs separately, Waggle doesn't depend on it)

---

## What Remains Deferred

| Item | Why deferred |
|------|-------------|
| Connector tools (github_repos, github_issues) | Wave F proves the type/credential/health seam; tools are separate work |
| OAuth flow (Slack, Google Drive) | Needs redirect server + callback handler; bigger scope |
| Cockpit connector status UI | Needs CockpitView.tsx changes (component modification, out of A2/F scope) |
| Connector discovery in capability acquisition | Needs connector catalog + search integration |
| Team connector governance | Needs team_capability_policies extension for connector scope |
| KVARK connector integration | That IS Phase 7 |
| Connector-to-tool dynamic injection | Needs agent-loop changes for runtime tool registration |
| Full connector catalog (5+ connectors) | Foundation must prove solid first |

---

## Files Changed

| File | Change |
|------|--------|
| `packages/shared/src/types.ts` | +4 connector types (ConnectorCredential, ConnectorStatus, ConnectorDefinition, ConnectorHealth) |
| `packages/core/src/vault.ts` | +2 methods (setConnectorCredential, getConnectorCredential) |
| `packages/server/src/local/routes/connectors.ts` | NEW — 4 REST endpoints + GitHub proof connector |
| `packages/server/src/local/index.ts` | Import + register connectorRoutes |
| `packages/server/tests/local/connectors.test.ts` | NEW — 6 tests |
| `packages/agent/src/capability-router.ts` | 'connector' added to CapabilitySource |
| `packages/agent/src/capability-acquisition.ts` | 'connector' added to CapabilitySourceType |

## Files Intentionally Untouched

| File | Why |
|------|-----|
| Any .tsx component | Wave F is foundation, not UI |
| CockpitView.tsx | Connector status section is design-only |
| agent-loop.ts | Dynamic tool injection is deferred |
| system-tools.ts | Connector tools are deferred |
| trust-model.ts | Connector risk factors are deferred (existing model covers basic risk) |
| team-tools.ts | Team connector governance is deferred |
