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
    await server.register(localInferenceRoutes, {
      runtimeFactory: () => ({
        getStatus: () => managedStatus(),
        ensureReady: vi.fn(),
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
    await server.close();
    expect(stop).toHaveBeenCalledOnce();
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
      runtimeFactory: () => ({ getStatus: () => readyStatus, ensureReady, stop: async () => undefined }),
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
