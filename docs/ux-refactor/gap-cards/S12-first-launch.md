# Gap Card — S12 First Launch (Onboarding Step 1)

> Screen S12 of the Waggle OS UX-refactor. PRD source of truth: §12.12 (Onboarding Flow,
> step 1 "First Launch - promise and privacy"), §13 Journey 1 step 2, §14.1 global states.
> Blueprint screen spec: `_blueprint_extracted.txt:365-372` (PAGE 14, row 12). Mockup
> (directional only, PRD §24): `Waggle_OS_Handoff_Assets/screen_12_first_launch.png`.
> Execution model: **in-place incremental refactor** of `apps/web` — KEEP the wizard shell,
> redesign the welcome step per PRD §20.2.

---

## 1. Screen & purpose

The very first thing a fresh-install user sees: a minimal **promise + privacy reassurance**
splash before any setup. It is onboarding step 1 of the 7-step flow (PRD §12.12: First Launch →
Who Are You → Tool Discovery → Memory Import → Memory Review → Workspace Creation → Home Cockpit).

Purpose (blueprint S12): "Minimal promise and privacy reassurance." Acceptance (blueprint S12):
**"No infrastructure overload before user intent"** — i.e. no API-key/tier/model questions on
this screen; only the brand promise, a privacy note, a language affordance, and a single
Continue action.

