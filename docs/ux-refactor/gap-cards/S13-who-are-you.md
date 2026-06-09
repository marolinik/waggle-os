# Gap Card — S13 · Who Are You (Onboarding Profile)

> UX-refactor planning artifact. Execution model is **in-place incremental refactor** of `apps/web` +
> targeted backend extension. Every claim below is grounded in a real file. PRD = source of truth;
> mockup is directional (PRD §24). Screen index: **Onboarding Flow PRD §12.12 step 2** ("Who Are You").

---

## 1. Screen & purpose

The second onboarding step: capture the user's professional context so Waggle can personalize and
recommend. Per PRD §12.12 and the blueprint screen-spec table (PAGE 14, row 13): "Capture role,
industry, work type, team size and goals." Blueprint acceptance: **"Profile drives recommendations
but can be edited later."** Blueprint states: `Empty; partially complete; validation; saved`.

The mockup (`screen_13_who_are_you.png`) shows a single-step form inside the onboarding shell:
left rail step list (Welcome / Who are you / Tool discovery / Memory import / Review & confirm) + a
"Your data is private" reassurance card; center form with **Name, Role, Industry, Work type, Team
size, and a "What are your goals with Waggle?" multi-select chip group** (Build a second brain /
Improve team productivity / Automate recurring work / Make better decisions / Scale the business) +
free-text "Add other goal"; a right-hand live **"Your profile" preview panel** that mirrors the form
as the user types; Back / Continue footer. Mockup is directional — PRD/blueprint acceptance wins.

This profile drives downstream screens: Tool Discovery (S14) recommendations, Memory Import (S15)
source suggestions, Workspace Creation (S17) template/persona pre-fill, and the Home Cockpit greeting.

---

## 2. Required states (PRD/Blueprint)

From the blueprint screen-spec (PAGE 14, row 13) + PRD §14.1 global-state mandate:

- **Empty** — fresh form, nothing entered.
- **Partially complete** — some fields filled (Continue still allowed; profile is editable later).
- **Validation** — surface invalid/missing required input (blueprint lists "validation" as a state;
  PRD acceptance says it must not block — soft validation, not a hard gate).
- **Saved** — profile persisted; advance to Tool Discovery.
- **Loading** (PRD §14.1) — restoring a resumed/partial profile on re-entry.
- **Offline / local-only** (PRD §14.1, §6.7) — sidecar unreachable; the step must still let the user
  type and continue (write deferred / retried), mirroring the wizard's existing
  "created locally, sync later" fallback (`OnboardingWizard.tsx:286-288`).

PRD §12.12 acceptance criteria that bind this screen: "Onboarding asks user questions, not
infrastructure questions"; "Profile drives recommendations." PRD §7.1 activation metric: "% of new
users who complete onboarding."

---

## 3. Current state in repo — disposition: **partial** (rework + create-new)

There is **no onboarding "Who Are You" profile step today.** The profile-capture *capability* exists
post-onboarding as a separate app, and the onboarding wizard does NOT collect it. Two surfaces are
relevant; both partially overlap the requirement:

**(a) `OnboardingWizard.tsx`** (`apps/web/src/components/os/overlays/OnboardingWizard.tsx`) — the
first-launch wizard. Its actual step order (`STEP_NAMES`, line 35) is:
`welcome → why-waggle → tier → memory-import → template → persona → api-key → ready` (8 steps,
0-indexed; rendered via the `step===N` switch at lines 499-571). **There is no profile/identity-capture
step at all.** Steps map to `onboarding/` components: `WelcomeStep, WhyWaggleStep, TierStep, ImportStep,
TemplateStep, PersonaStep, ModelTierStep, ReadyStep` (`onboarding/index.ts`). The wizard's data model
(`OnboardingState` in `hooks/useOnboarding.ts`) tracks `step/tier/templateId/personaId/workspaceId/
apiKeySet` — **no profile fields.** Disposition for the wizard: **rework** — insert a new profile step
and a `WhoAreYouStep` component; widen `OnboardingState` minimally (or post directly to `/api/profile`).

