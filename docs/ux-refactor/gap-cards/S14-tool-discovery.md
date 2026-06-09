# Gap Card — S14 Tool Discovery

> Screen 14 of the Waggle OS UX-refactor. Onboarding step 3 of 7 (PRD §12.12).
> Execution model: **in-place incremental refactor** of `apps/web` + targeted backend
> extension. Every claim below is grounded in repo source (paths cited).
> PRD = `docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_UX_Refactor_PRD.md`.

---

## 1. Screen & purpose

"What tools do you use?" — the third onboarding step. The user selects the tools they
already use day-to-day (in plain product language, **not** an infra/connector setup
screen) so Waggle can recommend the right connectors, MCPs and skills downstream and
seed the Memory Import step (S15).

- **PRD §12.12** (step 3 of the 7-step onboarding flow): "Tool Discovery — ask which
  tools are used." Acceptance: "Onboarding asks user questions, not infrastructure
  questions"; "Connectors/MCPs/skills are **recommended from user selections**."
- **Blueprint** (`_blueprint_extracted.txt`):
  - Screen index row 14 (`:381-384`): *"Ask what tools the user uses. Select tools, add
    other, continue/back. States: No selection; selected; recommended; unsupported tool.
    User-oriented language, not infra setup."*
  - Mental model (`:54`): *"Tool discovery and harvest are core onboarding steps."*
  - Journeys J01 (`:169`) and J02 (`:173`): Tool Discovery sits between *Who Are You*
    (S13) and *Memory Import* (S15) on both the import and skip-import paths.
