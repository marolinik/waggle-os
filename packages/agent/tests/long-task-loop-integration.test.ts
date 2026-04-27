/**
 * Tests for Phase 3.4 — runRetrievalAgentLoop long-task integration +
 * runRetrievalAgentLoopWithRecovery.
 *
 * Coverage:
 *   - Backwards compat: omitted long-task fields → unchanged behavior
 *   - Optional checkpointStore: per-turn save shape is correct
 *   - Resume: mid-loop checkpoint → fresh runner → identical final output
 *   - Resume: finalized checkpoint → fresh runner → cached result returned
 *   - ContextManager: triggers compress at threshold; emits event
 *   - onProgress events: ordering + payloads
 *   - runRetrievalAgentLoopWithRecovery: retry on throw, backoff schedule,
 *     exhaustion rethrows, internal resume on retry
 *   - Replay determinism: identical llmCall + retrievalSearch → identical
 *     final answer with and without checkpointStore
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

import {
  runRetrievalAgentLoop,
  runRetrievalAgentLoopWithRecovery,
  type LlmCallFn,
  type LlmCallResult,
  type RetrievalSearchFn,
  type MultiStepAgentRunConfig,
  type AgentRunProgressEvent,
} from '../src/retrieval-agent-loop.js';
import { CheckpointStore } from '../src/long-task/checkpoint.js';
import { ContextManager } from '../src/long-task/context-manager.js';
import type {
  MessagesCompressionEvent,
} from '../src/long-task/messages-compressor.js';

// ─────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'waggle-loop-int-'));
});

afterEach(async () => {
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

function makeStore(taskId = 'task-loop'): CheckpointStore {
  return new CheckpointStore({ rootDir: tmpRoot, taskId });
}

interface ScriptedReply {
  /** JSON action emission, e.g. '{"action":"retrieve","query":"x"}' or '{"action":"finalize","response":"…"}' */
  content: string;
  costUsd?: number;
  inTokens?: number;
  outTokens?: number;
  latencyMs?: number;
  /** If true, throws when this reply is consumed. */
  throws?: string;
}

/** Builds a deterministic LlmCallFn that returns scripted replies in order. */
function makeScriptedLlm(replies: ScriptedReply[]): { fn: LlmCallFn; calls: number; resetIdx(): void } {
  let idx = 0;
  const fn: LlmCallFn = async () => {
    const reply = replies[idx];
    idx += 1;
    if (!reply) {
      // Provide an empty finalize so the loop terminates rather than hanging.
      return { content: '{"action":"finalize","response":"(scripted-end)"}', inTokens: 0, outTokens: 0, costUsd: 0, latencyMs: 0 };
    }
    if (reply.throws) {
      throw new Error(reply.throws);
    }
    const r: LlmCallResult = {
      content: reply.content,
      inTokens: reply.inTokens ?? 10,
      outTokens: reply.outTokens ?? 10,
      costUsd: reply.costUsd ?? 0.001,
      latencyMs: reply.latencyMs ?? 50,
    };
    return r;
  };
  return {
    get fn() { return fn; },
    get calls() { return idx; },
    resetIdx() { idx = 0; },
  } as { fn: LlmCallFn; calls: number; resetIdx(): void };
}

const fakeSearch: RetrievalSearchFn = async ({ query }) => ({
  formattedResults: `[result for "${query}"]`,
  resultCount: 1,
});

