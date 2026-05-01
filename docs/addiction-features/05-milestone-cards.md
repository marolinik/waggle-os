# 05 — First-Time Milestone Cards

**Author:** CC (Block B design pass)
**Date:** 2026-05-01
**Status:** AWAITING_RATIFICATION
**Estimate:** ~150 LOC + ~2-3h wall-clock
**Touches:** apps/web (1 new component + 1 hook), packages/server (1 endpoint extension)

---

## User story

When I cross meaningful memory thresholds for the first time (1st memory saved, 10th, 100th, 1000th), I want a brief celebration — confetti animation + congratulatory copy + share affordance — so I feel the compounding value and have a moment to share if I want to.

## Acceptance criteria

1. Milestone card fires automatically when total personal-mind frame count crosses thresholds: 1, 10, 100, 1000.
2. Card is full-screen overlay with confetti animation + copy + 2 buttons: `Continue working` (dismisses) + `Share` (copies preformatted text to clipboard, optional native share where available).
3. Each milestone fires exactly once — server-side tracks which thresholds have been celebrated.
4. Card animation runs ~3 seconds; auto-dismiss after 8s if user doesn't click.
5. First-memory milestone (1) is the most important — sets the tone for the addictive feedback loop. Make it feel earned.

## UI sketch

```
Full-screen overlay (z-9999, dark backdrop blur):

  ┌─────────────────────────────────────────────────────────┐
  │                  ✨ confetti animation ✨               │
  │                                                         │
  │                        🎯  10                           │
  │                  Memories saved!                        │
  │                                                         │
  │  Your second brain is taking shape — every save makes   │
  │  Waggle a little smarter for you.                       │
  │                                                         │
  │            [Share]    [Continue working]                │
  └─────────────────────────────────────────────────────────┘

Milestone copy (per threshold):
  1     "First memory saved! Welcome to your second brain."
  10    "10 memories saved! Your second brain is taking shape."
  100   "100 memories — you're building real persistent context."
  1000  "1,000 memories. You've crossed into a different category of user."

Share text format:
  "Just hit {N} memories on Waggle — my second brain that remembers
   across every chat. waggle-os.ai 🐝"
```

## Data model

New table `milestones`:
```
id INTEGER PRIMARY KEY,
milestone_kind TEXT NOT NULL,        -- 'frames_1', 'frames_10', 'frames_100', 'frames_1000'
achieved_at TEXT NOT NULL,           -- ISO timestamp of crossing
celebrated_at TEXT,                  -- nullable; null until card dismissed
UNIQUE(milestone_kind)
```

One row per kind per personal mind, idempotent.

Server route: `GET /api/milestones/pending` → `{ pending: [{ kind, achievedAt }] }` returns any rows with `celebrated_at=null`. Client renders card, then `POST /api/milestones/{kind}/ack` sets celebrated_at.

Crossing detection: on every frame insert, server-side trigger checks if `total_frame_count` crossed any threshold and inserts a milestone row. Cheap query.

## Implementation notes

- Confetti: use `canvas-confetti` npm package (~5kb). MIT license.
- Card component: `MilestoneCard.tsx` with full-screen `motion.div` wrapper.
- Hook: `useMilestone()` polls `/api/milestones/pending` every 30s + on `waggle:frame-saved` event.
- Multiple milestones queued: render in sequence (1 → 10 if user goes from 0 to 12 in one batch import). 8s auto-dismiss between cards.
- Share button: use `navigator.share()` on supported browsers, fall back to clipboard copy + toast.

## Estimate

- Milestones table + server trigger: ~30 LOC
- API routes (pending, ack): ~30 LOC
- MilestoneCard component + confetti: ~70 LOC
- useMilestone hook + Desktop wiring: ~30 LOC
- Tests (threshold crossing, dedupe, share): ~40 LOC
- **Total ~200 LOC, ~2-3h with verification.**

## Risks + open questions

1. **Backfill** — existing users (with thousands of frames already) shouldn't suddenly see all 4 cards on next launch. Either: (a) on first migration, mark all already-crossed thresholds as celebrated_at=now; (b) only fire for thresholds crossed AFTER feature ships. Recommend (b). Migration script sets celebrated_at for any row where `achieved_at < featureShipDate`.
2. **Confetti accessibility** — animation may trigger motion-sensitive users. Respect `prefers-reduced-motion`; fall back to static congratulations.
3. **Share text** — currently embeds product URL. Tier-aware copy (Free user share vs Pro share)? PM call.
4. **Threshold choice** — 1, 10, 100, 1000 powers-of-10. Could add 50, 500. v1 keep simple. PM call.
5. **What counts as a frame** — same question as Streak feature. Recommend consistent rule across all addiction features (count non-deprecated, non-temporary frames).
6. **Celebration sound?** — optional subtle "ding" audio cue. v1 silent (less intrusive).

## Out of scope (v1)

- Custom milestones (user-defined "celebrate at 50").
- Per-workspace milestones.
- Streaks integration ("milestone + 7-day streak combo unlocks X").
- Achievement gallery / trophy room.
- Social proof leaderboard.

## PM decisions needed

- [ ] GO / MODIFY / SKIP
- [ ] Threshold set (1/10/100/1000 only, or add 50/500?)
- [ ] Backfill strategy (mark existing as celebrated, or fire all once on first launch?)
- [ ] Share text content (current draft, or different angle?)
- [ ] Sound effect (silent / subtle ding / configurable)
- [ ] Frame inclusion rule (same as Streak — must align)
