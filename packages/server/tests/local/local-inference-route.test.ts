import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { localInferenceRoutes } from '../../src/local/routes/local-inference.js';
import { ManagedRuntimeRollbackError } from '../../src/local/managed-ollama-runtime.js';

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
    targetInstalled: false,
    activeVersion: null,
    previousVersion: null,
    fallbackActive: false,
    rollback: {
      available: false,
      active: false,
      lastAttempt: null,
    },
    artifactSizeBytes: 123,
    downloadRequired: true,
    dockerRequired: false as const,
    ...(!supported ? { reason: 'unsupported fixture' } : {}),
  };
}

const rollbackAttempt = {
  failedVersion: 'test-2.0.0',
  restoredVersion: 'test-1.0.0',
  occurredAt: '2026-07-21T09:00:00.000Z',
  reason: 'target failed its readiness probe',
};

function managedRollbackStatus(running = true) {
  return {
    ...managedStatus(),
    installed: true,
    running,
    targetVersion: rollbackAttempt.failedVersion,
    version: rollbackAttempt.restoredVersion,
    targetInstalled: true,
    activeVersion: rollbackAttempt.restoredVersion,
    previousVersion: null,
    fallbackActive: true,
    rollback: {
      available: true,
      active: true,
      lastAttempt: rollbackAttempt,
    },
    downloadRequired: false,
  };
}

