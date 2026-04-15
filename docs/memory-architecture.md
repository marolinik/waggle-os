# Memory Architecture — Waggle OS

**Audience:** Internal engineers and contributors touching `packages/core/src/mind/` or the agent recall path.
**Scope:** How memory is stored, searched, scored, and recalled — grounded in the source, not in CLAUDE.md.
**Status:** Current as of April 15, 2026. Schema version `1`.

> **Path discrepancy fixed:** An earlier revision of CLAUDE.md §2 listed memory-layer files (`frames.ts`, `awareness.ts`, etc.) at the top level of `packages/core/src/`. They actually live in `packages/core/src/mind/`. Corrected in the commit that promoted this doc.

---

## 1. Ten-second summary

A single SQLite database per mind (`better-sqlite3` + `sqlite-vec`, WAL mode, FK on) holds every memory layer. One file per mind, one schema, loaded via `MindDB`. Five cooperating layers sit on top of that database:

1. **Identity** — single-row table. Who this mind is.
2. **Awareness** — ≤10 rolling items. What this mind is working on right now.
3. **Frames** — append-only event log. Everything this mind has learned, as I/P/B frames grouped by GOP.
4. **Knowledge Graph** — entities and relations with temporal validity. The structured distillation of the frame log.
5. **Hybrid Search** — FTS5 + `vec0` fused via Reciprocal Rank Fusion, re-ranked by a configurable scoring profile.

Additional tables in the same DB: sessions (GOP → project mapping), improvement signals, install audit, procedures (GEPA-optimized templates), AI interactions (EU AI Act Art. 12), execution traces, evolution runs, harvest sources. Those are subsystems; the five above are the memory substrate.

Agents consume this through one function: `Orchestrator.recallMemory(query, limit)` — invoked on every user turn, fused across personal and workspace minds.

---

## 2. Storage substrate: `MindDB`

**File:** `packages/core/src/mind/db.ts`

```ts
export class MindDB {
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    const vecPath = process.env.WAGGLE_SQLITE_VEC_PATH;
    if (vecPath) this.db.loadExtension(vecPath);
    else sqliteVec.load(this.db);
    this.initSchema();
  }
}
```

Three facts to remember:

- **WAL mode is on.** Readers don't block writers. Don't turn it off.
- **`sqlite-vec` is loaded either from `WAGGLE_SQLITE_VEC_PATH` or the npm package.** The env-var override is the desktop-build path — Tauri bundles the native `.dll`/`.dylib` and the sidecar points at it. If you see "no such module: vec0" at runtime, the extension didn't load — check that env var.
- **Schema init is idempotent and runs migrations.** `initSchema` checks for the `meta` table. If absent: fresh DB, run `SCHEMA_SQL` + `VEC_TABLE_SQL`, write `schema_version = '1'`. If present: run `runMigrations()` (currently only adds the `source` column to `memory_frames` for pre-W2.1 databases).

Every layer class takes a `MindDB` and calls `db.getDatabase()` to get the raw `better-sqlite3` handle. There is no ORM. Every query is hand-written prepared SQL. That's a feature — it's a deliberate ~500 LOC of surface area, not 50k.

---

## 3. Schema at a glance

**File:** `packages/core/src/mind/schema.ts` — one `SCHEMA_SQL` string for the whole mind, plus a separate `VEC_TABLE_SQL` for the virtual table.

| Table | Role | Layer |
|---|---|---|
| `meta` | schema_version | infra |
| `identity` | single-row CHECK (id = 1) | 0 — Identity |
| `awareness` | ≤10 active items, category-constrained | 1 — Awareness |
| `sessions` | `gop_id` ↔ `project_id`, status | infra |
| `memory_frames` | I/P/B, gop_id, t, importance, source, access_count | 2 — Frames |
| `memory_frames_fts` | FTS5 shadow, `content_rowid='id'`, porter+unicode61 | 2 — Frames |
| `memory_frames_vec` | `vec0(embedding float[1024])` virtual | 2 — Frames |
| `knowledge_entities` | typed nodes with `valid_from`/`valid_to` | 3 — KG |
| `knowledge_relations` | typed edges, confidence, temporal | 3 — KG |
| `procedures` | GEPA prompt templates | 4 — Procedures |
| `improvement_signals` | recurring patterns, `(category, pattern_key)` unique | 5 |
| `install_audit` | capability install trust trail | 6 |
| `harvest_sources` | import sync state | 8 |
| `ai_interactions` | EU AI Act Art. 12 event log | 7 |
| `execution_traces` | agent run history, outcome, trace_json | 9 |
| `evolution_runs` | self-evolution proposals/outcomes | 10 |

