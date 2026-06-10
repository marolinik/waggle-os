# Open Questions — UX Refactor (Founder Ratification)

> Source: PRD §23 (`docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_UX_Refactor_PRD.md:1414-1424`)
> + the §9 "Open questions" sections of all 22 gap cards (`docs/ux-refactor/gap-cards/S00..S21`).
> Every recommendation is kept consistent with the **locked direction**: in-place incremental refactor
> of `apps/web` + targeted backend extensions, **full-stack** (net-new/extended APIs where PRD §16 has no
> route yet), **local-first** default. Mockups are directional (PRD §24); PRD acceptance criteria win.
>
> **How to use:** each question has (a) why it matters, (b) options + tradeoffs, (c) a RECOMMENDED answer
> for founder ratification, (d) the phase it blocks if unresolved. Questions are grouped: **§A** = the 8
> PRD §23 questions; **§B** = cross-cutting decisions surfaced by the gap cards that block ≥2 screens;
> **§C** = screen-local questions that block a single screen. Critical (Phase 1–2 blocking) items are
> flagged **[BLOCKS P1]** / **[BLOCKS P2]**.

---

## ✅ Founder Ratifications — 2026-06-09

The **spine (Phase 0/1) blockers are RATIFIED as recommended** (founder, 2026-06-09). Phase 0 is
unblocked; these are now locked decisions alongside the execution-model + full-stack scope locks:

- **B1** Shell topology → in-place dock reframe; keep windowed `AppId` nav; group the dock into
  Work / Intelligence / Extend / Team zones. **No react-router.**
- **A1** Workspace Desktop → fixed widget layout v1.
- **A2** Home Cockpit → personal-only v1 (team strip later, behind RBAC).
- **B4** `/api/*` → alias PRD vocabulary onto existing routes (command / automations / connector-revoke); do not rename.
- **B8** Identity → onboarding writes profile **and** seeds the `identity` table.

## ✅ Founder Ratifications — Phase 2 gate (2026-06-09 S2)

The **Phase-2 blockers are RATIFIED as recommended** (founder, 2026-06-09), except **C33** which is
**held for discussion** (see note below). Locked Phase-2 decisions:

- **A6** Artifact storage → per-workspace `artifacts.json` index over the existing StorageProvider;
  artifact = explicit produced output (not every ingested input). No `.mind` migration.
- **A8** Memory retention → soft-status in `metadata` (Archive = reversible; Deprecate = existing
  `importance`); **Delete = hard delete behind a scope-and-consequence confirmation** (PRD J20).
  ≤1 additive migration.
- **B2** Confidence → cheap heuristic at preview (source-trust × adapter-type × dedup), persisted in
  `metadata` only if it becomes a queryable filter; LLM scoring reserved for the standing J08 queue.
- **B6** `MemoryKind` → PRD §15.2 canonical in `@waggle/shared`; pure harvest + display-category mapping
  helpers. Drop FE `event`/`insight` drift.
- **A3** Memory graph tab → **ship in v1** (substrate already renders).

- **C33** Import↔Review commit split → **RESOLVED to the middle path** (founder, 2026-06-09 S2, after
  discussion). **Commit-as-unreviewed, non-blocking review:** onboarding Import commits immediately (memory
  feels alive on first run), but frames land with `status:'unreviewed'` + the B2 confidence score; Review is
  a **non-blocking** curation surface (Memory Center "needs review" filter + the standing J08 queue), NOT a
  blocking onboarding step. Reads PRD "nothing imports without review/approval" (646/1207) as *nothing is
  trusted/surfaced until reviewed*, not *nothing is written*. Rationale: importing one's own memories is
  additive + reversible (A8 archive/delete), so a blocking first-run gate would be friction in the wrong
  place (founder principle: friction reserved for irreversible/destructive actions). Reuses A8 soft-status
  + B2 confidence — no extra migration. Supersedes the original §C C33 "blocking split" recommendation.

## ✅ Founder Ratifications — Phase 3 gate (2026-06-10)

The **Phase-3 (Intelligence) items are RATIFIED as recommended** (founder, 2026-06-10). Locked:

- **B3** Agent entity → real Agent object in `{dataDir}/agents.json` referencing `personaId`; persona =
  behavioral template field. `successRate`/`lastRun` derived at read from `execution_traces`. No `.mind`
  migration (M3 not shipped).
- **C24** Automation triggers → schedule-only v1 (cron cadence); Event trigger deferred (no event→automation
  dispatch substrate).
- **C26** Builder test-run → NET-NEW no-persist dry-run route (`POST /api/automations/test`); do NOT reuse
  `cron/:id/trigger` (executes + auto-enables).
- **C13** Skill Builder publishes create-to-local (`POST /api/skills/create`); marketplace publish lives in S06/S21.
- **C14** Skill inputs/outputs → body markdown v1; no `SkillFrontmatter` extension.
- **C22** Agent Center tabs = All/Personal/Workspace/Team/Autonomous/Archive; Templates = side affordance.
- **C23** Agent `/run` → one-shot fleet-spawn into a chosen workspace (picker if multiple `workspaceIds`);
  persistent always-running agents deferred.
