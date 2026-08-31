/**
 * PM-6: Offline mode tests — OfflineManager, REST routes, health check enhancement.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, SessionStore, FrameStore } from '@waggle/core';
import { buildLocalServer } from '../src/local/index.js';
import { OfflineManager } from '../src/local/offline-manager.js';
import { EventEmitter } from 'node:events';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from './test-utils.js';

// ── OfflineManager unit tests ───────────────────────────────────────

describe('OfflineManager', () => {
  let tmpDir: string;
  let eventBus: EventEmitter;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-offline-test-'));
    eventBus = new EventEmitter();
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts with online state', () => {
    const mgr = new OfflineManager({
      dataDir: tmpDir,
      getLlmEndpoint: () => 'http://localhost:9999',
      getLlmApiKey: () => 'test-key',
      eventBus,
    });

    const state = mgr.state;
    expect(state.offline).toBe(false);
    expect(state.since).toBeNull();
    expect(state.queuedMessages).toBe(0);
  });

  it('queues messages and persists them', () => {
    const mgr = new OfflineManager({
      dataDir: tmpDir,
      getLlmEndpoint: () => 'http://localhost:9999',
      getLlmApiKey: () => 'test-key',
      eventBus,
    });

    const msg1 = mgr.queueMessage('ws-1', 'Hello world');
    expect(msg1.id).toBeDefined();
    expect(msg1.workspaceId).toBe('ws-1');
    expect(msg1.message).toBe('Hello world');
    expect(msg1.timestamp).toBeDefined();

    const msg2 = mgr.queueMessage('ws-2', 'Second message');

    expect(mgr.state.queuedMessages).toBe(2);
    expect(mgr.getQueue()).toHaveLength(2);

    // Verify persistence
    const queuePath = path.join(tmpDir, 'offline-queue.json');
    expect(fs.existsSync(queuePath)).toBe(true);
    const persisted = JSON.parse(fs.readFileSync(queuePath, 'utf-8'));
    expect(persisted).toHaveLength(2);
  });

  it('dequeues a specific message', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-offline-deq-'));
    const mgr = new OfflineManager({
      dataDir: dir,
      getLlmEndpoint: () => 'http://localhost:9999',
      getLlmApiKey: () => 'test-key',
      eventBus,
    });

    const msg1 = mgr.queueMessage('ws-1', 'Keep this');
    const msg2 = mgr.queueMessage('ws-1', 'Remove this');

    expect(mgr.dequeue(msg2.id)).toBe(true);
    expect(mgr.getQueue()).toHaveLength(1);
    expect(mgr.getQueue()[0].message).toBe('Keep this');

    // Non-existent ID
    expect(mgr.dequeue('fake-id')).toBe(false);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('clears queue', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-offline-clr-'));
    const mgr = new OfflineManager({
      dataDir: dir,
      getLlmEndpoint: () => 'http://localhost:9999',
      getLlmApiKey: () => 'test-key',
      eventBus,
    });

    mgr.queueMessage('ws-1', 'msg1');
    mgr.queueMessage('ws-1', 'msg2');
    mgr.queueMessage('ws-1', 'msg3');

    const cleared = mgr.clearQueue();
    expect(cleared).toBe(3);
    expect(mgr.getQueue()).toHaveLength(0);
    expect(mgr.state.queuedMessages).toBe(0);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('emits notification when transitioning to offline', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-offline-emit-'));
    const bus = new EventEmitter();
    const notifications: Array<{ title: string; body: string }> = [];
    bus.on('notification', (data) => notifications.push(data));

    // Mock fetch to always fail
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const mgr = new OfflineManager({
      dataDir: dir,
      getLlmEndpoint: () => 'http://unreachable:9999',
      getLlmApiKey: () => 'test-key',
      eventBus: bus,
    });

    await mgr.checkHealth();

    expect(mgr.isOffline).toBe(true);
    expect(mgr.state.since).not.toBeNull();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe('Offline');
    expect(notifications[0].body).toMatch(/retry failed chat turns after it reconnects/i);
    expect(notifications[0].body).not.toMatch(/queued|sent when/i);

    globalThis.fetch = originalFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('clears the probe timeout when fetch rejects immediately', async () => {
    const originalFetch = globalThis.fetch;
    vi.useFakeTimers();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    try {
      const mgr = new OfflineManager({
        dataDir: tmpDir,
        getLlmEndpoint: () => 'http://localhost:9999',
        getLlmApiKey: () => 'test-key',
        eventBus,
      });

      expect(await mgr.checkHealth()).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
      vi.useRealTimers();
    }
  });

  it.each([401, 404])(
    'does not treat built-in proxy /health status %i as model-ready',
    async (status) => {
      const originalFetch = globalThis.fetch;
      const fetchMock = vi.fn().mockResolvedValue({ status });
      globalThis.fetch = fetchMock;

      try {
        const mgr = new OfflineManager({
          dataDir: tmpDir,
          getLlmEndpoint: () => 'http://127.0.0.1:3333/v1',
          getLlmApiKey: () => 'test-key',
          eventBus,
        });

        expect(await mgr.checkHealth()).toBe(false);
        expect(mgr.isOffline).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
          'http://127.0.0.1:3333/v1/health',
          expect.objectContaining({ method: 'GET' }),
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );

  it('emits back_online notification when recovering', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-offline-recov-'));
    const bus = new EventEmitter();
    const notifications: Array<{ title: string; body: string }> = [];
    bus.on('notification', (data) => notifications.push(data));
    const stateChanges: Array<{ offline: boolean }> = [];
    bus.on('offline_state_change', (data) => stateChanges.push(data));

    const originalFetch = globalThis.fetch;

    // First: make it go offline
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const mgr = new OfflineManager({
      dataDir: dir,
      getLlmEndpoint: () => 'http://localhost:9999',
      getLlmApiKey: () => 'test-key',
      eventBus: bus,
    });
    await mgr.checkHealth();
    expect(mgr.isOffline).toBe(true);
    mgr.queueMessage('ws-recovery', 'Explicit legacy queue entry');

    // Then: make it come back online
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 200 });
    await mgr.checkHealth();
    expect(mgr.isOffline).toBe(false);
    expect(notifications).toHaveLength(2);
    expect(notifications[1].title).toBe('Back online');
    expect(notifications[1].body).toMatch(/retry any failed chat turn/i);
    expect(notifications[1].body).not.toMatch(/queued|sent automatically/i);
    expect(stateChanges).toHaveLength(2);
    expect(stateChanges[1].offline).toBe(false);

    globalThis.fetch = originalFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('Offline shutdown lifecycle', () => {
  it('aborts an in-flight loopback readiness check before draining the server', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-offline-close-'));
    const nativeFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    let server: FastifyInstance | undefined;
    let closePromise: Promise<void> | undefined;
    let markEntered!: () => void;
    let markDisconnected!: () => void;
    let releaseRequest!: () => void;
    let destroyBlockedRequest: (() => void) | undefined;
    const requestEntered = new Promise<void>((resolve) => { markEntered = resolve; });
    const requestDisconnected = new Promise<void>((resolve) => { markDisconnected = resolve; });
    const requestReleased = new Promise<void>((resolve) => { releaseRequest = resolve; });

    try {
      server = await buildLocalServer({
        dataDir,
        port: 0,
        skipLiteLLM: true,
        useBuiltInProxy: true,
        manageLiteLLM: false,
      });
      server.agentState.currentModel = 'anthropic/claude-sonnet-4-6';
      server.agentState.llmProvider = {
        provider: 'anthropic-proxy',
        health: 'healthy',
        detail: 'deterministic loopback shutdown fixture',
        checkedAt: new Date().toISOString(),
      };
      fetchSpy.mockImplementation(async (input, init) => {
        if (String(input).endsWith('/api/tags')) {
          return new Response('{}', { status: 503 });
        }
        return nativeFetch(input, init);
      });
      server.addHook('onRequest', async (request, reply) => {
        if (request.url !== '/v1/health/readiness') return;
        const onDisconnect = () => {
          markDisconnected();
          releaseRequest();
        };
        request.raw.once('aborted', onDisconnect);
        reply.raw.once('close', onDisconnect);
        destroyBlockedRequest = () => {
          request.raw.destroy();
          releaseRequest();
        };
        markEntered();
        await requestReleased;
        request.raw.off('aborted', onDisconnect);
        reply.raw.off('close', onDisconnect);
      });
      await server.listen({ port: 0, host: '127.0.0.1' });
      let startTimer: ReturnType<typeof setTimeout> | undefined;
      const started = await Promise.race([
        requestEntered.then(() => true),
        new Promise<false>((resolve) => {
          startTimer = setTimeout(() => resolve(false), 5_000);
        }),
      ]);
      if (startTimer) clearTimeout(startTimer);
      expect(started).toBe(true);

      closePromise = server.close();
      let disconnectTimer: ReturnType<typeof setTimeout> | undefined;
      const disconnectedBeforeFallback = await Promise.race([
        requestDisconnected.then(() => true),
        new Promise<false>((resolve) => {
          disconnectTimer = setTimeout(() => resolve(false), 250);
        }),
      ]);
      if (disconnectTimer) clearTimeout(disconnectTimer);
      if (!disconnectedBeforeFallback) destroyBlockedRequest?.();
      await closePromise;
      expect(disconnectedBeforeFallback).toBe(true);
      expect(server.offlineManager.isOffline).toBe(false);
    } finally {
      destroyBlockedRequest?.();
      releaseRequest();
      if (closePromise) {
        await closePromise.catch(() => {});
      } else if (server?.server.listening) {
        await server.close();
      }
      fetchSpy.mockRestore();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('aborts a selected Ollama readiness probe without a stale offline transition', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-offline-ollama-close-'));
    const nativeFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    let server: FastifyInstance | undefined;
    let closePromise: Promise<void> | undefined;
    let insideOfflineStart = false;
    let startSpy: ReturnType<typeof vi.spyOn> | undefined;
    let managedProbe: {
      signal: AbortSignal | undefined;
      aborted: Promise<void>;
      release: () => void;
    } | undefined;
    let markProbeStarted!: () => void;
    const probeStarted = new Promise<void>((resolve) => { markProbeStarted = resolve; });

    try {
      server = await buildLocalServer({
        dataDir,
        port: 0,
        skipLiteLLM: true,
        useBuiltInProxy: true,
        manageLiteLLM: false,
      });
      server.agentState.currentModel = 'ollama/test-readiness:latest';
      server.agentState.llmProvider = {
        provider: 'ollama',
        health: 'healthy',
        detail: 'deterministic selected Ollama shutdown fixture',
        checkedAt: new Date().toISOString(),
      };
      const originalStart = server.offlineManager.start.bind(server.offlineManager);
      startSpy = vi.spyOn(server.offlineManager, 'start').mockImplementation(() => {
        insideOfflineStart = true;
        try {
          originalStart();
        } finally {
          insideOfflineStart = false;
        }
      });
      fetchSpy.mockImplementation((input, init) => {
        if (!String(input).endsWith('/api/tags')) return nativeFetch(input, init);
        if (!insideOfflineStart) return Promise.resolve(new Response('{}', { status: 503 }));

        const signal = init?.signal ?? undefined;
        return new Promise<Response>((resolve, reject) => {
          let markAborted!: () => void;
          const aborted = new Promise<void>((resolveAbort) => { markAborted = resolveAbort; });
          const onAbort = () => {
            signal?.removeEventListener('abort', onAbort);
            markAborted();
            reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
          };
          managedProbe = {
            signal,
            aborted,
            release: () => {
              signal?.removeEventListener('abort', onAbort);
              resolve(new Response('{}', { status: 503 }));
            },
          };
          if (signal?.aborted) onAbort();
          else signal?.addEventListener('abort', onAbort, { once: true });
          markProbeStarted();
        });
      });

      await server.listen({ port: 0, host: '127.0.0.1' });
      let startTimer: ReturnType<typeof setTimeout> | undefined;
      const started = await Promise.race([
        probeStarted.then(() => true),
        new Promise<false>((resolve) => {
          startTimer = setTimeout(() => resolve(false), 5_000);
        }),
      ]);
      if (startTimer) clearTimeout(startTimer);
      expect(started).toBe(true);
      const probe = managedProbe;
      expect(probe).toBeDefined();
      expect(probe?.signal).toBeInstanceOf(AbortSignal);
      if (!probe) throw new Error('managed selected-Ollama probe was not captured');

      closePromise = server.close();
      let abortTimer: ReturnType<typeof setTimeout> | undefined;
      const abortedBeforeFallback = await Promise.race([
        probe.aborted.then(() => true),
        new Promise<false>((resolve) => {
          abortTimer = setTimeout(() => resolve(false), 250);
        }),
      ]);
      if (abortTimer) clearTimeout(abortTimer);
      if (!abortedBeforeFallback) probe.release();
      await closePromise;

      expect(abortedBeforeFallback).toBe(true);
      expect(probe.signal?.aborted).toBe(true);
      expect(server.offlineManager.isOffline).toBe(false);
    } finally {
      managedProbe?.release();
      if (closePromise) {
        await closePromise.catch(() => {});
      } else if (server?.server.listening) {
        await server.close();
      }
      startSpy?.mockRestore();
      fetchSpy.mockRestore();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

// ── REST route integration tests ────────────────────────────────────

describe('Offline REST routes', () => {
  let server: FastifyInstance;
  let serverBuild: Promise<FastifyInstance> | undefined;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-offline-route-'));

    // Create personal.mind
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('offline-test');
    frames.createIFrame(s1.gop_id, 'Test frame', 'normal');
    mind.close();

    serverBuild = buildLocalServer({ dataDir: tmpDir }).then(async (builtServer) => {
      await builtServer.offlineManager.stop();
      return builtServer;
    });
    server = await serverBuild;
  }, 30_000);

  afterAll(async () => {
    let builtServer: FastifyInstance | undefined;
    try {
      builtServer = serverBuild ? await serverBuild : undefined;
    } catch {
      // The setup hook reports build failures; teardown still owns fixture cleanup.
    }
    try {
      if (builtServer) await builtServer.close();
    } finally {
      if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 30_000);

  it('uses built-in proxy completion readiness over stale provider health', async () => {
    const originalFetch = globalThis.fetch;
    const originalEndpoint = server.localConfig.litellmUrl;
    const originalProvider = server.agentState.llmProvider;
    const originalModel = server.agentState.currentModel;
    const fetchMock = vi.fn().mockResolvedValue({ status: 503, ok: false });

    server.localConfig.litellmUrl = 'http://127.0.0.1:3333/v1';
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'Stale startup status',
      checkedAt: new Date().toISOString(),
    };
    server.agentState.currentModel = 'anthropic/claude-sonnet-4-6';
    globalThis.fetch = fetchMock;

    try {
      expect(await server.offlineManager.checkHealth()).toBe(false);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:3333/v1/health/readiness',
        expect.any(Object),
      );
      const health = await injectWithAuth(server, { method: 'GET', url: '/health' });
      const healthBody = health.json();
      expect(healthBody.llm.reachable).toBe(false);
      expect(healthBody.offline.offline).toBe(true);
      expect(healthBody.status).not.toBe('ok');
    } finally {
      globalThis.fetch = originalFetch;
      server.localConfig.litellmUrl = originalEndpoint;
      server.agentState.llmProvider = originalProvider;
      server.agentState.currentModel = originalModel;
    }
  });

  it('keeps /health reachability and offline projection consistent', async () => {
    const offlineState = server.offlineManager as unknown as { _offline: boolean };
    const originalOffline = offlineState._offline;
    const originalProvider = server.agentState.llmProvider;

    offlineState._offline = true;
    server.agentState.llmProvider = {
      provider: 'ollama',
      health: 'healthy',
      detail: 'Newer resolved provider',
      checkedAt: new Date(Date.now() + 1_000).toISOString(),
    };

    try {
      const health = await injectWithAuth(server, { method: 'GET', url: '/health' });
      const body = health.json();
      expect(body.llm.reachable).toBe(true);
      expect(body.offline.offline).toBe(false);
    } finally {
      offlineState._offline = originalOffline;
      server.agentState.llmProvider = originalProvider;
    }
  });

  it('keeps LiteLLM online when its completion-readiness route succeeds', async () => {
    const originalFetch = globalThis.fetch;
    const originalEndpoint = server.localConfig.litellmUrl;
    const originalProvider = server.agentState.llmProvider;
    const originalModel = server.agentState.currentModel;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === 'http://127.0.0.1:4000/health/readiness') {
        return { status: 200, ok: true };
      }
      if (url === 'http://127.0.0.1:4000/models') {
        return {
          status: 200,
          ok: true,
          json: async () => ({ data: [{ id: 'openai/gpt-5.4' }] }),
        };
      }
      return { status: 404, ok: false };
    });

    server.localConfig.litellmUrl = 'http://127.0.0.1:4000';
    server.agentState.llmProvider = {
      provider: 'litellm',
      health: 'healthy',
      detail: 'LiteLLM test provider',
      checkedAt: new Date().toISOString(),
    };
    server.agentState.currentModel = 'openai/gpt-5.4';
    globalThis.fetch = fetchMock;

    try {
      expect(await server.offlineManager.checkHealth()).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:4000/health/readiness',
        expect.any(Object),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:4000/models',
        expect.any(Object),
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
      server.localConfig.litellmUrl = originalEndpoint;
      server.agentState.llmProvider = originalProvider;
      server.agentState.currentModel = originalModel;
    }
  });

  it('keeps LiteLLM offline when the selected model route is absent', async () => {
    const originalFetch = globalThis.fetch;
    const originalEndpoint = server.localConfig.litellmUrl;
    const originalProvider = server.agentState.llmProvider;
    const originalModel = server.agentState.currentModel;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/health/readiness')) return { status: 200, ok: true };
      if (url.endsWith('/models')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ data: [{ id: 'google/gemini-2.5-flash' }] }),
        };
      }
      return { status: 404, ok: false };
    });

    server.localConfig.litellmUrl = 'http://127.0.0.1:4000';
    server.agentState.llmProvider = {
      provider: 'litellm',
      health: 'healthy',
      detail: 'LiteLLM test provider',
      checkedAt: new Date().toISOString(),
    };
    server.agentState.currentModel = 'openai/gpt-5.4';
    globalThis.fetch = fetchMock;

    try {
      expect(await server.offlineManager.checkHealth()).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
      server.localConfig.litellmUrl = originalEndpoint;
      server.agentState.llmProvider = originalProvider;
      server.agentState.currentModel = originalModel;
    }
  });

  it('keeps a selected installed Ollama model online without probing proxy liveness', async () => {
    const originalFetch = globalThis.fetch;
    const originalOllamaHost = process.env.OLLAMA_HOST;
    const originalProvider = server.agentState.llmProvider;
    const originalModel = server.agentState.currentModel;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url === 'http://127.0.0.1:11434/api/tags') {
        return {
          status: 200,
          ok: true,
          json: async () => ({ models: [{ name: 'qwen2.5:7b' }] }),
        };
      }
      return { status: 404, ok: false };
    });

    process.env.OLLAMA_HOST = 'http://127.0.0.1:11434';
    server.agentState.llmProvider = {
      provider: 'ollama',
      health: 'healthy',
      detail: 'Local Ollama model',
      checkedAt: new Date().toISOString(),
    };
    server.agentState.currentModel = 'ollama/qwen2.5:7b';
    globalThis.fetch = fetchMock;

    try {
      expect(await server.offlineManager.checkHealth()).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:11434/api/tags',
        expect.any(Object),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalOllamaHost === undefined) delete process.env.OLLAMA_HOST;
      else process.env.OLLAMA_HOST = originalOllamaHost;
      server.agentState.llmProvider = originalProvider;
      server.agentState.currentModel = originalModel;
    }
  });

  it('does not let a stale Ollama provider override a selected cloud route', async () => {
    const originalFetch = globalThis.fetch;
    const originalEndpoint = server.localConfig.litellmUrl;
    const originalProvider = server.agentState.llmProvider;
    const originalModel = server.agentState.currentModel;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/api/tags')) {
        return {
          status: 200,
          ok: true,
          json: async () => ({ models: [{ name: 'qwen2.5:7b' }] }),
        };
      }
      return { status: 503, ok: false };
    });

    server.localConfig.litellmUrl = 'http://127.0.0.1:3333/v1';
    server.agentState.llmProvider = {
      provider: 'ollama',
      health: 'healthy',
      detail: 'Stale local provider status',
      checkedAt: new Date().toISOString(),
    };
    server.agentState.currentModel = 'openai/gpt-5.4';
    globalThis.fetch = fetchMock;

    try {
      expect(await server.offlineManager.checkHealth()).toBe(false);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:3333/v1/health/readiness',
        expect.any(Object),
      );
      expect(fetchMock).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/tags'),
        expect.any(Object),
      );
    } finally {
      globalThis.fetch = originalFetch;
      server.localConfig.litellmUrl = originalEndpoint;
      server.agentState.llmProvider = originalProvider;
      server.agentState.currentModel = originalModel;
    }
  });

  it('GET /api/offline/status returns expected shape', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/offline/status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(typeof body.offline).toBe('boolean');
    expect(body).toHaveProperty('since');
    expect(typeof body.queuedMessages).toBe('number');
    expect(body).toHaveProperty('lastCheck');
  });

  it('POST /api/offline/queue stores messages', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/offline/queue',
      payload: { workspaceId: 'test-ws', message: 'Hello from offline' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.queued).toBeDefined();
    expect(body.queued.message).toBe('Hello from offline');
    expect(body.queued.workspaceId).toBe('test-ws');
    expect(body.queued.id).toBeDefined();
  });

  it('POST /api/offline/queue rejects missing message', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/offline/queue',
      payload: { workspaceId: 'test-ws' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/offline/queue returns queued messages', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/offline/queue' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages.length).toBeGreaterThanOrEqual(1);
    expect(body.messages[0].message).toBe('Hello from offline');
  });

  it('DELETE /api/offline/queue clears queue', async () => {
    // Queue another message first
    await injectWithAuth(server, {
      method: 'POST',
      url: '/api/offline/queue',
      payload: { workspaceId: 'ws-2', message: 'Another' },
    });

    const res = await injectWithAuth(server, { method: 'DELETE', url: '/api/offline/queue' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.cleared).toBeGreaterThanOrEqual(1);

    // Verify empty
    const check = await injectWithAuth(server, { method: 'GET', url: '/api/offline/queue' });
    const checkBody = JSON.parse(check.body);
    expect(checkBody.messages).toHaveLength(0);
  });

  it('health endpoint includes offline state', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // PM-6: New fields
    expect(body.offline).toBeDefined();
    expect(typeof body.offline.offline).toBe('boolean');
    expect(typeof body.offline.queuedMessages).toBe('number');
    expect(body.llm).toHaveProperty('reachable');
    expect(body.llm).toHaveProperty('lastCheck');
  });
});
