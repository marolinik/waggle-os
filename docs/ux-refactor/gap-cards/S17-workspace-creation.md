# Gap Card — S17 · Workspace Creation

> Execution model: **in-place incremental refactor** of `apps/web` + targeted backend extension.
> Mockup is **directional only** (PRD §24); PRD acceptance criteria win over pixels.
> Every claim below cites a real file. PRD = `docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_UX_Refactor_PRD.md`.

---

## 1. Screen & purpose

**Screen 17 — Workspace Creation.** "Create a workspace with suggested capabilities" — the screen that
turns onboarding (or a manual "+ New Workspace") into the user's **first useful context**.

- PRD §12.12 step 6 ("Workspace Creation — create first useful context") + Journeys 1/2 (PRD lines 678,
  685: "Creates first workspace" / "Creates workspace manually" → lands in Home Cockpit).
- Blueprint screen-table row 17 (`_blueprint_extracted.txt:402-409`): Purpose "Create a workspace with
  suggested capabilities"; Interactions "Enter name/type, add suggestions, review, create"; States
  "Empty; recommended; validation error; created"; Acceptance "Workspace becomes first useful context
  after onboarding."
- Mockup `screen_17_create_workspace.png` (directional): a **4-step wizard** (Basic info → Preferences →
  Review & create) with a **left form column** (Description, Workspace type = Project/Client/Research/
  Personal cards), a **center "Suggested capabilities" column** (Suggested Skills / Suggested Agents /
  Suggested Connectors / Suggested MCPs, each with "Add all"), and a **right "Workspace summary" card**
  (name, type, description, "Includes: Skills/Agents/Connectors/MCPs" counts). Footer: Cancel /
  "Next: Preferences →".

**Net:** the mockup reframes the existing single-pane modal as a **stepped wizard whose center of gravity
is recommended capabilities + a live summary**, driven by workspace *type* and persona — not just a name +
template picker.

---

## 2. Required states (PRD / Blueprint)

From the blueprint state list + PRD acceptance criteria:

