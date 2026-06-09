# Gap Card — S07 · Connector Hub

> Execution model: **in-place incremental refactor** of `apps/web` + targeted backend extensions.
> PRD acceptance criteria win over the (directional) mockup. Every claim below is grounded in real files.
> PRD = `docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_UX_Refactor_PRD.md`.

## 1. Screen & purpose

**Connector Hub** (PRD §12.7, blueprint Screen 7, dock app id `connectors`). Purpose: "Connect
external tools and data." It is the **Extend** layer surface for service connectors (distinct from
**S08 MCP Hub** — PRD §12.8 — which the current `ConnectorsApp` folds in as a second "MCP Servers" tab
via `McpCatalog`; the refactor should keep the catalog but the two are separate PRD screens).

PRD §12.7 acceptance criterion (the bar this card must hit):
> **"Users see exactly what tools are connected and whether data is flowing."**

The "whether data is flowing" half is the load-bearing gap — today there is no sync state, no last-sync
timestamp, and no recent-activity surface anywhere in the stack.

## 2. Required states (PRD/Blueprint)

PRD §12.7 functional requirements + blueprint Screen-7 state list (`_blueprint_extracted.txt:326-331`,
state list `:467`):

1. **Connected connectors** with **status** and **last sync**.
2. **Available connectors** grouped **by category**.
3. **Health surface**: health, recent sync activity, **token expiry**, and **errors**.
4. **Actions**: connect, **sync now**, manage, **revoke**, **reconnect**.
5. **Recommended** connectors based on onboarding + workspace needs.
6. State machine per blueprint: `connected · disconnected · expired token · syncing · failed · recommended`
   (plus list-level `loading / empty / populated / error`).
7. RBAC/trust (PRD §17.3, §18.1): "Connectors require consent and revocation path" + "Connector/MCP
   install audit" (append-only trust trail).

Mockup (`screen_07_connector_hub.png`, directional) adds visual chrome the PRD does not mandate but
implies: top tabs (Connected / Available / Recommended / Built by Waggle), a **Connector Summary** donut
(connected/syncing/error/disconnected counts), a **System Health** tile (API/sync/error-rate gauges), a
**Recent Activity** feed, and a "Need Help?" card. Treat these as direction, not a contract.

## 3. Current state in repo (disposition: **rework**)

**Frontend** — `apps/web/src/components/os/apps/ConnectorsApp.tsx` (356 LOC):
- Two-tab sidebar: **Services** (native connectors) + **MCP Servers** (`McpCatalog`). Filter rail = `all / connected / available`.
- Renders connectors from `adapter.getConnectors()` grouped by a **hardcoded** `CATEGORIES` map (`:41-50`)
  + hardcoded `SETUP_HINTS` (`:52-60`). Per-row expand reveals capability chips, setup steps, and a
  token/API-key input.
- Connect flow (`handleConnect`, `:113-135`): writes credential via `adapter.addVaultSecret('connector:<id>')`
  **then** calls `adapter.connectConnector(id)` (note: the adapter's `connectConnector` POSTs **no body** —
  `adapter.ts:1161`; the credential is pre-seeded in vault). Disconnect = `adapter.disconnectConnector(id)`.
- `shouldResetCredentialInputs` (`:69-71`) is an exported, regression-tested pure guard
  (`phase5b-connectors.test`) — **keep**, it prevents credential cross-submission.
- Subcomponents (`apps/web/src/components/os/apps/connectors/`): `BrandTile.tsx`, `brand-identity.ts`
  (logo/colour identity — **keep, reuse**), `McpCatalog.tsx` + `McpServerCard.tsx` + `mcp-registry.ts`
  (the MCP tab — belongs to **S08**, leave for that card).
