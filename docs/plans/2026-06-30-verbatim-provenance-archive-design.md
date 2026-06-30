# Verbatim Provenance Archive (#7) — Design Spec

**Date:** 2026-06-30 · **Author:** Claude Opus 4.8 (1M) · **Audience:** Marko (founder) · **Status:** design — awaiting spec review
**Arc:** paperclip external-agent recon backlog → STEAL SOON / memory moat → #7
**Source backlog:** `docs/analysis/external-agent-launching-and-memory-comparison-2026-06-29.md` §8 #7

---

## 1. The finding that reshaped #7

The §8 backlog described #7 as "append-only verbatim archive, new file `harvest/raw-turns.ts`." **That file already exists** (W4.6, "Marko GO 2026-06-11"). On inspection, verbatim text is *already stored twice* in the substrate:

| System | What it stores | Immutable? | Coverage | Purpose |
|---|---|---|---|---|
| `harvest/raw-turns.ts` | per-turn dialogue text, as `[mind-rawturn …]` frames | **No** — deletable rows in `memory_frames` (cleanup/dedup/reconcile) | harvest imports **with messages** only; gated by `WAGGLE_RAWDETAIL` | retrieval (the RAWDETAIL recall lane) |
| `ai_interactions` (schema Layer 7) | model I/O (`input_text`/`output_text`) | **Yes** — DDL `BEFORE UPDATE/DELETE` triggers | live agent interactions | EU-AI-Act Art.12 event log |
| harvest route summary frame | `item.content.slice(0, 10_000)` (truncated preview) + `metadata.sourceId` | **No** — deletable | every harvest item | the searchable memory |

So "store verbatim" is **not** the gap. The irreducible gap is a **provenance anchor**: the ability to take any distilled/imported memory frame and reconstruct the **exact, full, never-mutable source it came from**. Today:
- The harvest summary frame is a **10K-char truncation** of `item.content` — long documents/conversations lose their tail.
- raw-turns are deletable and messages-only.
- No store guarantees the *full* source survives frame cleanup, and nothing carries an immutable integrity hash.

This is precisely the EU-AI-Act audit / "reconstruct the original" value #7 was picked for.

## 2. Goal & non-goals

**Goal:** an append-only, immutable, full-fidelity store of each harvested source item, with a provenance link from the frames it produced, and an audit/reconstruction query.

**Non-goals (YAGNI — explicitly out of scope for v0):**
- Capturing non-harvest ingest paths (`save_memory`, `agent_inferred`, `team_sync`, connector auto-fetch). Founder-chosen scope = **harvest/import only**. Most other paths are already verbatim (not lossy).
- Touching the retrieval path. **No change to `search.ts` / `scoring.ts` / the ranked corpus.** The 87.66% LoCoMo SOTA is regression-locked by construction (the archive is not part of the recall corpus). Anti-rec #1 honored.
- Replacing or modifying raw-turns or `ai_interactions`. This is **additive**.
- Retention/GC of the archive. It is append-only and grows; retention policy is a documented follow-up (mirrors the `ai_interactions` posture — storage growth accepted, pseudonymize-tombstone flow deferred).
- A UI surface. v0 is substrate + wiring + a query API; a Memory-Center "view original" button is a follow-up.

## 3. Design

### 3.1 New table `raw_archive` (hive-mind-core substrate)

```sql
CREATE TABLE IF NOT EXISTS raw_archive (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  archive_uid TEXT NOT NULL UNIQUE,          -- = content_sha256 (stable, idempotent natural key)
  source TEXT NOT NULL,                       -- import source (chatgpt/claude/gemini/url/pdf/…)
  source_ref TEXT,                            -- item.id (the UniversalImportItem id)
  title TEXT,                                 -- item.title (audit readability)
  content TEXT NOT NULL,                       -- FULL verbatim item.content (untruncated)
  content_sha256 TEXT NOT NULL,                -- integrity anchor
  injection_flagged INTEGER NOT NULL DEFAULT 0,-- 1 if scanForInjection flagged the content
  injection_flags TEXT NOT NULL DEFAULT '',    -- comma-joined flags when flagged
  source_timestamp TEXT,                       -- item.timestamp (original event time), if ISO
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_raw_archive_source_ref ON raw_archive (source, source_ref);
CREATE INDEX IF NOT EXISTS idx_raw_archive_created ON raw_archive (created_at DESC);

-- Append-only enforcement — identical posture to ai_interactions (schema Layer 7).
CREATE TRIGGER IF NOT EXISTS raw_archive_no_update
BEFORE UPDATE ON raw_archive
BEGIN SELECT RAISE(ABORT, 'raw_archive is append-only (verbatim provenance archive)'); END;
CREATE TRIGGER IF NOT EXISTS raw_archive_no_delete
BEFORE DELETE ON raw_archive
BEGIN SELECT RAISE(ABORT, 'raw_archive is append-only (verbatim provenance archive)'); END;
```

