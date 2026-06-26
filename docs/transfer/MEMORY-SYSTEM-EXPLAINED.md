# Waggle / hive-mind — The Memory System, Explained

**Audience:** A developer taking over Waggle OS who needs a working mental model of how the
agent remembers things — fast enough to be productive, deep enough to not break invariants.

**Status:** Written 2026-06-26 against `packages/hive-mind-core/src/{mind,harvest}` (the
substrate), `packages/agent/src` (cognify/recall wiring), `packages/server/src/local/routes`
(REST), and `packages/memory-mcp/src` (MCP surface).

> ⚠️ **Path warning up front.** The older `docs/memory-architecture.md` (April 2026) and one
> of the source-reader passes describe the substrate as living under `packages/core/src/mind/`.
> **That path no longer exists.** The memory substrate was moved to
> `packages/hive-mind-core/src/{mind,harvest}/` in the 2026-04-30 monorepo migration. Every
> file reference in this document points at the real, current location. See §8 for the full
> list of stale claims in the old doc.

---

## 1. Mental model

Waggle's memory is **one SQLite database per "mind"** (`better-sqlite3` + the `sqlite-vec`
extension, WAL mode, foreign keys on). A *mind* is either the user's **personal** mind
(always loaded) or a **workspace** mind (lazy-loaded when a workspace is active). Every memory
layer — identity, awareness, the frame event-log, the knowledge graph, embeddings, full-text
index, audit logs — lives as tables in that same file.

The unit of memory is a **frame**: an append-only, immutable record of something the agent
learned or did. Frames are deduplicated by content hash, embedded into a 1024-dim vector index,
mirrored into an FTS5 full-text index, and mined for typed **knowledge-graph entities**. At
recall time, a 10-lane retrieval pipeline pulls the most relevant frames (vector + keyword +
importance + date-window + raw-turn lanes), fuses and re-ranks them, and **appends the result
to the system prompt** before the LLM ever sees the user's message. The whole thing runs twice
per turn: **read before** (recall), **write after** (cognify).

```
                              WRITE PATH
  ┌──────────────┐   ┌──────────────┐   ┌────────────────────────────────────┐
  │ live turn    │   │ pattern      │   │ cognify():                         │
  │ user+asst    │──▶│ write-back   │──▶│  • createIFrame/PFrame (dedup'd)   │
  │ exchange     │   │ (30+ regex)  │   │  • extractEntities → KG upsert     │
  └──────────────┘   └──────────────┘   │  • co-occurrence + semantic rels   │
                                         │  • search.indexFrame() → vectors   │
  ┌──────────────┐   ┌──────────────┐   └──────────────────┬─────────────────┘
  │ bulk import  │   │ 4-pass       │                      │
  │ (ChatGPT,    │──▶│ harvest      │──────────────────────┤
  │ Claude,PDF…) │   │ pipeline     │   writes I/P/B frames │
  └──────────────┘   └──────────────┘                      ▼
                                         ┌────────────────────────────────────┐
                                         │  ONE SQLite DB (per mind)          │
                                         │  memory_frames ── content_hash idx │
                                         │  memory_frames_fts   (FTS5)        │
                                         │  memory_frames_vec   (sqlite-vec)  │
                                         │  memory_frame_chunks(_vec)         │
                                         │  knowledge_entities / _relations   │
                                         │  identity / awareness / sessions   │
                                         └────────────────────────────────────┘
                                                            ▲
                              READ PATH                     │
  ┌──────────────┐   ┌────────────────────────────────────┴───────────────┐
  │ user query   │   │ recallMemory(): 10-lane pipeline                    │
  │ (turn start) │──▶│  importance · semantic(BM25+vec via RRF) · date-    │
  └──────────────┘   │  window · profiles · facts · events · raw-detail ·  │
                     │  catch-up · workspace/personal split                │
                     └──────────────┬─────────────────────────────────────┘
                                    ▼
       cross-encoder rerank → scoring (recency/importance/popularity/context)
                                    ▼
       dedup by frame-id → injection scan (all-or-nothing) → formatted text
                                    ▼
       APPENDED to system prompt:  [recalled memories] + [system prompt] + [user query]
                                    ▼
                                  LLM
```

---

## 2. The core data model

### What a "frame" is

A `MemoryFrame` is one immutable row in `memory_frames`. It is the atom of memory. Three kinds:

| Frame type | Meaning | `base_frame_id` |
|---|---|---|
| **I** (Index) | Full snapshot / initial fact. One per GOP to start. | `null` |
| **P** (Patch) | Incremental append referencing an I-frame; applied in `t` order. **String concatenation, not a real diff — P-frames can only add, never retract.** | the I-frame's id |
| **B** (Branch) | Alternative to a frame without replacing it; allows divergent histories. Content serialized as JSON `{description, references[]}`. | the branched frame's id |

