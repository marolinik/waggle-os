# Phase 7 Milestone B — Closeout

**Status:** Complete (2026-03-17), including post-B trust-gap follow-up
**Scope:** Combined retrieval with source attribution and conflict detection — the Business-tier search experience

---

## 1. What Milestone B delivered

Four slices, each additive, each tested independently:

| Slice | What | Key files |
|-------|------|-----------|
| **B1** | `CombinedRetrieval` merge engine — pure module that combines workspace memory, personal memory, and KVARK search with a coverage heuristic | `agent/src/combined-retrieval.ts`, 23 tests |
| **B2** | Runtime wiring — `kvarkClient` injected via Orchestrator into `search_memory`; workspace-scoped sessions now include KVARK tools; single `KvarkClient` instance shared across standalone tools and combined retrieval | `agent/src/tools.ts`, `agent/src/orchestrator.ts`, `server/src/local/index.ts`, 10 new tests |
| **B3** | System prompt attribution rules — conditional prompt section (only when KVARK is configured) that instructs the agent to distinguish enterprise docs from memory and flag source conflicts | `server/src/local/routes/chat.ts` |
| **B4** | UI attribution badges — `[workspace memory]`, `[personal memory]`, `[KVARK: type: title]` markers rendered as styled badge chips in chat messages | `ui/src/components/chat/ChatMessage.tsx`, `app/src/styles/waggle-theme.css`, 10 new tests |
| **Post-B** | Conflict detection — `CombinedRetrievalResult` now carries `hasConflict` + `conflictNote`; conservative keyword-polarity heuristic flags when workspace memory and KVARK contain contradictory status/decision language; `search_memory` surfaces a `## Source Conflict` section only when triggered | `agent/src/combined-retrieval.ts`, `agent/src/tools.ts`, 14 new tests |

## 2. Why it matters

This is where the product ladder starts differentiating. Solo/Team users search workspace + personal memory. Business/Enterprise users get the same search transparently augmented with KVARK enterprise retrieval — same tool, same UX, richer results.

The attribution layer is not cosmetic. Without it, the agent presents enterprise document content as if it were recalled from prior conversations. B3+B4 close that trust gap: the user sees where each fact comes from, the agent is instructed not to misrepresent provenance, and the UI reinforces it visually.

The post-B conflict detection closes the remaining P0 gap: when workspace memory says "approved" and a KVARK enterprise doc says "cancelled," the system now flags it structurally rather than hoping the LLM notices. This makes combined retrieval honest about disagreement, not just about provenance.

## 3. Architecture decisions validated

- **Combined retrieval inside `search_memory`, not beside it.** The agent doesn't need to decide whether to search locally or enterprise — `search_memory` handles the merge transparently. KVARK is only queried when local results are insufficient (< 3 results with score ≥ 0.7).
- **KVARK remains a black box.** Waggle delegates retrieval to KVARK's pipeline. No reranker duplication, no permission reimplementation. `parseSearchResults()` is the only translation surface.
- **Optional DI, not feature flags.** `kvarkClient` flows through `OrchestratorConfig` → `MindToolDeps` → closure. When null, the code path is identical to pre-Milestone-B. No conditional branches in hot paths.
- **Graceful degradation.** KVARK failure returns empty KVARK results + error message. Local results are always preserved. The user sees a note, not a crash.
- **Single KvarkClient instance.** Created once at server startup, shared between standalone tools (`kvark_search`, `kvark_ask_document`) and combined retrieval. No duplicate connections.
- **Conflict detection is structural, not prompt-dependent.** The P0 trust-gap review showed that asking the LLM to detect conflicts via prompt instructions alone is unreliable. `detectConflict()` now provides an explicit `hasConflict` signal using keyword-polarity heuristics — conservative (prefers false negatives over false positives), deterministic, and testable. The agent still reasons about conflicts, but it now has a structured cue to act on.

## 4. Test / regression status

| Scope | Files | Tests | Status |
|-------|-------|-------|--------|
| B1 (combined-retrieval) | 1 | 23 | Pass |
| B2 (search-memory-combined) | 1 | 10 | Pass |
| B2 (kvark-tools) | 1 | 15 | Pass |
| B4 (attribution-badges) | 1 | 10 | Pass |
| Post-B (conflict-detection) | 1 | 14 | Pass |
| Full agent package | 59 | 648 | Pass |
| Full UI package | 22 | 746 | Pass |
| Local server tests | 3 | 20 | Pass |
| Docker-dependent team tests | 6 | — | Pre-existing failures (PostgreSQL/Redis not running) |

No regressions introduced by Milestone B.

## 5. Known edge cases / non-blocking follow-ups

- **Attribution in code blocks.** Badge regex will match inside `<code>` elements. Low probability (attribution markers don't appear in code), but a future refinement could skip `<pre>`/`<code>` content.
- **LIKE fallback path.** The legacy LIKE-scan fallback (when vector search returns nothing) only runs on the non-KVARK path. CombinedRetrieval handles its own empty-result logic. This is acceptable — LIKE is a last-resort path that rarely fires.
- **Prompt cache invalidation.** The system prompt cache keys on `(workspace, workspaceId, skillCount)`. KVARK availability doesn't change mid-session, so no invalidation issue. If KVARK were dynamically connectable mid-session (future), the cache key would need updating.
- **Sub-agent KVARK access.** Sub-agents spawned via `spawn_agent` inherit the parent's tool set. Workspace-scoped sub-agents will get KVARK tools (fixed in B2). Non-workspace sub-agents use `allTools` which already includes KVARK tools. No gap.
- **Conflict heuristic is English-only and keyword-based.** It detects contradictory status/decision language (approved vs. cancelled, selected vs. rejected) but not semantic disagreement without status keywords (e.g., "uses PostgreSQL" vs. "uses Oracle"). This is intentional — false positives are more damaging than false negatives. The agent can still detect semantic conflicts via reasoning; the heuristic handles the most dangerous case (contradictory action status) structurally.
- **Conflict detection only covers workspace↔KVARK.** Personal memory is excluded — it rarely contains enterprise-contradictory status language.

## 6. Best next step

**Milestone C: Feedback Loop** (`kvark_feedback` tool) — lets the agent signal back to KVARK when a result was useful or not, enabling KVARK's reinforcement learning. This is the first bidirectional touch point.

Alternatively, if the team wants to validate B end-to-end before moving to C: stand up a KVARK instance with test documents, configure vault credentials, and verify the full path (search → combined retrieval → conflict detection → attribution badges → agent response with honest sourcing). This would be the first live integration test beyond mocked paths.

The trust-gap review (`docs/plans/2026-03-17-post-milestone-b-trust-gap-review.md`) identified remaining P1/P2 items (staleness metadata, badge drilldown, ordering priority) — none are blockers for Milestone C. They are sequenced for later in the Phase 7 plan.
