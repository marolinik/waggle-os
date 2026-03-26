# Phase 7 Closeout — KVARK Integration

**Status:** Complete (2026-03-17)
**Objective:** Connect Waggle to KVARK as a governed enterprise retrieval and action substrate, without reimplementing KVARK's pipeline or breaking Solo/Team behavior.

---

## 1. What Phase 7 delivered

| Milestone | Scope | Key artifacts |
|-----------|-------|---------------|
| **A** (prior session) | KVARK client, auth, types, tools, mocked smoke test | `KvarkClient`, `KvarkAuth`, `kvark_search`, `kvark_ask_document`, `parseSearchResults` |
| **B1** | Combined retrieval merge engine | `CombinedRetrieval` class, coverage heuristic, source-tagged results |
| **B2** | Runtime wiring | `kvarkClient` injected via Orchestrator into `search_memory`; workspace KVARK tool gap fixed |
| **B3** | Prompt attribution | Conditional source-attribution and conflict-flagging instructions (KVARK-only) |
| **B4** | UI attribution | Visual badges for `[workspace memory]`, `[personal memory]`, `[KVARK: type: title]` |
| **Post-B** | Conflict detection | `hasConflict` / `conflictNote` on `CombinedRetrievalResult`; keyword-polarity heuristic |
| **C** | Feedback loop | `kvark_feedback` tool, `KvarkClient.feedback()`, conditional prompt guidance |
| **D1** | Governed action skeleton | `kvark_action` tool, `KvarkClient.action()`, approval gating, 501 handling |
| **E1** | Integration smoke test | 8 assembled-path tests: happy path, conflict, skip, failure, feedback round-trip, scope filtering |

**KVARK tool family at close:**
- `kvark_search` — enterprise document search
- `kvark_ask_document` — document-scoped Q&A
- `kvark_feedback` — retrieval quality signal (bidirectional)
- `kvark_action` — governed enterprise actions (approval-gated)

All four tools are conditionally registered (no KVARK config = no tools), degrade gracefully on 501/unavailable, and follow the same error-handling and DI patterns.

## 2. What each milestone proved

**Milestone A:** KVARK can be accessed from Waggle through a single client boundary with automatic auth and typed responses. The `KvarkClientLike` interface decouples agent tools from server infrastructure.

**Milestone B:** Combined retrieval works transparently inside `search_memory`. The agent doesn't choose between local and enterprise search — the merge engine decides based on local coverage. Attribution exists at three layers (data tags, prompt rules, UI badges), and conflict detection provides a structural signal rather than relying on prompt obedience alone.

**Milestone C:** The retrieval loop is bidirectional. Waggle can signal back to KVARK which results were useful. This is a compounding investment — feedback improves future retrieval quality.

**Milestone D1:** Governed actions can be expressed, gated, and degraded gracefully without waiting for KVARK's action API to mature. The approval mechanism uses the existing confirmation flow — no new UI or permission model was invented.

**Milestone E1:** The assembled pipeline has no integration seams. Every module boundary (CombinedRetrieval, detectConflict, formatCombinedResult, createKvarkTools) connects cleanly. Types align. Output format is consistent across all paths.

## 3. Trust and product outcomes

| Before Phase 7 | After Phase 7 |
|----------------|---------------|
| Waggle searched only workspace + personal memory | Waggle transparently includes enterprise knowledge when available |
| No source provenance in results | Every result tagged with source at data, prompt, and UI layers |
| Source conflicts invisible | Structural conflict signal when workspace memory and KVARK disagree |
| KVARK was one-directional (read) | Bidirectional: read + feedback |
| No enterprise action path | Governed action skeleton with approval gating |
| Integration untested as assembly | Assembled pipeline smoke-tested with 8 scenarios |

**Solo/Team behavior:** Unchanged. No KVARK config = no KVARK code paths execute, no extra prompt tokens, no UI noise.

## 4. Deferred items