A **GOP** ("Group of Pictures", borrowed from video codecs) is a session/conversation; `gop_id`
is a FK to `sessions.gop_id`, and `t` is a monotonic logical timestamp **within** that GOP.

Key columns: `id, frame_type, gop_id, t, base_frame_id, content, importance, source,
access_count, created_at, last_accessed, content_hash, metadata`.

- **importance** ∈ `critical | important | normal | temporary | deprecated`
- **source** ∈ `user_stated | tool_verified | agent_inferred | import | system` — these are the **only 5** the SQL `CHECK` permits (`schema.ts:57`). ⚠️ The TypeScript `FrameSource` type (`frames.ts:25`) over-declares 3 more (`personal | workspace | team_sync`) that the DB would **reject at insert**; `server/src/local/index.ts:1333` actually passes `'team_sync'` — a latent constraint-violation bug. Fix by widening the CHECK or correcting the call site.
- **content_hash** = `SHA256(stripHmPrefix(content).trim())` — the provenance-insensitive dedup key
- **metadata** = JSON `TEXT` (`NOT NULL DEFAULT '{}'`); never full-text indexed; carries the
  Phase-2B "Memory Center" contract (kind/status/scope/tags/confidence/trace_id/…)

### How the layers relate

| Layer | Table(s) | Shape | Role |
|---|---|---|---|
| **Frames** | `memory_frames` | append-only I/P/B log | The substrate of truth — everything learned |
| **Vectors** | `memory_frames_vec`, `memory_frame_chunks_vec` | `vec0` virtual tables, **1024-dim** | Semantic search; `rowid` = frame id (or chunk id) |
| **Full-text** | `memory_frames_fts` | FTS5 virtual table | Keyword (BM25) search; must stay in sync with frames |
| **Chunks** | `memory_frame_chunks` (+ `_vec`) | per-frame paragraph chunks, `ON DELETE CASCADE` | Chunk-level retrieval for long frames |
| **Knowledge graph** | `knowledge_entities`, `knowledge_relations` | typed nodes + directional typed edges, **bitemporal** | Structured distillation of frames (person/project/file/…) |
| **Identity** | `identity` | single row, `CHECK(id=1)` | Who the agent is — injected into prompt, never a frame |
| **Awareness** | `awareness` | ≤10 rolling items, expiry-aware | What it's working on *right now* — injected, never a frame |
| **Sessions** | `sessions` | GOP → project container | Groups frames; `memory_frames.gop_id` → `sessions.gop_id` |
| **Audit (append-only)** | `install_audit`, `ai_interactions` | DDL-triggered immutable | EU AI Act compliance; DB *refuses* DELETE/UPDATE |
| **Concept mastery** | `concept_mastery` | spaced-repetition rows | Orthogonal learning tracker — **not linked** to frames or KG |

Identity and awareness are **out-of-band layers**: they format themselves into markdown via
`toContext()` for prompt inclusion, but are never serialized as `MemoryFrame` records. Only
memory *content* (facts, events, profiles, decisions) becomes frames.

---

## 3. The WRITE path

There are **two entry points** that produce frames: live cognify (during a turn) and bulk
harvest (importing external corpora). Both converge on `FrameStore.createIFrame/createPFrame`
and the same content-hash dedup.

### (a) Live cognify — during an agent turn

Fires **after** the agent loop succeeds (never on failure, so error traces don't become
"ground truth"). Entry point in the chat route:

```
packages/server/src/local/routes/chat.ts:1456
  const saved = await sessionOrch.autoSaveFromExchange(message, result.content, { traceId });
```

1. **Pattern write-back** — `autoSaveFromExchange()` (`orchestrator.ts:839`) delegates to
   `runPatternWriteBack()` (`pattern-write-back.ts`), which runs **30+ calibrated regexes** over
   the (user, assistant) exchange:
   - Preferences (`"I prefer"`, `"call me"`, `"from now on"`), corrections (`"actually no"`,
     `"that's wrong"`), decisions (`"let's go with"`, `"decided to"`), findings
     (`"discovered that"`, `"turns out"`), style signals (`"keep it brief"`, `"bullets"`).
   - Casual chatter (`"lunch"`, `"weather"`, `"thanks"`) is **intentionally skipped**.
   - **Routing:** preferences/corrections/style → **personal** mind; decisions/findings/
     work-output → **workspace** mind (or personal if no workspace active).
