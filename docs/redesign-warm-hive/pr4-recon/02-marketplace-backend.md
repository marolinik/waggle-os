# PR4 Recon — Slice 2: Marketplace Backend + Routes

**Design contract:** SCREENS.md §09 (Marketplace — skills + connectors + MCP as one shelf, agent-searchable).
**PR4 scope (BUILD-PLAN.md §6, line 142):** "Marketplace + **shared install store ('sync')** (grid + agent-pick + inline-in-chat)" → `MarketplaceApp`, **new install store**, screen 09.
**Branch:** `feature/warm-hive-pr4`. **Mode:** READ ONLY (no source touched).

This doc maps the *existing* backend territory a PR4 "shared install store (sync)" would build ON. It does not propose the plan.

---

## 0. TL;DR for the synthesizer

There is **no single install store today**. The §09 contract assumes *one* store powering grid + agent-pick + inline-card, with type-aware micro-states (skill Add→Adding→Added, connector Connect→Signing in→Connected token→vault, MCP Enable→Enabling→Enabled) and a workspace-scoped "N in this workspace" count bar. The actual backend splits install state across **three independent persistence layers**, none of which agree on a shared shape, and **none of which are workspace-scoped**:

| Kind | "Is it installed?" source of truth | Install verb / route | Workspace-scoped? |
|---|---|---|---|
| **skill** / **plugin** / **mcp** (marketplace pkg) | `installations` table in `marketplace.db` (`status='installed'`), keyed by **numeric `package_id`** | `POST /api/marketplace/install` | **No** — global |
| **mcp** (runtime) | `<dataDir>/.mcp.json` ⋈ live `McpRuntime` server states, keyed by **string server name** | `POST /api/mcps/install` (delegates to marketplace) | **Partial** — a server carries one optional `workspaceId` tag (C19), but install presence is global |
| **connector** | **Vault** credential under `connector:{id}` (presence = "connected"), keyed by **string connector id** | `POST /api/connectors/:id/connect` (token→vault) | **No** — vault is single-user/global |

The install-audit trail (`install_audit` table) **is the only thing that already unifies all three** as a write-side feed — but it is an append-only *log*, not a queryable "installed set," and it has **no `workspace_id` column** (schema.ts:135-152). So the count-bar's "N in this workspace" claim has **no backing data today**; it would either need a new scoping column or be redefined as a global count.

The current FE (`MarketplaceApp.tsx`) already does federate-at-read across 6 domains but holds install state only in **local React `useState`** — installing patches `extensions[]` in place; there is no cross-view store, so "installing in any view reflects in all" (the §09 CRITICAL line) is **not satisfied** today.

---

## 1. Marketplace DB schema (`packages/marketplace/src/db.ts` + types.ts)

`MarketplaceDB` wraps a `better-sqlite3` handle at `~/.waggle/marketplace.db` (overridable; the server opens `<dataDir>/marketplace.db`, seeded by copy from `packages/marketplace/marketplace.db` — server/local/index.ts:457-506). WAL mode, FK on.

### Tables (inferred from queries — there is **no `CREATE TABLE` DDL in the TS source**; the schema ships pre-built inside the committed `marketplace.db` seed file)

