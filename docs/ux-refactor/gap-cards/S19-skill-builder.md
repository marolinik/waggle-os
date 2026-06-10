# Gap Card — S19 · Skill Builder

> UX-refactor planning artifact. Execution model is LOCKED **in-place incremental refactor**
> of `apps/web` + targeted sidecar extensions. Mockups are directional (PRD §24);
> PRD acceptance criteria win. Every claim below is grounded in a cited file.
>
> Sources: PRD §12.6 + §16.8 (`docs/.../Waggle_OS_UX_Refactor_PRD.md`), Blueprint Screen 19
> (`_blueprint_extracted.txt:417-421`, state model `:464`), mockup
> `Waggle_OS_Handoff_Assets/screens_18_21_builders_and_marketplace.png`, backend-map
> `sections/03d` + `05g`, inventories under `docs/ux-refactor/_inventory/`.

---

## 1. Screen & purpose

**Skill Builder** — the *create/edit* surface for a reusable capability (Skill). PRD §12.6:
a stepper Builder ("Basic Info → Instructions → Inputs & Outputs → Tools & Data → Review & Create"),
with **test-run before publishing** and assignment to agents/workspaces/automations or direct use.
Blueprint Screen 19 (`_blueprint_extracted.txt:417-421`): *"Create reusable capability. Define
prompt, inputs/outputs, tools, memory access, test."* States: *Draft; test pass/fail; published;
archived.* Acceptance: *"Skills are inspectable and reusable by agents/automations"* (PRD §12.6
acceptance: *"a user can understand what a skill does, where it is used, and what access it has"*).

This is the **Builder half of the Intelligence layer's Skills surface** (S06 Skills Hub is the
browse/library half). PRD Roadmap puts both in Sprint 6 / Phase 3 (`PRD:344-351`, `:236-240`).
The mockup tile labelled "Skill Builder" shows a left form column (name/description/category +
instructions textarea) and a right column (tools picker + memory access + a Test panel + a primary
"Create Skill" action) — directional confirmation of the §12.6 stepper.

---

## 2. Required states (PRD / Blueprint)

PRD §14.1 global states (every screen) + Blueprint Skills row (`_blueprint_extracted.txt:464`):
*Loading, empty, populated, error; Installed, draft, custom, workspace, marketplace, update available;
recovery: Test, install, publish, archive, rollback.*

Builder-specific lifecycle (Blueprint Screen 19 `:417-421`): **Draft → test pass/fail → published →
archived**, with PRD global add-ons: **validation error**, **approval required** (skills that request
elevated tool/secret access), **offline/local-only**.

Stepper steps the Builder must implement (PRD §12.6 `:542`):
1. **Basic Info** — name, description, category.
2. **Instructions** — the prompt/steps body.
3. **Inputs & Outputs** — declared input params + expected output shape.
4. **Tools & Data** — tools/data + **memory access** (read scope).
5. **Review & Create** — summary + **Test run** + publish-to-scope (personal/workspace/team).

Per-state behaviours required:
- **Validation error** — name normalises to kebab-case; empty name/description/steps blocked
  (backend already 400s on these — §5).
- **Test pass/fail** — inline Test panel showing the injected-prompt preview + parsed metadata.
- **Published** — confirmation + the new skill appears in the Hub (Installed list).
- **Approval required** — when declared tools include elevated/secret/code-exec permissions
  (frontmatter `permissions` block exists — `skill-frontmatter.ts:40-48`).

---

## 3. Current state in repo

**Disposition: `create-new`** (frontend Builder), **`keep-promote`** (backend structured-create
contract). There is **no Skill Builder component anywhere in `apps/web/src`** — grep for
`SkillBuilder|Skill Builder|skill-builder` over `apps/web/src` returns **0 matches**. Skill creation
today is only available to the *agent* (the `create_skill` tool, `skill-creator.ts:8`), not to the
*user* via UI.

What exists today:

- `apps/web/src/components/os/apps/CapabilitiesApp.tsx` — "Skills & Apps". A **browse/install/test**
  surface only. Tabs: `installed | starter | marketplace | tools | audit` (`:80`, `:358`). It lists
  packs (`PackCard` `:190`), shows a detail drawer (`PackDetail` `:249`), installs
  (`handleInstall`/`handleMarketplaceInstall` `:164,:174`), and **tests** an existing skill
  (`handleTestSkill` → `POST /api/skills/test` `:88-102`). **It has NO create/edit form.** This is
  the natural host to add a "+ Create Skill" entry point that launches the new Builder.
