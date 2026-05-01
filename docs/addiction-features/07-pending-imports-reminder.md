# 07 — "Pending Imports" Reminder Banner

**Author:** CC (Block B design pass)
**Date:** 2026-05-01
**Status:** AWAITING_RATIFICATION
**Estimate:** ~110 LOC + ~2h wall-clock
**Touches:** apps/web (1 banner component, Memory app integration), packages/core (1 detector helper)

---

## User story

If I skipped the Memory Import step in the onboarding wizard, I want a periodic gentle reminder in the Memory app — "You can import 6 months of your AI history any time" — that points me to the Harvest tab, so I don't forget the value prop and can decide on my own schedule.

## Acceptance criteria

1. When user opens Memory app AND has not yet imported any history (zero harvest events) AND skipped the import step in onboarding, render a dismissible banner at the top of the Memory app.
2. Banner copy: "You can import 6 months of your AI history any time — Open Memory → Harvest". CTA button: "Open Harvest" (switches to Harvest tab).
3. Dismissable; reappears weekly (every 7 days from last dismiss) until user actually imports history. After first successful import, banner permanently retires.
4. Auto-detect Claude Code: if backend's `scanClaudeCode()` returns `found=true`, banner upgrades to specific copy: "Found N Claude Code conversations on this machine — import them now? [Harvest now]".
5. Banner placement: fixed at top of MemoryApp main view, above tabs, dismissible with `✕` button.

## UI sketch

```
Memory App, top of view:

Default version:
  ┌──────────────────────────────────────────────────────────┐
  │ ↗ You can import 6 months of your AI history any time.   │
  │   ChatGPT, Claude, Gemini, Perplexity, Cursor + 14 more  │
  │                                                       ✕  │
  │                                  [Open Harvest →]        │
  └──────────────────────────────────────────────────────────┘

Auto-detect upgrade (Claude Code found):
  ┌──────────────────────────────────────────────────────────┐
  │ ⚡ Found 156 Claude Code conversations on this machine.  │
  │   One click to extract decisions and preferences.        │
  │                                                       ✕  │
  │                                    [Harvest now →]       │
  └──────────────────────────────────────────────────────────┘
```

## Data model

localStorage flags only — no new tables:
- `waggle:import-banner-dismissed-at`: ISO timestamp of last dismiss
- `waggle:import-banner-retired`: boolean — permanently retired after first import

Server side:
- Existing `adapter.scanClaudeCode()` for auto-detect upgrade
- Existing `getHarvestStatus()` (already exists in HarvestTab) returns total ingested events count — banner uses this to decide retirement

## Implementation notes

- Banner mounts inside MemoryApp top section, before `tabs`.
- Detect skipped-import: `onboardingState.completed === true && totalHarvestedEvents === 0`. The wizard's ImportStep allows skipping; if user skipped (didn't import) and now has 0 harvest events, banner is eligible.
- Re-show cadence: 7-day timer from last dismiss; subsequent dismiss extends the timer. Once user imports anything, set retired=true and never show again.
- Auto-detect upgrade: on banner mount, check `scanClaudeCode()`; swap copy + CTA if `found=true`.
- "Open Harvest" CTA: switches MemoryApp's active tab to "Harvest" via existing tab-switch event (`waggle:open-app` with `appId=memory, tab=harvest`).

## Estimate

- ImportReminderBanner component: ~60 LOC
- MemoryApp wire-up + tab switch event: ~20 LOC
- localStorage helpers (read/write dismissed-at, retired): ~20 LOC
- Tests (re-show cadence, retirement, auto-detect upgrade): ~30 LOC
- **Total ~130 LOC, ~2h with verification.**

## Risks + open questions

1. **Frequency** — weekly may be too aggressive for users who actively don't want to import. Consider: weekly for first 4 weeks, then monthly, then never. v1 ships pure weekly + dismiss-permanently option ("Don't show again"). PM call.
2. **Auto-detect banner on every Memory app open** — Claude Code auto-detect runs on every mount; if user has 156 conversations and dismisses the banner, next mount re-detects and re-shows. Add: dismissal also includes the auto-detect signature so re-detect doesn't re-fire. Track `dismissed-with-cc-count: 156`.
3. **Retired flag timing** — set when first import event lands. Race condition: user imports, banner is mid-render with old state. Acceptable; resolves on next mount.
4. **Empty Memory app** — for fresh user with no memories AND no imports, banner is helpful. For returning user with rich memory but who never imported, banner is also valid (they may have other AI history they forgot about). v1: show in both cases.
5. **Cross-platform** — Claude Code detection is local-only (filesystem scan); banner upgrade only fires on Tauri builds where the sidecar can scan. Web-app users see default version.

## Out of scope (v1)

- Email reminder for users who churn (haven't opened Memory in N days).
- Social proof copy ("Average user imports 1,200 conversations").
- Analytics on which import source (ChatGPT vs Claude) gets clicked most.
- Multiple-source auto-detect (Cursor history, Perplexity, Gemini Takeout) — currently only Claude Code is detectable on local FS.
- Direct in-banner upload widget (just CTA → Harvest tab, no inline UX).

## PM decisions needed

- [ ] GO / MODIFY / SKIP
- [ ] Re-show cadence (weekly v1 / weekly→monthly→stop / configurable / one-shot)
- [ ] "Don't show again" affordance — separate button vs. just X
- [ ] Auto-detect upgrade copy (current draft, or different framing — "1-click migration" vs. "found conversations")
- [ ] Trigger eligibility (skipped-import only OR also returning users with 0 imports?)
