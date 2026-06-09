# Phase 2D — Onboarding Chain · Build Plan

> Scope: the day-0 onboarding/first-run chain (PRD §12.12 / DoD #6). Execution model is LOCKED:
> **in-place incremental refactor** of `apps/web` + targeted sidecar extension. PRD acceptance criteria
> win over mockups (PRD §24). Every claim below is grounded in live source under
> `D:/Projects/waggle-os-ux-refactor` (paths cited inline).
>
> **Critical reuse note:** Harvest preview-classification (C33 unreviewed + B2 confidence + B6 kind) was
> already built in **Phase 2B.3** (`harvest-classify.ts`, `harvest.ts` preview/commit, `harvest-kind-map.ts`)
> and the Memory Center "Needs review" review surface was built in **Phase 2B-FE.2** (`MemoryCenterTab.tsx`).
> 2D **reuses** these; it does NOT rebuild classification, confidence, or the review queue.

---

## 1. CURRENT vs TARGET

### Current OnboardingWizard (8 steps, `apps/web/src/components/os/overlays/OnboardingWizard.tsx`)

`STEP_NAMES` (`OnboardingWizard.tsx:35`):
`welcome → why-waggle → tier → memory-import → template → persona → api-key → ready` (steps 0–7).

| Step | Component | Wired vs hardcoded |
|---|---|---|
| 0 welcome | `WelcomeStep` | Hardcoded brand copy; 3s auto-advance (`:136-141`). |
| 1 why-waggle | `WhyWaggleStep` | Hardcoded `VALUE_PROPS` (`constants.ts:111`); "Skip and set me up" escape hatch (`:271-304`). |
| 2 tier | `TierStep` | `selectedTier` → `onUpdate({tier})` (UI density, not billing). |
| 3 memory-import | `ImportStep` | **Wired**: `harvestPreview`/`harvestCommit`/`scanClaudeCode` (`:156-202`). Commits inline then `goToStep(4)`. |
| 4 template | `TemplateStep` | Hardcoded 15 `TEMPLATES` (`constants.ts:10`), `TEMPLATE_PERSONA` map. |
| 5 persona | `PersonaStep` | `ALL_ONBOARDING_PERSONAS` (`constants.ts:46`) + custom-persona create. |
| 6 api-key | `ModelTierStep` | Model/key; calls `handleFinish` → `adapter.createWorkspace` (`:306-354`). |
| 7 ready | `ReadyStep` | Auto-finish after 2s. |

State backbone: `useOnboarding.ts` `OnboardingState` (`:10-19`) = `{ completed, step, tier?, workspaceId?,
apiKeySet?, templateId?, personaId?, tooltipsDismissed? }`, localStorage key `waggle:onboarding`. Resume is
half-built: `state.step` persists; returning-user auto-complete via Tauri flag + `getWorkspaces().length>0`
(`:102-176`). `?forceWizard=true` (DEV) forces step 0.

**There is NO profile/"Who Are You" step, NO Tool Discovery step.** The current IA (tier/api-key/model) is the
OLD onboarding, not the PRD §12.12 flow.

### Target — PRD §12.12 5-step chain (S12–S17)

PRD order: **First Launch (S12) → Who Are You (S13) → Tool Discovery (S14) → Memory Import (S15) →
Memory Review (S16) → Workspace Creation (S17) → Home Cockpit**. Per the ratified C33 decision, Memory
**Review (S16) is NOT a blocking onboarding step** — import commits immediately as `status:'unreviewed'`,
and review happens later in the Memory Center "Needs review" filter / J08 queue. So the in-wizard chain is
effectively **5 interactive steps**: First Launch → Who Are You → Tool Discovery → Memory Import →
Workspace Creation, with a Ready/handoff terminal.

Target step mapping (keep the existing wizard shell + AnimatePresence switch; re-key `STEP_NAMES`):

```
0 first-launch      (S12)  rework WelcomeStep
1 who-are-you       (S13)  NEW WhoAreYouStep  ← B8 profile + identity seed
2 tool-discovery    (S14)  NEW ToolDiscoveryStep (DEFERRABLE — see §6 note)
3 memory-import     (S15)  rework ImportStep — commit-as-unreviewed (C33)
4 workspace-create  (S17)  route through CreateWorkspaceDialog step bodies (or inline)
5 ready                    keep ReadyStep
```

> S16 Memory Review is delivered by the **already-shipped** Memory Center "Needs review" filter
> (`MemoryCenterTab.tsx:25-31`), NOT a wizard step. This is the C33 ratification (below).

### Explicit gate ratifications (verbatim, from `deltas/open-questions.md`)

- **B8** (`open-questions.md:28, :350`): *"Onboarding writes profile AND seeds the `identity` table."* /
  *"Write profile + seed identity in the same onboarding commit. Rationale: prevents the two-store drift…
  makes the Phase-1 Home greeting correct."*  **[BLOCKS P1 greeting]**
- **C33** — RESOLVED to the middle path (`open-questions.md:45-53`): *"Commit-as-unreviewed, non-blocking
  review: onboarding Import commits immediately (memory feels alive on first run), but frames land with
  `status:'unreviewed'` + the B2 confidence score; Review is a **non-blocking** curation surface (Memory
  Center "needs review" filter + the standing J08 queue), NOT a blocking onboarding step… Supersedes the
  original §C C33 'blocking split' recommendation."*
- **B2** (`:39`): *"cheap heuristic at preview (source-trust × adapter-type × dedup), persisted in `metadata`…
  LLM scoring reserved for the standing J08 queue."*
- **B6** (`:41`): *"PRD §15.2 canonical in `@waggle/shared`; pure harvest + display-category mapping helpers.
  Drop FE `event`/`insight` drift."*
- **C28** (`:420`): language selector → *"static disabled `English (US)` chip (no i18n exists…)."*
- **C29** (`:422`): *"drop the auto-advance"* on the first-launch privacy screen.
- **C30** (`:424`): *"keep Work type as a distinct personalization signal; don't re-ask what the template
  already implies."*
- **C31** (`:426`): Tool Discovery id-space → *"namespaced scheme (`connector:gmail` / `tool:cursor`)."*
- **C32** (`:428`): *"pre-select from `GET /api/tools/detect` with a visible 'detected' badge."*
- **C34** (`:433`): Hermes/Codex/Cursor tiles → *"render as `upload`/'Other' file pickers or 'coming soon' v1."*
- **C35** (`:435`): Workspace Creation → *"record connector/MCP ids as workspace *intent* on the config; do
  NOT run install/OAuth at create time."*
- **C6** (`:373`): `WorkspaceType` = *"`project | client | research | personal` (+`team`/`organization`
  reserved); `type` coexists with the free-string `group`."*

