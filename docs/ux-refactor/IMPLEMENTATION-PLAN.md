# Waggle OS UX Refactor — Master Implementation Plan

> **This is a sequenced INDEX, not a re-paste.** Each phase references the detailed gap cards
> (`gap-cards/S00..S21.md`) and deltas (`deltas/*.md`) that carry the full build spec. It exists to
> put them in one coherent, dependency-ordered, full-stack sequence under the locked execution model.
> The PRD (`../Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_UX_Refactor_PRD.md`) is the
> source of truth; this plan resolves PRD §8, PRD §21 sprints, and Blueprint §19 roadmap into a single
> **Phase 0..6**. Every backend claim is grounded in `docs/backend-map/` or live source.

---

## 1. Executive summary, locked decisions, and the 8 non-negotiable product rules

### Executive summary

Waggle OS is today a single-route windowed desktop OS (`apps/web/src/components/os/Desktop.tsx` +
`Dock.tsx`; 27 `AppId` window types; no react-router) sitting on a deep, mostly-built backend substrate.
The refactor converts it into a **workspace-first Agent Desktop** whose spine is **Home Cockpit →
Workspace Desktop → Win+K → visible Memory/Artifacts → Agents/Skills/Automations → governed Extend →
Team**. We deliver this as an **in-place incremental refactor** of `apps/web` + **targeted local-sidecar
extensions** — reusing `workspace-manager`, the `workspace-state` builder, the `.mind` schema, the
harvest pipeline, `install-audit`, and the approval/trust runtime. The total backend work resolves to
**53 endpoints** (35 net-new + 18 extend), **5 new sidecar route files** (`home.ts`, `command.ts`,
`artifacts.ts`, `agents.ts`, `mcps.ts`) + 1 alias plugin (`automations.ts`), **2 new JSON-file stores**
(`agents.json`, `artifacts.json`), **~13 new design-system components**, and **at most one conditional
SQLite migration** (`memory_frames.metadata`). All 21 numbered screens + the AppShell are covered.

### Locked decisions (founder, via PRD)

1. **In-place INCREMENTAL refactor** of `apps/web` + targeted backend extensions. NOT a rebuild.
2. **FULL-STACK** scope (net-new/extended backend APIs *and* frontend).
3. **Mockups are DIRECTIONAL** (PRD §24); PRD acceptance criteria win over pixels.
4. **Local-first by default** — desktop FE talks ONLY to the local sidecar (`:3333`).
5. **Backend-map is the contract reference**; ground every backend claim there or in live source.

### The 8 non-negotiable product rules (condensed handoff §"Non-negotiable product rules"; PRD §6)

1. **Workspace is the primary object.** Everything happens inside or across workspaces.
2. **Win+K is always available** — search, launch, run, create, navigate, extend, from anywhere.
3. **Memory is visible, inspectable and editable** — source, confidence, scope, evidence, edit/delete.
4. **Artifacts are outcomes, not attachments** — documents/decks/sheets/dashboards/research are first-class.
5. **Connectors and MCPs live in Extend, not hidden Settings.**
6. **Agents must declare scope, model, memory, tools, skills, permissions, and autonomy** (no hidden access).
7. **No import or elevated tool access without explicit user approval.**
8. **Use existing backend foundations wherever possible** (do not duplicate backend state logic in the FE).

> PRD §20.4 "Avoid": do not add top-level apps that don't fit the IA; do not duplicate backend state
> calc in the FE; do not hide connectors/MCPs in Settings; **do not default to blank chat on launch**;
> do not let agents/automations gain hidden access.

---

## 2. Current state in one paragraph (from the inventories)

The FE is a **single `/` route** (`apps/web/src/pages/Index.tsx` → `BootScreen` → `Desktop`); all
"navigation" is window management in `useWindowManager.ts` keyed by `AppId` (27 ids in `lib/dock-tiers.ts`;
a stale 8-id `AppView` union and dead `terminal/calculator/notes` ids are cleanup candidates). The dock
(`Dock.tsx` + `lib/dock-tiers.ts`) already supports **zone-parent flyouts**, which is the hook for the new
Work/Intelligence/Extend/Team IA without a router. The single backend gateway is `lib/adapter.ts`
(~1930 LOC, ~150 methods); domain hooks (`useWorkspaces`, `useChat`, `useMemory`, …) wrap it. The
sidecar already serves **16 of 65** PRD §16 endpoints as-is and **30 more partially**; the rich substrate
already present includes: the `workspace-state` builder + `WorkspaceNow` block (Home/Workspace seed), the
full harvest engine (preview/commit/sources), `install_audit` + `trust-model` + the `confirmation.ts`
approval gate + persistent grants + the `approval_required` SSE event, the EU-AI-Act `ai_interactions`
append-only store, `cron` (the Automations capability), `teams.db` RBAC CRUD, and the `knowledge_*` graph.
The biggest **genuine gaps** are: **no Artifact entity/route** anywhere, **no sidecar `/api/agents/*`**
(only the cloud server has it), **MCP runtime never populated** (`local/index.ts:911`), and **memory has
no confidence/provenance/metadata column**. Design-wise the Hive DS (`ui/*`, ~50 shadcn primitives +
`waggle-theme.css` tokens) covers most needs; ~13 product-typed components are net-new.

---

## 3. Phase table (Phase 0..6)

> **Numbering reconciliation.** Three sources order the work slightly differently:
> **PRD §8** (Phase 0-5) and **PRD §21** (Sprint 1-9) put **Intelligence/builders (P3) BEFORE Extend
> (P4)**; the **Blueprint §19 roadmap** and the **condensed handoff sequence** put **Extend BEFORE
> builders**. The `backend-api-delta.md` already commits to the **PRD §8 ordering**. Because **the PRD
> wins** (locked decision 3 + "PRD acceptance criteria win"), this plan adopts **PRD §8 phase numbering**:
> P0 Align → P1 Core Runtime → P2 Work+Onboarding → **P3 Intelligence** → **P4 Extend** → P5 Team →
> **P6 Hardening** (PRD §21 Sprint 9 / Blueprint Phase 7, promoted to a first-class phase because PRD §26
> DoD #10 "all screens have required states" is otherwise the weakest-traced item — see coverage-check
> GAP-D4). Phases 3 and 4 are independent (see §4) and MAY be parallelized by separate streams, but the
> default sequence is PRD order.

