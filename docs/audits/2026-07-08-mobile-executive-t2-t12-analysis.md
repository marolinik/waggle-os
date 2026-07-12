# Focused Mobile Executive T2/T12 Analysis

Status: original analysis plus current focused verification. The original screenshot pass recorded why T2 failed; the current focused Settings journey verifies that P0-2 is fixed in the present build.

Purpose: add 390 x 844 rendered evidence for the Mobile Executive judge path and sharpen the mobile acceptance criteria. The original pass shows why a simple document-level horizontal overflow check is not enough; the current focused run confirms the Settings portion of T2 now passes.

Guideline source refreshed during this pass: Vercel Web Interface Guidelines, `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`. The rules most relevant here are safe-area and overflow discipline, readable touch targets, visible focus, form clarity, URL/state clarity, and not relying on screenshots alone when layout can clip individual controls.

## Fresh Mobile Smoke Evidence

Environment:

```powershell
$env:WAGGLE_PORT='3419'
$env:WAGGLE_TRUST_LOCALHOST='1'
$env:WAGGLE_DISABLE_MARKETPLACE_SYNC='1'
$env:WAGGLE_DATA_DIR="$env:TEMP\waggle-mobile-smoke-3419"
$env:EMBEDDING_PROVIDER='mock'
$env:VITE_CLERK_PUBLISHABLE_KEY=''
$env:CLERK_SECRET_KEY=''
npm run build
npx tsx packages/server/src/local/start.ts --skip-litellm
```

Viewport: Playwright mobile/touch context at 390 x 844.

Screenshot directory:

```text
output/playwright/mobile-executive-3419/
```

Current focused verification:

```powershell
$env:WAGGLE_E2E_PORT='34195'
$env:WAGGLE_E2E_BASE_URL='http://localhost:34195'
npx playwright test tests/e2e/user-journeys.spec.ts --project=chromium -g "Settings is usable at 390px" --reporter=line
```

Result: pass, 1/1. The focused route checks `/settings`, `/settings?tab=models`, `/settings?tab=billing`, and `/settings/profile` at 390 x 844. It asserts no document-level horizontal overflow and no visible control overflow for buttons, tabs, tab panels, inputs, selects, and textareas.

Screenshots captured:

- `home.png`
- `settings.png`
- `settings-tab-models.png`
- `settings-tab-billing.png`
- `settings-profile.png`
- `memory.png`
- `workspace-chat.png`
- `overlay-command-center-open.png`
- `overlay-command-center-closed.png`
- `overlay-workspace-switcher-open.png`
- `overlay-workspace-switcher-closed.png`

Build/runtime notes:

- `npm run build` passed.
- Tailwind ambiguous motion-token warnings are now fixed by named motion utilities.
- The `shape-selection.ts` dynamic/static import warning is now fixed by a static adapter import guarded by `build-warning-hygiene.test.ts`.
- The Vite large-chunk warning is now fixed: current startup JS is `index-D-wAFouW.js` at 421.96 kB minified and 114.08 kB gzip, with PostHog split into a lazy `posthog-t8jwqJJL.js` chunk at 208.95 kB.
- The local server degraded embeddings to mock and skipped LiteLLM as intended for the analysis lane.

## Route Results

| Route or overlay | Result | Document overflow | Visible layout result | Console/status notes |
|---|---|---:|---|---|
| `/home` | Rendered expected Home content. | No | No critical route layout failure found in this smoke. Decorative offscreen elements are present but did not break the Home task. | Original screenshot pass emitted T1 Clerk/CSP errors; current focused console-health checks pass 3/3 on port `34196`. |
| `/settings` | Rendered expected Settings content. | No | Original pass failed T2 because the persistent side rail and Settings rail left a narrow content column. Current focused run on port `34195` passes visible-control bounds. | Existing T1 Clerk/CSP errors were emitted in the original screenshot pass. |
| `/settings?tab=models` | Rendered expected Models content. | No | Original pass failed T2 because disclosure controls overflowed and provider/model cards were squeezed. Current focused run on port `34195` passes visible-control bounds. | Existing T1 Clerk/CSP errors were emitted in the original screenshot pass. |
| `/settings?tab=billing` | Rendered expected Billing content. | No | Original pass failed T2/T10 because billing copy/cards were squeezed and the Annual toggle exceeded the viewport. Current focused run on port `34195` passes visible-control bounds. | Existing T1 Clerk/CSP errors were emitted in the original screenshot pass. |
| `/settings/profile` | Rendered expected Profile content. | No | Original pass had no visible route-level overflow; current focused run on port `34195` also passes visible-control bounds. | Existing T1 Clerk/CSP errors were emitted in the original screenshot pass. |
| `/memory` | Rendered expected Memory content. | No | Fails mobile polish: the Memory tab strip extends past the viewport; this belongs to T10/T12 unless it blocks the chosen mobile judge path. | Original screenshot pass emitted T1 Clerk/CSP errors; current focused console-health checks pass 3/3 on port `34196`. |
| `/workspaces/default-workspace/chat` | Rendered expected workspace/chat shell. | No | Fails mobile polish: workspace tabs extend past the viewport; message send and keyboard/touch flow were not exercised. | Original screenshot pass emitted T1 Clerk/CSP errors; current focused console-health checks pass 3/3 on port `34196`. |
| Command Center overlay | Opened. Escape close check failed in this run. | No | Original pass found long command labels/subtitles overflowing and a missing dialog description warning; current Command Center focused branch passes elsewhere. | Original screenshot pass emitted T1 Clerk/CSP errors; current focused console-health checks pass 3/3 on port `34196`. |
| Workspace Switcher overlay | Opened and closed with Escape. | No | Good signal for one mobile overlay close path, but route-changing close behavior remains part of T4 until codified. | Original screenshot pass emitted T1 Clerk/CSP errors; current focused console-health checks pass 3/3 on port `34196`. |

