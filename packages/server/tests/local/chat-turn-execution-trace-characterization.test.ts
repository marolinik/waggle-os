/**
 * Characterization tests for the execution-trace lifecycle of one chat turn in
 * `routes/chat.ts` (TD-CHAT-3 prerequisite, docs/TESTING.md Safety Net Map).
 *
 * The turn keeps three hoisted mutable variables for its execution trace
 * (`traceRecorder`, `traceHandle`, `traceFinalized`) and finalizes the row from
 * three places: the success path, the outer catch, and the outer finally. The
 * only route-level pins before this file were two outcome COUNTERS in
 * `chat-api.test.ts`, which silently pass when `traceStore` is absent and say
 * nothing about the payload each finalize writes, the finalize-once guard, the
 * cost read back from the row, or the finally block at all.
 *
 * The real agent loop runs against the fake provider (TD-CHAT-16), with spies
 * on the real, decorated `server.traceRecorder`, so every call below is one the
 * route genuinely made against the shared recorder and store. A pass-through
 * spy on `runAgentLoop` (ruling 2) records each attempt's config, runs a
 * pre-loop hook where a pin needs one, and throws only the failures no provider
 * reply produces (unclassified messages, SQLITE_BUSY).
 *
 * These pin CURRENT behavior, not a specification.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, TraceFinalizeOptions, TraceHandle } from '@waggle/agent';
import { WaggleConfig } from '@waggle/core';

/** Per attempt (1-based): throw this, or run this hook before the real loop. */
const loopSpy = vi.hoisted(() => ({
  configs: [] as AgentLoopConfig[],
  failures: new Map<number, unknown>(),
  beforeLoop: undefined as ((config: AgentLoopConfig) => void) | undefined,
}));

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return {
    ...actual,
    runAgentLoop: async (config: AgentLoopConfig) => {
      loopSpy.configs.push(config);
      const failure = loopSpy.failures.get(loopSpy.configs.length);
      if (failure !== undefined) throw failure;
      loopSpy.beforeLoop?.(config);
      return actual.runAgentLoop(config);
    },
  };
});

import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';
import {
  installFakeLlmProvider,
  type FakeLlmProvider,
  type FakeLlmResponder,
} from '../helpers/fake-llm-provider.js';

const MODEL = 'claude-sonnet-4-6';
/** What the route resolves MODEL to; every trace call carries this id. */
const ROUTED_MODEL = 'anthropic/claude-sonnet-4-6';
/** Mirrors the route's private redaction marker for non-retained turns. */
const NON_RETAINED = '[Not retained: memory disabled for this turn]';

type DoneEvent = { content: string; model: string; cost?: number };