---

## 2. B8 — Identity seed ("capture who-you-are + greet by name")

### What already exists

- **Profile store** (`profile.ts`): `UserProfile` (`:41-94`) carries `name/role/company/industry/bio` +
  writingStyle/brand/interests/language/timezone. `GET /api/profile` (`:162`) + `PUT /api/profile` (`:167`,
  partial-merge allow-list `:172-196`). On save it ALSO mirrors a `User identity: …` P/I frame to personal
  memory (`:201-224`). Stored in `profile.json` (file, no SQLite). Adapter: `getProfile`/`updateProfile`
  (`adapter.ts:1357-1365`, typed `any`).
- **Identity table** (`identity.ts` route + `hive-mind-core/src/mind/identity.ts` `IdentityLayer`):
  single-row per-mind `identity` table (`name/role/department/personality/capabilities/system_prompt`).
  `GET /api/identity` (`:62`) + `POST /api/identity` upsert (`:104-156`). `IdentityLayer` exposes
  `create/get/exists/update/toContext` (`identity.ts:18-73`). This is what backs the **Home greeting name**
  via `adapter.getIdentity()` (`adapter.ts:742`).
- **UserProfileApp** (`apps/web/.../apps/UserProfileApp.tsx`, "My Profile") already renders a "Who Are You?"
  Identity tab capturing Name/Role/Company/Industry/Bio with `INDUSTRIES` + chip-toggle patterns —
  the **reuse target for the form fields**.

### The GAP to close (B8)

1. **No `setIdentity` adapter method.** `adapter.getIdentity()` exists (`:742`) but there is **no**
   `adapter.setIdentity(...)` calling `POST /api/identity`. → ADD it.
2. **Onboarding never writes profile or identity.** The wizard has no profile step; `OnboardingState` has no
   profile fields. → NEW `WhoAreYouStep` posts to `PUT /api/profile` AND `POST /api/identity` in one save.