> Note: the wizard's IA (tier picker, API-key step, model-tier step) is the OLD onboarding, not the
> PRD §12.12 flow (Welcome → Who Are You → Tool Discovery → Memory Import → Memory Review → Workspace
> Creation → Home). PRD §20.2 explicitly lists "Onboarding wizard → simplify to user-oriented 5-step
> setup plus workspace creation." S13 is one slice of that larger onboarding rework; this card scopes
> only the profile step, but the planner must sequence it inside the onboarding-IA rework (see §7).

**(b) `UserProfileApp.tsx`** (`apps/web/src/components/os/apps/UserProfileApp.tsx`, 533 LOC) — the
post-onboarding "My Profile" app (dock id `profile`). A 4-tab surface: **Identity** (Name/Role/Company/
Industry/Bio + "Research Me" + harvest-suggestion accept/dismiss banner, lines 242-343), Writing Style,
Brand & Templates, Interests (interests chips + language, lines 483-520). Its Identity tab already
renders the heading "**Who Are You?**" (line 245) and captures Name/Role/Company/Industry/Bio via
`adapter.getProfile()` / `adapter.updateProfile()` (lines 86-102, 120-133). This is the **reuse target**
for the form fields, validation pattern, and adapter wiring — but it is NOT an onboarding step, it has
NO Work type / Team size / Goals, and it has NO live preview panel. Disposition: **keep-promote** the
field/adapter patterns; extract a shared profile-form so the onboarding step and the app don't diverge.

**Net:** the requirement is **partial** — backend persistence (`/api/profile`) + a structurally similar
form (UserProfileApp Identity tab) exist, but the *onboarding step itself*, the *3 new fields*
(work type / team size / goals), and the *live preview panel* are net-new frontend.

---

## 4. Frontend work

**Create:**
- `apps/web/src/components/os/overlays/onboarding/WhoAreYouStep.tsx` — the new step component
  (matches the `*Step.tsx` sibling convention; default-exported from `onboarding/index.ts`). Renders:
  Name (text), Role (text), Industry (`<select>` reusing `UserProfileApp.tsx:37-41` `INDUSTRIES`),
  **Work type** (select/segmented — e.g. Strategy & Operations / Engineering / Sales / Marketing /
  Research / Other), **Team size** (select — Just me / 2-10 / 11-50 / 50+), **Goals** (multi-select
  chip group, reusing the chip-toggle pattern from `UserProfileApp.tsx:488-498` interests), free-text
  "other goal", and the **live "Your profile" preview panel** (right column; pure derived view of
  current form state). Props: `{ profile, onChange, onContinue, onBack, saving }`. Local form state
  mirrored to a single `Partial<UserProfile>` object (immutable updates per repo coding-style).
- `apps/web/src/lib/onboarding-profile.ts` (optional helper) — the goal/work-type/team-size option
  constants + a `buildProfilePreview()` pure function (testable, co-located `.test.ts`), keeping the
  step component thin (CLAUDE.md §3.2, file-org rules).

**Rework:**
- `OnboardingWizard.tsx` — insert the new step into the flow after `WelcomeStep` per PRD §12.12 order.
  Touches: `STEP_NAMES` (line 35), the step switch (lines 499-571), step-index math (`progressPct`
  line 396, dots lines 472), and a `handleProfileSave` that calls `adapter.updateProfile(...)` (same
  call UserProfileApp uses, `UserProfileApp.tsx:123-128`). Keep the existing offline "created locally"
  fallback semantics (lines 286-288) for the profile write. NOTE: the current wizard IA (tier/api-key/
  model steps) is being reworked to the PRD §12.12 5-step flow in a sibling card — coordinate the
  step-index churn with that card to avoid double-editing the switch.
- `UserProfileApp.tsx` Identity tab — **optional consolidation**: extract the shared field set into the
  new `onboarding-profile.ts` form so onboarding and the app render the same Name/Role/Industry/Goals
  controls (avoids the documented "two parallel systems" anti-pattern,
  `feedback_grep_capability_not_feature_name.md`). At minimum, add the 3 new fields here too so a user
  can edit Work type / Team size / Goals after onboarding (blueprint: "can be edited later").

