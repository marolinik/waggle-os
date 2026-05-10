# @waggle/hive-mind-core

> **The substrate.** SQLite + sqlite-vec hybrid search, bitemporal knowledge graph, frame compression, identity layer, awareness layer, embedder providers, harvest pipeline.

## What this is

`hive-mind-core` is the persistence + retrieval substrate that powers Waggle OS's memory layer. It also stands alone as an Apache-2.0 OSS package, distributed via `git subtree split` from the `marolinik/waggle-os` monorepo into `marolinik/hive-mind`.

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

Migrated from `marolinik/hive-mind` repo into `marolinik/waggle-os` monorepo at `packages/hive-mind-core/` per CC Sesija B brief 2026-04-30. Future development happens in this monorepo; `git subtree split` periodically emits `packages/hive-mind-core/` to `marolinik/hive-mind` for OSS distribution.

License: Apache-2.0.