- **`packages`** — the catalog. Columns referenced in code (db.ts, types.ts `MarketplacePackage`): `id` (PK), `source_id` (FK→sources), `name`, `display_name`, `description`, `author`, `package_type` (`skill|plugin|mcp_server|template|pack`), **`waggle_install_type`** (`skill|plugin|mcp` — the dispatch discriminant), `waggle_install_path`, `version`, `license`, `repository_url`, `homepage_url`, `downloads`, `stars`, `rating`, `rating_count`, `category`, `subcategory`, `install_manifest` (JSON), `platforms` (JSON), `min_waggle_version`, `dependencies` (JSON), `packs` (JSON), `created_at`, `updated_at`. **Plus security columns** added by the installer's `recordScanResult()` (types.ts:81-90 `PackageSecurityColumns`): `security_status`, `security_score`, `last_scanned_at`, `content_hash`, `scan_engines`, `scan_findings`, `scan_blocked`.
- **`packages_fts`** — FTS5 virtual table joined on `p.id = fts.rowid` for full-text search (db.ts:103). `rank` column used for relevance ordering.
- **`sources`** — catalog provenance. Columns (db.ts:271-283, types.ts `MarketplaceSource`): `id`, `name`, `display_name`, `url`, `source_type`, `platform`, `total_packages`, `install_method`, `api_endpoint`, `description`, `last_synced_at`, **`is_custom`** (auto-migrated, db.ts:57-67), **`sync_state`** (auto-migrated JSON for resumable sync, db.ts:69-78).
- **`packs`** — capability bundles. Columns (types.ts `MarketplacePack`): `id`, `slug`, `display_name`, `description`, `target_roles`, `icon`, `priority` (`core|recommended|optional`), `connectors_needed` (JSON), `created_at`.
- **`pack_packages`** — pack↔package join with `is_core` flag (db.ts:191-194).
- **`installations`** — **THE install-state source of truth for marketplace packages** (db.ts:350-404). Columns (types.ts `Installation`): `id`, `package_id` (FK), `installed_version`, `installed_at`, `install_path`, `status` (`installed|updating|failed|uninstalled`), `config` (JSON — secret VALUES redacted to `[redacted]`, keys kept; installer.ts:164-173). **No `workspace_id`.**
- **`scan_history`** — append-only security scan log (installer.ts:644-659): `package_id`, `scanned_at`, `overall_severity`, `security_score`, `content_hash`, `engines_used`, `findings`, `blocked`, `scan_duration_ms`, `triggered_by`.

### Install-state API on `MarketplaceDB` (the methods a sync store would call)

- `recordInstallation(packageId, version, installPath, config)` → inserts `installations` row, `status='installed'` (db.ts:350).
- `isInstalled(packageId): boolean` → `SELECT 1 FROM installations WHERE package_id=? AND status='installed'` (db.ts:390). **This is the per-package installed check.**
- `markUninstalled(packageId)` → flips status to `'uninstalled'` (db.ts:400).
- `listInstallations(): InstalledPackageRow[]` → joins `installations` ⋈ `packages` for `status='installed'`, ordered by `installed_at DESC` (db.ts:376).
- `getInstalledCount(): number` → **global** count of `status='installed'` rows (db.ts:500). This is the only existing "count bar" primitive — **not workspace-aware**.
- `getPackage(id)` / `getPackageByName(name)` — by numeric id / string name.
- `search(SearchOptions): SearchResult` — FTS5 + faceted filters; returns `{ packages, total, facets:{types,categories,sources}, installedCount }` (db.ts:86-165). `installedCount` here is the global `getInstalledCount()`.

---

## 2. List/search/install/uninstall APIs (`packages/server/src/local/routes/marketplace.ts`)

Registered as `marketplaceRoutes(fastify)` (server/local/index.ts:95). Every route gates on `fastify.marketplace` (the decorated `MarketplaceDB|null`, index.ts:506); `requireDb()` returns **503** if absent.

