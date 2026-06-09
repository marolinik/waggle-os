# Gap Card — S06 Skills Hub (+ Skill Builder)

> Screen 06 of the Waggle OS UX-refactor. Sources: PRD §12.6 + §16.8 + §15 (`docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_UX_Refactor_PRD.md`),
> blueprint extract pp.33 + screen-table row 6 + states table (`_blueprint_extracted.txt`),
> mockup `Waggle_OS_Handoff_Assets/screen_06_skills_hub.png` (directional only),
> backend-map `sections/03d-api-marketplace-skills.md` + `sections/05g-subsystem-skills-marketplace-wiki.md`,
> and live repo grep/read. Execution model: **in-place incremental refactor** of `apps/web` + targeted backend extension.

---

## 1. Screen & purpose

**Skills Hub** — the surface where reusable capabilities (a "skill" = a Markdown file in `~/.waggle/skills/{name}.md`, injected into the agent system prompt) are browsed, installed, authored, tested, and assigned to agents/workspaces. Blueprint row 6: *"Reusable capabilities across users, workspaces and agents. Install, create, test, assign to agent/workspace, archive."* Acceptance criterion (PRD §12.6 / blueprint): *"A user can understand what a skill does, where it is used, and what access it has."*

The mockup shows a left rail of category/state filters, a **My Skills** table (name / category / status / usage / last-used columns), a **Marketplace** panel, a **Workspace Skills** table, a **Custom Skills** panel, and a **Create Skill** CTA — i.e. a unified library + marketplace + builder entry, replacing the current "Skills & Apps" pack-grid.

Per the locked IA (frontend.md §f), this is the **Intelligence** layer, expressed through the existing dock/window-manager (`AppId='capabilities'`, dock key `skills`) — NOT a new route. The PRD also pairs this screen with the **Skill Builder** (PRD §12.6 5-step stepper; PRD §20.3 lists `SkillBuilder` under "Create").

---

## 2. Required states (PRD / Blueprint)

PRD §12.6 functional requirements:
- **Skills Hub tabs:** My Skills · Marketplace · Custom Skills · Workspace Skills.
- **Skill object fields:** name, description, category, instructions, inputs, outputs, tools/data, memory access, owner, status, usage, last used.
- **Skill Builder steps:** Basic Info · Instructions · Inputs & Outputs · Tools & Data · Review & Create.
- Support **test run before publishing**.
- Skills can be **assigned to agents, workspaces, automations, or used directly**.

Blueprint per-object states (states table) for **Skills**: `Loading, empty, populated, error` + item states `Installed, draft, custom, workspace, marketplace, update available`; actions `Test, install, publish, archive, rollback`. PRD §14.7 Extension states also apply: `Available / Installed / Update available / Installing / Failed install / Risk approval required / Disabled-revoked`.

Global states every screen must implement (PRD §14.1): Loading · Empty · Populated · Error · Offline/local-only · Syncing · Permission denied · Partial data · Approval required.

**Trust/tier state (load-bearing):** custom skills + marketplace install/publish are PRO-gated; FREE = built-in skills only (`tiers.ts`; 05g §19). A `403 → upgrade` state is required on create/install/publish.

---

## 3. Current state in repo

**Disposition: `partial`** — strong backend + a real (but mislabelled) hub component exist; the screen needs **rework** of the FE component to the PRD tab/table model, plus a **net-new Skill Builder** and **thin backend extensions** for `:id/test`, `:id/install`, and skill scope (workspace/custom).

### Frontend (exists, reworkable)
- `apps/web/src/components/os/apps/CapabilitiesApp.tsx` — the live Skills surface ("**Skills & Apps**" header, line 339). Tabs are `installed | starter | marketplace | tools | audit` (line 80, 358) — a **pack-centric grid**, NOT the PRD's My/Marketplace/Custom/Workspace tabs. Renders `PackCard`/`PackDetail` over `SkillPack` (pack groupings), has skill **test preview** (`handleTestSkill` → `POST /api/skills/test`, lines 88-102), pack install with `403→UpgradeModal` routing (`handleInstallError`, lines 149-162), a `tools` read-only catalog, and an `audit` tab (`GET /api/audit/installs`). Reachable via dock key `skills` → `appId 'capabilities'` (`lib/dock-tiers.ts:64`).
- `apps/web/src/components/os/apps/MarketplaceApp.tsx` — standalone marketplace browser (search/install/uninstall over `/api/marketplace/*`); registered as `appId 'marketplace'` but **no dock entry points at it** (frontend.md §a). Marketplace is doubly-represented (here + folded into CapabilitiesApp) — an IA-cleanup point for this screen.
- Adapter methods already wired (`lib/adapter.ts`): `getSkills`, `createSkill`, `getStarterPacks`, `getCapabilityPacks`, `installPack`, plus full marketplace set (frontend.md §c).
- Types: `SkillPack` (`lib/types.ts:210-218`: id/name/description/category(5-enum)/skills[]/installed/trust) — a **pack** shape, NOT the PRD per-skill `Skill` object. No `Skill`/`SkillScope`/`SkillStatus`/`ExtensionType` type in FE (substrate-types.md §e).

