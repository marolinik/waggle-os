# Dream Diary — "what I consolidated last night"

**Date:** 2026-07-09 · **Status:** approved (founder Q&A) · **Branch:** `worktree-channels-arc`
**Origin:** CowAgent teardown steal #1 (`docs/analysis/cowagent-vs-waggle-2026-07-09.md`).
Waggle already runs real nightly memory curation (compaction, harvest sync, index repair, lane
extraction) but reports it only to `log.info` — the user never sees the substrate working. The
diary narrates those real events. It must never fabricate.

## Founder decisions (locked)

| Decision | Choice |
|---|---|
| Narrative | **Deterministic stats sentence always; LLM polish on top** (built-in proxy `fast` tier). LLM down → deterministic stands. |
| Placement | **Home cockpit card** ("While you slept") + expandable 7-day history. Suppressed until the first dream exists. |

## Architecture

- **`packages/server/src/local/dream-journal.ts`** — `DreamJournal`: one JSON per day at
  `<dataDir>/dreams/YYYY-MM-DD.json` (atomic tmp+rename). `record(action, stats)` appends a
  structured event + recomputes the deterministic `summary` from aggregated day counters.
  Product layer on purpose — NOT hive-mind-core (no OSS port obligation).
- **Event sources** — the four existing `memory_consolidation` cron branches in
  `local/index.ts`: `memory_compact` (temporaryPruned/deprecatedPruned/pframesMerged),
  `harvest_sync` (frames/items/sources/couldNotVerify), `index_reconcile` (ftsFixed/vecFixed),
  `memory_lane_extract` (lane counters). Zero-count runs are recorded (honest "quiet night").
  Failures are not diary events (already logged elsewhere).
- **LLM polish** — lazy: `GET /api/dreams` returns deterministic text immediately; if a day has
  events but no `narrative`, it schedules ONE guarded background polish call (in-flight set),
  persisted into the day file; next poll shows it. Zero-activity nights skip the LLM (cost).
- **Route** — `routes/dreams.ts`: `GET /api/dreams?days=7` (isLocalRequest-guarded) →
  `[{date, events, summary, narrative?}]`, newest first.
- **UI** — `apps/web/src/components/os/home/DreamDiaryCard.tsx` on HomeCockpit: moon icon,
  latest day's narrative (fallback summary), expandable previous days. Hidden when no data.

## Tests

Journal: record/aggregate/summary wording, atomic persistence across instances, zero-night
summary, date rollover. Route: shape, days clamp, lazy-polish single-flight, LLM-failure
fallback (narrative stays absent, summary intact). Web: card renders narrative, falls back to
summary, hides with no data, history expand.

## Verification

`npx tsc --noEmit -p packages/server/tsconfig.json` · server vitest · apps/web vitest · web build.