Added to **both** `SCHEMA_SQL` (fresh DBs) and an idempotent block in `db.ts runMigrations()` (existing DBs), matching the established pattern. Triggers are `CREATE … IF NOT EXISTS` so both paths are safe.

### 3.2 New module `mind/raw-archive.ts` — `RawArchive` store

```ts
export interface RawArchiveRow {
  id: number; archive_uid: string; source: string; source_ref: string | null;
  title: string | null; content: string; content_sha256: string;
  injection_flagged: 0 | 1; injection_flags: string;
  source_timestamp: string | null; created_at: string;
}
export interface ArchiveInput {
  source: string; sourceRef?: string; title?: string; content: string; sourceTimestamp?: string;
}
export class RawArchive {
  constructor(db: MindDB);
  /** Idempotent: archive_uid = sha256(content). INSERT OR IGNORE; returns the uid either way.
   *  Injection-scans the content and records the flag, but stores verbatim regardless
   *  (zero-loss forensic semantics — the archive is never fed to an LLM directly). */
  append(input: ArchiveInput): { archiveUid: string; created: boolean };
  getByUid(archiveUid: string): RawArchiveRow | undefined;
  /** Resolves frame.metadata.archiveUid → row. Returns undefined when the frame has no link. */
  reconstructSource(frameId: number): RawArchiveRow | undefined;
  list(opts?: { limit?: number; offset?: number; source?: string }): RawArchiveRow[];
  count(): number;
}
```

- **Idempotency:** `archive_uid = content_sha256`. Re-importing an unchanged item re-derives the same uid; `INSERT OR IGNORE` makes the second append a no-op (`created:false`). Matches the existing harvest idempotency story (source-level content hash + `createIFrame` dedup).
- **Injection posture:** scan-but-don't-drop. A zero-loss audit record must keep exactly what arrived — including a hostile payload (that's *evidence*). The row is never fed to an LLM; it's read only by `reconstructSource`/`list` for human/audit eyes. `injection_flagged` + `injection_flags` are recorded so any future consumer that *does* surface the content to a model re-scans first. (Contrast raw-turns, which drops, because those frames ARE fed to recall.)
- **Hashing:** `createHash('sha256')` from `node:crypto` over the **full, untouched** `content` (zero new dependency — `content-hash.ts` already uses `node:crypto` the same way). **Do NOT reuse `hashFrameContent`** — it `stripHmPrefix`'s + trims the body (provenance-insensitive dedup semantics), which would hash a *mangled* body and break the "integrity hash of the exact verbatim" guarantee. Add a small `hashRaw(content)` helper (or inline the 1-liner) in `raw-archive.ts`.

### 3.3 Link mechanism — frame metadata (zero migration on the hot table)

The harvest route already stamps the summary frame:
```ts
frameStore.setMetadata(frame.id, JSON.stringify({ kind, confidence, status: 'unreviewed', sourceId: item.id }));
```
We add `archiveUid` to that **same** object — no new `setMetadata` call, no schema change to `memory_frames` (the `metadata` JSON column already exists). The `archiveUid` sits alongside the existing `sourceId`. `reconstructSource(frameId)` reads `JSON.parse(frame.metadata).archiveUid`.

Rationale for metadata-JSON over a bridge table: the link is 1:1 (one summary frame per item on this route), read-on-demand (audit query, not hot-path), and the column already exists — a bridge table would add a migration + join for no query benefit at this scope.

### 3.4 Wiring — server harvest route (`packages/server/src/local/routes/harvest.ts`)

In the existing per-item loop (the `for (const item of items)` block, ~L424–485), once per item:
1. `const { archiveUid } = rawArchive.append({ source: item.source, sourceRef: item.id, title: item.title, content: item.content, sourceTimestamp: providedTimestamp });` — **full** `item.content`, before truncation.
2. Include `archiveUid` in the metadata object already built at the `setMetadata` call (~L468).