- **What's MISSING in the UI vs PRD:** no last-sync, no health probe call, no "sync now", no "revoke"
  (only disconnect), no recommended tab, no recent-activity feed, no summary/health tiles, no token-expiry
  surfacing. `adapter.getConnectorHealth` **exists** (`adapter.ts:1156`) but is **never called** anywhere
  (grep-confirmed) — the UI shows only the coarse list `status`.

**Backend** — `packages/server/src/local/routes/connectors.ts` (121 LOC): 4 routes —
`GET /api/connectors`, `GET /api/connectors/:id/health`, `POST /api/connectors/:id/connect`,
`POST /api/connectors/:id/disconnect`. Backed by `fastify.connectorRegistry` (`ConnectorRegistry` in
`packages/agent/src/connectors/connector-registry.ts`; **30** connectors registered via
`setup-connectors.ts`; per-connector `healthCheck()` impls exist in every
`packages/agent/src/connectors/*-connector.ts`).

**Disposition: rework** — the shell, brand tiles, category grouping, and connect/disconnect flow are
solid and reusable, but the screen is missing the entire "is data flowing?" dimension (sync/health/
activity/recommended/audit). This is additive rework on a good base, not a rebuild.

## 4. Frontend work

**Rework `ConnectorsApp.tsx` into the PRD Connector Hub** (keep MCP tab in place for S08):

- **Add tabs** matching PRD: `Connected · Available · Recommended` (mockup also shows "Built by Waggle" —
  optional). The existing `all/connected/available` filter rail collapses into these tabs.
- **Per-row health + last sync**: lazy-call `adapter.getConnectorHealth(id)` for connected rows (already in
  adapter, currently dead) to render `status` (connected/expired/error), `tokenExpiresAt` (token-expiry
  badge), `lastChecked`, and (new) `lastSyncAt`. Extract a **new `ConnectorCard.tsx`** component
  (blueprint names `ConnectorCard`, `:488`) from the inline row JSX (`:262-340`) — status pill, last-sync,
  health dot, actions menu (Connect / Sync now / Manage / Revoke / Reconnect).
- **Recommended tab**: reuse the existing `recommendConnectors(personaId)` from `@waggle/shared`
  (`connector-recommendations.ts:146`) — today wired **only** into the MCP tab (`McpCatalog.tsx:69`),
  not service connectors. Forward `personaId` (already a prop, `:28`) to a recommended-connectors section.
- **Summary + health + activity tiles** (mockup, directional): a small **`ConnectorSummary`** donut from
  client-side status counts (no new endpoint), a **System Health** tile from the new
  `GET /api/connectors/health` aggregate (§5), and a **Recent Activity** feed from the new
  `GET /api/connectors/activity` (sync/connect/revoke events). The blueprint's reusable `Timeline` and
  `EvidencePanel` (`:488`) can host the activity list.
- **Actions wiring**: add `syncConnector(id)` → `POST /api/connectors/:id/sync`; add `revokeConnector(id)`
  → `POST /api/connectors/:id/revoke` (PRD verb; aliases existing disconnect); "Reconnect" reuses the
  existing connect flow. Surface a `syncing` row state + toasts on `failed`.
- **State**: extend the local `Connector` interface (`:31-38`) with optional `lastSyncAt`, `tokenExpiresAt`,
  `health`, `category`, `recommended`. **Move category off the hardcoded map** onto the
  `ConnectorDefinition.category` field that already exists in `@waggle/shared` (`types.ts:299`) but is not
  yet emitted by the row data — reconcile so the UI stops carrying its own `CATEGORIES`.

**Adapter (`apps/web/src/lib/adapter.ts`) — add 2 methods, reuse 1:**
- `syncConnector(id): POST /api/connectors/:id/sync` (NEW).
- `revokeConnector(id): POST /api/connectors/:id/revoke` (NEW; or alias to existing `disconnectConnector`).
- `getConnectorHealth(id)` already exists (`:1156`) — start calling it; optionally add
  `getConnectorsHealth(): GET /api/connectors/health` aggregate + `getConnectorActivity()`.

