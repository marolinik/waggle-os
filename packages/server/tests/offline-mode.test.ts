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
    const notifications: any[] = [];
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

    globalThis.fetch = originalFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('emits back_online notification when recovering', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-offline-recov-'));
    const bus = new EventEmitter();
    const notifications: any[] = [];
    bus.on('notification', (data) => notifications.push(data));
    const stateChanges: any[] = [];
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

    // Then: make it come back online
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 200 });
    await mgr.checkHealth();
    expect(mgr.isOffline).toBe(false);
    expect(notifications).toHaveLength(2);
    expect(notifications[1].title).toBe('Back online');
    expect(stateChanges).toHaveLength(2);
    expect(stateChanges[1].offline).toBe(false);

    globalThis.fetch = originalFetch;
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ── REST route integration tests ────────────────────────────────────

describe('Offline REST routes', () => {
  let server: FastifyInstance;
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

    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
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
