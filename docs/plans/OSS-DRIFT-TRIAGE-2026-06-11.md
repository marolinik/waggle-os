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

### DEFERRED — need founder decision / eval gate

| # | What | Why deferred |
|---|---|---|
| D1 | **Chunk-level retrieval stack** (chunker.ts + memory_frame_chunks(+_vec) schema + indexChunksForFrame + HybridSearch chunk lane + backfill) | Same class as the reranker: measurable OSS-ahead retrieval improvement, but a multi-file wave that should be **A/B-gated on LoCoMo/recall** before default-on. Recommend: own W-phase. |
| D2 | **llm-extractor.ts KG entity extraction** (LLM replaces the regex extractor mono cognify still uses) | Port the prompt/parser/batch core but REPLACE executors ('cc' subprocess + raw Anthropic POST) with mono's LLM routing; needs a where-does-it-run decision (cognify write path vs cron). |
| D3 | content_hash indexed dedup column (frames/schema/db) | Mono's hash semantics are deliberately different (stripHmPrefix-aware); bounded 500-row scan is fine at current scale. Adopt the **column pattern with mono semantics** only when scale demands. |

### Forward-port queue (mono → OSS, next re-split)
W4 arc (all of it), scoring created_at fix, since/until fencepost fixes,
likeFallbackSearch, escapeLikeTerm (knowledge), W4.4 captions + raw-types,
HARVEST_FRAME_CONTENT_CAP, harvestSetHash. Note: mono adapters depend on
`harvest/raw-types.ts` which the OSS tree lacks — re-split must carry it.

## Execution record
- 2026-06-11: triage run (4 parallel agents over monorepo HEAD vs oss origin/master).
- 2026-06-11: R1-R7 reverse-ported (see commits on main).
- D1/D2/D3 + re-split timing → Marko.