**Verification gate for EVERY phase** (CLAUDE.md §2 — run, do not claim):
```
npx tsc --noEmit --project packages/shared/tsconfig.json      # if shared types touched
npx tsc --noEmit --project packages/hive-mind-core/tsconfig.json  # if substrate/migration touched
npx tsc --noEmit --project packages/server/tsconfig.json      # sidecar routes (NOT typechecked by npm run build)
npx tsc --noEmit --project packages/agent/tsconfig.json       # if agent runtime touched
npm run build           # typechecks apps/web (the FE)
npm run test -- --run   # vitest unit
npm run lint            # ESLint repo-wide (no-explicit-any is error repo-wide per CLAUDE.md §10)
```
Build order matters (CLAUDE.md §2 / MEMORY 0601 S3): **shared → hive-mind-core → core → agent → server**.

---

### Phase 0 — Architecture alignment & IA freeze

- **Goal:** freeze the IA + route/vocabulary names; establish the shared-type spine + DS token layer that
  every later write-path depends on. No new endpoints. (PRD §8 Phase 0 / §21 Sprint 1 / Blueprint P0.)
- **Screens delivered:** **S00 (AppShell + IA + Navigation)** — partial: the shell reframe + nav labels +
  Win+K provider skeleton. (Full Win+K UX lands in P1/S03.)
- **Frontend tasks**
  - *Keep-promote:* `Dock.tsx` + `lib/dock-tiers.ts` zone-parent model → regroup dock entries into
    **Work / Intelligence / Extend / Team / System** zones (PRD §10 IA) — no react-router (see open-question
    **B1**, recommended: in-place dock reframe, keep windowed `AppId` navigation). `Desktop.tsx`
    `appConfig` + `renderAppContent` switch stays the navigation engine.
  - *Rework:* consolidate the dual app-id union onto `AppId`; delete stale `AppView` + dead ids
    (`terminal/calculator/notes`) (`_inventory/frontend.md` §b). Add the **global Win+K provider** shell
    (compose `ui/command.tsx`; absorb `overlays/GlobalSearch.tsx`).
  - *Create:* `components/os/AppShell.tsx` (compose `ui/sidebar.tsx` + `ui/scroll-area.tsx`),
    `WorkspaceSwitcher` (compose `ui/command.tsx` + `ui/dropdown-menu.tsx`), the `--sem-*` token alias layer.
  - **DoD #1 launch-flip (coverage-check GAP-D1):** change the boot default route so launch lands in
    **Home Cockpit**, not blank chat — S00 explicitly owns this (`pages/Index.tsx`/`Desktop.tsx` initial
    window). Even though S01 builds later, the routing decision is frozen here.
- **Backend tasks** (no routes; `backend-api-delta.md` "Phase 0")
  - `WorkspaceConfig` V2 additive optional fields (`description, type, status, agentIds[], connectorIds[],
    mcpIds[], updatedAt, lastActiveAt`) on `packages/hive-mind-core/src/workspace-manager.ts:5-58` +
    `CreateWorkspaceOptions:60-95`. **JSON file (`workspace.json`) — NO DB migration.**
  - Write-side stamps: `updatedAt` in `update()` (`workspace-manager.ts:222`); `lastActiveAt` from the
    chat/agent loop.
- **Shared-types changes** (`shared-types-delta.md` §1): add the PRD §15.2 union block to
  `packages/shared/src/types.ts` (`WorkspaceType, Scope, Confidence, MemoryKind, ArtifactKind, AgentType,
  AutonomyLevel, ExtensionType`) + export `interface WorkspaceConfigV2`; FE imports them into
  `apps/web/src/lib/types.ts`. **Enums live once in `@waggle/shared`** (no cross-file union duplication).
- **Design-system pieces** (`design-system-delta.md` §b): add `--sem-work/-intelligence/-healthy/
  -attention/-risk` alias vars in `waggle-theme.css` mapping to existing `--status-*` tokens. No new base
  palette. Build `AppShell` + `WorkspaceSwitcher` (compose existing primitives).
- **Exit criteria → PRD acceptance:** IA + route names frozen (no major UX ambiguity, Blueprint P0);
  shared types compile across packages; **launch no longer defaults to blank chat** (DoD #1 routing
  decision committed); dock shows the 5 IA zones.
- **Verify:** full gate; specifically `tsc` on `shared` + `hive-mind-core` (V2 fields) + `apps/web`.

---

### Phase 1 — Core runtime: Home Cockpit, Workspace Desktop, Win+K

- **Goal:** the daily spine. A returning user "can continue work in under 30 seconds" (Blueprint P2 exit).
  (PRD §8 Phase 1 / §21 Sprints 2-3 / Blueprint P1-P2.)
- **Screens delivered:** **S01 Home Cockpit**, **S02 Workspace Desktop**, **S03 Win+K Command Center**
  (S00 Win+K provider completed here).
