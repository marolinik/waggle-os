/**
 * Long-task context management — Phase 3.3 of agent-fix sprint
 * (per decisions/2026-04-26-agent-fix-sprint-plan.md §3.3)
 *
 * Handles context-window exhaustion in multi-hour agent runs. Phase 3.1's
 * accumulated_context grows monotonically across steps; eventually exceeds
 * the model's context-window budget. ContextManager intelligently shrinks
 * accumulated_context, decision_history, and retrieval_cache while
 * preserving task-progress signal.
 *
 * THREE SHRINKING DIMENSIONS:
 *   1. accumulated_context (string) — compress via LLM summarization,
 *      retrieve-only truncation, or hybrid (summarize + emit archive event
 *      so caller can index for later retrieval).
 *   2. decision_history (Decision[]) — bucket-summarize older decisions
 *      into one rolled-up Decision; keep last K verbatim. Optional archive
 *      callback for audit-trail persistence.
 *   3. retrieval_cache (Record<string, unknown>) — LRU-evict to maxSize.
 *      Defaults to insertion order; caller can supply accessOrder for true
 *      LRU.
 *
 * REUSE / NON-DUPLICATION:
 *   - estimateStringTokens from existing context-compressor.ts (content-aware:
 *     prose 4.0 / code 3.2 / json 3.5 / mixed 2.5 chars/token).
 *   - LlmCallFn / RetrievalSearchFn from Phase 2.1 (retrieval-agent-loop.ts).
 *   - Decision type from Phase 3.1 (checkpoint.ts).
 *
 * HALT-AND-PING TRIGGER RESOLUTIONS (locked before code, per PM brief §3.3):
 *   1. Tokenizer model-class dependencies → injectable estimateTokensFn,
 *      defaults to estimateStringTokens (no new package deps).
 *   2. Compression LLM-call cost → threshold-gated (default 0.7), caller
 *      chooses summarizationModel, cost telemetry via onCompressionEvent.
 *   3. Hive-mind retrieval ↔ Memory Sync Repair conflict → ContextManager
 *      does NOT touch hive-mind; consumes RetrievalSearchFn abstraction;
 *      caller wires it to per-task SessionStore (scratch, NOT synced).
 *   4. Decision history compression dropping critical decisions → bucket-
 *      summarize preserves Decision shape; optional archiveDecisionsTo
 *      callback for lossless on-disk audit trail.
 */

import { estimateStringTokens } from '../context-compressor.js';
import type { LlmCallFn, RetrievalSearchFn } from '../retrieval-agent-loop.js';
import {
  CHECKPOINT_SCHEMA_VERSION,
  type CheckpointStepState,
  type Decision,
} from './checkpoint.js';

// ─────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────

export type CompressionStrategy = 'summarize-only' | 'retrieve-only' | 'hybrid';

export interface ArchivedContextRange {
  /** The text that was archived/replaced. */
  archived_text: string;
  /** Char offset where the archived range began (0-indexed) in the original context. */
  range_start: number;
  /** Char offset where the archived range ended (exclusive) in the original context. */
  range_end: number;
}

export interface ContextCompressionEvent {
  type: 'context-compressed' | 'context-compression-skipped';
  /** Tokens before the operation. */
  before_tokens: number;
  /** Tokens after the operation. */
  after_tokens: number;
  /** Strategy used. */
  strategy: CompressionStrategy;
  /** USD cost incurred (LLM-summarize calls). 0 for retrieve-only or skipped. */
  cost_usd: number;
  /** Archived range (set on retrieve-only and hybrid). */
  archived?: ArchivedContextRange;
}

export interface DecisionsCompressionEvent {
  type: 'decisions-compressed';
  /** Number of decisions before. */
  before_count: number;
  /** Number of decisions after. */
  after_count: number;
  /** Number archived (= before - after - 1 summary entry, when summary added). */
  evicted_count: number;
  /** USD cost (0 if heuristic summary used). */
  cost_usd: number;
}

export interface CacheEvictionEvent {
  type: 'cache-evicted';
  /** Cache size before eviction. */
  before_size: number;
  /** Cache size after eviction. */
  after_size: number;
  /** Number of entries dropped. */
  evicted_count: number;
}

