# 06 — Tour Replay Button

**Author:** CC (Block B design pass)
**Date:** 2026-05-01
**Status:** AWAITING_RATIFICATION
**Estimate:** ~60 LOC + ~1-1.5h wall-clock
**Touches:** apps/web (1 file: SettingsApp Advanced tab + useOnboarding hook)

---

## User story

As a returning user (or one who skipped onboarding), I want a "Replay tour" button in Settings → Advanced so I can re-trigger the post-wizard coachmark sequence without having to wipe my onboarding state or use a DEV-only URL parameter.

## Acceptance criteria

1. Settings → Advanced section contains a "Replay onboarding tour" button.
2. Clicking it: clears the `waggle:tooltips_done` localStorage flag AND the `tooltipsDismissed` field on `onboardingState`, then triggers a re-render so OnboardingTooltips mounts.
3. Tour content: same 3 BASE_TIPS + CLOSING_TIP as the original tour, optionally including TEMPLATE_TIPS based on current active workspace's templateId.
4. Button has a subtle confirmation toast ("Tour restarting…") so user knows the click registered.
5. Optional: "Replay onboarding wizard" sibling button for full-flow restart (clears `waggle:onboarding` localStorage too — DEV/Power users only? PM call).

## UI sketch

```
Settings App > Advanced tab:

  Section: Help & Tutorials

  [icon] Replay onboarding tour
  Show the 4-slide coachmark tour again. Useful if you want a refresher
  on Waggle's core gestures.
  [ Replay tour ]

  [icon] Replay onboarding wizard (advanced)
  Restart the full 8-step setup. Will not delete any data — your
  workspaces, memories, and preferences are preserved.
  [ Replay wizard ]
```

## Data model

No new tables. Pure localStorage manipulation:
- Tour replay: `localStorage.removeItem('waggle:tooltips_done')` + update onboarding state `tooltipsDismissed: false`.
- Wizard replay: clear `waggle:onboarding` storage entirely; reload page (or set `state.completed = false`).

## Implementation notes

- `useOnboarding` already has a `reset()` function (line 142-146) — use it for the wizard replay path.
- Add a new `replayTour()` function: clear localStorage tour flag + setOnboardingState(prev => ({ ...prev, tooltipsDismissed: false })).
- SettingsApp's Advanced tab exists; just add a section.
- Toast affordance: existing `useToast` hook.

## Estimate

- `replayTour()` in useOnboarding: ~10 LOC
- SettingsApp section: ~30 LOC
- Tests (localStorage cleared, state flipped, render): ~20 LOC
- **Total ~60 LOC, ~1-1.5h with verification.**

## Risks + open questions

1. **Tour vs wizard distinction** — users may not know the difference. Settings copy should make it clear: tour = post-launch coachmarks, wizard = full setup flow. Done above.
2. **Wizard replay edge cases** — if user already has 5 workspaces and a year of memory, re-running wizard is confusing. Either: (a) hide wizard replay for non-DEV builds, (b) gate behind double-confirm, (c) skip the workspace-creation step on replay. Recommend (b) for v1.
3. **Tour replay during ongoing tour** — defensive: if Tour is already mounted, click is no-op or restarts the tour from step 0.
4. **Cross-tab sync** — multi-window users: replay click in one window should re-render Tour in all windows. Existing `waggle:onboarding-sync` event handles this for state; tour localStorage clear needs equivalent broadcast.

## Out of scope (v1)

- Per-workspace tour variants.
- Custom tour authoring (Power users design their own coachmark sequences).
- Onboarding wizard partial-replay (resume at step 5 only).
- Analytics on which sections of tour users replay most often.

## PM decisions needed

- [ ] GO / MODIFY / SKIP
- [ ] Include "Replay wizard" button alongside tour, or tour-only?
- [ ] Confirm dialog for wizard replay (yes / skip)
- [ ] Toast copy ("Tour restarting…" / "Coachmarks reset" / silent)