2. **Cognify pipeline** — each surviving snippet runs `cognify()` (`cognify.ts:52`):
   1. Frame creation: I-frame if none exists for the GOP, else P-frame.
   2. `extractEntities(content)` → persons/orgs/products/concepts.
   3. `upsertEntities()` → reuse existing entity id on case-insensitive **type+name** match, else create.
   4. Co-occurrence relations: all-pairs `co_occurs_with` (strength 0.8) among entities in the same text.
   5. Semantic relations: `extractRelations()` finds `led_by`/`reports_to`/`depends_on`/… and upserts edges.
   6. `search.indexFrame(frameId, content)` → embeds + writes the vector row.
   7. Optional `MemoryLinker.findRelated()` → related-frame links.
3. **Signal commit** — `commitSurfacedSignals()` (`chat.ts:1447`) marks M8 awareness signals
   "surfaced" so they don't re-show next turn.

### (b) Bulk harvest — importing external corpora

`HarvestPipeline.run()` (`harvest/pipeline.ts:100`) converts ChatGPT/Claude/Gemini exports,
Markdown, PDFs, and URLs into frames + KG entities via a 4-pass distillation:

```
External source ─▶ Adapter ─▶ UniversalImportItem ─▶ Pass0..4 ─▶ DistilledKnowledge ─▶ Frames+KG
```

- **Stage 1 — Adapter parsing.** Each source has an adapter (`claude-adapter.ts`,
  `markdown-adapter.ts`, `pdf-adapter.ts`, …) normalizing wildly different formats into a
  `UniversalImportItem` (`id, source, type, title, content, messages[]`). Adapters use
  `raw-types.ts` helpers (`asRecord`, `getString`) to safely narrow untrusted JSON.
- **Stage 2 — Injection scan (Pass 0).** Every item is scanned (`pipeline.ts:111`) with
  `scanForInjection(probe, 'tool_output')` over title + first 4KB **before any LLM touches it.**
  Hostile items are dropped entirely.
- **Stage 3 — 4-pass distillation:**
  - **Pass 1 Classify** (Haiku, cheap, batches of 20): assigns `value` (skip/low/medium/high)
    + domain. `value='skip'` items (greetings, loops) never reach Pass 2.
  - **Pass 2 Extract** (Sonnet): decisions/preferences/facts/knowledge/entities/relations.
  - **Pass 3 Synthesize** (Sonnet): maps to `DistilledKnowledge` with `targetLayer`
    (identity/frame/kg_entity/kg_relation) + importance + confidence + provenance.
  - **Pass 4 Dedup** (local, no LLM — `dedup.ts:70`): see below.
- **Stage 4 — Frame writing:**
  - `writeRawTurnFrames()` (`raw-turns.ts:112`): each user/assistant message stored as
    `[mind-rawturn conv:KEY turn:N speaker:S]` frame for adjacency lookups (system messages skipped).
  - `writeMemoryLaneFrames()` (`extract-memory-lanes.ts:288`): three parallel lanes —
    `[mind-fact]` (importance normal), `[mind-event] [YYYY-MM-DD]` (date resolved from a relative
    cue against the session date), `[mind-profile NAME]` (**replace-on-update** — old profile for
    that speaker deleted first, unlike facts which accumulate).
  - `writeKgEntities()` (`extract-kg-entities.ts:230`): exact-name dedup, bump `seen_count` on hit.
  - Every extraction output is **injection-scanned again** before write (verbatim dialogue is the
    most injection-prone surface).

### Deduplication (shared by both paths)

- **Frame-level (`FrameStore.findDuplicate`, `frames.ts:264`):** O(1) indexed lookup —
  `SELECT … WHERE content_hash = SHA256(stripHmPrefix(content).trim())`. If found, `touch()` the
  existing frame (bump access count) and skip insertion. `stripHmPrefix` removes the
  `[hm session:… src:…]` metadata prefix so the *same turn captured from two different sources
  collapses into one frame*. This hash is shared by insert, dedup lookup, update, compaction, and
  backfill so the semantics never drift.
- **Harvest-level (`dedup.ts:70`):** two-tier — (1) exact SHA256 on normalized content, then
  (2) fuzzy trigram similarity (threshold 0.75) against existing content. Contradictions
  (similarity 0.4–0.75 + importance `important`) are **logged but still written** — the caller
  decides policy.

---

## 4. The READ path

`Orchestrator.recallMemory(query, limit, opts)` (`orchestrator.ts:453–831`) runs at the start
of every turn (`chat.ts:767`) and returns `{ text, count, recalled, recalledFrames }`. It is
**not** simple keyword search — it's a 10-lane pipeline:

1. **Catch-up detection.** Regex on the query (`"catch me up"`, `"where were we"`,
   `"what did we decide"`, `"brief me"`, …) → switches to an **importance-based fetch** instead
   of semantic search (catch-up should return *important* things, not semantically-close small
   talk). **This lane skips the reranker.**
2. **Importance lane (K=5).** Critical/Important frames surface on *every* query.
3. **Semantic search.** `HybridSearch.search()` runs FTS5 (BM25, stop-words stripped, OR-MATCH)
   and `vec0` vector distance **in parallel**, fused via **Reciprocal Rank Fusion (RRF, K=60)**.
4. **Date-window lane.** If the query names a period (`"in May 2026"`), `parseDateWindow(query)`
   (`parse-date-window.ts`) produces `since`/`until` SQL filters.
5. **Profile lane** — `[mind-profile]` frames.
6. **Facts lane** — `[mind-fact]` frames, capped 60, oldest-first.
7. **Events lane** — `[mind-event]` frames, chronological, capped 40; a dedicated "Events during
   X" section for windowed queries.
8. **Raw-detail lane** — verbatim `[mind-rawturn]` excerpts, reranked via the cross-encoder
   (`raw-detail-lane.ts`, `inprocess-reranker.ts`).
9. **Workspace / personal split** — active mind renders **first** (visual precedence;
   `orchestrator.ts:692` workspace, `:700` personal).
10. **Injection scan (all-or-nothing)** — `scanForInjection(joinedLines, 'tool_output')`
    (`orchestrator.ts:777`). On a poisoned hit the **entire** recall returns empty. No partial recall.

**Fusion → rerank → scoring.** After RRF, results are re-ranked. The optional **cross-encoder
reranker** (`inprocess-reranker.ts`) soft-fails back to RRF ordering if unavailable. Final
ranking applies `computeRelevance()` (`scoring.ts`), four signals weighted by a **profile**
(`balanced | recent | important | connected`):

| Signal | How it scores |
|---|---|
| **temporal** | 7-day full strength, ~30-day half-life decay |
| **popularity** | `log10` of `access_count` (1000× difference ≈ 0.3 score delta) |
| **contextual** | KG BFS distance 0/1/2/3 → 1.0/0.7/0.4/0.2 — **currently 0 in production** (see gotchas) |
| **importance** | critical 2.0 / important 1.5 / normal 1.0 / temporary 0.7 / deprecated 0.3 |

`finalScore = rrfScore × relevanceScore`.

**Recall-context assembly & prompt injection.** The lanes are merged, deduped **by frame id**,
the `TEMPORAL_GUIDANCE` constant is bundled in (`orchestrator.ts:808`), and the block is returned
as text. The chat route then does:

```
chat.ts:776   recalledContext = '\n\n' + recall.text;
chat.ts:905   systemPrompt = … orch.buildSystemPrompt() … (assembled ? '' : recalledContext);
```

producing the sandwich **`[recalled memories] + [system prompt] + [user query]`**. Crucially,
**recall is NOT part of `buildSystemPrompt()`** — it's appended separately. The exception:
if **PromptAssembler** is enabled, the assembler embeds recall internally (`chat.ts:887`) and the
route skips the manual append.

`buildSystemPrompt()` itself (`orchestrator.ts:301`) assembles three *other* sections: identity
(cached by content hash), self-awareness (improvement signals, uncached), and preloaded recent
context (uncached).

---

## 5. Layers reference

### 5.1 Storage & schema
- **Purpose:** the SQLite substrate — frames, embeddings, FTS, KG, audit, dedup, migrations.
- **Files:** `mind/db.ts`, `mind/schema.ts`, `mind/frames.ts`, `mind/content-hash.ts`, `mind/chunker.ts`
- **Key functions:** `MindDB` ctor (loads `sqlite-vec`, WAL, FK, `initSchema`), `MindDB.initSchema`
  (idempotent: SCHEMA_SQL + VEC_TABLE_SQL on fresh DB, else `runMigrations`), `MindDB.runMigrations`
  (crash-recovery + guarded `ADD COLUMN` + content-hash backfill + append-only triggers),
  `FrameStore.createIFrame/createPFrame/createBFrame`, `FrameStore.findDuplicate`,
  `FrameStore.update` / `delete` / `touch`, `hashFrameContent` / `stripHmPrefix`, `chunkText`.
- **Chunking:** `chunkText()` (`chunker.ts:58`) splits on blank lines, greedily aggregates
  paragraphs to ≤2000 chars, sub-splits oversized paragraphs on sentence boundaries, applies
  200-char overlap, and preserves **absolute** `charStart`/`charEnd` relative to the parent frame.

