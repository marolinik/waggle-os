# Day-2 Backlog — Onboarding + Addiction Features (2026-05-01)

**Authoring context:** Built from PM Pass 4-6 verification + Marko's
ratification call on Block B addiction-features design pass
(`docs/addiction-features/`). This doc captures everything Marko
deferred from Day-0 launch (2026-05-01) to post-launch waves.

**Companion docs:**
- `docs/addiction-features/README.md` — original 7-feature design pass (some specs MODIFIED below)
- `docs/ONBOARDING-DAY-2-BACKLOG-2026-04-30.md` — earlier onboarding-side Day-2 items
- `docs/MILESTONE-LAUNCH-STORY-VALIDATED-2026-04-30.md` — launch-readiness milestone

**Ship status as of 2026-05-01:**
- Block A friction batch: **all 25 FRs CLOSED** (commits addf0b5 / 5c8f0ec / 6918837 / 2e9a9a1 / a5eec15 / de19f5c)
- Block B Phase 1: **Tour Replay (#6) + Imports Reminder (#7) shipped** (commits f4e3591 / 4874f15)
- Block B Phases 2-6: **ALL DEFERRED TO DAY-2** per ratification below
- FR #30 (returning-user persona pick): **DAY-2 BACKLOG** (entry below)

---

## 1. Cross-feature decisions — RATIFIED

These rule once for every Day-2 feature that follows. Anything that conflicts
with a ratified rule needs a new MODIFY pass before implementation, not a
silent override.

### 1.1 Frame inclusion (used by Streak/Growth, Milestones, Wins, Brief)

**Weighted counting.** Each frame contributes a weight to addiction-feature
counters (streak bumps, milestone thresholds, wins-digest totals, brief
metrics):

| Frame source / type | Weight |
|---|---|
| Explicit Insight | 1.0 |
| Explicit Decision | 1.0 |
| Explicit Fact | 0.5 |
| Auto-saved (chat-extracted, harvest, watcher) | 0.25 |

**Fallback:** if the weighted scheme proves complex to audit or surfaces
rounding edge cases (e.g. a 4-frame day weighted to 0.8 still showing
"streak broken"), FALL BACK to "explicit-saved only" (Insight + Decision +
Fact direct user actions; ignore auto-saves entirely). Decision deferred
until first feature implementation can prototype both.

### 1.2 Timezone strategy

- **Storage:** UTC for every persisted timestamp. No exceptions.
- **User-facing display:** user-local timezone. Banners, briefs, streak
  day boundaries, milestones — all rendered in the browser's resolved
  timezone.
- **Cron schedules:** server-local for v1; per-user TZ deferred to a
  future amendment when international usage materialises.

### 1.3 Empty-state behaviour

- **Suppress when N < 3 memories** across every addiction surface.
- The wizard, Tour, and the LoginBriefing fresh-state copy already
  cover the "you have nothing yet" UX moment. Adding addiction surfaces
  on top is noise.
- Counter / chart begins rendering at N = 3 — matches when the user
  has accumulated enough state for a "look at your second brain
  growing" message to land truthfully.

### 1.4 Overlay queue

**Max one addiction overlay active at a time.** Strict priority order:

1. **Critical** — security alerts, billing failures, data-corruption warnings
2. **Welcome** — Onboarding wizard (Day-0 only)
3. **Tour** — OnboardingTooltips coachmarks (post-wizard or replayed)
4. **Continuity** — Day-2 #3 banner ("Picking up where you left off")
5. **Today's Brief** — Day-2 #2 Dashboard card (in-app variant)
6. **Wins** — Day-2 #4 weekly digest banner
7. **Milestone** — Day-2 #5 celebration card / toast

Lower-priority surfaces queue and render only after the higher-priority
one is dismissed. Implementation: a single `OverlayQueue` controller in
Desktop owns the active surface.

### 1.5 LLM cost caps

| Tier | Monthly cap on addiction-feature LLM costs | Over-cap behaviour |
|---|---|---|
| Solo (FREE / TRIAL) | $0.20 / user / month | Upsell banner: "Upgrade to Pro for more daily briefs" |
| Pro | $0.30 / user / month | Upsell to Teams or pause non-critical generators |
| Teams / Enterprise | No cap | Bills against the org plan |

Any feature whose LLM amortisation exceeds the tier's cap must
silently pause for the rest of the billing cycle, with an upsell
banner surfaced once per cycle. Cost tracker hooks already exist
in `packages/agent/src/cost-tracker.ts` — reuse, don't recreate.

---

## 2. Modified addiction-feature specs (Phases 2-6 → Day-2)

For each, the doc reference points to the original design (still
canonical for the unchanged sections). The summary captures the
MODIFY decisions Marko made that supersede the original.

### 2.1 Feature #1 — Memory Growth Chart  *(was: Memory Streak)*

**Doc:** `docs/addiction-features/01-memory-streak.md` (REPLACE the
entire feature with chart)

**MODIFY:** Drop the streak counter entirely. Replace with a
**weekly Memory Growth line chart** rendered in the Memory app's
existing Stats area (or a dedicated "Growth" tab — Marko's call at
implementation time).

Rationale: streak counters introduce loss-aversion gamification stress
(missing a day = punishment). Growth charts surface the same compounding
value with neutral framing — users see their second brain expanding,
not a streak they're at risk of losing.

Rough scope:
- X-axis: ISO weeks for the past 12 weeks
- Y-axis: weighted frame count (per cross-decision §1.1)
- Tooltip: hover shows "Week of MM/DD: N frames (X explicit, Y auto-saved)"
- Empty state: hidden until N ≥ 3 frames (per §1.3)
- Estimate: ~120 LOC, ~2-3h (recharts already a dep; reuse)

### 2.2 Feature #5 — Milestone Cards (split toast vs card)

**Doc:** `docs/addiction-features/05-milestone-cards.md` (MODIFY
threshold delivery)

**MODIFY:** Split delivery by milestone size:

| Milestone | Surface | Animation |
|---|---|---|
| 1st frame | **Toast** (top-right, 5s) | Subtle sparkle, no confetti |
| 10th frame | **Toast** (top-right, 5s) | Subtle sparkle, no confetti |
| 100th frame | **Full-screen card** | Confetti + share affordance |
| 1000th frame | **Full-screen card** | Confetti + share affordance |

Rationale: a full-screen confetti card at the 1st-frame moment is
disproportionate ("I just typed one thing, calm down"). Toasts feel
like a wink-and-nod; cards feel like a real achievement. The
asymmetry creates a meaningful difference between "we noticed you
started" and "you've actually built something serious."

All other spec from the original doc (data model, milestones table,
threshold detection trigger) stays.

Estimate revised: ~180 LOC (down from 200 — toast variant is cheaper).

### 2.3 Feature #2 — Today's Brief Dashboard Card  *(was: Daily Brief notification)*

**Doc:** `docs/addiction-features/02-daily-brief.md` (REPLACE delivery
mechanism only)

**MODIFY:** Drop the system-notification + in-app toast duplex
delivery. Replace with a **single "Today's Brief" card on the
Dashboard app** (existing).

Rationale: system notifications need OS-level permissions, separate
on/off toggles per platform, and risk being perceived as
attention-grabbing pre-launch. A Dashboard card is opt-in (user
chose to open Dashboard), persistent (visible all day, not a
fleeting toast), and architecturally simpler.

Generator (LLM call) and dedupe table stay unchanged. The card
renders the brief content in a hero slot at the top of Dashboard.

Estimate revised: ~210 LOC (down from 330 — no Tauri notification
permission, no Settings tab additions, no banner ack route).

### 2.4 Feature #3 — Continuity Moments

**Doc:** `docs/addiction-features/03-continuity-banner.md`

**Status:** **GO as designed.** No modifications. ~140 LOC, ~2-3h.

### 2.5 Feature #4 — Weekly Wins Digest

**Doc:** `docs/addiction-features/04-weekly-wins-digest.md`

**Status:** **GO as designed.** No modifications. ~340 LOC, ~4-5h.

Note: this is the heaviest Day-2 feature. Recall instrumentation
into HybridSearch is the pre-req — start that work first if Marko
sequences this earlier than expected.

---

## 3. FR #30 — Returning-user persona pick

**Origin:** PM Pass 4 friction report, clarified during Block A.

**Scope:** Returning users who arrive at Chat without ever having
picked a persona explicitly (because the wizard auto-completed for
them via the default-workspace stub on first launch). Today they
default to General Purpose silently — no affordance signals that
they could have picked something different.

**Day-2 fix options (Marko's call at implementation time):**

A. **Pick UI on first Chat open** — when the user opens their first
   chat in a workspace AND `workspace.persona` is unset/default AND
   onboardingState shows no explicit persona pick, render a one-shot
   persona-picker mini-modal inside the chat window.

B. **Default + visible picker indicator** — keep General Purpose as
   default, but add a more prominent persona-picker affordance to the
   chat window header (currently it's a quiet dropdown). One-click to
   open PersonaSwitcher modal, with copy ("How should I work?
   General Purpose right now").

C. **Hybrid** — option B as the default treatment + option A only
   for users whose harvest reveals a strong persona match (e.g. a
   ChatGPT export with a custom system prompt → suggest persona).

Recommendation: B for v1 (least intrusive); A only if usage data
shows users not engaging with the dropdown.

Estimate: A ~120 LOC; B ~50 LOC; C ~200 LOC.

---

## 4. Recommended build order (post-launch)

CC's recommended Day-2 sequencing (revised after Marko's ratification):

**Wave 1 — Quick infra + low-risk surfaces (~6h)**
- Cross-decision §1.1 weight-counting helper (shared, used by 4 features below)
- Cross-decision §1.4 OverlayQueue controller in Desktop
- Feature #1 Memory Growth Chart (~2-3h)
- FR #30 option B persona-picker indicator (~1h, easiest of the three)

**Wave 2 — Continuity + brief (~4-5h)**
- Feature #3 Continuity Banner (~2-3h, uses existing recentThreads)
- Feature #2 Today's Brief Dashboard Card (~3h, gates on §1.5 cost cap)

**Wave 3 — Celebrations (~3h)**
- Feature #5 Milestone Toast/Card split (~2-3h, uses §1.1 weighted counter)

**Wave 4 — Wins (heaviest) (~5-6h)**
- HybridSearch recall instrumentation (pre-req, ~2h)
- Feature #4 Weekly Wins Digest (~4h)

**Total Day-2 effort: ~18-20h** across 4 sequential waves. Each wave
ships independently; no inter-wave blockers.

---

## 5. /schedule trigger — May 8 follow-up

A remote trigger fires **2026-05-08T07:00:00Z** to:

1. Verify Phase 1 features (#6 Tour Replay + #7 Imports Reminder)
   are still working in production usage. Run smoke E2E against the
   live production URL.
2. Check Phase 2-6 priority alignment with launch trajectory —
   compile usage signals (frame creation rate, harvest commits,
   onboarding completion %) and recommend which Wave to greenlight
   first.
3. Open a one-shot PR with any drift-fixes uncovered (Phase 1
   features broke / are unused / users complain).

The trigger ID will be recorded in this doc once created.

---

## 5b. PM Pass 7 friction notes (2026-05-01)

Three small items PM caught while verifying Phase 1 features. None blocked
Block C state restore — captured here so the May-8 follow-up agent has the
list.

### FR Pass7-A — P2 — Replay tour resets onboarding when wizard incomplete

**Repro:** Land on `?forceWizard=true`, mid-wizard click Settings → Advanced
→ Replay tour.

**Observed:** `replayTour()` clears `waggle:tooltips_done` AND flips
`tooltipsDismissed: false`, but if the wizard hasn't completed yet, the
state's `completed` flag is also still `false` — so on next render Desktop
re-shows the wizard at step 0 instead of just restarting the tour.

**Root cause:** `replayTour()` is wizard-aware in name but not in guard.
Should be a no-op (or surface a toast "Finish setup first to replay the
tour") when `state.completed === false`.

**Fix:** in `useOnboarding.ts` `replayTour`, early-return if
`state.completed !== true`. ~5 LOC + 1 test. Day-2 Wave 1.

### FR Pass7-B — P3 cosmetic — Window state persists across page reload

**Repro:** Open Settings + Memory windows, hard reload page.

**Observed:** windows reappear stacked the same way. Ideally a hard reload
returns to a clean Desktop (no windows open) so the post-onboarding state
matches a fresh launch.

**Probable file:** `useWindowManager.ts` reads window state from somewhere
(likely localStorage). Either don't persist or wipe on first
`onboardingState.completed === true && tooltipsDismissed === true` boundary.

**Fix:** investigate persistence side; clear on Desktop mount when no
windows existed in the prior session. ~30 LOC. Day-2 Wave 2.

### FR Pass7-C — P3 cosmetic — Memory window opens layered over Dashboard

**Repro:** Open Dashboard, then open Memory.

**Observed:** Memory window mounts directly on top of Dashboard — same
viewport-centered base from `window-cascade.ts`. Cascade offset should
push subsequent windows down-right per FR #8 baseline.

**Probable file:** `apps/web/src/lib/window-cascade.ts` —
`computeCascadePosition` must not be honouring `cascadeOffset` for the
Memory window's mount.

**Fix:** trace `cascadeOffset` from `useWindowManager` through
`computeCascadePosition`; likely a missed increment when opening the
second window. ~10 LOC. Day-2 Wave 1 (paired with FR Pass7-A as both are
single-file edits).

---

## 6. NOT in this Day-2 batch (defer further)

- Tier-gated variants of addiction features (free vs Pro vs Teams).
  Wait until usage shows differential value before splitting copy.
- Localization. English-only ships v1.
- Cross-feature combos ("milestone + 7-week chart streak unlocks X").
  Build each feature standalone first.
- A/B testing infrastructure for copy variants. Pre-launch noise.
- Email / Slack delivery channels. In-app only for v1.
