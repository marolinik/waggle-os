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

## Phase 3 plan (next commit)
1. Fix B1 — read `entries`.
2. Add 403 → UpgradeModal handling in MarketplaceApp + CapabilitiesApp.
3. Map starter-pack catalog entries to SkillPack shape in adapter.

## Phase 4 plan (subsequent commit)
- Add agent tool `request_capability_install` (params: `kind: 'skill'|'package', name, reason`).
- Add chat block `CapabilityRequestBlock` rendering an inline approval card (Install / Decline buttons).
- Tool returns blocking promise resolved by user click; on Install → calls existing install endpoint, returns status; on Decline → returns `{declined: true}`.
- Surfaces gap to user mid-conversation: "I need `skill:research-synthesis` to do this. Install?"
