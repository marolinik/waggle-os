export { MindDB } from './mind/db.js';
export { IdentityLayer, type Identity } from './mind/identity.js';
export { AwarenessLayer, type AwarenessItem, type AwarenessCategory } from './mind/awareness.js';
export { FrameStore, type MemoryFrame, type FrameType, type Importance, type FrameSource } from './mind/frames.js';
export { SessionStore, type Session } from './mind/sessions.js';
export { HybridSearch, type SearchResult } from './mind/search.js';
export { KnowledgeGraph, type Entity, type Relation, type ValidationSchema } from './mind/knowledge.js';
export { SCHEMA_SQL, VEC_TABLE_SQL, SCHEMA_VERSION } from './mind/schema.js';
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
export { normalizeEntityName, findDuplicates } from './mind/entity-normalizer.js';
export { Ontology, validateEntity, type EntitySchema, type ValidationResult } from './mind/ontology.js';
export { WaggleConfig, type ProviderEntry, type TeamServerConfig } from './config.js';
export { MultiMind, type MultiMindSearchResult, type MindSource, type SearchScope } from './multi-mind.js';
export { WorkspaceManager, type WorkspaceConfig, type CreateWorkspaceOptions } from './workspace-config.js';
export { needsMigration, migrateToMultiMind } from './migration.js';
export { TeamSync, frameToEntity, entityToSyncedFrame, type TeamSyncConfig, type SyncedFrame } from './team-sync.js';
export {
  ImprovementSignalStore,
  type ImprovementSignal,
  type ActionableSignal,
  type SignalCategory,
  type ActionableThresholds,
} from './mind/improvement-signals.js';
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
export {
  SkillHashStore, computeSkillHash, SKILL_HASHES_TABLE_SQL,
  type SkillHash,
} from './skill-hashes.js';
export { reconcileIndexes, reconcileFtsIndex, reconcileVecIndex, type ReconcileResult } from './mind/reconcile.js';
export {
  ConceptTracker, CONCEPT_MASTERY_TABLE_SQL,
  type ConceptEntry, type ConceptUpdate,
} from './mind/concept-tracker.js';
export { processImport, parseChatGPTExport, parseClaudeExport, extractKnowledge } from './memory-import.js';
export { createFileStore, LocalFileStore, LinkedDirStore, type FileStore, type FileEntry, type StorageInfo } from './file-store.js';
export type { ImportSource, ImportResult, ExtractedKnowledge, ParsedConversation, ConversationMessage } from './memory-import.js';
export {
  OptimizationLogStore, OPTIMIZATION_LOG_TABLE_SQL,
  type OptimizationLogEntry, type CreateOptimizationLogInput,
} from './optimization-log.js';