| Method · Route | Purpose | Tier gate | Notes |
|---|---|---|---|
| `GET /api/marketplace/search` | FTS5 + facet search of the catalog | none | Annotates each pkg with `installed: db.isInstalled(pkg.id)`, `scanStatus`, `scanScore`; appends `categories: PACKAGE_CATEGORIES` (marketplace.ts:57-118). **This is the grid's read.** |
| `GET /api/marketplace` (bare alias) | S21 alias → injects into `/search`; accepts 6-domain `type` facet; returns honest empty `{federated:true}` for non-marketplace domains | none | `extend.ts:49-85`. **This is what the current FE `adapter.getMarketplace()` calls.** |
| `GET /api/marketplace/packs` · `/packs/:slug` | List packs / pack detail | none | marketplace.ts:123-146 |
| `GET /api/marketplace/enterprise-packs` | KVARK-gated packs | `requireTier('ENTERPRISE')` | marketplace.ts:152 |
| **`POST /api/marketplace/install`** | **Install a package by numeric `packageId`** | `requireTier('PRO')` | marketplace.ts:181-432. SecurityGate pre-scan (heuristics-only) → severity gating (CRITICAL=403 always; HIGH=403 unless `force`; MEDIUM/LOW proceed) → `MarketplaceInstaller.install()` → audit rows. Returns `{...InstallResult, security:{...}}`, **200** on success / **422** on fail / **403** on block. |
| `POST /api/marketplace/uninstall` | Uninstall by `packageId` | none | marketplace.ts:437-470. For MCP packages ALSO tears down the live runtime + `<dataDir>/.mcp.json` (else it resurrects at boot). |
| `GET /api/marketplace/installed` | `listInstallations()` | none | marketplace.ts:475 |
| `POST /api/marketplace/security-check` | Scan-only by id | none | marketplace.ts:486 |
| `GET/POST/DELETE /api/marketplace/sources` | Source CRUD + sync-on-add | none | marketplace.ts:525-641 |
| `GET /api/marketplace/categories` | `PACKAGE_CATEGORIES` taxonomy (21 cats) | none | marketplace.ts:646 — feeds the category filter |
| `POST /api/marketplace/sync` | Manual sync from sources | none | marketplace.ts:655 |
| `GET /api/marketplace/security-status` | Cisco scanner availability + aggregate scan counts | none | marketplace.ts:712 |
| `POST /api/marketplace/publish` | Publish a local skill into the catalog | `requireTier('PRO')` | marketplace.ts:764 |

**Tier note for the §09 "one-click install":** `POST /api/marketplace/install` is **PRO-gated**. The skill "Add (instant)" micro-state in the contract collides with PRO-gating unless the install path for FREE-tier skills differs. The MCP path (`/api/mcps/install`) is also PRO. Connector connect (`/api/connectors/:id/connect`) is **ungated**.

---

## 3. Installer flow per type (`packages/marketplace/src/installer.ts`)

`MarketplaceInstaller.install(request: InstallRequest)` (installer.ts:81) is the **single dispatch entrypoint** for skill/plugin/mcp. Flow:
1. `db.getPackage(packageId)` → 404-shaped result if missing.
2. Idempotency: if `!force && db.isInstalled(pkg.id)` → returns success "already installed" (installer.ts:96).
3. **Security gate** (`SecurityGate.scan`) on resolved content → `recordScanResult()` → if `blocked && !forceInsecure` returns blocked result (installer.ts:116-130).
4. **Dispatch on `pkg.waggle_install_type`** (installer.ts:137):
   - **`skill`** → `installSkill()` (installer.ts:309): writes `~/.waggle/skills/{name}.md` from `manifest.skill_content` / `skill_url` / repo `SKILL.md` / generated stub; then `PUT /api/skills/{name}` notify. **Instant** (matches §09 "Add→Added instant").
   - **`plugin`** → `installPlugin()` (installer.ts:367): mkdir `~/.waggle/plugins/{name}/`, git-clone or `npm install`, write `plugin.json`, install bundled skills, update `registry.json`, run post-install hooks, `POST /api/plugins/install` notify. Slow / multi-step.
   - **`mcp`** → `installMcp()` (installer.ts:489): optional `npm install -g`, apply settings to env, write the server entry into `<dataDir>/.mcp.json` (`mcpConfigPath()` = `WAGGLE_DATA_DIR/.mcp.json`, installer.ts:47). **Does NOT start the runtime** — that is the `/api/mcps/install` route's job (mcps.ts:277-294). (§09 "Enable→Enabling→Enabled" = install + runtime start.)
5. On success: `db.recordInstallation()` (with redacted setting keys) and attaches `scanResult`.

`uninstall(packageId)` (installer.ts:256) mirror-dispatches: `uninstallSkill` (rm file + DELETE notify), `uninstallPlugin` (rmdir + registry + DELETE), `uninstallMcp` (remove from `.mcp.json`), then `db.markUninstalled()`.

