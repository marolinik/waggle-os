# OSS Drift Triage — waggle-os ↔ marolinik/hive-mind (2026-06-11)

**Trigger:** the first `scripts/oss-drift-check.sh` run (§7.5 policy ratification arc)
surfaced drift far beyond the W4.2 reranker incident: 3 OSS-only source files +
42 differing files. This doc is the file-by-file direction triage (4-agent recon,
monorepo `HEAD` vs OSS `origin/master`) and the reverse-port execution record.

**Key discovery:** the OSS repo was never a byte-identical subtree-split product —
it was a **hand-extraction (May 2026) with deliberate transforms** (extraction
headers, `[hive-mind:]` branding, import rewrites, scrubbed prompt examples), and
both sides evolved independently since. Blob-equality checks are useless;
semantic per-file triage was required. The §7.5 "monorepo sole source" policy
now governs; this triage is the one-time consolidation.

## Verdict matrix (45 files)

### PACKAGING-ONLY — no action (19)
perplexity/markdown/pdf/plaintext/url adapters, chunk-utils, prompts (scrubbed
examples), index (harvest barrel), run-store, source-store, sessions, awareness,
identity, concept-tracker, reconcile, api/inprocess/litellm/ollama embedders,
multi-mind-cache.

### MONO-AHEAD — mirror is stale, fixed by next re-split (6)
chatgpt-adapter, gemini-adapter, universal-adapter (W4.4 captions + raw-types),
dedup (harvestSetHash), types (HARVEST_FRAME_CONTENT_CAP), scoring (W4.2
created_at decay — **OSS still has the last_accessed decay bug**).
Plus all 11 ONLY-IN-MONO modules (temporal stack, raw-turns/raw-detail-lane,
extract-memory-lanes, multi-mind, proprietary-excluded evolution/traces/signals).

### REVERSE-PORT — OSS has real functionality the monorepo lacks

| # | Source | What | Size | Status |
|---|---|---|---|---|
| R1 | logger.ts | **stderr routing for info/debug** — mono logger writes to stdout; hive-mind-mcp-server is stdio-transport, so pipeline `log.info` calls can corrupt the MCP stream (LIVE latent bug). + `CoreLogger` type export. | S | PORTED |
| R2 | knowledge.ts | `findEntityByName()` exact-match dedup fix (LIKE top-K drops exact match → runaway dups, e.g. 3506 "Phase" rows) + `dedupeByName()` transactional merge + `safeParseProps()`. | M | PORTED |
| R3 | entity-normalizer.ts | Write-time noise filter: `isNoiseName()`/`isLikelyAcronym()` + STOP_TOKENS + TECH_ALLOWLIST — blocks low-signal names entering the KG. | S | PORTED |
| R4 | workspace-manager.ts | `ensure(id, options)` idempotent create-by-trusted-id — mono MCP save_memory to a not-yet-created workspace has no auto-create path. | S | PORTED |
| R5 | embedding-provider.ts | `maxEmbedCharsForModel()`/`capEmbedText()` (input capping) + `reembedPerText()` (per-text batch-failure recovery — mono degrades whole batch to mock noise). | M | PORTED |
| R6 | claude-adapter.ts | 2026-04-22 Claude export streams: `memories` (conversations_memory + project_memories) + `design_chats[]` + enriched project-doc parsing — mono silently drops two whole export streams. | M | PORTED |
| R7 | db.ts | Embedding-fingerprint guard (`ensureEmbeddingFingerprint` + `EmbeddingDimMismatchError` + `recreateVecTables`) — refuses loudly on dim mismatch; mono has zero protection against mixed-dim vector corruption. | M | PORTED |

### D-items — founder GO 2026-06-11 ("do all 3"), ALL PORTED same session

| # | What | Status |
|---|---|---|
| D1 | **Chunk-level retrieval stack** — chunker.ts + `memory_frame_chunks`(+`_vec`, dim-parameterized) schema + `indexChunksForFrame` + chunk-vec lane in HybridSearch (over-fetch ×5, best-chunk-per-frame dedup, clean fallback to whole-frame vectors) + `rechunkAllFrames` backfill. | PORTED — **opt-in `WAGGLE_CHUNK_RETRIEVAL=1`, default OFF**: the default flip stays gated on a LoCoMo/recall A/B (reranker precedent). Flag-off behavior regression-locked byte-identical. recreateVecTables covers both vec tables. |
| D2 | **LLM KG entity extraction** (replaces the capitalized-n-gram regex as the KG quality path) | PORTED — prompt/parser/batching from OSS llm-extractor; executors rehomed onto `LLMCallFn` 'fast'. Runs in the daily memory-lane cron AFTER the lane pass, same frame window + shared watermark. Writes dedup via `findEntityByName` (R2) + filter via `isNoiseName` (R3); injection-scanned. |
| D3 | content_hash indexed dedup column | PORTED — **with MONO semantics** (sha256 over `stripHmPrefix(content).trim()`, content-hash.ts): the OSS trim-only hash would have regressed OQ-6 provenance-insensitive dedup. `findDuplicate` now O(1) indexed, NO recency window (old LIMIT-500 scan silently missed older dups). Idempotent migration + backfill. |

### Forward-port queue (mono → OSS, next re-split)
W4 arc (all of it), scoring created_at fix, since/until fencepost fixes,
likeFallbackSearch, escapeLikeTerm (knowledge), W4.4 captions + raw-types,
HARVEST_FRAME_CONTENT_CAP, harvestSetHash. Note: mono adapters depend on
`harvest/raw-types.ts` which the OSS tree lacks — re-split must carry it.

## Execution record
- 2026-06-11: triage run (4 parallel agents over monorepo HEAD vs oss origin/master).
- 2026-06-11: R1-R7 reverse-ported (see commits on main).
- 2026-06-11 (later): founder GO "do all 3" → D1+D2+D3 ported same session
  (3 implementation agents + direct work; D1 flag-gated default-OFF).
- **Still open:** D1 default-flip eval gate (LoCoMo/recall A/B with
  WAGGLE_CHUNK_RETRIEVAL=1 + rechunkAllFrames backfill); re-split timing
  (mirror now strictly behind — forward-port queue above).
