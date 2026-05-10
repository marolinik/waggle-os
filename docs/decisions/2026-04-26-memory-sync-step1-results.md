# Memory Sync Repair — Step 1 Results

**Date:** 2026-04-26
**Author:** CC-2 (parallel session, independent of CC-1 agent fix sprint)
**Status:** Step 1 COMPLETE — awaiting PM ratification before Step 2 kickoff
**Companion documents:**
- Audit + plan: `decisions/2026-04-26-memory-sync-audit.md`
- CC-2 brief: `briefs/2026-04-26-memory-sync-repair-cc2-brief.md`

---

## §1 — Forward port summary (hive-mind → waggle-os)

### Fix A — `9ec75e6` Stage 0 root cause: timestamp persist ✅ APPLIED

**Source patch:** hive-mind `9ec75e6` (Sprint 9 Task 0)
**waggle-os files touched:**
- `packages/core/src/mind/frames.ts` — added `isValidIsoTimestamp()` helper + extended `FrameStore.createIFrame()` with optional `createdAt?: string | null` parameter (5th arg). Branch: valid ISO → INSERT overrides `created_at` + `last_accessed`; invalid/null/undefined → falls back to schema default `datetime('now')`.
- `packages/server/src/local/routes/harvest.ts` — added module-level `isIsoTimestamp()` validator + threaded `item.timestamp` through to `createIFrame` in the commit-route loop. Fallback path is explicit (not silent): `request.log.warn` with structured fields `{ source, itemId, providedTimestamp }` per item, plus a summary warn at end of batch when `timestampFallbacks > 0`.
- `packages/core/tests/mind/frames.test.ts` — +4 regression tests (valid ISO round-trip, undefined → schema default, invalid string → schema default, null → schema default). Mirrors hive-mind 9ec75e6 substrate-test suite exactly.

**Backwards compatibility:** `createIFrame`'s 5th parameter is optional with `undefined` default. All 12+ existing call sites in waggle-os (`packages/agent/`, `packages/server/`, `packages/core/`) compile + run unchanged.

### Fix B — `0bbdf7a` content preview cap raise ✅ APPLIED

**Source patch:** hive-mind `0bbdf7a` (Sprint 9 Task 0.5)
**waggle-os files touched:**
- `packages/server/src/local/routes/harvest.ts` — added `HARVEST_PREVIEW_CAP_CHARS = 10_000` named constant; replaced inline `item.content.slice(0, 4000)` with `item.content.slice(0, HARVEST_PREVIEW_CAP_CHARS)`.

**Note on the prior value:** waggle-os had previously been at `4000` (not `2000` like the original hive-mind pre-fix). This was a partial mitigation that was never re-aligned to the canonical, production-tested `10_000` figure. This commit closes the parity gap — both repos now use `10_000` chars from the canonical Stage 0 re-harvest evidence.

### Acceptance gate ✅ ALL PASS

| Gate | Result |
|------|--------|
| `tsc --noEmit` on `packages/core/tsconfig.json` | clean (no output) |
| `tsc --noEmit` on `packages/server/tsconfig.json` | clean (no output) |
| `frames.test.ts` (with new createdAt cases) | 30/30 pass (+4 new) |
| Full `packages/core/tests/mind/` folder | 261/261 pass — zero regressions |
| Phase 1.1 `output-normalize.test.ts` | 43/43 pass — untouched |
| Phase 1.2 `prompt-shapes.test.ts` | 65/65 pass — untouched |
| Server harvest route tests (cache, runs, identity) | 23/23 pass — zero regressions |
| GEPA optimization test | 8/8 pass |

---

## §2 — Bidirectional audit (waggle-os → hive-mind candidates)

All three candidates **resolved N (no port needed)** because hive-mind already carries equivalent code.

### Candidate 1 — `63ef881` findDuplicate JS trim → **N (already-in-hive-mind)**

**Waggle-os patch summary:** `findDuplicate` removed the SQL `length()` pre-filter and computed JS-trimmed SHA-256 hash compare across the recency window. Bug: SQLite `trim()` only strips ASCII space (0x20), not `\n`/`\r`/`\t` — so JS-trimmed input length never matched stored length when content had trailing newlines. 68 of 156 frames slipped through dedup.

**Hive-mind state (verified at HEAD):** `packages/core/src/mind/frames.ts` lines 307-319 already implement the post-fix shape:
- `SELECT * FROM memory_frames ORDER BY id DESC LIMIT 500` (no `length()` pre-filter)
- `createHash('sha256').update(content.trim()).digest('hex')` on both sides
- Identical doc comment ("Comparison is trim-stable... No SQL `length()` pre-filter is used because SQLite's built-in `trim()` only strips ASCII space (0x20)...")

The fix was already extracted into hive-mind during the OSS scrub. **No port needed.**

### Candidate 2 — `803c6f6` memory-mcp dedup uses frame id → **N (originated in hive-mind, already round-tripped)**