- `apps/web/src/lib/adapter.ts:652` — `createSkill({ name, description })` exists but is **lossy**:
  it POSTs to `/api/skills/create` with only `{name,description}` (no `steps`/`tools`/`category`),
  while the backend requires a non-empty `steps[]` (`skills.ts:434`). So the one adapter method that
  targets the create route is under-specified and **has no caller** in `apps/web/src` (grep:
  `createSkill` appears only at its definition). Needs rework to the full template shape.
- `apps/web/src/lib/types.ts:210` — `SkillPack` (`id/name/description/category/skills[]/installed/trust`).
  This is a **pack/catalog** shape, NOT a skill-authoring shape (no instructions/inputs/outputs/tools).
- `packages/agent/src/skill-creator.ts:11` — `SkillTemplate` (`name, description, triggerPatterns[],
  steps[], tools[], category`) + `generateSkillMarkdown()` (`:26`). This is the canonical authored-skill
  model the backend writes from.
- `packages/agent/src/skill-frontmatter.ts:53` — `ParsedSkill`/`SkillFrontmatter` (name, description,
  `scope` personal→workspace→team→enterprise `:27`, `permissions` block `:40-48`). This is the read/parse
  side; the Builder's "memory access / permissions" + "scope" map onto this.

Conclusion: backend authoring contract is solid and reusable; the **frontend Builder UI is greenfield**,
and the **adapter method must be widened** to the full template.

---

## 4. Frontend work

**Create (new):**
- `apps/web/src/components/os/overlays/SkillBuilder.tsx` — a 5-step stepper modal/drawer. Place it in
  `overlays/` (consistent with `CreateWorkspaceDialog.tsx`, `SpawnAgentDialog.tsx`). Reuse the DS
  Builder-stepper pattern (PRD §19.1 lists "Builder stepper" as a core component — none exists yet, so
  this is the **first stepper**; AgentBuilder S18 + AutomationBuilder S20 should share it — see §7).
  - Step 1 Basic Info: `name`, `description`, `category` (select from the `SKILL_FAMILIES` family set
    in `skills.ts:13-31`: writing/research/decision/planning/communication/code/creative — surface
    these as the category options, not the narrower `SkillPack.category` 5-union).
  - Step 2 Instructions: ordered `steps[]` editor (add/remove/reorder) + optional `triggerPatterns[]`
    (maps directly to `SkillTemplate.steps`/`.triggerPatterns`).
  - Step 3 Inputs & Outputs: `inputs[]` / `outputs[]` param rows. **Backend does not persist these
    structured today** (§5) — render them into the markdown body for v1, or block on the §5 backend
    extension.
  - Step 4 Tools & Data: `tools[]` multiselect (source the tool catalog already enumerated in
    `CapabilitiesApp.tsx:422-434` — extract that hardcoded list to a shared module to avoid a third
    copy; the agent tool registry is `packages/agent/src/tools.ts`) + **memory access / scope**
    (`SkillScope` personal/workspace/team — `skill-frontmatter.ts:27`) + a `permissions` toggle group
    (`skill-frontmatter.ts:40-48`).
  - Step 5 Review & Create: summary card + **Test** button (calls existing test route) + Create.
- Optional `apps/web/src/components/os/overlays/skill-builder/` substeps if the file exceeds ~400 LOC
  (CLAUDE.md file-org rule).

**Rework:**
- `apps/web/src/lib/adapter.ts` — widen `createSkill` (`:652`) to
  `createSkill(t: { name; description; steps: string[]; tools?: string[]; category?: string;
  triggerPatterns?: string[] })` (full `SkillTemplate` shape, matching `skills.ts:424-430`). Add
  `updateSkill(name, content)` → `PUT /api/skills/:name` (`skills.ts:506`) for edit, and reuse the
  existing test call (CapabilitiesApp inlines `fetch('/api/skills/test')` `:91` — promote it to an
  `adapter.testSkill(skillName, testInput?)` method so the Builder and CapabilitiesApp share one path).
- `apps/web/src/components/os/apps/CapabilitiesApp.tsx` — add a "+ Create Skill" button (header,
  next to the grid/list toggle `:340`) that dispatches `waggle:open-app` or opens the Builder overlay
  via `useOverlayState` (the overlay open/close registry — `hooks/useOverlayState.ts`, per frontend
  inventory §c). Optionally render an edit affordance on installed custom skills.

