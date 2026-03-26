import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';

describe('Health Endpoint', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-health-test-'));
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns structured health with llm and database status', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.payload);
    expect(body.mode).toBe('local');
    expect(body.timestamp).toBeTruthy();

    // LLM section
    expect(body.llm).toBeDefined();
    expect(body.llm.provider).toMatch(/^(litellm|anthropic-proxy)$/);
    expect(body.llm.health).toMatch(/^(healthy|degraded|unavailable)$/);
    expect(body.llm.detail).toBeTruthy();
    expect(body.llm.checkedAt).toBeTruthy();

    // Database section
    expect(body.database).toBeDefined();
    expect(body.database.healthy).toBe(true);
  });

  it('overall status reflects LLM health', async () => {
    // Default: llmProvider was set to unavailable (no init via startService)
    const res = await server.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.payload);

    // Since we didn't go through startService, llmProvider defaults to unavailable
    // Overall status should be 'unavailable' or 'degraded', not 'ok'
    expect(body.status).not.toBe('ok');
  });

  it('reports healthy when LLM provider is marked healthy', async () => {
    // Simulate a healthy provider
    server.agentState.llmProvider = {
      provider: 'litellm',
      health: 'healthy',
      detail: 'LiteLLM on port 4000',
      checkedAt: new Date().toISOString(),
    };

    const res = await server.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.payload);

    expect(body.status).toBe('ok');
    expect(body.llm.provider).toBe('litellm');
    expect(body.llm.health).toBe('healthy');
  });

  it('reports degraded when LLM provider is configured but not verified', async () => {
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'degraded',
      detail: 'Built-in Anthropic proxy (no API key)',
      checkedAt: new Date().toISOString(),
    };

    const res = await server.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.payload);

    expect(body.status).toBe('degraded');
    expect(body.llm.health).toBe('degraded');
  });

  it('reports unavailable when no LLM path works', async () => {
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'unavailable',
      detail: 'No working LLM path',
      checkedAt: new Date().toISOString(),
    };

    const res = await server.inject({ method: 'GET', url: '/health' });
    const body = JSON.parse(res.payload);

    expect(body.status).toBe('unavailable');
  });
});