**Notify pattern:** the installer best-effort POSTs to `API_BASE` (`WAGGLE_API_URL` || `http://localhost:3000`, installer.ts:52) — fire-and-forget, swallows failure (installer.ts:764). Note the default port 3000 vs the running dev sidecar; relevant if a sync store relied on the notify hook firing.

---

## 4. The three install-state stores in detail (the "sync" problem)

The §09 CRITICAL line — *"one store powers the grid, the agent picks, AND the inline card … installing in any view reflects in all"* — has no backend equivalent. The three stores:

### 4a. Marketplace packages (skill/plugin/mcp) — `installations` table
- Truth: `MarketplaceDB.isInstalled(packageId: number)`. Keyed by **numeric package id**.
- Read surfaces: `/api/marketplace/search` (annotates `installed`), `/api/marketplace/installed`.

### 4b. MCP runtime — `<dataDir>/.mcp.json` ⋈ `McpRuntime` (`routes/mcps.ts`)
- Truth: `GET /api/mcps` (mcps.ts:143) = `MCP_CATALOG` (from `@waggle/shared`) ⋈ persisted `.mcp.json` entries ⋈ live `runtime.getServerStates()`. Keyed by **string server name**. `installed = name ∈ (persisted ∪ runtime)`.
- Statuses: `installed | running | error | stopped` (mcps.ts:67 `toInstanceStatus`).
- `POST /api/mcps/install` (mcps.ts:189) **delegates to `/api/marketplace/install`** via `fastify.inject`, then registers + `start()`s the runtime server (8s budget). So an MCP "install" touches BOTH 4a and 4b. **This is the closest thing to a working cross-store sync** — but it is MCP-specific and one-directional.
- **Workspace tag:** `PATCH /api/mcps/:id/permissions` sets a single `workspaceId` (C19 — "single-workspace scoping v1", mcps.ts:535). This is the ONLY place a "workspace" appears in install state, and it is a *scope filter on tool exposure*, not an install-presence scoping.

### 4c. Connectors — Vault (`routes/connectors.ts`)
- Truth: presence of a vault credential under `connector:{id}` (`fastify.vault.getConnectorCredential(id)`). "Connected" = credential exists & not expired.
- Read: `GET /api/connectors` → `connectorRegistry.getDefinitions()` (a STATIC catalog of all connectors) + `GET /api/connectors/:id/health` for live `connected|disconnected|expired|error` status.
- Install verb: `POST /api/connectors/:id/connect` — stores token→vault (matches §09 "token → vault"), re-inits the connector, writes audit. **Ungated.** Disconnect/revoke purge vault + OAuth tokens.
- **Connectors are NOT in `marketplace.db` at all.** They never appear in `installations`/`isInstalled`. The §09 grid showing connectors alongside skills/MCP must federate from `/api/connectors`.

### 4d. The unifying write-side feed — `install_audit` (the one cross-type thing that exists)
- `fastify.auditStore` (`@waggle/core` `install-audit.ts`) writes to table `install_audit` (schema.ts:135-152). All three stores already write here on install/uninstall/connect/revoke (marketplace.ts, mcps.ts `recordMcpAudit`, connectors.ts `recordConnectorAudit`).
- **Read:** `GET /api/extend/audit` (extend.ts:88) — ONE shared feed across `native|skill|plugin|mcp|connector|marketplace` with `?type=` / `?capability=` filters. The `AuditStore` API: `getRecent(limit)`, `getRecentByType(type, limit)`, `getByCapability(name)`.
- **CRITICAL GAP for the count bar:** `install_audit` has **NO `workspace_id` column** (schema.ts:135-152 — confirmed; `ai_interactions`/`execution_traces` DO have it at schema.ts:174/219, install_audit does not). It is an append-only event log, not a "current installed set." A "N in this workspace" count therefore has **zero backing data** today.

---

## 5. The install-audit trail (what's already auditable)