- **Mockup** (`screen_14_tool_discovery.png`, directional): two-column layout —
  left = grouped selectable tool grid in **"Collaboration & Productivity"** (Gmail,
  Calendar, Slack, GitHub, Notion, Jira, Salesforce) and **"AI & Developer Tools"**
  (Claude, Claude Code, Cursor, Hermes, Codex, "Other tool"), each card with a
  checkbox + "Select all" per group; right rail = **"You selected"** chip list +
  **"What's next"** ("We'll suggest relevant connectors and MCPs", "Your data is
  private"); left rail = the 7-step onboarding progress rail with "Tool discovery"
  active; footer = Back / Continue.

---

## 2. Required states (PRD / Blueprint)

Blueprint S14 enumerates four states; the mockup adds layout affordances:

1. **No selection** — nothing chosen; "You selected" empty; Continue still allowed
   (tool discovery is non-blocking, consistent with J02 skip-import).
2. **Selected** — one or more tools toggled; reflected in the "You selected" chip rail.
3. **Recommended** — "What's next" surfaces connectors/MCPs/skills derived from the
   selections (PRD acceptance: recommendations come *from user selections*). This is a
   silent default-ordering surface, not a friction step (per the project rule
   `feedback_silent_recommendations_dont_ask.md`).
4. **Unsupported tool** — user adds a tool ("Other tool" / free-text) that Waggle has
   no native connector for; captured as a profile signal, surfaced as "we'll watch for
   this / available via MCP," never a hard error.
5. Plus: **Select-all per group**, **Back/Continue** nav, and per-group sections
   ("Collaboration & Productivity" vs "AI & Developer Tools").

Acceptance (PRD §12.12): user-oriented language; selections drive recommendations;
**nothing imports here** (import/consent is S15's job — this screen only records intent).

---

## 3. Current state in repo

**Disposition: `create-new`** (the step does not exist; substrate to feed it largely does).

### The onboarding wizard has NO Tool Discovery step today
`apps/web/src/components/os/overlays/OnboardingWizard.tsx` is an **8-step** wizard whose
`STEP_NAMES` (`:35`) are: `welcome, why-waggle, tier, memory-import, template, persona,
api-key, ready`. The step switch (`:498-572`) renders `WelcomeStep / WhyWaggleStep /
TierStep / ImportStep / TemplateStep / PersonaStep / ModelTierStep / ReadyStep`. **There
is no "what tools do you use?" step** anywhere in the flow. Step components live in
`apps/web/src/components/os/overlays/onboarding/` (`WelcomeStep, WhyWaggleStep, TierStep,
ImportStep, TemplateStep, PersonaStep, ModelTierStep, ReadyStep, constants.ts, types.ts,
index.ts`) — none is a tool picker.

> Note: the live wizard's step ordering (tier/template/persona/api-key) does **not** match
> the PRD's 7-step IA (Welcome → Who Are You → Tool Discovery → Memory Import → Memory
> Review → Workspace Creation → Home Cockpit). The refactor inserts Tool Discovery; the
> broader re-sequencing is a cross-screen concern (see §7).

### `OnboardingState` cannot persist a tool selection
`apps/web/src/hooks/useOnboarding.ts:10-19` — `OnboardingState` = `{ completed, step,
tier?, workspaceId?, apiKeySet?, templateId?, personaId?, tooltipsDismissed? }`. **No
`toolsUsed` / `selectedTools` field.** Persisted to `localStorage` key `waggle:onboarding`.

### Two SEPARATE substrates map to the mockup's two columns — neither is a "what tools do you use" survey
1. **SaaS / productivity column** → native **connector registry**.
   `packages/agent/src/connector-registry.ts` `getDefinitions()` (`:59`) returns
   `ConnectorDefinition[]` with live vault status. ~31 connectors are registered
   (`packages/agent/src/connectors/index.ts`): GitHub, Slack, Jira, Gmail, Google
   Calendar, Notion, Salesforce, HubSpot, Linear, Asana, Trello, Monday, Confluence,
   Discord, Dropbox, etc. — a direct match for the mockup's Gmail/Calendar/Slack/GitHub/
   Notion/Jira/Salesforce cards. `ConnectorDefinition` (`packages/shared/src/types.ts:276-302`)
   already carries `id, name, displayName(via name), description, category` (`'productivity'
   | 'development' | 'crm' | 'data' | 'communication' | 'storage' | 'integration'`),
   `status`, `logoUrl`, `setupGuide` — exactly the fields a grouped, iconed tool grid needs.
   Surfaced over HTTP at `GET /api/connectors` (`packages/server/src/local/routes/connectors.ts:6`).
2. **AI & Developer column** → **AI-OS tool detection** (DIFFERENT subsystem).
   `packages/agent/src/tool-detection.ts` + `packages/shared/src/tool-detection.ts`:
   `SUPPORTED_TOOLS` (`:23-31`) = `claude-code, claude-desktop, cursor, codex,
   codex-desktop, hermes, openclaw`; `TOOL_DISPLAY_NAMES` (`:58`). Surfaced at
   `GET /api/tools/detect` (`packages/server/src/local/routes/tools.ts`). This *detects
   what is installed on the machine*; the mockup's AI/Developer column ("Claude, Claude
   Code, Cursor, Hermes, Codex") aligns with this set but as a **self-report picker**, not
   an install scan. The two can be merged: pre-check tools `tool-detection` already found.

### Recommendation engine — partial precedent, no connector recommender yet
`apps/web/src/lib/skill-recommendations.ts` is the existing template for "silent default
ordering from a user signal" (persona → 3-5 starter skills, `recommendSkills()` `:103`).
**There is no `connector-recommendations.ts`** (grep: only a *comment* in
skill-recommendations references the pattern; no file). The "What's next" rail needs a
new tool→connector/MCP/skill mapper following this same shape. `GET /api/skills/suggestions`
exists (`skills.ts`) but is context-driven, not tool-selection-driven.

**Reuse-not-rebuild verdict:** the *data* for both columns exists (`/api/connectors` +
`/api/tools/detect`); the *step UI*, the *state field*, and the *recommendation mapper*
are net-new. No new data store.

---

## 4. Frontend work

### Components to CREATE
| Component | Location | Role |
|---|---|---|
| `ToolDiscoveryStep.tsx` | `apps/web/src/components/os/overlays/onboarding/` | The step shell: grouped tool grid + "You selected" rail + "What's next" rail + Back/Continue. Mirrors the `*Step.tsx` prop contract (`goToStep`, controlled selection props). |
| `ToolGroup.tsx` (or inline) | same dir | One titled group ("Collaboration & Productivity" / "AI & Developer Tools") with a Select-all toggle and a grid of `ToolCard`s. |
| `ToolCard.tsx` | same dir | Single selectable tool tile (icon/logo + label + checkbox + selected ring). Reuse `components/ui/checkbox` + `card` + existing `connectors/BrandTile.tsx` icon pattern. |

### Reuse targets
- `components/os/apps/connectors/BrandTile.tsx` — already renders a branded connector
  tile with logo; lift its icon/logo resolution into `ToolCard`.
- `components/ui/*` (`card`, `checkbox`, `badge`, `button`, `separator`) — DS primitives.
- `lib/skill-recommendations.ts` shape — model `connector-recommendations.ts` on it.
- Onboarding chrome (progress rail, Back/Continue/Skip) already exists in
  `OnboardingWizard.tsx` (`:438-493`) — the step plugs into the existing AnimatePresence
  switch; no new chrome.

### New lib helper
- `apps/web/src/lib/tool-recommendations.ts` — pure mapper
  `recommendFromTools(selectedToolIds: string[]) => { connectors: string[]; mcps: string[];
  skills: string[] }`, with a co-located `.test.ts` (matches `skill-recommendations.test.ts`).
  Feeds the "What's next" rail. Tool ids reconciled across connector ids and `ToolId`.

### Wizard wiring (edits to existing files)
- `OnboardingWizard.tsx`: insert the step into `STEP_NAMES` (`:35`) and the step switch
  (`:498-572`); thread `selectedTools` step-local state + `onUpdate({ toolsUsed })`; bump
  the progress denominator (currently hard-coded `/7` `:396`, dots `[1..6]` `:472`,
  `aria-valuemax={7}` `:426`) — these counts become inconsistent once a step is added and
  the PRD re-sequence lands, so treat the step-count constants as a single thing to fix.
- `useOnboarding.ts`: add optional `toolsUsed?: string[]` (and optionally
  `unsupportedTools?: string[]`) to `OnboardingState` (`:10-19`); additive, no migration
  (localStorage).

### Data hooks
- Connector column: `adapter.getConnectors()` (`GET /api/connectors`) — already on the
  adapter (`lib/adapter.ts`). No new hook strictly needed; a thin `useConnectors`-style
  fetch in the step is fine, or reuse `ConnectorsApp`'s fetch pattern.
- AI/Dev column: `adapter.detectTools()` (`GET /api/tools/detect`) — already on the
  adapter — to PRE-CHECK locally-installed AI tools.

---

## 5. Backend work (PRD §16 cross-reference)

S14 has **no dedicated PRD §16 endpoint** — it is an onboarding capture screen that reads
existing catalogs and writes the selection into onboarding/profile state. Required backend:

| Need | Status | Existing route/builder to EXTEND vs NET-NEW | Substrate |
|---|---|---|---|
| List SaaS/productivity tools (grid) | **EXISTS** | `GET /api/connectors` (`connectors.ts:6` → `connectorRegistry.getDefinitions()`). Already returns `category` + `logoUrl` for grouping/icons. No change. | connector registry (in-memory defs + vault status) |
| List AI/developer tools (+ pre-check installed) | **EXISTS** | `GET /api/tools/detect` (`tools.ts`, AI-OS). Returns per-tool `installed`. No change. | `tool-detection.ts` (FS/PATH probes) |
| Recommend connectors/MCPs/skills from selection ("What's next") | **PARTIAL** | Closest is `GET /api/skills/suggestions` (`skills.ts`, context-driven, wrong input). Recommended approach: do the mapping **client-side** in `lib/tool-recommendations.ts` (pure, testable, no round-trip) — no new endpoint. If server-side later: NET-NEW thin `GET /api/recommendations?tools=` over connector catalog + `mcp-catalog.ts` + starter-skills. | connector defs + `@waggle/shared` `mcp-catalog.ts` + starter skills |
| Persist the tool selection | **PARTIAL** | Two options: (a) **client-only** in `localStorage` via `OnboardingState.toolsUsed` (lowest risk, matches current onboarding persistence) — **recommended**; (b) write into the user profile via existing `PUT /api/profile` (`profile.ts:218`, partial-merge) so recommendations survive re-onboarding and feed S15. Prefer (a) for the step; optionally also (b) to thread selections into Memory Import. | `localStorage` and/or `profile` store |

**No net-new sidecar route is strictly required** for S14 itself, and **no `.mind`
migration** — both source catalogs already have HTTP routes, and the selection is small
UI state. (Contrast: S15 Memory Import and the Home/Artifacts screens DO need net-new
routes; S14 is the cheap one.)

> Adjacent (not S14-blocking): if the team later wants the "unsupported tool" free-text to
> become a real demand signal, the cheapest home is `PUT /api/profile` `unsupportedTools[]`
> — no new substrate.

---

## 6. Shared types needed (PRD §15 vs `lib/types.ts`)

- **`OnboardingState.toolsUsed?: string[]`** (+ optional `unsupportedTools?: string[]`) —
  add to `apps/web/src/hooks/useOnboarding.ts:10-19`. Additive, optional.
- **`ToolRecommendation`** interface in the new `lib/tool-recommendations.ts` (mirrors
  `SkillRecommendation` in `skill-recommendations.ts:20-27`).
- **Reuse, do not redefine:** `ConnectorDefinition` (`packages/shared/src/types.ts:276-302`)
  for the SaaS column; `ToolId` / `DetectedTool` / `TOOL_DISPLAY_NAMES`
  (`packages/shared/src/tool-detection.ts`) for the AI/Dev column.
- **PRD §15 note:** S14 does **not** introduce any of the missing §15.2 unions
  (`WorkspaceType`, `Scope`, `MemoryKind`, `ArtifactKind`, …). It only needs the additive
  onboarding field above, so it is **not** gated on the §15 type-alignment work that other
  screens (Memory, Artifacts, Agents) require.

---

## 7. Dependencies (screens / phases first)

- **Onboarding re-sequence (cross-screen):** the live wizard order (tier/template/persona/
  api-key) differs from the PRD 7-step IA. S14 slots between **S13 Who Are You** and
  **S15 Memory Import** (J01/J02). Coordinate step insertion + progress-count fix once,
  alongside the other onboarding screens (S12 First Launch, S13, S15, S16, S17) rather than
  in isolation — they all touch `OnboardingWizard.tsx` + `useOnboarding.ts`.
- **Feeds S15 Memory Import:** selected tools should bias which import sources/connectors
  S15 surfaces (PRD: recommendations from selections). S14 must land before/with S15.
- **Feeds Extend / Marketplace (S/connectors):** "What's next" recommendations point at
  the same connector/MCP catalog those screens own.
- **No backend dependency** — `/api/connectors` and `/api/tools/detect` already exist, so
  S14 frontend is **not blocked on any backend phase**.
- **Soft dependency:** `lib/tool-recommendations.ts` reuses the `skill-recommendations.ts`
  pattern (already shipped).

---

## 8. Effort: **M**

Net-new step component + group/card subcomponents + a pure recommendation mapper + one
additive `OnboardingState` field + wizard-switch/progress-count wiring. **Zero net-new
backend routes and zero `.mind` migration** (both catalogs already have HTTP routes), which
keeps it out of L/XL. Larger than S (real new UI surface, two data sources to merge and
de-dupe, recommendation logic with tests, and the progress-count/step-sequence cleanup that
ripples through the wizard).

---

## 9. Open questions

1. **Catalog scope for the grid.** Mockup shows ~7 SaaS + ~5 AI tools, but the registry
   has ~31 connectors. Show a **curated subset** (most common, matching the mockup) with a
   "more" affordance, or the full grouped catalog? PRD says "user-oriented, not infra" →
   leans curated. Needs a product call on the curated list.
2. **Two columns, two id-spaces.** SaaS column uses connector `id`s; AI/Dev column uses
   `ToolId`. The "You selected" rail and `toolsUsed[]` need a unified id scheme (namespaced
   e.g. `connector:gmail` / `tool:cursor`) so the recommender and S15 can disambiguate.
3. **Pre-check installed AI tools?** Should `GET /api/tools/detect` results pre-select the
   AI/Dev cards (lower friction, "we already see Cursor") or stay unchecked until the user
   opts in? J01 implies a populated, trusted start; lean pre-check + visible "detected" badge.
4. **Where do selections live long-term?** `localStorage` only (simplest), or also
   `PUT /api/profile` so recommendations persist and feed Home/Extend after onboarding?
   Profile-write is cheap and reusable but adds a server round-trip to the step.
5. **Recommendation placement: client vs server.** Recommend client-side
   (`lib/tool-recommendations.ts`, pure + testable, no round-trip) per §5 — confirm the team
   is fine deferring a `GET /api/recommendations` endpoint until a server-side consumer needs it.
6. **"Unsupported tool" handling.** Captured as a profile/demand signal only, or also
   surfaced as "available via MCP" with a marketplace deep-link? Affects whether the free-text
   needs any backend at all (recommend: capture-only for v1).