- **Frontend tasks**
  - *Keep-promote:* `components/os/WorkspaceBriefing.tsx` → **Home Cockpit** widgets (PRD §20.1 named seed);
    `DashboardApp.tsx` (workspaces grid) folds into Home. `ChatWindowInstance` `WorkspaceBriefing` home
    screen is the precedent.
  - *Create (S01):* `HomeCockpit` (PRD §20.3) — greeting + ranked workspace cards + suggested actions +
    overnight summary + quick-capture. Retire `overlays/LoginBriefing.tsx`, absorb its catch-up into first
    paint (open-question **C1**).
  - *Create (S02):* `WorkspaceDesktop` as a **maximized `AppWindow`** (open-question **C4/A1** — fixed
    layout v1, no parallel grid engine) with the **8 §12.2 tabs** incl. the **Settings tab** (coverage-check
    G1) and a Tasks tab seeded from `WorkspaceState` (open-question **C7**). Sessions surface via Timeline +
    Win+K (coverage-check G2 — document this, do not build a separate Sessions screen v1).
  - *Create (S03):* `CommandCenter` Win+K overlay on the P0 provider; result groups for the 6 verbs
    (search/launch/create/run/navigate/extend). Reuse the chat approvals pipeline for gated commands
    (open-question **C9**).
- **Backend tasks** (`backend-api-delta.md` Phase 1)
  - **New `routes/home.ts`:** `GET /api/home/briefing` (NET-NEW; cross-workspace ranker over
    `buildWorkspaceState()`/`buildWorkspaceNowBlock()`), `GET /api/home/overnight` (NET-NEW; since-last-login
    window).
  - **Extend `memory.ts`:** `POST /api/quick-capture` (thin handler → memory write + awareness row for tasks).
  - **Extend `workspaces.ts`:** `GET /api/workspaces/:id/state` (thin route over the existing builder),
    `GET /api/workspaces/:id/activity` (thin alias over events).
  - **New `routes/command.ts`:** `GET /api/command/search` (federates memory/workspaces/skills/sessions),
    `GET /api/command/recent`, `GET /api/command/suggestions` (NET-NEW); `POST /api/command/execute`
    (EXTEND/alias over existing plural `/api/commands/execute` — **alias, don't rename**, open-question **B4**).
  - *No backend* for S02 Tasks/Members/status-bar (all exist; compose client-side).
- **Shared-types changes:** FE `Workspace` view-model gains `description?/type?/status?/…` (`shared-types-delta`
  §2b); NEW shared `Command`/`CommandResult` (`shared-types-delta` §9); seed identity on the greeting path
  (open-question **B8** — onboarding writes profile AND identity so Home greets by name).
- **Design-system pieces:** `WorkspaceCard`, `EmptyState`, `ErrorState`, `Skeleton` compositions,
  `ActivityFeed`, `Timeline` (extract from `TimelineApp.tsx` + `lib/timeline-events.ts`), the Win+K
  `CommandCenter` shell with a11y (`aria-label`, focus trap from cmdk).
- **Exit criteria → PRD acceptance:** PRD §22.1 "land in Home Cockpit and continue useful work" +
  "use Win+K to find and run all major actions"; DoD #1/#2/#3. Home renders first-run-empty + daily +
  attention + overnight-failure states (PRD §14.2); Win+K covers all 6 verbs (PRD §12.3).
- **Verify:** full gate; `tsc` on `server` (new `home.ts`/`command.ts`) + `apps/web`.

---

### Phase 2 — Work layer: Memory Center, Artifact Center, Onboarding, Workspace Creation

- **Goal:** memory + outcomes are visible and actionable; the day-0 onboarding chain works end-to-end.
  (PRD §8 Phase 2 / §21 Sprints 4-5 / Blueprint P3.)
- **Screens delivered:** **S04 Memory Center**, **S05 Artifact Center**, **S12 First Launch**,
  **S13 Who Are You**, **S14 Tool Discovery**, **S15 Memory Import**, **S16 Memory Review**,
  **S17 Workspace Creation**.
- **Frontend tasks**
  - *Rework:* `MemoryApp.tsx` → **Memory Center** (PRD §20.2) with source/confidence/evidence/scope +
    edit/merge/archive/delete; keep the working Graph tab (open-question **A3** — ship in v1) and the
    Harvest/Weaver/Wiki/Evolution tabs.
  - *Create (S05):* `ArtifactCenter` (PRD §20.3) grid/table + DetailDrawer + cross-object related search.
  - *Rework onboarding (PRD §20.2):* keep `OnboardingWizard.tsx` shell, redesign into the 5-step
    profile→tool-discovery→import→review→workspace chain (S12-S17), retrofitting the new `BuilderStepper`.
    **Split Import (stages previews) from Review (commits)** — current code commits at S15; fix per
    open-question **C33** ("nothing imports without review/approval").
- **Backend tasks** (`backend-api-delta.md` Phase 2)
  - **Extend `memory.ts`:** `GET /api/memory` (alias), `GET /api/memory/:id` (NET-NEW thin),
    `POST /api/memory` (alias), `PATCH /api/memory/:id` (PATCH+bare id), `POST /api/memory/:id/archive`
    (NET-NEW thin), `DELETE /api/memory/:id` (alias), `POST /api/memory/merge` (NET-NEW logic).
  - **Extend `harvest.ts`:** `preview` returns all items + per-item `confidence` + normalized `kind`;
    `commit` accepts `{selectedIds}`; new thin `POST /api/harvest/sources/:id/sync`.
  - **New `routes/artifacts.ts`** (largest net-new domain — aggregation only, no new data store):
    `GET /api/artifacts`, `POST`, `GET/:id`, `PATCH/:id`, `DELETE/:id`, `GET /api/artifacts/search-related`.
    Backed by a lightweight **`artifacts.json` index** over the existing file/document/storage stores
    (open-question **A6** — classification rule: artifact = explicit produced output, not every input).
  - **Extend `workspaces.ts`** (S17): richer `POST /api/workspaces` body (Phase-0 V2 fields); optionally
    extend `WorkspaceTemplate` shape. Record connector/MCP ids as **intent**, do not install at create time
    (open-question **C35**).
  - **Extend `profile.ts`** (S13): add `workType/teamSize/goals` to the allow-list; write profile AND seed
    identity (open-question **B8**). *S12/S14 need ZERO net-new backend* (catalogs already have routes).
- **Shared-types changes:** NEW shared `Memory` entity + FE view-model (`shared-types-delta` §3); NEW
  `Artifact` everywhere (§4); adopt PRD §15.2 `MemoryKind` canonical + a pure `lib/harvest-kind-map.ts`
  (open-question **B6**); confidence: heuristic at preview, LLM reserved for the standing J08 queue
  (open-question **B2**).
- **Migrations** (`backend-api-delta.md` §M): **M1 — `memory_frames.metadata TEXT` (CONDITIONAL)** — ship
  it *only* if persisted confidence/scope/status becomes a real filter axis (open-questions **A8/B2**); the
  idempotent ADD-COLUMN pattern is at `hive-mind-core/src/mind/db.ts:116-124`. **M1' — `artifacts` index**
  is a JSON file (no DB). Default: preview-only confidence + in-app filtering needs **no migration**.
- **Design-system pieces:** `ConfidenceBadge`, `EvidenceChip` (promote the `MemoryApp.tsx` provenance
  pill), `EvidencePanel`, `DetailDrawer` (wrap `ui/sheet.tsx` right-side), `StatusBadge` (semantic +
  non-color indicator — the biggest a11y gap vs `ui/badge.tsx`), `ViewToggle`, `BuilderStepper`
  (retrofit onboarding), `MemoryCard`/`ArtifactRow`.
- **Exit criteria → PRD acceptance:** PRD §22.1 "inspect and edit memory"; DoD #4 (source/confidence/
  evidence/scope/edit/delete) + #5 (artifact outcome + related search, the "Germany GTM" cross-object
  acceptance PRD §12.5) + #6 (onboarding chain). Memory states §14.4 + Extension/Workspace states render.
