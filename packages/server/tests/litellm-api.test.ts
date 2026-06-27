import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';

// Mock the lifecycle module before importing anything that uses it
vi.mock('../src/local/lifecycle.js', () => ({
  getLiteLLMStatus: vi.fn(),
  startLiteLLM: vi.fn(),
  stopLiteLLM: vi.fn(),
}));

import { buildLocalServer } from '../src/local/index.js';
import { getLiteLLMStatus, startLiteLLM, stopLiteLLM } from '../src/local/lifecycle.js';
import { resolveUsableModel } from '../src/local/model-availability.js';
import { injectWithAuth } from './test-utils.js';

const mockGetStatus = getLiteLLMStatus as ReturnType<typeof vi.fn>;
const mockStart = startLiteLLM as ReturnType<typeof vi.fn>;
const mockStop = stopLiteLLM as ReturnType<typeof vi.fn>;

describe('LiteLLM Management API', () => {
  let server: FastifyInstance;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-litellm-api-'));

    // Write minimal config.json
    fs.writeFileSync(
      path.join(dataDir, 'config.json'),
      JSON.stringify({ defaultModel: 'test/model', providers: {} }),
      'utf-8'
    );

    server = await buildLocalServer({ dataDir, port: 0 });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- GET /api/litellm/status ---

  it('GET /api/litellm/status returns running status', async () => {
    mockGetStatus.mockResolvedValue({ status: 'running', port: 4000 });

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/litellm/status',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.running).toBe(true);
    expect(body.port).toBe(4000);
  });

  it('GET /api/litellm/status returns not running when error', async () => {
    mockGetStatus.mockResolvedValue({
      status: 'error',
      port: 4000,
      error: 'LiteLLM is not running',
    });

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/litellm/status',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.running).toBe(false);
    expect(body.port).toBe(4000);
  });

  // --- POST /api/litellm/restart ---

  it('POST /api/litellm/restart calls stop then start, returns new status', async () => {
    mockStop.mockResolvedValue(undefined);
    mockStart.mockResolvedValue({ status: 'started', port: 4000 });

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/litellm/restart',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.running).toBe(true);
    expect(body.port).toBe(4000);

    // Verify stop was called before start
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledTimes(1);
    const stopOrder = mockStop.mock.invocationCallOrder[0];
    const startOrder = mockStart.mock.invocationCallOrder[0];
    expect(stopOrder).toBeLessThan(startOrder);
  });

  it('POST /api/litellm/restart returns error on start failure', async () => {
    mockStop.mockResolvedValue(undefined);
    mockStart.mockResolvedValue({
      status: 'error',
      port: 4000,
      error: 'Failed to spawn LiteLLM',
    });

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/litellm/restart',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.running).toBe(false);
    expect(body.error).toBe('Failed to spawn LiteLLM');
  });

  it('POST /api/litellm/restart proceeds to start even if stop throws', async () => {
    mockStop.mockRejectedValue(new Error('kill ESRCH'));
    mockStart.mockResolvedValue({ status: 'started', port: 4000 });

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/litellm/restart',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.running).toBe(true);
    expect(body.port).toBe(4000);
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('POST /api/litellm/restart returns fallback error on timeout status', async () => {
    mockStop.mockResolvedValue(undefined);
    mockStart.mockResolvedValue({ status: 'timeout', port: 4000 });

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/litellm/restart',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.running).toBe(false);
    expect(body.error).toBe('LiteLLM did not start in time');
  });

  // --- GET /api/litellm/models ---

  it('GET /api/litellm/models returns model list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'gpt-4o' },
          { id: 'claude-sonnet-4-20250514' },
          { id: 'gemini-pro' },
        ],
      }),
    } as Response);

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/litellm/models',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.models).toEqual(['gpt-4o', 'claude-sonnet-4-20250514', 'gemini-pro']);
  });

  it('GET /api/litellm/models returns empty array on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/litellm/models',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.models).toEqual([]);
  });

  it('GET /api/litellm/models returns empty array when LiteLLM returns non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/litellm/models',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.models).toEqual([]);
  });

  it('GET /api/litellm/models falls back to local Ollama chat models', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/models')) {
        return { ok: false, status: 503 } as Response;
      }
      if (url.endsWith('/api/tags')) {
        return {
          ok: true,
          json: async () => ({
            models: [
              { name: 'nomic-embed-text:latest', size: 262_000_000 },
              { name: 'llama3.2:latest', size: 2_000_000_000 },
            ],
          }),
        } as Response;
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/litellm/models',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.models).toEqual(['ollama/llama3.2:latest']);
  });

  it('GET /api/agent/model resolves a cloud default to a local chat model when no provider key exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return {
          ok: true,
          json: async () => ({
            models: [
              { name: 'nomic-embed-text:latest', size: 262_000_000 },
              { name: 'llama3.2:latest', size: 2_000_000_000 },
            ],
          }),
        } as Response;
      }
      return { ok: false, status: 503 } as Response;
    });
    await injectWithAuth(server, {
      method: 'PUT',
      url: '/api/agent/model',
      payload: { model: 'claude-sonnet-4-6' },
    });

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/agent/model',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.model).toBe('ollama/llama3.2:latest');
  });

  it('model resolver keeps the startup-selected Ollama model over a stale cloud default', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return {
          ok: true,
          json: async () => ({
            models: [
              { name: 'nomic-embed-text:latest' },
              { name: 'minimax-m2.7:cloud', remote_host: 'https://ollama.com:443' },
              { name: 'gemma4:31b' },
            ],
          }),
        } as Response;
      }
      return { ok: false, status: 503 } as Response;
    });
    await injectWithAuth(server, {
      method: 'PUT',
      url: '/api/agent/model',
      payload: { model: 'ollama/minimax-m2.7:cloud' },
    });

    await expect(resolveUsableModel(server, 'claude-sonnet-4-6')).resolves.toBe('ollama/minimax-m2.7:cloud');
  });
});
