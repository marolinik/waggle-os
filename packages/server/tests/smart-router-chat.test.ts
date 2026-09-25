/**
 * Pass-through spy on the real agent loop (TD-CHAT-16 ruling 2). It records
 * the `AgentLoopConfig` of every attempt, for the pins on fields that never
 * reach the wire (`billingModel`, `modelSpendBudget`, `spendWorkspaceId`,
 * `maxTokenBudget`, ...). Every turn runs the real loop against the fake
 * provider.
 */
const loopSpy = vi.hoisted(() => ({
  configs: [] as import('@waggle/agent').AgentLoopConfig[],
  /** Runs as each attempt enters the loop, before any model call. */
  beforeLoop: undefined as (() => void) | undefined,
  /** Thrown on attempt n instead of running the loop: only for failures no provider reply produces. */
  failures: [] as unknown[],
}));

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return {
    ...actual,
    runAgentLoop: async (config: import('@waggle/agent').AgentLoopConfig) => {
      const index = loopSpy.configs.push(config) - 1;
      loopSpy.beforeLoop?.();
      const failure = loopSpy.failures[index];
      if (failure !== undefined) throw failure;
      return actual.runAgentLoop(config);
    },
  };
});
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WaggleConfig } from '@waggle/core';
import { FEATURE_FLAGS } from '@waggle/agent';
import type { AgentLoopConfig, ToolDefinition } from '@waggle/agent';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLocalServer } from '../src/local/index.js';
import {
  isExplicitGatedToolRequest,
  shouldRequireCapabilityAcquisitionTools,
} from '../src/local/routes/chat.js';
import { loadSessionMessages, persistMessage } from '../src/local/routes/chat-persistence.js';
import { getAuthToken, injectWithAuth, resetRateLimiter } from './test-utils.js';
import {
  installFakeLlmProvider,
  markFakeProviderHealthy,
  type FakeLlmProvider,
  type FakeLlmReply,
} from './helpers/fake-llm-provider.js';

/** The real fetch, for the one pin that calls the suite's server over HTTP. */
const realFetch = globalThis.fetch;

function sseEvents(body: string): Array<{ event: string; data: Record<string, unknown> }> {
  return body.split('\n\n').flatMap((block) => {
    const event = /^event: (.+)$/m.exec(block)?.[1];
    const data = /^data: (.+)$/m.exec(block)?.[1];
    return event && data ? [{ event, data: JSON.parse(data) as Record<string, unknown> }] : [];
  });
}

/** The `reason` of every `model_switch` event, in order. */
function switchReasons(body: string): string[] {
  return sseEvents(body)
    .filter((event) => event.event === 'model_switch')
    .map((event) => String(event.data.reason));
}

