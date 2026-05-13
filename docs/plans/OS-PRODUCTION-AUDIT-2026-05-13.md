# OS UI/UX Production Readiness Audit — 2026-05-13

Scope: `apps/web/src/components/os/**` + `packages/server/src/local/routes/{skills,marketplace}.ts`

## Tier model (CONFIRMED — no rename)
Internal IDs unchanged. User-facing labels (from `apps/web/src/components/os/overlays/onboarding/constants.ts:87`):
- `simple` → "Essential" — 6 dock entries (home, chat, files, vault, settings)
- `professional` → "Standard" — 8 entries (+ agents, memory)
- `power` → "Everything" — 13 entries (all docks visible)
- `admin` → alias of `power`

`getDockForTier(tier, billingTier)` in `dock-tiers.ts` filters by billingTier (FREE/TRIAL/PRO/TEAMS/ENTERPRISE) on top, hiding TEAMS-only entries (Approvals, Team Governance) below TEAMS.

## 25 OS apps registered in Desktop.tsx
chat · dashboard · settings · vault · profile · connectors · memory · events · cockpit · mission-control · capabilities · waggle-dance · agents · files · scheduled-jobs · marketplace · voice · room · approvals · timeline · backup · telemetry · governance + spawn-agent dock shortcut. Each renders a real component (`renderAppContent` switch).

## Backend routes (verified)
- Marketplace: `/api/marketplace/{search,installed,install,uninstall,packs,packs/:slug,sources,categories,security-check,security-status,sync,publish,enterprise-packs}` — full surface.
- Skills: `/api/skills` + `/api/skills/starter-pack/{catalog,:id}` + `/api/skills/capability-packs/{catalog,:id}` + `/api/skills/test` + `/api/skills/create` + CRUD on `/api/skills/:name`.
- Plugins: `/api/plugins/*` including tool-file editor (`PUT /api/plugins/:name/tools/:toolName`).
- Audit: `/api/audit/installs` returns `{ entries: [...] }`.

## Bugs found in Phase 2 audit

### B1: Audit tab silently empty
`CapabilitiesApp.tsx:20-21` reads `data.installs` but server returns `{ entries }`. AuditTab always renders empty list.
**Fix:** Read `data.entries` (or both for resilience).

### B2: Marketplace install 403 on FREE tier with no upgrade affordance
`marketplace.ts:170` gates POST `/api/marketplace/install` on `requireTier('PRO')`. FREE users get raw 403 → toast "Install failed" with no upgrade path.
**Fix:** MarketplaceApp + CapabilitiesApp install handlers should detect 403 + open UpgradeModal.

### B3: SkillPack starter-pack catalog shape mismatch
Server `/api/skills/starter-pack/catalog` returns `{ skills: [{id,name,description,family,familyLabel,state,isWorkflow}], families }`. SkillPack type expects `{id,name,description,category,trust,skills?[]}`. Cards render but `category` is undefined → no color badge; `trust` is undefined → falls back to community. Cosmetic but reduces information density.
**Fix:** Map starter-pack entries to SkillPack shape (`family→category`, set `trust='verified'`).

## Phase 3 — SHIPPED `c2f45ca`
1. ✅ B1 fixed — CapabilitiesApp AuditTab reads `entries` (with `installs` fallback) and normalises capabilityName/action.
2. ✅ B2 fixed — MarketplaceApp + CapabilitiesApp install handlers detect 403 and dispatch `waggle:tier-insufficient`. Other failures parse `err.message`/`err.error`/`blocked` and toast. `adapter.installPack` + `adapter.installMarketplacePack` now throw on `!ok` with status + body attached.
3. ✅ B3 fixed — adapter maps `family→category`, `state→installed`, sets `trust='verified'` for starter-pack and capability-pack catalogs.

## Phase 4 — SHIPPED `1bcbeef`
Reframed the design after finding `acquire_capability` and `install_capability` already exist in `packages/agent/src/skill-tools.ts`. The gap was UX, not infra: the agent's recommendation surfaced as prose ("call `install_capability` with name X and source Y") that the user had to translate manually.

Built a pure-UI bridge:
- **`CapabilityRequestCard.tsx`** — inline action card (Install / Dismiss). Routes by source: `starter-pack` → `adapter.installPack` (no auth, bundled); `marketplace` → resolves packageId via search, then POSTs install; 403 dispatches UpgradeModal.
- **`capability-request-parser.ts`** — `segmentText()` splits agent text into `[text, capability, text...]` around two patterns:
  - Pattern A (preferred, structured): `<!--waggle:capability_request {"name":"X","source":"Y","reason":"..."}-->`
  - Pattern B (legacy): `` `install_capability` with name "X" and source "Y" ``
- **`TextBlock.tsx`** — renders segments inline; preserves streaming cursor + bouncing-dot loader.
- Dedup by `source::name` so a single proposal mentioned twice (body + recommendation) renders one card.

No agent package rebuild needed — Pattern B picks up the current `acquire_capability` summary verbatim. When the agent gets updated to emit Pattern A, richer info flows through with zero client change.

## Phase 5 — SHIPPED (this commit)
- Extracted `segmentText` / `Segment` into `capability-request-parser.ts` sibling file. Silences react-refresh/only-export-components warning and isolates the parser surface for testing.
- Static sweep of `apps/web/src/components/os/**` for stubs: zero. The `Coming soon...` line at `Desktop.tsx:358` is a defensive default for unknown `AppId`s; all 25 known IDs map to real components.
- ESLint clean on all Phase 3+4+5 touched files.

## Production-readiness state at end of sprint
- Three tiers (`simple`/`professional`/`power`) configured in `dock-tiers.ts` with UI labels Essential/Standard/Everything. All 13 docks visible at `power`. Tier filtering by billing tier (FREE→ENTERPRISE) works for TEAMS-gated entries (Approvals, Team Governance).
- 25 dock apps all clickable, all map to real components in `renderAppContent`.
- Skill / tool / marketplace search + install fully wired:
  - `/api/marketplace/search` + `/api/marketplace/install` + 403 → UpgradeModal
  - `/api/skills/starter-pack/catalog` + per-skill install (always allowed)
  - `/api/skills/capability-packs/catalog` + bulk pack install
  - `/api/audit/installs` rendered with normalised entries
  - SecurityGate runs on every install (CRITICAL → blocked, HIGH → force-flag required, MEDIUM/LOW → audit + proceed)
- Agent install-request UX: `acquire_capability` proposals render inline install buttons via parser. Marker-protocol ready for richer payloads.

## Tests + checks
- 526/526 apps/web suite green (8 new in `capability-request-parser`)
- `tsc --noEmit --project apps/web` clean
- ESLint clean on touched files (Phase 3+4+5 surfaces)