- **Verify:** full gate; if M1 ships, `tsc` + `npm run test` on `hive-mind-core` (migration) + a migration
  round-trip test; `tsc` on `server` (new `artifacts.ts`) + `apps/web`.

---

### Phase 3 — Intelligence layer: Agents, Skills, Automations (+ builders)

- **Goal:** users can create/run the core intelligence objects with validation + review. (PRD §8 Phase 3 /
  §21 Sprint 6 / Blueprint P5 "Builders".) **Independent of Phase 4** (see §4).
- **Screens delivered:** **S09 Agent Center**, **S18 Agent Builder**, **S06 Skills Hub**, **S19 Skill
  Builder**, **S11 Automation Center**, **S20 Automation Builder**.
- **Frontend tasks**
  - *Rework:* `AgentsApp.tsx` (Personas) → **Agent Center** tabs (All/Personal/Workspace/Team/Autonomous/
    Archive; Templates is a side affordance — open-question **C22**); `CapabilitiesApp.tsx` → **Skills Hub**;
    `ScheduledJobsApp.tsx` → **Automation Center**.
  - *Create:* `AgentBuilder` (PRD §20.3, §12.9 stepper — declares goal/scope/model/memory/tools/skills/
    permissions/autonomy), `SkillBuilder` (§12.6 stepper), `AutomationBuilder` (§12.10 stepper). Reuse the
    `BuilderStepper` from P2.
