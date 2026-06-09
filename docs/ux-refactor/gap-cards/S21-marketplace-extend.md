# Gap Card — S21 · Marketplace / Extend

> Execution model: **in-place incremental refactor** of `apps/web` + targeted backend extensions.
> Mockups directional only (PRD §24). PRD acceptance criteria win over pixels.
> Every claim grounded in real files (paths + lines below).

---

## 1. Screen & purpose

**Screen 21 — Marketplace / Extend Waggle** (PRD §12.13, lines 648-662; blueprint catalog row 21, `_blueprint_extracted.txt:432-439`).

The central, power-user extension surface. PRD §10.4 names the Extend layer as **Connectors, MCPs, Models, External tools, Marketplace** — S21 is the *Marketplace* node of that layer: a single place to discover, install, update, risk-approve, and audit **extensions of six kinds** (Skills, Agents, Connectors, MCPs, Models, Templates) without "hunting through settings" (PRD §12.13 acceptance criterion). It is the funnel for the PRO upgrade trigger (skills + connectors + marketplace are gated to PRO; `05g-subsystem-skills-marketplace-wiki.md:3`).

This card scopes the **Marketplace browse/install/audit** surface specifically. The sibling Extend surfaces — Connector Hub (S? / §12.7), MCP Hub (§12.8), Skills Hub (§12.6) — are separate screens that this one cross-links to; their per-domain CRUD lives in their own cards. S21 is the unified catalog + governance view across all extension types.

---

## 2. Required states (PRD / Blueprint)

**Functional requirements (PRD §12.13):**
- Categories: **Skills, Agents, Connectors, MCPs, Models, Templates** (6 facets).
- Search / filter / sort by **category, trust, popularity, source, risk**.
- Show per-item lifecycle: **installed, update available, risk approval (required), install failed**.
- Install actions **write to install audit**.
- Support **workspace / team scoping** of installs.

**Extension lifecycle states (PRD §14.7, lines 906-914):**
`Available · Installed · Update available · Installing · Failed install · Risk approval required · Disabled/revoked`.

**Acceptance criterion (PRD §12.13):** "Power users can extend Waggle without hunting through settings." Cross-cuts to §12.8 MCP acceptance ("powerful but always visible, scoped, auditable, and reversible") and the install-audit governance theme (`_blueprint_extracted.txt:43-45,95`: install audit is the "best basis for Extend governance").

**Journeys touching S21:** J8 install connector, J9 install MCP (audit recorded), J25 marketplace update → review changelog/risk (`_blueprint_extracted.txt:203,206,252`).

**Mockup (directional):** `screens_18_21_builders_and_marketplace.png` shows S21 as a card-grid catalog with a left category rail and per-card install affordances + trust badges — consistent with the spec; not a pixel target.

---

## 3. Current state in repo

**Disposition: `rework`** (the existing surfaces are reusable substrate but neither satisfies §12.13 — the catalog is hardwired to 3 of 6 categories and there is no unified Extend view with trust/risk/popularity/scope filters).

Marketplace is **doubly represented today** (frontend.md §f flags this as an IA cleanup point):

1. **`apps/web/src/components/os/apps/MarketplaceApp.tsx`** (258 lines, fully read) — standalone browser. Two tabs (`'search' | 'installed'`, `:26`). Calls `adapter.searchMarketplace` / `getMarketplaceInstalled` / `installMarketplacePackage` / `uninstallMarketplacePackage`. Renders a flat package list with a `scanBadge` (passed/failed Shield/AlertTriangle, `:141-145`), `installed` check, type/category/source chips (`:223-227`), and 403→`waggle:tier-insufficient` UpgradeModal routing (`:108-117`). **Registered in `Desktop.tsx`** appConfig `marketplace` (`Desktop.tsx:93`) + `renderAppContent` case (`:347`), but **NO dock entry points at it** — `dock-tiers.ts:67` comment: "Marketplace already a tab inside Skills & Apps — no separate dock entry". So `MarketplaceApp` is currently reachable only via `waggle:open-app` events, effectively orphaned.