3. **3 new profile fields** (`workType?`, `teamSize?`, `goals?: string[]`) are net-new on `UserProfile`
   (S13 §5). `PUT /api/profile` allow-list (`:172-196`) must be EXTENDED to merge them; `DEFAULT_PROFILE`
   (`:96-135`) extended; FE `UserProfile`/types updated.
4. **Identity-seed payload:** map profile → identity fields: `name→name`, `role→role`,
   `industry→department` (or leave department blank), optionally `bio→personality`. `system_prompt` left
   empty (the agent path already injects the profile frame). No schema change — `IdentityLayer.create/update`
   already upserts.

Backend substrate: `profile.json` + the existing identity table. **No `.mind` migration.**

---

## 3. C33 — Import → review (the EXACT existing contract to reuse)

### Existing harvest preview/commit contract (Phase 2B.3 — DO NOT rebuild)

**`POST /api/harvest/preview`** (`harvest.ts:227-258`). Request `{ data, source }`. Response:
```ts
{
  source: ImportSourceType,
  itemCount: number,                       // true total
  types: Record<string, number>,           // count by ImportItemType
  preview: ClassifiedItem[],               // back-compat: first 10
  items: ClassifiedItem[],                 // NEW: full list (capped at PREVIEW_ITEM_CAP=5000)
  itemsTruncated: boolean,
}
// ClassifiedItem = { id, title, type, source, kind: MemoryKind, confidence: number }  (harvest.ts:239-246)
```
`kind` from `importItemTypeToMemoryKind` (`harvest-classify.ts:32`); `confidence` (0–100) from
`harvestConfidence` (`harvest-classify.ts:66`, B2 heuristic = source-trust × item-type, no LLM).

**`POST /api/harvest/commit`** (`harvest.ts:265-582`). Request:
```ts
{ data?, source?, resumeFromRun?, selectedIds?: Array<string|number> }   // harvest.ts:266-275
```
- `selectedIds` present + non-empty → filters items to that subset (`:344-347`); absent → commits ALL
  (the C33 onboarding default).
- Each committed frame is stamped (`:449-456`), guarded on empty metadata, with:
  ```ts
  { kind: importItemTypeToMemoryKind(item.type), confidence: harvestConfidence(item),
    status: 'unreviewed', sourceId: item.id }
  ```
  → exactly the C33 "commit-as-unreviewed" behavior. Response carries `saved`, `cognifySkippedReason`,
  `wikiSkippedReason` (`no_real_embedder`), `runId`, etc.

**The review surface already exists.** `MemoryCenterTab.tsx` (Phase 2B-FE.2) has a **"Needs review"
status filter** (`:25-31`, `value:'unreviewed'`) + `MemoryCard` renders an "Needs review" badge
(`MemoryCard.tsx:18`). So S16's review is satisfied by Memory Center — **2D does not build a Review step.**

### The GAP the wizard must close

1. **Adapter `harvestCommit` cannot pass `selectedIds`.** Current signature
   `harvestCommit(data, source)` (`adapter.ts:1898-1901`) — the body omits `selectedIds`. → WIDEN to
   `harvestCommit(data, source, opts?: { selectedIds?, resumeFromRun? })`. (Backend already accepts it.)
2. **`harvestPreview`/`harvestCommit` typed `any`** (`adapter.ts:1893,1898`) — tighten to the shared
   `HarvestPreview`/`HarvestCommitResult` shapes (repo bans `any`; CLAUDE.md §10 — `no-explicit-any` is error).
3. **`ImportStep` reads `result.preview` (first 10), not the classified `items[]`** with kind/confidence
   (`OnboardingWizard.tsx:164` sets `importPreview` from `result.preview`). → rework to consume `items[]`
   and render kind chips + confidence so the user sees what is being imported (matches S15 §4). Selection is
   OPTIONAL per C33 (default = import all as unreviewed); if a "deselect" affordance is added it posts
   `selectedIds`. **Minimum viable 2D = keep commit-all; just surface kind/confidence + the
   "you can review later in Memory Center" pointer.**
4. **`ImportStepProps.importPreview` is `readonly unknown[]`** (`types.ts:39-40`) — widen to the classified
   item type.

No backend change is required for C33 — the contract shipped in 2B.3. 2D is **FE wiring only** here.

---