### 5.2 Retrieval (hybrid search + scoring)
- **Purpose:** fuse keyword + vector, re-rank by profile.
- **Files:** `mind/search.ts`, `mind/scoring.ts`, `mind/inprocess-reranker.ts`,
  `mind/parse-date-window.ts`, `mind/raw-detail-lane.ts`, `mind/recall-context.ts`,
  `mind/resolve-relative-date.ts`
- **Key functions:** `HybridSearch.search` (FTS5 + vec0 → RRF K=60 → `computeRelevance`),
  `HybridSearch.indexFrame` (**must** be called on every frame insert), `computeRelevance`,
  `parseDateWindow`.

### 5.3 Knowledge graph & semantic layers
- **Purpose:** typed entities + temporal relations distilled from frames; canonicalization.
- **Files:** `mind/knowledge.ts`, `mind/ontology.ts`, `mind/entity-normalizer.ts`,
  `mind/concept-tracker.ts`, `harvest/extract-kg-entities.ts`
- **Key functions:** `KnowledgeGraph.findEntityByName` (**exact, case-sensitive** — the dedup
  primitive), `KnowledgeGraph.searchEntities` (fuzzy LIKE — *not* for dedup), `dedupeByName`
  (merge by `normalizeEntityName(name)::type`, survivor = most-relations / lowest-id, repoint
  edges, retire dups, sum `seen_count`), `traverse` (BFS one edge type), `bfsDistances`,
  `retireEntity` (soft-delete via `valid_to=now()`), `normalizeEntityName`
  (`js→javascript`, `postgres→postgresql`, `k8s→kubernetes`), `isNoiseName`,
  `ConceptTracker.recordAnswer`/`getDueForReview`.
- **Bitemporal:** both entities and relations carry `valid_from`/`valid_to`; `valid_to IS NULL`
  = active. Nothing is hard-deleted; rows are *retired* for audit history.

### 5.4 Identity / Awareness / Sessions
- **Purpose:** persistent agent identity, volatile working memory, and conversation containers —
  all feeding the prompt without being frames.
- **Files:** `mind/identity.ts`, `mind/awareness.ts`, `mind/sessions.ts`,
  `agent/src/orchestrator.ts`, `agent/src/context-loader.ts`
- **Key functions:** `IdentityLayer.update` (column allowlist for SQLi defense) / `toContext`,
  `AwarenessLayer.add` / `getAll` (≤10, priority DESC, expiry via SQL WHERE) / `updateMetadata`
  (shallow JSON merge) / `toContext`, `SessionStore.ensureActive` (transaction + `id DESC`
  tiebreaker for same-second races) / `ensure` (idempotent for harvest), `loadRecentContext`.
- **Cross-workspace rule:** identity is **always** from the personal mind; awareness is **merged**
  (personal first); frames/KG switch to the workspace mind when one is active.

### 5.5 Embeddings
- **Purpose:** multi-tier provider fallback with tier-gating, quota, and an embedder-lock. See §6.
- **Files:** `mind/embedding-provider.ts`, `mind/embeddings.ts`, `mind/inprocess-embedder.ts`,
  `mind/ollama-embedder.ts`, `mind/api-embedder.ts`, `mind/litellm-embedder.ts`
- **Key functions:** `createEmbeddingProvider`, `probeProvider`, `createInProcessEmbedder`,
  `ensureEmbeddingFingerprint` (the embedder-lock), `recreateVecTables` (destructive),
  `normalizeDimensions`, `maxEmbedCharsForModel`, `reembedPerText`.

### 5.6 Harvest / ingestion
- **Purpose:** turn external conversations/docs into frames + KG via 4-pass distillation. See §3(b).
- **Files:** `harvest/pipeline.ts`, `harvest/types.ts`, `harvest/dedup.ts`, `harvest/raw-turns.ts`,
  `harvest/extract-memory-lanes.ts`, `harvest/extract-kg-entities.ts`, plus per-source adapters
  (`claude-adapter.ts`, `chatgpt-adapter.ts`, `gemini-adapter.ts`, `markdown-adapter.ts`,
  `pdf-adapter.ts`, `url-adapter.ts`, `plaintext-adapter.ts`, `perplexity-adapter.ts`,
  `claude-code-adapter.ts`, `universal-adapter.ts`).
- **Key functions:** `HarvestPipeline.run`, `dedup`, `writeRawTurnFrames`, `extractMemoryLanes`,
  `writeMemoryLaneFrames`, `extractKgEntities`, `writeKgEntities`.