Embedding dimensionality is pinned at **1024**, baked into the vec0 DDL. If you change it, you must rebuild every vec table and re-embed every frame. Don't change it without a migration.

---

## 4. Layer 0 — Identity

**File:** `packages/core/src/mind/identity.ts` — 73 LOC.

```sql
CREATE TABLE identity (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name, role, department, personality, capabilities, system_prompt,
  created_at, updated_at
);
```

One row. Primary key forced to 1 via CHECK. `IdentityLayer` exposes `create`, `get`, `exists`, `update`, and `toContext()`. The `toContext()` output is pasted directly into the system prompt under `# Identity` (see §8).

Everything but `name` defaults to empty string. A bare `name` is enough to have an identity. Token budget target: <500 tokens (per schema comment).

---

## 5. Layer 1 — Awareness

**File:** `packages/core/src/mind/awareness.ts` — 170 LOC.

Working memory. Volatile, small, priority-ordered.

```sql
CREATE TABLE awareness (
  id, category CHECK IN ('task','action','pending','flag'),
  content, priority, metadata, created_at, expires_at
);
```

Hard cap: `MAX_ITEMS = 10`. `getAll()` and `getByCategory()` both apply `LIMIT 10`. `expires_at` is honored in every read query (`expires_at IS NULL OR expires_at > datetime('now')`).

Two things worth knowing:

- **`ensureMetadataColumn()` runs in the constructor** — PRAGMA-inspects the table and runs `ALTER TABLE ... ADD COLUMN metadata` if it's missing. This is the graceful-upgrade path for pre-metadata databases. If you ever see the metadata column missing on a new DB, something went wrong in `schema.ts`.
- **`getByStatus(status)` is an in-memory filter over parsed metadata JSON.** Each awareness item stores its own JSON blob — there's no index on status. Fine because `MAX_ITEMS = 10`.

`toContext()` groups active items by category (Active Tasks, Recent Actions, Pending Items, Context Flags) — this is what gets surfaced in the agent's self-awareness section of the system prompt.

---

## 6. Layer 2 — Frames

**File:** `packages/core/src/mind/frames.ts` — 377 LOC. This is the heart.

### 6.1 Data model

```sql
CREATE TABLE memory_frames (
  id, frame_type CHECK IN ('I','P','B'),
  gop_id, t, base_frame_id REFERENCES memory_frames(id),
  content, importance CHECK IN ('critical','important','normal','temporary','deprecated'),
  source CHECK IN ('user_stated','tool_verified','agent_inferred','import','system'),
  access_count, created_at, last_accessed
);
```

Three frame types:

- **I-frame (Index)** — full-content snapshot. Standalone. No base.
- **P-frame (Patch)** — incremental update referencing an I-frame via `base_frame_id`. Requires the base to reconstruct full state.
- **B-frame (Branch/reference)** — alternative to a frame without replacing it. Points at another frame via `base_frame_id`.

`gop_id` is the Group-of-Pictures identifier — a session/conversation/topic bucket. `t` is the monotonically-increasing sequence number within a GOP. The `(gop_id, t)` index is the primary scan path for reconstructing a GOP's history.

### 6.2 Frame lifecycle

Create, read, update, delete, reconstruct, compact. The three creates:

- `createIFrame(gopId, content, opts)` — `INSERT` with `frame_type='I'` and `base_frame_id=null`. Assigns `t` = `MAX(t)+1` for the GOP.
- `createPFrame(gopId, baseFrameId, content, opts)` — asserts the base is an I-frame in the same GOP before inserting.
- `createBFrame(gopId, referencedFrameId, content, opts)` — branch/alternative on any base.

Every insert triggers FTS indexing (`INSERT INTO memory_frames_fts(rowid, content)`) and — if an embedder is configured — vector indexing via `HybridSearch.indexFrame`. Vector indexing is wrapped in try/catch because `memory_frames_vec` may not exist in older DBs.

### 6.3 Reconstruction

`reconstructState(gopId)` returns a `ReconstructedState`:

```ts
{ iFrame: MemoryFrame, patches: MemoryFrame[], currentContent: string, frameCount: number }
```

Logic:

1. Find the most recent I-frame in the GOP.
2. Pull every P-frame with `base_frame_id = iFrame.id`, ordered by `t`.
3. Apply patches in order (current implementation concatenates — see §6.6 "Known rough edges").

### 6.4 Compaction

`compact({ deleteTempOlderThan = 30, deleteDeprecatedOlderThan = 90, compactPFramesWhen = 10 })`:

- Delete `temporary` frames older than 30 days.
- Delete `deprecated` frames older than 90 days.
- Per GOP: if P-frames on the current I-frame ≥ 10, merge them into a new I-frame and delete all but the **5 most recent** P-frames. (The recent tail is kept so branches still have something to diff against.)

This is designed to be run nightly or on-demand. It's not automatic.

### 6.5 Deduplication

`findDuplicate(content)` computes `SHA-256(content.trim())` and checks against the last 500 frames. Returns the frame ID if found, null otherwise. Callers should use this before `createIFrame` on import paths (Memory Harvest does).

Trim-stable hash means trailing/leading whitespace won't spawn duplicates. Case-sensitive, punctuation-sensitive. If you want semantic dedup, that's what vector search and `contradiction-detector.ts` are for — don't touch this.

### 6.6 Known rough edges

- **Patch application is string concatenation**, not a real diff. P-frames say "here's more" rather than "here's what changed at line N." Fine for the current usage (each P-frame is a new fact on top of the index), but it means you can't use P-frames to *retract* or *correct* — use `update()` on the I-frame or mark deprecated.
- **Vector indexing uses rowid-literal SQL** (see §7.2) because sqlite-vec cannot parameterize rowid. If you add a new insert path, remember to mirror the FTS + vec writes.
- **Access count updates** are best-effort — they happen on read paths, not inside a transaction. Under concurrent readers the count can drift; that's acceptable because it only feeds a log-scaled popularity score.

---

## 7. Layer 3 — Hybrid Search

**File:** `packages/core/src/mind/search.ts` — 255 LOC.

### 7.1 Top-level shape

```ts
class HybridSearch {
  async search(query, opts?: SearchOptions): Promise<SearchResult[]>
  async keywordSearch(query, opts?): Promise<...>
  async vectorSearch(query, opts?): Promise<...>
  async indexFrame(frame): Promise<void>
  async indexFramesBatch(frames): Promise<void>
}
```

`SearchOptions`: `limit`, `gopId`, `profile` (scoring profile — see §7.3), `context` (graph distances from the KG), `since`, `until`.

`SearchResult`: `{ frame, rrfScore, relevanceScore, finalScore }`.

### 7.2 The fusion

```
keyword results (FTS5)  ─┐
                         ├─►  RRF (K=60)  ─►  re-rank via computeRelevance  ─►  finalScore = rrfScore * relevanceScore
vector results (vec0)   ─┘
```

`const RRF_K = 60` at the top of the file — the canonical RRF constant, well-attested in the IR literature. Don't tune it without a reason.

Keyword path:

- Strip a hardcoded ~60-word stop-word list ("the", "is", "of", …) from the query.
- Build an **OR-joined** MATCH expression (`term1 OR term2 OR …`). We do not require all terms — memory queries are too short and ad-hoc for AND-matching to be useful.
- `SELECT rank FROM memory_frames_fts MATCH ? ORDER BY rank LIMIT ?`.
- Join back to `memory_frames` to hydrate the row.

Vector path:

- Embed the query via the injected `Embedder`.
- `SELECT rowid, distance FROM memory_frames_vec WHERE embedding MATCH ? ORDER BY distance LIMIT ?`.
- Hydrate from `memory_frames` by rowid.

Both paths respect `gopId`, `since`, `until` filters.

**RRF:** for each frame appearing in either result list, `rrfScore += 1 / (RRF_K + rank)`. This is the rank-fusion line — don't reimplement it elsewhere.

### 7.3 Scoring profiles

**File:** `packages/core/src/mind/scoring.ts`

```ts
SCORING_PROFILES = {
  balanced:  { temporal: 0.4, popularity: 0.2, contextual: 0.2, importance: 0.2 },
  recent:    { temporal: 0.6, popularity: 0.1, contextual: 0.2, importance: 0.1 },
  important: { temporal: 0.1, popularity: 0.1, contextual: 0.2, importance: 0.6 },
  connected: { temporal: 0.1, popularity: 0.1, contextual: 0.6, importance: 0.2 },
};
```

Four signals, weighted:

- **Temporal:** full score for frames accessed in the last 7 days; exponential decay with 30-day half-life afterward.
- **Popularity:** `1 + log10(1 + access_count) * 0.1`. Log-scaled so a frame read 1000 times only beats a fresh one by ~0.3.
- **Contextual:** if the caller passed `graphDistances`, frames at BFS distance 0/1/2/3 from the query-relevant entities get scores 1.0/0.7/0.4/0.2. Otherwise 0.
- **Importance:** `critical=2.0, important=1.5, normal=1.0, temporary=0.7, deprecated=0.3` (these are the IMPORTANCE_WEIGHTS multipliers you'll see referenced across the codebase).

`finalScore = rrfScore * computeRelevance(frame, weights, context)`. Multiplicative on purpose — a frame with a rotten RRF score can't be saved by being important, and an important frame still needs to show up in one of the two index paths.

### 7.4 Indexing contract

Every `memory_frames` row should have a matching row in `memory_frames_fts` (rowid = frame id) and `memory_frames_vec` (rowid = frame id). If you write directly to `memory_frames` and skip `HybridSearch.indexFrame`, that frame is invisible to search. Don't do that.

`indexFramesBatch` exists for imports — uses a single transaction + `embedBatch` for throughput.

---

## 8. Layer 4 — Knowledge Graph

**File:** `packages/core/src/mind/knowledge.ts` — 265 LOC.

```sql
knowledge_entities(id, entity_type, name, properties, valid_from, valid_to, recorded_at)
knowledge_relations(id, source_id, target_id, relation_type, confidence, properties, valid_from, valid_to, recorded_at)
```

Two departures from a vanilla graph DB matter:

### 8.1 Bitemporal validity

`valid_from` and `valid_to` are the "when this was true" dimension. `recorded_at` is the "when we wrote it down" dimension. A fact that was true last month and is no longer true now sets `valid_to` to last month's date. Reads default to *current* ("valid_to IS NULL OR valid_to > now"). Historical queries can override.

`retireEntity(id)` and `retireRelation(id)` set `valid_to = datetime('now')`. We soft-delete. Hard-delete is only for schema violations.

### 8.2 Schema validation

`ValidationSchema` defines required properties and allowed relation types per entity type. Violations throw at insert time. This is the main reason entities are typed rather than free-form: catch bad data at write time, not at query time.

### 8.3 Traversal

`traverse(startId, depth)` is BFS, returns visited entity set. `bfsDistances(frameAnchoredEntityIds)` is the one that feeds `HybridSearch`'s contextual score — returns `Map<frameId, distance>` for the closest entity.

---

## 9. How the agent actually uses it

**File:** `packages/agent/src/orchestrator.ts`

### 9.1 System prompt assembly

`Orchestrator.buildSystemPrompt()` stitches three sections:

1. **Identity** (cached) — `this.identity.toContext()` under `# Identity`. Cache key is `'exists'|'empty'`.
2. **Self-awareness** (uncached) — `buildSelfAwareness(caps)` with tools, skills, memory stats, mode, version, and any actionable `improvementSignals`.
3. **Recent context** (uncached) — `loadRecentContext()` output under `# Context From Your Memory`.

The identity section is cached because it changes rarely. The other two are rebuilt every turn.

### 9.2 Recall path

`Orchestrator.recallMemory(query, limit = 10)` runs on every user turn.

Two modes:

- **Catch-up mode** — triggered by a regex match on the query ("catch me up", "where were we", "what did we decide", "brief me", "what's next", etc.). Bypasses semantic search. Goes straight to `memory_frames` and pulls:
  - up to `limit` frames with `importance IN ('critical','important')` OR `content LIKE 'Decision%'` OR `content LIKE '%decided%'`, ordered by importance then recency,
  - plus the 3 most recent non-deprecated, non-temporary frames for recency context,
  - deduplicated by first 100 chars of content.
  This is the right move: when a user says "catch me up," they want the important things, not the semantically-closest things. Literal text similarity will return recent small talk over last week's critical decision every time.
- **Normal mode** — `this.search.search(query, { limit, profile: 'balanced' })` on both the personal mind and the workspace mind (if present), fused into one result list with source attribution.

The returned `{ text, count, recalled? }` gets injected into the conversation as additional context before the model sees it.

### 9.3 Per-workspace minds

An agent instance can hold one personal mind + one workspace mind. Each is a full `MindDB` + layer stack. The workspace mind is scoped to a workspace; the personal mind is scoped to the user. `recallMemory` queries both. Frames written during a workspace session land in the workspace mind.

This is why the codebase has `FrameStore` and `HybridSearch` instantiated twice on the `Orchestrator` — once in the constructor for the personal mind, and again in `setWorkspace` for the workspace mind.

---

## 10. Embeddings

**Files:** `packages/core/src/mind/embedding-provider.ts`, `embeddings.ts`, `api-embedder.ts`, `inprocess-embedder.ts`, `litellm-embedder.ts`, `ollama-embedder.ts`.

### 10.1 The fallback chain

`createEmbeddingProvider({ provider: 'auto' })` probes in order:

```
inprocess  →  ollama  →  voyage  →  openai  →  mock
```

Each probe embeds the literal string `'waggle embedding probe'`, checks the dim count matches the target (1024), and either returns an active embedder or logs and moves on. The first one that works wins. If all fail, you get `createMockEmbedder(1024)` — a deterministic hash-to-floats stub that keeps the app running with degraded semantic search quality.

**Mock mode is not silent.** `getStatus().activeProvider === 'mock'` with `lastError` populated. If you're debugging weird search results, check that first.

### 10.2 Tier enforcement

`TIER_CAPABILITIES[tier].embeddingProviders` lists what a tier can use. Free gets inprocess+ollama (local only). Pro gets voyage+openai. Enterprise gets litellm. An explicitly-requested provider outside the tier throws `TierError`. In auto mode, disallowed providers are skipped.

### 10.3 Quota

Monthly embed count tracked in the `embedding_usage` table (`user_id, year_month, count`). `checkQuota(n)` before each call; `recordUsage(n)` after. Exceeding throws `EmbeddingQuotaExceededError` with tier + quota + current. 80% of quota logs a warn. Quota is only enforced if `quotaDb` is wired and `userTier` is explicitly set — local dev doesn't hit it.

### 10.4 Dimensionality

Hardcoded 1024 in `schema.ts` (`memory_frames_vec USING vec0(embedding float[1024])`). Every embedder normalizes to 1024 via truncation or zero-padding. If an embedder can't hit 1024, the probe fails and we move on.

---

## 11. Additional tables in the same DB (not "memory" but worth naming)

These share the `MindDB` but are not part of the five-layer stack:

- **`sessions`** — GOP registry. Every frame's `gop_id` must FK here. Sessions have `project_id`, `status`, `summary`.
- **`procedures`** — GEPA-optimized prompt templates with version, success_rate, avg_cost.
- **`improvement_signals`** — `(category, pattern_key)` unique; counts recurring corrections / capability gaps / workflow patterns. `surfaced` flag prevents re-nagging.
- **`install_audit`** — every capability install (native/skill/plugin/mcp) gets a row. risk + trust_source + approval_class + action.
- **`ai_interactions`** — EU AI Act Art. 12 event log. Every model call gets a row. Don't disable.
- **`execution_traces`** — per-run trace_json + outcome. Foundation for self-evolution.
- **`evolution_runs`** — the other half: proposed/accepted/rejected prompt/schema evolution runs with baseline vs. winner and gate verdict.
- **`harvest_sources`** — Memory Harvest sync state per source.

---

## 12. Conventions to follow when you extend this

1. **Hand-write SQL, use prepared statements, put the prepared statement in a method.** No ORM creep. Every `prepare()` call in `frames.ts`/`search.ts` can be traced back to one method.
2. **New tables go in `schema.ts`.** Add the `CREATE TABLE IF NOT EXISTS` there. If the schema shape changes, bump `SCHEMA_VERSION` and write a migration branch in `MindDB.runMigrations()`.
3. **New search sources feed RRF, not replace it.** If you add a third index path (say, a graph-walk index), fuse its results into the same RRF loop — don't build a parallel `search2()`.
4. **Importance + source are cheap. Use them.** Every frame writer should set `importance` honestly — `temporary` gets compacted in 30 days, `deprecated` in 90. `source` is enforced at insert time and feeds the trust model.
5. **Don't bypass `HybridSearch.indexFrame`.** Writing to `memory_frames` directly leaves frames invisible to search. There's no "rebuild index" script — it'd be expensive and slow, so don't rely on one.
6. **Every layer's `toContext()` goes into the system prompt.** Keep that output terse. Token budget for identity is <500 tokens; awareness is 10 items max. Don't inflate these.
7. **Schema version is a single string in `meta`.** If you break backwards compatibility, change both the version string and the migration path. Don't let the two drift.

---

## 13. Where to read next

- `packages/core/src/mind/reconcile.ts` — how conflicting frames get reconciled (not covered here).
- `packages/core/src/mind/ontology.ts` — the entity/relation type registry.
- `packages/core/src/mind/entity-normalizer.ts` — how raw strings become KG entities.
- `packages/core/src/mind/sessions.ts` — GOP lifecycle (open, close, summarize).
- `packages/agent/src/orchestrator.ts` lines 273–400 — the recall path end-to-end.
- `packages/core/src/harvest/pipeline.ts` — how Memory Harvest turns external sources into frames.

---

## 14. Changelog for this doc

| Date | Change | Owner |
|---|---|---|
| 2026-04-15 | Initial grounded deep-dive. Notes CLAUDE.md §1.3 path discrepancy (memory files live in `mind/`, not at top level of `packages/core/src/`). | Claude + Marko |
