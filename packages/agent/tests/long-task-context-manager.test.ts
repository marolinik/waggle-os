/**
 * Tests for long-task/context-manager.ts (Phase 3.3 of agent-fix sprint).
 *
 * Coverage targets the PM brief acceptance gates:
 *   - Constructor validation (budget/threshold/strategy invariants)
 *   - Token estimation (default + injected estimateTokensFn)
 *   - needsCompression threshold semantics
 *   - compress() — 3 strategies (summarize-only / retrieve-only / hybrid)
 *   - compress() purity (returns new state, doesn't mutate)
 *   - compress() preserves last retainRecentChars verbatim
 *   - evictRetrievalCache() — LRU correctness (insertion order + accessOrder)
 *   - evictRetrievalCache() — archive callback fires
 *   - compressDecisionHistory() — bucket-summarize, last K verbatim, archive
 *   - All compression operations preserve other state fields unchanged
 *   - Replay determinism: deterministic llmCall → identical compressed output
 *   - End-to-end: state shrinks under combined ops within budget
 */

import { describe, it, expect, vi } from 'vitest';

import {
  CHECKPOINT_SCHEMA_VERSION,
  type CheckpointStepState,
  type Decision,
} from '../src/long-task/checkpoint.js';
import {
  ContextManager,
  type ContextManagerOptions,
  type CompressionEvent,
} from '../src/long-task/context-manager.js';
import type { LlmCallFn, LlmCallResult } from '../src/retrieval-agent-loop.js';

// ─────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────

function buildState(overrides: Partial<CheckpointStepState> = {}): CheckpointStepState {
  return {
    schema_version: CHECKPOINT_SCHEMA_VERSION,
    task_id: 'task-cm',
    run_id: 'run-cm',
    step_index: 0,
    timestamp_iso: '2026-04-27T00:00:00.000Z',
    step_action: 'work',
    step_input: {},
    step_output: {},
    accumulated_context: '',
    retrieval_cache: {},
    decision_history: [],
    ...overrides,
  };
}

function makeFakeLlmCall(opts: { content: string; costUsd?: number; latencyMs?: number } = { content: 'SUMMARY' }): {
  fn: LlmCallFn;
  calls: Array<{ model: string; messages: Array<{ role: string; content: string }> }>;
} {
  const calls: Array<{ model: string; messages: Array<{ role: string; content: string }> }> = [];
  const fn: LlmCallFn = async (input) => {
    calls.push({ model: input.model, messages: input.messages });
    const result: LlmCallResult = {
      content: opts.content,
      inTokens: 100,
      outTokens: 50,
      costUsd: opts.costUsd ?? 0.001,
      latencyMs: opts.latencyMs ?? 50,
    };
    return result;
  };
  return { fn, calls };
}

function makeMgr(overrides: Partial<ContextManagerOptions> & { events?: CompressionEvent[] } = {}): {
  mgr: ContextManager;
  events: CompressionEvent[];
} {
  const events: CompressionEvent[] = overrides.events ?? [];
  const opts: ContextManagerOptions = {
    contextTokenBudget: 1000,
    compressionThreshold: 0.7,
    strategy: 'retrieve-only', // no llmCall needed by default
    onCompressionEvent: (e) => events.push(e),
    ...overrides,
  };
  return { mgr: new ContextManager(opts), events };
}

// ─────────────────────────────────────────────────────────────────────────
// Constructor
// ─────────────────────────────────────────────────────────────────────────