### 5.7 Cognify (live write wiring)
- **Purpose:** passively learn from each turn; the live read+write loop inside the agent.
- **Files:** `agent/src/cognify.ts`, `agent/src/orchestrator.ts`, `agent/src/pattern-write-back.ts`,
  `agent/src/entity-extractor.ts`, `server/src/local/routes/chat.ts`
- **Key functions:** `recallMemory`, `buildSystemPrompt`, `cognify`, `autoSaveFromExchange`,
  `commitSurfacedSignals`, `upsertEntities`, `createCoOccurrenceRelations`, `createSemanticRelations`.

### 5.8 API / MCP surface
- **Purpose:** dual external surface — REST for the UI, MCP tools for Claude agents/clients.
- **REST files:** `server/src/local/routes/memory.ts` (`/api/memory/search`, `/api/memory/frames`,
  `/api/memory/stats`), `memory-center.ts` (Phase-2B `/api/memory` CRUD + merge + archive + trace),
  `identity.ts` (`/api/identity`), `knowledge.ts` (`/api/memory/graph`).
- **MCP files:** `memory-mcp/src/tools/{memory,identity,awareness,knowledge,wiki,harvest,workspace,
  cleanup,ingest}.ts`, `memory-mcp/src/resources/memory.ts`, `memory-mcp/src/core/setup.ts`.
- **Key functions:** `normalizeToMemory` (projects a frame + its JSON metadata blob into the shared
  `Memory` entity), `save_memory` / `recall_memory` (MCP), `getWorkspaceMind` (lazy per-workspace
  `MindDB`), `POST /api/memory/:id/merge` (C11: concatenate + archive originals, never hard-delete).

---

## 6. Embedding provider chain & the embedder-lock rule

**Why it matters operationally:** if the embedding model changes, the vector index silently
becomes meaningless or the DB refuses to boot. The system guards this aggressively.

**Resolution chain** (`embedding-provider.ts`, auto-probe in strict order, halts at first working):

```
inprocess ─▶ ollama ─▶ voyage ─▶ openai ─▶ litellm ─▶ mock
```

| Provider | What it is | Notes |
|---|---|---|
| **inprocess** | `Xenova/all-MiniLM-L6-v2` via `@huggingface/transformers` | 384 native dims → normalized to 1024; ~23 MB, cached in `~/.waggle/models/`, **offline** |
| **ollama** | POST `localhost:11434/api/embed`, `nomic-embed-text` | 30 s timeout |
| **voyage** | POST `api.voyageai.com`, `voyage-3-lite` | needs API key; 15 s timeout |
| **openai** | POST `api.openai.com`, `text-embedding-3-small` | needs API key; 15 s timeout |
| **litellm** | proxy `/v1/embeddings` | optional Bearer; no explicit timeout |
| **mock** | deterministic byte-hash → Float32Array | **zero semantic value**, last resort |

- **Tier enforcement:** `TIER_CAPABILITIES[tier].embeddingProviders` gates which providers a user
  may reach; non-allowed providers are skipped during auto-probe. Only active when `userTier` is
  passed; `WAGGLE_EVAL_MODE=1` disables tier gates entirely (eval-harness measurement validity).
- **Quota:** monthly count in `embedding_usage` (`user_id`, `year_month`, `count`); `checkQuota()`
  throws `EmbeddingQuotaExceededError`; resets at UTC month boundary.
- **Char capping:** `maxEmbedCharsForModel()` caps inputs (6K default, 8K for `*-8k` models) by
  model-NAME heuristic — *not* measured context. (D1 probe finding: `nomic-bert` has a hard
  2048-token limit despite its name.)
- **Batch resilience:** on a batch embed failure, `reembedPerText()` retries one input at a time
  and degrades only the failing inputs to mock — the rest keep real vectors.

### The embedder-lock (fingerprint guard)

`ensureEmbeddingFingerprint()` (`db.ts`) runs on the first vector op and records
`{provider, model, dim}` in the `meta` table. On subsequent ops:

| Condition | Result |
|---|---|
| same dim, same model | OK (`match`) |
| same dim, **different model** | update meta + **warn** (`model-changed`). Vectors stay numerically valid; cross-model semantic similarity is *degraded*, not undefined. |
| **different dim** | **throws `EmbeddingDimMismatchError`** — `vec0` virtual tables cannot be `ALTER`ed. |

**Remediation for a dimension change is destructive:** `MindDB.recreateVecTables(newDim)` DROPs
both vec tables and reinitializes, after which **every frame must be re-embedded.** Treat
`1024` as effectively load-bearing.

---

## 7. Where it lives & how to call it

### File map