**Wiring:**
- Register the overlay in `Desktop.tsx` (overlays block) + add a flag to `useOverlayState`.
- Ctrl+K "Create → Skill" command should open it (PRD §12.3 Create category; `GlobalSearch.tsx`
  already loads skills `:129`).

**Props/state:** local stepper state object `{ step, name, description, category, steps[],
triggerPatterns[], inputs[], outputs[], tools[], scope, permissions, testResult, status }`. On
Create → `adapter.createSkill(template)`; on Test → `adapter.testSkill(name)`. No new global store;
optimistic insert into the Skills Hub list on success (CapabilitiesApp already refetches via
`getSkills`).

---

## 5. Backend work (PRD §16.8)

| PRD §16.8 endpoint | Status | Note / what to EXTEND vs NET-NEW | Substrate |
|---|---|---|---|
| `GET /api/skills` | **EXISTS** | `skills.ts:164` — list installed skills. Hub/Builder list source. | `~/.waggle/skills/*.md` files |
| `POST /api/skills` | **EXISTS** | `skills.ts:167` raw `{name,content}`; **`POST /api/skills/create` (`skills.ts:431`) is the structured one** the Builder should use (`{name,description,steps[],tools?,category?}` → `generateSkillMarkdown` + `redactSkillContent` + audit + hash). | skill files + `auditStore` + `skillHashStore` |
| `PATCH /api/skills/:id` | **PARTIAL** | Update is `PUT /api/skills/:name` keyed by **name**, method **PUT**, body `{content}` (`skills.ts:506-510`). PRD uses `PATCH`+`:id`. **EXTEND**: accept `PATCH` alias + name↔id mapping (skills have no numeric id — name *is* the id). | skill files |
| `POST /api/skills/:id/test` | **PARTIAL** | Test exists as **`POST /api/skills/test`** (body `{skillName, testInput?}`, `skills.ts:570-575`) — not a per-id path. **EXTEND**: add `:id`-path variant (or keep body-driven; Builder can call either). Returns injected-prompt preview + metadata. | skill files + starter dir |
| `POST /api/skills/:id/install` | **PARTIAL** | No unified per-skill install-by-id. Closest: `POST /api/skills/starter-pack/:id` (`skills.ts:161`), `POST /api/skills/capability-packs/:id` (`:163`), marketplace `POST /api/marketplace/install` (`marketplace.ts`, **Tier: PRO**, SecurityGate). **EXTEND**: add a dispatcher `/skills/:id/install` that routes by source — OR leave install to the Hub (S06) and have the *Builder* only create (create == installed, since authored skills write straight to `~/.waggle/skills/`). | skill files / marketplace |

