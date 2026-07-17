import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { localInferenceRoutes } from '../../src/local/routes/local-inference.js';

describe('local-inference route — TS engine wiring', () => {
  let server: ReturnType<typeof Fastify>;
  beforeEach(async () => { server = Fastify({ logger: false }); await server.register(localInferenceRoutes); });
  afterEach(async () => { await server.close(); });

  it('/hardware returns the full HardwareInfo shape (real GPU fields, not absent)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/local-inference/hardware' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.source).toMatch(/^(native|basic)$/);          // never 'llmfit'
    expect(body.llmfitAvailable).toBe(false);
    for (const k of ['totalRamGb', 'hasGpu', 'gpuName', 'gpuVramGb', 'gpuCount', 'gpus', 'backend']) {
      expect(body.hardware).toHaveProperty(k);
    }
    expect(Array.isArray(body.hardware.gpus)).toBe(true);
  });

  it('/models returns engine-ranked recommendations from the curated catalog (not 4 hardcoded)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/local-inference/models?limit=50' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.source).toBe('native');                        // proves TS engine, not removed 'basic'
    expect(body.totalScanned).toBeGreaterThan(4);              // catalog size, not the old 4-model stub
    expect(body.models.length).toBeGreaterThan(0);
    const m = body.models[0];
    for (const k of ['scoreComponents', 'estimatedTps', 'memoryRequiredGb', 'bestQuant', 'runMode', 'runtime', 'fitLevel']) {
      expect(m).toHaveProperty(k);
    }
    expect(m.scoreComponents).toHaveProperty('quality'); // real fit math, not zeroed stub
    expect(m.runtime).toBe('Ollama');
  });
});

const unavailableOllama = {
  type: 'ollama' as const,
  available: false,
  url: 'http://127.0.0.1:11434',
  models: [],
  cloudModels: [],
};

const unavailableVllm = {
  type: 'vllm' as const,
  available: false,
  url: 'http://localhost:8000',
  models: [],
  cloudModels: [],
};

function managedStatus(supported = true) {
  return {
    source: 'waggle-managed' as const,
    supported,
    installed: false,
    running: false,
    targetVersion: 'test-1.0.0',
    version: 'test-1.0.0',
    artifactSizeBytes: 123,
    downloadRequired: true,
    dockerRequired: false as const,
    ...(!supported ? { reason: 'unsupported fixture' } : {}),
  };
}