```
packages/hive-mind-core/src/
├── mind/                     ← the substrate (per-mind SQLite + layers)
│   ├── db.ts schema.ts       MindDB, migrations, append-only triggers
│   ├── frames.ts             FrameStore (I/P/B CRUD, dedup, compaction)
│   ├── content-hash.ts       hashFrameContent / stripHmPrefix
│   ├── chunker.ts            semantic paragraph chunking
│   ├── search.ts scoring.ts  HybridSearch (RRF) + computeRelevance
│   ├── inprocess-reranker.ts cross-encoder rerank (soft-fail)
│   ├── parse-date-window.ts resolve-relative-date.ts  temporal lanes
│   ├── raw-detail-lane.ts recall-context.ts           recall assembly
│   ├── knowledge.ts ontology.ts entity-normalizer.ts  KG + canonicalization
│   ├── concept-tracker.ts    spaced-repetition (orthogonal)
│   ├── identity.ts awareness.ts sessions.ts           out-of-band layers
│   ├── embedding-provider.ts embeddings.ts *-embedder.ts   provider chain
│   ├── reconcile.ts          multi-source reconciliation
│   └── evolution-runs.ts execution-traces.ts improvement-signals.ts  (subsystems)
└── harvest/                  ← ingestion (adapters + 4-pass pipeline)
    ├── pipeline.ts dedup.ts types.ts raw-types.ts
    ├── raw-turns.ts extract-memory-lanes.ts extract-kg-entities.ts
    └── *-adapter.ts          claude / chatgpt / gemini / markdown / pdf / url / …

packages/agent/src/           ← live wiring into the turn
    orchestrator.ts (recallMemory, buildSystemPrompt, autoSaveFromExchange)
    cognify.ts pattern-write-back.ts entity-extractor.ts context-loader.ts

packages/server/src/local/routes/   ← REST surface for the UI
    memory.ts memory-center.ts identity.ts knowledge.ts

packages/memory-mcp/src/      ← MCP surface for Claude agents
    tools/{memory,identity,awareness,knowledge,wiki,harvest,workspace,cleanup,ingest}.ts
    resources/memory.ts core/setup.ts
```

### How to call it

- **From an agent (MCP):** `save_memory(content, importance?, source?, workspace?)` →
  I-frame + index. `recall_memory(query, limit?, workspace?, scope?, profile?)` → hybrid search
  (`scope` ∈ personal/current/all). Also `get_identity`/`set_identity`, `get_awareness`/
  `set_awareness`, `search_entities`/`save_entity`, `harvest_import`, `compile_wiki`.
- **From the UI (REST):** `GET /api/memory?status=active`, `GET /api/memory/search?q=…`,
  `POST /api/memory/frames`, `GET /api/memory/graph?scope=all|personal|workspace`,
  `GET/POST /api/identity`. Workspace selectable via `?workspace=id`; mutations require an
  explicit `?mind=personal|workspace` (typos fail loudly with 400 — never silently widened).
- **Programmatically:** open a `MindDB(dbPath)`, then construct `FrameStore`, `HybridSearch`,
  `KnowledgeGraph` against `db.raw`. Lazy workspace minds come from `getWorkspaceMind(id)`
  (singleton per workspace via `MultiMindCache`).

---

## 8. Gotchas & footguns

### Cross-cutting invariants (break these and memory silently rots)
- **Every `memory_frames` INSERT must call `HybridSearch.indexFrame`.** Writing the row directly
  bypasses FTS + vec; the frame becomes invisible to search and there is no cheap rebuild script.
- **Vectors are locked at 1024-dim.** `vec0` tables can't be `ALTER`ed. A dimension change means
  DROP + recreate + re-embed *everything* (`recreateVecTables`). The guard throws early at search
  time, but the fix is destructive.
- **Mock embedder = zero semantics.** If the provider chain falls through to `mock`, search still
  "works" but ranks randomly. Detect via `getStatus().activeProvider === 'mock'`.
- **Model change at same dim is allowed but degrades cross-model similarity** (a warning, not an
  error). Don't swap embedding models casually on a populated DB.
- **Injection scan is all-or-nothing on recall.** A single poisoned hit zeroes the entire recall
  block. Harvest drops hostile items entirely — no soft sanitization anywhere.
- **`install_audit` and `ai_interactions` are physically append-only** via DDL `BEFORE
  DELETE/UPDATE` triggers that `RAISE(ABORT)` — the DB *refuses* mutation (EU AI Act Art. 12).
  Substrate changes confined to `install_audit` have **nowhere to land on the OSS mirror** — don't
  treat them as a pending port (see CLAUDE.md §7.5).