- **C25** Automation condition step → advisory `jobConfig.condition` string, no evaluation engine v1.
- **C27** Analytics tiles → keep success-rate (from `cron_execution_history`); drop "hours saved" or label
  it an explicit heuristic estimate.
- **C36** Skill scope vocabulary → PRD `organization` (align §15.2 `Scope` union).
- **C37** Skill test-run fidelity → preview-only (injected-prompt + parsed metadata) v1; live LLM dry-run deferred.

## ✅ Founder Ratifications — Phase 4 gate (2026-06-10)

The **Phase-4 (Extend) items are RATIFIED as recommended** (founder, 2026-06-10). Locked:

- **A4** Real-where-substrate-exists, catalog-for-the-rest: connectors connect + health-probe +
  `lastSyncAt` stamp (background data re-pull deferred); MCPs install/start/stop/test via the existing
  marketplace installer + stdio runtime; static catalog renders honest "available / not installed"
  states — never fake entries (PRD §22.2).
- **A5** Marketplace → federate-at-read over the six local domains; no `marketplace.db` migration;
  remote registry / public marketplace deferred (PRD §4.4 + §22).
- **B5** Tier vocabulary → document the mapping; all new gates route through `@waggle/shared tiers.ts`
  (`TierCapabilities`); MCP Hub + Marketplace install gated **PRO+**.
- **B7** `ExtensionType` → `skill | agent | connector | mcp | model | template` (drop `external_tool`;
  external tools surface via connectors/MCPs). Defined once in `@waggle/shared`.
- **C15 / M2** install-audit `critical` CHECK → ship the additive migration (live sighting:
  `marketplace.ts:228` writes `critical`, silently rejected by the DDL CHECK today).
- **C16** Connector "sync now" v1 = re-probe health + stamp `lastSyncAt`.
- **C17** `revoke` purges OAuth tokens + writes the stronger audit entry (PRD §17.3); `disconnect`
  stays the lighter alias.
- **C18** One shared `GET /api/extend/audit?type=` serving connectors + MCPs + marketplace.
- **C19** MCP scope = single-`workspaceId` config v1 (matches stdio runtime); N:N deferred.
- **C20** "Remote Registry" tab deferred (runtime is stdio-only); v1 points at the static catalog.
- **C21** MCP `test` = live spawn-and-`isHealthy()`/`tools/list` round-trip where cheap; static
  manifest validation fallback.
- Foundational task (coverage-check C4): populate `mcpRuntime` at boot from persisted config
  (`local/index.ts` registers none today) — explicit Phase-4 work item gating all MCP routes.

---

Remaining pending: **A7** (RBAC — ratify before S10/Phase 5) + Phase-5/6 screen-local items.

## §A — PRD §23 Open Questions (the canonical 8)

### A1. Widget customization in Workspace Desktop — fixed layout or true customization in v1?
*(PRD §23 Q1, line 1416; gap card S02 §9 Q1.)*

- **(a) Why it matters:** Determines whether S02 reuses the maximized `AppWindow` + fixed widget layout
  (cheap, in-place) or builds a draggable/resizable grid (parallel layout system, large blast radius).
  PRD §12.2 already says "configurable widgets in *later* phase; fixed default layout in initial release".
- **(b) Options:**
  1. *Fixed layout v1* — one default widget arrangement; reuse window manager. Lowest cost, ships Phase 1.
  2. *Customizable grid v1* — drag/resize/persisted layout. New layout engine, persistence, much larger.
  3. *Fixed + per-tab presets* — fixed canvas but a couple of named presets. Middle cost.
- **(c) RECOMMENDED:** **(a) Fixed layout v1.** PRD §12.2 self-answers this; customization is explicitly
  a later phase. Rationale: keeps Workspace Desktop a maximized window in the existing OS, zero parallel
  layout system.
- **(d) Blocks:** **Phase 1** (Workspace Desktop, S02). **[BLOCKS P1]** — but the PRD text already
  resolves it, so this is a confirm-not-debate.

### A2. Home Cockpit scope — personal-only, or team/global views too?
*(PRD §23 Q2, line 1417; gap card S01 §9 Q3, Q5.)*

- **(a) Why it matters:** Decides whether the briefing reads cross-workspace personal state only, or also
  team/shared rows. S01 §9 Q3 flags that reading the user's *own* workspaces server-side is now safe
  (same-user), while team/shared rows must still gate through `approvalGrantStore`/RBAC.
- **(b) Options:**
  1. *Personal-only v1* — briefing aggregates the user's own workspaces; team rows deferred to Phase 5.
  2. *Personal + team summary v1* — adds a shared-activity strip (needs RBAC + Team substrate live).
  3. *Toggle (personal/team) v1* — most flexible, most work; team substrate not ready until S10.
- **(c) RECOMMENDED:** **(a) Personal-only v1**, with the briefing builder written so a team summary can
  be appended later behind the existing RBAC gate. Rationale: Team Workspace (S10) is a Phase-5 screen;
  Home must ship in Phase 1 without it. Local-first + own-data read is the safe boundary.
- **(d) Blocks:** **Phase 1** (Home Cockpit, S01). **[BLOCKS P1]**.

