# 01 — Memory Streak Counter

**Author:** CC (Block B design pass)
**Date:** 2026-05-01
**Status:** AWAITING_RATIFICATION
**Estimate:** ~180 LOC + ~3-4h wall-clock
**Touches:** apps/web (3 files), packages/server (1 route), packages/core (1 store)

---

## User story

As a user, when I save a memory or have a meaningful chat session, I want to see a visible streak counter (🔥 5 days in a row) somewhere I'll glance at often, so I'm reinforced to come back tomorrow.

## Acceptance criteria

1. Streak chip renders in the desktop StatusBar (bottom-right cluster), wrapped in a HintTooltip explaining the rules.
2. Streak count = consecutive days with at least one memory frame committed (any source: chat, harvest, manual).
3. Streak resets if 24h pass with zero new frames AND zero qualifying activity (configurable). Default: pure 24h gap = reset.
4. Optional "weekend skip" toggle in Settings → Behavior → "Streaks count weekdays only" (default OFF; international users decide).
5. Visible cold-start path: streak=0 day 1 hides chip; streak=1 shows "🔥 1 day"; streak=N shows "🔥 N days" with subtle pulse animation when count increments live.
6. Live increment fires when a new frame lands today and `streak.lastBumpAt` was a previous day — no full-day debounce, but client throttles repeat re-renders to once/min.

## UI sketch

```
StatusBar bottom-right (existing cluster):
  [memory icon] 12 mem  [chat icon] 5 sessions  🔥 5 days  [time]

Hover tooltip:
  Memory streak: 5 days
  Save at least one memory each day to keep it going.
  (Settings → Behavior to skip weekends.)
```

Day-1 user: chip suppressed entirely (no shame for a 0-streak); appears at streak=1 onwards.

Streak break: chip flashes amber for 4 hours after reset, copy reads "Streak broken — start fresh today" with action `Got it`.

## Data model

New table `streaks` in personal mind:
```
id INTEGER PRIMARY KEY,
streak_kind TEXT NOT NULL CHECK (streak_kind IN ('memory','chat')),
current_count INTEGER NOT NULL DEFAULT 0,
last_bump_at TEXT NOT NULL,        -- ISO date YYYY-MM-DD (no time)
longest_count INTEGER NOT NULL DEFAULT 0,
weekend_skip INTEGER NOT NULL DEFAULT 0,
updated_at TEXT NOT NULL
```

One row per `streak_kind` per personal mind. v1 ships only `memory` kind; `chat` reserved.

Server route: `GET /api/streaks` → `{ memory: {current, longest, lastBumpAt, weekendSkip} }`. `POST /api/streaks/bump` (called by frame-store on every frame insert) — server-side computes current_count by checking lastBumpAt vs today.

## Implementation notes

- Bump trigger: hook into `FrameStore.createIFrame()` callsite OR via a SQLite trigger on `INSERT ON memory_frames`. Trigger is cleaner — no orchestrator changes needed.
- Reset detection: pure read-time computation. When client fetches `/api/streaks`, server compares lastBumpAt to today; if gap > 1 day (or > 1 weekday with weekendSkip), reset current to 0 before returning.
- StatusBar wiring: existing `agentStatus`-style hook → new `useStreaks()` hook polling `/api/streaks` every 2 min + on `waggle:frame-saved` event.

## Estimate

- Server route + SQLite migration: ~50 LOC
- `useStreaks()` hook + StatusBar render: ~60 LOC
- Settings toggle: ~30 LOC
- Tests (server bump logic, reset boundary, weekend-skip math): ~40 LOC
- **Total ~180 LOC, ~3-4h with verification.**

## Risks + open questions

1. **Timezone** — bump uses server's local TZ (`new Date().toISOString().slice(0,10)`). Travelers crossing dates lose/gain a day. Acceptable v1; document.
2. **What counts as a frame?** — currently any frame insert. PM may want to exclude `temporary` importance from bumps. Default: count all non-`deprecated` frames. Open question.
3. **Streak breakage notification** — silent reset, or a one-time toast "Streak broken — yesterday you missed it"? PM call.
4. **Cosmetic** — emoji 🔥 may clash with Hive DS aesthetic. Alternative: `bg-amber-500` flame icon from lucide-react. PM call.
5. **Migration risk** — adds new SQLite table. Use migration framework. Idempotent CREATE TABLE IF NOT EXISTS.

## Out of scope (v1)

- Per-workspace streaks (just personal-mind global v1).
- Calendar heatmap (GitHub-style activity grid).
- Streak leaderboards across team. (TEAMS tier only later.)
- Streak freeze / "streak protector" purchases. (Anti-pattern in Waggle DS — no buyable shortcuts.)

## PM decisions needed

- [ ] GO / MODIFY / SKIP
- [ ] Frame inclusion rule (all / non-temporary / >threshold importance)
- [ ] Weekend-skip default (OFF / ON / detect locale)
- [ ] Reset notification (silent / toast / amber flash)
- [ ] Emoji vs Lucide icon