export type CompressionEvent = ContextCompressionEvent | DecisionsCompressionEvent | CacheEvictionEvent;

export interface ContextManagerOptions {
  /** Token budget for accumulated_context. Caller picks based on model. */
  contextTokenBudget: number;
  /** Threshold (fraction of budget) that triggers proactive compression. Default 0.7. */
  compressionThreshold?: number;
  /** Compression strategy. Default 'hybrid'. */
  strategy?: CompressionStrategy;

  /** LLM call for summarization. Required for 'summarize-only' / 'hybrid'. */
  llmCall?: LlmCallFn;
  /** Optional retrieval function (consumed by Phase 3.4, not by ContextManager directly). */
  retrievalSearch?: RetrievalSearchFn;
  /** Optional override for token estimation. Default = estimateStringTokens. */
  estimateTokensFn?: (text: string) => number;

  /** Model alias for summarization. Required if llmCall provided. */
  summarizationModel?: string;
  /** max_tokens for the summarization LLM call. Default 1500. */
  summarizationMaxTokens?: number;
  /** Recent verbatim chars to retain at the END of accumulated_context. Default 4000. */
  retainRecentChars?: number;
  /** Decision history compression: keep last K decisions verbatim. Default 10. */
  retainRecentDecisions?: number;
  /** Retrieval cache LRU max size. Default 500 entries. */
  retrievalCacheMaxSize?: number;

  /** Optional callback for compression telemetry (any compression event type). */
  onCompressionEvent?: (event: CompressionEvent) => void;
  /** Optional async callback to persist evicted decisions (audit trail). */
  archiveDecisionsTo?: (decisions: readonly Decision[]) => Promise<void>;
  /** Optional async callback to persist evicted retrieval cache entries. */
  archiveCacheTo?: (entries: ReadonlyArray<readonly [string, unknown]>) => Promise<void>;
}

export interface CompressOptions {
  /**
   * Optional query string for retrieval-aware compression. Reserved for
   * future use; ContextManager does not currently call retrievalSearch
   * directly (Phase 3.4 will wire that into the agent loop). Stored on
   * the event for caller introspection.
   */
  stepQuery?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Constants + helpers
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_COMPRESSION_THRESHOLD = 0.7;
const DEFAULT_STRATEGY: CompressionStrategy = 'hybrid';
const DEFAULT_RETAIN_RECENT_CHARS = 4000;
const DEFAULT_RETAIN_RECENT_DECISIONS = 10;
const DEFAULT_CACHE_MAX_SIZE = 500;
const DEFAULT_SUMMARIZATION_MAX_TOKENS = 1500;

const CONTEXT_COMPACTION_SYSTEM_PROMPT = [
  'You compress an agent\'s scratchpad / running context.',
  'Preserve every material fact, decision, unresolved question, and open thread.',
  'Drop verbose narration, repetition, and intermediate reasoning that was already concluded.',
  'Output a tight, structured summary — no preamble, no apologies.',
].join(' ');

const DECISION_COMPACTION_SYSTEM_PROMPT = [
  'You summarize an agent\'s history of decisions.',
  'Output a single concise paragraph capturing the gist of all decisions provided —',
  'what was chosen, what was rejected, and why.',
  'No preamble, no apologies.',
].join(' ');

// ─────────────────────────────────────────────────────────────────────────
// ContextManager
// ─────────────────────────────────────────────────────────────────────────

export class ContextManager {
  private readonly contextTokenBudget: number;
  private readonly compressionThreshold: number;
  private readonly strategy: CompressionStrategy;
  private readonly llmCall: LlmCallFn | undefined;
  private readonly retrievalSearch: RetrievalSearchFn | undefined;
  private readonly estimateFn: (text: string) => number;
  private readonly summarizationModel: string | undefined;
  private readonly summarizationMaxTokens: number;
  private readonly retainRecentChars: number;
  private readonly retainRecentDecisions: number;
  private readonly retrievalCacheMaxSize: number;
  private readonly emit: (event: CompressionEvent) => void;
  private readonly archiveDecisionsTo: ((decisions: readonly Decision[]) => Promise<void>) | undefined;
  private readonly archiveCacheTo: ((entries: ReadonlyArray<readonly [string, unknown]>) => Promise<void>) | undefined;

