/**
 * Provider API Tests — GET /api/providers
 *
 * Tests the single source of truth endpoint for LLM providers,
 * models, and search tools with vault key status.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, SessionStore, FrameStore } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

describe('Provider API', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-providers-'));
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('providers-test');
    frames.createIFrame(s1.gop_id, 'Provider test', 'normal');
    mind.close();
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('GET /api/providers', () => {
    it('returns providers array', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.providers).toBeDefined();
      expect(Array.isArray(body.providers)).toBe(true);
      expect(body.providers.length).toBeGreaterThanOrEqual(10);
    });

    it('each provider has required fields', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      const { providers } = res.json();

      for (const p of providers) {
        expect(p.id).toBeDefined();
        expect(p.name).toBeDefined();
        expect(typeof p.hasKey).toBe('boolean');
        expect(typeof p.requiresKey).toBe('boolean');
        expect(Array.isArray(p.models)).toBe(true);
      }
    });

    it('includes all expected providers', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      const { providers } = res.json();
      const ids = providers.map((p: any) => p.id);

      expect(ids).toContain('anthropic');
      expect(ids).toContain('openai');
      expect(ids).toContain('google');
      expect(ids).toContain('deepseek');
      expect(ids).toContain('xai');
      expect(ids).toContain('mistral');
      expect(ids).toContain('alibaba');
      expect(ids).toContain('minimax');
      expect(ids).toContain('zhipu');
      expect(ids).toContain('moonshot');
      expect(ids).toContain('perplexity');
      expect(ids).toContain('openrouter');
      expect(ids).toContain('ollama');
    });

    it('ollama does not require a key', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      const { providers } = res.json();
      const ollama = providers.find((p: any) => p.id === 'ollama');
      expect(ollama.requiresKey).toBe(false);
      expect(ollama.hasKey).toBe(true); // Always true since no key needed
    });

    it('providers without vault keys show hasKey=false', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      const { providers } = res.json();
      // Fresh vault — no keys configured
      const openai = providers.find((p: any) => p.id === 'openai');
      expect(openai.hasKey).toBe(false);
    });

    it('providers with vault keys show hasKey=true', async () => {
      // Add a key to vault
      server.vault!.set('anthropic', 'sk-ant-test-key');

      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      const { providers } = res.json();
      const anthropic = providers.find((p: any) => p.id === 'anthropic');
      expect(anthropic.hasKey).toBe(true);

      // Cleanup
      server.vault!.delete('anthropic');
    });

    it('each provider model has id, name, cost, speed', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      const { providers } = res.json();
      const anthropic = providers.find((p: any) => p.id === 'anthropic');

      expect(anthropic.models.length).toBeGreaterThanOrEqual(3);
      for (const m of anthropic.models) {
        expect(m.id).toBeDefined();
        expect(m.name).toBeDefined();
        expect(['$', '$$', '$$$']).toContain(m.cost);
        expect(['fast', 'medium', 'slow']).toContain(m.speed);
      }
    });

    it('returns search providers with priority', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      const { search, activeSearch } = res.json();

      expect(Array.isArray(search)).toBe(true);
      expect(search.length).toBeGreaterThanOrEqual(4);

      const ids = search.map((s: any) => s.id);
      expect(ids).toContain('perplexity');
      expect(ids).toContain('tavily');
      expect(ids).toContain('brave');
      expect(ids).toContain('duckduckgo');

      // DuckDuckGo should always have hasKey=true (free)
      const ddg = search.find((s: any) => s.id === 'duckduckgo');
      expect(ddg.hasKey).toBe(true);
      expect(ddg.requiresKey).toBe(false);

      // activeSearch should be defined
      expect(activeSearch).toBeDefined();
    });

    it('activeSearch reflects vault key status', async () => {
      // No premium keys → DuckDuckGo should be active
      let res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      expect(res.json().activeSearch).toBe('duckduckgo');

      // Add Tavily key → Tavily should be active
      server.vault!.set('TAVILY_API_KEY', 'tvly-test');
      res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      expect(res.json().activeSearch).toBe('tavily');

      // Add Perplexity key → Perplexity should be active (higher priority)
      server.vault!.set('perplexity', 'pplx-test');
      res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      expect(res.json().activeSearch).toBe('perplexity');

      // Cleanup
      server.vault!.delete('TAVILY_API_KEY');
      server.vault!.delete('perplexity');
    });

    it('search priorities are in correct order', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      const { search } = res.json();

      const sorted = [...search].sort((a: any, b: any) => a.priority - b.priority);
      expect(sorted[0].id).toBe('perplexity');
      expect(sorted[1].id).toBe('tavily');
      expect(sorted[2].id).toBe('brave');
      expect(sorted[3].id).toBe('duckduckgo');
    });

    it('perplexity has badge "Search + LLM"', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      const { providers } = res.json();
      const perplexity = providers.find((p: any) => p.id === 'perplexity');
      expect(perplexity.badge).toBe('Search + LLM');
    });

    it('openrouter has badge "Free models!"', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/providers' });
      const { providers } = res.json();
      const openrouter = providers.find((p: any) => p.id === 'openrouter');
      expect(openrouter.badge).toBe('Free models!');
    });
  });
});

describe('Perplexity Search Tool', () => {
  it('perplexity_search tool exists in createSearchTools output', async () => {
    const { createSearchTools } = await import('../../src/../../../packages/agent/src/search-tools.js');
    const tools = createSearchTools(async () => null);
    const names = tools.map((t: any) => t.name);
    expect(names).toContain('perplexity_search');
    expect(names).toContain('tavily_search');
    expect(names).toContain('brave_search');
  });

  it('perplexity_search returns "not configured" when no key', async () => {
    const { createSearchTools } = await import('../../src/../../../packages/agent/src/search-tools.js');
    const tools = createSearchTools(async () => null);
    const perplexity = tools.find((t: any) => t.name === 'perplexity_search');
    const result = await perplexity.execute({ query: 'test' });
    expect(result).toContain('not configured');
  });
});

describe('Model Validation', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-model-val-'));
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('model-val-test');
    frames.createIFrame(s1.gop_id, 'Model validation test', 'normal');
    mind.close();
    // Set TRIAL tier so we're not capped at the FREE limit (5 workspaces).
    // Without this, ensureDefault() + 4 test workspaces = 5, making the next
    // POST hit the tier limit (403) before reaching model validation (400).
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({ tier: 'TRIAL' }));
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('accepts any valid model name when creating workspace', async () => {
    // Standard model
    let res = await injectWithAuth(server, {
      method: 'POST', url: '/api/workspaces',
      payload: { name: 'Test WS 1', group: 'Test', model: 'claude-sonnet-4-6' },
    });
    expect([200, 201]).toContain(res.statusCode);

    // Provider-prefixed model
    res = await injectWithAuth(server, {
      method: 'POST', url: '/api/workspaces',
      payload: { name: 'Test WS 2', group: 'Test', model: 'anthropic/claude-sonnet-4.6' },
    });
    expect([200, 201]).toContain(res.statusCode);

    // Newer model not in old hardcoded list
    res = await injectWithAuth(server, {
      method: 'POST', url: '/api/workspaces',
      payload: { name: 'Test WS 3', group: 'Test', model: 'qwen-max' },
    });
    expect([200, 201]).toContain(res.statusCode);

    // Custom model
    res = await injectWithAuth(server, {
      method: 'POST', url: '/api/workspaces',
      payload: { name: 'Test WS 4', group: 'Test', model: 'my-custom-ollama-model' },
    });
    expect([200, 201]).toContain(res.statusCode);
  });

  it('rejects invalid model names', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/workspaces',
      payload: { name: 'Test WS Bad', group: 'Test', model: 'x' }, // too short
    });
    expect(res.statusCode).toBe(400);
  });
});
