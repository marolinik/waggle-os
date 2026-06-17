# PR4 Recon · Slice 3 — Shared Install State ("sync")

**Branch:** `feature/warm-hive-pr4` · **Screen:** 09 Marketplace · **Read-only recon.**
**Design contract:** `docs/design_handoff_waggle_app/SCREENS.md` §09 (lines 189-207) +
the reference implementation in `docs/design_handoff_waggle_app/design-files/screens/marketplace.html`
(lines 203-310 — the canonical `installed`/`installing` Set + `renderAll()` "sync" model).

> This is THE critical design element of PR4: "one store powers the grid, the agent picks,
> AND the inline card. Installing in any view reflects in all of them."

---

## 0. TL;DR — the delta in one paragraph

There is **no shared install state today.** Three install backends exist and are battle-tested,
but each lives in its own server module with its **own persistence mechanism and its own
notion of "installed"**: skills = markdown files on disk reloaded into `agentState.skills`;
connectors = vault credentials; MCP = `.mcp.json` + a live runtime. The FE has **no unified
store** — `MarketplaceApp` (the existing Phase-4B Extend surface) federates the six facets
**at read** into a local `useState<Extension[]>` and **discards that view on unmount**. Installing
in the grid does NOT reflect in chat's `CapabilityRequestCard` (which keeps its own local
`phase` state) and vice-versa. There is **no count bar**, **no type-aware Add/Connect/Enable
verbs**, and **no progress→done micro-states** on the cards. The single cross-type fact that
IS already shared is the **install-audit trail** (`server.auditStore`, the `install_audit`
table) — every install path writes to it, but it is an append-only event log, not a queryable
"installed set." PR4 must introduce a real FE store + a thin server aggregate so the three
backends present as ONE reactive installed set.

---

## 1. Where install state lives TODAY — per type

### 1a. Skills — filesystem-backed
**Server:** `packages/server/src/local/routes/skills.ts`
- **Source of truth:** `.md` files in `<dataDir>/skills/` (default `~/.waggle/skills/`).
  "Installed" = file exists on disk; "active" = also loaded into `server.agentState.skills`.
- **Install:** copies starter/pack `.md` into `skillsDir`, then reloads
  `server.agentState.skills.length = 0; push(...loadSkills(waggleHome))` (skills.ts:204-205,
  333-334). Authored skills go through `writeSkill(...)` (the P5/D4 shared write-service that
  redacts + stamps provenance + audits) at skills.ts:439, 500, 545.
- **Routes:**
  - `POST /api/skills/starter-pack/:id` (skills.ts:168) — single starter skill, instant
  - `POST /api/skills/capability-packs/:id` (skills.ts:271) — install a whole pack
  - `POST /api/skills/:id/install` — alias in `skills-aliases.ts` (the one the FE adapter
    `installSkill(id, source, packageId?)` actually calls — adapter.ts:1240-1256)
  - `DELETE /api/skills/:name` (skills.ts:563) — uninstall (audits `'uninstalled'`)
  - `GET /api/skills` (skills.ts:345) — list installed (with provenance/initiator)
  - `GET /api/skills/capability-packs/catalog` (skills.ts:238) — packs with per-skill
    `state: 'active'|'installed'|'available'` and a `packState`/`installedCount`/`totalCount`
- **Audit:** `server.auditStore.record({ capabilityType: 'skill', action: 'installed'|'uninstalled', ... })`
- **Micro-state in design:** `skill` → `Add → Adding… → Added` (instant; ~480ms in the mock).

### 1b. Connectors — vault-credential-backed
**Server:** `packages/server/src/local/routes/connectors.ts`
- **Source of truth:** the **Vault** (`packages/core/src/vault.ts`). "Installed/connected" =
  a credential exists under `connector:{id}` (`fastify.vault.setConnectorCredential`,
  connectors.ts:122). Status is derived **live** by `connectorRegistry.healthCheck(id)` /
  credential presence — there is no stored "installed" boolean.