### A3. Memory Center graph view — v1 or later?
*(PRD §23 Q3, line 1418; gap card S04 §9 / line 232.)*

- **(a) Why it matters:** Whether the "Graph" tab ships in the first Memory Center cut.
- **(b) Options:**
  1. *Ship graph in v1* — the `knowledge_entities`/`knowledge_relations` substrate + a graph render
     already work (S04 line 232: "Graph already works, so keep").
  2. *Defer graph* — tab hidden until a later polish pass.
- **(c) RECOMMENDED:** **(a) Ship in v1.** Rationale: the substrate exists and S04 already confirms it
  renders; deferring would be removing working capability for no gain.
- **(d) Blocks:** **Phase 2** (Memory Center, S04). **[BLOCKS P2]** (scoping-only; default = keep).

### A4. Which connectors/MCPs are real in v1 vs seeded/mock catalog?
*(PRD §23 Q4, line 1419; gap cards S06 §9 Q3, S07 §9 Q1, S08 §9 Q4–Q5, S14 §9 Q1, S15 §9 Q3, S21 §9 Q2.)*

- **(a) Why it matters:** Touches six screens. Determines the empty/syncing states of the Marketplace,
  Connector Hub, MCP Hub, Tool Discovery and Memory-Import surfaces, and whether onboarding can pull data
  in-flow. The connector registry has ~31 real entries; the MCP catalog (`@waggle/shared mcp-catalog.ts`)
  is static; MCP runtime is **stdio-only** (`mcp-runtime.ts:108-115`) and currently never populated
  (`local/index.ts:911`).
