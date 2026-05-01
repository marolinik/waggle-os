# Addiction Features — Block B Design Docs (2026-05-01)

**Purpose:** Set of seven design-stage docs covering the "addiction features" cluster from the 2026-05-01 PM walkthrough brief. Each doc is design-only — **no code shipped yet**. Marko ratifies per feature (GO / MODIFY / SKIP) before CC implements.

**Status:** AWAITING_RATIFICATION — all 7 docs pending Marko review.

**Scope:** Loops that get users to come back tomorrow. Quantified-value reinforcement (streaks, weekly digests), pickup affordances (continuity banner, daily brief), milestone celebrations, replayable onboarding, gentle-nudge import prompts.

---

## Index

| # | Feature | LOC est. | Hours est. | One-line summary |
|---|---------|----------|------------|------------------|
| 1 | [Memory Streak](01-memory-streak.md) | ~180 | 3-4 | Daily streak counter in StatusBar; resets if 24h gap |
| 2 | [Daily Brief](02-daily-brief.md) | ~330 | 5-6 | Morning notification summarising yesterday + today suggestion |
| 3 | [Continuity Banner](03-continuity-banner.md) | ~140 | 2-3 | "Picking up where you left off" banner on Chat re-open |
| 4 | [Weekly Wins Digest](04-weekly-wins-digest.md) | ~340 | 4-5 | Monday card: frames saved, recalls, est. minutes saved |
| 5 | [Milestone Cards](05-milestone-cards.md) | ~200 | 2-3 | Confetti + congrats at 1/10/100/1000 frames |
| 6 | [Tour Replay](06-tour-replay.md) | ~60 | 1-1.5 | Settings button to re-trigger post-wizard coachmark sequence |
| 7 | [Pending Imports Reminder](07-pending-imports-reminder.md) | ~130 | 2 | Memory-app banner for users who skipped import |
| | **Totals** | **~1,380 LOC** | **~20-25h** | All seven shipped |

---

## Cross-feature decisions Marko needs to make once

These appear in multiple docs and benefit from a single ruling:

1. **What counts as a "frame"?**
   - Used by: Streak (#1), Milestones (#5), Wins Digest (#4)
   - Options: (a) all frames, (b) non-deprecated only, (c) non-deprecated AND non-temporary, (d) importance ≥ normal
   - Recommendation: (c) — count non-deprecated, non-temporary. Aligns with existing `composeWorkspaceSummary` filter.

2. **Notification timezone strategy**
   - Used by: Streak (#1, day boundary), Daily Brief (#2, fire hour), Wins Digest (#4, week boundary)
   - Options: (a) server-local TZ for v1 + document, (b) per-user TZ from settings, (c) detect from browser
   - Recommendation: (a) v1, (b) v2 if cross-TZ usage emerges.

3. **Empty-state behaviour for fresh users**
   - Used by: Streak (#1, day-1 user), Daily Brief (#2, no yesterday), Continuity (#3, no last session), Wins Digest (#4, < 7 days history)
   - Options: (a) suppress entirely, (b) show educational copy, (c) show motivational copy
   - Recommendation: (a) suppress — fresh users have higher-priority surfaces (wizard, Tour).

4. **Banner / overlay z-index hierarchy**
   - Three new surfaces (Continuity, Daily Brief, Imports Reminder) plus existing OnboardingTooltips, LoginBriefing, MilestoneCard.
   - Need a documented ordering rule. Recommendation: only ONE high-priority overlay can render at once; the rest queue.

5. **LLM cost approval**
   - Daily Brief generator: ~$0.005/user/day = $0.15/user/month
   - Wins Digest theme extraction: ~$0.01/user/week = $0.04/user/month
   - Total: ~$0.19/user/month for both. Per-user margin impact on FREE tier: minor; on PRO: negligible.

---

## Ratification checklist

Marko, please mark each feature with one of: **GO** (build as designed), **MODIFY** (open the doc, leave inline comments), **SKIP** (defer or kill).

- [ ] **#1 Memory Streak** — GO / MODIFY / SKIP
- [ ] **#2 Daily Brief** — GO / MODIFY / SKIP
- [ ] **#3 Continuity Banner** — GO / MODIFY / SKIP
- [ ] **#4 Weekly Wins Digest** — GO / MODIFY / SKIP
- [ ] **#5 Milestone Cards** — GO / MODIFY / SKIP
- [ ] **#6 Tour Replay** — GO / MODIFY / SKIP
- [ ] **#7 Pending Imports Reminder** — GO / MODIFY / SKIP

Plus the cross-feature decisions:
- [ ] Frame inclusion rule
- [ ] Timezone strategy v1
- [ ] Empty-state behaviour (suppress / educate / motivate)
- [ ] Overlay z-index queue rule
- [ ] LLM cost approval ($0.19/user/month for #2 + #4)

---

## Build order recommendation (assuming all GO)

CC's recommended sequencing (each phase ships independently, no blockers between them):

**Phase 1 — Quick wins (2-3h, low risk, immediate user-visible)**
- #6 Tour Replay (~1.5h)
- #7 Pending Imports Reminder (~2h)

**Phase 2 — Streak loop (3-4h)**
- #1 Memory Streak (single SQLite addition + StatusBar wire)

**Phase 3 — Celebration (2-3h)**
- #5 Milestone Cards (uses same frame-count signal as Streak)

**Phase 4 — Continuity surface (2-3h)**
- #3 Continuity Banner (uses existing `recentThreads` from workspace-context)

**Phase 5 — Daily Brief (5-6h, LLM cost approval gate)**
- #2 Daily Brief (cron job + LLM generator + Tauri notification permission)

**Phase 6 — Weekly Wins (4-5h, recall instrumentation gate)**
- #4 Weekly Wins Digest (requires HybridSearch instrumentation — heaviest)

Total parallel-friendly: Phases 1+2+3 can ship together (~8h). Phase 4 independent. Phases 5+6 require backend work + LLM approval.

---

## Out of scope for this design pass

- Tier-gated variants (does FREE see streak chip? does PRO see different milestone copy?). Defer to per-feature `MODIFY` notes once Marko ratifies each.
- Localization. v1 ships English-only copy.
- A/B testing infrastructure for which copy variants drive engagement. Wait for usage data.
- Cross-feature combo bonuses ("Streak + 100 frames = bonus card"). Wait until each individual feature ships.

---

## Implementation contract

Once Marko ratifies (per-feature GO), CC will:

1. Open the corresponding doc, drop a `## Implementation log` section at the bottom, link the eventual commits there.
2. Implement in the recommended phase order unless Marko prefers a different order.
3. After each phase, halt and PM Pass for verification before starting the next.
4. Each phase commits include the feature number in the message (`feat(streak): ship #1 Memory Streak counter`) for backlink.

No feature ships before its doc has GO from Marko.