- **Connect (the design's "token → vault"):** `POST /api/connectors/:id/connect`
  (connectors.ts:96) stores the credential in the vault, re-inits the connector, and audits
  `action:'installed', trustSource:'local_user'`. OAuth tokens are also written by
  `oauth.ts` under `${provider}_oauth_token` (provider-keyed, NOT connector-keyed — see the
  `OAUTH_PROVIDER_FOR_CONNECTOR` Google-family map at connectors.ts:16-23).
- **FE connect flow (the real vault path):** `ConnectorsApp.tsx` →
  `adapter.addVaultSecret({ key: 'connector:{id}', value: token, type:'bearer' })` THEN
  `adapter.connectConnector(id)` (ConnectorsApp.tsx:154-155).
- **Routes:** `GET /api/connectors` (list+status, connectors.ts:38), `/connect`, `/disconnect`,
  `/sync` (C16 health re-probe + `lastSyncAt` stamp), `/revoke` (C17 strong purge incl. OAuth).
- **Adapter:** `getConnectors()` (adapter.ts:1958), `connectConnector(id, creds?)` (1971),
  `disconnectConnector` (1981), `syncConnector` (1986), `revokeConnector` (1994).
- **Micro-state in design:** `connector` → `Connect → Signing in… → Connected` (~1.1s, the
  "token goes to your vault" approval). **This is the only flow with an approval gate** in
  Variation B (the vault-aware "Add & connect" approval, marketplace.html:179-183).

### 1c. MCP — `.mcp.json` + live runtime
**Server:** `packages/server/src/local/routes/mcps.ts`
- **Source of truth:** persisted `<dataDir>/.mcp.json` (`mcp-config.ts`) **⋈** the live
  `McpRuntime` server states (`fastify.agentState.mcpRuntime`). "Installed" = present in
  `.mcp.json` OR registered in the runtime (mcps.ts:147). The C4 boot loader re-registers
  persisted entries so installs survive restarts.
- **Install:** `POST /api/mcps/install` (mcps.ts:189, **PRO-gated** via `requireTier('PRO')`)
  **delegates to the marketplace installer** (`fastify.inject('/api/marketplace/install')`) so
  SecurityGate + scan + install_audit ride along, then `saveMcpServerEntry` + `runtime.addServer`
  + `instance.start()`. Custom servers: `POST /api/mcps` (mcps.ts:331, also PRO-gated).
- **Enable/disable:** `POST /api/mcps/:id/start` (mcps.ts:471), `/stop` (487), `/revoke` (496,
  removes from runtime + config + marks the marketplace package uninstalled).
- **Routes/list:** `GET /api/mcps` (mcps.ts:143) returns `{ mcps, total, installed }` where
  each row carries `installed`, `status`, `scope`, `state`, `tools`.
- **Adapter:** `getMcps()` (adapter.ts:2004), `installMcp(mcpId, opts)` (2017),
  `addCustomMcp` (2031), `testMcp` (2045).
- **Micro-state in design:** `mcp` → `Enable → Enabling… → Enabled` (~720ms in the mock).

### 1d. Marketplace registry (the spine the others lean on)
**Server:** `packages/server/src/local/routes/marketplace.ts` (uses `@waggle/marketplace`
`MarketplaceDB`/`MarketplaceInstaller`/`SecurityGate`). The `packages` table is SQLite; a
package's domain is `waggle_install_type` (`'skill'|'mcp'|'plugin'`), NOT a `type` column.
- `GET /api/marketplace/search` (`installed: db.isInstalled(pkg.id)`, marketplace.ts:107)
- `POST /api/marketplace/install` (marketplace.ts:181, PRO-gated; SecurityGate + audit)
- `POST /api/marketplace/uninstall` (marketplace.ts:437; MCP cleanup ride-along)
- `GET /api/marketplace/installed` (marketplace.ts:475 → `db.listInstallations()`)
- `GET /api/marketplace/packs` (raw `MarketplacePack` rows — **no install route exists**, so
  packs are browse-only today; see `fromSkillPack` `installable:false`)
- **Adapter:** `getMarketplace({query,type,limit})` (adapter.ts:2082), `searchMarketplace`
  (1334), `installMarketplacePackage(packageId)` (1338, returns raw Response),
  `uninstallMarketplacePackage` (1345), `getMarketplacePacks` (1309).

---

## 2. The ONLY thing shared today: the install-audit trail

`server.auditStore` (the `install_audit` table) is the single cross-type surface every install
path already writes to:
- skills: skills.ts:212, 315 + the `writeSkill`/`deleteSkill` service
- connectors: connectors.ts `recordConnectorAudit` (29) on connect/sync/revoke
- mcp: mcps.ts `recordMcpAudit` (93) on install/custom-add/revoke
- marketplace: writes its own rows on non-clean scans

It is exposed as `GET /api/audit/installs` (skills.ts:718) and a shared Extend feed
`GET /api/extend/audit?type=…` (rendered by `extend/InstallAuditPanel.tsx`, used as the
Marketplace "Audit" tab). **But it is an append-only EVENT log, not a queryable installed-set**
— you cannot ask it "what is installed right now" without replaying install/uninstall pairs.
`install_audit` is also **OSS-EXCLUDED** (CLAUDE.md §7.5) — fine for a Waggle-only count, but it
must NOT become the substrate's source of truth.

> **No skill_share/diffusion wiring lives in the server `local/` layer.** `lifecycle.ts` has
> none; the `onSkillDistillationFire → skill_share` callback is the agent layer (CLAUDE.md §10
> Phase 3). `waggle-dance-bridge.ts` only *categorizes* an incoming `skill_share` subtype into
> the `'handoff'` UI bucket (waggle-dance-bridge.ts:53). Diffusion is **out of scope for the
> install-sync store** — it is a separate signal stream (relevant to screen 12, not 09).

---

## 3. The FE today — `MarketplaceApp` federates at READ, holds no shared state

`apps/web/src/components/os/apps/MarketplaceApp.tsx` (routed at `/marketplace` via
`MarketplaceRoute.tsx`; mounted bare in Desktop) is the existing Phase-4B six-facet Extend
surface. How it works today:
- `loadFacet(f, q)` (MarketplaceApp.tsx:116) fires **N parallel adapter calls** (one per facet)
  and merges results into a **local** `useState<Extension[]>` (line 105) via the pure
  normalizers in `lib/extension-catalog.ts`.
- Install dispatch (`handleInstall`, MarketplaceApp.tsx:224) **only works for
  `kind:'package'`** (marketplace registry rows). Connectors, MCP catalog rows, agents,
  models, templates are `kind:'federated'` → `installable:false` → render an **"Open in
  <app>"** deep-link, NOT an install button (`ExtensionCard.tsx:72`). Skill *packs* are
  `installable:false` too (no install-pack route).
- On a successful install it mutates ONLY its own local array
  (`setExtensions(prev => prev.map(...installed:true))`, line 231). **Nothing else on the
  screen or app knows.** Unmount = state gone, re-fetch on next mount.

### Card today vs. design
`ExtensionCard.tsx` shows a generic **`Install` / `Remove`** button + a static
`Installed`/`Available` `StatusBadge`. It has **none** of:
- type-aware verbs (`Add`/`Connect`/`Enable`) — design `VERB` map, marketplace.html:216
- a per-item `installing` micro-state (`Adding…`/`Signing in…`/`Enabling…`)
- a `+`/`✓` affordance keyed off a shared installed Set

### Variation B today — `CapabilityRequestCard` (a partial, divergent precursor)
`apps/web/src/components/os/apps/chat-blocks/CapabilityRequestCard.tsx` already surfaces an
**inline install affordance in chat**, parsed out of agent text by
`capability-request-parser.ts` (a `<!--waggle:capability_request {...}-->` marker or a legacy
`install_capability with name "X"` phrasing). BUT:
- It handles **only `skill` (starter-pack) and `marketplace`** kinds — **no connector vault
  approval, no MCP enable** (the design's headline Variation-B example is a *Salesforce
  connector* with the "token → vault" approval, which this card cannot render).
- It owns its **own local `phase` state** (`'pending'|'installing'|'installed'|...`, line 17/32)
  — completely disconnected from the grid. Installing here never updates the grid's count bar
  or card; installing in the grid never flips this card to "installed."
- It is **not vault-aware** and has no "token goes to your vault" approve-row.

So: two install UIs, two private states, three backends, zero shared store, no count bar.

---

## 4. What "one store + cross-view reactivity" requires

### 4a. The design's reference model (what we must reproduce, for real)
`marketplace.html` is the spec in code: a single module-level `installed: Set` + `installing:
Set`, a `btnHTML(item)` that reads those Sets for `[idle, in-progress, done]` per `item.k`
(`VERB` map), ONE delegated click handler (`document.addEventListener('click', … install(id))`),
and a `renderAll()` that re-paints **grid + picks + count-bar + inline-chat card** off the same
two Sets. `install(id)` flips `installing→installed` with a type-keyed delay, fires a toast, and
re-renders everything. The inline-chat `renderInline()` (line 299) reads the SAME `installed`
Set — that is the entire "sync" mechanism.

### 4b. FE store shape (the new artifact PR4 introduces)
A React context/store — call it `InstallStore` (the BUILD-PLAN's "new install store") — holding:
- `installed: Map<extKey, InstalledRecord>` and `installing: Set<extKey>` where `extKey` is the
  existing namespaced id (`extension-catalog`'s `connector:slack`, `mcp:fs`, `pkg:42`,
  `skill:teardown`) so it federates across types without collision.
- `install(ext)` — **type-aware dispatcher** routing to the right adapter call:
  - `skill` → `adapter.installSkill(id, source, packageId?)` / `installPack` (instant)
  - `connector` → vault approval → `addVaultSecret` + `connectConnector(id)` (~1.1s, gated)
  - `mcp` → `adapter.installMcp(mcpId)` (PRO-gated; SecurityGate)
  - `package` (registry) → `adapter.installMarketplacePackage(packageId)`
  optimistically add to `installing`, on success move to `installed` + toast, on failure roll back.
- A subscription so the grid, the agent-pick box, the count bar, AND the chat
  `CapabilityRequestCard` all read the same Sets and re-render on change (the cross-view
  reactivity = React context consumers, replacing today's per-component `useState`).
- Pattern to match: this codebase already uses small custom contexts (`ServiceProvider`,
  `ShellContext`, `ThemeProvider` in `apps/web/src/providers/`) and per-domain hooks
  (`useChat`, `useMemory`, `useWorkspaces` in `apps/web/src/hooks/`). The install store should
  be a sibling provider + a `useInstallStore()` hook — **no Redux/Zustand precedent in this repo.**

### 4c. Server aggregate (the gap)
The store needs an **initial installed-set hydrate** and a **count**. Today that means fanning
out the same N calls `MarketplaceApp.loadFacet` already does (`/api/skills`,
`/api/connectors`, `/api/mcps`, `/api/marketplace/installed`) and merging. Options for the
"N in this workspace" bar:
- **Cheap path (no new route):** derive the count/chips on the FE from the existing per-type
  list endpoints the store already calls (each returns an `installed` flag/`status`). This is
  the surgical, ship-now option.
- **Aggregate route (nicer):** a new `GET /api/extend/installed` (or `/api/marketplace/sync`)
  returning `{ items:[{key,type,name,installed}], count }` by merging the three backends server-
  side. The Marketplace already owns an "Extend" namespace (`extend.ts`, the audit feed); this
  would slot beside it. Mind the §7.5 mind-isolation rule: keep it workspace-scoped, no cross-
  mind reads.

### 4d. The three micro-state flows differ structurally — the store must encode that
| type | adapter call | gate / approval | latency profile | persistence |
|---|---|---|---|---|
| skill | `installSkill`/`installPack` | none (bundled) | instant (~480ms) | FS file + `agentState` reload |
| connector | `addVaultSecret`+`connectConnector` | **vault approval** ("token → vault"); may need OAuth | ~1.1s (sign-in) | vault credential |
| mcp | `installMcp` | **PRO tier + SecurityGate** scan | ~720ms (spawn/enable) | `.mcp.json` + runtime |
| package (registry skill/mcp) | `installMarketplacePackage` | **PRO tier + SecurityGate** | varies | marketplace.db install row |

The store's `install()` cannot be one uniform call — it is a switch on `ext.type`/`ext.kind`,
each branch with its own optimistic/confirm/rollback semantics. Connector is the only branch
that surfaces an interstitial approval before the optimistic flip.

---

## 5. Concrete deltas vs. the screen-09 contract

1. **No shared install store at all** — grid, agent-picks, and inline-chat each hold private
   state (or none). The store + cross-view reactivity is net-new (the BUILD-PLAN's "new install
   store").
2. **No count bar** — the design's "N in this workspace" chip bar (`ibCount`/`ibChips`,
   marketplace.html:151-155) has no FE or server surface today.
3. **Cards lack type-aware verbs + micro-states** — `ExtensionCard` shows generic
   `Install`/`Remove`; design wants `Add/Connect/Enable` × `idle/in-progress/done`.
4. **Connectors & MCP are not installable from the grid today** — they render as federated
   "Open in <app>" deep-links (`installable:false`). The design wants a one-click
   Connect/Enable IN the grid that hits the real vault/runtime paths.
5. **Variation B is partial** — `CapabilityRequestCard` exists but handles only skill+marketplace,
   owns disconnected local state, and has **no vault-aware connector approval** (the literal
   headline example of Variation B).
6. **No centered agent-search "Ask the agent" + suggestion box** — MarketplaceApp has a plain
   filter search, not the "Describe what you want to do…" agent-pick surface with
   connector+skill+tool recommendations and "why" reasons. (This is the Variation-A search half;
   Slice-3's job is the *install state* under it, but the picks must read the same store.)
7. **`installable:false` on skill packs** — no install-pack route server-side; either the store
   skips packs or PR4 adds the route.

---

## 6. Integration points a PR4 build would touch

**FE (new + edit):**
- NEW: `apps/web/src/providers/InstallProvider.tsx` (or `hooks/useInstallStore.ts`) — the shared
  Set-based store + type-aware `install()` dispatcher + count selector. Mount alongside
  `ServiceProvider`/`ShellContext`.
- EDIT: `apps/web/src/components/os/apps/MarketplaceApp.tsx` — read installed/installing from the
  store instead of local `useState`; add the count bar + agent-search/picks; route card installs
  through the store.
- EDIT: `apps/web/src/components/os/apps/extend/ExtensionCard.tsx` — type-aware verbs +
  `idle/in-progress/done` micro-states off the store.
- EDIT: `apps/web/src/components/os/apps/chat-blocks/CapabilityRequestCard.tsx` +
  `capability-request-parser.ts` — extend the `CapabilityRequest.kind` union to
  `'connector'|'mcp'` (with the vault approval row for connector), read/write the SHARED store.
- REUSE: `apps/web/src/lib/extension-catalog.ts` (`Extension`, namespaced ids, `fromConnector`/
  `fromMcpCatalogRow`/`fromMarketplacePackage`/`fromSkillPack`) — the existing federation
  normalizers are the store's value type; today they hard-code `installable:false` for
  connectors/MCP — those flip true once the store can install them.

**FE adapter (already present — wire, don't recreate):** `adapter.installSkill` /
`installPack` / `connectConnector` / `addVaultSecret` / `installMcp` /
`installMarketplacePackage`; list/hydrate via `getSkills`/`getConnectors`/`getMcps`/
`getMarketplace`/`getMarketplaceInstalled` equivalents.

**Server (mostly reuse; one optional new route):**
- REUSE: `POST /api/skills/:id/install` (skills-aliases.ts), `POST /api/connectors/:id/connect`
  (connectors.ts:96), `POST /api/mcps/install` (mcps.ts:189), `POST /api/marketplace/install`
  (marketplace.ts:181) — the install verbs already exist and audit.
- REUSE for hydrate: `GET /api/skills`, `GET /api/connectors`, `GET /api/mcps`,
  `GET /api/marketplace/installed`.
- OPTIONAL NEW: `GET /api/extend/installed` (aggregate installed-set + count) beside
  `extend.ts` — only if the FE doesn't derive the count from the per-type lists. Keep
  workspace-scoped (CLAUDE.md §7.5 mind-isolation).
- DO NOT TOUCH: the install-audit substrate as a source of truth (`install_audit` is OSS-excluded
  + append-only).

**Shared types:** `packages/shared/src/types.ts` `EXTENSION_TYPES`/`ExtensionType` (line 375) is
the facet vocabulary the store keys on — no change needed unless a `package` vs domain
discriminator is wanted.

---

## 7. Risks

- **Three backends, three "installed" definitions** — FS file vs vault credential vs
  `.mcp.json`⋈runtime. A naive single boolean store will drift from reality (e.g. an MCP that
  failed to `start()` is persisted-but-not-running). The store's record must carry enough state
  (`status`/`state`) to stay honest, mirroring `getMcps`'s `status` field.
- **Tier + SecurityGate gating is real** — MCP and marketplace installs are PRO-gated and can be
  scan-blocked (403/422 with `{requiresApproval, blocked, severity}`). The store's optimistic
  flip must roll back on these and route to the UpgradeModal/ApprovalModal, exactly as
  `MarketplaceApp.handleInstall` (line 238) and `MCPHubApp` already do. Don't let the count bar
  show an item that the gate rejected.
- **Connector OAuth complexity** — the "Connect → Signing in…" flow may be a real OAuth redirect
  (oauth.ts) for some connectors, not just a token paste. The ~1.1s mock latency hides a
  potentially multi-step, navigation-away flow; the store needs a pending/await state that
  survives that.
- **Reflecting external installs** — installs done in the dedicated apps (`ConnectorsApp`,
  `MCPHubApp`, skills center) must also update the shared store, or the count bar lies. Either
  those apps adopt the store too, or the store re-hydrates on focus/navigation.
- **Audit-vocabulary mismatch** — `install_audit`'s action enum has no `'enabled'`/`'connected'`/
  `'synced'` verbs (connectors map sync→`'approved'`, connectors.ts:225). If the store ever reads
  the audit feed for state, it inherits this lossiness. Read from the per-type list endpoints
  instead.
- **`apps/web` is the only typechecked surface** (CLAUDE.md §2) — a new provider with subtle
  types is fine, but any server aggregate route runs under `tsx` transpile-only and won't be
  typechecked by `npm run build`; run `tsc -p packages/server` explicitly.

---

## 8. Open questions for the founder/lead

1. **Aggregate route vs FE-derived count** — ship the count bar by deriving from the existing
   per-type list endpoints (zero new server surface, fastest), or add a real
   `GET /api/extend/installed`? (Recommend FE-derive for PR4; promote to a route only if reused.)
2. **Do the dedicated apps adopt the store too?** The "installing in ANY view reflects in ALL"
   contract technically includes `ConnectorsApp`/`MCPHubApp`/skills center, not just the three
   Marketplace surfaces. In-scope for PR4, or PR4 covers grid+picks+inline only and the store
   re-hydrates on nav?
3. **Connector install in-grid = real OAuth?** Some connectors are token-paste (vault), some are
   OAuth redirect. Does the grid's one-click "Connect" do the full sign-in inline, or open the
   Connector Hub for OAuth ones while doing token-paste inline? (Affects the micro-state UX.)
4. **Skill packs installable?** They are browse-only today (no install-pack route). Add a real
   `POST /api/marketplace/install-pack` for PR4, or keep packs browse-only and have the store
   skip them?
5. **Agent-pick search backing** — is the "Ask the agent" suggestion box a real agent call
   (`/api/command` / the agent loop) returning connector+skill+tool picks, or a heuristic FE
   matcher like the mock's `recs` map? (Slice 3 only owns that the picks read the shared store;
   the recommendation engine itself may be another slice.)
6. **PRO-gating in the count** — should PRO-gated items (MCP, marketplace) appear installable to
   FREE users with an upsell on click, or render gated up front? (`MarketplaceApp` currently
   lets the click 403 → UpgradeModal.)

---

## 9. Key files (quick index)

| path | role |
|---|---|
| `docs/design_handoff_waggle_app/SCREENS.md` §09 (189-207) | the screen-09 contract |
| `docs/design_handoff_waggle_app/design-files/screens/marketplace.html` (203-310) | canonical "sync" reference impl (installed/installing Sets + renderAll) |
| `apps/web/src/components/os/apps/MarketplaceApp.tsx` | existing Extend grid — federates at read, local state only |
| `apps/web/src/lib/extension-catalog.ts` | pure facet normalizers + namespaced ids = the store's value type |
| `apps/web/src/components/os/apps/extend/ExtensionCard.tsx` | grid card — generic Install/Remove, needs type-aware verbs |
| `apps/web/src/components/os/apps/chat-blocks/CapabilityRequestCard.tsx` | Variation-B precursor — skill+marketplace only, private state, no vault approval |
| `apps/web/src/components/os/apps/chat-blocks/capability-request-parser.ts` | inline-card parser (marker + legacy phrasing) |
| `apps/web/src/lib/adapter.ts` (1240/1338/1958/2004 …) | all install/list verbs already exist |
| `packages/server/src/local/routes/skills.ts` | skills install (FS files + agentState reload + audit) |
| `packages/server/src/local/routes/connectors.ts` | connectors install (vault credentials + audit) |
| `packages/server/src/local/routes/mcps.ts` | MCP install (.mcp.json + runtime, PRO+SecurityGate) |
| `packages/server/src/local/routes/marketplace.ts` | registry install/uninstall/installed + SecurityGate |
| `packages/server/src/local/routes/extend.ts` + `extend/InstallAuditPanel.tsx` | shared install-audit feed (the ONLY cross-type surface today) |
| `packages/server/src/local/waggle-dance-bridge.ts` (53) | only categorizes incoming skill_share → not install-sync |
| `packages/shared/src/types.ts` (375) | `EXTENSION_TYPES` facet vocabulary |
| `apps/web/src/providers/{ServiceProvider,ShellContext,ThemeProvider}.tsx` | the context pattern the new InstallProvider should follow |
