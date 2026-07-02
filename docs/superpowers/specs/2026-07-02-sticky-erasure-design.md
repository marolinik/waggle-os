# Sticky Erasure — GDPR Art.17 suppression that survives re-import

**Date:** 2026-07-02 · **Feature:** #7 Art.17 tail · **Status:** design approved, implementation pending
**Author:** brainstormed w/ founder (Marko), grounded by `sticky-erasure-recon` workflow (6 agents, full write-path map).

---

## Problem

The #7 Art.17 arc (closed 2026-07-02 S1) rotates `archive_uid` to an opaque random id on erase to
close a re-identification vector. That rotation has a **documented side-effect** (`raw-archive.ts:194-200`):
rotating the uid frees `RawArchive.append()`'s `content→uid` dedup key, so **re-importing an
already-erased source re-materializes it**. The searchable summary, verbatim raw-turns, and KG
already came back on re-harvest before the rotation too (pre-existing) — so erasure is not "sticky":
a user who exercises their right-to-erasure on a ChatGPT thread gets it back the next time that
thread is re-exported/re-synced.

The fix named in-code is an **erased-subject suppression list** consulted at every write seam. A
content-keyed tombstone is explicitly **rejected** — storing `sha256(erased-PII)` would reintroduce
the very content-derived re-id vector the rotation removed.

## Decisions (founder-ratified 2026-07-02)

| # | Decision | Choice |
|---|----------|--------|
| Granularity | key on | **Per-source `(source, source_ref)`** — the same tuple `eraseBySourceRef` uses; the only durable identity that survives erasure. NOT per-content-hash (re-id vector), NOT per-subject-string (no schema handle, over-erase). |
| Durability | permanence | **Sticky + explicit re-consent** — permanent by default; a deliberate "Allow re-import again" UI action deletes the suppression row. |
| Scope | reach | **Group-A write paths only**; connector + `ingest_source` documented as a known limitation (they persist no durable subject key today — already un-erasable by subject, orthogonal pre-existing gap). |
| Backfill | past erasures | **Backfill** `erased_subjects` from retained `raw_archive` erased rows so historical erasures are sticky too. |
| Tombstone | content-hash | **OFF** (consistent with the ratified anti-re-id rotation). |
| Capture point | where recorded | **Inside `MindErasure`** — one point feeds both the route and the MCP `erase_memory` tool (the tool emits no audit event; a ledger fed from audit events would silently miss all MCP erasures). |
| Mind scope | isolation | **Per-mind** (per the mind-isolation pin `feedback_mind_isolation_no_cross_mind_mixing`). |
| Read-failure | on `isSuppressed` error | **Fail-closed on the item** (skip re-materialization). A failing local-SQLite read implies a broken DB where the follow-on INSERT fails anyway; Art.17 wins on the ambiguous item. |

## Architecture

Suppression must live **one level up from `FrameStore.createIFrame`** — that universal chokepoint
sees only `(gopId, content)` (content-hash), which is exactly the rejected key. `(source, source_ref)`
is only in scope at the harvest boundaries. So the check hooks at those boundaries; the capture hooks
at the erase boundary.

### 1. Schema — `erased_subjects` (new table)

Home: `packages/hive-mind-core/src/mind/schema.ts` (`SCHEMA_SQL`, appended after the `raw_archive`
block so it ships on first-init) + an idempotent guarded block in `db.ts` `runMigrations()` (same
pattern as the `raw_archive` / `ai_interactions` migrations, no CHECK-list drift).

```sql
CREATE TABLE IF NOT EXISTS erased_subjects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  source     TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  erased_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reason     TEXT,
  UNIQUE(source, source_ref)
);
CREATE INDEX IF NOT EXISTS idx_erased_subjects_lookup ON erased_subjects(source, source_ref);
```

