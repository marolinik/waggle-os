---
type: health
last_compiled: 2026-04-13
---

# Wiki Health Report

## Source Quality Assessment

| Source | Files | Quality | Notes |
|--------|-------|---------|-------|
| Memory handoffs | 12 | Excellent | Curated, structured, timestamped |
| Strategy memories | 5 | Excellent | Decisions with rationale |
| Feature memories | 4 | Good | Technical specs, architecture |
| Feedback memories | 1 | Good | Clear behavioral guidance |
| Session JSONL files | 20 | Raw | 422 user messages, needs extraction |
| personal.mind frames | 202 | Poor | 80% E2E test pollution |
| personal.mind KG | 2,734 entities | Very Poor | 80% misclassified noise |

**Verdict:** Memory files are the gold standard. Session JSONLs have real
decisions but need filtering. personal.mind is polluted from automated testing
and should NOT be used as a compilation source until cleaned.

## Gaps — Topics That Should Have Pages But Don't

### Critical (referenced in 5+ sources, no synthesis)
- **Memory Harvest Pipeline** — core feature, mentioned everywhere, no dedicated page
  explaining what adapters exist, what the UX flow is, what's imported vs. not
- **Docker Stack** — Postgres, Redis, MinIO, LiteLLM all in docker-compose.yml
  but no page explaining what each does and how they wire together
- **Agent Architecture** — 22 personas, 80+ tools, but no synthesis page on
  how the agent loop works, how personas are selected, how tools are filtered

### Important (referenced in 2-4 sources)
- **Onboarding Flow** — 7-step wizard, revised multiple times, no synthesis
- **Design System (Hive DS)** — tokens, colors, components scattered across sessions
- **E2E Testing Strategy** — evolved from manual to Playwright, no summary

### Missing Relations
- Marko ↔ Zoran Radisavljevic (co-founders, never linked)
- Marko ↔ Nenad Tesic (co-founders, never linked)
- Waggle OS ↔ Tauri 2.0 (core dependency, not an entity)
- KVARK ↔ DORA/NIS2 (compliance regulations that strengthen the pitch)

## Contradictions

### Entity Count Evolution
- Mar 17: "13 personas, 28 connectors"
- Apr 9: "22 personas, 102 MCP servers"
- Apr 10: "22 personas, 148 MCP servers"
- Apr 13: "22 personas, 148 MCP connectors"
**Status:** Not a contradiction — shows growth over time. Timeline captures this.

### Test Count
- Mar 23: 298/299 tests
- Apr 7: 4,409 tests (after agent intelligence sprint)
- Apr 12: 96 E2E tests (separate suite)
- Apr 13: 40/40 E2E (trimmed to stable subset)
**Status:** Different test suites measured at different times. Clarify in
[[Waggle OS]] page which suites are which.

### Tier Pricing
- Original: Solo/Teams/Business/Enterprise (4 tiers)
- Apr 12 restructure: Trial/Free/Pro $19/Teams $49/KVARK (5 tiers)
**Status:** Resolved — new structure is canonical.

## Data Quality Recommendations

1. **Clean personal.mind KG** — delete entities with names matching common
   nouns/verbs ("Begin Week", "High Risk", etc.). Dedup by normalized name.
   This is prerequisite for any automated wiki compilation.

2. **Extract decisions from session JSONLs** — Marko's messages contain
   real strategic decisions ("memory + harvest free forever", "open core
   model", "not just enterprise"). These should be first-class decision
   frames, not buried in chat logs.

3. **Link memory files to git commits** — each handoff references commit
   hashes. Cross-linking would enable "what was built in this session" →
   actual code changes.

## Compilation Statistics

| Metric | Value |
|--------|-------|
| Memory files used | 29 |
| Session JSONLs scanned | 20 (422 user messages) |
| Pages compiled | 7 |
| Pages that should exist | ~25-30 |
| Compilation time | ~3 minutes (manual, this test) |
| Estimated automated cost | ~$0.08 (Haiku, 7 pages) |
