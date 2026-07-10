import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { NotificationGate, materialFingerprint, getNotificationGate } from '../src/local/notification-gate.js';
import { emitNotification } from '../src/local/routes/notifications.js';
import { suggestCapabilities, type ProactiveContext } from '../src/local/proactive-handlers.js';
import { WorkspaceManager } from '@waggle/core';

const STORE_FILE = 'notification-fingerprints.json';

describe('materialFingerprint', () => {
  it('is stable regardless of object key order', () => {
    expect(materialFingerprint({ a: 1, b: 2, c: [3, 4] })).toBe(
      materialFingerprint({ c: [3, 4], b: 2, a: 1 }),
    );
  });

  it('changes when content changes', () => {
    expect(materialFingerprint({ pending: 2 })).not.toBe(materialFingerprint({ pending: 3 }));
  });

  it('is order-sensitive for arrays', () => {
    expect(materialFingerprint([1, 2])).not.toBe(materialFingerprint([2, 1]));
  });
});

describe('NotificationGate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-notif-gate-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('fires on a new key', () => {
    const gate = new NotificationGate(tmpDir);
    expect(gate.shouldNotify('k1', 'hash-a')).toBe(true);
  });

  it('suppresses an unchanged hash for the same key', () => {
    const gate = new NotificationGate(tmpDir);
    expect(gate.shouldNotify('k1', 'hash-a')).toBe(true);
    expect(gate.shouldNotify('k1', 'hash-a')).toBe(false);
  });

  it('fires again when the hash changes', () => {
    const gate = new NotificationGate(tmpDir);
    expect(gate.shouldNotify('k1', 'hash-a')).toBe(true);
    expect(gate.shouldNotify('k1', 'hash-b')).toBe(true);
    // The new hash is now the recorded one.
    expect(gate.shouldNotify('k1', 'hash-b')).toBe(false);
  });

  it('persists across gate instances (survives restart)', () => {
    new NotificationGate(tmpDir).shouldNotify('k1', 'hash-a');
    expect(new NotificationGate(tmpDir).shouldNotify('k1', 'hash-a')).toBe(false);
  });

  it('recovers from a corrupt store file', () => {
    fs.writeFileSync(path.join(tmpDir, STORE_FILE), '{not valid json');
    const gate = new NotificationGate(tmpDir);
    // Corrupt file is treated as empty — the key is new, so it fires and rewrites.
    expect(gate.shouldNotify('k1', 'hash-a')).toBe(true);
    expect(gate.shouldNotify('k1', 'hash-a')).toBe(false);
  });

  it('recovers when the store is a JSON array (not an object)', () => {
    fs.writeFileSync(path.join(tmpDir, STORE_FILE), '[1,2,3]');
    const gate = new NotificationGate(tmpDir);
    expect(gate.shouldNotify('k1', 'hash-a')).toBe(true);
  });

  it('caps the store at 200 keys, evicting the oldest by last-updated', () => {
    let clock = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => clock++);

    const gate = new NotificationGate(tmpDir);
    for (let i = 0; i < 205; i++) {
      gate.shouldNotify(`key-${i}`, `hash-${i}`);
    }

    const store = JSON.parse(fs.readFileSync(path.join(tmpDir, STORE_FILE), 'utf-8')) as Record<string, unknown>;
    const keys = Object.keys(store);
    expect(keys.length).toBe(200);
    // Oldest five evicted, newest retained.
    expect(store['key-0']).toBeUndefined();
    expect(store['key-4']).toBeUndefined();
    expect(store['key-5']).toBeDefined();
    expect(store['key-204']).toBeDefined();
  });
});

describe('emitNotification anti-nag gate', () => {
  let tmpDir: string;

  function makeFastify() {
    const eventBus = new EventEmitter();
    const emitted: unknown[] = [];
    eventBus.on('notification', (e) => emitted.push(e));
    const saveNotification = vi.fn(() => 1);
    return {
      fastify: {
        localConfig: { dataDir: tmpDir },
        cronStore: { saveNotification },
        eventBus,
        log: { debug: vi.fn() },
      } as never,
      emitted,
      saveNotification,
    };
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-notif-emit-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('behaves exactly as before when no options are passed', () => {
    const { fastify, emitted, saveNotification } = makeFastify();
    const result = emitNotification(fastify, { title: 't', body: 'b', category: 'agent' });
    expect(result).toEqual({ suppressed: false });
    expect(saveNotification).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveLength(1);
  });

  it('emits the first time and suppresses an identical re-emit', () => {
    const { fastify, emitted, saveNotification } = makeFastify();
    const opts = { dedupeKey: 'k1', materialHash: materialFingerprint({ count: 2 }) };

    const first = emitNotification(fastify, { title: 't', body: 'b', category: 'agent' }, opts);
    expect(first).toEqual({ suppressed: false });
    expect(saveNotification).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveLength(1);

    const second = emitNotification(fastify, { title: 't', body: 'b', category: 'agent' }, opts);
    expect(second).toEqual({ suppressed: true });
    // No new row, no new broadcast.
    expect(saveNotification).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveLength(1);
  });

  it('re-emits when the material hash changes', () => {
    const { fastify, emitted } = makeFastify();
    emitNotification(fastify, { title: 't', body: 'b', category: 'agent' }, { dedupeKey: 'k1', materialHash: 'a' });
    emitNotification(fastify, { title: 't', body: 'b', category: 'agent' }, { dedupeKey: 'k1', materialHash: 'a' });
    emitNotification(fastify, { title: 't', body: 'b', category: 'agent' }, { dedupeKey: 'k1', materialHash: 'b' });
    expect(emitted).toHaveLength(2);
  });

  it('suppresses a repeated identical proactive payload on the second emit', () => {
    const wsManager = new WorkspaceManager(tmpDir);
    const ctx: ProactiveContext = {
      dataDir: tmpDir,
      workspaceManager: wsManager,
      getWorkspaceMindDb: () => null,
    };
    // No skills installed → the "capability packs" suggestion, carrying a dedupeKey + hash.
    const msg = suggestCapabilities(ctx);
    expect(msg).not.toBeNull();
    expect(msg!.dedupeKey).toBeDefined();
    expect(msg!.materialHash).toBeDefined();

    const { fastify, emitted } = makeFastify();
    const opts = { dedupeKey: msg!.dedupeKey, materialHash: msg!.materialHash };

    expect(emitNotification(fastify, { title: msg!.title, body: msg!.body, category: 'agent' }, opts).suppressed).toBe(false);
    expect(emitNotification(fastify, { title: msg!.title, body: msg!.body, category: 'agent' }, opts).suppressed).toBe(true);
    expect(emitted).toHaveLength(1);
  });
});