`RecordAuditInput` fields (used by all three route files): `capabilityName`, `capabilityType` (`native|skill|plugin|mcp|connector|marketplace`), `source`, `riskLevel` (`low|medium|high|critical`), `trustSource` (`builtin|starter_pack|local_user|third_party_verified|third_party_unverified|unknown|security-gate`), `approvalClass` (`standard|elevated|critical|blocked`), `action` (`proposed|approved|installed|rejected|failed|blocked|uninstalled`), `initiator` (`agent|user|system`), `detail`. CHECK constraints in schema.ts:143-150 enforce these — **adding a value (e.g. a `synced` action or a `workspace_id`) is a migration + CHECK change**, and the file warns these drifted once and crashed `acquire_capability` (schema.ts:139-142). Treat the audit vocabulary as a contract.

The marketplace install route writes audit rows for CRITICAL-block / HIGH-block / HIGH-force-override / MEDIUM / LOW / blocked-by-installer / forceInsecure-override (marketplace.ts:222-415) — a thorough trust trail, all global.

---

## 6. Exact integration points a PR4 "sync store" would hook into

**Reads (catalog + installed-state):**
- `GET /api/marketplace/search` (grid; annotates `installed` per pkg) — or the bare `GET /api/marketplace?type=` alias the FE already uses.
- `GET /api/marketplace/installed` → `MarketplaceDB.listInstallations()`.
- `GET /api/mcps` (catalog ⋈ persisted ⋈ runtime; `installed` + `status`).
- `GET /api/connectors` + `GET /api/connectors/:id/health` (connector connected-state).
- `GET /api/marketplace/categories` (the All/Skills/Connectors/MCP filter taxonomy).
- `GET /api/extend/audit` (the existing cross-type unified feed — the natural read for a "what's installed across everything" view, modulo it being a log).

**Install verbs (the three one-click flows):**
- skill / plugin → `POST /api/marketplace/install` `{ packageId }` (PRO). FE adapter: `adapter.installMarketplacePackage(packageId)` → `/api/marketplace/install` (adapter.ts:1339).
- mcp → `POST /api/mcps/install` `{ mcpId, settings, force }` (PRO) — delegates to marketplace install + runtime start; uninstall via `POST /api/mcps/:id/revoke`.
- connector → `POST /api/connectors/:id/connect` `{ token|apiKey }` (token→vault); disconnect `POST /api/connectors/:id/disconnect`, strong revoke `POST /api/connectors/:id/revoke`.

**Installer functions (package layer, if the store goes below the routes):**
- `MarketplaceInstaller.install(InstallRequest)` / `.uninstall(packageId)` / `.installPack(slug)` (installer.ts:81/256/210).
- `MarketplaceDB.isInstalled(id)` / `recordInstallation(...)` / `markUninstalled(id)` / `getInstalledCount()` / `listInstallations()` (db.ts).

**Server decoration:** `fastify.marketplace: MarketplaceDB | null` (index.ts:506); `fastify.connectorRegistry`, `fastify.vault`, `fastify.auditStore`, `fastify.agentState.mcpRuntime` are the sibling singletons a unified store would coordinate.

**Current FE consumer to refactor:** `apps/web/src/components/os/apps/MarketplaceApp.tsx` (417 LOC) — already federates 6 domains at read (skill via `getMarketplace`, packs, mcp via `getMcps`+`getMarketplace`, persona, connector via `getConnectors`, model, template) but holds install state in **local `useState extensions[]`**; install just patches the row (`installed: true`) — **no shared store, no cross-view propagation.** View-model federation already lives in `apps/web/src/lib/extension-catalog.ts`.

---

## 7. Key deltas vs the §09 contract (territory, not plan)

