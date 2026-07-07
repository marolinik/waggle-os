export * from './types.js';
export { chunkByParagraphs } from './chunk-utils.js';
export { CLASSIFY_PROMPT, EXTRACT_PROMPT, SYNTHESIZE_PROMPT } from './prompts.js';
export { HarvestSourceStore } from './source-store.js';
export { HarvestRunStore, type HarvestRun, type HarvestRunStatus } from './run-store.js';
export { dedup, harvestSetHash, type DedupResult } from './dedup.js';
export { asRecord, getString, getNumber, getArray, firstString, type RawRecord } from './raw-types.js';
export { ChatGPTAdapter } from './chatgpt-adapter.js';
export { ClaudeAdapter } from './claude-adapter.js';
export { ClaudeCodeAdapter } from './claude-code-adapter.js';
export { GeminiAdapter } from './gemini-adapter.js';
export { PerplexityAdapter } from './perplexity-adapter.js';
export { UniversalAdapter } from './universal-adapter.js';
export { MarkdownAdapter } from './markdown-adapter.js';
export { PlaintextAdapter } from './plaintext-adapter.js';
export { UrlAdapter } from './url-adapter.js';
export { PdfAdapter } from './pdf-adapter.js';
export { HarvestPipeline, type LLMCallFn, type PipelineOptions } from './pipeline.js';

// Memory-lane extraction passes (facts / events / profiles). Ported from hive-mind a99ea0e.
export {
  extractMemoryLanes,
  writeMemoryLaneFrames,
  MIND_FACT_PREFIX,
  MIND_EVENT_PREFIX,
  MIND_PROFILE_PREFIX,
  type ExtractedFact,
  type ExtractedEvent,
  type ExtractedProfile,
  type MemoryLaneExtraction,
  type WriteLaneFramesResult,
} from './extract-memory-lanes.js';

// Per-turn verbatim dialogue storage (raw-detail lane, write side). Ported from hive-mind a99ea0e.
export {
  writeRawTurnFrames,
  rawTurnHeader,
  parseRawTurnHeader,
  rawTurnConvKey,
  MIND_RAWTURN_PREFIX,
  MAX_TURNS_PER_ITEM,
  RAWDETAIL_KILL_SWITCH,
  type WriteRawTurnsResult,
  type ParsedRawTurnHeader,
} from './raw-turns.js';