**Reuse targets (do not recreate):**
- `INDUSTRIES` + `INTEREST_OPTIONS` chip-toggle pattern — `UserProfileApp.tsx:31-41, 488-498`.
- `adapter.getProfile()` / `adapter.updateProfile()` — `lib/adapter.ts` (profile method block;
  inventory `frontend.md:232`). Already typed and used.
- `@/components/ui/{input,select-ish}` shadcn primitives (`components/ui/*`, inventory §(e)).
- Onboarding shell chrome (progress bar, Back/Skip, step dots) — already in `OnboardingWizard.tsx`.

**Adapter methods/hooks:** no NEW adapter method needed for the happy path —
`adapter.updateProfile(partial)` (PUT `/api/profile`, partial-merge) already accepts arbitrary profile
fields and the backend persists unknown-to-old-UI fields once the route is widened (see §5). The
profile is read via `adapter.getProfile()`. No new hook required; step holds local state and posts on
Continue.

---

## 5. Backend work

PRD §16 has **no dedicated onboarding-profile endpoints** — the profile domain is served by the
existing `/api/profile*` routes (`packages/server/src/local/routes/profile.ts`), which are NOT in the
PRD §16 list but already exist and are the correct substrate. So there is nothing "MISSING" in PRD §16
terms; the work is **EXTEND** of an existing route, not net-new routing.

| Capability | Status | Route to EXTEND vs NET-NEW · substrate |
|---|---|---|
| Read profile for the step | **EXISTS** | `GET /api/profile` (`profile.ts:162-164`) returns the full `UserProfile` (defaults-merged). Reusable as-is. |
| Persist profile from the step | **PARTIAL → EXTEND** | `PUT /api/profile` (`profile.ts:167-228`) partial-merges, but its allow-list of merged fields (lines 172-196) does **not** include the 3 new fields (`workType`, `teamSize`, `goals`). EXTEND the merge block + the `UserProfile` interface (`profile.ts:41-94`) + `DEFAULT_PROFILE` (`:96-135`) to carry them. Substrate: `profile.json` under `dataDir` (NOT SQLite) — **no DB migration.** |
| Mirror identity → memory | **EXISTS (reuse)** | `PUT /api/profile` already writes a `User identity:` P/I frame to personal memory on save (`profile.ts:201-224`). Optionally append role/industry/goals to that string so the agent picks up the new context — pure edit, no schema change. |

**Net-new fields (frontend + backend, additive):** `workType?: string`, `teamSize?: string`,
`goals?: string[]`. All three are pure additive optional fields on the JSON-file `UserProfile` shape.
The mockup's Industry/Name/Role already map 1:1 to existing fields.

**Substrate touched:** `profile.json` (file store, `getProfilePath()` `profile.ts:137-139`) and
(reused) personal `.mind` `memory_frames` via the existing identity-mirror path.

**.mind migration:** **NONE.** Profile lives in `profile.json`, not SQLite (`profile.ts:152-156`).
The identity-mirror writes frames through the existing append-only API — no schema change.

> Optional alignment (flag, not required for S13): a parallel structured identity record exists at
> `POST /api/identity` → `identity` table (`identity.ts:104-156`, fields name/role/department/
> personality/capabilities/system_prompt). The onboarding step writes to `/api/profile` (the richer,
> file-backed shape the UI already uses), NOT `/api/identity`. The planner should decide whether
> onboarding should ALSO seed `/api/identity` (it backs `adapter.getIdentity()` / the Home greeting
> name) or leave that to the existing profile→frame mirror. Out of S13 scope but worth a one-line
> decision to avoid two divergent identity stores.

---

## 6. Shared types needed (PRD §15 vs `lib/types.ts`)

PRD §15.2 defines no profile/onboarding union (its unions are Workspace/Memory/Artifact/Agent-centric),
so there is no PRD §15 type to satisfy here. The relevant types are:

- **Frontend:** `apps/web/src/lib/types.ts` has **no `UserProfile` type** (the shape is declared
  inline inside `UserProfileApp.tsx:45-52` and re-declared loosely in the new step). Recommend promoting
  a shared `UserProfile` (with the 3 new fields) to `lib/types.ts` so the onboarding step, the app, and
  the adapter return type share one contract (avoids the FE/BE drift the substrate inventory flags for
  other entities). Low-cost, additive.