- **(b) Options:**
  1. *Real-where-the-substrate-exists, catalog-for-the-rest* — OAuth connectors that already have SDK
     entries connect for real (health-probe + timestamp, no background data-sync — S07 §9 Q1); MCPs
     install via the existing marketplace installer (`installer.ts:580` writes `.mcp.json`); everything
     else renders from the static catalog with honest "available / not installed" states.
  2. *All-mock catalog v1* — nothing actually connects; fastest UI, but violates PRD §22.2 ("no major
     screen depends only on mocked data when backend support exists").
  3. *All-real v1* — build connector background-sync + remote MCP transport now; out of scope per PRD §4.4.
- **(c) RECOMMENDED:** **(1) Real-where-it-exists, catalog-for-the-rest.** Connectors: connect + health
  probe + `lastSyncAt` stamp (defer true data re-pull). MCPs: install/start/stop/test against the static
  catalog via the existing installer + stdio runtime; defer "Remote Registry" transport. Marketplace/Tool
  Discovery: render the live registry, never invent fake entries. Rationale: honors PRD §22.2 and the
  local-first default while staying in-place.
- **(d) Blocks:** **Phase 4** (S07/S08/S21) and the onboarding **Phase 2** import flow (S14/S15). Not P1.

### A5. Marketplace — local catalog vs remote registry initially?
*(PRD §23 Q5, line 1420; gap card S21 §9 Q2, S08 §9 Q4.)*

- **(a) Why it matters:** Whether S21 federates the existing local domains (marketplace.db + connectors +
  templates + personas + models) client-side, or invests in widening `marketplace.db`/`InstallationType`
  to natively catalog all six extension kinds.
- **(b) Options:**
  1. *Federate-at-read (local-first)* — S21 composes the six categories from existing domains; no DB
     change; "Remote Registry" is a later tab. (S21 §9 Q2 recommendation.)
  2. *Native unified catalog table* — widen `marketplace.db` for publish/install/version parity across
     all six kinds. Enables update-tracking but is a real schema investment; conflicts with PRD §22
     "postpone public marketplace".
- **(c) RECOMMENDED:** **(1) Federate-at-read, local catalog first.** Remote registry / public
  marketplace billing stays out per PRD §4.4 + §22. Rationale: matches local-first + in-place; no
  `marketplace.db` migration.
- **(d) Blocks:** **Phase 4** (Marketplace, S21). Not P1/P2.

### A6. Artifact storage — workspace filesystem, virtual store, or external references first?
*(PRD §23 Q6, line 1421; gap card S05 §9 Q1, Q2.)*

- **(a) Why it matters:** Artifacts have **no backing entity today** (the single largest entity gap,
  S10 line 226). PATCH/relations/status/tags require a stable id + an index. The file registry mixes
  ingested inputs with produced outputs, so a `kind`/`status` classification rule is also needed.
- **(b) Options:**
  1. *Per-workspace `artifacts.json` index over the existing workspace FS/virtual store* — mirrors
     `documents.json`; assigns stable ids, holds status/tags/relations; reuses the StorageProvider
     (virtual | local | team) already in the repo. (S05 §9 Q1.)
  2. *Composite synthetic id (`workspaceId:store:name`), no index* — cheapest, but can't persist
     status/tags/relations (PATCH becomes impossible).
  3. *External references only* — point at files elsewhere; defers the entity but breaks "artifacts are
     first-class outcomes" (PRD §6.4).
- **(c) RECOMMENDED:** **(1) `artifacts.json` index over the existing workspace storage**, with a
  classification rule: an artifact is an **explicit produced output** (generated doc/deck/sheet/etc. or
  user-promoted file), not every ingested input. Rationale: gives PATCH/relations a home with no `.mind`
  migration, reuses the StorageProvider, keeps local-first.
- **(d) Blocks:** **Phase 2** (Artifact Center, S05); also gates artifact-sharing in S10. **[BLOCKS P2]**.

### A7. Minimum viable RBAC for team mode?
*(PRD §23 Q7, line 1422; gap card S10 §9 Q1 (blocking), Q2.)*

- **(a) Why it matters:** Three role models disagree: PRD §17.2 (`Owner/Admin/Contributor/Viewer`),
  blueprint (`+Member +Guest`), and the **live `teams.db` CHECK** (`owner/admin/member/viewer`,
  `team.ts:21`). Picking wrong forces a DB CHECK migration + RBAC-logic rewrite. There is also a **real
  bug**: `PUT …/members/:userId` is owner-only (`team.ts:624`) while `PATCH` on the same path is
  owner/admin (`team.ts:649`).
- **(b) Options:**
  1. *Keep the live 4-role union (`owner/admin/member/viewer`)* — map PRD "Contributor" → "Member",
     defer "Guest". No DB migration, no RBAC rewrite. (S10 §9 Q1 recommendation.)
  2. *Adopt PRD §17.2 four roles literally* — rename `member`→`contributor` in the DB CHECK + all
     enforcement (migration + grep-everywhere).
  3. *Adopt blueprint six roles (+Guest)* — new deny-by-default capability rules; largest scope.
- **(c) RECOMMENDED:** **(1) Keep the live union; Contributor==Member; defer Guest.** Also **align the
  PUT/PATCH gate to owner+admin** (PRD uses PATCH; pick the broader gate consistently). Rationale:
  in-place, zero migration, fixes a real inconsistency.
- **(d) Blocks:** **Phase 5** (Team Workspace, S10) — the `TeamRole` type + all member-management UI.
  Not P1/P2, but **must be ratified before S10 coding starts** (S10 §6: "decision needed before coding").

### A8. Memory retention / delete / tombstone behavior?
*(PRD §23 Q8, line 1423; gap cards S04 §9 Q3, S16 §9 Q2.)*

- **(a) Why it matters:** PRD §14.4 distinguishes Deprecated / Archived / Deleted-tombstoned, but
  `memory_frames` has only `importance:'deprecated'` today and no `status`/tombstone column; delete is a
  hard `FrameStore.delete`. Determines whether an additive `.mind` migration is required and what
  "archive" vs "delete" mean to the user.
- **(b) Options:**
  1. *Soft-status via `metadata` JSON, hard-delete on Delete* — store `{status: active|archived|
     deprecated}` in the existing `metadata TEXT` (idempotent `ADD COLUMN` pattern at `db.ts:122` if a
     queryable column is needed); Delete = hard `FrameStore.delete`. Archive = reversible status.
  2. *Full tombstone model* — Delete writes a tombstone row (retained, hidden, syncable) for audit/undo.
     Heavier; needed only if team-sync conflict-resolution requires it.
  3. *No status, delete-only* — simplest, but loses the Archived/Deprecated states PRD §14.4 requires.
- **(c) RECOMMENDED:** **(1) Soft-status in `metadata` (Archive = reversible status, Deprecate = existing
  `importance`), Delete = hard delete with a scope-and-consequence confirmation** (PRD J20). Promote
  `status` to a real column only if it becomes a primary filter axis. Defer full tombstones to the
  team-sync phase. Rationale: local-first, one additive migration at most, satisfies §14.4 states.
- **(d) Blocks:** **Phase 2** (Memory Center, S04) — and shares the confidence/metadata migration
  decision with the onboarding Memory Review (S16, see B2). **[BLOCKS P2]**.

---

## §B — Cross-cutting decisions (block ≥2 screens; not in PRD §23 but surfaced by gap cards)

### B1. Shell topology — keep the bottom-dock OS, or migrate to a left-rail / route-based shell?
*(Gap cards S00 §9 Q1–Q2, Q5; S01 §9 Q4; S11 §9 Q5/Q7; S20 §9 Q7.)*

- **(a) Why it matters:** This is the **Phase-0 IA freeze**. The live shell is a single-route windowed
  OS with a bottom `Dock.tsx`; blueprint/mocks show a **left navigation** + `/home,/workspaces,…` route
  groups. Every later screen's navigation/AppId/dock placement depends on this. Deep-linking + browser
  back-button are the only things real routes buy.
- **(b) Options:**
  1. *In-place dock reframe, keep `AppId`-keyed window navigation* — cheapest, preserves the OS feel and
     multi-window runtime; no react-router. (S00 §9 Q1–Q2 recommendation.)
  2. *Left rail + react-router routes* — closer to the mock, gains deep-linking, but a parallel layout +
     conflicts with multi-window; large blast radius.
- **(c) RECOMMENDED:** **(1) In-place dock reframe; keep windowed `AppId` navigation.** Group dock
  entries into Work / Intelligence / Extend / Team zones to satisfy the IA without a router. Rationale:
  PRD §24 (mocks directional) + locked in-place direction. Revisit deep-linking only if it becomes a hard
  requirement.
- **(d) Blocks:** **Phase 0 → Phase 1** (AppShell/IA, S00) — and the dock/AppId placement of S11/S20
  ("automations" zone) and S01 (`home` vs `cockpit`). **[BLOCKS P1]** — the IA freeze gates everything.

### B2. Memory confidence — heuristic-at-preview vs LLM-classify, and persisted vs preview-only?
*(Gap cards S04 §9 Q1, S16 §9 Q1–Q2; S15 §9.)*

- **(a) Why it matters:** `memory_frames` has no confidence today (only `knowledge_relations.confidence`,
  edges-only, `schema.ts:93`). PRD §12.4 wants "filter by confidence" + "low-confidence surfaced for
  review", and onboarding Memory Review (S16) + the standing J08 review queue both depend on it. Wiring
  the existing `HarvestPipeline` classify/synthesize means paid Haiku/Sonnet calls per import (slow,
  gated on a real embedder); a cheap heuristic avoids that.
- **(b) Options:**
  1. *Cheap heuristic at preview (source-trust × adapter-type × dedup signal), persisted in `metadata`
     when a queryable filter is needed* — fast, no per-import LLM cost; reserve LLM scoring for an opt-in
     deep pass / the J08 standing queue. (S16 §9 Q1 recommendation.)
  2. *LLM classify/synthesize at preview* — real confidence, but onboarding-latency + cost hit.
  3. *No confidence v1* — drops a core PRD trust requirement (§12.4).
- **(c) RECOMMENDED:** **(1) Heuristic for onboarding v1; LLM classify reserved for the standing J08
  queue.** Persist `{kind, confidence, sourceId, status}` in the existing `memory_frames.metadata TEXT`
  via the idempotent `ADD COLUMN` pattern (`db.ts:122`) **only if** confidence/status become queryable
  filters; preview-only needs no migration. Make this one decision once and reuse it across S04 + S16.
  Rationale: honors PRD trust criteria within the onboarding latency budget, local-first, one additive
  migration at most.
- **(d) Blocks:** **Phase 2** — onboarding Memory Review (S16, a day-0 J01 flow) and Memory Center
  filters (S04). **[BLOCKS P2]**. Shares the migration with A8.

### B3. Agent vs Persona boundary, and where the Agent entity is stored.
*(Gap cards S09 §9 Q1, Q3; S18 §9 Q1, Q2.)*

- **(a) Why it matters:** Decides whether Phase 3 introduces a real persisted Agent object (distinct from
  the 13/17 personas in `persona-data.ts`) or just re-skins the persona catalog. PRD §15.5 lists explicit
  agent fields (model, autonomy, memoryScopes, skillIds, connectorIds, mcpIds, permissions, …) that a
  persona does not carry.
- **(b) Options:**
  1. *Real Agent entity in a JSON store (`{dataDir}/agents.json`), referencing `personaId`* — no `.mind`
     migration, mirrors the `agent-groups.json` precedent; persona = behavioral template field of the
     agent. (S09 §9 Q1/Q3 + S18 §9 Q1/Q2 recommendation.)
  2. *`agents` table in `mind/schema.ts` (SCHEMA_VERSION bump)* — heavier; PRD §4.4 non-goal favors
     minimal backend.
  3. *No Agent entity; persona re-skin only* — can't satisfy PRD §12.9 explicit-scope requirements.
- **(c) RECOMMENDED:** **(1) Real Agent entity, JSON store, references `personaId`.** Derive
  `successRate`/`lastRun` at read from `execution_traces` (avoid a third tally vocabulary). Rationale:
  satisfies PRD §12.9/§15.5 with zero migration, in-place over the existing fleet/traces substrate.
- **(d) Blocks:** **Phase 3** (Agent Center S09 + Agent Builder S18). Not P1/P2.

### B4. `/api/*` vocabulary aliasing — singular command, automations, mcps, connectors revoke.
*(Gap cards S03 §9 Q1, S11 §9 Q4, S20 §9 Q4, S07 §9 Q3; backend-api-delta.)*

- **(a) Why it matters:** PRD §16 uses vocabulary (`/api/command/*`, `/api/automations/*`,
  `/api/connectors/:id/revoke`) that differs from the live routes (`/api/commands/execute`, `/api/cron/*`,
  `/api/connectors/:id/disconnect`). Renaming breaks existing callers (`adapter.executeCommand`,
  `commands.ts`, `cron.ts`); aliasing keeps both contracts.
- **(b) Options:**
  1. *Add PRD-vocabulary aliases alongside the live routes* — new `command.ts`/`automations.ts` alias
     plugins that delegate to the existing registry/cron; existing callers unbroken. (S03/S11/S20
     recommendations converge on this.)
  2. *Hard-rename to PRD vocabulary* — clean surface, but breaking; needs exhaustive grep (CLAUDE.md §3.5).
- **(c) RECOMMENDED:** **(1) Alias, don't rename.** New singular/plural aliases that delegate to the
  existing handlers; UI/adapter point at the PRD vocabulary. Rationale: in-place, non-breaking, matches
  the backend-api-delta dispositions.
- **(d) Blocks:** **Phase 1** (Command Center S03) for `/api/command/*`; **Phase 3** (S11/S20) for
  `/api/automations/*`; **Phase 4** (S07) for connector revoke. The command alias is **[BLOCKS P1]**.

### B5. Tier-vocabulary unification (`UserTier` / `BillingTier` / `PlanTier` + RBAC roles).
*(Gap cards S00 §9 Q3, S08 §9 Q6.)*

- **(a) Why it matters:** Three independent tier vocabularies gate the dock, billing, and feature access;
  PRD §17 RBAC roles add a 4th axis. MCP Hub (S08) and the dock (S00) both need a single answer for
  "is this gated PRO+ or power-user-density".
- **(b) Options:**
  1. *Document the mapping, defer unification* — keep the three vocabularies, ship a single mapping table
     and a `useFeatureGate` that reads the canonical `tiers.ts`; no cross-cutting rewrite now.
  2. *Unify into one tier model now* — clean, but cross-cutting (billing + dock + features + RBAC) during
     a high-velocity refactor.
- **(c) RECOMMENDED:** **(1) Document the mapping + route all new gates through `@waggle/shared tiers.ts`
  (`TierCapabilities`); defer the unification refactor.** Gate MCP Hub + Marketplace install at **PRO+**
  (matches the existing marketplace install gate). Rationale: avoids a cross-cutting rewrite mid-refactor;
  reuses the canonical tier system; no parallel gate (S10 §6).
- **(d) Blocks:** **Phase 4** (S08 tier gate) primarily; informs the dock gate in Phase 0/1. Not P1
  blocking if the mapping is documented.

### B6. `MemoryKind` / `ImportItemType` / FE `MemoryFrame.type` reconciliation.
*(Gap cards S04 §9 Q6, S16 §9 Q3.)*

- **(a) Why it matters:** Three vocabularies disagree: FE `MemoryFrame.type` (`event`/`insight`/…),
  PRD §15.2 `MemoryKind` (`fact|decision|task|preference|strategy|learning|goal|entity`), and the harvest
  adapter's 8 `ImportItemType` values. Memory Review categories (Memories/Decisions/Tasks/Artifacts/
  Projects) need a 1:1 map. Wrong choice re-renders existing frames and changes the type-filter chips.