**No `content`, no `content_sha256`** — generic substrate only. This is the deliberate *opposite* of
`install_audit` (proprietary-interleaved, hand-stripped on OSS export): `erased_subjects` forward-ports
to `marolinik/hive-mind` verbatim. No immutability triggers (rows are deletable — that is the re-consent path).

**Backfill** (one-time, idempotent, in the same migration block, after table create):
```sql
INSERT OR IGNORE INTO erased_subjects (source, source_ref, erased_at, reason)
SELECT source, source_ref, erased_at, erased_reason
FROM raw_archive WHERE erased_at IS NOT NULL;
```
Limitation: past erasures of archive-less summaries (subject-mode on a legacy/append-failed frame with
no `raw_archive` row) leave no skeleton to backfill from — accepted (they had no durable archive anchor).

### 2. `SuppressionStore` (new `mind/suppression.ts`)

Stateless wrapper over the mind db (like other `mind/` stores), exported from `@waggle/core` and
`@waggle/hive-mind-core`:

```ts
class SuppressionStore {
  constructor(db: Database)            // or the project's DB wrapper, matching RawArchive's ctor
  isSuppressed(source, sourceRef): boolean   // indexed SELECT EXISTS; FAIL-CLOSED (error → true)
  record(source, sourceRef, reason?): void   // INSERT OR IGNORE (idempotent)
  unsuppress(source, sourceRef): boolean     // DELETE; returns whether a row was removed
  list(): { source, sourceRef, erasedAt, reason }[]
}
```

`isSuppressed` swallows read errors and returns `true` (fail-closed on the item) with a loud
`logger.error` — a genuine read failure means the DB is broken and the subsequent write fails too.

### 3. Capture — inside `MindErasure` (`mind/erasure.ts`)

- `eraseBySourceRef(source, sourceRef, reason)` → `suppression.record(source, sourceRef, reason)`
  (subject mode — the canonical key arrives verbatim).
- `eraseFrameComplete(frameId)` → for **each resolved** `(source, source_ref)` subject (it already
  resolves them via `reconstructSource` + the content-prefix/`metadata.sourceId` fallback) →
  `suppression.record(...)`. Subject-less frames (connector/ingest single frames) resolve no durable
  subject → nothing recorded (out of scope, documented).

Because both the `/api/memory/erase` route (frame + subject mode) and the MCP `erase_memory` tool call
these primitives, both surfaces feed the ledger with no drift. Recording happens **inside the erase
transaction** so a rolled-back erase does not leave a stale suppression row.

### 4. Consumption guards (fail-closed)

| Seam | Guard | Covers |
|------|-------|--------|
| 3 harvest loops — `server/routes/harvest.ts`, `hive-mind-mcp-server/tools/harvest.ts`, `memory-mcp/tools/harvest.ts` | `if (isSuppressed(item.source, item.id)) { skippedSuppressed++; continue; }` at loop top, via **one shared helper** in hive-mind-core (kills twin-drift) | The whole fan-out per item: summary `createIFrame` + `setMetadata` + `RawArchive.append` + `writeRawTurnFrames` + KG/vector cognify + wiki |
| `server/local/harvest-autosync-frame.ts` `writeAutoSyncSummaryFrame` | guard before `createIFrame` | 30-min in-process auto-sync **and** daily cron `harvest_sync` (single shared writer) |
| `hive-mind-core/mind/raw-archive.ts` `RawArchive.append` | skip INSERT + return `{ created:false }` if suppressed | Defense-in-depth for any future non-loop caller of the documented-gap primitive |

The 3 loops call `RawArchive.append` and `writeRawTurnFrames` only from inside the loop, so the loop
`continue` already covers those vectors; the `append` guard is a durable backstop, not the primary gate.
The shared helper signature: `shouldSuppressHarvestItem(suppression, source, sourceRef): boolean` (or a
thin method on `SuppressionStore`) so the 3 call sites are `continue`-only, logic shared.