describe('chat smart-router integration', () => {
  const primary = 'ollama/primary-test-model';
  const budget = 'ollama/budget-test-model';
  let server: FastifyInstance;
  let tmpDir: string;
  let activeWorkspaceId: string;
  let capturedConfigs: AgentLoopConfig[];
  let completionRequests: Array<{ url: string; model: string }>;
  /** The model of the last loop attempt. */
  const capturedModel = (): string | undefined => capturedConfigs.at(-1)?.model;
  /**
   * The suite's model (TD-CHAT-16): every `/chat/completions` request is
   * recorded in `completionRequests` and answered by `reply`, `ok` by default.
   * The Ollama listing reports the suite's models; any other URL gets 503, as
   * the suite's old fetch stub answered.
   */
  let provider: FakeLlmProvider;
  const OK_REPLY: FakeLlmReply = { type: 'text', content: 'ok', usage: { inputTokens: 1, outputTokens: 1 } };
  let reply: (request: { model: string; index: number }) => FakeLlmReply | Promise<FakeLlmReply>;
  /** The model of every loop attempt, in order. */
  const attemptModels = (): string[] => capturedConfigs.map(attempt => attempt.model);
  /** A reply under which these models cannot be reached and every other answers `ok`. */
  const unreachable = (...models: string[]) => (request: { model: string }): FakeLlmReply => (
    models.includes(request.model) ? { type: 'network_error', message: 'fetch failed' } : OK_REPLY
  );
  /** Answers this test's model calls in order, then `ok`. */
  const inOrder = (...replies: FakeLlmReply[]) => {
    let next = 0;
    return () => replies[next++] ?? OK_REPLY;
  };

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-smart-router-'));
    const config = new WaggleConfig(tmpDir);
    config.setDefaultModel(primary);
    config.setBudgetModel(budget);
    config.save();

    // The approval hook runs on the real path, and these turns have no
    // operator to answer its cards: the route's test-mode auto-approval, read
    // once at registration, stands in (TD-CHAT-16).
    const previousAutoApprove = process.env.WAGGLE_AUTO_APPROVE;
    process.env.WAGGLE_AUTO_APPROVE = '1';
    try {
      server = await buildLocalServer({ dataDir: tmpDir });
    } finally {
      if (previousAutoApprove === undefined) delete process.env.WAGGLE_AUTO_APPROVE;
      else process.env.WAGGLE_AUTO_APPROVE = previousAutoApprove;
    }
    server.llmRetryBackoffMs = () => 0;
    activeWorkspaceId = server.agentState.activeWorkspaceId!;
    expect(activeWorkspaceId).toBeTruthy();
  }, 30_000);

  beforeEach(() => {
    loopSpy.configs.length = 0;
    loopSpy.beforeLoop = undefined;
    loopSpy.failures = [];
    capturedConfigs = loopSpy.configs;
    completionRequests = [];
    reply = () => OK_REPLY;
    resetRateLimiter(server);
    const config = new WaggleConfig(tmpDir);
    config.setDefaultModel(primary);
    config.setBudgetModel(budget);
    config.clearFallbackModel();
    config.setDailyBudget(null);
    config.setBudgetHardCap(false);
    config.setBudgetThreshold(0.8);
    config.save();
    server.agentState.costTracker.setBudget(null, 'soft');
    provider = installFakeLlmProvider({
      respond: (request) => {
        completionRequests.push({ url: request.url, model: request.model });
        return reply(request);
      },
      otherRequest: async (input) => {
        if (String(input).endsWith('/api/tags')) {
          return new Response(JSON.stringify({
            models: [
              { name: 'primary-test-model' },
              { name: 'budget-test-model' },
              { name: 'fallback-test-model' },
              { name: 'remote-budget-test-model', remote_host: 'https://ollama.com:443' },
            ],
          }), { status: 200 });
        }
        return new Response('', { status: 503 });
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    provider.restore();
    server.vault.delete('anthropic');
    server.vault.delete('anthropic-2');
    server.vault.delete('anthropic-3');
    server.vault.delete('openrouter');
    server.vault.delete('openrouter-2');
  });

  afterAll(async () => {
    await server.close();
    await new Promise(resolve => setTimeout(resolve, 100));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Windows may briefly retain a native SQLite handle after server.close().
    }
  });

  it('keeps a bounded trivial turn on primary when no daily budget is configured', async () => {
    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'What is 19 * 23?', session: 'trivial-route' },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedModel()).toBe('primary-test-model');
    expect(capturedConfigs[0].billingModel).toBe(primary);
    expect(capturedConfigs[0].modelSpendBudget).toBe(server.agentState.costTracker);
    expect(capturedConfigs[0].modelSpendBillingClass).toBe('free');
    expect(capturedConfigs[0].spendWorkspaceId).toBe(activeWorkspaceId);
    expect(response.body).not.toContain('event: model_switch');
  });

  it('indexes nothing when the turn has no active workspace', async () => {
    // TD-CHAT-34 / F7: a no-active-workspace turn resolves `executionScopeId`
    // to the `personal::default` sentinel, which is a scope id, not a path
    // segment -- and the artifact index joins it straight into
    // `dataDir/workspaces/<id>/artifacts.json`.
    //
    // PLATFORM ASYMMETRY, deliberate: on POSIX (this repo's CI is
    // ubuntu-latest) the write SUCCEEDS and leaves an index no reader can ever
    // reach, because `/api/artifacts` rejects the sentinel through
    // `assertSafeSegment` and `workspaceIds()` enumerates real workspaces only.
    // On Windows `mkdirSync` throws ENOENT on the `:` and the catch swallows
    // it. So this assertion is the behavior change on CI and a regression
    // guard on a developer's Windows box.
    const restoreWorkspace = server.agentState.activeWorkspaceId;
    // The model really calls generate_docx (TD-CHAT-16).
    reply = inOrder(
      {
        type: 'tool_calls',
        calls: [{
          name: 'generate_docx',
          args: { path: 'Unscoped-Brief.docx', title: 'Unscoped Brief', content: '# Unscoped Brief' },
        }],
        usage: { inputTokens: 1, outputTokens: 1 },
      },
      { type: 'text', content: 'Created the brief.', usage: { inputTokens: 1, outputTokens: 1 } },
    );
    let response;
    try {
      server.agentState.activeWorkspaceId = null;
      response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Create a Word launch brief.',
          session: 'unscoped-artifact-index',
        },
      });
    } finally {
      server.agentState.activeWorkspaceId = restoreWorkspace;
    }

    expect(response.statusCode).toBe(200);
    // The sentinel never reaches the path-joining interface, so no scope
    // directory is minted for it.
    expect(fs.existsSync(path.join(tmpDir, 'workspaces', 'personal::default'))).toBe(false);
  });

  it('indexes successful Office and PDF outputs in the workspace Library', async () => {
    // The model really calls the four generators, regenerates the brief under
    // a new title, and makes one PDF call that fails (TD-CHAT-16).
    reply = inOrder(
      {
        type: 'tool_calls',
        calls: [
          { name: 'generate_docx', args: { path: 'PM-Launch-Brief.docx', title: 'PM Launch Brief', content: '# Brief' } },
          { name: 'generate_pdf', args: { filePath: 'PM-Launch-Brief.pdf', title: 'PM Launch Brief PDF', content: '# Brief' } },
          {
            name: 'generate_xlsx',
            args: {
              filePath: 'PM-Launch-Tracker.xlsx',
              title: 'PM Launch Tracker',
              sheets: [{ name: 'Tracker', columns: [{ header: 'Task', key: 'task' }], rows: [{ task: 'Ship' }] }],
            },
          },
          {
            name: 'generate_pptx',
            args: { filePath: 'PM-Launch-Deck.pptx', title: 'PM Launch Deck', slides: [{ title: 'Launch', bullets: ['Ship'] }] },
          },
          {
            name: 'generate_docx',
            args: { path: 'PM-Launch-Brief.docx', title: 'PM Launch Brief Refreshed', content: '# Brief v2' },
          },
          { name: 'generate_pdf', args: { filePath: 'failed.pdf', title: 'Failed PDF' } },
        ],
        usage: { inputTokens: 1, outputTokens: 1 },
      },
      { type: 'text', content: 'Created the requested launch artifacts.', usage: { inputTokens: 1, outputTokens: 1 } },
    );

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: 'Create polished Word, PDF, Excel spreadsheet, and PowerPoint launch artifacts.',
        session: 'generated-artifact-library-index',
      },
    });
    const library = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/artifacts?workspaceId=${encodeURIComponent(activeWorkspaceId)}`,
    });

    expect(response.statusCode).toBe(200);
    expect(library.statusCode).toBe(200);
    expect(library.json()).toMatchObject({
      count: 4,
      results: expect.arrayContaining([
        expect.objectContaining({
          title: 'PM Launch Brief Refreshed',
          kind: 'document',
          workspaceId: activeWorkspaceId,
          source: 'agent',
          status: 'draft',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          storagePath: 'PM-Launch-Brief.docx',
          relatedSessionIds: ['generated-artifact-library-index'],
        }),
        expect.objectContaining({
          title: 'PM Launch Brief PDF',
          kind: 'document',
          storagePath: 'PM-Launch-Brief.pdf',
        }),
        expect.objectContaining({
          title: 'PM Launch Tracker',
          kind: 'spreadsheet',
          storagePath: 'PM-Launch-Tracker.xlsx',
        }),
        expect.objectContaining({
          title: 'PM Launch Deck',
          kind: 'presentation',
          storagePath: 'PM-Launch-Deck.pptx',
        }),
      ]),
    });
    expect(library.body).not.toContain('failed.pdf');
    for (const fileName of [
      'PM-Launch-Brief.docx',
      'PM-Launch-Brief.pdf',
      'PM-Launch-Tracker.xlsx',
      'PM-Launch-Deck.pptx',
    ]) {
      expect(response.body).toContain(fileName);
    }
  });

  it('does not retry or fall back after terminal hard-budget rejection', async () => {
    // Re-pinned on the real path (TD-CHAT-16 ruling 5): the loop's own hard cap
    // refuses the attempt before any model request. The cap never refuses a
    // free local model, so the primary here is a priced cloud model. Its own
    // server: the route caches a provider's credential pool for the server's
    // lifetime, and the shared server's credential pins set their own keys.
    const budgetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-smart-router-hard-cap-'));
    const config = new WaggleConfig(budgetDir);
    config.setDefaultModel('claude-sonnet-4-6');
    config.setFallbackModel('ollama/fallback-test-model');
    config.setDailyBudget(0.000001);
    config.setBudgetHardCap(true);
    config.save();
    const budgetServer = await buildLocalServer({ dataDir: budgetDir });
    markFakeProviderHealthy(budgetServer);
    budgetServer.agentState.costTracker.setBudget(0.000001, 'hard');

    try {
      const response = await injectWithAuth(budgetServer, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'What is 19 * 23?', session: 'hard-budget-terminal' },
      });

      expect(response.statusCode).toBe(200);
      expect(capturedConfigs.map(attempt => attempt.model)).toEqual(['anthropic/claude-sonnet-4-6']);
      expect(completionRequests).toEqual([]);
      expect(response.body).toContain('event: error');
      expect(response.body).toContain('Daily budget exceeded');
    } finally {
      await budgetServer.close();
      await new Promise(resolve => setTimeout(resolve, 100));
      try {
        fs.rmSync(budgetDir, { recursive: true, force: true });
      } catch {
        // Windows may briefly retain a native SQLite handle after server.close().
      }
    }
  });

  it('keeps an under-threshold trivial turn on the configured primary model', async () => {
    const config = new WaggleConfig(tmpDir);
    config.setDailyBudget(10);
    config.setBudgetThreshold(0.8);
    config.save();
    const getDailyTotal = vi.spyOn(server.agentState.costTracker, 'getDailyTotal').mockReturnValue(7.99);
    // The loop's own spend reservation reads the daily total as well; the
    // router's single read is the count when the first attempt starts
    // (TD-CHAT-16).
    let routerReads: number | undefined;
    loopSpy.beforeLoop = () => { routerReads ??= getDailyTotal.mock.calls.length; };

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'What is 19 * 23?', session: 'under-budget-trivial-route' },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedModel()).toBe('primary-test-model');
    expect(response.body).not.toContain('event: model_switch');
    expect(routerReads).toBe(1);
  });

  it.each([
    ['code', 'Why does this Promise resolve twice?'],
    ['privacy', "Summarize Alice's medical diagnosis."],
    ['destructive', 'Delete every stale branch except main.'],
  ])('keeps a %s turn on the configured primary model', async (_category, message) => {
    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message, session: `primary-route-${_category}` },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedModel()).toBe('primary-test-model');
  });

  it.each([
    ['destructive', 'Delete every stale branch except main.'],
    ['legal', 'Is this non-compete enforceable in California?'],
    ['privacy', "Summarize Alice's medical diagnosis."],
    ['code', 'Why does this Promise resolve twice?'],
    ['research', 'Find peer-reviewed evidence for this claim.'],
  ])('keeps an over-budget %s turn on the configured primary model', async (_category, message) => {
    const config = new WaggleConfig(tmpDir);
    config.setDailyBudget(1);
    config.setBudgetThreshold(0.8);
    config.save();
    vi.spyOn(server.agentState.costTracker, 'getDailyTotal').mockReturnValue(1);

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message, session: `over-budget-primary-route-${_category}` },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedModel()).toBe('primary-test-model');
  });

  it('uses the budget model with threshold telemetry for an over-budget trivial turn', async () => {
    const config = new WaggleConfig(tmpDir);
    config.setDailyBudget(1);
    config.setBudgetThreshold(0.8);
    config.save();
    const getDailyTotal = vi.spyOn(server.agentState.costTracker, 'getDailyTotal').mockReturnValue(0.8);
    // Counted up to the first attempt, as above (TD-CHAT-16).
    let routerReads: number | undefined;
    loopSpy.beforeLoop = () => { routerReads ??= getDailyTotal.mock.calls.length; };

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'What is 19 * 23?', session: 'over-budget-trivial-route' },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedModel()).toBe('budget-test-model');
    expect(routerReads).toBe(1);
    expect(response.body).toContain('event: model_switch');
    expect(response.body).toContain('Budget 80% reached ($0.80/$1.00)');
    const [persistedTrace] = server.traceStore.query({
      sessionId: 'over-budget-trivial-route',
      limit: 1,
    });
    expect(persistedTrace.cost_usd).toBe(0);
    expect(JSON.parse(persistedTrace.trace_json).tokens).toEqual({ input: 1, output: 1 });
  });

  it('adds restart carryover without double-counting after a transient read failure', async () => {
    const restartDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-smart-router-restart-'));
    let initialServer: FastifyInstance | undefined;
    let restartedServer: FastifyInstance | undefined;
    try {
      const config = new WaggleConfig(restartDir);
      config.setDefaultModel(primary);
      config.setBudgetModel(budget);
      config.setDailyBudget(13.75);
      config.setBudgetThreshold(0.8);
      config.save();

      initialServer = await buildLocalServer({ dataDir: restartDir });
      const traceId = initialServer.traceStore.start({
        sessionId: 'persisted-daily-spend-source',
        workspaceId: 'default',
        model: 'claude-opus-4-8',
        input: 'prior completed turn',
      });
      initialServer.traceStore.finalize(traceId, {
        outcome: 'success',
        output: 'ok',
        costUsd: 8,
      });
      const oldTraceId = initialServer.traceStore.start({
        sessionId: 'previous-day-spend-source',
        workspaceId: 'default',
        model: 'claude-opus-4-8',
        input: 'previous day turn',
      });
      initialServer.traceStore.finalize(oldTraceId, {
        outcome: 'success',
        output: 'ok',
        costUsd: 100,
      });
      const previousDay = new Date(Date.now() - 86_400_000)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19);
      initialServer.multiMind.personal.getDatabase()
        .prepare('UPDATE execution_traces SET created_at = ? WHERE id = ?')
        .run(previousDay, oldTraceId);
      await initialServer.close();
      initialServer = undefined;

      restartedServer = await buildLocalServer({ dataDir: restartDir });
      // Its turns run the real loop against the suite's fake (TD-CHAT-16).
      const restartedModel = capturedModel;
      vi.spyOn(restartedServer.traceStore, 'getTotalCostSince')
        .mockImplementationOnce(() => { throw new Error('transient daily cost read failure'); });

      const failedReadResponse = await injectWithAuth(restartedServer, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'What is 19 * 23?', session: 'failed-carryover-read' },
      });
      expect(failedReadResponse.statusCode).toBe(200);
      expect(restartedModel()).toBe('primary-test-model');

      // $8 persisted before restart + ~$2 incurred in this process reaches the
      // $10 total. The new trace is above the process-start id boundary, so a
      // recovered carryover read must not seed it and then add it again.
      restartedServer.agentState.costTracker.addUsage('claude-opus-4-8', 133_334, 0);
      const currentTraceId = restartedServer.traceStore.start({
        sessionId: 'current-process-paid-turn',
        workspaceId: 'default',
        model: 'claude-opus-4-8',
        input: 'current process turn',
      });
      restartedServer.traceStore.finalize(currentTraceId, {
        outcome: 'success',
        output: 'ok',
        costUsd: 2,
      });

      const recoveredReadResponse = await injectWithAuth(restartedServer, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'What is 19 * 23?', session: 'recovered-carryover-read' },
      });
      expect(recoveredReadResponse.statusCode).toBe(200);
      expect(restartedModel()).toBe('primary-test-model');
      expect(recoveredReadResponse.body).not.toContain('event: model_switch');

      config.setDailyBudget(12.5);
      config.save();
      const response = await injectWithAuth(restartedServer, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'What is 19 * 23?', session: 'persisted-spend-trivial-route' },
      });
      expect(response.statusCode).toBe(200);
      expect(restartedModel()).toBe('budget-test-model');
      expect(response.body).toContain('Budget 80% reached ($10.00/$12.50)');
    } finally {
      if (initialServer) await initialServer.close();
      if (restartedServer) await restartedServer.close();
      await new Promise(resolve => setTimeout(resolve, 100));
      fs.rmSync(restartDir, { recursive: true, force: true });
    }
  });

  it('never sends local conversation history to a cloud budget model implicitly', async () => {
    const config = new WaggleConfig(tmpDir);
    config.setBudgetModel('openrouter/cloud-budget-model');
    config.save();
    const session = 'local-history-no-cloud-egress';
    for (let turn = 0; turn < 12; turn++) {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: `Private medical record ${turn}: ${'confidential detail '.repeat(500)}`,
          session,
        },
      });
      expect(response.statusCode).toBe(200);
    }
    const followUp = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Thanks', session },
    });

    expect(followUp.statusCode).toBe(200);
    expect(capturedConfigs).toHaveLength(13);
    expect(capturedConfigs.every((agentConfig) => agentConfig.model === 'primary-test-model'))
      .toBe(true);
    expect(completionRequests.every(({ model }) => model !== 'openrouter/cloud-budget-model'))
      .toBe(true);
  });

  it('does not send compressible local history through a remote Ollama alias', async () => {
    const config = new WaggleConfig(tmpDir);
    config.setBudgetModel('ollama/remote-budget-test-model');
    config.save();
    const session = 'remote-ollama-compression-blocked';
    for (let turn = 0; turn < 12; turn++) {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: `Analyze private medical record ${turn}: ${'confidential detail '.repeat(500)}`,
          session,
        },
      });
      expect(response.statusCode).toBe(200);
    }

    expect(capturedConfigs).toHaveLength(12);
    expect(capturedConfigs.every((agentConfig) => agentConfig.model === 'primary-test-model'))
      .toBe(true);
    expect(completionRequests.every(({ model }) => model !== 'remote-budget-test-model'))
      .toBe(true);
  });

  it('keeps compression on the verified local Ollama budget model', async () => {
    const session = 'local-ollama-compression';
    for (let turn = 0; turn < 12; turn++) {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: `Analyze private engineering record ${turn}: ${'confidential detail '.repeat(500)}`,
          session,
        },
      });
      expect(response.statusCode).toBe(200);
    }

    const localCompressionRequests = completionRequests.filter(
      ({ url, model }) => url.includes('11434/v1/chat/completions') && model === 'budget-test-model',
    );
    expect(localCompressionRequests.length).toBeGreaterThan(0);
    expect(capturedConfigs.every((agentConfig) => agentConfig.model === 'primary-test-model'))
      .toBe(true);
  });

  it('does not call a paid context compressor while a hard model budget is active', async () => {
    const previousProvider = server.agentState.llmProvider;
    const previousCurrentModel = server.agentState.currentModel;
    const session = 'hard-budget-paid-compression-blocked';
    server.vault.set('mistral', 'mistral-hard-budget-compression-test');
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'test',
      checkedAt: new Date().toISOString(),
    };
    server.agentState.currentModel = 'mistral/mistral-large-latest';

    const config = new WaggleConfig(tmpDir);
    config.setDefaultModel('mistral/mistral-large-latest');
    config.setBudgetModel('mistral/mistral-small-latest');
    config.setDailyBudget(1);
    config.setBudgetHardCap(true);
    config.save();
    server.agentState.costTracker.setBudget(1, 'hard');
    vi.spyOn(server.agentState.costTracker, 'getDailyTotal').mockReturnValue(1);

    for (let turn = 0; turn < 8; turn++) {
      persistMessage(tmpDir, activeWorkspaceId, session, {
        role: turn % 2 === 0 ? 'user' : 'assistant',
        content: `Sensitive history ${turn}: ${'private detail '.repeat(3_000)}`,
      });
    }
    completionRequests = [];

    try {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'Summarize the latest point.', session },
      });

      expect(response.statusCode).toBe(200);
      expect(completionRequests).toEqual([]);
    } finally {
      server.vault.delete('mistral');
      server.agentState.costTracker.setBudget(null, 'soft');
      server.agentState.llmProvider = previousProvider;
      server.agentState.currentModel = previousCurrentModel;
    }
  });

  it('returns to the primary when an optional budget model is unavailable', async () => {
    const config = new WaggleConfig(tmpDir);
    config.setBudgetModel('ollama/missing-budget-test-model');
    config.setFallbackModel('ollama/fallback-test-model');
    config.save();

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Thanks', session: 'missing-budget-returns-primary' },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedModel()).toBe('primary-test-model');
  });

  it('returns to the primary before fallback when an optional budget run fails', async () => {
    const config = new WaggleConfig(tmpDir);
    config.setFallbackModel('ollama/fallback-test-model');
    config.setDailyBudget(1);
    config.save();
    vi.spyOn(server.agentState.costTracker, 'getDailyTotal').mockReturnValue(1);
    // The budget model cannot be reached; the loop's own transport retries
    // run out (TD-CHAT-16).
    reply = (request) => (request.model === 'budget-test-model'
      ? { type: 'network_error', message: 'fetch failed' }
      : { type: 'text', content: 'primary ok', usage: { inputTokens: 1, outputTokens: 1 } });

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'What is 19 * 23?', session: 'failed-budget-returns-primary' },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedConfigs.map(attempt => attempt.model)).toEqual(['budget-test-model', 'primary-test-model']);
  });

  it('never replays an incomplete budget-model run on the primary or fallback', async () => {
    const config = new WaggleConfig(tmpDir);
    config.setFallbackModel('ollama/fallback-test-model');
    config.setDailyBudget(1);
    config.save();
    vi.spyOn(server.agentState.costTracker, 'getDailyTotal').mockReturnValue(1);
    const addUsage = vi.spyOn(server.agentState.costTracker, 'addUsage');
    const calculateUsageCost = vi.spyOn(server.agentState.costTracker, 'calculateUsageCost');
    const addTokens = vi.spyOn(server.sessionManager, 'addTokens');
    const usageEntriesBefore = server.agentState.costTracker.getUsageEntries().length;
    // The budget model's stream is cut before [DONE] with its usage reported
    // (TD-CHAT-16).
    reply = () => ({ type: 'truncated_stream', content: 'partial', usage: { inputTokens: 13_500, outputTokens: 500 } });

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'What is 19 * 23?', session: 'incomplete-budget-no-replay' },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedConfigs.map(attempt => attempt.model)).toEqual(['budget-test-model']);
    expect(completionRequests).toHaveLength(1);
    expect(response.body).toContain('incomplete completion');
    expect(response.body).not.toContain('fallback-test-model');
    // Re-pinned (TD-CHAT-16 ruling 3): the route charges only an injected
    // runner, so it never calls addUsage here. The loop's own spend meter
    // records the cut attempt's reported usage, once, with the same model,
    // tokens, scope and billing class.
    expect(addUsage).not.toHaveBeenCalled();
    expect(server.agentState.costTracker.getUsageEntries().slice(usageEntriesBefore)).toEqual([
      expect.objectContaining({
        model: 'ollama/budget-test-model',
        input: 13_500,
        output: 500,
        workspaceId: activeWorkspaceId,
        billingClass: 'free',
      }),
    ]);
    expect(addTokens).toHaveBeenCalledOnce();
    expect(addTokens).toHaveBeenCalledWith(activeWorkspaceId, 14_000);
    expect(calculateUsageCost).toHaveBeenCalledWith({
      model: 'ollama/budget-test-model',
      input: 13_500,
      output: 500,
      billingClass: 'free',
    });
    const [persistedTrace] = server.traceStore.query({
      sessionId: 'incomplete-budget-no-replay',
      limit: 1,
    });
    expect(persistedTrace.cost_usd).toBe(0);
    expect(JSON.parse(persistedTrace.trace_json).tokens).toEqual({ input: 13_500, output: 500 });
  });

  it('records what a run cancelled by the client mid-stream consumed', async () => {
    const calculateUsageCost = vi.spyOn(server.agentState.costTracker, 'calculateUsageCost');
    const addUsage = vi.spyOn(server.agentState.costTracker, 'addUsage');
    const usageEntriesBefore = server.agentState.costTracker.getUsageEntries().length;
    let markPaused!: () => void;
    let releaseModel!: () => void;
    const paused = new Promise<void>(resolve => { markPaused = resolve; });
    const modelGate = new Promise<void>(resolve => { releaseModel = resolve; });
    let modelSignal: AbortSignal | undefined;
    // TD-CHAT-16 ruling 16: the client disconnects while the model is
    // mid-answer; the stream would report 20 000 / 1 000 only at its end.
    reply = (request) => {
      modelSignal = (request as { signal?: AbortSignal }).signal;
      return {
        type: 'stream',
        parts: [
          { content: 'partial output that must not be committed' },
          { pause: () => { markPaused(); return modelGate; } },
          { content: ' and the rest' },
        ],
        usage: { inputTokens: 20_000, outputTokens: 1_000 },
      };
    };
    const controller = new AbortController();
    let body = '';

    try {
      const baseUrl = server.server.listening
        ? `http://127.0.0.1:${(server.server.address() as { port: number }).port}`
        : await server.listen({ host: '127.0.0.1', port: 0 });
      const response = await realFetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { authorization: `Bearer ${getAuthToken(server)}`, 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Analyze this report', session: 'cancelled-run-usage' }),
        signal: controller.signal,
      });
      const reader = response.body!.getReader();
      await paused;
      const decoder = new TextDecoder();
      const chunk = await reader.read();
      if (!chunk.done) body += decoder.decode(chunk.value);
      controller.abort();
      await vi.waitFor(() => expect(modelSignal?.aborted).toBe(true), { timeout: 3_000 });
      releaseModel();
      await vi.waitFor(() => {
        const [trace] = server.traceStore.query({ sessionId: 'cancelled-run-usage', limit: 1 });
        expect(trace?.outcome).toBe('abandoned');
      }, { timeout: 5_000 });
    } finally {
      controller.abort();
      releaseModel();
    }

    expect(completionRequests).toHaveLength(1);
    expect(body).not.toContain('event: error');
    expect(body).not.toContain('event: done');
    // The stream never reached its usage frame. The route charges nothing
    // itself; the loop's spend meter commits its own estimate for the
    // cancelled call, once, against the primary. The estimate is not the
    // 20 000 / 1 000 the stream would have reported. The tracker's own
    // budget sums still call calculateUsageCost over stored entries, so pin
    // only that the unreported usage was never costed.
    expect(calculateUsageCost).not.toHaveBeenCalledWith(
      expect.objectContaining({ input: 20_000, output: 1_000 }),
    );
    expect(addUsage).not.toHaveBeenCalled();
    const entries = server.agentState.costTracker.getUsageEntries().slice(usageEntriesBefore);
    expect(entries).toEqual([expect.objectContaining({
      model: 'ollama/primary-test-model',
      workspaceId: activeWorkspaceId,
      billingClass: 'free',
    })]);
    expect(entries[0].input).toBeGreaterThan(0);
    expect(entries[0].output).toBeGreaterThan(0);
    expect([entries[0].input, entries[0].output]).not.toEqual([20_000, 1_000]);
    // The abandoned trace records no tokens: none were reported to the route.
    const [persistedTrace] = server.traceStore.query({ sessionId: 'cancelled-run-usage', limit: 1 });
    expect(persistedTrace.outcome).toBe('abandoned');
    expect(persistedTrace.cost_usd).toBe(0);
    expect(JSON.parse(persistedTrace.trace_json).tokens).toEqual({ input: 0, output: 0 });
  });

  it('uses the configured fallback only after both budget and primary runs fail', async () => {
    // Neither the budget model nor the primary can be reached; the loop's own
    // transport retries run out on each (TD-CHAT-16). Its own server: eight
    // transport failures on the shared Ollama origin open the model endpoint's
    // circuit breaker, which would refuse every later pin's model call (§5).
    const failureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-smart-router-both-fail-'));
    const config = new WaggleConfig(failureDir);
    config.setDefaultModel(primary);
    config.setBudgetModel(budget);
    config.setFallbackModel('ollama/fallback-test-model');
    config.setDailyBudget(1);
    config.setBudgetThreshold(0.8);
    config.save();
    const failureServer = await buildLocalServer({ dataDir: failureDir });
    failureServer.llmRetryBackoffMs = () => 0;
    vi.spyOn(failureServer.agentState.costTracker, 'getDailyTotal').mockReturnValue(1);
    reply = (request) => (request.model === 'fallback-test-model'
      ? { type: 'text', content: 'fallback ok', usage: { inputTokens: 1, outputTokens: 1 } }
      : { type: 'network_error', message: 'fetch failed' });

    try {
      const response = await injectWithAuth(failureServer, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'What is 19 * 23?', session: 'budget-primary-fallback-order' },
      });

      expect(response.statusCode).toBe(200);
      expect(capturedConfigs.map(attempt => attempt.model)).toEqual([
        'budget-test-model',
        'primary-test-model',
        'fallback-test-model',
      ]);
      expect(switchReasons(response.body)).toEqual([
        'Budget 80% reached ($1.00/$1.00)',
        'ollama/budget-test-model failed; primary selected',
        'ollama/primary-test-model failed (timeout); configured fallback selected',
      ]);
    } finally {
      await failureServer.close();
      await new Promise(resolve => setTimeout(resolve, 100));
      try {
        fs.rmSync(failureDir, { recursive: true, force: true });
      } catch {
        // Windows may briefly retain a native SQLite handle after server.close().
      }
    }
  });

  describe('model selection exits (TD-CHAT-3 slice 10 pins)', () => {
    const overBudget = (setup: (config: WaggleConfig) => void) => {
      const config = new WaggleConfig(tmpDir);
      config.setDailyBudget(1);
      setup(config);
      config.save();
      vi.spyOn(server.agentState.costTracker, 'getDailyTotal').mockReturnValue(1);
    };

    it('returns to the primary when the over-budget model is unavailable at preflight', async () => {
      overBudget((config) => config.setBudgetModel('ollama/missing-budget-test-model'));

      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'What is 19 * 23?', session: 'budget-unavailable-preflight' },
      });

      expect(response.statusCode).toBe(200);
      expect(attemptModels()).toEqual(['primary-test-model']);
      expect(switchReasons(response.body)).toEqual([
        'ollama/missing-budget-test-model unavailable; primary selected',
      ]);
    });

    it('uses the configured fallback when both the budget model and the primary are unavailable at preflight', async () => {
      overBudget((config) => {
        config.setDefaultModel('ollama/missing-primary-test-model');
        config.setBudgetModel('ollama/missing-budget-test-model');
        config.setFallbackModel('ollama/fallback-test-model');
      });

      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'What is 19 * 23?', session: 'budget-and-primary-unavailable' },
      });

      expect(response.statusCode).toBe(200);
      expect(attemptModels()).toEqual(['fallback-test-model']);
      expect(switchReasons(response.body)).toEqual([
        'ollama/missing-budget-test-model and ollama/missing-primary-test-model unavailable; configured fallback selected',
      ]);
    });

    it('uses the configured fallback when a failed budget run cannot return to an unavailable primary', async () => {
      overBudget((config) => {
        config.setDefaultModel('ollama/missing-primary-test-model');
        config.setFallbackModel('ollama/fallback-test-model');
      });
      reply = unreachable('budget-test-model');

      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'What is 19 * 23?', session: 'budget-run-primary-unavailable' },
      });

      expect(response.statusCode).toBe(200);
      expect(attemptModels()).toEqual(['budget-test-model', 'fallback-test-model']);
      expect(switchReasons(response.body)).toEqual([
        'Budget 80% reached ($1.00/$1.00)',
        'ollama/budget-test-model failed and ollama/missing-primary-test-model unavailable; configured fallback selected',
      ]);
    });

    it('ends the turn when the selected primary is unavailable and no fallback is configured', async () => {
      const config = new WaggleConfig(tmpDir);
      config.setDefaultModel('ollama/missing-primary-test-model');
      config.save();

      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'Analyze this report', session: 'primary-unavailable-no-fallback' },
      });

      expect(response.statusCode).toBe(200);
      expect(attemptModels()).toEqual([]);
      expect(completionRequests).toEqual([]);
      expect(response.body).toContain('event: error');
      expect(response.body).not.toContain('event: done');
      expect(switchReasons(response.body)).toEqual([]);
    });

    it('reports the model that answered and bills it after a fallback', async () => {
      const config = new WaggleConfig(tmpDir);
      config.clearBudgetModel();
      config.setFallbackModel('ollama/fallback-test-model');
      config.save();
      const addUsage = vi.spyOn(server.agentState.costTracker, 'addUsage');
      const usageEntriesBefore = server.agentState.costTracker.getUsageEntries().length;
      reply = unreachable('primary-test-model');

      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'Analyze this report', session: 'fallback-done-model' },
      });

      expect(response.statusCode).toBe(200);
      expect(attemptModels()).toEqual(['primary-test-model', 'fallback-test-model']);
      const done = sseEvents(response.body).find((event) => event.event === 'done');
      expect(done?.data.model).toBe('ollama/fallback-test-model');
      // Re-pinned (TD-CHAT-16 ruling 3): the route charges only an injected
      // runner. The loop's own spend meter bills the model that answered, last.
      expect(addUsage).not.toHaveBeenCalled();
      const billedModels = server.agentState.costTracker.getUsageEntries()
        .slice(usageEntriesBefore)
        .map(entry => entry.model);
      expect(billedModels).toContain('ollama/fallback-test-model');
      expect(billedModels.at(-1)).toBe('ollama/fallback-test-model');
    });
  });

  it('records the actual fallback model across SSE, history, and execution trace', async () => {
    const config = new WaggleConfig(tmpDir);
    config.clearBudgetModel();
    config.setFallbackModel('ollama/fallback-test-model');
    config.save();
    // The primary cannot be reached; the fallback answers (TD-CHAT-16).
    reply = (request) => (request.model === 'primary-test-model'
      ? { type: 'network_error', message: 'fetch failed' }
      : { type: 'text', content: 'fallback ok', usage: { inputTokens: 1, outputTokens: 1 } });
    const session = 'actual-fallback-model-provenance';

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Review this TypeScript function', session },
    });

    expect(response.statusCode).toBe(200);
    expect(attemptModels()).toEqual(['primary-test-model', 'fallback-test-model']);
    const switchEvents = [...response.body.matchAll(/event: model_switch\r?\ndata: (.+?)(?:\r?\n|$)/g)]
      .map(match => JSON.parse(match[1]!) as Record<string, unknown>);
    expect(switchEvents).toEqual([{
      model: 'ollama/fallback-test-model',
      reason: 'ollama/primary-test-model failed (timeout); configured fallback selected',
      primary: 'ollama/primary-test-model',
    }]);
    const doneEvents = [...response.body.matchAll(/event: done\r?\ndata: (.+?)(?:\r?\n|$)/g)]
      .map(match => JSON.parse(match[1]!) as { model?: string });
    expect(doneEvents).toHaveLength(1);
    expect(doneEvents[0]?.model).toBe('ollama/fallback-test-model');

    const historyResponse = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/history?workspace=${activeWorkspaceId}&session=${session}`,
    });
    expect(historyResponse.statusCode).toBe(200);
    expect(historyResponse.json().messages).toContainEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'fallback ok',
        model: 'ollama/fallback-test-model',
      }),
    );
    expect(loadSessionMessages(tmpDir, activeWorkspaceId, session)).toContainEqual({
      role: 'assistant',
      content: 'fallback ok',
      model: 'ollama/fallback-test-model',
    });
    const [persistedTrace] = server.traceStore.query({ sessionId: session, limit: 1 });
    expect(persistedTrace.model).toBe('ollama/fallback-test-model');
  });

  it('surfaces automatic preflight model substitution across SSE, history, and trace', async () => {
    const config = new WaggleConfig(tmpDir);
    config.setDefaultModel('openai/unavailable-test-model');
    config.clearBudgetModel();
    config.clearFallbackModel();
    config.save();
    const previousCurrentModel = server.agentState.currentModel;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    server.agentState.currentModel = primary;
    const session = 'preflight-model-substitution-provenance';

    try {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'Review this TypeScript function', session },
      });

      expect(response.statusCode, response.body).toBe(200);
      expect(capturedModel()).toBe('primary-test-model');
      const switchEvents = [...response.body.matchAll(/event: model_switch\r?\ndata: (.+?)(?:\r?\n|$)/g)]
        .map(match => JSON.parse(match[1]!) as Record<string, unknown>);
      expect(switchEvents).toEqual([{
        model: 'ollama/primary-test-model',
        reason: 'openai/unavailable-test-model unavailable; ollama/primary-test-model selected',
        primary: 'openai/unavailable-test-model',
      }]);
      const doneEvents = [...response.body.matchAll(/event: done\r?\ndata: (.+?)(?:\r?\n|$)/g)]
        .map(match => JSON.parse(match[1]!) as { model?: string });
      expect(doneEvents).toHaveLength(1);
      expect(doneEvents[0]?.model).toBe('ollama/primary-test-model');

      const historyResponse = await injectWithAuth(server, {
        method: 'GET',
        url: `/api/history?workspace=${activeWorkspaceId}&session=${session}`,
      });
      expect(historyResponse.statusCode).toBe(200);
      expect(historyResponse.json().messages).toContainEqual(
        expect.objectContaining({
          role: 'assistant',
          content: 'ok',
          model: 'ollama/primary-test-model',
        }),
      );
      expect(loadSessionMessages(tmpDir, activeWorkspaceId, session)).toContainEqual({
        role: 'assistant',
        content: 'ok',
        model: 'ollama/primary-test-model',
      });
      const [persistedTrace] = server.traceStore.query({ sessionId: session, limit: 1 });
      expect(persistedTrace.model).toBe('ollama/primary-test-model');
    } finally {
      server.agentState.currentModel = previousCurrentModel;
      if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousOpenAiKey;
    }
  });

  it.each([
    'openai/gpt-5.6-sol',
    'gpt-5.6-sol',
  ])('surfaces provider-family fallback for %s instead of treating it as model normalization', async (configuredModel) => {
    const config = new WaggleConfig(tmpDir);
    config.setDefaultModel(configuredModel);
    config.clearBudgetModel();
    config.clearFallbackModel();
    config.save();
    const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.OPENROUTER_API_KEY = 'sk-openrouter-provider-family-test';
    const previousProvider = server.agentState.llmProvider;
    const previousCurrentModel = server.agentState.currentModel;
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'test',
      checkedAt: new Date().toISOString(),
    };
    server.agentState.currentModel = '';

    try {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Review this consequential architecture decision.',
          session: `provider-family-model-substitution-${configuredModel.replace(/[^a-z0-9_-]/gi, '-')}`,
        },
      });

      expect(response.statusCode, response.body).toBe(200);
      expect(capturedModel()).toBe('openrouter/openai/gpt-5.6-sol');
      const switchEvents = [...response.body.matchAll(/event: model_switch\r?\ndata: (.+?)(?:\r?\n|$)/g)]
        .map(match => JSON.parse(match[1]!) as Record<string, unknown>);
      expect(switchEvents).toEqual([{
        model: 'openrouter/openai/gpt-5.6-sol',
        reason: `${configuredModel} unavailable; openrouter/openai/gpt-5.6-sol selected`,
        primary: configuredModel,
      }]);
    } finally {
      server.agentState.llmProvider = previousProvider;
      server.agentState.currentModel = previousCurrentModel;
      if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousOpenAiKey;
      if (previousOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = previousOpenRouterKey;
    }
  });

  it.each([
    'I am not ready to explore the repo; explain instead.',
    'We might not try now; explain instead.',
    'We will not try now; explain instead.',
    'We would not try now; explain instead.',
    'Do not retry; explain instead.',
    'Run no tests; explain instead.',
    'Edit no files; explain instead.',
    'Run none of the tests; explain instead.',
    'Edit 0 files; explain instead.',
    'Write not a single file; explain instead.',
    'Run neither unit nor integration tests; explain instead.',
  ])('keeps a negative-only repository capability request tool-free: %s', (message) => {
    expect(isExplicitGatedToolRequest(message)).toBe(false);
  });

  it('preserves a positive bounded execution request', () => {
    expect(isExplicitGatedToolRequest('Run no more than 2 tests.')).toBe(true);
  });

  it('preserves an explicit artifact regeneration request', () => {
    expect(isExplicitGatedToolRequest('Regenerate PM-Launch-Brief.docx.')).toBe(true);
    expect(isExplicitGatedToolRequest(
      'Regenerate PM-Launch-Brief.docx with the same one-page launch brief content so it is refreshed in the workspace Library. Do not create any other file.',
    )).toBe(true);
  });

  it('uses an available built-in artifact generator before capability acquisition', () => {
    const message = 'Regenerate PM-Launch-Brief.docx with the same one-page launch brief content.';

    expect(shouldRequireCapabilityAcquisitionTools(message, [{ name: 'generate_docx' }])).toBe(false);
    expect(shouldRequireCapabilityAcquisitionTools(message, [])).toBe(true);
  });

  it.each([
    'Fix no tools serialized error in the repo',
    'Debug no output from the server',
    'Implement zero trust architecture in the repo',
    'Create zero trust policy file',
  ])('preserves a legitimate no-error or zero-trust capability request: %s', (message) => {
    expect(isExplicitGatedToolRequest(message)).toBe(true);
  });

  it.each([
    'try now',
    'try again',
    'retry',
    'same again',
  ])('recognizes a direct retry capability request: %s', (message) => {
    expect(isExplicitGatedToolRequest(message)).toBe(true);
  });

  it('sends a bounded relevant subset of 29 eligible tools through the real chat provider path', async () => {
    const execute = vi.fn(async () => 'unused');
    const candidateNames = [
      'bash', 'read_file', 'write_file', 'edit_file', 'search_files',
      'search_content', 'web_search', 'web_fetch', 'search_memory',
      'save_memory', 'generate_docx', 'create_plan', 'add_plan_step',
      'execute_step', 'show_plan', 'spawn_agent', 'list_agents',
      'get_agent_result', 'git_status', 'git_diff', 'git_log', 'git_commit',
      'multi_edit', 'search_skills', 'create_skill', 'run_code',
      'generate_xlsx', 'generate_pptx', 'generate_pdf',
    ];
    const candidates: ToolDefinition[] = candidateNames.map((name) => ({
      name,
      description: 'Inspect, test, validate, and verify TypeScript code in this workspace.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Code inspection query.' },
        },
      },
      execute,
    }));
    const providerRequests: Array<{
      model?: string;
      tools?: Array<{ function?: { name?: string } }>;
      messages?: Array<{ role?: string; content?: string }>;
    }> = [];
    vi.restoreAllMocks();
    server.sessionManager.close(activeWorkspaceId);
    const previousWorkspacePersona = server.workspaceManager.get(activeWorkspaceId)?.personaId;
    server.workspaceManager.update(activeWorkspaceId, { personaId: 'coordinator' });
    const buildToolsForSession = vi.spyOn(
      server.agentState,
      'buildToolsForSession',
    ).mockReturnValue(candidates);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [{ name: 'primary-test-model' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (!url.includes('/chat/completions')) return new Response('', { status: 503 });
      providerRequests.push(JSON.parse(String(init?.body ?? '{}')));
      const responseContent = providerRequests.length === 2 || providerRequests.length === 4
        ? 'Still nothing. No tools are serialized in this turn either — no bash, no read_file, no search_files — so there\'s nothing for me to run, and I won\'t claim otherwise.'
        : providerRequests.length === 3
          ? '<tools>bash, read_file, search_files</tools>'
          : 'qualified';
      return new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: responseContent } }] })}\n\n`
        + `data: ${JSON.stringify({
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 1 },
        })}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );
    });

    try {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Use tools to inspect, review, edit, test, validate, run code, create a plan, delegate agents, and generate artifacts for this TypeScript workspace.',
          session: 'production-tool-context-29',
          autonomy: 'trusted',
          persona: 'general-purpose',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(candidateNames).toHaveLength(29);
      expect(buildToolsForSession).toHaveBeenCalled();
      expect(providerRequests).toHaveLength(1);
      const transmittedTools = providerRequests[0]?.tools ?? [];
      const transmittedNames = transmittedTools.map(tool => tool.function?.name);
      expect(transmittedNames.length).toBeGreaterThanOrEqual(10);
      expect(transmittedNames.length).toBeLessThanOrEqual(14);
      expect(new Set(transmittedNames).size).toBe(transmittedNames.length);
      expect(transmittedNames.every(name => candidates.some(tool => tool.name === name))).toBe(true);
      expect(transmittedNames).toEqual(expect.arrayContaining([
        'search_skills',
        'create_skill',
      ]));
      const transmittedSystemPrompt = providerRequests[0]?.messages
        ?.find(message => message.role === 'system')?.content ?? '';
      const selfAwarenessSection = transmittedSystemPrompt.match(
        /# Self-Awareness[\s\S]*?## Groundedness/,
      )?.[0] ?? '';
      expect(selfAwarenessSection).toContain(
        `${transmittedNames.length} tools available: ${transmittedNames.join(', ')}.`,
      );
      const omittedNames = candidateNames.filter(name => !transmittedNames.includes(name));
      expect(omittedNames.some(name => selfAwarenessSection.includes(name))).toBe(false);
      const serializedSchemaChars = JSON.stringify(transmittedTools).length;
      expect(serializedSchemaChars).toBeLessThanOrEqual(8_000);

      const doneMatches = [...response.body.matchAll(/event: done\r?\ndata: (.+?)(?:\r?\n|$)/g)];
      expect(doneMatches).toHaveLength(1);
      const done = JSON.parse(doneMatches[0]![1]!) as {
        toolsUsed?: string[];
        contextMetrics?: Record<string, number>;
      };
      expect(done.toolsUsed).toEqual([]);
      expect(done.contextMetrics).toMatchObject({
        toolCatalogCount: 29,
        toolEligibleCount: 29,
        toolSelectedCount: transmittedNames.length,
        toolOmittedCount: 29 - transmittedNames.length,
        transmittedToolSchemaChars: serializedSchemaChars,
        estimatedToolSchemaTokens: Math.ceil(serializedSchemaChars / 4),
      });
      expect(done.contextMetrics?.selectorLatencyMs).toBeLessThanOrEqual(250);
      const emittedToolNames = [
        ...response.body.matchAll(/event: tool\r?\ndata: (.+?)(?:\r?\n|$)/g),
      ].map(match => (JSON.parse(match[1]!) as { name?: string }).name);
      const emittedToolResultNames = [
        ...response.body.matchAll(/event: tool_result\r?\ndata: (.+?)(?:\r?\n|$)/g),
      ].map(match => (JSON.parse(match[1]!) as { name?: string }).name);
      expect(emittedToolNames.filter(name => candidateNames.includes(name ?? ''))).toEqual([]);
      expect(
        emittedToolResultNames.filter(name => candidateNames.includes(name ?? '')),
      ).toEqual([]);
      expect(execute).not.toHaveBeenCalled();

      const discoverySession = 'production-tool-context-repo-discovery';
      const discoveryResponse = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Explore the repo and lets see what it actually does',
          session: discoverySession,
          persona: 'general-purpose',
        },
      });
      expect(discoveryResponse.statusCode).toBe(200);
      expect(providerRequests).toHaveLength(2);
      const discoveryTools = providerRequests[1]?.tools ?? [];
      const discoveryNames = discoveryTools
        .map(tool => tool.function?.name);
      expect(discoveryNames).toEqual([
        'search_files',
        'search_content',
        'read_file',
        'git_status',
        'git_log',
      ]);
      expect(discoveryNames).not.toEqual(expect.arrayContaining([
        'bash',
        'write_file',
        'edit_file',
        'run_code',
      ]));
      const discoverySchemaChars = JSON.stringify(discoveryTools).length;
      expect(discoverySchemaChars).toBeLessThanOrEqual(8_000);
      const discoverySystemPrompt = providerRequests[1]?.messages
        ?.find(message => message.role === 'system')?.content ?? '';
      expect(discoverySystemPrompt).toContain('# READ-ONLY OPERATING CONTRACT');
      expect(discoverySystemPrompt.length).toBeLessThan(18_000);
      const discoveryDoneMatches = [
        ...discoveryResponse.body.matchAll(/event: done\r?\ndata: (.+?)(?:\r?\n|$)/g),
      ];
      expect(discoveryDoneMatches).toHaveLength(1);
      const discoveryDone = JSON.parse(discoveryDoneMatches[0]![1]!) as {
        contextMetrics?: Record<string, number>;
      };
      expect(discoveryDone.contextMetrics).toMatchObject({
        toolCatalogCount: 29,
        toolSelectedCount: 5,
        transmittedToolSchemaChars: discoverySchemaChars,
        estimatedToolSchemaTokens: Math.ceil(discoverySchemaChars / 4),
      });
      expect(discoveryDone.contextMetrics?.toolEligibleCount).toBeGreaterThanOrEqual(5);
      expect(discoveryDone.contextMetrics?.toolOmittedCount).toBe(
        discoveryDone.contextMetrics!.toolEligibleCount - 5,
      );

      const resultQueryResponse = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'and what is result',
          session: discoverySession,
          persona: 'general-purpose',
        },
      });
      expect(resultQueryResponse.statusCode).toBe(200);
      expect(providerRequests).toHaveLength(3);
      expect(providerRequests[2]?.tools ?? []).toEqual([]);

      const firstRetryResponse = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'try now',
          session: discoverySession,
          persona: 'general-purpose',
        },
      });
      expect(firstRetryResponse.statusCode).toBe(200);
      expect(providerRequests).toHaveLength(4);
      expect((providerRequests[3]?.tools ?? []).map(tool => tool.function?.name))
        .toEqual(discoveryNames);

      const retryResponse = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'try again',
          session: discoverySession,
          persona: 'general-purpose',
        },
      });
      expect(retryResponse.statusCode).toBe(200);
      expect(providerRequests).toHaveLength(5);
      const retryTools = providerRequests[4]?.tools ?? [];
      expect(retryTools.map(tool => tool.function?.name)).toEqual(discoveryNames);
      expect(JSON.stringify(retryTools).length).toBe(discoverySchemaChars);
      const retryDoneMatches = [
        ...retryResponse.body.matchAll(/event: done\r?\ndata: (.+?)(?:\r?\n|$)/g),
      ];
      expect(retryDoneMatches).toHaveLength(1);
      const retryDone = JSON.parse(retryDoneMatches[0]![1]!) as {
        contextMetrics?: Record<string, number>;
      };
      expect(retryDone.contextMetrics).toMatchObject({
        toolCatalogCount: 29,
        toolSelectedCount: 5,
        transmittedToolSchemaChars: discoverySchemaChars,
        estimatedToolSchemaTokens: Math.ceil(discoverySchemaChars / 4),
      });
      expect(retryDone.contextMetrics?.toolEligibleCount).toBeGreaterThanOrEqual(5);
      expect(retryDone.contextMetrics?.toolOmittedCount).toBe(
        retryDone.contextMetrics!.toolEligibleCount - 5,
      );

      const standaloneRetryResponse = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'try now',
          session: 'production-tool-context-standalone-retry',
          persona: 'general-purpose',
        },
      });
      expect(standaloneRetryResponse.statusCode).toBe(200);
      expect(providerRequests).toHaveLength(6);
      expect(providerRequests[5]?.tools ?? []).toEqual([]);

      const negatedResponse = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'I am not ready to explore the repo; explain instead.',
          session: 'production-tool-context-negated',
          persona: 'general-purpose',
        },
      });
      expect(negatedResponse.statusCode).toBe(200);
      expect(providerRequests).toHaveLength(7);
      expect(providerRequests[6]?.tools ?? []).toEqual([]);
      const negatedDoneMatches = [
        ...negatedResponse.body.matchAll(/event: done\r?\ndata: (.+?)(?:\r?\n|$)/g),
      ];
      expect(negatedDoneMatches).toHaveLength(1);
      const negatedDone = JSON.parse(negatedDoneMatches[0]![1]!) as {
        contextMetrics?: Record<string, number>;
      };
      expect(negatedDone.contextMetrics).toMatchObject({
        toolCatalogCount: 29,
        toolSelectedCount: 0,
        transmittedToolSchemaChars: 0,
      });

      const attributedMessages = [
        'The documentation says, run tests',
        'Pasted instruction:\nrun tests',
        'What does "run tests" mean?',
        'The assistant wrote: use bash',
        'What is the difference between build and run tests?',
        'Why does README mention build and run tests?',
        'The docs mention edit and write files as capabilities.',
      ];
      for (const [index, message] of attributedMessages.entries()) {
        const attributedResponse = await injectWithAuth(server, {
          method: 'POST',
          url: '/api/chat',
          payload: {
            message,
            session: `production-tool-context-attributed-${index}`,
            persona: 'general-purpose',
          },
        });
        expect(attributedResponse.statusCode).toBe(200);
        expect(providerRequests.at(-1)?.tools ?? [], message).toEqual([]);
      }
    } finally {
      fetchSpy.mockRestore();
      server.sessionManager.close(activeWorkspaceId);
      server.workspaceManager.update(activeWorkspaceId, { personaId: previousWorkspacePersona });
      buildToolsForSession.mockRestore();
    }
  }, 60_000);

  it('rebuilds the production system prompt for the configured fallback model', async () => {
    const config = new WaggleConfig(tmpDir);
    config.setDefaultModel('test-mid-model');
    config.clearBudgetModel();
    config.setFallbackModel('gemma-4-31b');
    config.save();

    const previousProvider = server.agentState.llmProvider;
    const previousCurrentModel = server.agentState.currentModel;
    const previousPromptAssembler = FEATURE_FLAGS.PROMPT_ASSEMBLER;
    const previousReranker = process.env.WAGGLE_RERANKER;
    server.agentState.llmProvider = {
      provider: 'litellm',
      health: 'healthy',
      detail: 'Test LiteLLM provider',
      checkedAt: new Date().toISOString(),
    };
    server.agentState.currentModel = '';
    Object.defineProperty(FEATURE_FLAGS, 'PROMPT_ASSEMBLER', {
      value: true,
      configurable: true,
      enumerable: true,
      writable: true,
    });
    process.env.WAGGLE_RERANKER = '0';

    const requests: Array<{
      model?: string;
      messages?: Array<{ role?: string; content?: string }>;
    }> = [];
    vi.restoreAllMocks();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({ models: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (!url.includes('/chat/completions')) return new Response('', { status: 503 });

      const body = JSON.parse(String(init?.body ?? '{}')) as {
        model?: string;
        messages?: Array<{ role?: string; content?: string }>;
      };
      requests.push(body);
      if (body.model === 'test-mid-model') {
        throw new Error('fetch failed');
      }

      return new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'fallback ok' } }] })}\n\n`
        + `data: ${JSON.stringify({
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 2 },
        })}\n\ndata: [DONE]\n\n`,
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      );
    });

    try {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'Review this pull request for security issues',
          session: 'production-fallback-prompt',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('fallback ok');
      expect(requests.map(request => request.model)).toEqual([
        'test-mid-model',
        'test-mid-model',
        'test-mid-model',
        'test-mid-model',
        'gemma-4-31b',
      ]);
      const primaryPrompt = requests[0]?.messages?.[0]?.content ?? '';
      const fallbackPrompt = requests.at(-1)?.messages?.[0]?.content ?? '';
      expect(primaryPrompt).toContain('Model: test-mid-model');
      expect(primaryPrompt).toContain('Briefly state assumption, then recommendation.');
      expect(fallbackPrompt).toContain('Model: gemma-4-31b');
      expect(fallbackPrompt).toContain('State the assumption. List the trade-offs. Give the recommendation.');
      expect(fallbackPrompt).not.toContain('Model: test-mid-model');
      expect(fallbackPrompt).not.toContain('Briefly state assumption, then recommendation.');
    } finally {
      fetchSpy.mockRestore();
      server.agentState.llmProvider = previousProvider;
      server.agentState.currentModel = previousCurrentModel;
      Object.defineProperty(FEATURE_FLAGS, 'PROMPT_ASSEMBLER', {
        value: previousPromptAssembler,
        configurable: true,
        enumerable: true,
        writable: true,
      });
      if (previousReranker === undefined) delete process.env.WAGGLE_RERANKER;
      else process.env.WAGGLE_RERANKER = previousReranker;
    }
  }, 20_000);

  it('tries every provider credential before entering the fallback chain', async () => {
    const firstKey = 'sk-anthropic-first-test';
    const secondKey = 'sk-anthropic-second-test';
    const thirdKey = 'sk-anthropic-third-test';
    server.vault.set('anthropic', firstKey);
    server.vault.set('anthropic-2', secondKey);
    server.vault.set('anthropic-3', thirdKey);
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'test',
      checkedAt: new Date().toISOString(),
    };
    const config = new WaggleConfig(tmpDir);
    config.setDefaultModel('claude-sonnet-4-6');
    config.clearBudgetModel();
    config.setFallbackModel('ollama/fallback-test-model');
    config.save();
    // Every provider key is rejected; the local fallback answers (TD-CHAT-16).
    reply = (request) => (request.model === 'fallback-test-model'
      ? { type: 'text', content: 'fallback ok', usage: { inputTokens: 1, outputTokens: 1 } }
      : { type: 'http_error', status: 401, message: 'invalid credential' });

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Review this detailed plan.', session: 'credential-exhaustion-fallback' },
    });
    const attempts = capturedConfigs.map(attempt => ({ model: attempt.model, apiKey: attempt.litellmApiKey }));

    expect(response.statusCode).toBe(200);
    expect(attempts.map(({ model }) => model)).toEqual([
      'anthropic/claude-sonnet-4-6',
      'anthropic/claude-sonnet-4-6',
      'anthropic/claude-sonnet-4-6',
      'fallback-test-model',
    ]);
    expect(attempts.slice(0, 3).map(({ apiKey }) => apiKey)).toEqual([
      firstKey,
      secondKey,
      thirdKey,
    ]);
  });

  it('retries one interrupted no-tool answer on the same model and credential', async () => {
    // The first stream is cut before [DONE] with its usage reported; the
    // replay answers (TD-CHAT-16).
    reply = inOrder(
      { type: 'truncated_stream', content: 'partial', usage: { inputTokens: 100, outputTokens: 20 } },
      { type: 'text', content: 'Recovered on the same model.', usage: { inputTokens: 100, outputTokens: 25 } },
    );

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Summarize this plan without using tools.', session: 'incomplete-safe-retry' },
    });
    const attempts = capturedConfigs.map(attempt => ({
      model: attempt.model,
      apiKey: attempt.litellmApiKey,
      toolCount: attempt.tools.length,
      maxTokenBudget: attempt.maxTokenBudget,
      modelOperationTimeoutMs: attempt.modelOperationTimeoutMs,
    }));

    expect(response.statusCode).toBe(200);
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toMatchObject({
      model: attempts[0]?.model,
      apiKey: attempts[0]?.apiKey,
      toolCount: 0,
      maxTokenBudget: (attempts[0]?.maxTokenBudget ?? 0) - 120,
    });
    expect(attempts[1]?.modelOperationTimeoutMs).toBeLessThan(attempts[0]?.modelOperationTimeoutMs ?? 0);
    expect(response.body).toContain('Recovered on the same model.');
    expect(response.body).toContain('retrying once');
    expect(response.body).not.toContain('event: model_switch');
  });

  // A content filter and a cut stream that spent the token budget come from
  // the fake provider. The loop never reports a refusal or an invalid body with
  // these reasons, so those two are thrown by the spy (TD-CHAT-16 ruling 2).
  const scriptedIncomplete = (message: string, usage: { inputTokens: number; outputTokens: number }) => ({
    failure: Object.assign(new Error(message), { code: 'INCOMPLETE_COMPLETION', status: 502, usage }),
  });
  it.each([
    ['assistant refusal', scriptedIncomplete(
      'LLM returned an incomplete completion (assistant refusal); partial content was not accepted.',
      { inputTokens: 100, outputTokens: 20 },
    )],
    ['content filter', {
      reply: { type: 'text', content: 'filtered', finishReason: 'content_filter', usage: { inputTokens: 100, outputTokens: 20 } },
    }],
    ['malformed response', scriptedIncomplete(
      'LLM returned an incomplete completion (invalid response body); partial content was not accepted.',
      { inputTokens: 0, outputTokens: 0 },
    )],
    ['exhausted token budget', {
      reply: { type: 'truncated_stream', content: 'partial', usage: { inputTokens: 100_000, outputTokens: 20 } },
    }],
  ] as Array<[string, { reply?: FakeLlmReply; failure?: unknown }]>)('does not retry an incomplete completion caused by %s', async (_label, scripted) => {
    if (scripted.reply) reply = () => scripted.reply!;
    if (scripted.failure) loopSpy.failures[0] = scripted.failure;

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Summarize this plan without using tools.', session: 'incomplete-no-retry' },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedConfigs).toHaveLength(1);
    expect(response.body).toContain('incomplete completion');
    expect(response.body).not.toContain('retrying once');
  });

  it('never replays an incomplete completion after a non-replayable tool started', async () => {
    const firstKey = 'sk-openrouter-incomplete-first';
    const secondKey = 'sk-openrouter-incomplete-second';
    server.vault.set('openrouter', firstKey);
    server.vault.set('openrouter-2', secondKey);
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'test',
      checkedAt: new Date().toISOString(),
    };
    const config = new WaggleConfig(tmpDir);
    config.setDefaultModel('openrouter/anthropic/claude-sonnet-5');
    config.clearBudgetModel();
    config.setFallbackModel('ollama/fallback-test-model');
    config.save();
    // The model really writes release.txt, then its next stream is cut before
    // [DONE]. The message asks for the write, because a review request
    // transmits no write tool (TD-CHAT-16).
    reply = inOrder(
      {
        type: 'tool_calls',
        calls: [{ name: 'write_file', args: { path: 'release.txt', content: 'Release notes' } }],
        usage: { inputTokens: 1, outputTokens: 1 },
      },
      { type: 'truncated_stream', content: 'partial', usage: { inputTokens: 1, outputTokens: 1 } },
    );

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Write the release notes to release.txt.', session: 'incomplete-credential-no-replay' },
    });
    const attempts = capturedConfigs.map(attempt => ({ model: attempt.model, apiKey: attempt.litellmApiKey }));
    const writeToolEvents = sseEvents(response.body)
      .filter(event => event.event === 'tool' && event.data.name === 'write_file');

    expect(response.statusCode).toBe(200);
    expect(attempts).toEqual([{
      model: 'openrouter/anthropic/claude-sonnet-5',
      apiKey: firstKey,
    }]);
    expect(writeToolEvents).toHaveLength(1);
    expect(response.body).toContain('incomplete completion');
    expect(response.body).not.toContain('API key rotated');
  });

  it('normalizes a configured Ollama fallback onto the local transport', async () => {
    const config = new WaggleConfig(tmpDir);
    config.setFallbackModel('ollama/fallback-test-model');
    config.save();
    reply = unreachable('primary-test-model');

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Summarize this private document.', session: 'local-fallback-transport' },
    });
    const attempts = capturedConfigs.map(attempt => ({ model: attempt.model, litellmUrl: attempt.litellmUrl }));

    expect(response.statusCode).toBe(200);
    expect(attempts.map((attempt) => attempt.model)).toEqual([
      'primary-test-model',
      'fallback-test-model',
    ]);
    expect(attempts[1].litellmUrl).toBe(attempts[0].litellmUrl);
    expect(attempts[1].litellmUrl).toMatch(/11434\/v1$/);
  });

  it('uses the configured fallback when the selected local primary is unavailable', async () => {
    const config = new WaggleConfig(tmpDir);
    config.setDefaultModel('ollama/missing-test-model');
    config.setFallbackModel('ollama/fallback-test-model');
    config.save();

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Review this private plan.', session: 'missing-local-primary' },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedModel()).toBe('fallback-test-model');
  });
});