1. **Empty** — fresh form, no name/type, nothing suggested yet.
2. **Recommended** — once type/persona/template chosen, Suggested Skills/Agents/Connectors/MCPs populate
   (silent default ordering, per `feedback_silent_recommendations_dont_ask.md` — recommend, don't interrogate).
3. **Validation error** — name required (PRD acceptance: validation surfaced inline); tier workspace-limit
   reached (FREE = 5; existing 403 path); local storage-path missing.
4. **Created** — workspace persisted, becomes active, transitions to Home Cockpit (S?) / Workspace Desktop.
5. (Onboarding-embedded variant) — same flow but rendered as **step 6 of the wizard**, no modal chrome,
   handing off to step 7 Home Cockpit (PRD §12.12).

PRD §12.12 acceptance that bears on this screen: "Connectors/MCPs/skills are **recommended from user
selections**" and "Onboarding asks user questions, not infrastructure questions."

---

## 3. Current state in repo

**Disposition: `rework`** (keep + heavily extend the existing component; do not create-new — the modal,
its template/persona/storage/agent-group machinery, and the live folder picker are all reusable substrate).

| File | What it does today |
|---|---|
| `apps/web/src/components/os/overlays/CreateWorkspaceDialog.tsx` (1129 LOC) | The live create-workspace modal. Single scrolling pane (NOT stepped). Fields: Template picker (category filter + search + 15 built-ins + custom CRUD via `TemplateCreatorModal`), Workspace **Name**, **Group** (`STANDARD_GROUPS`), **Storage Type** (virtual/local/team) + path + `FolderPickerModal` (live `adapter.browseLocal`/`browseLocalMkdir`), **Agent** (single persona grid from `PERSONAS` OR agent-group picker), **Share with team** toggle. Calls `onCreate({ name, group, persona?, agentGroupId?, shared?, storageType?, storagePath?, templateId? })`. |
| `apps/web/src/components/os/overlays/WorkspaceSwitcher.tsx` | Quick-switch list only (filters E2E/test names). **Not a creation surface** — adjacent, unchanged by S17. |
| `apps/web/src/hooks/useWorkspaces.ts:27-51` | `createWorkspace(data)` → `adapter.createWorkspace(data)`, optimistic add + select, local fallback on error. |
| `apps/web/src/lib/skill-recommendations.ts:103` | `recommendSkills(personaId)` → persona→skill-chip map w/ universal fallback. **Already the seed for "Suggested Skills".** |
| `apps/web/src/components/os/overlays/OnboardingWizard.tsx:278,314` | Onboarding's own inline `adapter.createWorkspace(...)` call (the embedded variant) — bypasses this dialog today. |

**Gaps vs mockup/PRD in the current component:**
- **No stepped wizard** — it's one scrolling modal, not Basic info → Preferences → Review.
- **No "Workspace type"** concept (Project/Client/Research/Personal) — only `Group` (free-string chips) +
  `templateId`. (`WorkspaceType` is a missing schema field — see §5/§6.)
- **No Suggested Agents / Suggested Connectors / Suggested MCPs panels.** Suggested *skills* logic exists
  (`recommendSkills`) but is **not wired into this dialog**. Connectors are fetched but only used for the
  template editor's chip list, not surfaced as workspace-scoped recommendations.
- **No "Workspace summary" / Includes-counts card** (the right rail in the mockup).
- **No `description` field.**

**Two real FE bugs to fix in passing (surgical, in-scope):**
1. `useWorkspaces.createWorkspace` typed signature (`useWorkspaces.ts:27`) **omits `storageType`,
   `storagePath`, `agentGroupId`** even though the dialog passes them — they're silently dropped at the
   type boundary (the object still flows through to `adapter.createWorkspace`, but the local-fallback path
   `:35-46` and the type contract lose them). Widen the param type.
2. `CreateWorkspaceDialog.onCreate` payload uses `persona`/`shared` (FE display names) while the backend
   POST expects `personaId` and has **no `shared`/`group→team` mapping** — `shared` is accepted by the
   dialog but never reaches `POST /api/workspaces` (which has no `shared` field; team linkage is `teamId`).
   Reconcile during rework.

---

## 4. Frontend work

**Rework `CreateWorkspaceDialog.tsx` into a 3-step wizard** (keep the file; restructure internals). Prefer
extracting step bodies into small co-located components to respect the 800-LOC ceiling (current file is
already 1129 LOC — this rework should *reduce* it by extracting).

Components to create (new, under `overlays/workspace-create/`):
- `WorkspaceTypePicker.tsx` — Project/Client/Research/Personal cards (drives type + default suggestions).
  Maps to new `WorkspaceType` union (§6).
- `SuggestedCapabilities.tsx` — 4 sections (Skills/Agents/Connectors/MCPs) each with per-item add +
  "Add all". Reuse `recommendSkills(personaId)` for Skills; derive Agents from `PERSONAS` +
  `adapter.getAgentGroups()`; Connectors from `adapter.getConnectors()` (already fetched here); MCPs from
  a new MCP list source (§5). Silent-default ordering (no "which tools?" prompt).
- `WorkspaceSummaryCard.tsx` — live right-rail: name, type, description, "Includes" counts (skills/agents/
  connectors/mcps selected).
- `WizardStepper.tsx` — Basic info / Preferences / Review header (or reuse a stepper primitive if added).

Reuse targets (do NOT rebuild): `TemplateCreatorModal`, `FolderPickerModal`, `ChipPicker`, `Tooltip`,
`STORAGE_OPTIONS`, the persona grid, `STANDARD_GROUPS`, `LockedFeature` (tier gate), `useFeatureGate`
(`multi-workspace`), `useWorkspaces`.

State/props additions:
- Local state: `step` (0|1|2), `description`, `type` (`WorkspaceType`), `selectedSkills[]`,
  `selectedAgentIds[]`, `selectedConnectorIds[]`, `selectedMcpIds[]`.
- Extend `onCreate(...)` payload to include `description, type, skills, agentIds, connectorIds, mcpIds`.
- Wire `recommendSkills` + a new `recommendCapabilities(type, personaId)` helper in
  `apps/web/src/lib/` (extends existing skill-recommendations pattern) so suggestions react to
  type/persona without a backend call where possible.

Adapter/hook:
- Widen `useWorkspaces.createWorkspace` param type (fix §3 bug 1) to carry the new fields + storage fields.
- `adapter.createWorkspace` already POSTs the body through (`lib/adapter.ts` `createWorkspace` → `POST
  /api/workspaces`); new body fields ride along once the route accepts them (§5).
- For Suggested MCPs, add `adapter.getMcps()` if a `/api/mcps` (or capabilities-derived) source is built (§5).

Onboarding parity: route `OnboardingWizard` step 6 through the **same** step bodies (render without modal
chrome) instead of its bespoke `adapter.createWorkspace` calls (`OnboardingWizard.tsx:278,314`) — single
source of truth for the create flow.

---

## 5. Backend work (PRD §16.2 + suggestion sources)

§16.2 endpoints used by/adjacent to this screen:

| PRD endpoint | Status | Extend vs net-new / substrate |
|---|---|---|
| `POST /api/workspaces` | **EXISTS** | `workspaces.ts:116-135`. **EXTEND** the Body type + `WorkspaceManager.create` to accept `description`, `type` (`WorkspaceType`), `skills[]`, `agentIds[]`, `connectorIds[]`, `mcpIds[]`, `status`. These are additive fields on `WorkspaceConfig`/`CreateWorkspaceOptions` (`workspace-manager.ts:5-95`). Substrate: `workspace.json` (file, not SQLite). |
| `GET /api/workspaces` | **EXISTS** | `workspaces.ts:101`. Unchanged. |
| `GET /api/workspaces/:id` | **EXISTS** | `workspaces.ts`. Unchanged. |
| `PATCH /api/workspaces/:id` | **EXISTS** | Used post-create for edits; should accept the new fields too. |
| `GET /api/workspace-templates` | **EXISTS** (not in §16 but central here) | `workspace-templates.ts:33` (15 built-ins). Templates already carry `persona`, `connectors`, `suggestedCommands`, `starterMemory` — the seed for Suggested panels. May **EXTEND** the `WorkspaceTemplate` shape to add `skills[]`/`mcps[]`/`type` so a chosen template can pre-populate all 4 suggestion lists. |

Suggested-capabilities data sources (mockup center column):
- **Skills** — no new endpoint; FE `recommendSkills` + starter-pack catalog (`GET
  /api/skills/starter-pack/catalog`, EXISTS). On create, the route already auto-installs starter skills
  (`workspaces.ts:198-211`) and seeds template starter-memory frames (`:223-249`).
- **Agents** — `GET /api/personas` (EXISTS) + `GET /api/agent-groups` (EXISTS). No new endpoint.
- **Connectors** — `GET /api/connectors` (EXISTS). No new endpoint.
- **MCPs** — **PARTIAL/MISSING**: per backend-routes inventory §16.9, there is **no `GET /api/mcps`**.
  MCP servers surface inside `GET /api/capabilities/status` (`mcpServers[]`) and the static catalog
  `@waggle/shared` `mcp-catalog.ts`. **EXTEND** rather than net-new store: add a thin `GET /api/mcps`
  read route that composes `capabilities/status` + `mcp-catalog`, OR have the FE read the existing catalog
  + capabilities/status directly for the Suggested-MCPs panel (lower-risk for S17; defer the dedicated
  route to S20/MCP screen).

**No new data store needed.** Persisting `agentIds`/`connectorIds`/`mcpIds` on the workspace = additive
optional fields on the `workspace.json` config (substrate-types §a confirms: **no DB migration** — these
live in JSON, not SQLite). `WorkspaceManager.create/update` (`workspace-manager.ts:124-244`) writes the
JSON; `update()` should also stamp `updatedAt` (currently missing, substrate-types §a) — fold that in here
since we're extending the write path anyway.

**.mind migration:** **None required for S17.** (The memory-side `metadata`/`confidence` migration in
substrate-types §c belongs to the Memory screen, not workspace creation.)

---

## 6. Shared types needed (PRD §15 vs `lib/types.ts`)

- **`WorkspaceType`** (PRD §15.2/§15.3) — **MISSING** everywhere. New literal union; mockup implies
  `'project' | 'client' | 'research' | 'personal'` (confirm exact set — see Open Questions). Add to FE
  `apps/web/src/lib/types.ts` AND backend `WorkspaceConfig` (`workspace-manager.ts`). Keep the existing
  free-string `group` (don't drop — substrate-types §a "keep, do not drop").
- **`WorkspaceConfigV2` deltas** (PRD §15.3, lines 961-985) touched by this screen: add `description`,
  `type`, `status` (`'active'|'paused'|'archived'`, default `'active'`), `agentIds[]`, `connectorIds[]`,
  `mcpIds[]`, `updatedAt`. (`storageType`/`storagePath`/`teamId`/`teamRole`/`riskLevel`/`created` already
  present.) Per substrate-types §a these are **pure additive optional fields, no DB migration**.
- FE `Workspace` (`lib/types.ts:22-40`) is a lossy projection (`persona` string vs config `personaId`;
  derived `memoryCount`/`lastActive`/etc.). Add the same `type`/`description`/`status` + capability-id
  arrays; reconcile `persona`→`personaId` mapping at the adapter boundary (don't break the switcher,
  which reads `ws.persona`).

---

## 7. Dependencies (screens / phases first)

- **Schema additions are foundational** — `WorkspaceType` + the V2 config fields are shared by S?? Home
  Cockpit, S?? Workspace Desktop (header shows type/status, substrate-types §b), and the Agent/Artifact
  screens. Land the type + `POST/PATCH /api/workspaces` extension as a **shared early phase** before the
  S17 UI rework so downstream screens consume the same fields.
- **Suggested capabilities** depends on the Skills (recommendSkills, exists), Personas/Agent-groups
  (exist), Connectors (exists) sources — all available now. Only **Suggested MCPs** has a missing/partial
  backend; gate that panel behind the MCP source decision (don't block S17 on the dedicated `/api/mcps`).
- **Onboarding (S?? §12.12)** consumes this flow as step 6 — unify after the standalone modal rework so
  both paths share one implementation.
- PRD roadmap places this in **Sprint 5 — Onboarding and workspace creation** (PRD line 1335).

---

## 8. Effort

**M.** The modal, template/persona/storage/agent-group machinery, folder picker, and skill-recommendation
helper all exist — the work is restructuring into a 3-step wizard, adding 3-4 small components (type picker,
suggested-capabilities, summary card), wiring existing suggestion sources, and additive (no-migration)
backend field extension on the workspace config. Pushed toward the high end of M by the Suggested-MCPs
source ambiguity, the onboarding-parity unification, and the two FE bugs to reconcile; not L because there
is no new data store and no `.mind` migration.

---

## 9. Open questions

1. **Exact `WorkspaceType` values.** Mockup shows Project/Client/Research/Personal. PRD §15.2 names
   `WorkspaceType` but does not enumerate. Confirm the canonical set (and whether `type` replaces or
   coexists with the existing free-string `group`/`STANDARD_GROUPS`). Recommendation: coexist — `type` is
   the new structured axis, `group` stays as the user's organizational label.
2. **Suggested MCPs source for S17.** Build the thin `GET /api/mcps` now, or read `capabilities/status` +
   `mcp-catalog` directly from the FE and defer the dedicated route to the MCP screen? (Lower-risk =
   defer.)
3. **`shared`/team handoff.** The dialog has a "Share with team" toggle that currently never reaches the
   backend (no `shared` field on `POST /api/workspaces`). For S17, does "share" set `teamId`/`teamRole`
   (requires a team to exist + TEAMS tier), or is it deferred to the Team screen? Today it's a dead toggle.
4. **Wizard vs modal in onboarding.** Confirm the embedded onboarding variant should render the *same*
   step bodies (preferred, single source of truth) vs keeping `OnboardingWizard`'s bespoke create call.
5. **Does S17 install/connect on create, or only stage selections?** PRD says recommend; mockup "Add all"
   implies staging. Confirm that selected connectors/MCPs are *recorded as workspace intent* (ids on the
   config) vs *actually installed/connected* at create time (the latter pulls in install-audit + connector
   OAuth flows — much larger scope; recommend record-only for S17).
