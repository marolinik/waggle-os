// @waggle/hive-mind-core — substrate package barrel.
//
// Distribution: Apache 2.0 OSS via `git subtree split` from waggle-os monorepo
// to marolinik/hive-mind. Apps/web + Waggle agent harness stay proprietary in monorepo.
//
// Contents: mind/ (substrate), harvest/ (ingestion pipeline), prompt-injection
// scanner, structured logger.

// ── Logger + injection scanner (utilities used by substrate + Waggle agent) ──
export { createCoreLogger, type CoreLogger } from './logger.js';
export { scanForInjection, type ScanResult } from './injection-scanner.js';

// ── mind/ — memory substrate (FrameStore, KnowledgeGraph, embedders, search, scoring) ──
export {
  MindDB, EmbeddingDimMismatchError,
  type EmbeddingFingerprint, type FingerprintCheck,
} from './mind/db.js';
export { IdentityLayer, type Identity } from './mind/identity.js';
export { AwarenessLayer, type AwarenessItem, type AwarenessCategory } from './mind/awareness.js';
export { FrameStore, stripHmPrefix, type MemoryFrame, type FrameType, type Importance, type FrameSource } from './mind/frames.js';
export { RawArchive, hashRaw, type RawArchiveRow, type ArchiveInput } from './mind/raw-archive.js';
export { hashFrameContent } from './mind/content-hash.js';
export { SessionStore, type Session } from './mind/sessions.js';
export {
  HybridSearch, type SearchResult,
  // D1 (oss-drift triage, 2026-06-11) — chunk-level retrieval (flag-gated, default OFF)
  chunkRetrievalEnabled, rechunkAllFrames, type RechunkResult,
} from './mind/search.js';
export { chunkText, type ChunkOptions, type FrameChunk } from './mind/chunker.js';
export { KnowledgeGraph, type Entity, type Relation, type ValidationSchema } from './mind/knowledge.js';
export {
  SCHEMA_SQL, VEC_TABLE_SQL, CHUNKS_VEC_TABLE_SQL, SCHEMA_VERSION,
  vecTableSqlForDim, chunksVecTableSqlForDim,
} from './mind/schema.js';
export {
  computeRelevance,
  computeTemporalScore,
  computePopularityScore,
  computeContextualScore,
  computeImportanceScore,
  SCORING_PROFILES,
  type ScoringProfile,
  type ScoringWeights,
} from './mind/scoring.js';
export type { Embedder } from './mind/embeddings.js';
export { createLiteLLMEmbedder, type LiteLLMEmbedderConfig } from './mind/litellm-embedder.js';
export { createInProcessEmbedder, normalizeDimensions, type InProcessEmbedderConfig } from './mind/inprocess-embedder.js';
export { createOllamaEmbedder, type OllamaEmbedderConfig } from './mind/ollama-embedder.js';
export { createApiEmbedder, type ApiEmbedderConfig } from './mind/api-embedder.js';
export { createEmbeddingProvider, EmbeddingQuotaExceededError, getMinimumTierForProvider, maxEmbedCharsForModel, capEmbedText, reembedPerText, type EmbeddingProviderConfig, type EmbeddingProviderStatus, type EmbeddingProviderType, type EmbeddingProviderInstance, type EmbeddingQuotaStatus } from './mind/embedding-provider.js';
export { normalizeEntityName, findDuplicates, isNoiseName, isLikelyAcronym } from './mind/entity-normalizer.js';
export { Ontology, validateEntity, type EntitySchema, type ValidationResult } from './mind/ontology.js';
export {
  ImprovementSignalStore,
  type ImprovementSignal,
  type ActionableSignal,
  type SignalCategory,
  type ActionableThresholds,
} from './mind/improvement-signals.js';
export {
  ExecutionTraceStore, EXECUTION_TRACES_TABLE_SQL,
  type ExecutionTrace, type ParsedExecutionTrace, type TraceOutcome,
  type TracePayload, type TraceToolCall, type TraceReasoningStep,
  type StartTraceInput, type FinalizeTraceInput, type TraceQueryFilter,
} from './mind/execution-traces.js';
export {
  EvolutionRunStore, EVOLUTION_RUNS_TABLE_SQL,
  type EvolutionRun, type EvolutionRunStatus, type EvolutionRunTarget,
  type CreateEvolutionRunInput, type EvolutionRunFilter,
} from './mind/evolution-runs.js';
export { reconcileIndexes, reconcileFtsIndex, reconcileVecIndex, cleanOrphanVectors, cleanOrphanFts, type ReconcileResult } from './mind/reconcile.js';
export {
  ConceptTracker, CONCEPT_MASTERY_TABLE_SQL,
  type ConceptEntry, type ConceptUpdate,
} from './mind/concept-tracker.js';
export {
  TEMPORAL_GUIDANCE,
  toDatePrefix,
  renderDatedSnippet,
  referenceDate,
  renderReferenceDateLine,
} from './mind/recall-context.js';
export { resolveRelativeDate, type ResolvedDate } from './mind/resolve-relative-date.js';
export { parseDateWindow, type DateWindow } from './mind/parse-date-window.js';
export { createInProcessReranker, type Reranker, type InProcessRerankerConfig } from './mind/inprocess-reranker.js';

