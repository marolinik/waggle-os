# @waggle/hive-mind-core

> **The substrate.** SQLite + sqlite-vec hybrid search, bitemporal knowledge graph, frame compression, identity layer, awareness layer, embedder providers, harvest pipeline.

## What this is

`hive-mind-core` is the persistence + retrieval substrate that powers Waggle OS's memory layer. The public Apache-2.0 distribution lives in `marolinik/hive-mind` and is produced from this canonical source by a maintainer-curated forward-port.

> **Publication boundary:** this monorepo package is private and must never be
> published or pushed as a raw subtree split. It contains Waggle-only files and
> interleaved `install_audit` schema/migration logic. The curated forward-port
> adapts the public layout/imports and removes all excluded material.

## What's inside

| Module | Purpose |
|---|---|
| `mind/db.ts` | `MindDB` — better-sqlite3 + sqlite-vec hybrid backend |
| `mind/frames.ts` | `FrameStore` — I/P/B frame types + compaction + dedup |
| `mind/sessions.ts` | `SessionStore` — session lifecycle + ensureActive |
| `mind/search.ts` | `HybridSearch` — FTS5 + vec0 fused via Reciprocal Rank Fusion |
| `mind/knowledge.ts` | `KnowledgeGraph` — entity/relation graph + bitemporal validity |
| `mind/identity.ts` | `IdentityLayer` — personal identity persistence |
| `mind/awareness.ts` | `AwarenessLayer` — active task/state tracking |
| `mind/scoring.ts` | Scoring profiles (recency, popularity, relevance, importance) |
| `mind/reconcile.ts` | Index reconciliation (FTS, vec, orphan cleanup) |
| `mind/ontology.ts` | Entity ontology + validation |
| `mind/concept-tracker.ts` | Concept mastery tracking |
| `mind/entity-normalizer.ts` | Entity name normalization + dedup |
| `mind/{api,inprocess,litellm,ollama}-embedder.ts` | Embedder providers + provider factory |
| `mind/embedding-provider.ts` | `createEmbeddingProvider` — runtime embedder selection + quota |
| `harvest/pipeline.ts` | `HarvestPipeline` — universal ingestion into frames |
| `harvest/dedup.ts` | Cross-source dedup |
| `harvest/{chatgpt,claude,claude-code,gemini,perplexity,markdown,plaintext,pdf,url,universal}-adapter.ts` | Per-source ingest adapters |
| `harvest/source-store.ts`, `run-store.ts` | Harvest source + run persistence |
| `injection-scanner.ts` | `scanForInjection` — prompt-injection detection |
| `logger.ts` | `createCoreLogger` — minimal structured logger |

## SOTA claim (placeholder until arxiv preprint)

- Substrate ceiling: 74% on LoCoMo Pass II self-judge (vs Mem0 peer-reviewed 66.9% — methodology bias quantification +27.35pp)
- GEPA-evolved variants: +12.5pp on held-out validation
- Qwen 35B with hive-mind context = Opus-class out-of-distribution performance
- Apache 2.0, no telemetry, no phone-home

## Status

Migrated from `marolinik/hive-mind` into the canonical `marolinik/waggle-os` monorepo at `packages/hive-mind-core/` on 2026-04-30. Future development happens here. `scripts/oss-subtree-split.sh` is an inspection/curation starting point only; the public mirror is updated through a reviewed, curated forward-port.

License: Apache-2.0.
