// @waggle/core — Waggle-specific orchestration layer.
//
// As of CC Sesija B 2026-04-30 (PM Q3 Plan A ratification), the substrate
// (mind/ + harvest/ + logger + injection-scanner) lives in @waggle/hive-mind-core
// and is distributed as Apache 2.0 OSS via subtree-split. This barrel re-exports
// substrate symbols for backward compatibility — existing consumers (packages/agent,
// apps/web, packages/server, etc.) keep their `import { ... } from '@waggle/core'`
// imports unchanged.
//
// Waggle-specific (non-extracted) modules below the substrate re-exports stay
// in this package: config, multi-mind, workspace orchestration, vault, telemetry,
// install-audit, cron-store, skill-hashes, team-sync, file-store, file-indexer,
// memory-import, optimization-log, compliance/.

// ── Substrate re-exports from @waggle/hive-mind-core (Apache 2.0 OSS) ──
export {
  // Logger + injection scanner
  createCoreLogger,
  scanForInjection, type ScanResult,
  // mind/ — memory substrate
  MindDB,
  IdentityLayer, type Identity,
  AwarenessLayer, type AwarenessItem, type AwarenessCategory,
  FrameStore, type MemoryFrame, type FrameType, type Importance, type FrameSource,
  SessionStore, type Session,
  HybridSearch, type SearchResult,
  KnowledgeGraph, type Entity, type Relation, type ValidationSchema,
  SCHEMA_SQL, VEC_TABLE_SQL, SCHEMA_VERSION,
  computeRelevance,
  computeTemporalScore,
  computePopularityScore,
  computeContextualScore,
  computeImportanceScore,
  SCORING_PROFILES,
  type ScoringProfile,
  type ScoringWeights,
  type Embedder,
  createLiteLLMEmbedder, type LiteLLMEmbedderConfig,
  createInProcessEmbedder, normalizeDimensions, type InProcessEmbedderConfig,
  createOllamaEmbedder, type OllamaEmbedderConfig,
  createApiEmbedder, type ApiEmbedderConfig,
  createEmbeddingProvider, EmbeddingQuotaExceededError, getMinimumTierForProvider,
  type EmbeddingProviderConfig, type EmbeddingProviderStatus, type EmbeddingProviderType,
  type EmbeddingProviderInstance, type EmbeddingQuotaStatus,
  normalizeEntityName, findDuplicates,
  Ontology, validateEntity, type EntitySchema, type ValidationResult,
  ImprovementSignalStore,
  type ImprovementSignal, type ActionableSignal, type SignalCategory, type ActionableThresholds,
  ExecutionTraceStore, EXECUTION_TRACES_TABLE_SQL,
  type ExecutionTrace, type ParsedExecutionTrace, type TraceOutcome,
  type TracePayload, type TraceToolCall, type TraceReasoningStep,
  type StartTraceInput, type FinalizeTraceInput, type TraceQueryFilter,
  EvolutionRunStore, EVOLUTION_RUNS_TABLE_SQL,
  type EvolutionRun, type EvolutionRunStatus, type EvolutionRunTarget,
  type CreateEvolutionRunInput, type EvolutionRunFilter,
  reconcileIndexes, reconcileFtsIndex, reconcileVecIndex, cleanOrphanVectors, cleanOrphanFts,
  type ReconcileResult,
  ConceptTracker, CONCEPT_MASTERY_TABLE_SQL,
  type ConceptEntry, type ConceptUpdate,
  // harvest/ — universal memory ingestion pipeline
  HarvestSourceStore,
  HarvestRunStore, type HarvestRun, type HarvestRunStatus,
  ChatGPTAdapter,
  ClaudeAdapter,
  ClaudeCodeAdapter,
  GeminiAdapter,
  UniversalAdapter,
  MarkdownAdapter,
  PlaintextAdapter,
  UrlAdapter,
  PdfAdapter,
  HarvestPipeline, type LLMCallFn, type PipelineOptions,
  dedup,
  type ImportSourceType, type ImportItemType, type UniversalImportItem, type DistilledKnowledge,
  type HarvestPipelineResult, type HarvestSource, type SourceAdapter, type FilesystemAdapter,
  type ClassifiedItem, type ExtractedContent, type KnowledgeProvenance,
} from '@waggle/hive-mind-core';

// ── Waggle-specific orchestration (stays in @waggle/core) ──
export { WaggleConfig, type ProviderEntry, type TeamServerConfig } from './config.js';
export { MultiMind, type MultiMindSearchResult, type MindSource, type SearchScope } from './multi-mind.js';
export { MultiMindCache, type MultiMindCacheConfig } from './multi-mind-cache.js';
export { WorkspaceManager, type WorkspaceConfig, type CreateWorkspaceOptions } from './workspace-config.js';
export { needsMigration, migrateToMultiMind } from './migration.js';
export { TeamSync, frameToEntity, entityToSyncedFrame, type TeamSyncConfig, type SyncedFrame } from './team-sync.js';
export {
  InstallAuditStore, INSTALL_AUDIT_TABLE_SQL,
  type InstallAuditEntry, type RecordAuditInput,
  type AuditAction, type AuditRiskLevel, type AuditTrustSource,
  type AuditApprovalClass, type AuditInitiator, type AuditCapabilityType,
} from './install-audit.js';
export {
  CronStore, CRON_SCHEDULES_TABLE_SQL,
  type CronSchedule, type CreateScheduleInput, type CronJobType,
} from './cron-store.js';
export { VaultStore, type VaultEntry } from './vault.js';
export { TelemetryStore, TelemetryCollector, TELEMETRY_EVENTS, type TelemetryEvent, type TelemetrySummary } from './telemetry.js';
export {
  SkillHashStore, computeSkillHash, SKILL_HASHES_TABLE_SQL,
  type SkillHash,
} from './skill-hashes.js';
export { processImport, parseChatGPTExport, parseClaudeExport, extractKnowledge } from './memory-import.js';
export { createFileStore, LocalFileStore, LinkedDirStore, S3FileStore, type FileStore, type FileEntry, type StorageInfo, type S3Config } from './file-store.js';
export { FileIndexer, MAX_CONTENT_BYTES, type FileIndexRow, type FileIndexResult } from './file-indexer.js';
export type { ImportSource, ImportResult, ExtractedKnowledge, ParsedConversation, ConversationMessage } from './memory-import.js';
export {
  OptimizationLogStore, OPTIMIZATION_LOG_TABLE_SQL,
  type OptimizationLogEntry, type CreateOptimizationLogInput,
} from './optimization-log.js';

// ── Compliance (AI Act) — stays in @waggle/core (NOT extracted per .github/sync.md) ──
export { InteractionStore } from './compliance/interaction-store.js';
export { ComplianceStatusChecker } from './compliance/status-checker.js';
export { ReportGenerator, type ReportGeneratorDeps } from './compliance/report-generator.js';
export { ComplianceTemplateStore, KVARK_TEMPLATE_NAME } from './compliance/template-store.js';
export { TEMPLATE_RISK_MAP } from './compliance/types.js';
export type {
  AIActRiskLevel, HumanAction, AIInteraction, RecordInteractionInput,
  ComplianceStatus, ArticleStatus, AuditReport, AuditReportRequest,
  ModelInventoryEntry, OversightLogEntry, HarvestProvenanceEntry,
  ComplianceTemplate, ComplianceTemplateSections,
  CreateComplianceTemplateInput, UpdateComplianceTemplateInput,
} from './compliance/types.js';