describe('local-inference route — Waggle-managed runtime', () => {
  it('advertises a Docker-free managed bootstrap instead of requiring a system Ollama install', async () => {
    const server = Fastify({ logger: false });
    const stop = vi.fn(async () => undefined);
    const ensureReady = vi.fn();
    const startInstalled = vi.fn();
    await server.register(localInferenceRoutes, {
      runtimeFactory: () => ({
        getStatus: () => managedStatus(),
        ensureReady,
        startInstalled,
        stop,
      }),
      ollamaProbe: async () => unavailableOllama,
      vllmProbe: async () => unavailableVllm,
    });

    const response = await server.inject({ method: 'GET', url: '/api/local-inference/status' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ollamaInstalled: false,
      ollamaRunning: false,
      offlineReady: false,
      dockerRequired: false,
      managedRuntime: { supported: true, downloadRequired: true, dockerRequired: false },
    });
    expect(response.json().setupMessage).toMatch(/system Ollama install (?:is|are) not required/i);
    expect(ensureReady).not.toHaveBeenCalled();
    expect(startInstalled).not.toHaveBeenCalled();
    await server.close();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('restarts an already-installed managed runtime when the sidecar starts', async () => {
    const server = Fastify({ logger: false });
    const installedStatus = {
      ...managedStatus(),
      installed: true,
      running: false,
      downloadRequired: false,
    };
    const runningStatus = { ...installedStatus, running: true };
    const startInstalled = vi.fn(async () => ({
      installedNow: false,
      startedNow: true,
      endpoint: 'http://127.0.0.1:11434',
      status: runningStatus,
    }));
    await server.register(localInferenceRoutes, {
      runtimeFactory: () => ({
        getStatus: () => installedStatus,
        ensureReady: vi.fn(),
        startInstalled,
        stop: async () => undefined,
      }),
      ollamaProbe: async () => unavailableOllama,
      vllmProbe: async () => unavailableVllm,
    });

    await server.ready();
    expect(startInstalled).toHaveBeenCalledOnce();
    await expect(startInstalled.mock.results[0]?.value).resolves.toMatchObject({
      installedNow: false,
      startedNow: true,
    });
    await server.close();
  });

  it('keeps the sidecar available when an installed runtime cannot restart', async () => {
    const server = Fastify({ logger: false });
    const installedStatus = {
      ...managedStatus(),
      installed: true,
      running: false,
      downloadRequired: false,
    };
    const ensureReady = vi.fn();
    const startInstalled = vi.fn(async () => {
      throw new Error('runtime blocked by quarantine');
    });
    await server.register(localInferenceRoutes, {
      runtimeFactory: () => ({
        getStatus: () => installedStatus,
        ensureReady,
        startInstalled,
        stop: async () => undefined,
      }),
      ollamaProbe: async () => unavailableOllama,
      vllmProbe: async () => unavailableVllm,
    });

    const response = await server.inject({ method: 'GET', url: '/api/local-inference/status' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ollamaInstalled: true,
      ollamaRunning: false,
      offlineReady: false,
    });
    expect(startInstalled).toHaveBeenCalledOnce();
    expect(ensureReady).not.toHaveBeenCalled();
    await server.close();
  });

  it('does not delay sidecar readiness and stops again after a close during restart', async () => {
    const server = Fastify({ logger: false });
    const installedStatus = {
      ...managedStatus(),
      installed: true,
      running: false,
      downloadRequired: false,
    };
    let finishRestart!: () => void;
    const restartReleased = new Promise<void>((resolve) => { finishRestart = resolve; });
    const startInstalled = vi.fn(async () => {
      await restartReleased;
      return {
        installedNow: false,
        startedNow: true,
        endpoint: 'http://127.0.0.1:11434',
        status: { ...installedStatus, running: true },
      };
    });
    const stop = vi.fn(async () => undefined);
    await server.register(localInferenceRoutes, {
      runtimeFactory: () => ({
        getStatus: () => installedStatus,
        ensureReady: vi.fn(),
        startInstalled,
        stop,
      }),
      ollamaProbe: async () => unavailableOllama,
      vllmProbe: async () => unavailableVllm,
    });

    const readyOutcome = await Promise.race([
      server.ready().then(() => 'ready' as const),
      new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 500)),
    ]);
    expect(readyOutcome).toBe('ready');
    expect(startInstalled).toHaveBeenCalledOnce();

    await server.close();
    expect(stop).toHaveBeenCalledOnce();
    finishRestart();
    await vi.waitFor(() => expect(stop).toHaveBeenCalledTimes(2));
  });

  it('installs, starts, and health-checks the managed runtime through one bootstrap route', async () => {
    const server = Fastify({ logger: false });
    const readyStatus = { ...managedStatus(), installed: true, running: true, downloadRequired: false };
    const ensureReady = vi.fn(async () => ({
      installedNow: true,
      startedNow: true,
      endpoint: 'http://127.0.0.1:11434',
      status: readyStatus,
    }));
    const ollamaProbe = vi.fn()
      .mockResolvedValueOnce(unavailableOllama)
      .mockResolvedValueOnce({
        ...unavailableOllama,
        available: true,
        models: [],
        version: 'test-1.0.0',
      });
    await server.register(localInferenceRoutes, {
      runtimeFactory: () => ({
        getStatus: () => managedStatus(),
        ensureReady,
        startInstalled: vi.fn(),
        stop: async () => undefined,
      }),
      ollamaProbe,
      vllmProbe: async () => unavailableVllm,
    });

    const response = await server.inject({ method: 'POST', url: '/api/local-inference/bootstrap' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      installedNow: true,
      startedNow: true,
      dockerRequired: false,
      server: { available: true, version: 'test-1.0.0' },
    });
    expect(ensureReady).toHaveBeenCalledOnce();
    expect(ollamaProbe).toHaveBeenCalledTimes(2);
    await server.close();
  });

  it('returns a truthful unsupported-platform contract without attempting a download', async () => {
    const server = Fastify({ logger: false });
    const ensureReady = vi.fn();
    await server.register(localInferenceRoutes, {
      runtimeFactory: () => ({
        getStatus: () => managedStatus(false),
        ensureReady,
        startInstalled: vi.fn(),
        stop: async () => undefined,
      }),
      ollamaProbe: async () => unavailableOllama,
      vllmProbe: async () => unavailableVllm,
    });

    const response = await server.inject({ method: 'POST', url: '/api/local-inference/bootstrap' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'MANAGED_RUNTIME_UNSUPPORTED',
      managedRuntime: { supported: false },
    });
    expect(ensureReady).not.toHaveBeenCalled();
    await server.close();
  });
});

