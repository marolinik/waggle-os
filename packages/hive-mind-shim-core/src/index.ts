/**
 * @hive-mind/shim-core — barrel export.
 *
 * Foundation utilities for the cross-IDE silent-capture shim portfolio.
 */

export type {
  HookEvent,
  EventType,
  ShimSource,
} from './hook-event-types.js';
export {
  ALL_EVENT_TYPES,
  ALL_SOURCES,
  isEventType,
  isShimSource,
} from './hook-event-types.js';

export type {
  HookFrame,
  HookFrameMetadata,
  EncodeOptions,
  SavePayload,
  SaveMemorySource,
} from './frame-encoder.js';
export { encodeFrame, frameToSavePayload } from './frame-encoder.js';

export type {
  Workspace,
  WorkspaceMode,
  ResolveOptions,
} from './workspace-resolver.js';
export { resolveWorkspace, isAbsoluteWorkspacePath } from './workspace-resolver.js';

export type {
  CliBridge,
  CliBridgeOptions,
  McpCallResult,
  McpCallResultContent,
  SaveMemoryResult,
  MemoryHit,
  RecallMemoryOptions,
  CleanupFramesOptions,
  CleanupMode,
  CallMcpOptions,
  SpawnFn,
} from './cli-bridge.js';
export { createCliBridge } from './cli-bridge.js';

export type {
  Importance,
  ImportanceRule,
  ClassifyContext,
} from './importance-classifier.js';
export {
  classifyImportance,
  classifyWithRules,
  DEFAULT_RULES,
} from './importance-classifier.js';

export type { SummarizeOptions } from './prompt-summarizer.js';
export { summarizeTurn } from './prompt-summarizer.js';

export type { RetryOptions } from './retry-bridge.js';
export { withRetry, computeBackoff } from './retry-bridge.js';

export type { Logger, LogLevel, CreateLoggerOptions } from './logger.js';
export { createLogger } from './logger.js';