### What does NOT exist (gaps)
- **No `SkillBuilder` component** anywhere (grep confirmed — the only `SkillBuilder`/`Custom Skill` string matches are upgrade-modal copy in `TrialExpiredModal.tsx`/`UpgradeModal.tsx`). PRD §12.6 5-step builder is **net-new FE**.
- **No "Workspace Skills" / "Custom Skills" scoping at runtime.** Skills are flat files in `~/.waggle/skills/` (05g §8); the prompt loader ignores frontmatter (`loadSkills`, 05g §2 note). A `SkillScope` (`personal|workspace|team|enterprise`) exists only in `skill-frontmatter.ts` frontmatter + the `promote_skill` path — not persisted/queryable by the skills route (grep `scope|workspace` in `routes/skills.ts` → **0 matches**). So the PRD's Workspace/Custom tabs have **no backing filter today**.

### Backend (mostly exists — see §5)
`packages/server/src/local/routes/skills.ts` already serves list/create/get/update/delete + `test` + `suggestions` + `hash-status` + starter/capability-pack catalogs + `/api/audit/installs`. Substrate detailed in 05g (skill-creator / -recommender / -usage / -retirement / -watcher) and 03d.

---

## 4. Frontend work

**Rework `CapabilitiesApp.tsx` → Skills Hub** (keep the file; this is the in-place refactor target), and **create `SkillBuilder`**. Reuse the existing window-manager surface (no new route); resolve the marketplace double-representation by making Skills Hub the canonical host and retiring/redirecting `MarketplaceApp`'s dead `appId`.

**Components to rework / create**
- **Rework** `CapabilitiesApp` tab model: `installed|starter|marketplace|tools|audit` → PRD **My Skills · Marketplace · Custom · Workspace** (keep `tools`/`audit` as secondary panels or fold `audit` into a detail-drawer "install history"). My Skills must render a **per-skill table** (name/category/status/usage/last-used per mockup), not just a pack grid.
- **Create** `SkillCard` / `SkillRow` (per-skill, distinct from `PackCard`) — design-system `SkillCard` is named in PRD §19.1 + blueprint components list. Show status badge (installed/draft/custom/workspace/update-available — PRD §14.7) and trust chip (reuse `lib/skill-pack-display.ts` `describeTrust`).
- **Create** `SkillBuilder.tsx` overlay (PRD §20.3 "Create") — `Builder stepper` (PRD §19.1) with the 5 steps. Pattern-match the existing builder/wizard idioms (`overlays/onboarding/*` step components, `CreateWorkspaceDialog`, `SpawnAgentDialog`). Step 5 "Review & Create" wires a **test run** before publish.
- **Create/extend** a `useSkills` hook (none exists today — `CapabilitiesApp` calls `adapter` directly via `Promise.allSettled`, lines 104-145). New hook returns `{ skills, packs, marketplace, install, create, test, refresh }`; keep `403→'waggle:tier-insufficient'` event routing (CapabilitiesApp lines 149-162) and `UpgradeModal` wiring intact.

**Reuse targets**
- `POST /api/skills/test` → already wired (`handleTestSkill`); reuse for builder Step 5 + per-skill test.
- `GET /api/skills/starter-pack/catalog` / `capability-packs/catalog` → already supply `state` per skill (`active|installed|available`); reuse for Marketplace/My-Skills state.
- `GET /api/skills/suggestions?context=` → recommended-skills strip.
- `dedupePacks`, `skill-pack-display`, `skill-recommendations`, `HintTooltip` — existing libs to keep.

**Props/state**
- `Skill` type (new, §6): `{ name, description, category, status, scope, usageCount, lastUsedAt, trust, instructions?, inputs?, outputs?, tools?, memoryAccess?, owner? }`.
- Builder form state mirrors `POST /api/skills/create` body (`{ name, description, steps[], tools?, category? }`) extended with inputs/outputs/memoryAccess once §5 lands.

**Adapter methods to add** (`lib/adapter.ts`): `testSkill(id, testInput?)` (path variant), `installSkill(id)` (unified dispatch), `updateSkill(id, patch)`, and scope-aware `getSkills({scope})` once the backend filter exists.