- **(b) Options:**
  1. *Adopt PRD §15.2 `MemoryKind` as canonical; add a pure `lib/harvest-kind-map.ts` mapping
     `ImportItemType → MemoryKind` and a display-category map* — drop FE `event`/`insight`, add
     `preference/strategy/learning/goal`. (S04 §9 Q6 + S16 §9 Q3 direction.)
  2. *Keep FE types, map PRD onto them* — less churn now, perpetuates drift (precedent: the FrameSource
     TS-vs-DB drift the shared-types-delta warns against).
- **(c) RECOMMENDED:** **(1) PRD §15.2 `MemoryKind` canonical, in `@waggle/shared`; pure mapping helpers
  for harvest + display categories.** Rationale: one source of truth (shared-types-delta §0 rule), avoids
  perpetuating drift, keeps the import/review/center contract consistent.
- **(d) Blocks:** **Phase 2** (S04 + S16). **[BLOCKS P2]**.

### B7. `ExtensionType` union — add `agent`, keep `external_tool`, or both?
*(Gap card S21 §9 Q1; PRD §12.13 vs §15.2.)*

- **(a) Why it matters:** PRD §12.13 marketplace categories include **Agents** but `ExtensionType`
  (§15.2) omits `agent` and adds `external_tool`. The two PRD sections contradict; S21's faceted catalog
  needs a canonical union.