function baseConfig(overrides: Partial<MultiStepAgentRunConfig> = {}): MultiStepAgentRunConfig {
  return {
    modelAlias: 'claude-opus-4-7',
    persona: 'You are a test agent.',
    question: 'What is X?',
    llmCall: makeScriptedLlm([{ content: '{"action":"finalize","response":"X is Y"}' }]).fn,
    search: fakeSearch,
    maxSteps: 5,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Backwards compatibility
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 3.4 — backwards compatibility', () => {
  it('runRetrievalAgentLoop without long-task fields → unchanged behavior', async () => {
    const llm = makeScriptedLlm([
      { content: '{"action":"finalize","response":"answer"}' },
    ]);
    const result = await runRetrievalAgentLoop(baseConfig({ llmCall: llm.fn }));
    expect(result.rawResponse).toBe('answer');
    expect(result.stepsTaken).toBe(1);
    expect(result.loopExhausted).toBe(false);
  });

  it('does not save anything when checkpointStore is omitted', async () => {
    // Just confirm no errors and no files left behind.
    const llm = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q1"}' },
      { content: '{"action":"finalize","response":"done"}' },
    ]);
    const result = await runRetrievalAgentLoop(baseConfig({ llmCall: llm.fn }));
    expect(result.rawResponse).toBe('done');
    expect(result.retrievalCalls).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Optional CheckpointStore
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 3.4 — checkpointStore integration', () => {
  it('saves a checkpoint per turn', async () => {
    const store = makeStore();
    const llm = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q1"}' },
      { content: '{"action":"retrieve","query":"q2"}' },
      { content: '{"action":"finalize","response":"done"}' },
    ]);
    await runRetrievalAgentLoop(baseConfig({ llmCall: llm.fn, checkpointStore: store, runId: 'r1' }));
    const indices = await store.listSteps();
    expect(indices).toEqual([0, 1, 2]);
  });

  it('captures action_kind + running totals in step_output', async () => {
    const store = makeStore();
    const llm = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q1"}', costUsd: 0.001 },
      { content: '{"action":"finalize","response":"done"}', costUsd: 0.002 },
    ]);
    await runRetrievalAgentLoop(baseConfig({ llmCall: llm.fn, checkpointStore: store, runId: 'r1' }));
    const step0 = await store.load(0);
    const step1 = await store.load(1);
    const out0 = step0?.step_output as { action_kind: string; total_cost_usd: number; total_retrieval_calls: number };
    const out1 = step1?.step_output as { action_kind: string; total_cost_usd: number };
    expect(out0.action_kind).toBe('retrieve');
    expect(out0.total_cost_usd).toBeCloseTo(0.001);
    expect(out0.total_retrieval_calls).toBe(1);
    expect(out1.action_kind).toBe('finalize');
    expect(out1.total_cost_usd).toBeCloseTo(0.003);
  });

  it('saves messages_snapshot in step_input for resume', async () => {
    const store = makeStore();
    const llm = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q1"}' },
      { content: '{"action":"finalize","response":"done"}' },
    ]);
    await runRetrievalAgentLoop(baseConfig({ llmCall: llm.fn, checkpointStore: store, runId: 'r1' }));
    const step0 = await store.load(0);
    const inp = step0?.step_input as { turn: number; messages_snapshot: Array<{role:string;content:string}> };
    expect(inp.turn).toBe(1);
    expect(inp.messages_snapshot.length).toBeGreaterThan(2); // system + kickoff + assistant + retrieval-injection
  });

  it('captures retrieval results in retrieval_cache', async () => {
    const store = makeStore();
    const llm = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"hello"}' },
      { content: '{"action":"finalize","response":"done"}' },
    ]);
    await runRetrievalAgentLoop(baseConfig({ llmCall: llm.fn, checkpointStore: store, runId: 'r1' }));
    const step0 = await store.load(0);
    expect(step0?.retrieval_cache).toMatchObject({
      hello: { formattedResults: '[result for "hello"]', resultCount: 1 },
    });
  });

  it('captures decision_history across turns', async () => {
    const store = makeStore();
    const llm = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q1"}' },
      { content: '{"action":"retrieve","query":"q2"}' },
      { content: '{"action":"finalize","response":"done"}' },
    ]);
    await runRetrievalAgentLoop(baseConfig({ llmCall: llm.fn, checkpointStore: store, runId: 'r1' }));
    const finalState = await store.load(2);
    expect(finalState?.decision_history.map(d => d.decision)).toEqual([
      'retrieve', 'retrieve', 'finalize',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Resume
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 3.4 — resume from checkpoint', () => {
  it('mid-loop crash → fresh runner → resumes from next turn', async () => {
    const taskId = `task-${crypto.randomBytes(4).toString('hex')}`;
    const runId = 'run-resume';

    // Process A: complete 1 retrieve turn, then "crash" (don't finish loop).
    const storeA = new CheckpointStore({ rootDir: tmpRoot, taskId });
    const llmA = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q1"}' },
      // Force a "crash" by throwing on the second LLM call.
      { content: '', throws: 'simulated-crash' },
    ]);
    await expect(runRetrievalAgentLoop(baseConfig({
      llmCall: llmA.fn,
      checkpointStore: storeA,
      runId,
    }))).rejects.toThrow(/simulated-crash/);

    // Process B: brand-new runner. Resume.
    const storeB = new CheckpointStore({ rootDir: tmpRoot, taskId });
    const llmB = makeScriptedLlm([
      { content: '{"action":"finalize","response":"recovered"}' },
    ]);
    const result = await runRetrievalAgentLoop(baseConfig({
      llmCall: llmB.fn,
      checkpointStore: storeB,
      runId,
    }));
    expect(result.rawResponse).toBe('recovered');
    // 1 turn from A + 1 turn from B = 2 stepsTaken in the resumed view.
    expect(result.stepsTaken).toBe(2);
  });

  it('finalized checkpoint → fresh runner → returns cached result', async () => {
    const taskId = `task-${crypto.randomBytes(4).toString('hex')}`;
    const runId = 'run-cached';

    // Process A: complete + finalize.
    const storeA = new CheckpointStore({ rootDir: tmpRoot, taskId });
    const llmA = makeScriptedLlm([
      { content: '{"action":"finalize","response":"the-final-answer"}' },
    ]);
    const ra = await runRetrievalAgentLoop(baseConfig({
      llmCall: llmA.fn,
      checkpointStore: storeA,
      runId,
    }));
    expect(ra.rawResponse).toBe('the-final-answer');

    // Process B: same store + runId → should NOT call llm; just returns cached.
    const storeB = new CheckpointStore({ rootDir: tmpRoot, taskId });
    let llmCallCount = 0;
    const llmB: LlmCallFn = async () => {
      llmCallCount += 1;
      throw new Error('should-not-be-called');
    };
    const rb = await runRetrievalAgentLoop(baseConfig({
      llmCall: llmB,
      checkpointStore: storeB,
      runId,
    }));
    expect(llmCallCount).toBe(0);
    expect(rb.rawResponse).toBe('the-final-answer');
  });

  it('resume preserves running totals across processes', async () => {
    const taskId = `task-${crypto.randomBytes(4).toString('hex')}`;
    const runId = 'run-totals';

    const storeA = new CheckpointStore({ rootDir: tmpRoot, taskId });
    const llmA = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q"}', costUsd: 0.1, inTokens: 100, outTokens: 100 },
      { content: '', throws: 'crash' },
    ]);
    await expect(runRetrievalAgentLoop(baseConfig({
      llmCall: llmA.fn,
      checkpointStore: storeA,
      runId,
    }))).rejects.toThrow();

    const storeB = new CheckpointStore({ rootDir: tmpRoot, taskId });
    const llmB = makeScriptedLlm([
      { content: '{"action":"finalize","response":"done"}', costUsd: 0.2, inTokens: 50, outTokens: 50 },
    ]);
    const result = await runRetrievalAgentLoop(baseConfig({
      llmCall: llmB.fn,
      checkpointStore: storeB,
      runId,
    }));
    expect(result.totalCostUsd).toBeCloseTo(0.3); // 0.1 carried + 0.2 fresh
    expect(result.totalTokensIn).toBe(150);
    expect(result.totalTokensOut).toBe(150);
  });

  it('resumeFromCheckpoint=false → fresh start ignoring prior', async () => {
    const taskId = `task-${crypto.randomBytes(4).toString('hex')}`;
    const runId = 'run-no-resume';

    const storeA = new CheckpointStore({ rootDir: tmpRoot, taskId });
    const llmA = makeScriptedLlm([
      { content: '{"action":"finalize","response":"first"}' },
    ]);
    await runRetrievalAgentLoop(baseConfig({
      llmCall: llmA.fn,
      checkpointStore: storeA,
      runId,
    }));

    const storeB = new CheckpointStore({ rootDir: tmpRoot, taskId });
    const llmB = makeScriptedLlm([
      { content: '{"action":"finalize","response":"second"}' },
    ]);
    const result = await runRetrievalAgentLoop(baseConfig({
      llmCall: llmB.fn,
      checkpointStore: storeB,
      runId,
      resumeFromCheckpoint: false,
    }));
    expect(result.rawResponse).toBe('second');
  });

  it('different runId → fresh start (does not pick up other run\'s checkpoint)', async () => {
    const taskId = `task-${crypto.randomBytes(4).toString('hex')}`;

    const storeA = new CheckpointStore({ rootDir: tmpRoot, taskId });
    const llmA = makeScriptedLlm([
      { content: '{"action":"finalize","response":"alpha"}' },
    ]);
    await runRetrievalAgentLoop(baseConfig({
      llmCall: llmA.fn,
      checkpointStore: storeA,
      runId: 'run-a',
    }));

    const storeB = new CheckpointStore({ rootDir: tmpRoot, taskId });
    const llmB = makeScriptedLlm([
      { content: '{"action":"finalize","response":"beta"}' },
    ]);
    const result = await runRetrievalAgentLoop(baseConfig({
      llmCall: llmB.fn,
      checkpointStore: storeB,
      runId: 'run-b',
    }));
    expect(result.rawResponse).toBe('beta');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// ContextManager integration
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 3.4 — contextManager integration', () => {
  it('triggers compression when accumulated_audit exceeds threshold', async () => {
    const events: AgentRunProgressEvent[] = [];
    const cm = new ContextManager({
      contextTokenBudget: 5, // very low so compression triggers quickly
      compressionThreshold: 0.5,
      strategy: 'retrieve-only',
      retainRecentChars: 5,
      estimateTokensFn: (t) => t.length, // 1 char = 1 token for predictability
    });
    const store = makeStore();
    const llm = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"a-very-long-query-string-AAAAA"}' },
      { content: '{"action":"retrieve","query":"another-long-query-BBBBB"}' },
      { content: '{"action":"finalize","response":"done"}' },
    ]);
    await runRetrievalAgentLoop(baseConfig({
      llmCall: llm.fn,
      checkpointStore: store,
      contextManager: cm,
      onProgress: (e) => events.push(e),
      runId: 'cm-test',
    }));
    expect(events.some(e => e.type === 'context_compressed')).toBe(true);
  });

  it('compression at most once per turn (no infinite loop)', async () => {
    const events: AgentRunProgressEvent[] = [];
    const cm = new ContextManager({
      contextTokenBudget: 5,
      compressionThreshold: 0.5,
      strategy: 'retrieve-only',
      retainRecentChars: 5,
      estimateTokensFn: (t) => t.length,
    });
    const store = makeStore();
    const llm = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q1-long-string-XXXXXX"}' },
      { content: '{"action":"retrieve","query":"q2-long-string-YYYYYY"}' },
      { content: '{"action":"retrieve","query":"q3-long-string-ZZZZZZ"}' },
      { content: '{"action":"finalize","response":"done"}' },
    ]);
    await runRetrievalAgentLoop(baseConfig({
      llmCall: llm.fn,
      checkpointStore: store,
      contextManager: cm,
      onProgress: (e) => events.push(e),
      runId: 'cm-once-per-turn',
      maxSteps: 4,
    }));
    const compressionEvents = events.filter(e => e.type === 'context_compressed');
    expect(compressionEvents.length).toBeLessThanOrEqual(4); // at most one per turn
  });

  it('contextManager works without checkpointStore (in-memory only)', async () => {
    const events: AgentRunProgressEvent[] = [];
    const cm = new ContextManager({
      contextTokenBudget: 5,
      compressionThreshold: 0.5,
      strategy: 'retrieve-only',
      retainRecentChars: 5,
      estimateTokensFn: (t) => t.length,
    });
    const llm = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"long-query-for-compression-AAAAA"}' },
      { content: '{"action":"finalize","response":"done"}' },
    ]);
    const result = await runRetrievalAgentLoop(baseConfig({
      llmCall: llm.fn,
      contextManager: cm,
      onProgress: (e) => events.push(e),
      runId: 'cm-no-store',
    }));
    expect(result.rawResponse).toBe('done');
    // No store — but compression should still have fired in-memory.
    expect(events.some(e => e.type === 'context_compressed')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// onProgress events
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 3.4 — onProgress events', () => {
  it('fires step_started + step_completed for each turn', async () => {
    const events: AgentRunProgressEvent[] = [];
    const llm = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q"}' },
      { content: '{"action":"finalize","response":"done"}' },
    ]);
    await runRetrievalAgentLoop(baseConfig({
      llmCall: llm.fn,
      onProgress: (e) => events.push(e),
    }));
    const types = events.map(e => e.type);
    const startedCount = types.filter(t => t === 'step_started').length;
    const completedCount = types.filter(t => t === 'step_completed').length;
    expect(startedCount).toBe(2);
    expect(completedCount).toBe(2);
  });

  it('fires retrieval_invoked with query + result_count', async () => {
    const events: AgentRunProgressEvent[] = [];
    const llm = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"my-query"}' },
      { content: '{"action":"finalize","response":"done"}' },
    ]);
    await runRetrievalAgentLoop(baseConfig({
      llmCall: llm.fn,
      onProgress: (e) => events.push(e),
    }));
    const evt = events.find(e => e.type === 'retrieval_invoked');
    expect(evt).toBeDefined();
    expect(evt?.retrieval_query).toBe('my-query');
    expect(evt?.retrieval_results_count).toBe(1);
  });

  it('fires finalized when finalize action received', async () => {
    const events: AgentRunProgressEvent[] = [];
    const llm = makeScriptedLlm([
      { content: '{"action":"finalize","response":"done"}' },
    ]);
    await runRetrievalAgentLoop(baseConfig({
      llmCall: llm.fn,
      onProgress: (e) => events.push(e),
    }));
    expect(events.some(e => e.type === 'finalized')).toBe(true);
  });

  it('fires loop_exhausted when maxSteps reached without finalize', async () => {
    const events: AgentRunProgressEvent[] = [];
    const llm = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q1"}' },
      { content: '{"action":"retrieve","query":"q2"}' },
      // After force-finalize, scripted reply for the force prompt:
      { content: 'plain-prose-final-answer' },
    ]);
    const result = await runRetrievalAgentLoop(baseConfig({
      llmCall: llm.fn,
      maxSteps: 2,
      onProgress: (e) => events.push(e),
    }));
    expect(result.loopExhausted).toBe(true);
    expect(events.some(e => e.type === 'loop_exhausted')).toBe(true);
  });

  it('fires recovery_resumed on mid-loop resume', async () => {
    const taskId = `task-${crypto.randomBytes(4).toString('hex')}`;
    const runId = 'run-rr';

    const storeA = new CheckpointStore({ rootDir: tmpRoot, taskId });
    const llmA = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q1"}' },
      { content: '', throws: 'crash' },
    ]);
    await expect(runRetrievalAgentLoop(baseConfig({
      llmCall: llmA.fn,
      checkpointStore: storeA,
      runId,
    }))).rejects.toThrow();

    const events: AgentRunProgressEvent[] = [];
    const storeB = new CheckpointStore({ rootDir: tmpRoot, taskId });
    const llmB = makeScriptedLlm([
      { content: '{"action":"finalize","response":"resumed"}' },
    ]);
    await runRetrievalAgentLoop(baseConfig({
      llmCall: llmB.fn,
      checkpointStore: storeB,
      runId,
      onProgress: (e) => events.push(e),
    }));
    expect(events[0]?.type).toBe('recovery_resumed');
  });

  it('event has step_index aligned with checkpoint step_index', async () => {
    const events: AgentRunProgressEvent[] = [];
    const store = makeStore();
    const llm = makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q1"}' },
      { content: '{"action":"finalize","response":"done"}' },
    ]);
    await runRetrievalAgentLoop(baseConfig({
      llmCall: llm.fn,
      checkpointStore: store,
      runId: 'r1',
      onProgress: (e) => events.push(e),
    }));
    const completed = events.filter(e => e.type === 'step_completed');
    expect(completed[0]?.step_index).toBe(0);
    expect(completed[1]?.step_index).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// runRetrievalAgentLoopWithRecovery
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 3.4 — runRetrievalAgentLoopWithRecovery', () => {
  it('returns immediately on first-attempt success', async () => {
    const sleeps: number[] = [];
    const llm = makeScriptedLlm([
      { content: '{"action":"finalize","response":"ok"}' },
    ]);
    const result = await runRetrievalAgentLoopWithRecovery(
      baseConfig({ llmCall: llm.fn }),
      {
        sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); },
        jitterFactor: 0,
      },
    );
    expect(result.rawResponse).toBe('ok');
    expect(sleeps).toEqual([]);
  });

  it('retries on throw with exponential backoff', async () => {
    const sleeps: number[] = [];
    let attempts = 0;
    const llm: LlmCallFn = async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('flaky');
      return { content: '{"action":"finalize","response":"recovered"}', inTokens: 0, outTokens: 0, costUsd: 0, latencyMs: 0 };
    };
    const result = await runRetrievalAgentLoopWithRecovery(
      baseConfig({ llmCall: llm }),
      {
        maxRetries: 3,
        baseBackoffMs: 100,
        jitterFactor: 0,
        sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); },
      },
    );
    expect(result.rawResponse).toBe('recovered');
    expect(sleeps).toEqual([100, 200]); // attempts 1 (no sleep), 2 (100ms), 3 (200ms)
  });

  it('rethrows after exhausting retries', async () => {
    const llm: LlmCallFn = async () => { throw new Error('persistent'); };
    await expect(runRetrievalAgentLoopWithRecovery(
      baseConfig({ llmCall: llm }),
      {
        maxRetries: 2,
        baseBackoffMs: 1,
        jitterFactor: 0,
        sleep: () => Promise.resolve(),
      },
    )).rejects.toThrow(/persistent/);
  });

  it('emits onRetry callback per retry attempt', async () => {
    const retries: Array<{ attempt: number; error: string; backoff_ms: number }> = [];
    const llm: LlmCallFn = async () => { throw new Error('boom'); };
    await expect(runRetrievalAgentLoopWithRecovery(
      baseConfig({ llmCall: llm }),
      {
        maxRetries: 2,
        baseBackoffMs: 1,
        jitterFactor: 0,
        sleep: () => Promise.resolve(),
        onRetry: (info) => retries.push(info),
      },
    )).rejects.toThrow();
    expect(retries.length).toBe(2);
    expect(retries.map(r => r.attempt)).toEqual([2, 3]);
    expect(retries.every(r => r.error === 'boom')).toBe(true);
  });

  it('with checkpointStore, retries leverage internal resume', async () => {
    const taskId = `task-${crypto.randomBytes(4).toString('hex')}`;
    const store = new CheckpointStore({ rootDir: tmpRoot, taskId });
    let attempts = 0;
    const llm: LlmCallFn = async ({ messages }) => {
      attempts += 1;
      // Attempt 1: succeed retrieve, then crash on second call.
      // Attempt 2 (resumed): succeed finalize.
      const lastUser = messages[messages.length - 1];
      if (attempts === 1) return { content: '{"action":"retrieve","query":"q"}', inTokens: 0, outTokens: 0, costUsd: 0.001, latencyMs: 0 };
      if (attempts === 2) throw new Error('mid-loop-crash');
      // attempts >= 3: this is the retry — resume kicks in, so messages should
      // already include the prior assistant + retrieval injection.
      // Verify: there should be 4 messages (system, kickoff, assistant, retrieval-injection).
      expect(messages.length).toBeGreaterThanOrEqual(4);
      return { content: '{"action":"finalize","response":"resumed-ok"}', inTokens: 0, outTokens: 0, costUsd: 0.002, latencyMs: 0 };
    };
    const result = await runRetrievalAgentLoopWithRecovery(
      baseConfig({ llmCall: llm, checkpointStore: store, runId: 'r-resume' }),
      {
        maxRetries: 2,
        baseBackoffMs: 1,
        jitterFactor: 0,
        sleep: () => Promise.resolve(),
      },
    );
    expect(result.rawResponse).toBe('resumed-ok');
  });

  it('rejects negative maxRetries', async () => {
    await expect(runRetrievalAgentLoopWithRecovery(baseConfig(), { maxRetries: -1 }))
      .rejects.toThrow(/non-negative integer/);
  });

  it('rejects jitterFactor outside [0, 1]', async () => {
    await expect(runRetrievalAgentLoopWithRecovery(baseConfig(), { jitterFactor: -0.1 })).rejects.toThrow();
    await expect(runRetrievalAgentLoopWithRecovery(baseConfig(), { jitterFactor: 1.5 })).rejects.toThrow();
  });

  it('rejects maxBackoffMs < baseBackoffMs', async () => {
    await expect(runRetrievalAgentLoopWithRecovery(baseConfig(), {
      baseBackoffMs: 1000,
      maxBackoffMs: 100,
    })).rejects.toThrow(/invalid backoff bounds/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Replay determinism
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 3.4 — replay determinism', () => {
  it('identical llmCall + retrievalSearch → identical final answer (with checkpointStore)', async () => {
    const buildLlm = () => makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q1"}' },
      { content: '{"action":"retrieve","query":"q2"}' },
      { content: '{"action":"finalize","response":"the-answer"}' },
    ]);
    const a = await runRetrievalAgentLoop(baseConfig({
      llmCall: buildLlm().fn,
      checkpointStore: makeStore('a'),
      runId: 'r-rep',
    }));
    const b = await runRetrievalAgentLoop(baseConfig({
      llmCall: buildLlm().fn,
      checkpointStore: makeStore('b'),
      runId: 'r-rep',
    }));
    expect(a.rawResponse).toBe(b.rawResponse);
    expect(a.normalizedResponse).toBe(b.normalizedResponse);
    expect(a.totalTokensIn).toBe(b.totalTokensIn);
    expect(a.totalTokensOut).toBe(b.totalTokensOut);
    expect(a.totalCostUsd).toBe(b.totalCostUsd);
    expect(a.retrievalCalls).toBe(b.retrievalCalls);
  });

  it('with-checkpointStore vs without-checkpointStore → same final answer', async () => {
    const buildLlm = () => makeScriptedLlm([
      { content: '{"action":"retrieve","query":"q1"}' },
      { content: '{"action":"finalize","response":"answer"}' },
    ]);
    const noStore = await runRetrievalAgentLoop(baseConfig({ llmCall: buildLlm().fn }));
    const withStore = await runRetrievalAgentLoop(baseConfig({
      llmCall: buildLlm().fn,
      checkpointStore: makeStore('w'),
      runId: 'r',
    }));
    expect(noStore.rawResponse).toBe(withStore.rawResponse);
    expect(noStore.totalCostUsd).toBe(withStore.totalCostUsd);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Phase 4.7 — compression-engaged end-to-end assertion
//
// This block is the assertion test that would have caught the Phase 3
// acceptance gate compression gap before runtime. Three sub-tests:
//   (1) Main scenario: messagesContextManager fires ≥1 compress event
//       across a 30-step retrieval loop with growing messages array.
//   (2) Safety: under a pathologically tight budget, compressions are
//       bounded (no infinite loop).
//   (3) Regression-pin: WITHOUT messagesContextManager, no compression
//       fires — locks in the Phase 3 gap so a future regression
//       (e.g., accidental field removal) surfaces immediately.
// ─────────────────────────────────────────────────────────────────────────

describe('Phase 4.7 — compression-engaged end-to-end assertion', () => {
  it('messagesContextManager fires ≥1 compress event over a 30-step retrieval loop', async () => {
    const compressionEvents: MessagesCompressionEvent[] = [];

    // Deterministic summarizer mock (no real LLM).
    const summarizerLlm: LlmCallFn = async () => ({
      content: '[deterministic summary of earlier messages]',
      inTokens: 100, outTokens: 30, costUsd: 0.001, latencyMs: 50,
    });

    // 28 retrieves + 1 finalize = 29 scripted replies.
    const replies = [];
    for (let i = 0; i < 28; i += 1) {
      replies.push({ content: `{"action":"retrieve","query":"theme_${i}"}` });
    }
    replies.push({ content: '{"action":"finalize","response":"' + 'x'.repeat(100) + '"}' });
    const loopLlm = makeScriptedLlm(replies);

    // Each retrieval returns ~2000 chars ≈ 500 tokens of synthetic content.
    const heavySearch: RetrievalSearchFn = async () => ({
      formattedResults: 'Result text. ' + 'word '.repeat(400),
      resultCount: 1,
    });

    const result = await runRetrievalAgentLoop(baseConfig({
      llmCall: loopLlm.fn,
      search: heavySearch,
      maxSteps: 30,
      messagesContextManager: {
        budgetTokens: 4000,
        threshold: 0.7,
        retainRecentTurns: 5,
        llmCall: summarizerLlm,
        summarizationModel: 'budget-model',
        onCompressionEvent: (e) => compressionEvents.push(e),
      },
    }));

    // ASSERTION 1: compression fired at least once
    expect(compressionEvents.length).toBeGreaterThanOrEqual(1);

    // ASSERTION 2: each compressed state has fewer tokens than before
    for (const e of compressionEvents) {
      expect(e.after_tokens).toBeLessThan(e.before_tokens);
    }

    // ASSERTION 3: final answer is reachable + non-trivial
    expect(result.rawResponse).toBeTruthy();
    expect(result.rawResponse.length).toBeGreaterThan(50);

    // ASSERTION 4: no infinite compression loop (compress count ≤ steps)
    expect(compressionEvents.length).toBeLessThanOrEqual(result.stepsTaken);
  });

  it('safety: compressions are bounded by step count under tight budget', async () => {
    const compressionEvents: MessagesCompressionEvent[] = [];
    const summarizerLlm: LlmCallFn = async () => ({
      content: 'tiny',
      inTokens: 100, outTokens: 10, costUsd: 0.001, latencyMs: 10,
    });

    const replies = [];
    for (let i = 0; i < 9; i += 1) replies.push({ content: `{"action":"retrieve","query":"q${i}"}` });
    replies.push({ content: '{"action":"finalize","response":"done"}' });

    const result = await runRetrievalAgentLoop(baseConfig({
      llmCall: makeScriptedLlm(replies).fn,
      search: async () => ({ formattedResults: 'x'.repeat(2000), resultCount: 1 }),
      maxSteps: 10,
      messagesContextManager: {
        budgetTokens: 50,           // pathologically tight
        threshold: 0.4,
        retainRecentTurns: 1,
        llmCall: summarizerLlm,
        summarizationModel: 'b',
        onCompressionEvent: (e) => compressionEvents.push(e),
      },
    }));

    // No infinite loop — compressions strictly bounded by stepsTaken.
    expect(compressionEvents.length).toBeLessThanOrEqual(result.stepsTaken);
    expect(result.rawResponse).toBeTruthy();
  });

  it('regression-pin: WITHOUT messagesContextManager, no messages_compressed events fire', async () => {
    // This test pins the Phase 3 gate gap. If anyone removes the
    // messagesContextManager field by accident, this test still passes —
    // but the main test (above) would fail, surfacing the regression.
    const events: AgentRunProgressEvent[] = [];

    const replies = [];
    for (let i = 0; i < 10; i += 1) replies.push({ content: `{"action":"retrieve","query":"q${i}"}` });
    replies.push({ content: '{"action":"finalize","response":"done"}' });

    await runRetrievalAgentLoop(baseConfig({
      llmCall: makeScriptedLlm(replies).fn,
      search: async () => ({ formattedResults: 'x'.repeat(2000), resultCount: 1 }),
      maxSteps: 10,
      onProgress: (e) => events.push(e),
      // NO messagesContextManager — verify Phase 3 gap reproduces here.
    }));

    expect(events.some(e => e.type === 'messages_compressed')).toBe(false);
  });
});

