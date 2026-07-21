import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WaggleConfig } from '@waggle/core';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLocalServer } from '../src/local/index.js';
import { injectWithAuth, resetRateLimiter } from './test-utils.js';

describe('chat smart-router integration', () => {
  const primary = 'ollama/primary-test-model';
  const budget = 'ollama/budget-test-model';
  let server: FastifyInstance;
  let tmpDir: string;
  let capturedModel: string | undefined;
  let capturedConfigs: AgentLoopConfig[];
  let completionRequests: Array<{ url: string; model: string }>;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-smart-router-'));
    const config = new WaggleConfig(tmpDir);
    config.setDefaultModel(primary);
    config.setBudgetModel(budget);
    config.save();

    server = await buildLocalServer({ dataDir: tmpDir });
  });

  beforeEach(() => {
    capturedModel = undefined;
    capturedConfigs = [];
    completionRequests = [];
    resetRateLimiter(server);
    const config = new WaggleConfig(tmpDir);
    config.setDefaultModel(primary);
    config.setBudgetModel(budget);
    config.clearFallbackModel();
    config.setDailyBudget(null);
    config.setBudgetThreshold(0.8);
    config.save();
    server.agentRunner = async (agentConfig: AgentLoopConfig): Promise<AgentResponse> => {
      capturedModel = agentConfig.model;
      capturedConfigs.push(agentConfig);
      agentConfig.onToken?.('ok');
      return {
        content: 'ok',
        toolsUsed: [],
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
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
      if (String(input).includes('/chat/completions')) {
        const body = JSON.parse(String(init?.body)) as { model?: string };
        completionRequests.push({ url: String(input), model: body.model ?? '' });
      }
      return new Response('', { status: 503 });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(capturedModel).toBe('primary-test-model');
    expect(response.body).not.toContain('event: model_switch');
  });

  it('keeps an under-threshold trivial turn on the configured primary model', async () => {
    const config = new WaggleConfig(tmpDir);
    config.setDailyBudget(10);
    config.setBudgetThreshold(0.8);
    config.save();
    const getDailyTotal = vi.spyOn(server.agentState.costTracker, 'getDailyTotal').mockReturnValue(7.99);

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'What is 19 * 23?', session: 'under-budget-trivial-route' },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedModel).toBe('primary-test-model');
    expect(response.body).not.toContain('event: model_switch');
    expect(getDailyTotal).toHaveBeenCalledOnce();
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
    expect(capturedModel).toBe('primary-test-model');
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
    expect(capturedModel).toBe('primary-test-model');
  });

  it('uses the budget model with threshold telemetry for an over-budget trivial turn', async () => {
    const config = new WaggleConfig(tmpDir);
    config.setDailyBudget(1);
    config.setBudgetThreshold(0.8);
    config.save();
    const getDailyTotal = vi.spyOn(server.agentState.costTracker, 'getDailyTotal').mockReturnValue(0.8);
    vi.spyOn(server.agentState.costTracker, 'calculateCost').mockReturnValue(4);

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'What is 19 * 23?', session: 'over-budget-trivial-route' },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedModel).toBe('budget-test-model');
    expect(getDailyTotal).toHaveBeenCalledOnce();
    expect(response.body).toContain('event: model_switch');
    expect(response.body).toContain('Budget 80% reached ($0.80/$1.00)');
    const [persistedTrace] = server.traceStore.query({
      sessionId: 'over-budget-trivial-route',
      limit: 1,
    });
    expect(persistedTrace.cost_usd).toBe(4);
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
      let restartedModel: string | undefined;
      restartedServer.agentRunner = async (agentConfig: AgentLoopConfig): Promise<AgentResponse> => {
        restartedModel = agentConfig.model;
        return {
          content: 'ok',
          toolsUsed: [],
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      };
      vi.spyOn(restartedServer.traceStore, 'getTotalCostSince')
        .mockImplementationOnce(() => { throw new Error('transient daily cost read failure'); });

      const failedReadResponse = await injectWithAuth(restartedServer, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'What is 19 * 23?', session: 'failed-carryover-read' },
      });
      expect(failedReadResponse.statusCode).toBe(200);
      expect(restartedModel).toBe('primary-test-model');

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
      expect(restartedModel).toBe('primary-test-model');
      expect(recoveredReadResponse.body).not.toContain('event: model_switch');

      config.setDailyBudget(12.5);
      config.save();
      const response = await injectWithAuth(restartedServer, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'What is 19 * 23?', session: 'persisted-spend-trivial-route' },
      });
      expect(response.statusCode).toBe(200);
      expect(restartedModel).toBe('budget-test-model');
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
    expect(capturedModel).toBe('primary-test-model');
  });

  it('returns to the primary before fallback when an optional budget run fails', async () => {
    const config = new WaggleConfig(tmpDir);
    config.setFallbackModel('ollama/fallback-test-model');
    config.setDailyBudget(1);
    config.save();
    vi.spyOn(server.agentState.costTracker, 'getDailyTotal').mockReturnValue(1);
    const attempts: string[] = [];
    server.agentRunner = async (agentConfig: AgentLoopConfig): Promise<AgentResponse> => {
      attempts.push(agentConfig.model);
      if (attempts.length === 1) {
        throw new Error('Could not reach the model endpoint after 3 attempts (fetch failed).');
      }
      return {
        content: 'primary ok',
        toolsUsed: [],
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    };

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'What is 19 * 23?', session: 'failed-budget-returns-primary' },
    });

    expect(response.statusCode).toBe(200);
    expect(attempts).toEqual(['budget-test-model', 'primary-test-model']);
  });

  it('never replays an incomplete budget-model run on the primary or fallback', async () => {
    const config = new WaggleConfig(tmpDir);
    config.setFallbackModel('ollama/fallback-test-model');
    config.setDailyBudget(1);
    config.save();
    vi.spyOn(server.agentState.costTracker, 'getDailyTotal').mockReturnValue(1);
    const attempts: string[] = [];
    let simulatedMutations = 0;
    const addUsage = vi.spyOn(server.agentState.costTracker, 'addUsage');
    const calculateCost = vi.spyOn(server.agentState.costTracker, 'calculateCost').mockReturnValue(2);
    const addTokens = vi.spyOn(server.sessionManager, 'addTokens');
    server.agentRunner = async (agentConfig: AgentLoopConfig): Promise<AgentResponse> => {
      attempts.push(agentConfig.model);
      simulatedMutations++;
      throw Object.assign(
        new Error('LLM returned an incomplete completion; partial content was not accepted.'),
        {
          code: 'INCOMPLETE_COMPLETION',
          status: 502,
          usage: { inputTokens: 13_500, outputTokens: 500 },
        },
      );
    };

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'What is 19 * 23?', session: 'incomplete-budget-no-replay' },
    });

    expect(response.statusCode).toBe(200);
    expect(attempts).toEqual(['budget-test-model']);
    expect(simulatedMutations).toBe(1);
    expect(response.body).toContain('incomplete completion');
    expect(response.body).not.toContain('fallback-test-model');
    expect(addUsage).toHaveBeenCalledOnce();
    expect(addUsage).toHaveBeenCalledWith(
      'ollama/budget-test-model',
      13_500,
      500,
      'default',
    );
    expect(addTokens).toHaveBeenCalledOnce();
    expect(addTokens).toHaveBeenCalledWith('default', 14_000);
    expect(calculateCost).toHaveBeenCalledWith(13_500, 500, 'ollama/budget-test-model');
    const [persistedTrace] = server.traceStore.query({
      sessionId: 'incomplete-budget-no-replay',
      limit: 1,
    });
    expect(persistedTrace.cost_usd).toBe(2);
    expect(JSON.parse(persistedTrace.trace_json).tokens).toEqual({ input: 13_500, output: 500 });
  });

  it('persists returned usage before completing a client-cancelled run', async () => {
    const calculateCost = vi.spyOn(server.agentState.costTracker, 'calculateCost').mockReturnValue(3);
    const addUsage = vi.spyOn(server.agentState.costTracker, 'addUsage');
    server.agentRunner = async (agentConfig: AgentLoopConfig): Promise<AgentResponse> => {
      Object.defineProperty(agentConfig.signal!, 'aborted', {
        value: true,
        configurable: true,
      });
      return {
        content: 'partial output that must not be committed',
        toolsUsed: [],
        usage: { inputTokens: 20_000, outputTokens: 1_000 },
      };
    };

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Analyze this report', session: 'cancelled-run-usage' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('event: error');
    expect(response.body).not.toContain('event: done');
    expect(calculateCost).toHaveBeenCalledWith(20_000, 1_000, 'ollama/primary-test-model');
    expect(addUsage).toHaveBeenCalledWith(
      'ollama/primary-test-model',
      20_000,
      1_000,
      'default',
    );
    const [persistedTrace] = server.traceStore.query({
      sessionId: 'cancelled-run-usage',
      limit: 1,
    });
    expect(persistedTrace.cost_usd).toBe(3);
    expect(JSON.parse(persistedTrace.trace_json).tokens).toEqual({ input: 20_000, output: 1_000 });
    expect(persistedTrace.outcome).toBe('abandoned');
  });

  it('uses the configured fallback only after both budget and primary runs fail', async () => {
    const config = new WaggleConfig(tmpDir);
    config.setFallbackModel('ollama/fallback-test-model');
    config.setDailyBudget(1);
    config.save();
    vi.spyOn(server.agentState.costTracker, 'getDailyTotal').mockReturnValue(1);
    const attempts: string[] = [];
    server.agentRunner = async (agentConfig: AgentLoopConfig): Promise<AgentResponse> => {
      attempts.push(agentConfig.model);
      if (attempts.length < 3) {
        throw new Error('Could not reach the model endpoint after 3 attempts (fetch failed).');
      }
      return {
        content: 'fallback ok',
        toolsUsed: [],
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    };

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'What is 19 * 23?', session: 'budget-primary-fallback-order' },
    });

    expect(response.statusCode).toBe(200);
    expect(attempts).toEqual([
      'budget-test-model',
      'primary-test-model',
      'fallback-test-model',
    ]);
  });

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
    const attempts: Array<{ model: string; apiKey: string }> = [];
    server.agentRunner = async (agentConfig: AgentLoopConfig): Promise<AgentResponse> => {
      attempts.push({ model: agentConfig.model, apiKey: agentConfig.litellmApiKey });
      if (attempts.length < 4) {
        throw Object.assign(new Error('401 invalid credential'), { status: 401 });
      }
      return {
        content: 'fallback ok',
        toolsUsed: [],
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    };

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Review this detailed plan.', session: 'credential-exhaustion-fallback' },
    });

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

  it('never rotates credentials or models after an incomplete completion', async () => {
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
    const attempts: Array<{ model: string; apiKey: string }> = [];
    let simulatedMutations = 0;
    server.agentRunner = async (agentConfig: AgentLoopConfig): Promise<AgentResponse> => {
      attempts.push({ model: agentConfig.model, apiKey: agentConfig.litellmApiKey });
      simulatedMutations++;
      throw Object.assign(
        new Error('LLM returned an incomplete completion; partial content was not accepted.'),
        { code: 'INCOMPLETE_COMPLETION', status: 502 },
      );
    };

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Review this detailed plan.', session: 'incomplete-credential-no-replay' },
    });

    expect(response.statusCode).toBe(200);
    expect(attempts).toEqual([{
      model: 'openrouter/anthropic/claude-sonnet-5',
      apiKey: firstKey,
    }]);
    expect(simulatedMutations).toBe(1);
    expect(response.body).toContain('incomplete completion');
    expect(response.body).not.toContain('API key rotated');
  });

  it('normalizes a configured Ollama fallback onto the local transport', async () => {
    const config = new WaggleConfig(tmpDir);
    config.setFallbackModel('ollama/fallback-test-model');
    config.save();
    const attempts: Array<{ model: string; litellmUrl: string }> = [];
    server.agentRunner = async (agentConfig: AgentLoopConfig): Promise<AgentResponse> => {
      attempts.push({ model: agentConfig.model, litellmUrl: agentConfig.litellmUrl });
      if (attempts.length === 1) {
        throw new Error('Could not reach the model endpoint after 3 attempts (fetch failed).');
      }
      return {
        content: 'fallback ok',
        toolsUsed: [],
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    };

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'Summarize this private document.', session: 'local-fallback-transport' },
    });

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
    expect(capturedModel).toBe('fallback-test-model');
  });
});