  constructor(opts: ContextManagerOptions) {
    if (opts.contextTokenBudget <= 0) {
      throw new Error(`ContextManager: contextTokenBudget must be > 0 (got ${opts.contextTokenBudget})`);
    }
    const threshold = opts.compressionThreshold ?? DEFAULT_COMPRESSION_THRESHOLD;
    if (threshold <= 0 || threshold > 1) {
      throw new Error(`ContextManager: compressionThreshold must be in (0, 1] (got ${threshold})`);
    }
    const strategy = opts.strategy ?? DEFAULT_STRATEGY;
    const needsLlm = strategy === 'summarize-only' || strategy === 'hybrid';
    if (needsLlm && (!opts.llmCall || !opts.summarizationModel)) {
      throw new Error(
        `ContextManager: strategy='${strategy}' requires both llmCall and summarizationModel`,
      );
    }

    this.contextTokenBudget = opts.contextTokenBudget;
    this.compressionThreshold = threshold;
    this.strategy = strategy;
    this.llmCall = opts.llmCall;
    this.retrievalSearch = opts.retrievalSearch;
    this.estimateFn = opts.estimateTokensFn ?? estimateStringTokens;
    this.summarizationModel = opts.summarizationModel;
    this.summarizationMaxTokens = opts.summarizationMaxTokens ?? DEFAULT_SUMMARIZATION_MAX_TOKENS;
    this.retainRecentChars = opts.retainRecentChars ?? DEFAULT_RETAIN_RECENT_CHARS;
    this.retainRecentDecisions = opts.retainRecentDecisions ?? DEFAULT_RETAIN_RECENT_DECISIONS;
    this.retrievalCacheMaxSize = opts.retrievalCacheMaxSize ?? DEFAULT_CACHE_MAX_SIZE;
    this.emit = opts.onCompressionEvent ?? (() => {});
    this.archiveDecisionsTo = opts.archiveDecisionsTo;
    this.archiveCacheTo = opts.archiveCacheTo;

    if (this.retainRecentChars < 0) {
      throw new Error(`ContextManager: retainRecentChars must be >= 0 (got ${this.retainRecentChars})`);
    }
    if (this.retainRecentDecisions < 0 || !Number.isInteger(this.retainRecentDecisions)) {
      throw new Error(`ContextManager: retainRecentDecisions must be a non-negative integer (got ${this.retainRecentDecisions})`);
    }
    if (this.retrievalCacheMaxSize < 0 || !Number.isInteger(this.retrievalCacheMaxSize)) {
      throw new Error(`ContextManager: retrievalCacheMaxSize must be a non-negative integer (got ${this.retrievalCacheMaxSize})`);
    }
  }

  /** Estimate token count of a single text string. */
  estimateTokens(text: string): number {
    return this.estimateFn(text);
  }

  /** Returns true if the state's accumulated_context exceeds the configured threshold. */
  needsCompression(state: CheckpointStepState): boolean {
    const tokens = this.estimateTokens(state.accumulated_context);
    return tokens > this.contextTokenBudget * this.compressionThreshold;
  }