Key interpretation: `document.documentElement.scrollWidth` stayed equal to the 390 px viewport for the route screenshots, but individual controls visibly overflowed or became unreadably narrow. Phase 1 must test critical element bounds and screenshots, not only document scroll width.

## Findings Added By This Pass

### M1: Settings mobile failure is stronger than horizontal page overflow

Ticket mapping: T2, with T10/T12 evidence impact.

The original Settings failure was not only "the page scrolls sideways." The document can report no horizontal overflow while controls still clip inside constrained flex columns. The current `J-mobile: Settings is usable at 390px width` test now asserts that critical visible elements stay within the viewport:

- Settings section tab list.
- Settings header disclosure segmented control.
- Models provider cards and model selector/change controls.
- Billing plan/toggle controls and primary plan copy.
- Profile fields and save controls.

### M2: Memory and workspace chat mobile tab strips need evidence ownership

Ticket mapping: T10/T12, and T11 if route evidence is codified.

Both `/memory` and workspace chat rendered, but their tab strips extended beyond the viewport. This may be acceptable if they become intentionally scrollable with clear affordance, but it cannot be ignored in the Mobile Executive judge bundle.

### M3: Command Center mobile close and label fit are not proven

Ticket mapping: T10/T12; also affects the Engineer path if Command Center is selected as a required overlay.

Command Center opened on mobile, but the script still found it visible after Escape. Long command labels/subtitles also overflowed, and the browser logged a missing dialog description warning. If the Mobile Executive judge uses Workspace Switcher instead, this can be deferred; if it uses Command Center, the score remains capped.

### M4: T1 console health is now verified for sampled accountless routes

Ticket mapping: T1.

The original screenshot pass emitted Clerk/CSP console errors on every mobile route and overlay. Current focused accountless console-health checks pass 3/3 on port `34196`, covering first-run, initial load, and full-product critical console guards. Keep this in regression and add explicit Clerk-enabled state evidence later.

### M5: Workspace Switcher has one good mobile close path

Ticket mapping: T4/T12.

Workspace Switcher opened and closed with Escape in this mobile pass. This does not close T4 because the previous route-changing navigation issue still needs codified regression coverage, but it is good evidence for the overlay-close part of the Mobile Executive route sequence.

## Correction Requirements

Keep these in mobile verification:

1. Run Settings mobile coverage for `/settings`, `/settings?tab=models`, `/settings?tab=billing`, and `/settings/profile`.
2. Fail if any critical visible control extends outside the viewport, even when document-level scroll width is clean.
3. Capture or inspect screenshots for Home, Settings general/models/billing/profile, Memory, workspace chat, Command Center, and Workspace Switcher.
4. Record whether Command Center or Workspace Switcher is the selected Mobile Executive overlay path; the selected overlay must open and close without trapping focus/scroll.
5. Keep T1 console capture attached to mobile evidence; sampled accountless console health is currently green, while explicit Clerk-enabled state evidence remains separate.

## Current Recommendation

Keep Phase 1 scoped to T1, T2, T3, T4, T5, and T11. The Settings portion of T2 and sampled accountless T1 console health are now green in focused verification, so remaining Mobile Executive risk shifts to Memory/workspace chat tab-strip evidence ownership and the selected overlay path. Command Center mobile close/label fit is now covered elsewhere by the focused Command Center branch in `tests/e2e/user-journeys.spec.ts`.