- **(b) Options:**
  1. *`skill | agent | connector | mcp | model | template`* — matches the §12.13 visible categories;
     drop `external_tool` (external tools surface via connectors/MCPs anyway).
  2. *Keep §15.2 literally (`…| external_tool`, no agent)* — but then Agents have no marketplace category.
  3. *Superset of 7 (`…| external_tool | agent`)* — covers both, at the cost of an unused-for-now member.
- **(c) RECOMMENDED:** **(1) `skill | agent | connector | mcp | model | template`.** Rationale: PRD §12.13
  is the user-visible contract; external tools are already represented by connectors/MCPs, so `agent`
  earns the slot. Define once in `@waggle/shared`.
- **(d) Blocks:** **Phase 4** (Marketplace, S21). Not P1/P2.

### B8. Identity store of record for onboarding profile.
*(Gap card S13 §9 Q1; S01 §9 (greeting name).)*

- **(a) Why it matters:** Two identity stores exist — `/api/profile` (current onboarding write path) and
  `/api/identity` (the `identity` table that backs the Home greeting name / `adapter.getIdentity()`).
  Writing only one leaves the other stale (e.g. Home greets with an empty name).
- **(b) Options:**
  1. *Onboarding writes profile AND seeds identity* — single round-trip extension; Home greeting works
     immediately. (S13 §9 Q1 direction.)
  2. *Profile-only, derive identity lazily* — fewer writes, but Home greeting drift until first identity write.