2. **`apps/web/src/components/os/apps/CapabilitiesApp.tsx`** (478 lines, fully read) — "Skills & Apps", the live Extend surface (dock key `skills` → appId `capabilities`, `dock-tiers.ts:64`). 5 tabs: `installed | starter | marketplace | tools | audit` (`:80,358`). The `marketplace` tab lists `SkillPack`s via `getMarketplacePacks`; the `audit` tab (`AuditTab`, `:15-58`) reads `GET /api/audit/installs` and renders name/source/outcome/timestamp rows. It has a pack-detail drawer (`PackDetail`, `:249-334`) with trust label + bundled-skills + install. This is *pack-oriented* (curated bundles), not the faceted *package catalog* of §12.13.

**Backend already present (more than the inventory claimed):**
- Full marketplace route family: `packages/server/src/local/routes/marketplace.ts` — `search` (FTS5 + faceted, `:56`), `packs`, `packs/:slug`, `enterprise-packs` (ENTERPRISE), `install` (PRO + SecurityGate, `:180`), `uninstall` (`:377`), `installed` (`:396`), `security-check`, `sources` GET/POST/DELETE (`:446,457,533`), `categories` (`:567` → `PACKAGE_CATEGORIES`), `sync`, `security-status`, `publish` (PRO, `:685`). Sort facet supported via `?sort=` (`:72`).
- **Install-audit READ route EXISTS** — `GET /api/audit/installs` at `packages/server/src/local/routes/skills.ts:685-703` (returns normalized `{ entries: [{ capabilityName, capabilityType, source, riskLevel, trustSource, approvalClass, action, initiator, detail }] }`). **This corrects substrate-types.md §d gap #1, which claimed "No HTTP endpoint surfaces the audit trail."** The write path is live too (`marketplace.ts:224-319` records every SecurityGate verdict; `skills.ts:212,315,475`). `adapter.getAuditInstalls` already wires it (frontend.md, adapter `Misc`).
- Install-audit store: `packages/core/src/install-audit.ts` — `AuditCapabilityType = native|skill|plugin|mcp|connector|marketplace` (`:22`), full enums for action/trust/approval/risk; read API `getRecent/getByCapability/getByAction/getAll`.

**Critical limitation (grounded):** the marketplace catalog **only supports 3 install kinds** — `InstallationType = 'skill' | 'plugin' | 'mcp'` (`packages/marketplace/src/types.ts:185`), confirmed by `05g-subsystem-skills-marketplace-wiki.md:11` ("three installable package kinds — `skill`, `plugin`, `mcp`"). PRD §12.13 demands **six categories incl. Agents, Connectors, Models, Templates**, which have **no catalog representation today** (connectors are a separate `/api/connectors` registry with only `connect`/`disconnect`; templates are `/api/workspace-templates`; agents are personas/groups; models are `/api/litellm/models` + providers). So S21's "one catalog, six categories" is the central rework: a **federated catalog read** over the existing marketplace catalog + connector registry + template store + persona/agent catalog + model list, NOT a new package table.

---

## 4. Frontend work

**Strategy:** Consolidate the two marketplace surfaces into ONE Extend/Marketplace screen, retire the orphaned standalone, and give the new screen a federated faceted catalog. Keep `CapabilitiesApp`'s Skills-pack flow as the Skills facet; promote a real dock entry.