// ── harvest/ — universal memory ingestion pipeline ──
export { HarvestSourceStore } from './harvest/source-store.js';
export { HarvestRunStore, type HarvestRun, type HarvestRunStatus } from './harvest/run-store.js';
export { ChatGPTAdapter } from './harvest/chatgpt-adapter.js';
export { ClaudeAdapter } from './harvest/claude-adapter.js';
export { ClaudeCodeAdapter } from './harvest/claude-code-adapter.js';
export { GeminiAdapter } from './harvest/gemini-adapter.js';
export { UniversalAdapter } from './harvest/universal-adapter.js';
export { MarkdownAdapter } from './harvest/markdown-adapter.js';
export { PlaintextAdapter } from './harvest/plaintext-adapter.js';
export { UrlAdapter } from './harvest/url-adapter.js';
export { PdfAdapter } from './harvest/pdf-adapter.js';
export { HarvestPipeline, type LLMCallFn, type PipelineOptions } from './harvest/pipeline.js';
export {
  extractMemoryLanes, writeMemoryLaneFrames,
  MIND_FACT_PREFIX, MIND_EVENT_PREFIX, MIND_PROFILE_PREFIX,
  type MemoryLaneExtraction, type ExtractedEvent, type ExtractedFact, type ExtractedProfile,
  type WriteLaneFramesResult,
} from './harvest/extract-memory-lanes.js';
export {
  extractKgEntities, writeKgEntities, KG_ENTITY_TYPES,
  type KgEntity, type KgEntityType, type KgEntityExtraction, type WriteKgEntitiesResult,
} from './harvest/extract-kg-entities.js';
export {
  writeRawTurnFrames, rawTurnHeader, parseRawTurnHeader, rawTurnConvKey,
  MIND_RAWTURN_PREFIX, MAX_TURNS_PER_ITEM, RAWDETAIL_KILL_SWITCH,
  type WriteRawTurnsResult, type ParsedRawTurnHeader,
} from './harvest/raw-turns.js';
export {
  fetchRawDetailLane, rawTurnBody, RAW_DETAIL_K,
  type RawTurnHit, type RawDetailLaneOptions,
} from './mind/raw-detail-lane.js';
export { dedup, harvestSetHash } from './harvest/dedup.js';
export { HARVEST_FRAME_CONTENT_CAP } from './harvest/types.js';
export type {
  ImportSourceType, ImportItemType, UniversalImportItem, DistilledKnowledge,
  HarvestPipelineResult, HarvestSource, SourceAdapter, FilesystemAdapter,
  ClassifiedItem, ExtractedContent, KnowledgeProvenance,
} from './harvest/types.js';

// ── Multi-workspace orchestration (Plan A AMENDMENT 2026-04-30) ──
// MultiMind + MultiMindCache + WorkspaceManager were originally part of
// @hive-mind/core in marolinik/hive-mind. PM Q3 ratified Plan A widening
// 2026-04-30 to keep hive-mind-core OSS-self-contained for mcp-server + cli.
export { MultiMind, type MultiMindSearchResult, type MindSource, type SearchScope } from './multi-mind.js';
export { MultiMindCache, type MultiMindCacheConfig } from './multi-mind-cache.js';
export { WorkspaceManager, type WorkspaceConfig, type CreateWorkspaceOptions } from './workspace-manager.js';