**Waggle-os patch summary:** `harvest_import` / `ingest_source` MCP tools were comparing `frame.created_at` (SQLite space-separated) against `new Date().toISOString()` (T-separated). Space (ASCII 32) sorts below T (ASCII 84), so `frame.created_at >= batchStartIso` was always false. Every fresh frame misclassified as duplicate.

**Provenance per the commit body itself:** "Surfaced during the hive-mind @hive-mind/cli extraction (Wave 6 of the H-34 OSS split)... the fix is round-tripped back here so both repos stay aligned." The fix was authored in hive-mind FIRST and ported back to waggle-os.

**Hive-mind state (verified at HEAD):** `packages/mcp-server/src/tools/harvest.ts` and `packages/mcp-server/src/tools/ingest.ts` both use the `maxBefore = max(frame.id) + frame.id > maxBefore` pattern. Already aligned. **No port needed.**

### Candidate 3 — `b8ffe8e` Day-1-PM correctness cluster (mind/ scope) → **N (already-in-hive-mind)**

**Filtered to `packages/core/src/mind/` only:** the only mind/-touching change is item #7 (Correctness): `SessionStore.ensureActive()` — a transaction-wrapped read-or-create method that prevents twin-session race on a fresh mind. Secondary `id DESC` tiebreak because `datetime('now')` has second precision.

**Other items in the same commit (NOT eligible for port):**
- #6 (catch-up dedup keyed by frame id) → `packages/agent/src/orchestrator.ts` — agent/* is explicitly Waggle-only per EXTRACTION.md
- #9, #11, #12, #20 — all in `packages/agent/src/orchestrator.ts` — same reason

**Hive-mind state (verified at HEAD):** `packages/core/src/mind/sessions.ts` line 82 already has `ensureActive(projectId?: string): Session` with identical transaction-wrapping + secondary `id DESC` tiebreak + identical doc comment ("two concurrent callers on a fresh mind produce exactly one session (race-free)"). **No port needed.**

---

## §3 — Aggregate finding

**No bidirectional ports were warranted at this time.** Hive-mind's mind/ substrate is currently AHEAD of waggle-os in 2 of the 5 audit dimensions:

| Dimension | Direction | State |
|-----------|-----------|-------|
| Timestamp persist (Fix A) | hive-mind → waggle-os | Closed by this commit |
| Preview cap (Fix B) | hive-mind → waggle-os | Closed by this commit |
| findDuplicate JS trim | symmetric | Both have post-fix shape |
| memory-mcp / mcp-server dedup id | symmetric | Both have post-fix shape (originated hive-mind) |
| sessions ensureActive | symmetric | Both have post-fix shape |

**Implication for Step 3 CI/CD design:** the sync workflow needs to support BOTH directions but the empirical reality of the last 2 weeks is mostly hive-mind → waggle-os (because hive-mind is the OSS pre-release artifact under active polish). Step 3 should weight that direction in its trigger / paths-filter design.

---

## §4 — Halt-and-ping triggers — none fired

- (1) cherry-pick clean apply: ✅ no structural deviation; both fixes applied surgically
- (2) waggle-os HEAD interference: ✅ uncommitted file `packages/agent/src/run-meta.ts` is in CC-1's territory (agent fix Phase 1.x), not in mind/ or harvest/ — no conflict
- (3) audit scope > 30 min per candidate: ✅ all 3 resolved in <5 min each (each found the equivalent already in place)

---

## §5 — Open questions for PM

1. **Confirm Step 1 CLOSED**: PM ratify N decisions on all 3 candidates? Confirm tests + tsc gate passed?
2. **Step 2 kickoff order**: brief authorizes Step 2 (port hive-mind tests u waggle-os) immediately after Step 1 ratification. Proceed in same CC-2 session, or new session?
3. **Surface the asymmetry in Step 3 design?** §3 finding suggests sync workflow should default-weight hive-mind → waggle-os direction (most empirically active). Worth recording in Step 3 brief?

---

## §6 — Cross-references

- waggle-os commit Fix A (timestamp persist port): `89c1004` on `feature/c3-v3-wrapper` — `fix(harvest,frames): port hive-mind 9ec75e6` (3 files, +150/-6)
- waggle-os commit Fix B (preview cap raise port): `fed4a20` on `feature/c3-v3-wrapper` — `fix(harvest): port hive-mind 0bbdf7a` (1 file, +10/-1)
- Audit transcript and verification gate output: in CC-2 session log
- EXTRACTION.md: `D:\Projects\hive-mind\EXTRACTION.md`

---

## §7 — Status: AWAITING PM RATIFICATION

Step 1 complete. Both forward ports applied + audited; all gates green; no halt-triggers fired. CC-2 session standing GREEN, halted before Step 2 kickoff per brief §2.3.

**PM action required:** confirm Step 1 CLOSED → authorize Step 2 (port hive-mind tests u waggle-os) kickoff, in same CC-2 session or new.