**Components to create:**
- `apps/web/src/components/os/apps/MarketplaceApp.tsx` — **rework in place** (reuse the file/appId so Desktop wiring + tests survive). Expand from 2 tabs to the §12.13 model: a left **category rail** (Skills / Agents / Connectors / MCPs / Models / Templates / All) + a top **filter bar** (trust, popularity, source, risk dropdowns + search) + a **catalog grid**. Reuse the existing `scanBadge`, 403→UpgradeModal routing (`:108-117`), and install/uninstall handlers verbatim.
- `apps/web/src/components/os/apps/extend/ExtensionCard.tsx` (new) — one card type rendering the §14.7 lifecycle badge (Available/Installed/Update available/Installing/Failed/Risk-approval/Disabled), trust chip, risk chip, source, popularity. Props: `{ ext: Extension; onInstall; onUpdate; onRevoke; onOpenDetail }`.
- `apps/web/src/components/os/apps/extend/ExtensionDetail.tsx` (new, or generalize `CapabilitiesApp`'s `PackDetail` `:249-334`) — detail drawer with permissions/scope, changelog (for "update available", J25), risk approval CTA, install-audit trail for this item (via `getAuditInstalls` filtered client-side, or a new `?capability=` query — see §5).
- `apps/web/src/components/os/apps/extend/InstallAuditPanel.tsx` (new, or lift `CapabilitiesApp`'s `AuditTab` `:15-58`) — shared Extend governance trail; reused by S21 + Connector/MCP hubs.
- `apps/web/src/lib/extension-catalog.ts` (new pure module + co-located `.test.ts`) — client-side **federation/normalization**: merge marketplace packages (`searchMarketplace`), connectors (`getConnectors`), templates (`getWorkspaceTemplates`), personas/groups (`getPersonas`/`getAgentGroups`), models (`getModels`/`getProviders`) into one `Extension[]` with a unified `{ type: ExtensionType, trust, risk, installed, updateAvailable, source, popularity }` shape; derive lifecycle state. Keeps the fat federation logic out of the component (file-org rule: many small files).

**Reuse targets:** `MarketplaceApp` install/uninstall + 403 handler; `CapabilitiesApp` `PackCard`/`PackDetail`/`AuditTab` + `lib/skill-pack-display.ts` (`describeTrust`, `summariseSkills`) + `lib/dedupe-packs.ts`; `components/ui/*` (card/badge/tabs/input/select/tooltip); `HintTooltip`.

**Adapter methods/hooks:** existing — `searchMarketplace`, `getMarketplacePacks`, `getMarketplaceInstalled`, `installMarketplacePackage`, `uninstallMarketplacePackage`, `getAuditInstalls`, `getConnectors`, `getWorkspaceTemplates`, `getPersonas`, `getModels`, `getProviders` (all in `lib/adapter.ts`, per frontend.md §c). **New adapter methods** to add for the §16.9 gaps: `getMcps`, `installMcp`, `testMcp`, `revokeMcp`, `syncConnector`, `revokeConnector` (see §5). New hook `hooks/useExtensions.ts` wrapping `extension-catalog.ts` (catalog + filters + install/update/revoke actions + react-query caching).

**IA cleanup (frontend.md §f):** decide one home for marketplace. Recommended: keep `MarketplaceApp` as the dedicated S21 Extend surface, add a real dock entry under the `extend` zone-parent (`dock-tiers.ts:62-71`), and have `CapabilitiesApp`'s `marketplace` tab deep-link into it (or drop that tab) to remove the double representation.

---

## 5. Backend work (PRD §16.9 endpoint-by-endpoint)

| PRD §16.9 endpoint | Status | EXTEND vs NET-NEW + substrate / .mind |
|---|---|---|
| `GET /api/connectors` | **EXISTS** | `connectors.ts:6`. No change. |
| `POST /api/connectors/:id/connect` | **EXISTS** | `connectors.ts:55`. No change. |
| `POST /api/connectors/:id/sync` | **MISSING** | **NET-NEW** thin action in `connectors.ts` (re-init/re-fetch from connected service). Touches connector credential resolution (vault) + connector definition; record an audit entry (`auditStore.record`, type `connector`). No `.mind` migration. |
| `POST /api/connectors/:id/revoke` | **PARTIAL** | **EXTEND** — alias to existing `POST /api/connectors/:id/disconnect` (`connectors.ts:107`, removes vault creds + sub-keys). Same intent, add `/revoke` route delegating to disconnect + write a `revoked` audit entry. |
| `GET /api/mcps` | **PARTIAL** | **EXTEND/NET-NEW** — no `/api/mcps`. MCP catalog lives in `@waggle/shared mcp-catalog.ts`; installed MCPs surface inside `GET /api/capabilities/status` (`mcpServers[]`) and the marketplace catalog (`waggle_install_type:'mcp'`, `marketplace/src/mcp-registry.ts`). Add a dedicated `GET /api/mcps` route that joins catalog + installed-state + `.mcp.json`. Reads existing substrate; no migration. |
| `POST /api/mcps/install` | **PARTIAL** | **EXTEND** — route through the existing marketplace installer (`POST /api/marketplace/install`, which already handles `installType:'mcp'` → writes `.mcp.json`, `installer.ts:580`). Add an MCP-specific endpoint that resolves an MCP id → marketplace package → install, OR keep marketplace install as the single path and have the FE call it. Audit already recorded. |
| `POST /api/mcps/:id/test` | **MISSING** | **NET-NEW** — no MCP health/test route. Closest analog is `GET /api/connectors/:id/health` (`connectors.ts:16`). Add an MCP test route (spawn/handshake the MCP server, report ok/error). No `.mind`. |
| `POST /api/mcps/:id/revoke` | **MISSING** | **NET-NEW** — no MCP revoke-by-id. Closest: `DELETE /api/plugins/:name` (`skills.ts`). Add an MCP revoke route (remove from `.mcp.json` + record `revoked` audit). |
| `GET /api/marketplace` | **PARTIAL** | **EXTEND** — bare path = alias of `GET /api/marketplace/search` with default params (`marketplace.ts:56`). Add alias or accept both. |
| `POST /api/marketplace/install` | **EXISTS** | `marketplace.ts:180` (PRO + SecurityGate). No change. |

**Plus implied additions for §12.13 (not in §16.9's list but required by FRs):**
- **Six-category catalog.** The §12.13 categories (Agents/Models/Templates) have **no marketplace representation** (`InstallationType` is `skill|plugin|mcp` only, `types.ts:185`). Two options: (a) widen `InstallationType` + catalog schema to add `agent|model|template` (a marketplace-DB change in `packages/marketplace`, NOT a `.mind` migration — `marketplace.db` is a separate SQLite store) and seed registries; or (b) **federate at read time** (preferred for incremental scope) — the FE `extension-catalog.ts` merges marketplace (skill/plugin/mcp) + `/api/connectors` + `/api/workspace-templates` + `/api/personas`+`/api/agent-groups` + `/api/litellm/models`. Option (b) needs **no backend change** beyond §16.9; option (a) is a later phase if a true unified catalog with publish/install for all 6 kinds is wanted.
- **Install-audit read for Extend governance.** **EXISTS** — `GET /api/audit/installs` (`skills.ts:685`). (Substrate inventory §d#1 said missing; it is present.) **Optional EXTEND:** add a `?capability=` / `?type=` filter param so the detail drawer can show per-item history without client-side filtering (currently only `?limit=`). The store already has `getByCapability()` (`install-audit.ts:125`) — just expose it.
- **Workspace/team scoping of installs (§12.13).** No per-workspace install scoping exists today (installs are global to `~/.waggle/`). This is net-new product surface; recommend deferring to Phase 4 polish (PRD §22 risk register flags "marketplace scope creep" — `PRD:1435` — "Start with catalog + install audit, postpone billing/public marketplace").

**`.mind` migration flag:** none required for S21. The audit table (`install_audit`) already exists in both DDL sites (`install-audit.ts:54` + `schema.ts:119`). **Latent bug to flag (substrate-types §d#2):** `AuditRiskLevel` TS includes `'critical'` (`install-audit.ts:16`) but both DDL CHECKs only allow `('low','medium','high')` (`install-audit.ts:65`, `schema.ts:130`) — a `record({riskLevel:'critical'})` throws. The marketplace route sidesteps it (maps CRITICAL→`high`+`blocked`, `marketplace.ts:228`). If S21 surfaces a true "critical risk approval" state that writes `critical`, this CHECK must be widened first (idempotent ADD/relax via the migration runner's ADD-COLUMN pattern, `mind/db.ts:116`).

---

## 6. Shared types needed (PRD §15 vs `lib/types.ts`)

- **`ExtensionType`** (PRD §15.2, line 953: `'skill' | 'connector' | 'mcp' | 'model' | 'template' | 'external_tool'`) — **MISSING** from `apps/web/src/lib/types.ts` (substrate-types §e). Add. Note PRD union has `external_tool` but §12.13 categories say "Agents" not "external_tool" — **reconcile**: §12.13 needs an `'agent'` category; PRD §15.2 `ExtensionType` lacks `agent` and adds `external_tool`. Flag as open question; likely the union should be `skill|agent|connector|mcp|model|template` (+ optional `external_tool`).
- **`Extension` interface** (new) — `{ id, name, description, type: ExtensionType, trust: AuditTrustSource-ish, risk: AuditRiskLevel, source, popularity?, version?, installed, updateAvailable, lifecycle: 'available'|'installed'|'update_available'|'installing'|'failed'|'risk_approval'|'disabled', scope?: Scope }`. No PRD §15 interface spells this out; derive from §12.13 + §14.7.
- **`Scope`** (PRD §15.2: `'personal'|'workspace'|'team'|'organization'`) — **MISSING**, needed for install scoping; add (shared with other Extend/Memory cards).
- Existing FE `MarketplacePackage` (local interface in `MarketplaceApp.tsx:8-18`) and `SkillPack` (`types.ts`) are narrower than `Extension`; `extension-catalog.ts` normalizes both into `Extension`.
- Reuse the canonical audit enums (`AuditTrustSource`, `AuditRiskLevel`, `AuditCapabilityType` from `packages/core/src/install-audit.ts:16-22`) rather than re-declaring trust/risk literals in the FE — export them or mirror minimally.

---

## 7. Dependencies (screens / phases first)

- **PRD phasing:** Extend layer = **Phase 4 / Sprint 7** (`PRD:241-245,1353-1357`). Comes after Work (Home/Workspace), Intelligence (Agents/Skills), so S21 should land in that phase.
- **Depends on / cross-links:**
  - Connector Hub (§12.7) and MCP Hub (§12.8) screens — S21 federates their catalogs and shares the `InstallAuditPanel`; their `/sync`/`/revoke`/`/test` backend routes (§5) are shared deliverables.
  - Skills Hub (§12.6) — S21's Skills facet reuses `CapabilitiesApp`'s pack flow.
  - Agent Center (§12.9), Models (Settings→Models), Templates (workspace-templates) — needed as catalog sources for the 6-category federation.
  - Dock IA refactor (`dock-tiers.ts` Extend zone) — S21 needs a real dock entry (currently none).
  - UpgradeModal / tier gating (`waggle:tier-insufficient` event) — already wired; reuse.
- **Blocks:** nothing downstream; it is a leaf surface.

---

## 8. Effort

**L.** The frontend rework is moderate (consolidate 2 surfaces → 1 faceted catalog + extract shared `ExtensionCard`/`InstallAuditPanel` + new `extension-catalog.ts` federation). What pushes it to L: the **6-category federation** spans five different backend domains (marketplace, connectors, templates, personas/agents, models) each with a different shape, plus **6 net-new/extend §16.9 routes** (connector sync/revoke, mcps list/install/test/revoke) and the FE/BE type reconciliation. Not XL because no `.mind` migration, no new data store (federate-at-read), audit read route already exists, and install/uninstall + tier-gating + audit-trail plumbing are all already live.

---

## 9. Open questions

1. **`ExtensionType` reconciliation.** PRD §12.13 categories = Skills/Agents/Connectors/MCPs/Models/Templates (6, incl. **Agents**). PRD §15.2 `ExtensionType` = skill/connector/mcp/model/template/**external_tool** (6, incl. external_tool, **no agent**). Which is canonical — add `agent`, keep `external_tool`, or both (7)?
2. **Federate-at-read vs unified catalog table.** Ship S21 by federating existing domains client-side (no marketplace-DB change, fast), or invest in widening `InstallationType` + `marketplace.db` to natively catalog all 6 kinds (enables publish/install/version-tracking parity for agents/models/templates)? Recommend federate-first; revisit per §22 "postpone public marketplace".
3. **Install scoping (§12.13 "workspace/team scoping").** Installs are global to `~/.waggle/` today. Is per-workspace/per-team install scoping in scope for Phase 4, or deferred (it implies new persisted scope state on every installed capability)?
4. **"Update available" + changelog (J25).** No version/changelog tracking exists for installed packages beyond a `version` column on the marketplace package. Where does the "update available" signal come from — catalog sync diffing installed version vs latest, or a new field?
5. **MCP test semantics.** `POST /api/mcps/:id/test` — does "test" mean spawn-and-handshake the MCP server (live), or static manifest/permission validation? Affects whether it can run without launching a process.
6. **Should `MarketplaceApp` or `CapabilitiesApp` be the canonical S21 home** (IA double-representation, frontend.md §f)? Recommend `MarketplaceApp` reworked + real dock entry; `CapabilitiesApp` keeps Skills/Tools/Audit and drops its `marketplace` tab.
