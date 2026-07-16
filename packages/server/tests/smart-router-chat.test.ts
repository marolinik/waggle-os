import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WaggleConfig } from '@waggle/core';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildLocalServer } from '../src/local/index.js';
import { injectWithAuth, resetRateLimiter } from './test-utils.js';

describe('chat smart-router integration', () => {
  const primary = 'ollama/primary-test-model';
  const budget = 'ollama/budget-test-model';
  let server: FastifyInstance;
  let tmpDir: string;
  let capturedModel: string | undefined;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-smart-router-'));
    const config = new WaggleConfig(tmpDir);
    config.setDefaultModel(primary);
    config.setBudgetModel(budget);
    config.save();

    server = await buildLocalServer({ dataDir: tmpDir });
    server.agentRunner = async (agentConfig: AgentLoopConfig): Promise<AgentResponse> => {
      capturedModel = agentConfig.model;
      agentConfig.onToken?.('ok');
      return {
        content: 'ok',
        toolsUsed: [],
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    };
  });

  beforeEach(() => {
    capturedModel = undefined;
    resetRateLimiter(server);
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
});
