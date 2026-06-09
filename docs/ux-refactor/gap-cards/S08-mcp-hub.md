# Gap Card — S08 · MCP Hub

> UX-refactor planning artifact. Execution model is the LOCKED **in-place incremental refactor** of
> `apps/web` + targeted backend extensions. Mockup is directional; PRD acceptance criteria win.
> Every claim below cites a real file. PRD = `docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_UX_Refactor_PRD.md`.

---

## 1. Screen & purpose

**MCP Hub** — the power-user capability-extension surface for Model Context Protocol servers (PRD §12.8,
PRD line 566-579). Belongs to the **Extend** IA layer (PRD §10.4; blueprint line 74, 81: route group
`/mcps`). Explicit blueprint directive: **"Do not bury Connectors/MCPs inside Settings"** (blueprint line 79).

Purpose (PRD §12.8): *"Enable power-user extension through Model Context Protocol servers."* MCPs are
auditable capability providers for power users and agents (blueprint line 140). The governing acceptance
criterion: **"MCPs are powerful but always visible, scoped, auditable, and reversible."** (PRD line 579).

Primary user journey — **J11 / Journey 9 "Install MCP"** (PRD lines 736-743; blueprint line 206-208):
power user opens MCP Hub → selects e.g. Postgres MCP → reviews risk and scope → approves installation →
MCP becomes available to selected workspace/agent → **install audit is recorded**.

Mockup (directional only — `screen_08_mcp_hub.png`): top toolbar with tabs (Installed / Available /
Marketplace / Custom / Remote Registry), search, "Add MCP Server" CTA; left an "Installed MCPs" table
(name, status pill, connected-to, last-used, scope, actions) over an "Available MCPs" category-filtered
grid; right rail with an "MCP Overview" donut (counts), "MCP Health", "Recent Activity" (audit/log feed),
and a "Custom MCP" add affordance.

---

## 2. Required states (PRD / Blueprint)

**Tabs (PRD §12.8 line 572):** Installed · Available · Marketplace · Custom · Remote Registry.

**MCP object fields (PRD §12.8 line 573):** name, description, version, status, **connected to**,
**last used**, **locality** (local/remote), **risk**, **permissions**, **logs**. Target schema
`Extension/MCP` (blueprint line 554, PRD §15.2 `ExtensionType`): `id, type, name, source, version,
endpoint, capabilities, riskLevel, approvalClass, status, health, installedAt, approvedBy`.

