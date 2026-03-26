# Post-Milestone B Trust Gap Review

**Date:** 2026-03-17
**Scope:** Targeted review of remaining trust/provenance gaps after Phase 7 Milestone B
**Reviewer:** Architecture review (Claude Code session)

---

## 1. Confirmed Strengths After Milestone B

**Attribution exists at all three layers.** Retrieval output tags every result with source (`[workspace memory]`, `[personal memory]`, `[KVARK: type: title]`). The prompt tells the agent how to use those tags honestly. The UI renders them as distinct visual badges. This is a real trust chain, not a cosmetic layer.

**KVARK degradation is safe.** KVARK failure preserves local results, captures the error, and surfaces a note. The user never gets a blank result because enterprise search is down.

**Solo/Team behavior is untouched.** No `kvarkClient` → no KVARK code path executes. Zero prompt bloat, zero UI noise. The conditional injection pattern (both in prompt and in `search_memory`) is clean.

**Workspace-scoped sessions fixed.** `buildToolsForWorkspace()` now includes KVARK tools. This was a real bug — workspace-scoped chat sessions previously lost access to enterprise search.

---

## 2. Remaining Trust Gaps

### P0 — Trust depends on prompt obedience, not product constraints

**The conflict problem.** The prompt says: *"If KVARK results conflict with workspace memory, flag the discrepancy."* But the code provides zero help. `CombinedRetrievalResult` keeps three separate arrays with no cross-source comparison. The agent must infer contradictions from raw text at reasoning time. LLMs are unreliable conflict detectors — they tend to synthesize a smooth answer rather than flag a disagreement.

This is the single most dangerous trust gap. A workspace memory says "we decided to use PostgreSQL" and a KVARK enterprise doc says "company standard is Oracle" — the agent will pick one and present it confidently. The user has no way to know sources disagreed.

**Severity:** P0 for Business tier. For Solo/Team (no KVARK), not applicable.
**Fix surface:** `CombinedRetrieval` could detect topic overlap + score divergence and set a `conflicts` flag. The formatter and prompt could then act on it structurally rather than hoping the LLM notices.

### P1 — No staleness signal

The prompt doesn't tell the agent how to handle temporal conflicts. Workspace memory from 3 months ago says X. A KVARK document updated yesterday says Y. The agent has no metadata to compare freshness — `KvarkStructuredResult` carries no `lastUpdated` date, and memory frames carry creation timestamps but these aren't surfaced in `CombinedResult`.

**Severity:** P1. Wrong in specific scenarios but not systematically dangerous.
**Fix surface:** Add `timestamp` to `CombinedResult.metadata`. KVARK-side: expose `last_updated` in search response (requires KVARK API change). Prompt: add freshness guidance.

### P1 — No drilldown from attribution badges

The UI renders `[KVARK: pdf: Project Status]` as a badge. But the badge is not clickable. The user can't open, preview, or verify the source document. Attribution without verification is just a prettier form of "trust me."

`KvarkStructuredResult` carries `documentId` but no URL, no connector source, no page reference. The comment in `kvark-tools.ts:76` explicitly notes: *"Future: add connector, page when KVARK exposes them."*

**Severity:** P1. The badge builds some trust ("this came from enterprise docs"), but without clickthrough it's a dead end. Users who care about provenance will still feel uncertain.
**Fix surface:** When KVARK adds document URLs to its API, pipe them through `KvarkStructuredResult` → `CombinedResult.metadata` → badge `href`.

### P2 — Ordering implies priority without saying so

`formatCombinedResult` renders: Workspace Memory → Personal Memory → Enterprise Knowledge. This ordering is reasonable but silent. The user may interpret last-position KVARK results as "supplementary" when they might actually be more authoritative for the query. No weighting or priority signal is exposed.

**Severity:** P2. Ordering is defensible. Only matters in edge cases where enterprise docs should clearly override stale memory.
**Fix surface:** Could add a "primary source" indicator when one source clearly dominates by score. Not urgent.

### P2 — Badge rendering edge cases

- KVARK results with `null` document_type produce `[KVARK: title]` (handled correctly by regex).
- Very long KVARK titles have no truncation — could produce wide badges that break layout.
- Badges inside markdown code blocks would incorrectly render as styled spans.

**Severity:** P2. These are polish items. The code-block case is unlikely since attribution markers don't appear in code.
**Fix surface:** Add `max-width` + `text-overflow: ellipsis` to `.attribution-badge--kvark`. Add code-block exclusion regex if observed in practice.

---

## 3. Blockers vs. Polish

| Gap | Blocker? | Why |
|-----|----------|-----|
| Conflict detection (P0) | **Yes for Business tier launch.** Without it, combined retrieval can silently present contradictory information as a unified answer. | Trust-destroying when sources disagree. |
| Staleness signal (P1) | No, but should be addressed before Business GA. | Wrong in specific temporal scenarios, not systematically. |
| Badge drilldown (P1) | No. Badges add trust even without clickthrough. | Depends on KVARK API exposing URLs — not fully in Waggle's control. |
| Ordering priority (P2) | No. Current ordering is defensible. | Nice-to-have for power users. |
| Badge CSS edge cases (P2) | No. Functional, just could look bad with long titles. | CSS-only fix, trivial. |

---

## 4. Single Best Next Slice

**Conflict detection in combined retrieval.**

Not the full conflict-resolution UX — just the structural foundation:

1. After `CombinedRetrieval.search()` returns, scan for topic overlap between local results and KVARK results (simple: check if any KVARK result scores > 0.7 on a query where a local result also scores > 0.7 but with substantially different content).
2. Set a `hasConflict` boolean + optional `conflictNote` on `CombinedRetrievalResult`.
3. `formatCombinedResult` appends a conflict warning when the flag is set.
4. The prompt already tells the agent to flag discrepancies — now it has a structural signal to act on.

This is maybe 50-80 lines of code + tests. It doesn't require UI changes (the text warning is sufficient for now). It doesn't require KVARK API changes. And it addresses the only P0 trust gap.

**Why before Milestone C (feedback loop)?** Because feedback without trust is backwards. If the user can't trust that combined retrieval is honest about disagreements, they can't give meaningful feedback about which results were useful.

---

## 5. Recommended Sequencing After Milestone B

1. **Conflict detection slice** (P0 trust fix, ~1 session)
2. **Milestone C: Feedback Loop** (`kvark_feedback` tool — Phase 7 plan)
3. **Badge truncation CSS** (P2 polish, 10 minutes)
4. **Milestone D: Governed Action Proof** (Phase 7 plan)
5. **Staleness metadata** (P1, requires KVARK API coordination)
6. **Badge drilldown** (P1, requires KVARK API URLs)
7. **Milestone E: Product Hardening** (Phase 7 plan)

Items 5-6 are gated on KVARK-side API changes. Items 1-4 are fully within Waggle's control.