  /**
   * Compress accumulated_context per the configured strategy. Returns a NEW
   * state object (does not mutate input). If state's context is below the
   * threshold OR shorter than retainRecentChars, returns input unchanged.
   *
   * Strategies:
   *   - 'summarize-only': LLM-summarize older portion + retain recent
   *   - 'retrieve-only':  drop older portion + retain recent + emit archive event
   *   - 'hybrid':         summarize older + emit archive event for retrieval indexing
   */
  async compress(state: CheckpointStepState, opts: CompressOptions = {}): Promise<CheckpointStepState> {
    void opts; // stepQuery reserved for Phase 3.4 retrieval-aware compression
    const beforeTokens = this.estimateTokens(state.accumulated_context);
    if (!this.needsCompression(state)) {
      this.emit({
        type: 'context-compression-skipped',
        before_tokens: beforeTokens,
        after_tokens: beforeTokens,
        strategy: this.strategy,
        cost_usd: 0,
      });
      return state;
    }
    if (state.accumulated_context.length <= this.retainRecentChars) {
      // Context exceeds token budget but the entire string fits in retainRecentChars.
      // Nothing to safely compress without dropping the recent verbatim region.
      this.emit({
        type: 'context-compression-skipped',
        before_tokens: beforeTokens,
        after_tokens: beforeTokens,
        strategy: this.strategy,
        cost_usd: 0,
      });
      return state;
    }

    const splitAt = state.accumulated_context.length - this.retainRecentChars;
    const olderText = state.accumulated_context.slice(0, splitAt);
    const recentText = state.accumulated_context.slice(splitAt);
    const archivedRange: ArchivedContextRange = {
      archived_text: olderText,
      range_start: 0,
      range_end: splitAt,
    };

    let newContext: string;
    let costUsd = 0;

    if (this.strategy === 'retrieve-only') {
      newContext = `[archived: ${olderText.length} chars; see retrieval index]\n\n${recentText}`;
    } else {
      // summarize-only or hybrid — LLM-summarize the older portion.
      const summaryResult = await this._summarize(olderText);
      costUsd = summaryResult.cost_usd;
      const summaryText = summaryResult.summary;
      newContext = `[summary of ${olderText.length} archived chars]\n${summaryText}\n\n${recentText}`;
    }

    const afterTokens = this.estimateTokens(newContext);
    const newState: CheckpointStepState = {
      ...state,
      accumulated_context: newContext,
    };

    const event: ContextCompressionEvent = {
      type: 'context-compressed',
      before_tokens: beforeTokens,
      after_tokens: afterTokens,
      strategy: this.strategy,
      cost_usd: costUsd,
    };
    if (this.strategy === 'retrieve-only' || this.strategy === 'hybrid') {
      event.archived = archivedRange;
    }
    this.emit(event);
    return newState;
  }

  /**
   * LRU-evict retrieval_cache entries to fit retrievalCacheMaxSize. Returns
   * a NEW state object (does not mutate input). If cache size already fits,
   * returns input unchanged.
   *
   * If accessOrder is provided (keys ordered most-recent-LAST), entries
   * earlier in accessOrder are evicted first; keys not in accessOrder are
   * treated as oldest. Without accessOrder, evicts in insertion order
   * (JS spec preserves insertion order for string keys).
   */
  evictRetrievalCache(state: CheckpointStepState, opts: { accessOrder?: readonly string[] } = {}): CheckpointStepState {
    const entries = Object.entries(state.retrieval_cache);
    const beforeSize = entries.length;
    if (beforeSize <= this.retrievalCacheMaxSize) {
      return state;
    }

    let orderedKeys: string[];
    if (opts.accessOrder) {
      // accessOrder = recent-last → oldest at index 0.
      // Keys not present in accessOrder are oldest of all (prepend).
      const accessed = new Set(opts.accessOrder);
      const unaccessed = Object.keys(state.retrieval_cache).filter(k => !accessed.has(k));
      // Re-order accessOrder to only include keys actually in cache.
      const accessedInCache = opts.accessOrder.filter(k => k in state.retrieval_cache);
      orderedKeys = [...unaccessed, ...accessedInCache];
    } else {
      // Insertion order — already provided by Object.keys.
      orderedKeys = Object.keys(state.retrieval_cache);
    }

    const evictCount = beforeSize - this.retrievalCacheMaxSize;
    const evictedKeys = orderedKeys.slice(0, evictCount);
    const evictedSet = new Set(evictedKeys);

    const newCache: Record<string, unknown> = {};
    const evictedEntries: Array<[string, unknown]> = [];
    for (const [k, v] of entries) {
      if (evictedSet.has(k)) {
        evictedEntries.push([k, v]);
      } else {
        newCache[k] = v;
      }
    }

    if (this.archiveCacheTo) {
      void this.archiveCacheTo(evictedEntries);
    }

    this.emit({
      type: 'cache-evicted',
      before_size: beforeSize,
      after_size: Object.keys(newCache).length,
      evicted_count: evictedEntries.length,
    });

    return { ...state, retrieval_cache: newCache };
  }

