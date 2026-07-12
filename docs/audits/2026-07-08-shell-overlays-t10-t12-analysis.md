# Shell Overlay T10/T12 Analysis

Status: focused supplement with partial Phase 2 implementation update. The original evidence remains as the pre-fix baseline; the update below records the current post-fix state for the shell overlay contract slice.

Purpose: verify the shell overlays and interruption surfaces that users hit while navigating, switching context, spawning agents, creating workspaces, handling notifications, and seeing tier gates.

## Evidence

- Built current web bundle with `npm run build`: pass. Vite emitted the existing Tailwind arbitrary-value warnings, one dynamic/static import warning for `shape-selection.ts`, and the large main chunk warning.
- Started a fresh sidecar on `http://127.0.0.1:3437` with isolated `WAGGLE_DATA_DIR`, mock embeddings, marketplace sync disabled, and `--skip-litellm`.
- Ran Playwright desktop smoke at 1440 x 980:
  - `output/playwright/shell-overlays-3437/summary.json`
  - screenshots `00-baseline.png` through `07-upgrade-modal.png`
- Ran Playwright mobile smoke at 390 x 844:
  - `output/playwright/shell-overlays-3437/mobile-summary.json`
  - screenshots `mobile-00-baseline.png` through `mobile-03-create-workspace.png`
- Source inspected:
  - `apps/web/src/components/os/overlays/NotificationInbox.tsx`
  - `apps/web/src/components/os/overlays/KeyboardShortcutsHelp.tsx`
  - `apps/web/src/components/os/overlays/ContextRail.tsx`
  - `apps/web/src/components/os/overlays/CreateWorkspaceDialog.tsx`
  - `apps/web/src/components/os/overlays/PersonaSwitcher.tsx`
  - `apps/web/src/components/os/overlays/SpawnAgentDialog.tsx`
  - `apps/web/src/components/os/overlays/WorkspaceSwitcher.tsx`
  - `apps/web/src/components/os/overlays/UpgradeModal.tsx`
  - `apps/web/src/components/os/overlays/TrialExpiredModal.tsx`
  - `apps/web/src/components/os/overlays/OnboardingTooltips.tsx`

## Runtime Results

| Surface | Desktop result | Mobile result | Verdict |
|---|---|---|---|
| Keyboard Shortcuts | `role="dialog"`, labelled, focus contained, Escape closes | Not sampled in mobile smoke | Pass for desktop shell path. |
| Persona Switcher | `role="dialog"`, labelled, focus contained, Escape closes | Not sampled in mobile smoke | Pass for desktop shell path. |
| Spawn Agent | Opens and closes with Escape; task/model flow renders | Opens without horizontal overflow | Mostly pass; Radix dialog focus works, but model/task controls still need T10 form detail in the wider accessibility pass. |
| Workspace Switcher | `role="dialog"`, labelled, focus contained | Entry to Create Workspace works | Pass for isolated open/close; T4 route-trap issue remains separate. |
| Upgrade Modal | `role="dialog"`, labelled, focus contained, Escape closes, named close action. Rendered event path covered by `J3c`. | Not sampled in mobile smoke | Pass for the sampled tier-interruption contract; broader billing/upgrade flow remains outside this overlay slice. |
| Notification Inbox | Pre-fix: opened visually with no `role="dialog"`/landmark, Escape left it open, 2 unnamed icon buttons. Post-fix: named dialog, focus trap, Escape close, named mark-all/close actions, and no horizontal entrance motion that can overflow mobile. | Mobile Executive bundle now captures Notification Inbox at 390 x 844 with 0 visible overflow and screenshot evidence. | Pass for the codified overlay contract; keep broader notification content states in T12. |
| Create Workspace | Pre-fix: no labelled dialog, Escape left it open, unnamed icon buttons, native template-delete `confirm()`. Post-fix: named main dialog plus named Folder Picker / Template Creator subdialogs, focus traps, Escape close, named close/template/share actions, and in-app template-delete confirmation. | Post-fix 390 x 844 rendered path prioritizes name, storage, optional template disclosure, and a visible Create action without horizontal overflow. | Partial: sampled T10/T7/mobile hierarchy contracts are fixed; final score still needs screenshot refresh and broader route/state evidence. |
| Context Rail | Post-fix component evidence: labelled `complementary` panel, named close action, and expandable item state. | Source-only for mobile | Pass for source/component-level landmark contract; full rendered entry states still need route-specific evidence. |
| Onboarding Tooltips | Post-fix component evidence: named non-modal dialog, `aria-modal="false"`, and global Escape dismissal that records the dismissed state. | Source-only for mobile | Pass for the semantic decision and keyboard dismiss contract; final score still needs broader first-run/mobile state evidence. |
| Trial Expired Modal | Source-only: labelled dialog/focus trap exists; post-fix component evidence covers named close action. | Source-only | Pass for the close-label contract; full trial-expired account state remains T12/billing evidence. |