## 4. S17 — Workspace creation: exists vs 2D adds

### Exists

- **Backend `POST /api/workspaces`** (`workspaces.ts:162-230`): accepts `name/group/icon/model/personaId/
  templateId/storageType/storagePath/teamId/...`; enforces tier workspace-limit (403, `:194-203`);
  auto-creates storage structure + starter skills + template starter-memory. `WorkspaceManager.create`
  writes `workspace.json` (no SQLite).
- **Adapter `createWorkspace`** (`adapter.ts:253-260`): bridges `persona`→`personaId`.
- **Onboarding already creates a workspace** via `handleFinish`/`handleSkipSetup`
  (`OnboardingWizard.tsx:278-326`) — bespoke `adapter.createWorkspace` calls, NOT the dialog.
- **`CreateWorkspaceDialog.tsx`** (1129 LOC): the full standalone modal (template/persona/storage/folder
  picker). The richer S17 wizard (type picker, suggested capabilities, summary card) is a **separate S17
  card** — most of that is the standalone-modal rework, not the onboarding embed.

### What 2D adds (minimal, onboarding-scoped)

2D needs a workspace-create **step in the chain**, not the full S17 modal rework. Minimal:
- Reuse the existing `handleFinish` create path (name + template + persona) OR render a trimmed
  type-picker + name. Per **C6** add `type?: WorkspaceType` (`project|client|research|personal`) coexisting
  with `group`; per **C35** record any selected connector/MCP ids as **intent** (config fields), not installs.
- Backend: EXTEND `POST /api/workspaces` Body + `WorkspaceManager.create` with the additive optional V2
  fields (`description?, type?, status?, agentIds?, connectorIds?, mcpIds?`) — **JSON file, no migration**.
  (This field extension is shared with the Phase-0 `WorkspaceConfig` V2 work and the standalone S17 card.)
- Adapter `createWorkspace` body type widened to carry `description/type` (+ capability-id arrays if used).

> The full stepped S17 wizard (Suggested Skills/Agents/Connectors/MCPs panels + summary card) is the
> **standalone S17 card's** scope. 2D's workspace-create is the onboarding-embedded variant; keep it thin
> and route it through the SAME create call so onboarding and the modal converge later (S17 §4 parity note).

---

## 5. WHAT ALREADY EXISTS (do-not-rebuild) vs NET-NEW

### Do-not-rebuild (verified present)

| Capability | Where | Status |
|---|---|---|
| Harvest preview w/ per-item `kind`+`confidence` | `harvest.ts:227-258` + `harvest-classify.ts` | DONE (2B.3) |
| Harvest commit w/ `selectedIds` + `status:'unreviewed'` stamp | `harvest.ts:265-456` | DONE (2B.3) |
| B2 heuristic confidence | `harvest-classify.ts:66` | DONE |
| B6 `ImportItemType→MemoryKind` (server) | `harvest-classify.ts:32` | DONE |
| B6 FE display-category map | `apps/web/src/lib/harvest-kind-map.ts` | DONE (2B.3) |
| Memory Center "Needs review" filter (the S16 review surface) | `MemoryCenterTab.tsx:25-31`, `MemoryCard.tsx:18` | DONE (2B-FE.2) |
| Profile store + `GET/PUT /api/profile` + identity-frame mirror | `profile.ts` | EXISTS |
| Identity table + `GET/POST /api/identity` + `IdentityLayer` | `identity.ts`, `mind/identity.ts` | EXISTS |
| `adapter.getProfile/updateProfile/getIdentity` | `adapter.ts:1357,1362,742` | EXISTS |
| Profile form fields/INDUSTRIES/chip-toggle to copy | `UserProfileApp.tsx` | EXISTS |
| Claude-Code auto-detect + harvest | `harvest.ts:831`, wizard `:182-202` | EXISTS |
| Connector catalog `GET /api/connectors`; tool-detect `GET /api/tools/detect` (S14) | `connectors.ts`, `tools.ts` | EXISTS |
| `POST /api/workspaces` + tier-limit + starter skills | `workspaces.ts:162` | EXISTS |
| Wizard shell (progress/dots/Back/Skip/AnimatePresence) | `OnboardingWizard.tsx:399-575` | EXISTS — keep |
| Resume backbone (`state.step` persist) | `useOnboarding.ts` | EXISTS |