- **Backend tasks** (`backend-api-delta.md` Phase 3)
  - **New `routes/agents.ts`** (sidecar `/api/agents/*` is absent — only the cloud server has it):
    `GET /api/agents`, `POST`, `GET/:id`, `PATCH/:id` (NET-NEW over a new **`agents.json`** store, mirrors
    `agent-groups.json` — open-question **B3**); `POST /api/agents/:id/run` (EXTEND → real executor
    `POST /api/fleet/spawn`, NOT the `agent-groups/:id/run` stub), `POST /api/agents/:id/pause` (EXTEND →
    fleet pause), `GET /api/agents/:id/traces` (NET-NEW read over `execution_traces`).
  - **Extend `skills.ts`:** `PATCH /api/skills/:id` + `POST /api/skills/:id/test` (`:id` variants over the
    existing name-keyed handlers); `POST /api/skills/:id/install` (NET-NEW dispatcher: starter/pack/
    marketplace). Skill **create** is the existing `POST /api/skills/create` (the Builder's real target).
  - **New `automations.ts` alias plugin over cron:** `GET/POST/PATCH /api/automations`, `/:id/run`,
    `/:id/pause`, `/:id/logs` (all EXTEND aliases over `/api/cron/*`); `POST /api/automations/test`
    (NET-NEW no-persist dry-run — do NOT reuse `cron/:id/trigger` which executes+auto-enables,
    open-question **C26**). Also fix the FE bug: `updateCronJob` calls `PUT` but only `PATCH` is registered
    (`adapter.ts:836` vs `cron.ts`). Triggers/conditions/actions ride the existing `job_config TEXT` blob —
    **no migration**. Schedule-only triggers v1; defer Event triggers (open-question **C24**).
- **Shared-types changes:** MODIFY shared `AgentDef` with §15.5 fields + NEW FE `Agent` view-model
  (`shared-types-delta` §5); NEW `Skill` entity (§6); NEW `Automation` superset of `CronJob` (§7). Adopt PRD
  `organization` skill-scope vocabulary (open-question **C36**).
- **Migrations:** **M3 — `agents` table is OPTIONAL and NOT recommended for v1** (use `agents.json`). No
  required migration in this phase.
- **Design-system pieces:** `AgentCard`, `SkillCard`, `AutomationRunRow`, `BuilderStepper` reuse,
  `ApprovalModal` (wrap `ui/alert-dialog.tsx`) for agent-elevation/automation-test approvals.
- **Exit criteria → PRD acceptance:** PRD §22.1 "create a workspace, agent, skill, and automation"; DoD #7
  (coherent IA across agents/skills/automations). Agent states §14.5 + Automation states §14.6 render;
  agent declares all §12.9 fields (rule #6); automation failures surface to Home (Journey 16 — wire the
  `home/overnight` failure feed to S11/S20).
- **Verify:** full gate; `tsc` on `agent` (if runtime touched) + `server` (new `agents.ts`/`automations.ts`)
  + `apps/web`.

---

### Phase 4 — Extend layer: Connectors, MCPs, Marketplace, Install Audit

- **Goal:** capabilities are discoverable, installable, and **governed** (Blueprint P4 exit). (PRD §8
  Phase 4 / §21 Sprint 7.) **Independent of Phase 3** (see §4).
- **Screens delivered:** **S07 Connector Hub**, **S08 MCP Hub**, **S21 Marketplace / Extend Waggle**.
- **Frontend tasks**
  - *Rework:* `ConnectorsApp.tsx` → **Connector Hub** (lift connectors out of the Services/MCP-tabs shell);
    the MCP catalog tab → standalone **MCP Hub**; consolidate the **doubly-represented Marketplace**
    (`MarketplaceApp.tsx` + the `CapabilitiesApp` marketplace section) into one **Marketplace / Extend**
    surface (`_inventory/frontend.md` §f IA cleanup).
  - *Create:* the unified Extend faceted catalog (S21) federating the six local domains client-side
    (open-question **A5** — federate-at-read, no `marketplace.db` migration). Install modals render the
    `TrustAssessment` (risk badge + permission summary via `formatTrustSummary`) + a revoke action.
- **Backend tasks** (`backend-api-delta.md` Phase 4)
  - **Extend `connectors.ts`:** `POST /api/connectors/:id/sync` (NET-NEW, **phased stub** — MVP =
    `healthCheck()` + stamp `lastSyncAt`; full data re-pull deferred, coverage-check **C1**/open-question
    **C16**), `POST /api/connectors/:id/revoke` (EXTEND alias → disconnect + audit), `connect` (+audit),
    `GET /api/connectors` (payload enrichment), optional `/health` + `/activity`.
  - **New `routes/mcps.ts` + the foundational runtime work:** `GET /api/mcps`, `POST /api/mcps/install`
    (via the existing marketplace installer → writes `.mcp.json`), `POST /api/mcps/:id/test`,
    `/:id/revoke`, `POST /api/mcps` (custom), `/:id/start`, `/:id/stop`, `PATCH /:id/permissions`,
    `GET /:id/logs` (phased — deferred if no log-capture infra, coverage-check **C2**). **CRITICAL
    foundational task (coverage-check C4):** populate `mcpRuntime` at boot from persisted config
    (`local/index.ts:911` is empty today) — this is not a route, it is the work item that unblocks ALL MCP
    routes; treat it as an explicit, estimated Phase-4 task. MCP `test` semantics (live handshake vs static
    validation) must be resolved first (coverage-check **C3** / open-question **C21**).
  - **Marketplace + shared audit:** `GET /api/marketplace` (bare-path alias), `GET /api/extend/audit?type=`
    (EXTEND — the read route exists at `/api/audit/installs`; add the filter param to serve S06/S07/S08/S21
    with one route, open-question **C18**).
- **Shared-types changes:** MODIFY FE Connector to consume shared `ConnectorDefinition`/`ConnectorHealth`
  (`shared-types-delta` §8a — a consumption switch, no new shape); NEW `McpInstance` (§8b); resolve the
  `ExtensionType` union to `skill|agent|connector|mcp|model|template` (open-question **B7**).
- **Migrations:** **M2 — `install_audit` risk-level CHECK fix (RECOMMENDED, pre-Phase-4).** The TS
  `AuditRiskLevel` includes `'critical'` but both DDL CHECKs allow only `low/medium/high`
  (`install-audit.ts:65` + `schema.ts:130`) → a `record({riskLevel:'critical'})` throws. Pick: widen the
  CHECK (additive migration) **or** lock the CRITICAL→`'high'`+`approvalClass:'blocked'` mapping as the
  permanent contract (zero-migration). Fix **before** any Extend install-audit write path ships
  (coverage-check **C15**).
- **Design-system pieces:** `ConnectorCard`, `MCPRow`, `ApprovalModal` reuse for install-risk approval,
  the install-audit feed (normalizer over the three audit stores).
- **Exit criteria → PRD acceptance:** PRD §22.1 "install/revoke connector/MCP with audit trail"; DoD #7;
  Extension states §14.7 render; MCP "auditable/permissioned/health-checked" (§12.8) — with the documented
  v1 caveats (connector-sync stub C1, MCP logs C2). Tier-gate MCP/Marketplace install at **PRO+** through
  `@waggle/shared tiers.ts` (open-question **B5**).
- **Verify:** full gate; if M2 ships as a migration, `tsc` + test on `hive-mind-core`/`core`; `tsc` on
  `server` (new `mcps.ts`) + `apps/web`; smoke the boot-time MCP runtime population.

---

### Phase 5 — Team intelligence: Team Workspace, RBAC, Sharing, Audit views

- **Goal:** team workflows are permissioned + auditable (Blueprint P6 exit). (PRD §8 Phase 5 / §21 Sprint 8.)
- **Screens delivered:** **S10 Team Workspace** (+ the RBAC/Audit components PRD §20.3 — see RBAC-owner note).
- **Frontend tasks**
  - *Rework/create:* `TeamGovernanceApp.tsx` + `searchTeamMemory` surface → **Team Workspace** with the
    **role→capability matrix** table (PRD §17.2), member list with role dropdown (CRUD endpoints exist),
    invite flow (Journey 13), "request access" on permission-denied. **RBAC matrix has no dedicated card
    today (coverage-check GAP-D2)** — S10 must own the §17.2 matrix UI (or add an RBAC/Audit card).
  - *Create:* unified **Audit Views** (normalize the three audit stores by scope) + CSV/PDF export buttons
    over the existing endpoints; per-object **Share** UI.
- **Backend tasks** (`backend-api-delta.md` Phase 5; `rbac-security-delta.md`)
  - **Extend `team.ts`:** `POST /api/teams/:id/invite` (alias → `/members`), `GET /api/teams/:id/audit`
    (alias → `/activity`), **fix the PUT(owner-only) vs PATCH(owner/admin) role-gate inconsistency** on
    `members/:memberId` (`team.ts:615` vs `:642` — open-question **A7**).
  - **NEW `POST /api/share`** (no such route exists) — share memory/artifact/workspace with role perms;
    gate behind TEAMS tier. **NEW `POST /api/artifacts/:id/share`** (blueprint). Optional
    `GET /api/teams/:id/governance` (surface capability policies/overrides/requests).
- **Shared-types changes:** unify the role enum in `@waggle/shared` — `TeamRole =
  owner|admin|member|viewer(|guest)`, map PRD "Contributor"→"Member", defer/decide Guest (open-question
  **A7** + rbac-delta §1). Add a shared `requireRole`/`can()` helper used by both `team.ts` and cloud routes.
- **Migrations:** keep the live `teams.db` 4-role union (no migration) per the recommended A7 answer; a
  `teams.db` CHECK migration is **only** needed if Guest is adopted. Frame-level `/api/share` scope may need
  M1 (`memory_frames.metadata`) — v1 can scope implicitly via workspace `teamId`.
- **Design-system pieces:** role→capability matrix table, `ApprovalModal`/audit-feed reuse, avatar stack.
- **Exit criteria → PRD acceptance:** PRD §22.1 "team user can share memory/artifact with role-appropriate
  permissions"; DoD #8 (shared intelligence + roles) + #9 (approval-gated + audited). Workspace
  permission-denied + archived states render (PRD §14.3 / Journey 19).
- **Verify:** full gate; `tsc` on `shared` (role enum) + `server` (team routes) + `apps/web`; RBAC
  enforcement tests.

---

### Phase 6 — Hardening: states, a11y, approval/audit consistency, performance, dogfood

- **Goal:** close the cross-cutting DoD items the screen phases leave under-traced. (PRD §21 Sprint 9 /
  Blueprint P7. Promoted to a first-class phase because PRD §26 DoD #10 + #9 are otherwise the weakest
  links — coverage-check GAP-D3/GAP-D4.)
- **Screens delivered:** none new — every S00-S21 screen gets its **§14 state matrix** completed.
- **Frontend + cross-cutting tasks**
  - **Screen × §14-state coverage grid (GAP-D4).** Build/verify all **9 global states** (PRD §14.1:
    Loading/Empty/Populated/Error/Offline/Syncing/Permission-denied/Partial/Approval) on every major screen
    + each screen's specific states (§14.2-§14.7). Cards S02/S18/S20/S21 are visibly thin on state
    enumeration — close them. The DS primitives (`EmptyState`/`ErrorState`/`Skeleton`/`StatusBadge`) ship in
    P0-P3; this phase wires them per-screen and proves coverage in a grid artifact.
  - **Approval & Audit as a cross-cutting contract (GAP-D3).** No single card owns the "which actions are
    sensitive, what the approval payload is, what gets audited" taxonomy today, risking per-builder drift.
    Define the canonical gated-action taxonomy + `ApprovalModal` contract once (an S00 sub-spec) and retrofit
    S03/S08/S18/S19/S20. Reuse the built runtime: `needsConfirmationWithAutonomy`, the `approval_required`
    SSE event, `/api/approval/*`, persistent grants (rbac-delta §2).
  - **Journey → screen trace (coverage-check #11).** Verify the 20 PRD §13 journeys end-to-end, especially
    J15 (agent approval), J16 (overnight failure → Home attention, spans S01+S11+S20), J19 (archive), J20
    (delete memory).
  - **A11y, performance, real-data dogfood, visual polish** (PRD §19.3 + §21 Sprint 9). Light-mode QA on
    data-heavy Memory/Artifact tables (Blueprint).
- **Backend tasks:** append-only triggers on the sensitive `install_audit`/`audit_events` subset (rbac-delta
  §3.2, reconcile with retention); resolve any deferred Phase-4 caveats (connector-sync real pull, MCP logs)
  if scheduled.
- **Exit criteria → PRD acceptance:** PRD §22.2 technical acceptance (every new screen has loading/empty/
  error/offline/permission states; sensitive actions approval-gated; types consistent with API; no
  mock-only screens where backend exists); DoD #9 + #10 + #11. All §22.3 QA scenarios pass.
- **Verify:** full gate + `npm run test:e2e` (Playwright) + visual regression; the per-screen state grid is
  the acceptance artifact.

---

## 4. Critical path / dependency notes

```
P0 (IA freeze + shared types + V2 fields + --sem-* tokens)
   └─ blocks EVERYTHING (every write-path uses V2 fields; every component uses the token layer & unions)
P1 (Home, Workspace, Win+K)
   ├─ S01 Home depends on workspace-state builder (exists) + S03 Win+K (greeting depends on identity seed, B8)
   ├─ S03 Win+K provider skeleton starts in P0, completes in P1; S01/S02 consume it
   └─ blocks P2 (Memory/Artifact detail surfaces are reached via Workspace tabs + Win+K)
P2 (Memory, Artifacts, Onboarding, Workspace Creation)
   ├─ Artifact entity (artifacts.json) is the single largest net-new domain; gates artifact-share in P5
   ├─ Memory metadata decision (M1) shared by S04 + S16; resolve B2/A8 BEFORE coding
   └─ Onboarding Import/Review split (C33) is correctness-relevant
P3 (Agents, Skills, Automations + builders)  ──┐ independent of P4
P4 (Connectors, MCPs, Marketplace)           ──┤ may run in parallel by separate streams
   ├─ P4 has the deepest hidden task: MCP boot-time runtime population (C4) — unblocks ALL MCP routes
   ├─ M2 install-audit CHECK fix must land BEFORE any Extend install-audit write (C15)
   └─ both P3 & P4 reuse the BuilderStepper (P2) and ApprovalModal
P5 (Team, RBAC, Sharing)
   ├─ depends on Artifact (P2) for artifact-share and on the unified role enum (A7) ratified before S10
   └─ frame-level /api/share may need M1 (P2) if not scoped via workspace teamId
P6 (Hardening)
   └─ depends on ALL screens existing; closes the cross-cutting DoD #9/#10/#11
```

**Hard blockers to ratify before coding starts:** the Phase-blocking founder items in §7. **Single biggest
hidden-effort item:** MCP boot-time runtime population (P4). **Single largest net-new domain:** Artifacts
(P2). **Most error-prone reuse:** alias-don't-rename the command/automations/connector-revoke vocabularies
(B4) — exhaustive grep on any rename per CLAUDE.md §3.5.

---

## 5. Net-new backend endpoint master list (summary)

Full per-endpoint spec (method/path/disposition/build-target/substrate/shape/screens) lives in
[`deltas/backend-api-delta.md`](./deltas/backend-api-delta.md). Summary counts:

- **Total endpoints requiring backend work: 53** (de-duplicated NET-NEW + EXTEND).
  - **NET-NEW: 35** — Home ×2, Command ×3, Memory ×3, Artifacts ×6, Agents ×5, Skills ×1, Automations ×1,
    Connectors ×3, MCPs ×8, Team ×3.
  - **EXTEND: 18** — quick-capture, workspace state/activity, command/execute, 4× memory aliases,
    harvest preview/commit + sources/sync, workspaces POST, agents run/pause, skills :id/test, 6×
    automations aliases over cron, connectors revoke/connect/payload, mcps/install, marketplace bare,
    extend/audit filter, team invite/audit/members-gate-fix.
- **PRD §16 cross-reference:** of the 65 §16-literal endpoints — **16 EXIST** (FE wiring only), **30
  PARTIAL** (→ EXTEND), **19 MISSING** (→ NET-NEW). The delta adds **~16 blueprint-implied** endpoints
  beyond the literal §16 set (MCP start/stop/logs/permissions/custom, connector health/activity,
  automations/test, team governance, artifact-share, extend/audit) — over-, not under-, coverage. All
  **65/65 §16 endpoints are addressed** (coverage-check Table 2).
- **New sidecar route files: 5** (`home.ts`, `command.ts`, `artifacts.ts`, `agents.ts`, `mcps.ts`) + 1
  alias plugin (`automations.ts` → cron). **New JSON-file stores: 2** (`agents.json`, `artifacts.json`).
- **Schema migrations:** **1 conditional** (M1 `memory_frames.metadata`, P2/P5) + **1 recommended** (M2
  `install_audit` CHECK fix, pre-P4) + **1 optional/deferred** (M3 `agents` table — NOT for v1). Net
  likely-to-ship: **1**; **0 strictly required** if S16 confidence stays preview-only and `/api/share`
  scopes via workspace `teamId`.
- **Phase-0 non-endpoint work:** 5 interface/field extensions (`WorkspaceConfig` V2 + write-stamps, FE type
  unions, `UserProfile` fields, `WorkspaceTemplate` shape, `Connector` fields).

---

## 6. Risk register

PRD §24 risks + risks surfaced by the coverage-check / deltas:

| # | Risk | Source | Impact | Mitigation (in this plan) |
|---|---|---|---|---|
| R1 | UX becomes too complex | PRD §24 | High | Keep Home/Workspace/Win+K as the spine (P0-P1); hide power features behind the IA zones until needed. |
| R2 | Backend not ready for all screens | PRD §24 | Med | In-place reuse + thin adapters; mock catalog only where safe (PRD §22.2); **A4** = real-where-substrate-exists. |
| R3 | Memory trust issues | PRD §24 | High | Source/confidence/evidence/review/edit/delete (P2); ConfidenceBadge + EvidencePanel; heuristic-then-LLM (**B2**). |
| R4 | Agent safety | PRD §24 | High | Explicit permissions + approval prompts + audit (rule #6/#7); reuse `confirmation.ts` + approval SSE. |
| R5 | Marketplace scope creep | PRD §24 | Med | Federate-at-read local catalog (**A5**); postpone billing/public marketplace + remote registry (PRD §4.4). |
| R6 | Team RBAC complexity | PRD §24 | Med | Keep the live 4-role union (**A7**); shared `requireRole`/`can()`; defer Guest. |
| R7 | Global-search performance | PRD §24 | Med | Local indexed providers + async result groups (S03). |
| R8 | Visual mocks overfit | PRD §24 | Med | PRD acceptance > pixels (locked decision 3). |
| R9 | **Per-screen state coverage under-traced (DoD #10)** | coverage-check GAP-D4 | High | **Phase 6** state-coverage grid; primitives shipped P0-P3. |
| R10 | **Approval/audit owned by no card (DoD #9)** | coverage-check GAP-D3 | High | Phase 6 cross-cutting Approval&Audit spec (S00 sub-spec); reuse built runtime. |
| R11 | **MCP runtime never populated** (unblocks all MCP routes) | coverage-check C4 | High | Explicit, estimated **Phase-4** boot-time population task (not a footnote). |
| R12 | RBAC role-vocabulary divergence (3 enums, no Guest, PUT/PATCH gate bug) | rbac-delta §1 | Med | Unify enum in `@waggle/shared` (P5); fix the gate; ratify **A7** before S10. |
| R13 | install-audit `critical` CHECK throws on write | coverage-check C15 / rbac §3.2 | Med | **M2** fix before any Extend install write (pre-P4). |
| R14 | Connector `/sync` is a cosmetic stub vs §12.7 "data flowing" | coverage-check C1 | Med | Flag v1 partial; schedule real connector-SDK pull (Phase 6/post-v1). |
| R15 | Sessions not a first-class browsable object | coverage-check G2 | Low | Document Timeline+Win+K as the v1 session UX; soften the §11 "navigable" claim. |
| R16 | Sidecar type errors ship undetected (`tsx` transpile-only) | CLAUDE.md §2 | Med | Run `tsc --project packages/server` in every phase gate (not just `npm run build`). |
| R17 | Build-order/stale-dist hides breakage behind green CI | MEMORY 0601 S3 | Med | Enforce shared→hive-mind-core→core→agent→server; nuclear-clean before release verify. |

---

## 7. Founder sign-off gate (open questions to answer before each phase)

Full options + tradeoffs + RECOMMENDED answers in [`deltas/open-questions.md`](./deltas/open-questions.md).
**Coding on a phase MUST NOT start until its blocking questions are ratified.**

### Before Phase 0/1 (the spine) — `[BLOCKS P1]` — ✅ ALL RATIFIED 2026-06-09 (founder)
All five spine recommendations ratified as-is; **Phase 0 is unblocked.**
- **B1** ✅ **RATIFIED** Shell topology — in-place dock reframe, keep windowed `AppId` nav (no react-router);
  group dock into Work/Intelligence/Extend/Team zones. The IA freeze; gates everything.
- **A1** ✅ **RATIFIED** Workspace Desktop layout — fixed layout v1 (PRD §12.2 self-answers).
- **A2** ✅ **RATIFIED** Home Cockpit scope — personal-only v1; team summary appended later behind RBAC.
- **B4** ✅ **RATIFIED** `/api/*` vocabulary — alias, don't rename (command/automations/connector-revoke).
- **B8** ✅ **RATIFIED** Identity store of record — onboarding writes profile AND seeds identity (correct greeting).

### Before Phase 2 (work + onboarding) — `[BLOCKS P2]`
- **A6** Artifact storage — *Rec: `artifacts.json` index over existing workspace storage; artifact = produced output.*
- **A8** Memory retention/delete — *Rec: soft-status in metadata (Archive reversible), hard delete with consequence confirm.*
- **B2** Memory confidence — *Rec: cheap heuristic at preview; LLM reserved for the standing J08 queue.*
- **B6** `MemoryKind` reconciliation — *Rec: PRD §15.2 `MemoryKind` canonical in `@waggle/shared` + pure map helpers.*
- **A3** Memory graph view — *Rec: ship in v1 (substrate works); default = keep.*
- **C33** Import↔Review commit split — *Rec: S15 stages previews, S16 commits (fix current commit-at-S15).*
- **M1 decision** — ship `memory_frames.metadata` only if confidence/scope/status becomes a real filter axis.

### Before Phase 3 / 4 / 5 (not P1/P2-blocking, but ratify before the owning screen)
- **B3** Agent vs Persona boundary + store — *Rec: real Agent entity in `agents.json` referencing `personaId`.* (P3)
- **C24/C26** Automation triggers + test-run — *Rec: schedule-only v1; no-persist dry-run route.* (P3)
- **A4** Which connectors/MCPs are real — *Rec: real-where-substrate-exists, catalog-for-the-rest.* (P4)
- **A5/B7** Marketplace local-vs-remote + `ExtensionType` — *Rec: federate-at-read; `skill|agent|connector|mcp|model|template`.* (P4)
- **B5** Tier-vocabulary — *Rec: document mapping, route gates through `tiers.ts`, MCP/Marketplace install = PRO+.* (P4)
- **C21/C3** MCP `test` semantics — *Rec: live spawn-and-`isHealthy()`/`tools/list`; fall back to static validation.* (P4, resolve before S08)
- **C15** install-audit `critical` CHECK — *Rec: ship the migration (M2) for correctness.* (pre-P4)
- **A7** Minimum-viable RBAC — *Rec: keep live `owner/admin/member/viewer`, Contributor==Member, defer Guest, fix PUT/PATCH gate.* (ratify before S10)

---

## 8. Definition of Done checklist (PRD §26)

The refactor is done when all 11 hold. Mapped to the phase that delivers each (coverage-check Table 3):

- [ ] **1. Home Cockpit replaces blank-chat launch behavior.** — P0 (routing flip, GAP-D1) + P1 (screen).
- [ ] **2. Workspace Desktop is the default runtime for workspace work.** — P0 (route) + P1 (S02).
- [ ] **3. Win+K can search, launch, create, run, navigate, and extend.** — P0 (provider) + P1 (S03; all 6 verbs).
- [ ] **4. Memory Center exposes source, confidence, evidence, scope, and edit/delete.** — P2 (S04/S16; M1 if filterable).
- [ ] **5. Artifact Center supports outcome search and related objects.** — P2 (S05; `/search-related`).
- [ ] **6. Onboarding leads profile → tool-discovery → import → review → first workspace.** — P2 (S12-S17 chain).
- [ ] **7. Agents, skills, automations, connectors, MCPs, marketplace have coherent IA.** — P3 + P4 (Work/Intelligence/Extend zones).
- [ ] **8. Team workspace supports shared intelligence and roles.** — P5 (S10 + RBAC matrix, GAP-D2).
- [ ] **9. Sensitive actions are approval-gated and audited.** — cross-cutting; ownership consolidated in **P6** (GAP-D3).
- [ ] **10. All screens have required states.** — **P6** screen×§14-state grid (the weakest-traced item, GAP-D4).
- [ ] **11. Claude Code can continue implementation from this PRD without product interpretation.** — this doc set is the evidence.

**Plus PRD §22.2 technical acceptance** (verify in P6): no mock-only screens where backend exists; new
components have loading/empty/error/offline/permission states; sensitive actions approval-gated; state
derivation centralized in the backend; FE types consistent with API contracts; existing foundations reused.

---

*Synthesized from PRD §6/§8/§14/§16/§20/§21/§26, Blueprint §19 roadmap, the condensed implementation
handoff, the 3 inventories, the 22 gap cards (S00-S21), and the 6 deltas. All file/line citations are
grounded in live source or the audited `docs/backend-map/`.*
