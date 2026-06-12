# Judge round 1: self-contradiction kills trust faster than any missing feature

All five personas (novice → senior skeptic) scored "it knows me" at 3-4 NOT because memory
was weak, but because the surfaces contradicted themselves: "away 10 days" next to "active
yesterday", the same memory listed twice with two different ages, "No agents yet" while an
agent demonstrably worked. A memory product visibly misremembering itself reads as lying.
Three patterns to enforce:
1. **One source of truth per fact, end to end.** Two components computing "last active"
   from different stores WILL diverge; machine activity (cron writes) must never count as
   user activity.
2. **Empty showcase surfaces actively disprove the pitch.** An Evolution tab with 0 runs
   and an Agent Center with 0 agents scored "visible agent growth" 2/5 across the board —
   worse than not having the screens. Either seed them with real product usage or make
   the empty state tell the story.
3. **Machine vocabulary is a tax on every persona below developer.** tool_result:,
   entities/relations, YOLO, raw cron names, unrendered markdown — each one individually
   "minor", collectively the #1 friction driver (2/5 average).