- **Backend:** `UserProfile` + `IdentitySuggestion` interfaces are exported from `profile.ts:31-94`.
  Extend in place with the 3 new fields. (They are not in `packages/shared` today; keeping them in
  `profile.ts` + mirroring an FE type is consistent with current layout.)
- New small unions for the option sets (`WorkType`, `TeamSize`, goal ids) can live in
  `onboarding-profile.ts` as string-literal unions (repo coding-style prefers literal unions over enum).

---

## 7. Dependencies (screens / phases first)

- **Phase 2 (PRD §8)** — Onboarding flow is Phase 2 / Sprint 5 ("Who Are You" listed explicitly,
  PRD §21 Sprint 5 + §8 Phase 2).
- **Onboarding-IA rework first.** S13 is one step inside the PRD §12.12 flow (Welcome → **Who Are You**
  → Tool Discovery → Memory Import → Memory Review → Workspace Creation → Home). The current wizard's
  step order/IA differs from PRD §12.12; the step-index/switch churn in `OnboardingWizard.tsx` must be
  coordinated with the sibling onboarding cards (S12 First Launch, S14 Tool Discovery, S15 Memory
  Import, S16 Memory Review, S17 Workspace Creation) so the switch is rewired once, not per-card.
- **Downstream consumers of this profile:** S14 Tool Discovery (recommendations from work type/role —
  PRD §12.12 acceptance "recommended from user selections"), S15 Memory Import (source suggestions),
  S17 Workspace Creation (template/persona pre-fill), Home Cockpit greeting (name). S13 should land
  before or with S14 since S14 consumes its output.
- **No backend prerequisite** — `/api/profile` GET/PUT already exist; the field extension is
  self-contained and can ship independently of the Home/Workspace/Memory backend work.

---

## 8. Effort: **M**

One net-new step component + a live-preview panel + a thin backend field extension (3 additive JSON
fields, no migration) + onboarding wizard step insertion. The form fields, validation pattern, chip
toggles, and adapter wiring already exist in `UserProfileApp.tsx` to copy from, which keeps it out of
L. The "M" (not S) reflects: the live-preview panel is new UI, the wizard step-index/switch rewire is
fiddly and must be coordinated with the broader onboarding-IA rework, and a shared `UserProfile` type +
optional UserProfileApp consolidation add surface.

---

## 9. Open questions

1. **Identity store of record:** does onboarding write profile via `/api/profile` only (current UI
   path), or ALSO seed `/api/identity` (the `identity` table that backs the Home greeting name /
   `adapter.getIdentity()`)? Two identity stores exist; pick one to avoid drift. (§5 note.)
2. **Goal taxonomy:** are the 5 mockup goals (second brain / team productivity / automate recurring
   work / better decisions / scale business) the canonical set, or directional? They likely feed S14
   tool/connector recommendations — confirm the mapping owner.
3. **Work type vs Industry vs Persona/Template:** the existing onboarding already picks a template
   (`TEMPLATE_PERSONA`, `constants.ts:28-44`) which implies a work domain. Does "Work type" duplicate
   that signal, or is it a distinct axis used only for personalization? Resolve to avoid asking the
   user the same thing twice (PRD §12.12: "asks user questions, not infrastructure").
4. **Validation hardness:** blueprint lists a "validation" state but PRD says profile is editable
   later. Confirm Continue is never hard-blocked (soft-validate only) — assumed soft per PRD acceptance.
5. **Required vs optional fields:** which of Name/Role/Industry/Work type/Team size/Goals (if any) are
   required to proceed? Assumed all optional (partial-complete is an allowed state).
6. **Pre-fill from harvest:** UserProfileApp already accepts harvest-extracted `identitySuggestions`
   (`profile.ts:31-39`, `UserProfileApp.tsx:252-298`). Should the onboarding step pre-fill from those
   if Memory Import (S15) ran first? In PRD §12.12 order, import comes AFTER Who Are You — so likely no
   on first pass, but confirm whether a returning/resumed user sees suggestions here.