### Net-new in 2D

- FE: `WhoAreYouStep.tsx` (S13); `ToolDiscoveryStep.tsx` + `lib/tool-recommendations.ts` (S14, deferrable);
  reworked `WelcomeStep`/`FirstLaunchStep` (S12); reworked `ImportStep` (S15 surface kind/confidence);
  workspace-create step (S17 thin); `lib/onboarding-profile.ts` (option constants + `buildProfilePreview`).
- Adapter: **`setIdentity(...)`** (new); `harvestCommit` 3rd `opts` arg; tighten `harvestPreview/harvestCommit`
  types; widen `createWorkspace` body type.
- Backend: EXTEND `PUT /api/profile` allow-list (+`workType/teamSize/goals`) + `DEFAULT_PROFILE` + `UserProfile`;
  EXTEND `POST /api/workspaces` + `WorkspaceManager.create` V2 fields. **No new route, no `.mind` migration.**
- Types: `OnboardingState` += `profileSeeded?`, `toolsUsed?: string[]` (localStorage, additive); shared
  `WorkspaceType` (C6) + `HarvestPreview`/`HarvestCommitResult`; FE `UserProfile` (+3 fields).
- Wizard: re-key `STEP_NAMES`, the step switch (`:498-572`), progress math (`progressPct :396`, dots `:472`,
  `aria-valuemax :426`), Back-range (`:444`), and the `goToStep(N)` auto-advances.

---

## 6. Minimal sub-phase build plan (each independently tsc + test verifiable)

> Verify gate per sub-phase (CLAUDE.md §2): `tsc` on touched packages
> (`shared → hive-mind-core → server`, then `npm run build` for apps/web), `npm run test -- --run`, `npm run lint`.
> Build order: shared → hive-mind-core → core → agent → server.

### 2D.1 — Backend + shared + adapter (no UI)

Ordered, each file with the exact change + contract:

1. `packages/shared/src/types.ts` — add `WorkspaceType = 'project'|'client'|'research'|'personal'` (C6;
   `team`/`organization` reserved). (`MemoryKind` already canonical here from B6/2B.3 — do NOT redefine.)
2. `packages/server/src/local/routes/profile.ts` —
   - `UserProfile` (`:41-94`): add `workType?: string; teamSize?: string; goals?: string[]`.
   - `DEFAULT_PROFILE` (`:96-135`): add the three defaults (`''`, `''`, `[]`).
   - `PUT` allow-list (`:172-196`): merge the three (`if (updates.workType != null) …`).
   - Identity-frame mirror string (`:205-210`): optionally append role/industry (pure edit).
3. `packages/server/src/local/routes/workspaces.ts` — extend the `POST` Body (`:163-181`) + the
   `WorkspaceManager.create(...)` call (`:223-230`) with additive optional `description?, type?, status?,
   agentIds?, connectorIds?, mcpIds?` (JSON, no migration). (Coordinate with Phase-0 V2 field work.)
4. `packages/hive-mind-core/src/workspace-manager.ts` — add the same optional fields to `WorkspaceConfig` +
   `CreateWorkspaceOptions`; persist in `create()`/`update()` (stamp `updatedAt`). **No DB migration.**
5. `apps/web/src/lib/adapter.ts` —
   - NEW `async setIdentity(body): Promise<IdentityResponse>` → `POST /api/identity` (mirror `getIdentity`
     `:742`).
   - `harvestCommit` (`:1898`): add `opts?: { selectedIds?: Array<string|number>; resumeFromRun?: number }`
     and include in the POST body.
   - Tighten `harvestPreview`/`harvestCommit` return types to shared `HarvestPreview`/`HarvestCommitResult`
     (drop `any`); `getProfile`/`updateProfile` to `UserProfile` (drop `any`).
   - `createWorkspace` body type (`:253`): add `description?, type?: WorkspaceType, connectorIds?, mcpIds?`.

**Verify 2D.1:** tsc shared + hive-mind-core + server (+ apps/web build for adapter); add/extend route tests
(profile merge of 3 fields; identity upsert; commit `selectedIds` filter — the last already covered by 2B.3
tests, just confirm green).

### 2D.2 — Frontend (the chain)

1. `apps/web/src/lib/onboarding-profile.ts` (NEW, pure + `.test.ts`) — `WORK_TYPES`, `TEAM_SIZES`, `GOALS`
   option constants + `buildProfilePreview(partial)` (keeps the step thin).