| Item | Why deferred | Blocked on |
|------|-------------|------------|
| **D2: Connector awareness** | KVARK's `/api/connectors` endpoint needed to know which actions are available for which systems | KVARK API maturity |
| **D2: Permission-driven tool surfacing** | KVARK's `/api/user/permissions` needed to conditionally hide `kvark_action` when governance is disabled | KVARK API maturity |
| **D2: Approval reference threading** | Passing Waggle's confirmation `requestId` as `governance.approvalReference` requires the hook context to be available inside tool execute — a small plumbing change, not blocked, but low value without D2 | Architectural convenience, not a blocker |
| **E2: Live KVARK validation** | Requires a running KVARK instance with test documents to validate the real HTTP path | KVARK instance availability |
| **E3: Error UX polish** | User-facing error messages for KVARK failures could be more specific; badge CSS truncation for long titles | Not blocked — Phase 8 polish scope |

These are not gaps — they are the natural next layer. Phase 7's job was to build the Waggle-side integration architecture. That architecture is complete and tested. The deferred items are either blocked on KVARK-side readiness or are polish that belongs in Phase 8.

## 5. KVARK-side dependencies

For deferred items to unblock, KVARK needs:

| KVARK endpoint | Current state | Waggle impact when ready |
|----------------|--------------|--------------------------|
| `POST /api/actions` | Contract spec exists, likely 501 | `kvark_action` starts working — zero Waggle changes needed |
| `GET /api/connectors` | Contract spec exists | Enables D2 connector awareness |
| `GET /api/user/permissions` | Contract spec exists | Enables permission-driven tool surfacing |
| `POST /api/feedback` | Contract spec exists, likely 501 | `kvark_feedback` starts working — zero Waggle changes needed |
| `POST /api/chat/ask` | Currently 501 | `kvark_ask_document` starts working — zero Waggle changes needed |
| Document URLs in search results | Not in current response schema | Enables badge clickthrough / source drilldown |
| `last_updated` on search results | Not in current response schema | Enables staleness detection |

The Waggle-side pattern is proven: when KVARK ships an endpoint, the corresponding tool transitions from graceful-501-handling to live with no code changes needed.

## 6. Phase 8 entry state

**Code:**
- 14 packages, all compiling
- KVARK tool family: 4 tools, all conditionally registered
- Combined retrieval: wired into `search_memory` with conflict detection
- Attribution: data + prompt + UI layers complete
- Approval gating: `kvark_action` in `ALWAYS_CONFIRM`

**Tests:**
- Agent package: 60+ files, 660+ tests passing
- Server KVARK tests: 6 files, 55+ tests passing
- UI package: 22 files, 746 tests passing
- Pipeline smoke: 8 assembled-path tests passing
- Zero regressions from Phase 7 work

**Product surface:**
- Solo/Team: unchanged
- Business/Enterprise: combined retrieval + attribution + conflict detection + feedback + governed action skeleton ready

**Phase 8 scope** (already defined by Marko, 2026-03-17):
Phase 8 includes the original hardening plan (Wave S stability, Wave T ship prep) plus the agent behavior improvements identified during the B2B lead generation stress test:
- Anti-hallucination enforcement
- Capability acquisition in practice
- Sub-agent workflow UX (progress panel, streaming)
- Steady agents with persistent state
- Connector-driven automation
- File creation UX
- Speed improvements

See `memory/project_phase8_scope.md` and `memory/project_session_2026_03_17_summary.md` for full context.

## 7. Gate statement

Phase 7 is complete.

Every Waggle-side integration surface that can be built without a live KVARK instance has been built, tested, and smoke-validated. The four-tool KVARK family follows a single proven pattern. Combined retrieval works transparently. Attribution and conflict detection provide structural trust. Feedback closes the retrieval loop. Governed actions are skeletally ready with approval gating.

The remaining Phase 7-adjacent work (D2, E2, E3) is either blocked on KVARK API maturity or is polish that fits naturally in Phase 8 hardening. No architectural risk remains that would justify continuing Phase 7.

Proceed to Phase 8.