- **(c) RECOMMENDED:** **(1) Write profile + seed identity in the same onboarding commit.** Rationale:
  prevents the two-store drift the gap card flags; cheap; makes the Phase-1 Home greeting correct.
- **(d) Blocks:** **Phase 2** (onboarding S13) and the **Phase 1** Home greeting depends on identity
  being populated. Practically **[BLOCKS P1]** for a correct greeting; functionally a small fix.

---

## §C — Screen-local questions (single-screen scope; ratify with the owning card)

> These do not block other screens. Each carries a default recommendation consistent with the locked
> direction; founder can rubber-stamp or override per screen. Cited to the gap card for full context.

- **C1. S01 Q1 — LoginBriefing fate.** Retire the modal; absorb catch-up into Home Cockpit's first paint
  (~80% overlap). **Rec: retire + absorb.** *(Phase 1.)*
- **C2. S01 Q2 — "Overnight" time-window semantics** (since last close vs midnight vs 12h). **Rec: since
  last app close, fallback midnight-local.** *(Phase 1.)*
- **C3. S01 Q6 — Quick-capture `file` destination** (default/personal store vs prompt for workspace).
  **Rec: default personal store + optional workspace picker.** *(Phase 1/2.)*
- **C4. S02 Q1 — Workspace Desktop window vs full-bleed route.** **Rec: maximized `AppWindow`** (no
  parallel layout system). *(Phase 1.)*
- **C5. S02 Q2 — Overview chat: live mini-composer vs read-only preview.** **Rec: read-only preview that
  deep-links to the Chat tab** (avoids dual ChatApp render modes in v1). *(Phase 1.)*
- **C6. S02 Q3 / S17 Q1 — `WorkspaceType` enum values.** **Rec: `project | client | research | personal`
  (+`team`/`organization` reserved); `type` coexists with the free-string `group`.** *(Phase 1/2.)*
- **C7. S02 Q6 — Tasks store of record** (`/api/workspaces/:id/tasks` vs `WorkspaceState`
  `pending`/`blocked`). **Rec: seed Tasks from `WorkspaceState` for v1; reconcile to a first-class task
  store only if editing is needed.** *(Phase 1.)*
- **C8. S03 Q4 — Natural-language commands** (heuristic vs LLM). **Rec: deterministic heuristic
  intent-parse v1; LLM resolver later.** *(Phase 1.)*
- **C9. S03 Q5 — Palette permission prompt mechanism.** **Rec: reuse the chat approvals pipeline
  (`approval.ts` + `pendingApproval`).** *(Phase 1.)*
- **C10. S04 Q2 — Conflict state: live recall-time vs persisted.** **Rec: live recall-time signal v1**
  (`CombinedRetrieval.detectConflict`); persist only if a standing conflict queue is needed. *(Phase 2.)*
- **C11. S04 Q4 — Merge semantics.** **Rec: re-cognify/concatenate v1, archive originals (not hard
  delete); LLM-synthesis later.** *(Phase 2.)*
- **C12. S05 Q5 — Artifact previews.** **Rec: icon + on-click `FilePreview` v1; no server thumbnails.** *(Phase 2.)*
- **C13. S06 Q2 / S19 Q1 — Skill Builder publish target** (local dir vs marketplace). **Rec: Builder =
  create-to-local (`POST /api/skills/create`); install-by-id + marketplace publish live in S06/S21.** *(Phase 3.)*
- **C14. S06 Q4 / S19 Q2 — Inputs/Outputs persistence** (frontmatter vs body markdown). **Rec: body
  markdown v1; extend `SkillFrontmatter` only if inputs/outputs must be queryable.** *(Phase 3.)*
- **C15. S06 Q6 / install-audit `critical` CHECK bug.** Real bug: `AuditRiskLevel` TS includes `critical`
  but the DDL CHECK allows only `low/medium/high` (`install-audit.ts:65` vs `:16`) — a `record()` with
  `critical` throws; skill/MCP/connector installs route through this path. **Rec: ship the one-line CHECK
  migration to add `critical`** (additive, idempotent-migration pattern at `db.ts:122`), OR make the
  marketplace `CRITICAL → 'high' + approvalClass:'blocked'` mapping the permanent contract. **Pick the
  migration** for correctness. *(Phase 4; cross-cuts any install-audit write.)*
- **C16. S07 Q1 — Connector "sync now" semantics.** **Rec: v1 = re-probe health + stamp `lastSyncAt`**;
  background data re-pull deferred. *(Phase 4.)*
- **C17. S07 Q3 — revoke vs disconnect.** **Rec: `revoke` purges OAuth tokens + writes a stronger audit
  entry (PRD §17.3); `disconnect` is the lighter alias.** *(Phase 4.)*
- **C18. S07 Q4 / S08 — Audit route shape.** **Rec: one shared `GET /api/extend/audit?type=` serving
  connectors + MCPs + marketplace**, bound to `personal.mind`. *(Phase 4.)*
- **C19. S08 Q2 — MCP scope model** (single `workspaceId` vs `mcpIds[]` N:N). **Rec: single-`workspaceId`
  config v1 (matches the stdio runtime); N:N membership deferred.** *(Phase 4.)*