---

## 5. Backend work — PRD §16.8 endpoint-by-endpoint

> Cross-ref against backend-map 03d/05g + `routes/skills.ts`. Skills are flat files in `~/.waggle/skills/`; the marketplace is `~/.waggle/marketplace.db`. **No `.mind` migration is required for §16.8** — skills/marketplace are not in the `.mind` SQLite schema. (One optional migration is flagged below for the *install-audit critical column*, see "Cross-cutting".)

| PRD §16.8 endpoint | Status | Extend vs net-new | Substrate touched |
|---|---|---|---|
| `GET /api/skills` | **EXISTS** | as-is (`routes/skills.ts`, 05g §8) — returns `{ skills:[{name,length,preview}], count, directory }` | `~/.waggle/skills/*.md` |
| `POST /api/skills` | **EXISTS** | as-is — raw create `{name,content}`; structured create is `POST /api/skills/create` `{name,description,steps[],tools?,category?}` (the Builder's real target) | `~/.waggle/skills/*.md` + `redactSkillContent` + `skillHashStore` + install-audit |
| `PATCH /api/skills/:id` | **PARTIAL** | **EXTEND** existing `PUT /api/skills/:name` (keyed by **name**, method `PUT`). Add a `PATCH` alias and accept `:id`↔`:name`. No new substrate. | `~/.waggle/skills/*.md` |
| `POST /api/skills/:id/test` | **PARTIAL** | **EXTEND** existing `POST /api/skills/test` (body-driven `{skillName,testInput?}`) — add the `:id` path variant routing to the same handler. Sandbox/dry-run only (parses frontmatter, shows `wouldInject`); no execution. | skill file + `parseSkillFrontmatter` |
| `POST /api/skills/:id/install` | **PARTIAL** | **NET-NEW thin dispatcher** over existing installs: `POST /api/skills/starter-pack/:id`, `POST /api/skills/capability-packs/:id`, `POST /api/marketplace/install` (PRO-gated, SecurityGate). `/skills/:id/install` resolves the source and delegates. Keep the `requireTier('PRO')` gate for marketplace-sourced skills. | marketplace.db + `MarketplaceInstaller` + `SecurityGate` + install-audit |

**Result: 0 net-new domains, 0 net-new stores.** 16.8 is `2 EXISTS / 3 PARTIAL` (matches `backend-routes.md` §16.8). All gaps are aliases/dispatchers over existing handlers.

**Backend gaps the PRD §12.6 tab model implies but §16.8 does NOT enumerate (flag for the plan):**
1. **Workspace/Custom scope filtering.** PRD tabs (Workspace Skills, Custom Skills) need a queryable `scope`. Today `SkillScope` lives only in optional frontmatter and is ignored by the prompt loader. **Extend** `GET /api/skills` to parse `parseSkillFrontmatter` and return `scope` + a `?scope=` filter (custom = user-authored vs starter/marketplace; workspace = `scope: workspace` frontmatter). No store change — derive at read time. Net-new query param, reusing the existing parser (05g §2). The "Custom" tab can also be derived as "not in starter/capability-pack catalogs."
2. **Assign-to-workspace/agent.** PRD "assign to agent/workspace" — workspace config already has a `skills?: string[]` field (`WorkspaceConfig`, substrate-types.md §a; matches `WorkspaceConfigV2.skills`). Assignment is a `PATCH /api/workspaces/:id { skills }` (EXISTS) — no new endpoint, but the FE must wire it.
3. **Archive/rollback** (blueprint actions). `retireStaleSkills` (05g §6) **moves** skills to `~/.waggle/skills-archive/` (recoverable) — an archive substrate exists but has **no HTTP route**. A manual "archive"/"restore" pair would be net-new thin routes over `skill-retirement.ts`. Defer unless in MVP scope (PRD §12.6 lists archive in blueprint, not in §16.8).
4. **Publish.** `POST /api/marketplace/publish` (PRO-gated) already exists for skill→catalog publish (03d/05g §13) — reuse for the Builder's "publish to marketplace" path.

---

## 6. Shared types needed (PRD §15 vs `lib/types.ts`)

Currently the FE has only `SkillPack` (a pack grouping, `lib/types.ts:210-218`) — **no per-skill `Skill` type, no `SkillScope`/`SkillStatus`/`ExtensionType`** (substrate-types.md §e: all PRD §15.2 unions MISSING in FE).

Add to `apps/web/src/lib/types.ts` (FE), mirroring the existing backend `SkillFrontmatter`/`SkillTemplate` shapes (05g §2-3) so FE↔BE stay aligned:
```ts
type SkillScope = 'personal' | 'workspace' | 'team' | 'enterprise'; // matches skill-frontmatter.ts
type SkillStatus = 'installed' | 'draft' | 'custom' | 'workspace' | 'marketplace' | 'update-available';
type ExtensionType = 'skill' | 'connector' | 'mcp' | 'model' | 'template' | 'external_tool'; // PRD §15.2

interface Skill {
  name: string;            // file stem (id surrogate)
  description: string;
  category: string;
  scope: SkillScope;
  status: SkillStatus;
  trust?: 'verified' | 'community' | 'experimental';
  usageCount?: number;     // from skill-usage.json (05g §5)
  lastUsedAt?: string;     // ISO
  instructions?: string;   // body
  inputs?: string[]; outputs?: string[]; tools?: string[];
  memoryAccess?: boolean; owner?: string;
}
```
Keep `SkillPack` for the pack-grid (starter/capability packs); `Skill` is the per-row object for My/Custom/Workspace tabs. Align `Skill.category` to the broader server `inferCategory` set (research/coding/knowledge/writing/planning/general — 05g §3), not the FE `SkillPack`'s 5-value enum.

---

## 7. Dependencies (screens/phases first)

- **PRD Phase 3 (Intelligence layer)** — Skills Hub + Skill Builder ship here (PRD §8, Sprint 6). Depends on **Phase 0/1 AppShell + IA + shared types** (`ExtensionType`, `Skill`) and the dock/zone IA being settled.
- **Soft dependency on S04 Memory** (memory-access declaration in skills — PRD field "memory access") and **S09 Agent Center** (skills assigned to agents — shared `skillIds` concept; `AgentDef` lacks `skillIds` today, substrate-types.md §e §15.5).
- **Shares the Extend-governance install-audit read surface** with S07 Connector / S08 MCP / Marketplace screens — the `GET /api/audit/installs` route exists (05g §8) and is already consumed by `CapabilitiesApp` AuditTab; the broader `GET /api/extend/audit` (substrate-types.md §d, gap 1) is shared across S06/S07/S08.
- **No dependency on Home/Command Center net-new domains.** Skills Hub can ship before those.

---

## 8. Effort

**M.** The backend is almost entirely present (2 EXISTS / 3 PARTIAL aliases-and-dispatchers, no new store, no `.mind` migration); the lift is FE: rework `CapabilitiesApp` from pack-grid to the PRD tab/table model, add a per-skill `Skill` type + `useSkills` hook, build the net-new 5-step `SkillBuilder`, and resolve the marketplace double-representation. Workspace/Custom scope filtering is a read-time derivation (cheap). Bumps toward L only if archive/rollback + full assign-to-agent wiring land in the same slice.

---

## 9. Open questions

1. **Tab semantics for "Custom" vs "Workspace":** is "Custom" = user-authored-not-from-catalog (derive by excluding starter/capability-pack ids) and "Workspace" = `scope: workspace` frontmatter? Confirm, since neither is a first-class persisted state today (skills are flat files; scope is optional frontmatter the loader ignores).
2. **Does the Builder publish to the local skills dir, the marketplace catalog, or both?** `POST /api/skills/create` (local) vs `POST /api/marketplace/publish` (PRO-gated catalog) are different targets — PRD §12.6 says "test run before publishing" but doesn't say which surface "publish" writes to.
3. **PRD §16.4 / §23 Q4 parity:** how much of the Marketplace tab is the live synced catalog (`/api/marketplace/search`, ~30 sources) vs seeded/mock entries in v1? Affects the Marketplace panel's empty/syncing states.
4. **Skill "inputs/outputs/memory access" persistence:** the current `SKILL.md` frontmatter (`skill-frontmatter.ts`) has `permissions` but **no structured inputs/outputs**. Builder Steps 3 ("Inputs & Outputs") + 4 ("Tools & Data") imply extending the frontmatter schema — confirm whether to extend `SkillFrontmatter` (and `generateSkillMarkdown`/`serializeFrontmatter`) or store these in skill body markdown only.
5. **Archive/rollback in MVP?** Blueprint lists `archive`/`rollback` as skill actions but PRD §16.8 omits them. `skill-retirement.ts` provides the move-to-archive substrate but no HTTP route — include now or defer to a later Extend-governance slice?
6. **Install-audit critical-column bug (cross-cutting, substrate-types.md §d gap 2):** `AuditRiskLevel` TS includes `'critical'` but both DDL CHECKs only allow `low/medium/high` — a `record()` with `'critical'` throws. Skill installs route through this audit path; confirm the plan picks up the one-line migration (or that the marketplace's CRITICAL→`'high'`+`approvalClass:'blocked'` mapping is the permanent contract).
