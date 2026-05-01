# 04 — Memory Wins Digest (Weekly)

**Author:** CC (Block B design pass)
**Date:** 2026-05-01
**Status:** AWAITING_RATIFICATION
**Estimate:** ~250 LOC + ~4-5h wall-clock
**Touches:** apps/web (1 component + 1 tab in Memory app), packages/server (1 cron job + 1 route), packages/core (1 generator)

---

## User story

Once a week (Monday morning by default), I want a summary card showing how Waggle's memory paid off the prior week — N facts saved, N agent recalls that used them, estimated minutes saved on context-explaining — so I can quantify the value and feel the compounding effect.

## Acceptance criteria

1. Weekly digest fires once per week (configurable day/hour, default Monday 09:00 local).
2. Delivered as a Memory app tab card + an in-app banner on first desktop mount of the week.
3. Card content (3 metrics + 1 narrative line):
   - Frames saved this week: N
   - Recalls that hit a saved frame: M
   - Estimated time saved (M × 9min context-restore baseline): ~T minutes
   - Narrative: "Your top theme this week: <theme>. Top decision: <decision>"
4. Card persists in Memory app's "Wins" tab indefinitely — historical record of weekly progress, not just one-time.
5. First-week edge case: if user has < 7 days of history, banner suppressed but Wins tab shows "Come back next week for your first digest" placeholder.

## UI sketch

```
Memory App > Wins tab:
  ┌─ Week of April 24-30 ──────────────────────────────────────┐
  │ ▲ 12 frames saved   ▲ 5 agent recalls   ⏱ ~45 min saved    │
  │                                                            │
  │ Top theme: API rate limiting + auth-rewrite                │
  │ Top decision: Ship migrations Wednesday                    │
  │                                                            │
  │ [Open Memory] [Open Last Decision Source]                  │
  └────────────────────────────────────────────────────────────┘

  ┌─ Week of April 17-23 ──────────────────────────────────────┐
  │ ▲ 8 frames · ▲ 3 recalls · ⏱ ~27 min saved                 │
  │ Top theme: Onboarding wizard polish                        │
  └────────────────────────────────────────────────────────────┘

  (older weeks collapsed by default, click to expand)

Banner on Monday morning:
  [Trophy icon] This week saved you ~45 min — see the breakdown
                                              [Open Wins] [✕]
```

## Data model

New table `weekly_wins`:
```
id INTEGER PRIMARY KEY,
week_start TEXT NOT NULL UNIQUE,    -- 'YYYY-MM-DD' (Monday)
frame_count INTEGER NOT NULL,
recall_count INTEGER NOT NULL,
estimated_minutes_saved INTEGER NOT NULL,
top_theme TEXT,
top_decision TEXT,
top_decision_source_session_id TEXT,
generated_at TEXT NOT NULL,
delivered_at TEXT                   -- nullable until banner shown
```

For `recall_count`, need to instrument frame retrieval:
- Existing `HybridSearch.search()` already returns frame IDs
- Add `RecallEvent` log: every search/retrieval that hits a frame logs `{ frame_id, ts, source: 'agent' | 'manual' }` to a `recall_events` table
- Aggregate weekly count per (week, agent-source-only)

## Server-side generator

Cron runs Monday 00:30 local (off-peak):
1. Query frames where `created_at >= weekStart AND created_at < weekStart+7d`
2. Query recall_events where `source='agent' AND ts in [weekStart, weekStart+7d]`
3. Compute estimated_minutes_saved = recall_count × 9 (calibrated baseline; configurable)
4. Theme extraction: LLM call ("From these N frames, what's the dominant theme in 5-10 words?")
5. Top decision: highest-importance critical/important frame matching decision pattern from the week
6. Insert row, set delivered_at=null, await client poll

Estimated minutes baseline (the "9 min context-restore"): documented derivation needed; placeholder until UX research lands.

## Implementation notes

- Recall instrumentation is the hardest part — needs hook in `HybridSearch.search()` callsite to log frame IDs returned and identifier of the consumer (agent loop vs manual UI search).
- Weekly cron: trivial extension of cron infrastructure; runs `generateWeeklyWins(weekStart)` on schedule.
- Wins tab in Memory app: paginate if N > 12 weeks.
- Edge: time zones again — week boundary is server-local Monday 00:00. Document.

## Estimate

- Recall events table + instrumentation: ~70 LOC (touches HybridSearch + agent-loop)
- Generator + cron: ~80 LOC
- Server route `/api/weekly-wins`: ~30 LOC
- WinsCard + WinsTab components: ~80 LOC
- Banner + ack route: ~30 LOC
- Tests: ~50 LOC
- **Total ~340 LOC, ~4-5h with verification.**

## Risks + open questions

1. **Recall instrumentation** is the cost driver — need to wire `HybridSearch` to log every retrieval. Hot path; throttle/buffer logs to avoid SQLite write storms.
2. **Estimated-minutes-saved calibration** — 9 min baseline is a guess. Run a small UX study or pilot a percentile estimate. v1: hardcode + flag for revision.
3. **First week** — user installs Monday afternoon, what do they see Tuesday? Nothing — wait for next Monday. Banner suppressed for ~7 days.
4. **Theme/decision LLM cost** — 1 call/week × ~700 tokens ≈ $0.01/user/week. Negligible.
5. **Privacy** — frames may contain sensitive content; theme summary on personal mind only, not Team/shared workspaces. Hard rule: no cross-workspace digests.
6. **What counts as a "recall"** — open question. Agent retrieval via `recall_memory` MCP tool? Hybrid search hits during chat? UI-driven Memory app search? Default: instrument all three; aggregate by source.

## Out of scope (v1)

- Comparison to prior week ("up 30% from last week") — wait until 4+ weeks of data.
- Per-workspace digests — global personal-mind digest only v1.
- Email digest delivery — in-app only.
- "Share to team" affordance.
- Streak integration ("you've maintained a 4-week digest streak"). (Streak feature is separate; wait until both exist.)

## PM decisions needed

- [ ] GO / MODIFY / SKIP
- [ ] Default delivery day/hour (Monday 09:00 reasonable? Friday end-of-week instead?)
- [ ] Recall sources to count (agent only / agent+UI / all)
- [ ] Estimated-minutes baseline (9 min default, or skip the metric until calibrated?)
- [ ] Banner vs. tab-only delivery (can banner be opt-out?)
- [ ] Theme extraction model (Sonnet / Haiku)