- **C20. S08 Q4 — "Remote Registry" tab.** **Rec: defer remote-transport MCPs (runtime is stdio-only);
  v1 tab points at the static catalog / Composio gateway reference, no new transport.** *(Phase 4.)*
- **C21. S08 Q5 / S21 Q5 — MCP "test" semantics.** **Rec: live spawn-and-`isHealthy()`/`tools/list`
  round-trip** where cheap; fall back to static manifest validation. *(Phase 4.)*
- **C22. S09 Q6 — Agent categories taxonomy.** **Rec: Templates is a side affordance, not a tab; tabs =
  All/Personal/Workspace/Team/Autonomous/Archive.** *(Phase 3.)*
- **C23. S09 Q7 / S18 Q3 — `/run` target + lifecycle.** **Rec: fleet-spawn a one-shot into a chosen
  workspace (picker if multiple `workspaceIds`); persistent always-running agents deferred.** *(Phase 3.)*
- **C24. S11 Q1 / S20 Q1 — Automation triggers: schedule-only vs event-driven.** **Rec: schedule-only v1
  (cron cadence); gate/defer the "Event" trigger (no event→automation dispatch substrate today).** *(Phase 3.)*
- **C25. S11 Q2 / S20 Q2 — Condition step.** **Rec: store an advisory `jobConfig.condition` string (no
  evaluation engine) v1.** *(Phase 3.)*
- **C26. S11 Q3 / S20 Q3 — Builder "test run".** **Rec: add a no-persist dry-run route (`POST
  /api/automations/test`); do NOT reuse the real `cron/:id/trigger` which executes + auto-enables.** *(Phase 3.)*
- **C27. S11 Q6 — Analytics tiles.** **Rec: keep success-rate (derivable from `cron_execution_history`);
  drop "hours saved" (no source) or label it an explicit heuristic estimate.** *(Phase 3.)*
- **C28. S12 Q1 — Onboarding language selector.** **Rec: static disabled `English (US)` chip (no i18n
  exists; PRD §4.4 puts i18n out of first-phase scope).** *(Phase 2.)*
- **C29. S12 Q2 — First-launch 3s auto-advance on the privacy screen.** **Rec: drop the auto-advance**
  (it fights the read-the-privacy-note intent). *(Phase 2.)*
- **C30. S13 Q3 — Work-type vs Industry vs Template axis.** **Rec: keep Work type as a distinct
  personalization signal; don't re-ask what the template already implies (PRD §12.12).** *(Phase 2.)*
- **C31. S14 Q2 — Tool Discovery id-space.** **Rec: unify under a namespaced scheme
  (`connector:gmail` / `tool:cursor`) so the recommender + S15 disambiguate.** *(Phase 2.)*
- **C32. S14 Q3 — Pre-check detected AI tools.** **Rec: pre-select from `GET /api/tools/detect` with a
  visible "detected" badge** (J01 implies a trusted populated start). *(Phase 2.)*
- **C33. S15 Q2 / S16 Q5 — Import↔Review commit split.** **Rec: S15 stages previews, S16 commits the
  approved selection** (PRD:646/1207 "nothing imports without review/approval"; current code commits at
  S15 — fix). Splits onboarding into the Import + Review steps. *(Phase 2; correctness-relevant.)*
- **C34. S15 Q1 — Hermes/Codex/Cursor tiles.** **Rec: render as `upload`/"Other" file pickers or
  "coming soon" v1** (they are AI-OS launcher/hook surfaces, not harvest adapters). *(Phase 2.)*
- **C35. S17 Q5 — Workspace Creation: install-on-create vs stage selections.** **Rec: record connector/
  MCP ids as workspace *intent* on the config; do NOT run install/OAuth at create time.** *(Phase 2.)*
- **C36. S19 Q4 — Skill scope vocabulary** (`enterprise` vs PRD `organization`). **Rec: adopt PRD
  `organization`** for the publish-scope picker (align to the §15.2 `Scope` union). *(Phase 3.)*
- **C37. S19 Q5 — Skill test-run fidelity.** **Rec: preview-only (injected-prompt + parsed metadata) v1**;
  live LLM dry-run deferred. *(Phase 3.)*

---

## Phase-blocking summary (founder fast-path)

**Before Phase 0/1 coding** (the spine): ✅ **RATIFIED 2026-06-09** — **B1** (shell topology / IA freeze),
**A1** (fixed layout), **A2** (Home personal-only), **B4** (command alias), **B8** (identity seed for
greeting). **Phase 0 is unblocked.**

**Must ratify before Phase 2** (work + onboarding): **A6** (artifact storage entity), **A8** (memory
retention/delete), **B2** (confidence: heuristic + optional migration), **B6** (MemoryKind canonical),
**A3** (graph keep — default yes), plus the onboarding correctness item **C33** (Import stages / Review
commits).

**Phase 3+ (intelligence/extend/team), not blocking P1–P2:** **A4, A5, A7, B3, B5, B7** + all remaining
§C items. Note **A7** (RBAC) must be ratified before S10 coding specifically, and **C15** (install-audit
`critical` CHECK bug) should be fixed before any install-audit write path ships in Phase 4.