## 5. Backend work (PRD §16.9 connectors subset)

> §16.9 spans Connectors + MCPs + Marketplace. This card scopes the **Connectors** rows only; MCP rows
> (`/api/mcps*`) and `/api/marketplace*` belong to **S08 / S13**.

| PRD §16.9 endpoint | Status | Action |
|---|---|---|
| `GET /api/connectors` | **EXISTS** | `connectors.ts:6` → `registry.getDefinitions()`. **EXTEND** the definition payload to carry `category` (already on the type, `types.ts:299`) + `lastSyncAt` so the UI drops its hardcoded `CATEGORIES`/sync-shim. |
| `POST /api/connectors/:id/connect` | **EXISTS** | `connectors.ts:55`. **EXTEND**: write an `install-audit` entry (see audit gap below) on success. |
| `POST /api/connectors/:id/sync` | **MISSING** | **NET-NEW** route in `connectors.ts`. No sync substrate exists — `WaggleConnector` (`connector-sdk.ts`) has `connect`/`healthCheck`/`execute` but **no `sync()`**. Minimum viable: probe `healthCheck()` + record a `lastSyncAt` timestamp (persist in vault sub-key `connector:<id>:lastSync` or a small store) + emit an activity event. Full sync (re-pull data) is a larger connector-SDK addition — flag as phased. |
| `POST /api/connectors/:id/revoke` | **PARTIAL** | Closest is `POST /api/connectors/:id/disconnect` (`connectors.ts:107`, removes `connector:<id>` + sub-keys). **EXTEND**: add a `/revoke` alias (or rename) that additionally writes an `install-audit` `action:'rejected'`/revoke entry. Same intent, PRD verb. |

**Additional backend work the PRD requires but §16.9 does not enumerate (implied by §18.1 / §12.7):**
- **Install/consent audit on connect & revoke (MISSING write path).** `connectors.ts` does **NOT** call
  `fastify.auditStore.record(...)` (grep-confirmed — only `marketplace.ts:224-319` writes audit today).
  PRD §18.1 mandates "Connector/MCP install audit". The substrate exists: `InstallAuditStore`
  (`packages/core/src/install-audit.ts`) with `AuditCapabilityType` including `'connector'` (`:22`),
  actions `installed/rejected` (`:15`). **EXTEND** connect/revoke to record entries. ⚠ **Latent enum-drift
  bug** to avoid: TS `AuditRiskLevel` allows `'critical'` (`install-audit.ts:16`) but both DDL CHECKs only
  allow `low/medium/high` (`install-audit.ts:65`, `schema.ts:130`) — pass `'high'`, never `'critical'`.
- **Audit read route (MISSING).** No HTTP surface lists the audit trail (`getRecent`/`getByCapability`
  have no route). The Connector Hub's "Recent Activity" + the Extend trust-trail view need a NEW read,
  e.g. `GET /api/connectors/activity` (or a shared `GET /api/extend/audit` filtered to `type:'connector'`).
  Net-new but reads existing `install_audit` rows — no migration.
- **System-health aggregate (optional, mockup).** A `GET /api/connectors/health` that fans
  `registry.healthCheck()` over connected connectors for the System-Health tile. Net-new thin aggregator;
  no new substrate.

**`.mind` migration:** **None required.** `install_audit` already exists in `schema.ts:119`; connector
credentials live in the **vault**, not `.mind`. `lastSyncAt` can live as a vault sub-key or a tiny store —
no schema change. (The audit table's pre-existing `risk_level` CHECK drift is a code-discipline note, not
a migration.)

## 6. Shared types needed (PRD §15 vs `lib/types.ts`)

- **`ConnectorDefinition` / `ConnectorHealth` / `ConnectorStatus` already exist** in
  `packages/shared/src/types.ts:266-312` and are the canonical contract — the FE should import these
  instead of the ad-hoc local `Connector` interface in `ConnectorsApp.tsx:31-38` (a lossy duplicate).