`skippedSuppressed` is surfaced in each import's result summary so a suppressed re-import is visible
(not a silent drop) — per the "no silent caps" discipline.

### 5. Re-consent surface

- `SuppressionStore.unsuppress` + `list` exposed via `@waggle/core`.
- Server routes (`server/src/local/routes/memory-center.ts`, next to the erase endpoint):
  - `GET /api/memory/suppression` → `list()`
  - `POST /api/memory/suppression/allow` `{ source, sourceRef }` → `unsuppress()`
- Memory Center UI (`apps/web/.../memory/MemoryCenterTab.tsx` or the trust/erase area): a "Suppressed
  sources" list, each row with an **"Allow re-import again"** button (confirm → POST → row disappears).
  Minimal; co-located with the existing Erase affordance.

### 6. Out of scope (documented limitation)

`ingest_source` (doc/URL/PDF/text) and the PRO connector cron persist **no durable `(source, source_ref)`**
— `connectorDataToItems` discards the item id, `ingest_source` stamps no `metadata.sourceId` and creates
**unlinked** KG entities. They are already un-reachable by subject-mode erasure today (pre-existing,
independent of this feature). Making them sticky requires threading the connector item id + stamping
`sourceId` + routing `ingest_source` through `importEntitiesForFrame` — a separate engineering item.
Noted in `raw-archive.ts` / the erase docstrings.

### 7. OSS forward-port (P2, monorepo-first per §7.5)

`suppression.ts` + the `schema.ts`/`db.ts` additions are **generic substrate** (no governance/trust
fields) → forward-port to `marolinik/hive-mind` `packages/core` verbatim via the curated forward-port
(co-located tests, import rewrites). Done after the monorepo commits land + any blocking OSS PR, matching
the prior arc's cadence. The `schema.ts`/`db.ts` diffs still get the manual proprietary-review pass.

## Testing (TDD)

Unit (`hive-mind-core/tests/mind/suppression.test.ts`):
- `record` idempotent; `isSuppressed` true/false; `unsuppress` removes + returns bool; `list` shape.
- `isSuppressed` **fail-closed**: a forced read error returns `true`.

Migration/backfill (`hive-mind-core/tests/mind/schema` or db migration test):
- Table created on fresh init; migration idempotent on re-run.
- Backfill populates `erased_subjects` from pre-existing `raw_archive` erased rows.

Capture (`hive-mind-core/tests/mind/erasure.test.ts`):
- `eraseBySourceRef` records the pair; `eraseFrameComplete` records each resolved subject; rolled-back
  erase leaves **no** suppression row.

Integration — **the headline test**:
- Harvest a source → erase it (subject or frame mode) → **re-import the same source** → assert the
  summary, raw-turns, `raw_archive` row, and KG entities do **NOT** re-materialize, and `skippedSuppressed>0`.
- `unsuppress` → re-import the same source → assert it **does** re-materialize.
- `RawArchive.append` on a suppressed subject → `{ created:false }`, no row.
- `writeAutoSyncSummaryFrame` on a suppressed subject → no frame.

Gates: `npx tsc --noEmit` on {shared, hive-mind-core, server, memory-mcp, apps/web}; touched-area
Vitest green; then a multi-lens adversarial review workflow (matching the arc's cadence) with every
confirmed finding fixed/documented in-arc.

## Phasing

1. **Substrate** — schema + migration + backfill + `SuppressionStore` + capture in `MindErasure`. (hive-mind-core)
2. **Guards** — shared helper + 3 harvest loops + `writeAutoSyncSummaryFrame` + `RawArchive.append` backstop.
3. **Re-consent** — routes + Memory Center UI.
4. **Adversarial review** — multi-lens workflow; fix confirmed findings.
5. **OSS forward-port** — P2, after monorepo lands (per §7.5).

Commit per phase; push held until founder asks (main is shared with concurrent sessions — fetch-checked
fast-forward at push time, as in the prior arc).
