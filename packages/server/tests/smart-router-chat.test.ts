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

  it('uses the configured budget model for a bounded trivial turn', async () => {
    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'What is 19 * 23?', session: 'trivial-route' },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedModel).toBe('budget-test-model');
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
    config.save();
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

  it('uses the configured fallback only after both budget and primary runs fail', async () => {
    const config = new WaggleConfig(tmpDir);
    config.setFallbackModel('ollama/fallback-test-model');
    config.save();
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