describe('local-inference route — Waggle-managed runtime', () => {
  it('forwards target, active, previous, and rollback state without flattening it', async () => {
    const server = Fastify({ logger: false });
    const rollbackStatus = managedRollbackStatus();
    await server.register(localInferenceRoutes, {
      runtimeFactory: () => ({
        getStatus: () => rollbackStatus,
        ensureReady: vi.fn(),
        startInstalled: vi.fn(),
        stop: async () => undefined,
      }),
      ollamaProbe: async () => unavailableOllama,
      vllmProbe: async () => unavailableVllm,
    });

    const response = await server.inject({ method: 'GET', url: '/api/local-inference/status' });
    expect(response.statusCode).toBe(200);
    expect(response.json().managedRuntime).toEqual(rollbackStatus);
    await server.close();
  });

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

  it('restarts an active fallback runtime on sidecar start without retrying the upgrade', async () => {
    const server = Fastify({ logger: false });
    const installedStatus = managedRollbackStatus(false);
    const runningStatus = { ...installedStatus, running: true };
    const ensureReady = vi.fn();
    const startInstalled = vi.fn(async () => ({
      installedNow: false,
      startedNow: true,
      endpoint: 'http://127.0.0.1:11434',
      status: runningStatus,
    }));
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

    await server.ready();
    expect(startInstalled).toHaveBeenCalledOnce();
    await expect(startInstalled.mock.results[0]?.value).resolves.toMatchObject({
      installedNow: false,
      startedNow: true,
    });
    expect(ensureReady).not.toHaveBeenCalled();
    await server.close();
  });

  it('does not auto-start an older active runtime before an explicit target upgrade', async () => {
    const server = Fastify({ logger: false });
    const pendingUpgradeStatus = {
      ...managedStatus(),
      installed: true,
      running: false,
      targetVersion: 'test-2.0.0',
      version: 'test-1.0.0',
      targetInstalled: true,
      activeVersion: 'test-1.0.0',
      previousVersion: null,
      fallbackActive: false,
      rollback: {
        available: true,
        active: false,
        lastAttempt: null,
      },
      downloadRequired: false,
    };
    const ensureReady = vi.fn();
    const startInstalled = vi.fn();
    await server.register(localInferenceRoutes, {
      runtimeFactory: () => ({
        getStatus: () => pendingUpgradeStatus,
        ensureReady,
        startInstalled,
        stop: async () => undefined,
      }),
      ollamaProbe: async () => unavailableOllama,
      vllmProbe: async () => unavailableVllm,
    });

    await server.ready();
    expect(startInstalled).not.toHaveBeenCalled();
    expect(ensureReady).not.toHaveBeenCalled();
    await server.close();
  });

  it('keeps the sidecar available when an installed runtime cannot restart', async () => {
    const server = Fastify({ logger: false });
    const installedStatus = {
      ...managedStatus(),
      installed: true,
      running: false,
      targetInstalled: true,
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
      targetInstalled: true,
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
    const readyStatus = {
      ...managedStatus(),
      installed: true,
      running: true,
      targetInstalled: true,
      activeVersion: 'test-1.0.0',
      downloadRequired: false,
    };
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
      status: {
        activeVersion: 'test-1.0.0',
        fallbackActive: false,
        rollback: {
          available: false,
          active: false,
          lastAttempt: null,
        },
      },
    });
    expect(ensureReady).toHaveBeenCalledOnce();
    expect(ollamaProbe).toHaveBeenCalledTimes(2);
    await server.close();
  });

  it('reports a failed target upgrade after the verified prior runtime is restored', async () => {
    const server = Fastify({ logger: false });
    const rollbackStatus = managedRollbackStatus();
    const ensureReady = vi.fn(async () => {
      throw new ManagedRuntimeRollbackError(rollbackAttempt, new Error(rollbackAttempt.reason));
    });
    const ollamaProbe = vi.fn()
      .mockResolvedValueOnce(unavailableOllama)
      .mockResolvedValueOnce({
        ...unavailableOllama,
        available: true,
        version: 'test-1.0.0',
      });
    await server.register(localInferenceRoutes, {
      runtimeFactory: () => ({
        getStatus: () => rollbackStatus,
        ensureReady,
        startInstalled: vi.fn(),
        stop: async () => undefined,
      }),
      ollamaProbe,
      vllmProbe: async () => unavailableVllm,
    });

    const response = await server.inject({ method: 'POST', url: '/api/local-inference/bootstrap' });
    expect(response.statusCode).toBe(502);
    const body = response.json();
    expect(body).toMatchObject({
      ok: false,
      code: 'MANAGED_RUNTIME_ROLLED_BACK',
      server: { available: true, version: 'test-1.0.0' },
    });
    expect(body.managedRuntime).toEqual(rollbackStatus);
    expect(body).not.toHaveProperty('installedNow');
    expect(body).not.toHaveProperty('startedNow');
    expect(ensureReady).toHaveBeenCalledOnce();
    expect(ollamaProbe).toHaveBeenCalledTimes(2);
    await server.close();
  });

  it('does not claim bootstrap success when the already-running endpoint is a restored fallback', async () => {
    const server = Fastify({ logger: false });
    const rollbackStatus = managedRollbackStatus();
    const ensureReady = vi.fn(async () => ({
      installedNow: false,
      startedNow: false,
      endpoint: 'http://127.0.0.1:11434',
      status: rollbackStatus,
    }));
    const restoredServer = {
      ...unavailableOllama,
      available: true,
      version: 'test-1.0.0',
    };
    const ollamaProbe = vi.fn(async () => restoredServer);
    await server.register(localInferenceRoutes, {
      runtimeFactory: () => ({
        getStatus: () => rollbackStatus,
        ensureReady,
        startInstalled: vi.fn(),
        stop: async () => undefined,
      }),
      ollamaProbe,
      vllmProbe: async () => unavailableVllm,
    });

    const response = await server.inject({ method: 'POST', url: '/api/local-inference/bootstrap' });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual(expect.objectContaining({
      ok: false,
      code: 'MANAGED_RUNTIME_ROLLED_BACK',
      server: restoredServer,
      managedRuntime: rollbackStatus,
    }));
    expect(ensureReady).toHaveBeenCalledOnce();
    expect(ollamaProbe).toHaveBeenCalledTimes(2);
    await server.close();
  });

  it('waits for managed activation to commit when the runtime already answers loopback', async () => {
    const server = Fastify({ logger: false });
    const activatingStatus = {
      ...managedStatus(),
      installed: true,
      running: true,
      targetInstalled: true,
      downloadRequired: false,
    };
    const readyStatus = {
      ...activatingStatus,
      activeVersion: 'test-1.0.0',
    };
    const ensureReady = vi.fn(async () => ({
      installedNow: false,
      startedNow: false,
      endpoint: 'http://127.0.0.1:11434',
      status: readyStatus,
    }));
    const existingServer = {
      ...unavailableOllama,
      available: true,
      version: 'test-1.0.0',
    };
    const ollamaProbe = vi.fn(async () => existingServer);
    await server.register(localInferenceRoutes, {
      runtimeFactory: () => ({
        getStatus: () => activatingStatus,
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
      installedNow: false,
      startedNow: false,
      server: existingServer,
      status: { activeVersion: 'test-1.0.0', fallbackActive: false },
    });
    expect(ensureReady).toHaveBeenCalledOnce();
    expect(ollamaProbe).toHaveBeenCalledTimes(2);
    await server.close();
  });

  it('preserves bootstrap success for an already-running endpoint that is not a fallback', async () => {
    const server = Fastify({ logger: false });
    const status = managedStatus();
    const ensureReady = vi.fn(async () => ({
      installedNow: false,
      startedNow: false,
      endpoint: 'http://127.0.0.1:11434',
      status,
    }));
    const existingServer = {
      ...unavailableOllama,
      available: true,
      version: 'system-1.0.0',
    };
    await server.register(localInferenceRoutes, {
      runtimeFactory: () => ({
        getStatus: () => status,
        ensureReady,
        startInstalled: vi.fn(),
        stop: async () => undefined,
      }),
      ollamaProbe: async () => existingServer,
      vllmProbe: async () => unavailableVllm,
    });

    const response = await server.inject({ method: 'POST', url: '/api/local-inference/bootstrap' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      installedNow: false,
      startedNow: false,
      server: existingServer,
      status,
    });
    expect(ensureReady).toHaveBeenCalledOnce();
    await server.close();
  });

  it('does not turn a fallback result into bootstrap success after a probe race', async () => {
    const server = Fastify({ logger: false });
    const rollbackStatus = managedRollbackStatus();
    const ensureReady = vi.fn(async () => ({
      installedNow: false,
      startedNow: false,
      endpoint: 'http://127.0.0.1:11434',
      status: rollbackStatus,
    }));
    const restoredServer = {
      ...unavailableOllama,
      available: true,
      version: 'test-1.0.0',
    };
    const ollamaProbe = vi.fn()
      .mockResolvedValueOnce(unavailableOllama)
      .mockResolvedValueOnce(restoredServer);
    await server.register(localInferenceRoutes, {
      runtimeFactory: () => ({
        getStatus: () => rollbackStatus,
        ensureReady,
        startInstalled: vi.fn(),
        stop: async () => undefined,
      }),
      ollamaProbe,
      vllmProbe: async () => unavailableVllm,
    });

    const response = await server.inject({ method: 'POST', url: '/api/local-inference/bootstrap' });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual(expect.objectContaining({
      ok: false,
      code: 'MANAGED_RUNTIME_ROLLED_BACK',
      server: restoredServer,
      managedRuntime: rollbackStatus,
    }));
    expect(response.json()).not.toHaveProperty('installedNow');
    expect(response.json()).not.toHaveProperty('startedNow');
    expect(ensureReady).toHaveBeenCalledOnce();
    expect(ollamaProbe).toHaveBeenCalledTimes(2);
    await server.close();
  });

  it('keeps the generic bootstrap failure contract for failures without a restored runtime', async () => {
    const server = Fastify({ logger: false });
    const ensureReady = vi.fn(async () => {
      throw new Error('runtime download blocked');
    });
    await server.register(localInferenceRoutes, {
      runtimeFactory: () => ({
        getStatus: () => managedStatus(),
        ensureReady,
        startInstalled: vi.fn(),
        stop: async () => undefined,
      }),
      ollamaProbe: async () => unavailableOllama,
      vllmProbe: async () => unavailableVllm,
    });

    const response = await server.inject({ method: 'POST', url: '/api/local-inference/bootstrap' });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: 'runtime download blocked',
      code: 'MANAGED_RUNTIME_BOOTSTRAP_FAILED',
      managedRuntime: managedStatus(),
    });
    expect(ensureReady).toHaveBeenCalledOnce();
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
  async function buildPullServer(
    models: string[],
    modelDigests: Record<string, string> = Object.fromEntries(
      models.map((model) => [model, `sha256:${'a'.repeat(64)}`]),
    ),
  ) {
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
        modelDigests,
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
        digest: `sha256:${'a'.repeat(64)}`,
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

  it('canonicalizes the bare digest advertised by the live Ollama tag API', async () => {
    const wireDigest = 'B'.repeat(64);
    const digest = `sha256:${'b'.repeat(64)}`;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/api/pull')) {
        return new Response(JSON.stringify({ status: 'success' }), { status: 200 });
      }
      if (url.endsWith('/api/tags')) {
        return new Response(JSON.stringify({
          models: [{ name: 'qwen3:1.7b', digest: wireDigest }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.endsWith('/api/version')) {
        return new Response(JSON.stringify({ version: 'test-1.0.0' }), { status: 200 });
      }
      if (url.endsWith('/api/generate')) {
        return new Response(JSON.stringify({ response: 'OK', done: true }), { status: 200 });
      }
      return new Response('', { status: 503 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const server = Fastify({ logger: false });
    await server.register(localInferenceRoutes, {
      runtimeFactory: () => ({
        getStatus: () => ({ ...managedStatus(), installed: true, running: true }),
        ensureReady: vi.fn(),
        startInstalled: vi.fn(),
        stop: async () => undefined,
      }),
      vllmProbe: async () => unavailableVllm,
    });
    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/local-inference/pull',
        payload: { model: 'qwen3:1.7b' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ model: 'qwen3:1.7b', digest });
    } finally {
      await server.close();
      vi.unstubAllGlobals();
    }
  });

  it('fails closed when Ollama does not advertise an immutable model digest', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'success' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const server = await buildPullServer(['qwen3:1.7b'], {});
    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/local-inference/pull',
        payload: { model: 'qwen3:1.7b' },
      });
      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({
        code: 'MODEL_DIGEST_UNAVAILABLE',
        model: 'qwen3:1.7b',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
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