The desktop and mobile runs reproduced the same T1 Clerk/CSP console errors already recorded in the first-run supplement. They are not new overlay findings, but they keep the standard local audit lane noisy until T1 is fixed.

## Findings

### P1-19: Shell overlays do not share a consistent accessibility/close contract

Implementation update 2026-07-08:

- `NotificationInbox.tsx` now uses `useFocusTrap`, `role="dialog"`, `aria-modal`, a labelled title, Escape close, and explicit labels for "Mark all notifications as read" and "Close notifications".
- `CreateWorkspaceDialog.tsx` now uses `useFocusTrap`, `role="dialog"`, `aria-modal`, a labelled title, Escape close, and explicit labels for close, template select/duplicate/edit/delete, the share toggle, Folder Picker, and Template Creator.
- `ContextRail.tsx` now exposes the rail as a labelled complementary panel and gives the close icon a name.
- `OnboardingTooltips.tsx` now has an explicit non-modal dialog contract and Escape dismissal without trapping focus.
- `UpgradeModal.tsx` and `TrialExpiredModal.tsx` now give their close icon controls accessible names.
- Codified component evidence: `npm run test -w apps/web -- src/test/shell-overlay-contracts.test.tsx --reporter=dot` passed 1 file / 8 tests after adding Create Workspace hierarchy and subdialog assertions.
- Codified rendered evidence: `tests/e2e/user-journeys.spec.ts` includes `J3b: notification and create-workspace overlays have dialog close contracts`, `J3c: tier interruption modal exposes a named close contract`, and `J-mobile: create workspace prioritizes primary setup at 390px width`. `J3b` passed previously on port `34151`; focused `J3c` passed on port `34153`; the earlier full journey suite passed 18/18 on port `34155`; focused `J-mobile` passed on port `34157`; the expanded full journey suite passed 19/19 on port `34158`. Current five-persona evidence adds Mobile Executive Notification Inbox and Command Center overlay screenshots with 0 visible overflow in the 5/5 run on port `34267`.
- Browser-plugin spot check attempted on port `34154`, but the in-app Browser DOM snapshot path failed with `incrementalAriaSnapshot is not a function`; Playwright remains the reliable rendered evidence lane for this slice.
- Remaining P1-19 scope: route-specific rendered evidence for Context Rail/Onboarding Tooltips/trial-expired states is still open.

Evidence:

- `NotificationInbox.tsx:38-60` renders a fixed overlay with click-to-close but no dialog/menu role, no labelled container, no focus trap, and no Escape close handler. Runtime: `notifications-after-escape.stillVisible = true`.
- `NotificationInbox.tsx:57` and `:60` expose icon-only actions without accessible names for "mark all read" and "close"; the tooltip is not a reliable button name.
- `CreateWorkspaceDialog.tsx:757-766` renders the main creation overlay without `role="dialog"`, `aria-modal`, `aria-labelledby`, or the shared `useFocusTrap`; runtime: `create-workspace-after-escape.stillVisible = true`.
- `CreateWorkspaceDialog.tsx:857`, `:867`, `:910`, `:918`, and neighboring icon-only actions are visible controls without accessible names; runtime counted 16 visible unnamed icon buttons while the dialog was open.
- `ContextRail.tsx:62-75` renders a fixed side rail and close button without a labelled landmark or accessible close name.
- `OnboardingTooltips.tsx:97-137` renders a centered overlay with "Dismiss all" and "Next/Got it" actions but no explicit modal/non-modal semantics or keyboard close path.
- `UpgradeModal.tsx:90` and `TrialExpiredModal.tsx:58-62` have modal focus behavior, but their close icon buttons are unnamed.