Mockup content (directional): Waggle "W" logo + wordmark top-left; centered hero logo;
`Welcome to Waggle`; tagline `Your work. Your memory. Your agents.`; primary `Continue →`
button; a 4-dot progress indicator; footer-left privacy line ("Your data is private. Stored
locally."); footer-right language selector showing `English (US)`.

---

## 2. Required states (PRD / Blueprint)

Blueprint S12 names exactly four states (`_blueprint_extracted.txt:369-370`), plus the PRD §14.1
global-state baseline that "every major screen must implement":

| State | Source | What it means on S12 |
|---|---|---|
| **Fresh install** | Blueprint S12 | Default: brand promise + privacy + Continue. The only state the current code renders. |
| **Resumed setup** | Blueprint S12 | User dismissed/closed mid-onboarding and returns; wizard re-opens at the saved step (not necessarily step 0). Resume should land on the persisted step, and First Launch should communicate "picking up where you left off" rather than re-greeting cold. |
| **Offline** | Blueprint S12 + PRD §14.1 | Sidecar unreachable. Screen must still render (it is pre-network) and must not block; surface a non-alarming offline indicator and keep Continue usable (downstream steps degrade, not this one). |
| **Local-only** | Blueprint S12 + PRD §6/§18.1 (local-first default) | Privacy promise must be truthful and visible: "your data is private / stored locally." This is the trust hook the whole onboarding leans on (PRD §12.12 acceptance: "Nothing imports without explicit review/approval"). |
| Interaction: **Continue** | Blueprint S12 | Advance to step 2 (Who Are You). |
| Interaction: **Change language** | Blueprint S12 + mockup | A language affordance. **No i18n infra exists** (see §3) — scope decision required (§9). |
| Interaction: **View privacy note** | Blueprint S12 + mockup | A privacy note / link, inline or expandable. |

PRD §14.1 also lists Loading / Error / Permission-denied as universal — for a pre-network welcome
splash these collapse to: render immediately (no loading gate), and offline == the only "error-ish"
state that matters here.

---

## 3. Current state in repo (exact files + what they do)

**Disposition: `rework`** (KEEP the wizard shell per PRD §20.2 "Onboarding wizard → simplify";
redesign the step-0 component and add the missing affordances).

### The shell (KEEP)
- `apps/web/src/components/os/overlays/OnboardingWizard.tsx` — full-screen early-return wizard
  (`OnboardingWizard.tsx:399-576`). Holds 8 steps (`STEP_NAMES`, `:35`):
  `welcome / why-waggle / tier / memory-import / template / persona / api-key / ready`.
  Step 0 auto-advances after **3 s** (`:136-141`), Escape → Skip (`:86-96`), a top progress bar +
  step dots + Back + "Skip setup" chrome (`:421-493`). Rendered by `Desktop.tsx:262-272` when
  `!onboardingState.completed`. This shell is the reuse target.
- `apps/web/src/hooks/useOnboarding.ts` — `OnboardingState` (`:10-19`: `completed, step, tier?,
  workspaceId?, apiKeySet?, templateId?, personaId?, tooltipsDismissed?`), persisted to
  `localStorage` key `waggle:onboarding` (`:21`). Auto-completes for returning users via Tauri
  first-launch flag (`:102-131`) and a sidecar `getWorkspaces().length > 0` check (`:139-176`).
  `?forceWizard=true` (DEV) forces step 0 (`:47-57`). **This is the "resumed setup" backbone** —
  `state.step` already persists, so resume is half-built.

### The screen itself (REWORK)
- `apps/web/src/components/os/overlays/onboarding/WelcomeStep.tsx` — the current step-0 component
  (54 lines). Renders the Waggle logo, eyebrow `Your AI Operating System`, `Welcome to the Hive`,
  tagline `Persistent memory. Workspace-native. Built for knowledge work.`, a `Continue →` button
  (`:39-45`) + "or click anywhere". **Gaps vs S12:** copy differs from mockup ("Welcome to the
  Hive" vs "Welcome to Waggle"; tagline differs); **no privacy note**, **no language selector**,
  **no offline/local-only awareness**. It is a pure presentational component (props
  `WelcomeStepProps` = `goToStep` + `onClickAnywhere`, `onboarding/types.ts:10-12`).
- `apps/web/src/components/os/overlays/onboarding/WhyWaggleStep.tsx` (step 1, the current 2nd
  screen) carries the 3 `VALUE_PROPS` (constants `:111-115`) + the "Skip — quick setup" escape
  hatch. Mentioned because the mockup's tagline-style promise overlaps WelcomeStep/WhyWaggle; the
  rework should not duplicate value-prop content across both.
- `apps/web/src/components/os/overlays/onboarding/constants.ts` — `VALUE_PROPS` (`:111-115`),
  `fadeSlide` motion preset (`:118-123`), `STEP_NAMES`. Reuse `fadeSlide` for the rework.
- `apps/web/src/components/os/overlays/onboarding/types.ts` — `WelcomeStepProps` (`:10-12`).

### Supporting state already present (REUSE)
- `apps/web/src/hooks/useOfflineStatus.ts` — `useOfflineStatus()` returns `offline:boolean`
  (`:36-99`, 2-consecutive-failure tolerance). Backs the **offline** state. Already consumed by
  `Desktop.tsx:112` and `StatusBar.tsx`; thread it into the welcome step.
- Privacy/local-only copy: **no dedicated component exists**, but the claim is true per PRD §6
  ("Local-first by default") / §18.1. EraseDataDialog / data-erase surfaces exist elsewhere
  (`overlays/EraseDataDialog.tsx`) but there is no reusable "privacy note" primitive — net-new
  small UI.
- **No i18n infrastructure** — grep for `i18next | react-i18next | useTranslation |
  LanguageSelector | changeLanguage | navigator.language` over `apps/web/src` returns **0 matches**.
  All UI copy is hardcoded English. The mockup's `English (US)` selector has **no backing system**.

---

## 4. Frontend work

**Reuse the wizard shell; rework step 0 into a proper First-Launch screen.**

### Components to create / rework
1. **REWORK `WelcomeStep.tsx`** (or rename to `FirstLaunchStep.tsx` keeping the same step-0 slot)
   - Align copy to mockup: `Welcome to Waggle` + tagline `Your work. Your memory. Your agents.`
     (PRD §24: mockup is directional — keep current eyebrow/brand voice if it reads better, but
     the privacy promise + language + Continue affordances are required by blueprint, not optional).
   - Add **privacy note** (footer-left): short line ("Your data is private. Stored locally.") with
     a "view privacy note" expand (inline `Popover`/`HoverCard` from `components/ui/`, or a small
     details disclosure). Maps blueprint interaction "view privacy note" + state "local-only".
   - Add **offline awareness**: consume `useOfflineStatus()`; when offline, show a subtle indicator
     (reuse the StatusBar offline visual language) and keep Continue enabled (this step is pre-network).
   - Add **language affordance** (footer-right): see §9 open question — recommended v1 = a static,
     disabled-looking `English (US)` chip (honest: only English ships) OR a minimal selector wired to
     a new `OnboardingState.locale` that only persists the choice. Do **not** build full i18n in this
     card's scope.
   - Keep the existing **Continue** (`goToStep(1)`) + **click-anywhere** + **autoFocus** +
     keyboard-reachable button (WelcomeStep already satisfies WCAG 2.1.1/2.2.1 — preserve).
2. **(Optional, recommended) reconsider the 3 s auto-advance** (`OnboardingWizard.tsx:136-141`).
   A privacy-reassurance screen that auto-dismisses in 3 s undercuts the "read the privacy note"
   intent. Rework: keep auto-advance only when no interaction, or drop it for S12. (Surgical change,
   one `useEffect`.)
3. **"Resumed setup" copy hook** — when `state.step > 0` on mount (returning mid-flow), the shell
   already restores the step; ensure First Launch isn't re-shown cold. Minimal: the existing
   `state.step` restore (`OnboardingWizard.tsx:39`) already handles navigation; add a one-line
   "Welcome back — picking up where you left off" variant if `state.step` was persisted > 0. Low
   priority; the resume mechanic exists.

### Reuse targets
- Shell: `OnboardingWizard.tsx` (progress bar, dots, Skip, Back, AnimatePresence step swap).
- Motion: `fadeSlide` (`constants.ts:118-123`).
- Offline: `useOfflineStatus()`.
- UI primitives: `components/ui/{button,popover,hover-card,badge}.tsx` (shadcn set already present).
- Brand assets: `assets/waggle-logo.{png,jpeg}` (already imported by WelcomeStep, theme-aware via
  `useIsLightTheme`).

### Props / state
- `WelcomeStepProps` (extend): add `offline: boolean` (from `useOfflineStatus`), and — if a
  language chip is wired — `locale?: string` + `onLocaleChange?: (l: string) => void`.
- `OnboardingState` (`useOnboarding.ts:10-19`): optionally add `locale?: string` (additive,
  localStorage-only, no backend). Resume already covered by existing `step` field.

### Adapter methods / hooks
- **None new required.** This screen is pre-network. `useOfflineStatus` already wraps the health
  probe; `adapter.trackTelemetry('onboarding_step', …)` already fires on step change
  (`OnboardingWizard.tsx:31-33, :132`). No new adapter method.

---

## 5. Backend work

**This screen needs effectively NO backend.** It is the pre-intent splash; every interaction is
local UI + localStorage. Cross-referenced against backend-routes inventory and backend-map §03c —
nothing on S12 maps to a missing PRD §16 endpoint.

| Capability needed | PRD §16 endpoint | Status | Note / what to EXTEND vs NET-NEW | Substrate / migration |
|---|---|---|---|---|
| Continue / advance step | — (none) | **EXISTS (client-only)** | Step state is `OnboardingState.step` in `localStorage` (`useOnboarding.ts`). No server call. | none |
| Offline / local-only state | — (no PRD §16 row) | **EXISTS** | Reuse `GET /api/offline/status` (`offline.ts`) + the health probe already used by `useOfflineStatus`. No new route. | none |
| Privacy note / local-first claim | — (none) | **EXISTS (static)** | Truthful per PRD §6/§18.1; copy-only. No endpoint. | none |
| Language change | — (none) | **MISSING (no infra)** | No i18n/locale backend anywhere (grep-confirmed). If a real selector is wanted, locale persists client-side in `OnboardingState.locale` (localStorage) — **net-new client field, NOT a server route**. Could later piggy-back on `PUT /api/profile` (`profile.ts`, EXISTS) or `PATCH /api/settings` (`settings.ts`, EXISTS) if locale must sync, but that is out of scope for v1. | none (no `.mind` migration) |
| Returning-user / resume detection | — (none) | **EXISTS** | `useOnboarding` already calls `adapter.getWorkspaces()` (`GET /api/workspaces`, EXISTS) + Tauri first-launch flag to auto-complete returning users. No change. | none |

**No `.mind` migration. No net-new route. No substrate touch.** S12 is the single cleanest screen
in the refactor from a backend standpoint.

---

## 6. Shared types needed (PRD §15 vs lib/types.ts)

- **None of the PRD §15.2 unions are touched by S12** (no WorkspaceType/Scope/MemoryKind/etc. on a
  welcome splash).
- The only candidate type change is local: add optional `locale?: string` to `OnboardingState`
  (`hooks/useOnboarding.ts:10-19`) **if** the language affordance is wired beyond a static chip.
  This is a frontend-only interface field, not a PRD §15 shared type, and needs no `packages/shared`
  change.
- `WelcomeStepProps` (`onboarding/types.ts:10-12`) gains `offline` (+ optional locale props). Local
  to the onboarding folder.

---

## 7. Dependencies (screens / phases first)

- **Phase placement:** PRD Sprint 5 / Release Phase 2 ("Onboarding flow: Welcome, Profile, Tool
  Discovery, Memory Import, Memory Review"). S12 is the **entry** of that sequence.
- **Hard dependency:** the wizard shell (`OnboardingWizard.tsx`) must remain the host — already
  exists, so no blocker. S12 can be reworked independently of the later steps.
- **Sibling screens that share the shell** (do these in the same sprint to keep the rework
  coherent): S13 Who Are You, S14 Tool Discovery, S15 Memory Import, S16 Memory Review, S17 Create
  Workspace. S12 should land first because it sets the privacy/local-first framing the rest rely on.
- **No dependency on Home Cockpit / Workspace Desktop / Command Center backend work** — S12 is
  pre-workspace and pre-network.
- **Decision dependency:** the language-selector scope question (§9) should be answered before
  implementation so the footer affordance isn't built twice.

---

## 8. Effort

**S** — Single presentational component rework inside an existing, working shell; reuse
`useOfflineStatus` + existing motion/UI primitives; **zero backend, zero migration, zero shared-type
churn**. The only thing that could push it toward **M** is electing to build a real (even minimal)
language selector + `locale` plumbing instead of a static `English (US)` chip.

---

## 9. Open questions

1. **Language selector — real or honest-stub?** No i18n exists (grep-confirmed: 0 matches for
   i18next/useTranslation/etc.). Options: (a) static disabled `English (US)` chip (truthful, S
   effort, recommended v1); (b) minimal selector that persists `OnboardingState.locale` but only
   English is wired (cosmetic); (c) defer the affordance entirely. PRD §24 lets us treat the mockup
   as directional, and PRD §4.4 lists native/i18n work as out-of-first-phase scope — so (a) or (c)
   align with the PRD. **Recommend (a).** Confirm before building.
2. **Keep the 3 s auto-advance on a privacy screen?** Current step-0 auto-advances after 3 s
   (`OnboardingWizard.tsx:136-141`), which fights the "read the privacy note" intent. Drop it for
   S12, or keep-but-pause-on-interaction?
3. **Copy alignment:** mockup says "Welcome to Waggle" / "Your work. Your memory. Your agents.";
   current ships "Welcome to the Hive" / "Persistent memory. Workspace-native…". Which brand voice
   wins? (PRD §24: pixels don't, but the privacy promise must be present either way.)
4. **"Resumed setup" UX:** the step is restored from `localStorage` already — is a distinct
   "welcome back" treatment on First Launch wanted, or is silent step-restore sufficient?
5. **Privacy note content:** inline expandable text vs link to a privacy doc/URL? No privacy-policy
   route or doc is wired today — needs copy + destination decided.