**Actions (PRD §12.8 line 574):** install · start/stop · test · scope · view logs · revoke · add custom MCP.
Risky MCPs require approval + audit trail (PRD line 575; blueprint line 161 "elevated connectors/MCPs …
require approval").

**Extension lifecycle states (PRD §14.7 lines 906-914):** Available · Installed · Update available ·
Installing · Failed install · **Risk approval required** · Disabled/revoked. Plus per-server runtime
status (blueprint line 334-335): installed; available; **running**; **stopped**; **error**; risk-approval-needed.

**Connector/MCP UI states (PRD §14.5 / blueprint line 467):** Loading, empty, populated, error.

**Scope (acceptance-critical):** an MCP must be scopeable to workspace and/or agent (PRD line 742;
blueprint line 207 "scope to workspace/agent"; line 601 "Connector and MCP installs are visible,
permissioned, health-checked and auditable"; line 600 "a workspace agent cannot run with hidden
memory/tool/MCP access").

**Offline degradation (blueprint line 516):** offline mode degrades MCPs gracefully while keeping local
workspace/memory available.

---

## 3. Current state in repo

**There is NO dedicated MCP Hub app today.** MCPs surface in three thin, mostly-static places:

1. **Static catalog (discovery only) — `apps/web/src/components/os/apps/connectors/McpCatalog.tsx`** +
   **`McpServerCard.tsx`** + **`mcp-registry.ts`** (a re-export shim of `@waggle/shared`). Rendered as the
   "MCP Servers" tab inside **`ConnectorsApp.tsx`** (`apps/web/src/components/os/apps/ConnectorsApp.tsx:197-205,348-349`).
   The catalog data is `MCP_CATALOG` / `MCP_CATEGORIES` / `CATEGORY_EMOJI` in
   **`packages/shared/src/mcp-catalog.ts`** (`McpServer` interface at `:17`; `MCP_CATALOG` at `:53`; 14
   categories at `:30`). Per the backend-map (`05f` §12, lines 391-401), this catalog is **static and not
   connected at runtime** — a discovery/install-command directory.
   - **The only "install" UX is copy-a-shell-command-then-restart** (`McpServerCard.tsx:30-37,98-138`
     copies `server.installCmd`; tooltip text `:111-116`: "Copy the command … Run it in your terminal …
     Restart Waggle"). There is **no in-app install, start/stop, test, scope, revoke, logs, risk, or
     status** — none of the PRD §12.8 actions/fields exist in the UI.

2. **Live runtime status (read-only) — `GET /api/capabilities/status`**
   (`packages/server/src/local/routes/capabilities.ts:35-53,103-110`) returns
   `mcpServers:[{name,state,healthy,tools}]` from the real runtime. **But the runtime is empty by default**
   (see #3 below), so this list is always `[]` on a stock install.

3. **The MCP runtime engine (rich, but unwired) — `packages/agent/src/mcp/mcp-runtime.ts`.**
   `McpRuntime` has the full lifecycle the PRD needs: `addServer(config)` (`:308`), `removeServer(name)`
   (`:327`), `startAll`/`stopAll`, per-instance `start()/stop()/callTool()` (`McpServerInstance` `:102,154,178`),
   `getServerStates()` (`:362`), `getHealthy()` (`:370`), `isServerHealthy(name)` (`:399`), and **per-workspace
   scoping** via `McpServerConfig.workspaceId` (`:13`) + `getToolsForWorkspace(workspaceId)` (`:385`).
   **CRITICAL GAP:** the runtime is instantiated empty — `const mcpRuntime = new McpRuntime()` with comment
   *"empty by default"* (`packages/server/src/local/index.ts:911`), and **nothing ever calls `addServer()`**
   (grep `mcpRuntime.addServer` / `.mcp.json` / `loadMcpConfig` → 0 matches in `packages/server/src`). So
   there is no persistence layer that loads installed MCP configs at boot, and no HTTP route to install/
   start/stop/test/remove a server.

**Install-audit substrate is present** (`AuditCapabilityType` includes `'mcp'` —
`packages/core/src/install-audit.ts:22`; `InstallAuditStore.record/getRecent/getByCapability` exist) but
**has no read HTTP route** (substrate-types inventory §d: writes only; `GET /api/audit/installs` exists in
`skills.ts` but is a generic recent-installs feed). MCP installs are not currently audited because there is
no MCP install path to audit.

**Adapter:** no `getMcps`/`installMcp`/`testMcp` methods in `apps/web/src/lib/adapter.ts` (grep → 0 matches).

**Disposition: `create-new`** (with substrate reuse). A net-new **MCPHub app** (`MCPHubApp.tsx`) promoted
out of ConnectorsApp's MCP tab, **plus net-new `/api/mcps/*` backend routes wiring the existing `McpRuntime`
+ a new persisted config store + install-audit**. The static catalog component (`McpCatalog`/`McpServerCard`)
is reused as the "Available"/"Marketplace" tab content. This is the single largest backend gap on the Extend
layer — the engine exists but is entirely unwired to UI or persistence.

---

## 4. Frontend work

**New IA placement:** add an `mcp-hub` (or reuse the dead `marketplace`-adjacent slot) `AppId` in
`apps/web/src/lib/dock-tiers.ts`, register chrome in `Desktop.tsx` `appConfig` + a `renderAppContent`
switch case (per frontend inventory §b lines 123-129), and add a dock entry under the **Extend** zone-parent
(`dock-tiers.ts` zone model). MCP Hub is power-user/PRO-tier-gated (PRD personas: power user/developer needs
MCPs — PRD line 151).

**Components to CREATE** (`apps/web/src/components/os/apps/`):
- `MCPHubApp.tsx` — shell with the 5 PRD tabs (Installed / Available / Marketplace / Custom / Remote
  Registry). Mirror `ConnectorsApp.tsx`'s sidebar-tab + filter layout (`:183-216`) so it's visually
  consistent with the Connector Hub it splits from.
- `mcp/InstalledMcpTable.tsx` — table of running/installed servers: name, status pill (running/stopped/
  error/installing — maps `McpServerState` `mcp-runtime.ts:16`), connected-to, last-used, locality,
  scope chip, row actions (start/stop, test, scope, view logs, revoke). Drives PRD §12.8 line 573-574.
- `mcp/AddCustomMcpForm.tsx` — Custom tab: `{ name, command, args[], env{}, workspaceId? }` → `POST /api/mcps`
  (matches `McpServerConfig` `mcp-runtime.ts:8-14`). Reuse `injection-scanner` patterns server-side.
- `mcp/McpDetailPanel.tsx` (right rail) — MCP Overview counts, MCP Health, permissions/scope editor,
  **logs viewer**, and the **risk/approval banner** ("Risk approval required" state). Reuse the approvals
  surface pattern from `ApprovalsApp.tsx` / inline-chat approval (same backend `/api/approval/*`).
- `mcp/McpScopeDialog.tsx` — scope-to-workspace/agent picker (writes `workspaceId` onto the server config;
  later, `mcpIds[]` onto workspace/agent per §6).

**Components to REUSE (keep-promote):**
- `McpCatalog.tsx` + `McpServerCard.tsx` + `mcp-registry.ts` → become the **Available** + **Marketplace** +
  **Remote Registry** tab bodies. Today `McpServerCard` only shows a copy-command strip
  (`McpServerCard.tsx:98-138`) — **rework** it to add a real **Install** button (calls the new
  `installMcp` adapter method) while keeping copy-command as the offline fallback.
- `recommendConnectors` from `@waggle/shared` (already used `McpCatalog.tsx:15,69`) for "Recommended" tile.
- `LockedFeature.tsx` for tier gating; `ContextMenu.tsx` for row actions; shadcn `table`, `badge`, `dialog`,
  `tabs`, `tooltip` primitives (`components/ui/*`, frontend inventory §e).

**Adapter methods to ADD** (`apps/web/src/lib/adapter.ts` — the single sidecar gateway, §c lines 162-265):
`getMcps()`, `installMcp(payload)`, `addCustomMcp(config)`, `startMcp(id)`, `stopMcp(id)`, `testMcp(id)`,
`scopeMcp(id, scope)`, `revokeMcp(id)`, `getMcpLogs(id)` — one per PRD §16.9 / §12.8 action.

**New hook:** `hooks/useMcps.ts` (mirrors the `useConnectors`-style pattern) returning
`{ installed, available, custom, install, start, stop, test, scope, revoke, refresh }`. Wire SSE/poll over
`/api/capabilities/status` or a new `/api/mcps` for live status (cache-invalidate on
"connector sync" / install completion per blueprint line 514).

---

## 5. Backend work (PRD §16.9 endpoints — all MCP rows)

> All net-new routes live in a new `packages/server/src/local/routes/mcps.ts`, registered in
> `local/index.ts`, wiring the already-built `McpRuntime` (`server.agentState.mcpRuntime`,
> decorated `local/index.ts:1361`). **No new SQLite table is strictly required** — but a persisted
> config source IS (see migration flag).

| PRD §16.9 endpoint | Status | Extend vs net-new + substrate it touches |
|---|---|---|
| `GET /api/mcps` | **PARTIAL → build net-new route over existing data** | No `/api/mcps` exists (grep-confirmed in backend-routes inventory, line 422 & §16.9 line 522). The data is **derivable today**: live runtime status from `McpRuntime.getServerStates()/getHealthy()/getAllTools()` (already surfaced in `capabilities.ts:35-53`), enriched with catalog metadata from `MCP_CATALOG` (`@waggle/shared`). **Net-new** thin route in `mcps.ts` that joins runtime state + persisted config + catalog into the `Extension/MCP` shape (§2). Touches: `McpRuntime` (agent), `MCP_CATALOG` (shared), new config store. |
| `POST /api/mcps/install` | **PARTIAL → net-new, route through existing install path** | No `/api/mcps/install` (inventory §16.9 line 523). Closest install paths are marketplace (`POST /api/marketplace/install` — SecurityGate + audit, `marketplace.ts:224-319`) and plugin install (`POST /api/plugins/install`). **Net-new** MCP install that: (a) persists an `McpServerConfig`, (b) calls `mcpRuntime.addServer(config)` + `start()` (`mcp-runtime.ts:308,102`), (c) runs the **SecurityGate + writes an `install_audit` row** with `capability_type:'mcp'` (`install-audit.ts:22`) — satisfying the "install audit is recorded" acceptance step (PRD line 743). Risky servers → return `risk approval required` state instead of starting. Tier: PRO (match marketplace). |
| `POST /api/mcps/:id/test` | **MISSING** | No MCP test/health route (inventory §16.9 line 524). Closest analog is `GET /api/connectors/:id/health`. **Net-new**: resolve the server, `start()` if needed, assert `isHealthy()` (`mcp-runtime.ts:94,399`) and/or do a `tools/list` round-trip, return health + discovered tools. Touches `McpRuntime`. |
| `POST /api/mcps/:id/revoke` | **MISSING** | No MCP revoke/uninstall by id (inventory §16.9 line 525). Closest: `DELETE /api/plugins/:name`. **Net-new**: `mcpRuntime.removeServer(name)` (`mcp-runtime.ts:327`) + delete persisted config + write `install_audit` `action:'rejected'`/`'revoked'`. Touches `McpRuntime` + config store + install-audit. |
| `GET /api/marketplace` | **PARTIAL** | Listing is `GET /api/marketplace/search` (`marketplace.ts`); the Marketplace tab reuses it. Alias of `/search` (inventory §16.9 line 526). Not MCP-specific work. |
| `POST /api/marketplace/install` | **EXISTS** | `marketplace.ts` (Tier PRO, SecurityGate) — reused by the Marketplace tab. |

**Additional routes implied by PRD §12.8 actions not in §16.9 list (net-new):**
- `POST /api/mcps` (add **custom** MCP) — blueprint API line 530 lists `GET/POST /mcps`. Persists config +
  `addServer` + audit. **Net-new.**
- `POST /api/mcps/:id/start` and `POST /api/mcps/:id/stop` — PRD §12.8 "start/stop" action. Map to
  `McpServerInstance.start()/stop()` (`mcp-runtime.ts:102,154`). **Net-new.**
- `PATCH /api/mcps/:id/permissions` (scope/permissions) — blueprint API line 530 (`PATCH /mcps/:id/permissions`).
  Writes `workspaceId`/scope onto the persisted config (runtime honors it via `getToolsForWorkspace`,
  `mcp-runtime.ts:385`). **Net-new.**
- `GET /api/mcps/:id/logs` — PRD §12.8 "view logs". No log capture exists in `McpServerInstance` today
  (stderr is piped `:113` but not retained). **Net-new** + small runtime change to buffer stderr/state-change
  events for retrieval.
- `GET /api/extend/audit` (or extend `/api/audit/installs`) — surface the install-audit trail for the MCP Hub
  right-rail "Recent Activity". `InstallAuditStore.getRecent()` exists but has no MCP-scoped HTTP read
  (substrate-types §d gap #1). **Net-new** (implied addition to §16.9, flagged in substrate inventory).

**Migration / persistence flag (IMPORTANT):**
- **No `.mind` SQLite migration is required for the MCP entity itself** — installed MCP configs can persist as
  a JSON file (mirrors `workspace.json` / `.mcp.json` convention; note repo root already has an untracked
  `.mcp.json` per git status) read at boot to populate `mcpRuntime.addServer()`. **This persistence layer is
  entirely net-new** (today `mcpRuntime` is empty and never populated — `local/index.ts:911`). This is the
  load-bearing backend gap: without it, "Installed" MCPs do not survive restart.
- **Install-audit DDL drift (latent, flag for the plan):** `AuditRiskLevel` TS includes `'critical'`
  (`install-audit.ts:16`) but both CHECK constraints allow only `low|medium|high`
  (`install-audit.ts:65`, `schema.ts:130`). Any MCP install recording `riskLevel:'critical'` would throw a
  CHECK violation — map CRITICAL → `'high'` + `approvalClass:'blocked'` as marketplace.ts already does
  (`marketplace.ts:224-319`), or fix the DDL.

---

## 6. Shared types needed (PRD §15 vs `lib/types.ts`)

- **`ExtensionType`** (PRD §15.2 line 953: `'skill'|'connector'|'mcp'|'model'|'template'|'external_tool'`)
  — **MISSING** in `apps/web/src/lib/types.ts` (substrate-types §e: none of the §15.2 unions exist in FE).
  Add it.
- **`Extension` / `Mcp` interface** (blueprint line 554: `id, type, name, source, version, endpoint,
  capabilities, riskLevel, approvalClass, status, health, installedAt, approvedBy`) — **MISSING**. No
  `Extension`/`Mcp` type anywhere in FE. Add to `lib/types.ts` (and ideally `packages/shared/src/types.ts`
  so the sidecar route and FE share it). The existing `McpServer` (`@waggle/shared` `mcp-catalog.ts:17`:
  `id,name,description,author,category,url,installCmd,capabilities,official?,logo?`) is the **catalog/discovery**
  shape — distinct from the **installed-instance** `Mcp` shape; keep both, the Hub joins them by `id`.
- **Runtime types already exist server-side** and should be the source of truth for the route contract:
  `McpServerConfig`, `McpServerState`, `McpToolInfo` (`packages/agent/src/mcp/mcp-runtime.ts:8-22`). Mirror
  `McpServerState` (`'starting'|'ready'|'error'|'stopped'`) into the FE status union (map to PRD §14.7 states).
- **Reuse from install-audit:** `AuditCapabilityType`, `AuditRiskLevel`, `AuditApprovalClass`
  (`packages/core/src/install-audit.ts:15-22`) for the riskLevel/approvalClass/audit fields — do not invent
  parallel enums.
- **`mcpIds[]` on Workspace/Agent** (PRD §15.3 `WorkspaceConfigV2.mcpIds`, §15.5 Agent `mcpIds`) —
  **MISSING** from both `WorkspaceConfig` (`workspace-manager.ts`, substrate-types §a) and `AgentDef`
  (`packages/shared/src/types.ts:36-47`, §e). Needed for the "scope to workspace/agent" action. Additive
  optional field (no DB migration — `workspace.json` is JSON).

---

## 7. Dependencies (screens / phases first)

- **Connector Hub (S07)** — MCP Hub is split OUT of `ConnectorsApp.tsx`'s MCP tab; do the Connector Hub
  promotion first (or jointly) so the shared sidebar-tab/filter/health/state patterns are settled and the
  MCP tab can be cleanly extracted. Same `Extend`-layer dock placement work.
- **Extend layer / dock-zone IA** — requires the new `AppId` + dock-zone wiring (frontend inventory §b/§d:
  consolidate on `AppId`, add Extend zone entries). Blocks any new Extend app from being reachable.
- **Install-audit read route (§d gap)** — shared with Skills (S?) and Connectors governance; build once,
  reuse across the Extend layer.
- **Approvals surface** — risk-approval flow reuses existing `/api/approval/*` + `ApprovalsApp` patterns;
  no new approval substrate, but the wiring depends on that surface staying stable.
- **Marketplace** — the Marketplace tab reuses `GET /api/marketplace/search` + `POST /api/marketplace/install`
  (already exist); ensure marketplace MCP packages are tagged so they route to the MCP install path.
- **Phase hint:** later phase. Backend wiring (persisted config store + runtime population + `/api/mcps/*`)
  is the prerequisite for any non-static UI; the static catalog already ships, so this is a depth upgrade,
  not a day-1 blocker. Sequence after Home/Workspace/Memory core screens.

---

## 8. Effort: **XL**

Largest Extend-layer gap: the runtime engine exists but is **completely unwired** (empty `McpRuntime`, no
persistence, no HTTP surface, copy-command-only UI). Requires a net-new persisted MCP-config store + boot-time
runtime population + ~8 net-new sidecar routes (install/start/stop/test/scope/revoke/logs + custom add) +
SecurityGate/audit integration + a full new app shell with 5 tabs, installed-table, detail/logs panel, scope
dialog, risk-approval flow, and adapter/hook layer — while preserving the static catalog as the
Available/Marketplace tabs. (Frontend-only would be M; the backend wiring + persistence + governance is what
pushes it to XL.)

---

## 9. Open questions

1. **Persistence location/format for installed MCP configs** — JSON file (`.mcp.json` at dataDir, mirroring
   `workspace.json`; root already has an untracked `.mcp.json`) vs a new `install_audit`-adjacent table?
   Recommendation: JSON file (no migration), but confirm the dataDir path + multi-workspace scoping model.
2. **Scope model** — is an MCP scoped by writing `workspaceId` onto its single config (1 server : 1 workspace,
   per current `McpServerConfig.workspaceId`), or by an `mcpIds[]` membership array on each workspace/agent
   (N:N)? PRD §15.3/§15.5 imply `mcpIds[]` (N:N); the runtime today only supports the single-`workspaceId`
   field (`mcp-runtime.ts:13,385`). N:N needs a runtime change.
3. **Logs capture** — `McpServerInstance` pipes stderr but does not retain it (`mcp-runtime.ts:113`). Add a
   ring-buffer of stderr + stateChange events for `GET /api/mcps/:id/logs`, or defer logs to a later phase?
4. **"Remote Registry" tab semantics** — is this the Composio gateway (already referenced in
   `McpCatalog.tsx:106,294-301`), the official `modelcontextprotocol/servers` registry, or a remote
   (HTTP/SSE-transport) MCP class distinct from local stdio? The runtime today is **stdio-only**
   (`mcp-runtime.ts:108-115`); remote-transport MCPs would need a new transport in `McpServerInstance`.
5. **Install execution surface** — does in-app "Install" run `npx …` (spawn a child process to install the
   package) in the sidecar, or only register config + rely on a globally-installed binary? Security review
   needed (spawning installers vs the current copy-to-terminal model). Tauri IPC/CSP implications.
6. **Tier gate** — confirm MCP Hub is PRO+ (matches marketplace install gate) vs power-user-density-tier
   (`UserTier`) only. Three tier vocabularies to reconcile (frontend inventory §f).