### Frame/dedup subtleties
- **`stripHmPrefix` is load-bearing for dedup (OQ-6).** Same-body captures from different sources
  must collapse regardless of the `[hm …]` prefix; using only `.trim()` regresses this. The hash
  is shared across insert/lookup/update/compaction/backfill so semantics never drift.
- **P-frames append, never retract.** Patch application is string concatenation, not a diff. To
  correct/retract, `update()` the I-frame or mark it `deprecated`.
- **content_hash INDEX is created in `runMigrations()` (after a guarded `ADD COLUMN`), not in
  SCHEMA_SQL.** Creating it in SCHEMA_SQL crashes boot on pre-D3 DBs (2026-06-12 regression).
- **`setMetadata()` does not invalidate FTS or vec** — metadata is never indexed.
- **`createIFrame` accepts an optional ISO-8601 `createdAt`** (T separator + timezone). Invalid
  values fall back to `datetime('now')`; the harvest path validates + logs so exported timestamps
  preserve original ordering.

### Knowledge-graph subtleties
- **Use `findEntityByName()` (exact) for dedup, never `searchEntities()` (fuzzy LIKE).** Fuzzy
  search drops the exact match from top-K once similar names accumulate — this caused **3506
  duplicate "Phase" rows** in the OSS repo before the fix.
- **`dedupeByName` keys on name *and* type.** "Marko" (person) and "Marko" (project) never merge.
- **Bitemporal soft-delete needs periodic cleanup.** `valid_to IS NULL` = active; nothing is hard-
  deleted, so `dedupeByName` / retiring must run on-demand or rows accumulate.
- **The "connected"/contextual score is 0 in production (KNOWN GAP).** `bfsDistances()` computes
  entity→entity distances but there is **no entity-id → frame-id bridge**, so the contextual
  dimension contributes nothing today (`scoring.ts §12`). A `kg_entity_frames` cross-ref table is
  hinted at in `frames.delete()`'s try-catch but is **not in the schema**.
- **Entity upsert is case-insensitive but type-specific.** `John`/`john` merge; `john`(PERSON) and
  `john`(PRODUCT) stay separate.
- **`isNoiseName()` runs twice** (parser + write seam) — don't assume one pass is enough.

### Recall / multi-mind subtleties
- **Recall is appended outside `buildSystemPrompt()`** (unless PromptAssembler is on). If you're
  hunting "why isn't memory in the prompt", look at `chat.ts:767/776`, not the orchestrator's
  prompt builder.
- **Catch-up mode skips the reranker** and uses importance-fetch instead of semantic search.
- **Workspace recall renders before personal** (visual precedence).
- **Frame IDs collide across personal + workspace minds** (separate autoincrements). Multi-mind
  reads tag results with `_mind`/`_workspace_name`; mutations require an explicit `mind` parameter.
- **Identity cache key must hash the full JSON, not `updated_at`** — SQLite datetime has 1-second
  precision, so rapid edits within a second collide (`orchestrator.ts:303`).
- **`/api/memory/graph?scope=all` offsets IDs by +100k per workspace** to avoid collisions in the
  merged viz; recomputed every request (expensive for many workspaces).
- **Awareness is hard-capped at 10** (`LIMIT 10` in every read). Add an 11th and the oldest
  silently drops on next read; expiry is via SQL WHERE, not a background job.

### Stale claims in the existing `docs/memory-architecture.md` (April 2026)
That doc predates the 2026-04-30 migration and should be read with these corrections:
1. **Wrong package path.** It says the substrate lives in `packages/core/src/mind/`. It does
   **not** — it lives in `packages/hive-mind-core/src/mind/`. (`packages/core/src/mind/` does not
   exist on disk as of 2026-06-26.) Its own "Path discrepancy fixed" note is itself now stale.
2. **"Schema version 1" / "five layers" undercount.** The current schema has **10+ table groups**
   (frames, FTS, vec, chunks+chunk-vec, KG, identity, awareness, sessions, improvement signals,
   install audit, procedures, AI interactions, execution traces, evolution runs, harvest sources,
   concept mastery). The "five memory layers" framing is a useful teaching simplification, not the
   physical schema.
3. **Reranker omitted.** The doc describes RRF + scoring but predates the cross-encoder reranker
   (`inprocess-reranker.ts`) that the raw-detail and semantic lanes now use (soft-fails to RRF).
4. **Embedding chain understated.** It lists `inprocess → ollama → voyage → openai → mock`; the
   current chain also includes a **litellm** stage before mock, plus tier-gating and quota.

Otherwise the old doc's descriptions of RRF fusion, scoring signals, dedup, and the dual-mind
model remain conceptually accurate — only the paths and the layer/provider counts have drifted.