  /**
   * Compress decision_history to keep only the last K verbatim plus one
   * rolled-up summary Decision representing the older bucket. Returns a NEW
   * state object (does not mutate input). If history length ≤ retainRecentDecisions,
   * returns input unchanged.
   *
   * If llmCall is configured, the older bucket is summarized via LLM call.
   * Otherwise a heuristic summary (concatenation of decision strings) is used.
   * If archiveDecisionsTo is set, the original older bucket is persisted
   * before compression for lossless audit trail.
   */
  async compressDecisionHistory(state: CheckpointStepState): Promise<CheckpointStepState> {
    const history = state.decision_history;
    const beforeCount = history.length;
    if (beforeCount <= this.retainRecentDecisions) {
      return state;
    }

    const splitAt = beforeCount - this.retainRecentDecisions;
    const olderBucket = history.slice(0, splitAt);
    const recentBucket = history.slice(splitAt);

    if (this.archiveDecisionsTo) {
      void this.archiveDecisionsTo(olderBucket);
    }

    let summaryText: string;
    let costUsd = 0;
    if (this.llmCall && this.summarizationModel) {
      const result = await this._summarizeDecisions(olderBucket);
      summaryText = result.summary;
      costUsd = result.cost_usd;
    } else {
      summaryText = buildHeuristicDecisionSummary(olderBucket);
    }

    const summaryDecision: Decision = {
      step_index: olderBucket[0]?.step_index ?? 0,
      decision: `[rolled-up summary of ${olderBucket.length} earlier decisions]`,
      rationale: summaryText,
    };

    const newHistory = [summaryDecision, ...recentBucket];
    const afterCount = newHistory.length;

    this.emit({
      type: 'decisions-compressed',
      before_count: beforeCount,
      after_count: afterCount,
      evicted_count: olderBucket.length,
      cost_usd: costUsd,
    });

    void CHECKPOINT_SCHEMA_VERSION; // pin import for forward-compat use
    return { ...state, decision_history: newHistory };
  }

  // ──────────────────────────────────────────────────────────────────────
  // Private — LLM summarization helpers
  // ──────────────────────────────────────────────────────────────────────

  private async _summarize(text: string): Promise<{ summary: string; cost_usd: number }> {
    if (!this.llmCall || !this.summarizationModel) {
      throw new Error('ContextManager: _summarize called without llmCall — constructor invariant violated');
    }
    const result = await this.llmCall({
      model: this.summarizationModel,
      messages: [
        { role: 'system', content: CONTEXT_COMPACTION_SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      maxTokens: this.summarizationMaxTokens,
      temperature: 0.1,
    });
    return { summary: result.content, cost_usd: result.costUsd };
  }

  private async _summarizeDecisions(decisions: readonly Decision[]): Promise<{ summary: string; cost_usd: number }> {
    if (!this.llmCall || !this.summarizationModel) {
      throw new Error('ContextManager: _summarizeDecisions called without llmCall — constructor invariant violated');
    }
    const formatted = decisions.map(d => {
      const parts = [`Step ${d.step_index}: ${d.decision}`];
      if (d.rationale) parts.push(`  rationale: ${d.rationale}`);
      if (d.alternatives_considered && d.alternatives_considered.length > 0) {
        parts.push(`  alternatives: ${d.alternatives_considered.join(' | ')}`);
      }
      return parts.join('\n');
    }).join('\n\n');

    const result = await this.llmCall({
      model: this.summarizationModel,
      messages: [
        { role: 'system', content: DECISION_COMPACTION_SYSTEM_PROMPT },
        { role: 'user', content: formatted },
      ],
      maxTokens: this.summarizationMaxTokens,
      temperature: 0.1,
    });
    return { summary: result.content, cost_usd: result.costUsd };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Heuristic summary fallback (no LLM)
// ─────────────────────────────────────────────────────────────────────────

function buildHeuristicDecisionSummary(decisions: readonly Decision[]): string {
  const lines = decisions.map(d => {
    const stepBit = `step ${d.step_index}: `;
    const decisionBit = d.decision.length > 80 ? d.decision.slice(0, 77) + '…' : d.decision;
    return stepBit + decisionBit;
  });
  return lines.join('; ');
}