describe('local-inference route — verified model installation', () => {
  async function buildPullServer(models: string[]) {
    const server = Fastify({ logger: false });
    await server.register(localInferenceRoutes, {
      runtimeFactory: () => ({
        getStatus: () => ({ ...managedStatus(), installed: true, running: true, downloadRequired: false }),
        ensureReady: vi.fn(),
        startInstalled: vi.fn(),
        stop: async () => undefined,
      }),
      ollamaProbe: async () => ({
        type: 'ollama',
        available: true,
        url: 'http://127.0.0.1:11434',
        models,
        cloudModels: [],
        version: 'test-1.0.0',
      }),
      vllmProbe: async () => unavailableVllm,
    });
    return server;
  }

  it('rejects cloud aliases and malformed refs before any download', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const server = await buildPullServer([]);
    try {
      const missing = await server.inject({
        method: 'POST',
        url: '/api/local-inference/pull',
      });
      expect(missing.statusCode).toBe(400);
      expect(missing.json().code).toBe('MODEL_REQUIRED');

      const cloud = await server.inject({
        method: 'POST',
        url: '/api/local-inference/pull',
        payload: { model: 'minimax-m2.7:cloud' },
      });
      expect(cloud.statusCode).toBe(400);
      expect(cloud.json().code).toBe('REMOTE_MODEL_NOT_LOCAL');

      const malformed = await server.inject({
        method: 'POST',
        url: '/api/local-inference/pull',
        payload: { model: 'trusted/../../escape' },
      });
      expect(malformed.statusCode).toBe(400);
      expect(malformed.json().code).toBe('INVALID_MODEL_REF');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await server.close();
      vi.unstubAllGlobals();
    }
  });

  it('reports ready only after the pulled local model produces a real token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'success' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ response: 'OK', done: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    vi.stubGlobal('fetch', fetchMock);
    const server = await buildPullServer(['qwen3:1.7b']);
    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/local-inference/pull',
        payload: { model: 'qwen3:1.7b' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ok: true,
        model: 'qwen3:1.7b',
        verifiedGeneration: true,
        sample: 'OK',
      });
      expect(fetchMock).toHaveBeenNthCalledWith(2,
        'http://127.0.0.1:11434/api/generate',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
        model: 'qwen3:1.7b',
        stream: false,
        think: false,
        options: { temperature: 0, num_predict: 8 },
      });
    } finally {
      await server.close();
      vi.unstubAllGlobals();
    }
  });

  it('does not claim readiness when an installed model fails generation', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'success' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('model failed to load', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const server = await buildPullServer(['qwen3:1.7b']);
    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/local-inference/pull',
        payload: { model: 'qwen3:1.7b' },
      });
      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({
        code: 'MODEL_GENERATION_PROBE_FAILED',
        installed: true,
        model: 'qwen3:1.7b',
      });
    } finally {
      await server.close();
      vi.unstubAllGlobals();
    }
  });
});