1. **No single install store.** Three stores (marketplace `installations` / `.mcp.json`+runtime / vault), three key types (numeric id / string name / string id), three install verbs, three tiers (PRO / PRO / ungated). The §09 "one store … reflects in all" is the central build.
2. **No workspace scoping of install state.** `installations` and `install_audit` have no `workspace_id`; vault is global; only MCP carries a single optional `workspaceId` *tool-scope* tag. The "N in this workspace" count bar has no data source — needs either a new scoping dimension or redefinition to a global count.
3. **No agent-suggestion endpoint.** The §09 "agent-suggestion box (connector + skill + tool, each with a why)" has no backing route. FTS search (`/api/marketplace/search`) + the agent's `acquire_capability` path (the verbose-`need` FTS handling in db.ts:91-99 / `toFtsMatchQuery`) is the nearest substrate, but a "recommend one of each kind with a reason" composite does not exist.
4. **No inline-in-chat picker route.** Variation B (mid-conversation connector offer with vault-aware approval) reuses the same install verbs but has no dedicated surfacing/approval endpoint; the connector connect flow + the existing approval/confirmation machinery (`routes/approval.ts`, agent `confirmation.ts`) are the substrate.
5. **Connectors absent from `marketplace.db`.** Any unified grid must federate connectors from `/api/connectors`, not from the marketplace catalog — they share no row shape with `MarketplacePackage`.
6. **Audit feed is a log, not a set.** `GET /api/extend/audit` unifies *events* across types but cannot answer "what is currently installed in workspace W" without scanning + reducing; the count bar wants a live set.

---

## 8. Risks / sharp edges for a builder

- **Schema DDL is invisible.** The `packages`/`sources`/`packs`/`installations`/`scan_history` tables exist only inside the committed `marketplace.db` seed binary — there is no `CREATE TABLE` in TS. Adding a `workspace_id` to `installations` means a runtime `ALTER TABLE` migration in `MarketplaceDB.migrateSchema()` (the established pattern, db.ts:57-78), not an edit to a schema file.
- **`install_audit` CHECK constraints are a hard contract.** Adding a `synced` action or any new vocabulary needs a coordinated `runMigrations()` + CHECK rewrite; schema.ts explicitly records a prior drift that crashed `acquire_capability`.
- **PRO-gating vs "instant Add".** Skill install is PRO-gated server-side; the §09 instant micro-state must reconcile with `requireTier('PRO')` (or rely on a different non-gated skill path).
- **MCP install is the only working cross-store coupling** (`/api/mcps/install` writes both `installations` and `.mcp.json`+runtime, and revoke keeps marketplace `installed` honest, mcps.ts:509-519). A unified store should mirror this bidirectional bookkeeping for the other types, or it will drift (the FE will show "installed" after a revoke, etc.).
- **OSS-sync constraint (§7.5):** `install_audit` DDL inside `mind/schema.ts` is OSS-excluded (Waggle governance). A `workspace_id` addition there has nowhere to land on the public mirror — fine for the monorepo, but flag it as a curated-strip item.
- **Three-store consistency under failure.** The installer's `notify` hook is fire-and-forget to `localhost:3000` (not the running sidecar port); a sync store cannot rely on the notify callback to invalidate caches.

---

## 9. Open questions for the founder/lead

1. **Workspace scoping:** Is "N in this workspace" a real per-workspace install set (requires a new `workspace_id` on installs + per-workspace activation model), or a relabeled global count for v1? This is the single biggest decision — it determines whether the sync store needs a new data dimension across all three backends.
2. **Skill install tier:** Should the §09 instant skill "Add" stay PRO-gated, or is there a FREE skill-install lane? (CLAUDE.md moat: skills/connectors are the upgrade trigger — so PRO-gating may be intentional and the "Add" CTA should show the upgrade nudge instead of installing.)
3. **Agent-suggestion box:** Build a new composite recommend endpoint (one connector + one skill + one tool + "why"), or compose it client-side from three `search` calls + an LLM rationale? No backing route exists either way.
4. **Sync store location:** A FE-only store (React context / Zustand over the existing routes) vs a new server-side unified `/api/install-state` read that reduces all three stores into one shape. The §09 "one store reflects in all" is achievable purely client-side IF every view subscribes to it; a server read is only needed for the count bar's correctness across reloads.
5. **Inline-in-chat (Variation B):** Reuse `/api/connectors/:id/connect` + existing approval machinery, or a dedicated in-chat install/approval contract? Decide before building the chat surface.