2. `apps/web/src/lib/types.ts` — promote shared `UserProfile` (+ `workType/teamSize/goals`); import
   `WorkspaceType`, `HarvestPreview`/`HarvestCommitResult` from `@waggle/shared`.
3. `apps/web/src/hooks/useOnboarding.ts` — `OnboardingState` (`:10-19`): add additive optional
   `profileSeeded?: boolean`, `toolsUsed?: string[]` (localStorage only).
4. `apps/web/.../onboarding/WelcomeStep.tsx` (rework → S12): align copy; add static `English (US)` chip
   (C28) + privacy note; consume `useOfflineStatus`. `OnboardingWizard.tsx:136-141`: **drop the 3s
   auto-advance** (C29).
5. `apps/web/.../onboarding/WhoAreYouStep.tsx` (NEW → S13/B8): Name/Role/Industry (reuse `UserProfileApp`
   `INDUSTRIES`/chips) + WorkType/TeamSize/Goals + live preview. On Continue: `adapter.updateProfile(...)`
   **AND** `adapter.setIdentity({name, role, department: industry})`. Props `{ profile, onChange,
   onContinue, onBack, saving }`. Add `WhoAreYouStepProps` to `onboarding/types.ts`.
6. `apps/web/.../onboarding/ToolDiscoveryStep.tsx` (NEW → S14): grouped grid from `getConnectors` +
   `detectTools` (pre-check detected, C32); namespaced ids `connector:*`/`tool:*` (C31); writes
   `toolsUsed[]`. **DEFERRABLE** — if descoping 2D, omit this step and renumber; S14 has zero backend and
   can land in a 2D follow-up. (Flag in the chain as optional.)
7. `apps/web/.../onboarding/ImportStep.tsx` (rework → S15): consume `result.items[]` (kind+confidence) not
   `preview[]`; render kind chips + `ConfidenceBadge` (reuse `components/ui/confidence-badge`); add the
   "review anytime in Memory → Needs review" pointer (C33). Hermes/Codex/Cursor = upload/"Other"/coming-soon
   (C34). Keep commit-all default; commit still lands `unreviewed` server-side. Widen `ImportStepProps`.
8. `apps/web/.../onboarding/` workspace-create step (S17 thin): trimmed type-picker (C6) + name → existing
   `handleFinish` create path; record connector/MCP intent ids (C35). (Full stepped S17 = separate card.)
9. `apps/web/.../overlays/OnboardingWizard.tsx` — re-key `STEP_NAMES` (`:35`) to
   `first-launch/who-are-you/tool-discovery/memory-import/workspace-create/ready`; rewrite the step switch
   (`:498-572`); fix progress math (`:396`, dots `:472`, `aria-valuemax :426`, Back-range `:444`); add
   `handleProfileSave`; point import commit at the new step order; **remove the dead tier/api-key/model
   steps from the chain** (or keep behind a flag — surgical, prefer removal of the now-orphaned wiring).

**Verify 2D.2:** `npm run build` (apps/web tsc), `npm run test -- --run` (new `onboarding-profile.test.ts`
+ any wizard tests), `npm run lint`. Manual: `?forceWizard=true` walks First Launch → Who Are You (writes
profile+identity → Home greets by name) → [Tool Discovery] → Import (commits unreviewed; appears in Memory
"Needs review") → Workspace Create → Home.

### Largest single risk

**The `OnboardingWizard.tsx` step-index rewire.** It re-keys `STEP_NAMES`, the AnimatePresence step switch,
progress %, the dot array, `aria-valuemax`, the Back-button range, AND every `goToStep(N)` literal
(`:174, :199, :300, :350` etc.) — plus removal of the orphaned tier/api-key/model handlers and their
step-local state (`selectedTier/apiKey/keyValid/...`, `:47-60`). An off-by-one or a stale `goToStep(4)`
strands the user mid-flow or skips identity-seed/commit. Mitigation: change the step set in ONE pass, drive
all navigation off `STEP_NAMES.indexOf(name)` (not magic numbers), keep an E2E that asserts the full chain
reaches Home, and verify resume (`state.step`) lands on the correct re-keyed step. This is exactly the churn
S13/S14/S15/S16 §7 all warn must be "rewired once, not per-card."