describe('POST /api/chat execution-trace lifecycle (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  const configs = loopSpy.configs;
  let provider: FakeLlmProvider | undefined;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-trace-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.vault.set('anthropic', 'sk-trace-pin');
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'test',
      checkedAt: new Date().toISOString(),
    };
    new WaggleConfig(tmpDir).save();
    server.llmRetryBackoffMs = () => 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    provider?.restore();
    provider = undefined;
    loopSpy.failures.clear();
    loopSpy.beforeLoop = undefined;
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  function spyOnRecorder() {
    return {
      start: vi.spyOn(server.traceRecorder, 'start'),
      finalize: vi.spyOn(server.traceRecorder, 'finalize'),
    };
  }

  /** Scripts the model; `failures` throws on the given attempts (1-based) instead. */
  function installModel(respond: FakeLlmResponder, failures: Record<number, unknown> = {}) {
    configs.length = 0;
    for (const [attempt, failure] of Object.entries(failures)) loopSpy.failures.set(Number(attempt), failure);
    provider = installFakeLlmProvider({ respond });
  }

  const answer = (content: string, inputTokens = 1, outputTokens = 1) => ({
    type: 'text' as const, content, usage: { inputTokens, outputTokens },
  });

  async function runTurn(session: string, extra: Record<string, unknown> = {}) {
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'In one sentence, what is a trace?', session, model: MODEL, ...extra },
    });
    expect(res.statusCode).toBe(200);
    const events = parseSSE(res.body);
    const done = events.find(e => e.event === 'done');
    return {
      events,
      done: done ? JSON.parse(done.data) as DoneEvent : undefined,
    };
  }

  function finalizeOptions(spy: ReturnType<typeof spyOnRecorder>['finalize']): TraceFinalizeOptions[] {
    return spy.mock.calls.map(call => call[1]);
  }

  it('starts one trace per turn and finalizes it as success with the answer, model and tokens', async () => {
    const recorder = spyOnRecorder();
    installModel(answer('traced answer', 5, 7));

    const { done } = await runTurn('trace-success');

    expect(done?.content).toBe('traced answer');
    expect(recorder.start).toHaveBeenCalledTimes(1);
    expect(recorder.start.mock.calls[0][0]).toEqual({
      sessionId: 'trace-success',
      personaId: 'researcher',
      workspaceId: 'default-workspace',
      model: ROUTED_MODEL,
      input: 'In one sentence, what is a trace?',
    });
    const handle = recorder.start.mock.results[0].value as TraceHandle;

    expect(recorder.finalize).toHaveBeenCalledTimes(1);
    expect(recorder.finalize.mock.calls[0][0]).toBe(handle);
    const [options] = finalizeOptions(recorder.finalize);
    expect(options).toEqual({
      outcome: 'success',
      output: 'traced answer',
      model: ROUTED_MODEL,
      tokens: { input: 5, output: 7 },
      costUsd: expect.any(Number),
    });
    expect(server.traceStore.get(handle.id)?.outcome).toBe('success');
  });

  it('hands the agent loop the trace id and the live recording', async () => {
    const recorder = spyOnRecorder();
    installModel(answer('ok'));

    await runTurn('trace-handoff');

    const handle = recorder.start.mock.results[0].value as TraceHandle;
    expect(configs).toHaveLength(1);
    expect(configs[0].modelSpendTraceId).toBe(handle.id);
    expect(configs[0].traceRecording?.recorder).toBe(server.traceRecorder);
    expect(configs[0].traceRecording?.handle).toBe(handle);
  });

  // The pre-loop hook records 0.125 on the trace the route handed the loop. The
  // loop's own spend (5/7 tokens) is far below it and is not written to the row
  // on this path, so the read-back is still exactly 0.125 (TD-CHAT-16 §6f).
  it('reports the turn cost read back from the finalized row, raised to spend already recorded on the trace', async () => {
    const recorder = spyOnRecorder();
    loopSpy.beforeLoop = (config) => server.traceStore.recordCost(config.modelSpendTraceId!, 0.125);
    installModel(answer('costed answer', 5, 7));

    const { done } = await runTurn('trace-cost-readback');

    const handle = recorder.start.mock.results[0].value as TraceHandle;
    const row = server.traceStore.get(handle.id);
    expect(done?.cost).toBe(0.125);
    expect(row?.cost_usd).toBe(0.125);
  });

  it('finalizes a failed turn once as abandoned, with the error as correction feedback', async () => {
    const recorder = spyOnRecorder();
    installModel(answer('unreachable'), { 1: new Error('forced trace failure') });

    await runTurn('trace-failure');

    const handle = recorder.start.mock.results[0].value as TraceHandle;
    expect(recorder.finalize).toHaveBeenCalledTimes(1);
    expect(finalizeOptions(recorder.finalize)[0]).toEqual({
      outcome: 'abandoned',
      output: '',
      model: ROUTED_MODEL,
      tokens: undefined,
      costUsd: undefined,
      correctionFeedback: 'forced trace failure',
    });
    expect(server.traceStore.get(handle.id)?.outcome).toBe('abandoned');
  });

  it('records the tokens and cost of failed attempts on an abandoned trace', async () => {
    const recorder = spyOnRecorder();
    // Attempt 1's stream is cut after reporting 2/3; the replay fails outright.
    installModel(
      { type: 'truncated_stream', content: 'partial', usage: { inputTokens: 2, outputTokens: 3 } },
      { 2: new Error('second attempt failed') },
    );

    await runTurn('trace-failed-attempt-usage');

    expect(configs).toHaveLength(2);
    expect(recorder.finalize).toHaveBeenCalledTimes(1);
    const [options] = finalizeOptions(recorder.finalize);
    expect(options.outcome).toBe('abandoned');
    expect(options.tokens).toEqual({ input: 2, output: 3 });
    expect(options.costUsd).toBeGreaterThan(0);
    expect(options.correctionFeedback).toBe('second attempt failed');
  });

  it('retries a failed success finalize from the finally block with the success payload', async () => {
    const recorder = spyOnRecorder();
    recorder.finalize.mockImplementationOnce(() => { throw new Error('trace store unavailable'); });
    installModel(answer('delivered anyway', 5, 7));

    const { done } = await runTurn('trace-success-finalize-throws');

    expect(done?.content).toBe('delivered anyway');
    const handle = recorder.start.mock.results[0].value as TraceHandle;
    const options = finalizeOptions(recorder.finalize);
    expect(options).toHaveLength(2);
    expect(options[0].outcome).toBe('success');
    // Until TD-CHAT-22 the finally block built its own payload and recorded the
    // delivered answer as abandoned, a false negative example for evolution.
    expect(options[1]).toEqual(options[0]);
    expect(server.traceStore.get(handle.id)?.outcome).toBe('success');
  });

  it('retries a failed error-path finalize once from the finally block, with the error details', async () => {
    const recorder = spyOnRecorder();
    recorder.finalize.mockImplementationOnce(() => { throw new Error('trace store unavailable'); });
    installModel(answer('unreachable'), { 1: new Error('forced trace failure') });

    await runTurn('trace-failure-finalize-throws');

    const options = finalizeOptions(recorder.finalize);
    expect(options).toHaveLength(2);
    expect(options[0].correctionFeedback).toBe('forced trace failure');
    // Until TD-CHAT-22 the retry dropped the feedback, tokens and cost.
    expect(options[1]).toEqual(options[0]);
  });

  it('a read-only persona turn records redacted text and gives the loop no recording', async () => {
    const recorder = spyOnRecorder();
    installModel(answer('planner answer'));

    await runTurn('trace-read-only', { persona: 'planner' });

    const handle = recorder.start.mock.results[0].value as TraceHandle;
    expect(recorder.start.mock.calls[0][0].input).toBe(NON_RETAINED);
    expect(configs[0].modelSpendTraceId).toBe(handle.id);
    expect(configs[0].traceRecording).toBeUndefined();
    expect(finalizeOptions(recorder.finalize)[0].output).toBe(NON_RETAINED);
  });

  it('runs a turn untraced when its trace cannot start', async () => {
    const recorder = spyOnRecorder();
    recorder.start.mockImplementationOnce(() => { throw new Error('SQLITE_BUSY: database is locked'); });
    installModel(answer('answered untraced'));

    const { events, done } = await runTurn('trace-start-throws');

    // Until TD-REL-4 the turn was aborted and the client got
    // 'SQLITE_BUSY: database is locked' verbatim.
    expect(done?.content).toBe('answered untraced');
    expect(configs).toHaveLength(1);
    expect(configs[0].traceRecording).toBeUndefined();
    expect(events.some(ev => ev.event === 'error')).toBe(false);
    expect(recorder.finalize).not.toHaveBeenCalled();
  });

  it('answers a fatal local-database error with a fixed message and code', async () => {
    // Stands in for any critical-path SQLite write that fails, such as issuing
    // a capability proposal, which stays fail-closed by design.
    installModel(answer('unreachable'), {
      1: Object.assign(new Error('SQLITE_BUSY: database is locked'), { code: 'SQLITE_BUSY' }),
    });

    const { events } = await runTurn('sqlite-busy-error');

    const errors = events.filter(ev => ev.event === 'error').map(ev => JSON.parse(ev.data) as Record<string, unknown>);
    // Until TD-REL-4 the client got 'SQLITE_BUSY: database is locked' verbatim.
    expect(errors).toEqual([{
      message: 'Waggle could not update its local database just now. Try again in a moment.',
      code: 'LOCAL_DATABASE_UNAVAILABLE',
    }]);
  });

  it('runs untraced when no recorder is decorated', async () => {
    const decorated = server.traceRecorder;
    (server as { traceRecorder?: unknown }).traceRecorder = undefined;
    try {
      installModel(answer('untraced answer'));

      const { done } = await runTurn('trace-none');

      expect(done?.content).toBe('untraced answer');
      expect(configs[0].modelSpendTraceId).toBeUndefined();
      expect(configs[0].traceRecording).toBeUndefined();
    } finally {
      server.traceRecorder = decorated;
    }
  });
});