**Net-new backend gap surfaced by the PRD stepper (NOT in §16.8, but needed for §12.6 Step 3):**
the structured-create contract (`SkillTemplate`, `skill-creator.ts:11`) has **no `inputs`/`outputs`
and no `memoryScopes` fields**. PRD §15 skill object (and Blueprint §551 "Skill … inputs, outputs,
requiredTools, requiredMemoryScopes") expects them. Two options, both in-place:
- **v1 (no migration, recommended):** Builder serialises inputs/outputs/memory-scope into the
  markdown body via an extended `generateSkillMarkdown` (add optional `inputs?`/`outputs?`/`scope?` to
  `SkillTemplate`); they round-trip as `## Inputs` / `## Outputs` / frontmatter `scope:` sections.
  `parseSkillFrontmatter` already reads `scope` (`skill-frontmatter.ts:27`) and `permissions`.
- **v2 (later):** promote to structured frontmatter if inputs/outputs become a query/filter axis.

**No `.mind` migration.** Skills are **filesystem markdown** (`~/.waggle/skills/*.md`), not SQLite —
confirmed `skills.ts:46-49`. The only DB touch is the **install-audit** record on create
(`skills.ts:476`, writes to `.mind` install_audit) + the skill-hash store. The audit `record()` call
already passes `riskLevel:'low'` so it sidesteps the latent `risk_level` CHECK drift noted in
substrate-types §(d) — no new exposure.

**Security:** create/update already pass content through `redactSkillContent()` (strips
secrets+user-paths, `skills.ts:464,:521`) and guard path-traversal in the name (`:447`). The Builder
must NOT bypass these — always go through `/api/skills/create` / `PUT /api/skills/:name`, never write
files another way. Elevated `permissions` (codeExecution/secrets/network) in a skill should trigger
the §2 "approval required" UX (PRD §12.6 / §17.3 elevated-action approval) — currently no approval
gate fires on skill authoring; flag as an open item (§9).

---

## 6. Shared types needed (PRD §15 vs `lib/types.ts`)

PRD §15.2 declares `ExtensionType = 'skill' | ...` — **MISSING** in `apps/web/src/lib/types.ts`
(substrate-types §e). For S19 specifically:

- **Add `SkillTemplate` (authoring) FE type** mirroring `packages/agent/src/skill-creator.ts:11`
  (currently the FE only has the catalog-shaped `SkillPack` `types.ts:210`). Fields:
  `name, description, category, steps[], triggerPatterns[], tools[]` + PRD additions
  `inputs[]`, `outputs[]`, `scope` (`SkillScope`), `permissions`. Keep `SkillPack` (catalog) distinct
  from `SkillTemplate` (authoring) — they are different objects.
- **Reuse `SkillScope`** (`personal|workspace|team|enterprise`) from `skill-frontmatter.ts:27` rather
  than redeclaring (export it through the FE if needed; PRD §15.2 `Scope` is the broader
  personal/workspace/team/organization — reconcile: skills use the `enterprise` variant).
- `SkillPack.category` is a narrow 5-union (`types.ts:213`) that does **not** match the backend
  `SKILL_FAMILIES` 7-set (`skills.ts:13`). Widen the FE category union to the family set so the Builder
  category picker and the Hub badges agree.

---

## 7. Dependencies (screens/phases first)

- **Phase/Sprint:** PRD Sprint 6 / Phase 3 — Intelligence layer (`PRD:344-351`, `:236-240`).
- **Hard prereq — DS Builder Stepper component** (PRD §19.1). None exists. S19 is the cheapest place
  to introduce it, but **S18 Agent Builder** and **S20 Automation Builder** share the exact same
  stepper pattern — build the stepper as a reusable primitive (`components/ui/` or
  `components/os/overlays/builder-stepper/`) so all three Builders consume it.
- **Sibling — S06 Skills Hub** (the browse/library half, hosted today by `CapabilitiesApp.tsx`).
  S19 launches *from* the Hub and writes *into* it (created skill → Installed list). They should ship
  together or S06 first.
- **Soft — Command Center (Ctrl+K) (S03)** for the "Create → Skill" entry (PRD §12.3); not blocking.
- **Soft — Agent Builder (S18) / Automation Builder (S20)** consume skills via `skillIds`
  (PRD §15.5) — they depend on skills *existing*, not on the Builder UI. Skill→agent assignment is a
  downstream wiring concern.

---

## 8. Effort: **M**

Backend is mostly **EXISTS/PARTIAL** (structured-create, test, update all present — only thin aliases
`PATCH`/`:id`-path + an optional `inputs/outputs/scope` extension to `generateSkillMarkdown`, no DB
migration). The frontend is a net-new 5-step stepper + adapter widening + a reusable stepper primitive
shared with S18/S20 — real but bounded UI work. Not S (greenfield component + 3 endpoint extensions);
not L (no new substrate, no migration, backend authoring path already proven via the `create_skill`
tool).

---

## 9. Open questions

1. **Install vs create semantics.** Authored skills write straight to `~/.waggle/skills/` (create ==
   installed). Does PRD `POST /api/skills/:id/install` (§16.8) apply to the *Builder* at all, or only
   to the *Hub/Marketplace* install flow? Recommend: Builder = create-only; install-by-id lives in S06.
2. **Inputs/Outputs persistence.** v1 markdown-body serialisation vs structured frontmatter — confirm
   whether inputs/outputs need to be *queryable* (drives the v1-vs-v2 backend choice in §5).
3. **Approval gate on elevated skills.** Should authoring a skill that declares
   `permissions: {codeExecution|secrets|network}` trigger the PRD §17.3 approval prompt at *create*
   time, or only at *run* time? No gate fires today on authoring.
4. **Scope vocabulary reconciliation.** `SkillScope` uses `enterprise`; PRD §15.2 `Scope` uses
   `organization`. Pick one for the Builder's publish-to-scope picker.
5. **Test-run fidelity.** `POST /api/skills/test` returns only the *injected-prompt preview* + parsed
   metadata (`skills.ts:570`), it does **not** execute the skill against an LLM. Is preview-only
   sufficient for the PRD "test pass/fail" state, or is a live dry-run expected? (Live run would be
   net-new and lean on `/api/agent/run`.)
6. **Category source of truth.** Reconcile `SkillPack.category` (5-union) vs `SKILL_FAMILIES` (7-set)
   vs `SkillTemplate.category` (free string) — which is canonical for the picker?