describe('ContextManager — constructor', () => {
  it('rejects contextTokenBudget <= 0', () => {
    expect(() => new ContextManager({ contextTokenBudget: 0, strategy: 'retrieve-only' })).toThrow(/must be > 0/);
    expect(() => new ContextManager({ contextTokenBudget: -1, strategy: 'retrieve-only' })).toThrow(/must be > 0/);
  });

  it('rejects compressionThreshold outside (0, 1]', () => {
    expect(() => new ContextManager({ contextTokenBudget: 100, compressionThreshold: 0, strategy: 'retrieve-only' })).toThrow();
    expect(() => new ContextManager({ contextTokenBudget: 100, compressionThreshold: 1.1, strategy: 'retrieve-only' })).toThrow();
  });

  it('strategy=summarize-only requires llmCall + summarizationModel', () => {
    expect(() => new ContextManager({ contextTokenBudget: 100, strategy: 'summarize-only' }))
      .toThrow(/requires both llmCall and summarizationModel/);
    const { fn } = makeFakeLlmCall();
    expect(() => new ContextManager({ contextTokenBudget: 100, strategy: 'summarize-only', llmCall: fn }))
      .toThrow(/requires both llmCall and summarizationModel/);
  });

  it('strategy=hybrid requires llmCall + summarizationModel', () => {
    expect(() => new ContextManager({ contextTokenBudget: 100, strategy: 'hybrid' }))
      .toThrow(/requires both llmCall and summarizationModel/);
  });

  it('strategy=retrieve-only does NOT require llmCall', () => {
    expect(() => new ContextManager({ contextTokenBudget: 100, strategy: 'retrieve-only' })).not.toThrow();
  });

  it('rejects negative retainRecentChars', () => {
    expect(() => new ContextManager({ contextTokenBudget: 100, strategy: 'retrieve-only', retainRecentChars: -1 })).toThrow();
  });

  it('rejects non-integer retainRecentDecisions', () => {
    expect(() => new ContextManager({ contextTokenBudget: 100, strategy: 'retrieve-only', retainRecentDecisions: 1.5 })).toThrow();
  });

  it('rejects negative retrievalCacheMaxSize', () => {
    expect(() => new ContextManager({ contextTokenBudget: 100, strategy: 'retrieve-only', retrievalCacheMaxSize: -5 })).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Token estimation
// ─────────────────────────────────────────────────────────────────────────

describe('ContextManager — token estimation', () => {
  it('uses default content-aware estimator when no override given', () => {
    const { mgr } = makeMgr({ contextTokenBudget: 1000 });
    const tokens = mgr.estimateTokens('a'.repeat(400)); // prose ~ 4 chars/token
    expect(tokens).toBeGreaterThan(50);
    expect(tokens).toBeLessThan(150);
  });

  it('uses injected estimateTokensFn when provided', () => {
    const { mgr } = makeMgr({
      contextTokenBudget: 1000,
      estimateTokensFn: (text) => text.length,
    });
    expect(mgr.estimateTokens('hello')).toBe(5);
  });

  it('returns 0 for empty string with default estimator', () => {
    const { mgr } = makeMgr();
    expect(mgr.estimateTokens('')).toBe(0);
  });
});

describe('ContextManager — needsCompression', () => {
  it('false when accumulated_context is empty', () => {
    const { mgr } = makeMgr({ contextTokenBudget: 1000, compressionThreshold: 0.7 });
    expect(mgr.needsCompression(buildState())).toBe(false);
  });

  it('false when below threshold', () => {
    const { mgr } = makeMgr({
      contextTokenBudget: 1000,
      compressionThreshold: 0.7,
      estimateTokensFn: () => 500, // below 700
    });
    expect(mgr.needsCompression(buildState({ accumulated_context: 'x' }))).toBe(false);
  });

  it('true when above threshold', () => {
    const { mgr } = makeMgr({
      contextTokenBudget: 1000,
      compressionThreshold: 0.7,
      estimateTokensFn: () => 800, // above 700
    });
    expect(mgr.needsCompression(buildState({ accumulated_context: 'x' }))).toBe(true);
  });

  it('false when exactly at threshold (strict greater-than)', () => {
    const { mgr } = makeMgr({
      contextTokenBudget: 1000,
      compressionThreshold: 0.7,
      estimateTokensFn: () => 700, // equal to 700
    });
    expect(mgr.needsCompression(buildState({ accumulated_context: 'x' }))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// compress() — strategy: retrieve-only
// ─────────────────────────────────────────────────────────────────────────

describe('ContextManager — compress (retrieve-only)', () => {
  it('no-op when below threshold; emits skipped event', async () => {
    const { mgr, events } = makeMgr({
      contextTokenBudget: 1000,
      compressionThreshold: 0.7,
      estimateTokensFn: (t) => t.length,
    });
    const state = buildState({ accumulated_context: 'short' });
    const compressed = await mgr.compress(state);
    expect(compressed.accumulated_context).toBe('short');
    expect(events[0]?.type).toBe('context-compression-skipped');
  });

  it('compresses when above threshold', async () => {
    const text = 'x'.repeat(10000);
    const { mgr, events } = makeMgr({
      contextTokenBudget: 100,
      compressionThreshold: 0.7,
      strategy: 'retrieve-only',
      retainRecentChars: 200,
    });
    const state = buildState({ accumulated_context: text });
    const compressed = await mgr.compress(state);
    expect(compressed.accumulated_context.length).toBeLessThan(text.length);
    expect(compressed.accumulated_context).toContain('[archived:');
    expect(events.some(e => e.type === 'context-compressed')).toBe(true);
  });

  it('preserves last retainRecentChars verbatim', async () => {
    const older = 'A'.repeat(5000);
    const recent = 'RECENT_TAIL_MARKER';
    const { mgr } = makeMgr({
      contextTokenBudget: 100,
      strategy: 'retrieve-only',
      retainRecentChars: recent.length,
    });
    const state = buildState({ accumulated_context: older + recent });
    const compressed = await mgr.compress(state);
    expect(compressed.accumulated_context.endsWith(recent)).toBe(true);
  });

  it('emits archived range with correct offsets', async () => {
    const older = 'X'.repeat(1000);
    const recent = 'Y'.repeat(100);
    const { mgr, events } = makeMgr({
      contextTokenBudget: 100,
      strategy: 'retrieve-only',
      retainRecentChars: 100,
    });
    await mgr.compress(buildState({ accumulated_context: older + recent }));
    const evt = events.find(e => e.type === 'context-compressed');
    expect(evt && 'archived' in evt && evt.archived).toMatchObject({
      range_start: 0,
      range_end: 1000,
    });
    expect((evt as any).archived?.archived_text).toBe(older);
  });

  it('does NOT call llmCall under retrieve-only', async () => {
    const { fn, calls } = makeFakeLlmCall();
    const { mgr } = makeMgr({
      contextTokenBudget: 100,
      strategy: 'retrieve-only',
      llmCall: fn,
      summarizationModel: 'budget',
      retainRecentChars: 50,
    });
    await mgr.compress(buildState({ accumulated_context: 'a'.repeat(2000) }));
    expect(calls.length).toBe(0);
  });

  it('returns a NEW state (does not mutate input)', async () => {
    const { mgr } = makeMgr({
      contextTokenBudget: 100,
      strategy: 'retrieve-only',
      retainRecentChars: 50,
    });
    const state = buildState({ accumulated_context: 'x'.repeat(2000) });
    const original = state.accumulated_context;
    const compressed = await mgr.compress(state);
    expect(state.accumulated_context).toBe(original);
    expect(compressed).not.toBe(state);
  });

  it('preserves all other state fields unchanged', async () => {
    const { mgr } = makeMgr({
      contextTokenBudget: 100,
      strategy: 'retrieve-only',
      retainRecentChars: 50,
    });
    const state = buildState({
      accumulated_context: 'x'.repeat(2000),
      retrieval_cache: { 'q:1': ['a'] },
      decision_history: [{ step_index: 0, decision: 'd' }],
      step_input: { x: 1 },
      step_output: { y: 2 },
    });
    const compressed = await mgr.compress(state);
    expect(compressed.retrieval_cache).toEqual({ 'q:1': ['a'] });
    expect(compressed.decision_history).toEqual([{ step_index: 0, decision: 'd' }]);
    expect(compressed.step_input).toEqual({ x: 1 });
    expect(compressed.step_output).toEqual({ y: 2 });
    expect(compressed.task_id).toBe(state.task_id);
    expect(compressed.step_index).toBe(state.step_index);
  });

  it('no-op when entire context fits within retainRecentChars', async () => {
    const { mgr, events } = makeMgr({
      contextTokenBudget: 10,
      compressionThreshold: 0.5,
      estimateTokensFn: (t) => t.length, // forces above threshold
      strategy: 'retrieve-only',
      retainRecentChars: 5000,
    });
    const state = buildState({ accumulated_context: 'short text' });
    const compressed = await mgr.compress(state);
    expect(compressed).toBe(state); // identical reference — no-op
    expect(events.some(e => e.type === 'context-compression-skipped')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// compress() — strategy: summarize-only
// ─────────────────────────────────────────────────────────────────────────

describe('ContextManager — compress (summarize-only)', () => {
  it('calls llmCall when above threshold', async () => {
    const { fn, calls } = makeFakeLlmCall({ content: 'CONDENSED_FACTS' });
    const { mgr } = makeMgr({
      contextTokenBudget: 100,
      strategy: 'summarize-only',
      llmCall: fn,
      summarizationModel: 'budget-model',
      retainRecentChars: 50,
    });
    const state = buildState({ accumulated_context: 'A'.repeat(2000) });
    const compressed = await mgr.compress(state);
    expect(calls.length).toBe(1);
    expect(calls[0]?.model).toBe('budget-model');
    expect(compressed.accumulated_context).toContain('CONDENSED_FACTS');
  });

  it('event reports cost from llmCall', async () => {
    const { fn } = makeFakeLlmCall({ content: 's', costUsd: 0.0042 });
    const { mgr, events } = makeMgr({
      contextTokenBudget: 100,
      strategy: 'summarize-only',
      llmCall: fn,
      summarizationModel: 'budget',
      retainRecentChars: 50,
    });
    await mgr.compress(buildState({ accumulated_context: 'a'.repeat(2000) }));
    const evt = events.find(e => e.type === 'context-compressed');
    expect((evt as any).cost_usd).toBe(0.0042);
  });

  it('does NOT emit archived event for summarize-only', async () => {
    const { fn } = makeFakeLlmCall();
    const { mgr, events } = makeMgr({
      contextTokenBudget: 100,
      strategy: 'summarize-only',
      llmCall: fn,
      summarizationModel: 'b',
      retainRecentChars: 50,
    });
    await mgr.compress(buildState({ accumulated_context: 'a'.repeat(2000) }));
    const evt = events.find(e => e.type === 'context-compressed');
    expect((evt as any).archived).toBeUndefined();
  });

  it('preserves recent verbatim alongside summary', async () => {
    const { fn } = makeFakeLlmCall({ content: 'GIST' });
    const recent = 'TAIL_OF_RECENT_TEXT__';
    const { mgr } = makeMgr({
      contextTokenBudget: 100,
      strategy: 'summarize-only',
      llmCall: fn,
      summarizationModel: 'b',
      retainRecentChars: recent.length,
    });
    const state = buildState({ accumulated_context: 'x'.repeat(2000) + recent });
    const compressed = await mgr.compress(state);
    expect(compressed.accumulated_context).toContain('GIST');
    expect(compressed.accumulated_context.endsWith(recent)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// compress() — strategy: hybrid
// ─────────────────────────────────────────────────────────────────────────

describe('ContextManager — compress (hybrid)', () => {
  it('summarizes AND emits archived event', async () => {
    const { fn, calls } = makeFakeLlmCall({ content: 'GIST' });
    const { mgr, events } = makeMgr({
      contextTokenBudget: 100,
      strategy: 'hybrid',
      llmCall: fn,
      summarizationModel: 'b',
      retainRecentChars: 50,
    });
    await mgr.compress(buildState({ accumulated_context: 'a'.repeat(2000) }));
    expect(calls.length).toBe(1); // LLM was called
    const evt = events.find(e => e.type === 'context-compressed');
    expect((evt as any).archived).toBeDefined();
    expect((evt as any).strategy).toBe('hybrid');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// evictRetrievalCache
// ─────────────────────────────────────────────────────────────────────────

describe('ContextManager — evictRetrievalCache', () => {
  it('no-op when cache size <= maxSize', () => {
    const { mgr } = makeMgr({ retrievalCacheMaxSize: 5 });
    const state = buildState({ retrieval_cache: { a: 1, b: 2, c: 3 } });
    const result = mgr.evictRetrievalCache(state);
    expect(result).toBe(state);
  });

  it('drops oldest entries by insertion order without accessOrder', () => {
    const { mgr } = makeMgr({ retrievalCacheMaxSize: 2 });
    const cache: Record<string, unknown> = { a: 1, b: 2, c: 3, d: 4 };
    const result = mgr.evictRetrievalCache(buildState({ retrieval_cache: cache }));
    expect(Object.keys(result.retrieval_cache).sort()).toEqual(['c', 'd']);
  });

  it('keeps most-recently-accessed when accessOrder provided', () => {
    const { mgr } = makeMgr({ retrievalCacheMaxSize: 2 });
    const cache: Record<string, unknown> = { a: 1, b: 2, c: 3, d: 4 };
    // Access order: a was first accessed, d was most recent.
    const result = mgr.evictRetrievalCache(buildState({ retrieval_cache: cache }), {
      accessOrder: ['a', 'b', 'c', 'd'],
    });
    expect(Object.keys(result.retrieval_cache).sort()).toEqual(['c', 'd']);
  });

  it('treats keys NOT in accessOrder as oldest (evict first)', () => {
    const { mgr } = makeMgr({ retrievalCacheMaxSize: 2 });
    const cache: Record<string, unknown> = { a: 1, b: 2, c: 3, d: 4 };
    // Only 'c' and 'd' have access timestamps; 'a' and 'b' never accessed.
    const result = mgr.evictRetrievalCache(buildState({ retrieval_cache: cache }), {
      accessOrder: ['c', 'd'],
    });
    // 'a' and 'b' have no access timestamps → oldest → evicted first.
    expect(Object.keys(result.retrieval_cache).sort()).toEqual(['c', 'd']);
  });

  it('emits cache-evicted event with before/after/evicted counts', () => {
    const { mgr, events } = makeMgr({ retrievalCacheMaxSize: 2 });
    const cache: Record<string, unknown> = { a: 1, b: 2, c: 3, d: 4 };
    mgr.evictRetrievalCache(buildState({ retrieval_cache: cache }));
    const evt = events.find(e => e.type === 'cache-evicted');
    expect(evt).toEqual({
      type: 'cache-evicted',
      before_size: 4,
      after_size: 2,
      evicted_count: 2,
    });
  });

  it('archiveCacheTo callback fires with evicted entries', async () => {
    const archived: Array<readonly [string, unknown]> = [];
    const { mgr } = makeMgr({
      retrievalCacheMaxSize: 1,
      archiveCacheTo: async (entries) => {
        for (const e of entries) archived.push(e);
      },
    });
    const cache: Record<string, unknown> = { a: 1, b: 2, c: 3 };
    mgr.evictRetrievalCache(buildState({ retrieval_cache: cache }));
    // Wait a tick for the archive promise to settle.
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(archived.length).toBe(2);
  });

  it('preserves all other state fields unchanged', () => {
    const { mgr } = makeMgr({ retrievalCacheMaxSize: 1 });
    const state = buildState({
      retrieval_cache: { a: 1, b: 2 },
      accumulated_context: 'CTX',
      decision_history: [{ step_index: 0, decision: 'd' }],
      step_input: { x: 1 },
    });
    const result = mgr.evictRetrievalCache(state);
    expect(result.accumulated_context).toBe('CTX');
    expect(result.decision_history).toEqual(state.decision_history);
    expect(result.step_input).toEqual(state.step_input);
  });

  it('returns a NEW state (does not mutate input)', () => {
    const { mgr } = makeMgr({ retrievalCacheMaxSize: 1 });
    const state = buildState({ retrieval_cache: { a: 1, b: 2 } });
    const original = { ...state.retrieval_cache };
    mgr.evictRetrievalCache(state);
    expect(state.retrieval_cache).toEqual(original);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// compressDecisionHistory
// ─────────────────────────────────────────────────────────────────────────

describe('ContextManager — compressDecisionHistory', () => {
  const decs = (n: number): readonly Decision[] =>
    Array.from({ length: n }, (_, i) => ({ step_index: i, decision: `d-${i}` }));

  it('no-op when history.length <= retainRecentDecisions', async () => {
    const { mgr } = makeMgr({ retainRecentDecisions: 10 });
    const state = buildState({ decision_history: decs(5) });
    const result = await mgr.compressDecisionHistory(state);
    expect(result).toBe(state);
  });

  it('keeps last K verbatim and prepends one summary Decision', async () => {
    const { mgr } = makeMgr({ retainRecentDecisions: 3 });
    const state = buildState({ decision_history: decs(10) });
    const result = await mgr.compressDecisionHistory(state);
    expect(result.decision_history.length).toBe(4); // 1 summary + 3 verbatim
    expect(result.decision_history[1]).toEqual({ step_index: 7, decision: 'd-7' });
    expect(result.decision_history[2]).toEqual({ step_index: 8, decision: 'd-8' });
    expect(result.decision_history[3]).toEqual({ step_index: 9, decision: 'd-9' });
  });

  it('summary decision references rolled-up count', async () => {
    const { mgr } = makeMgr({ retainRecentDecisions: 3 });
    const state = buildState({ decision_history: decs(10) });
    const result = await mgr.compressDecisionHistory(state);
    const summary = result.decision_history[0];
    expect(summary?.decision).toContain('rolled-up');
    expect(summary?.decision).toContain('7'); // 10 - 3 = 7 evicted
  });

  it('uses heuristic summary when llmCall not configured', async () => {
    const { mgr } = makeMgr({ retainRecentDecisions: 2 });
    const state = buildState({ decision_history: decs(5) });
    const result = await mgr.compressDecisionHistory(state);
    const summary = result.decision_history[0];
    // Heuristic: concatenated decision strings
    expect(summary?.rationale).toContain('d-0');
    expect(summary?.rationale).toContain('d-1');
    expect(summary?.rationale).toContain('d-2');
  });

  it('uses LLM summary when llmCall configured', async () => {
    const { fn, calls } = makeFakeLlmCall({ content: 'LLM_DECISION_SUMMARY' });
    const { mgr } = makeMgr({
      retainRecentDecisions: 2,
      strategy: 'summarize-only',
      llmCall: fn,
      summarizationModel: 'budget',
    });
    const state = buildState({ decision_history: decs(5) });
    const result = await mgr.compressDecisionHistory(state);
    expect(calls.length).toBe(1);
    expect(result.decision_history[0]?.rationale).toBe('LLM_DECISION_SUMMARY');
  });

  it('emits decisions-compressed event with counts + cost', async () => {
    const { fn } = makeFakeLlmCall({ content: 's', costUsd: 0.0007 });
    const { mgr, events } = makeMgr({
      retainRecentDecisions: 2,
      strategy: 'summarize-only',
      llmCall: fn,
      summarizationModel: 'b',
    });
    await mgr.compressDecisionHistory(buildState({ decision_history: decs(5) }));
    const evt = events.find(e => e.type === 'decisions-compressed');
    expect(evt).toEqual({
      type: 'decisions-compressed',
      before_count: 5,
      after_count: 3, // 1 summary + 2 verbatim
      evicted_count: 3,
      cost_usd: 0.0007,
    });
  });

  it('archiveDecisionsTo fires with the older bucket', async () => {
    const archived: Decision[] = [];
    const { mgr } = makeMgr({
      retainRecentDecisions: 2,
      archiveDecisionsTo: async (older) => {
        for (const d of older) archived.push(d);
      },
    });
    await mgr.compressDecisionHistory(buildState({ decision_history: decs(5) }));
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(archived.length).toBe(3); // 5 - 2 = 3 archived
    expect(archived.map(d => d.decision)).toEqual(['d-0', 'd-1', 'd-2']);
  });

  it('returns a NEW state and does not mutate input decision_history', async () => {
    const { mgr } = makeMgr({ retainRecentDecisions: 2 });
    const state = buildState({ decision_history: decs(5) });
    const originalLen = state.decision_history.length;
    const result = await mgr.compressDecisionHistory(state);
    expect(state.decision_history.length).toBe(originalLen);
    expect(result).not.toBe(state);
  });

  it('preserves all other state fields unchanged', async () => {
    const { mgr } = makeMgr({ retainRecentDecisions: 2 });
    const state = buildState({
      decision_history: decs(5),
      accumulated_context: 'CTX',
      retrieval_cache: { x: 1 },
    });
    const result = await mgr.compressDecisionHistory(state);
    expect(result.accumulated_context).toBe('CTX');
    expect(result.retrieval_cache).toEqual({ x: 1 });
    expect(result.task_id).toBe(state.task_id);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Replay determinism
// ─────────────────────────────────────────────────────────────────────────

describe('ContextManager — replay determinism', () => {
  it('deterministic llmCall → identical compressed output across two runs', async () => {
    const { fn: fnA } = makeFakeLlmCall({ content: 'STABLE_SUMMARY', costUsd: 0.001 });
    const { fn: fnB } = makeFakeLlmCall({ content: 'STABLE_SUMMARY', costUsd: 0.001 });
    const optsBase = (fn: LlmCallFn): ContextManagerOptions => ({
      contextTokenBudget: 100,
      strategy: 'summarize-only',
      llmCall: fn,
      summarizationModel: 'b',
      retainRecentChars: 50,
    });
    const a = new ContextManager(optsBase(fnA));
    const b = new ContextManager(optsBase(fnB));
    const state = buildState({ accumulated_context: 'a'.repeat(2000) });
    const ra = await a.compress(state);
    const rb = await b.compress(state);
    expect(ra.accumulated_context).toBe(rb.accumulated_context);
  });

  it('insertion-order LRU is deterministic', () => {
    const { mgr: mgrA } = makeMgr({ retrievalCacheMaxSize: 2 });
    const { mgr: mgrB } = makeMgr({ retrievalCacheMaxSize: 2 });
    const cache: Record<string, unknown> = { a: 1, b: 2, c: 3, d: 4 };
    const ra = mgrA.evictRetrievalCache(buildState({ retrieval_cache: cache }));
    const rb = mgrB.evictRetrievalCache(buildState({ retrieval_cache: cache }));
    expect(Object.keys(ra.retrieval_cache)).toEqual(Object.keys(rb.retrieval_cache));
  });
});

// ─────────────────────────────────────────────────────────────────────────
// End-to-end
// ─────────────────────────────────────────────────────────────────────────

describe('ContextManager — end-to-end shrinking', () => {
  it('compress + evict + compressDecisionHistory yields fully shrunk state', async () => {
    const { fn } = makeFakeLlmCall({ content: 'CONDENSED' });
    const mgr = new ContextManager({
      contextTokenBudget: 100,
      compressionThreshold: 0.7,
      strategy: 'summarize-only',
      llmCall: fn,
      summarizationModel: 'b',
      retainRecentChars: 50,
      retainRecentDecisions: 2,
      retrievalCacheMaxSize: 2,
    });
    const state = buildState({
      accumulated_context: 'verbose-text-'.repeat(500), // ~6500 chars
      decision_history: Array.from({ length: 10 }, (_, i) => ({ step_index: i, decision: `d-${i}` })),
      retrieval_cache: Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [`q-${i}`, [`r-${i}`]]),
      ),
    });

    const beforeContextTokens = mgr.estimateTokens(state.accumulated_context);
    expect(beforeContextTokens).toBeGreaterThan(70); // above threshold

    let s = await mgr.compress(state);
    s = mgr.evictRetrievalCache(s);
    s = await mgr.compressDecisionHistory(s);

    const afterContextTokens = mgr.estimateTokens(s.accumulated_context);
    expect(afterContextTokens).toBeLessThan(beforeContextTokens);
    expect(s.decision_history.length).toBe(3); // 1 summary + 2 verbatim
    expect(Object.keys(s.retrieval_cache).length).toBe(2);
  });
});