This is the primary desktop ingest path and the only wiring point for v0. The two MCP harvest tools (`memory-mcp`, `hive-mind-mcp-server`) are a **documented follow-up** — same `RawArchive.append` call in their item loops; deferred to keep v0 a single reviewable surface.

## 4. Data flow

```
harvest import (UniversalImportItem)
   │
   ├─ rawArchive.append({full item.content})  ──►  raw_archive row (immutable, sha256, injection-flagged)
   │        returns archiveUid                          ▲
   │                                                    │ metadata.archiveUid
   ├─ createIFrame(content.slice(0,10K))  ──►  memory_frames summary frame ─┘
   │        + setMetadata({…, sourceId, archiveUid})
   │
   └─ writeRawTurnFrames(item)  ──►  [mind-rawturn…] frames (unchanged; retrieval lane)

audit / reconstruction:
   reconstructSource(frameId) → frame.metadata.archiveUid → raw_archive row (full verbatim + integrity hash)
```

## 5. Error handling

- `append()` is best-effort-safe: an injection-flagged item still stores (flag recorded). A DB error in `append` must **not** abort the harvest item — wrap the call so a failed archive logs a warning and the frame still persists *without* an `archiveUid` (degraded provenance beats a failed import). Never silent: log names source + item id.
- `reconstructSource`: returns `undefined` (not throw) for frames with no/invalid `archiveUid` or missing rows.
- Append-only triggers: any code path that attempts UPDATE/DELETE on `raw_archive` throws at the DB layer — this is intended; callers must never mutate.

## 6. Testing strategy (TDD)

Unit (hive-mind-core, co-located `tests/mind/raw-archive.test.ts`):
1. `append` inserts a row; returns `created:true` + a stable uid = sha256(content).
2. `append` is idempotent — second identical content → `created:false`, same uid, one row.
3. append-only triggers — direct `UPDATE`/`DELETE` on `raw_archive` throws.
4. injection content is **stored** (zero-loss) with `injection_flagged=1` + flags populated.
5. full content survives — a >10K-char content stores untruncated (vs the frame's 10K cap).
6. `reconstructSource(frameId)` round-trips: append → create frame with `metadata.archiveUid` → reconstruct returns the row; returns `undefined` for an unlinked frame.
7. `list` / `count` paging + source filter.
8. migration: a pre-existing DB (no `raw_archive`) gains the table + triggers idempotently on boot.

Integration (server, `tests/local/harvest-*.test.ts` sibling): one harvest item produces (a) a raw_archive row, (b) a summary frame whose `metadata.archiveUid` resolves to that row, (c) re-import is idempotent (no duplicate archive row).

## 7. Risk & SOTA safety

- **No retrieval-path change.** `raw_archive` is not in any search/scoring query; frames are unchanged in shape. The 87.66% LoCoMo number cannot move. No LoCoMo re-run required.
- **Hot-table safety.** Zero schema change to `memory_frames`; the link uses the existing `metadata` column. The `idx_frames_content_hash` boot-order regression (2026-06-12) does not apply — `raw_archive` is a standalone table with no dependency on a guarded ADD COLUMN.
- **Storage growth** is the accepted tradeoff (same posture the founder already ratified for raw-turns, 2026-06-11). Archive stores full content once per unique item.

## 8. OSS sync note (§7.5)

`raw_archive` is **generic provenance substrate** (like `ai_interactions`, which is EU-AI-Act-framed yet **not** in the OSS-excluded list) — *not* Waggle-proprietary governance like `install_audit`. So it is **OSS-bound**: it should forward-port to `marolinik/hive-mind` in the next curated regeneration. Built in the monorepo first per §7.5; the OSS mirror is regenerated separately by the maintainer. No mirror edit in this arc. Flag for the next `oss-drift-check.sh` pass.

## 9. Out of scope / follow-ups (tracked, not built)

- MCP harvest entry points (`memory-mcp`, `hive-mind-mcp-server`) — same one-line `append` wiring.
- 4-pass `HarvestPipeline` distilled frames (where item attribution is lost in synthesis) — those persist via a different path; linking them needs pipeline itemId preservation. Not on the server route (which doesn't run the pipeline for its frames).
- Memory-Center "view original source" UI button over `reconstructSource`.
- Retention / GDPR-erasure tombstone flow for the archive.