- **`lib/types.ts` has a thin `Connector`** (frontend mirror, §(d) substrate inventory) — reconcile it to
  the shared `ConnectorDefinition` shape (add `category`, `tokenExpiresAt`, `lastSyncAt`, optional `health`).
- **New optional fields:** `ConnectorDefinition.lastSyncAt?: string` (and surface `category` which is
  already declared but not always populated). PRD §15.2 lists an `ExtensionType` union — connectors are one
  member; not blocking for S07 but should be defined when S13 (Marketplace) lands.
- **`ConnectorRecommendation`** already exists (`connector-recommendations.ts:38`) — reuse as-is for the
  Recommended tab.

## 7. Dependencies (screens/phases first)

- **Onboarding (S12, PRD §12.12 Tool Discovery / §16.1)** feeds the Recommended tab's "based on
  onboarding" signal. `recommendConnectors(personaId)` works standalone today, so S07 is **not blocked** —
  but the richer "based on workspace needs" recommendation improves once onboarding tool-discovery answers
  are persisted.
- **S08 MCP Hub** shares this app shell (the MCP tab). Coordinate the tab split so reworking S07 doesn't
  regress the MCP catalog; ideally S07 and S08 land in the same phase or S07 first with the MCP tab
  untouched.
- **Extend trust-trail / Marketplace (S13)** shares the install-audit read route — build the audit write +
  read once, consume in both. Sequence the audit endpoint before/with S07's Recent Activity.
- No hard dependency on Home/Workspace screens.

## 8. Effort: **M**

Frontend rework on a solid existing shell (new tabs, ConnectorCard extraction, wire two dead/easy adapter
paths) is modest. The backend lift is small-but-real: `/sync` and `/revoke` routes + audit write on
connect/revoke + an audit read route + a health aggregate — all over existing substrate (registry, vault,
`install_audit`), zero migration. The one true unknown (real data-pull `sync` in the connector SDK) is
phaseable to a health-probe-only v1, which keeps this **M** rather than **L**.

## 9. Open questions

1. **Sync semantics.** Does "sync now" mean (a) re-probe health + stamp `lastSyncAt` (v1, cheap), or
   (b) re-pull/refresh cached connector data (needs a new `sync()` on `WaggleConnector` + a cache)? PRD
   §12.7 says "show recent sync activity" but connectors are currently **runtime tools** (`execute(action)`),
   not background data-syncers. Recommend v1 = health-probe + timestamp.
2. **`lastSyncAt` storage.** Vault sub-key (`connector:<id>:lastSync`) vs a small dedicated store vs an
   `install_audit` derived value? Vault sub-key is lowest-risk and matches the existing `connector:<id>:email`
   pattern.
3. **revoke vs disconnect.** Add `/revoke` as a true alias of `disconnect`, or have `revoke` additionally
   purge OAuth tokens (`<provider>_oauth_token`, `oauth.ts`) + write a stronger audit entry? PRD §17.3
   ("revocation path") implies the latter for OAuth connectors.
4. **Audit scope.** Connector-specific `GET /api/connectors/activity` vs a shared
   `GET /api/extend/audit?type=connector`? The latter serves S07 + S08 + S13 with one route (preferred).
5. **Audit `.mind` location.** `install_audit` is per-`.mind` (per-workspace). Connectors are **global**
   (vault-scoped, not workspace-scoped). Confirm the audit-store decorator binds to `personal.mind` so the
   global Connector Hub trail is consistent (substrate inventory §(d) flags this exact ambiguity).
6. **Token-expiry source.** `ConnectorHealth.tokenExpiresAt` is populated only on the fallback path
   (`connectors.ts:49`); confirm each connector's `healthCheck()` surfaces real expiry, else the expired-token
   state will never show for SDK-backed connectors.
