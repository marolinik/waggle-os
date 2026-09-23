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
 * The seam is `server.agentRunner` plus spies on the real, decorated
 * `server.traceRecorder`, so every call below is one the route genuinely made
 * against the shared recorder and store.
 *
 * Not reachable through this seam (TD-CHAT-16): the trace id handed to the
 * child-agent spend budget and the frame->trace backlink on auto-saved memory
 * both run only when no custom runner is installed.
 *
 * These pin CURRENT behavior, not a specification.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, AgentResponse, TraceFinalizeOptions, TraceHandle } from '@waggle/agent';
import { WaggleConfig } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';

const MODEL = 'claude-sonnet-4-6';
/** What the route resolves MODEL to; every trace call carries this id. */
const ROUTED_MODEL = 'anthropic/claude-sonnet-4-6';
/** Mirrors the route's private redaction marker for non-retained turns. */
const NON_RETAINED = '[Not retained: memory disabled for this turn]';

/** The error shape the safe-replay predicate accepts, so a second attempt runs. */
function streamInterruption(usage: { inputTokens: number; outputTokens: number }): Error {
  const error = new Error(
    'Model stream ended early (stream ended before data: [DONE]); partial content was not accepted.',
  ) as Error & { code: string; usage: { inputTokens: number; outputTokens: number } };
  error.code = 'INCOMPLETE_COMPLETION';
  error.usage = usage;
  return error;
}

type DoneEvent = { content: string; model: string; cost?: number };

describe('POST /api/chat execution-trace lifecycle (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let configs: AgentLoopConfig[];

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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete server.agentRunner;
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

  /** Runs `attempt` for every model attempt, recording each attempt's config. */
  function installRunner(attempt: (config: AgentLoopConfig, index: number) => AgentResponse | Promise<AgentResponse>) {
    configs = [];
    server.agentRunner = async (config: AgentLoopConfig): Promise<AgentResponse> => {
      configs.push(config);
      return attempt(config, configs.length);
    };
  }

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
    installRunner(() => ({
      content: 'traced answer',
      toolsUsed: [],
      usage: { inputTokens: 5, outputTokens: 7 },
    }));

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
    installRunner(() => ({ content: 'ok', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } }));

    await runTurn('trace-handoff');

    const handle = recorder.start.mock.results[0].value as TraceHandle;
    expect(configs).toHaveLength(1);
    expect(configs[0].modelSpendTraceId).toBe(handle.id);
    expect(configs[0].traceRecording?.recorder).toBe(server.traceRecorder);
    expect(configs[0].traceRecording?.handle).toBe(handle);
  });

  it('reports the turn cost read back from the finalized row, raised to spend already recorded on the trace', async () => {
    spyOnRecorder();
    installRunner((config) => {
      server.traceStore.recordCost(config.modelSpendTraceId!, 0.125);
      return { content: 'costed answer', toolsUsed: [], usage: { inputTokens: 5, outputTokens: 7 } };
    });

    const { done } = await runTurn('trace-cost-readback');

    expect(done?.cost).toBe(0.125);
  });

  it('finalizes a failed turn once as abandoned, with the error as correction feedback', async () => {
    const recorder = spyOnRecorder();
    installRunner(() => { throw new Error('forced trace failure'); });

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
    installRunner((_config, index) => {
      if (index === 1) throw streamInterruption({ inputTokens: 2, outputTokens: 3 });
      throw new Error('second attempt failed');
    });

    await runTurn('trace-failed-attempt-usage');

    expect(configs).toHaveLength(2);
    expect(recorder.finalize).toHaveBeenCalledTimes(1);
    const [options] = finalizeOptions(recorder.finalize);
    expect(options.outcome).toBe('abandoned');
    expect(options.tokens).toEqual({ input: 2, output: 3 });
    expect(options.costUsd).toBeGreaterThan(0);
    expect(options.correctionFeedback).toBe('second attempt failed');
  });

  it('QUIRK: a success finalize that throws leaves the row to the finally block, which records the delivered answer as abandoned', async () => {
    const recorder = spyOnRecorder();
    recorder.finalize.mockImplementationOnce(() => { throw new Error('trace store unavailable'); });
    installRunner(() => ({ content: 'delivered anyway', toolsUsed: [], usage: { inputTokens: 5, outputTokens: 7 } }));

    const { done } = await runTurn('trace-success-finalize-throws');

    expect(done?.content).toBe('delivered anyway');
    const handle = recorder.start.mock.results[0].value as TraceHandle;
    const options = finalizeOptions(recorder.finalize);
    expect(options).toHaveLength(2);
    expect(options[0].outcome).toBe('success');
    expect(options[1]).toEqual({ outcome: 'abandoned', output: '', model: ROUTED_MODEL });
    expect(server.traceStore.get(handle.id)?.outcome).toBe('abandoned');
  });

  it('retries a failed error-path finalize once from the finally block, without the error details', async () => {
    const recorder = spyOnRecorder();
    recorder.finalize.mockImplementationOnce(() => { throw new Error('trace store unavailable'); });
    installRunner(() => { throw new Error('forced trace failure'); });

    await runTurn('trace-failure-finalize-throws');

    const options = finalizeOptions(recorder.finalize);
    expect(options).toHaveLength(2);
    expect(options[0].correctionFeedback).toBe('forced trace failure');
    expect(options[1]).toEqual({ outcome: 'abandoned', output: '', model: ROUTED_MODEL });
  });

  it('a read-only persona turn records redacted text and gives the loop no recording', async () => {
    const recorder = spyOnRecorder();
    installRunner(() => ({ content: 'planner answer', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } }));

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
    installRunner(() => ({ content: 'answered untraced', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } }));

    const { events, done } = await runTurn('trace-start-throws');

    // Until TD-REL-4 the turn was aborted and the client got
    // 'SQLITE_BUSY: database is locked' verbatim.
    expect(done?.content).toBe('answered untraced');
    expect(configs).toHaveLength(1);
    expect(configs[0].traceRecording).toBeUndefined();
    expect(events.some(ev => ev.event === 'error')).toBe(false);
    expect(recorder.finalize).not.toHaveBeenCalled();
  });

  it('runs untraced when no recorder is decorated', async () => {
    const decorated = server.traceRecorder;
    (server as { traceRecorder?: unknown }).traceRecorder = undefined;
    try {
      installRunner(() => ({ content: 'untraced answer', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } }));

      const { done } = await runTurn('trace-none');

      expect(done?.content).toBe('untraced answer');
      expect(configs[0].modelSpendTraceId).toBeUndefined();
      expect(configs[0].traceRecording).toBeUndefined();
    } finally {
      server.traceRecorder = decorated;
    }
  });
});