Correction:

- Define one shared overlay contract: modal overlays use `role="dialog"`, `aria-modal`, `aria-labelledby`/description where useful, `useFocusTrap`, Escape close, focus restore, and named close/action icon buttons.
- Non-modal panels use a labelled landmark such as `aside aria-label`, remain keyboard reachable, do not trap focus, and provide an explicit close button name.
- Codify Notification Inbox, Create Workspace, Context Rail, Onboarding Tooltips, Upgrade Modal, and Trial Expired Modal in a focused overlay smoke.

Closure evidence:

- Desktop and 390 x 844 screenshots for the changed overlays.
- DOM evidence that all high-frequency overlays have an accessible name and expected role/landmark.
- Keyboard evidence: open, Tab/Shift+Tab, Escape or named close, focus return.
- No visible unnamed icon-only buttons in the sampled overlay DOM.

### P1-20: Create Workspace is too dense and template-first on mobile

Implementation update 2026-07-08:

- Template deletion no longer uses native `confirm()`. It now opens an in-app confirmation dialog that names the template and says existing workspaces are not changed.
- The mobile Create Workspace path now starts with required setup, keeps templates behind a "Start from template" disclosure, and keeps the Create action in a visible footer on the 390 x 844 rendered path.
- This closes the sampled T7 template-management and mobile hierarchy portions of P1-20, but the final score still needs refreshed screenshots and broader route/state evidence.

Evidence:

- Historical desktop screenshot `06-create-workspace.png` showed a long, dense creation modal that began with template category filters, search, template cards, then finally the workspace name and storage controls.
- Historical mobile screenshot `mobile-03-create-workspace.png` showed the first 390 x 844 viewport dominated by template controls, with storage continuation and Create/Cancel requiring internal scrolling.
- Current focused evidence: component contract asserts the name field precedes optional templates and that template search is absent until "Start from template"; rendered `J-mobile` asserts required setup, visible Create action, progressive template search, and no horizontal overflow at 390 x 844.

Correction:

- Make the primary creation path obvious first: name, storage type/path, and Create/Cancel should be reachable without hunting.
- Move template search/grid into a collapsed or secondary "Start from template" area on narrow screens, or use progressive disclosure with a clear selected-template summary.
- Keep destructive template management branded and named; no native `confirm()`.

Closure evidence:

- 390 x 844 screenshot refresh where the required fields and primary action are visible or clearly sticky/reachable.
- Keyboard-only create path proof.
- Template management proof with in-app confirmation.

## What Already Looks Good

- Keyboard Shortcuts, Persona Switcher, Workspace Switcher, Upgrade Modal, Login Briefing, and Trial Expired Modal use the shared focus trap or Radix dialog patterns in source.
- Spawn Agent has a coherent two-step flow, clear "Review & Launch" affordance, and useful no-key/no-model copy. It should remain in T10 only for detailed form semantics and model-selection evidence.
- Upgrade Modal copy is aligned with Solo/Team and visually clear; the sampled close-label gap is now fixed.

## Recommendation

Keep Phase 1 unchanged. Treat the core shell overlay contract as Phase 2 partially fixed: Notification Inbox, Command Center, Create Workspace primary/subdialog contracts, Context Rail, Onboarding Tooltips, tier close labels, and the sampled Create Workspace mobile hierarchy now have focused coverage. Continue Phase 2 with route-specific overlay state evidence for less common states and the broader trust-critical native dialog queue.
