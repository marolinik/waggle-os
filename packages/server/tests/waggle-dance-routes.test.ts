/**
 * AI-OS Phase 1B — waggle-dance routes integration tests.
 *
 * Boots a real local server, posts signals, queries the bus.
 * Verifies the cross-tool activity bus end-to-end via REST.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { MindDB, FrameStore, SessionStore } from '@waggle/core';
import { buildLocalServer } from '../src/local/index.js';
import { injectWithAuth } from './test-utils.js';

function createTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `waggle-wd-${prefix}-`));
}

function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

describe('Waggle-Dance routes (Phase 1B)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = createTmpDir('routes');
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s = sessions.create('wd-routes-test');
    frames.createIFrame(s.gop_id, 'wd-routes-test seed', 'normal');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });
    await server.ready();
  });

  afterAll(async () => {
    if (server) await server.close();
    if (tmpDir) cleanupDir(tmpDir);
  });

  beforeEach(() => {
    // Reset the bus between tests so we don't have cross-test pollution.
    if (server?.signalBus) server.signalBus.clear();
  });

  // ── POST /api/waggle-dance/signal ────────────────────────────────

  it('POST returns 201 and persists a discovery signal', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'broadcast',
        subtype: 'discovery',
        senderId: 'claude-code-hook',
        content: { tool: 'claude-code', topic: 'webhook rotation' },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.dispatched).toBe(true);
    expect(body.message.subtype).toBe('discovery');
    expect(body.message.teamId).toBe('personal::claude-code-hook');
    expect(body.message.id).toBeTruthy();
  });

  it('POST defaults senderId to "local" and derives a personal team', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'broadcast',
        subtype: 'discovery',
        content: { topic: 'no-sender case' },
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.message.senderId).toBe('local');
    expect(body.message.teamId).toBe('personal::local');
  });

  it('POST rejects invalid type/subtype combo', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'request',
        subtype: 'discovery', // discovery is broadcast-only
        content: {},
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Invalid type-subtype combination');
  });

  it('POST rejects unknown subtype', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'broadcast',
        subtype: 'made_up_subtype',
        content: {},
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST accepts a routed_share with routing list', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'broadcast',
        subtype: 'routed_share',
        senderId: 'hermes',
        content: { tool: 'hermes', payload: { docId: 'd-7' } },
        routing: [{ userId: 'u-1', reason: 'subscribed' }],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.message.routing).toHaveLength(1);
  });

  it('POST accepts a knowledge_match response with referenceId', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'response',
        subtype: 'knowledge_match',
        senderId: 'cursor-hook',
        referenceId: 'orig-msg-id',
        content: { matchedEntities: ['e-1'] },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().message.referenceId).toBe('orig-msg-id');
  });

  // ── GET /api/waggle-dance/signals ────────────────────────────────

  it('GET returns recently posted signals newest-first', async () => {
    for (const topic of ['a', 'b', 'c']) {
      await injectWithAuth(server, {
        method: 'POST',
        url: '/api/waggle-dance/signal',
        headers: { 'content-type': 'application/json' },
        payload: {
          type: 'broadcast',
          subtype: 'discovery',
          senderId: 'test',
          content: { tool: 'cursor', topic },
        },
      });
    }
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/waggle-dance/signals',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(3);
    expect(body.signals[0].content.topic).toBe('c');
    expect(body.signals[2].content.topic).toBe('a');
  });

  it('GET filters by subtype', async () => {
    await injectWithAuth(server, {
      method: 'POST', url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'broadcast', subtype: 'discovery',
        senderId: 't', content: { tool: 'claude-code' },
      },
    });
    await injectWithAuth(server, {
      method: 'POST', url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'broadcast', subtype: 'model_recipe',
        senderId: 't', content: { name: 'recipe-1', model: 'haiku' },
      },
    });
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/waggle-dance/signals?subtype=discovery',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.signals[0].subtype).toBe('discovery');
  });

  it('GET filters by tool', async () => {
    for (const tool of ['claude-code', 'cursor', 'claude-code']) {
      await injectWithAuth(server, {
        method: 'POST', url: '/api/waggle-dance/signal',
        headers: { 'content-type': 'application/json' },
        payload: {
          type: 'broadcast', subtype: 'discovery',
          senderId: 't', content: { tool },
        },
      });
    }
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/waggle-dance/signals?tool=claude-code',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(2);
  });

  it('GET honors limit', async () => {
    for (let i = 0; i < 5; i++) {
      await injectWithAuth(server, {
        method: 'POST', url: '/api/waggle-dance/signal',
        headers: { 'content-type': 'application/json' },
        payload: {
          type: 'broadcast', subtype: 'discovery',
          senderId: 't', content: { tool: 'x', idx: i },
        },
      });
    }
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/waggle-dance/signals?limit=2',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().signals).toHaveLength(2);
  });

  it('GET rejects unknown subtype filter', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/waggle-dance/signals?subtype=garbage',
    });
    expect(res.statusCode).toBe(400);
  });

  // ── round trip ────────────────────────────────────────────────────

  it('POST → GET round trip preserves full message shape', async () => {
    const postRes = await injectWithAuth(server, {
      method: 'POST', url: '/api/waggle-dance/signal',
      headers: { 'content-type': 'application/json' },
      payload: {
        type: 'broadcast',
        subtype: 'discovery',
        senderId: 'claude-code-hook',
        content: { tool: 'claude-code', topic: 'rotation', importance: 'high' },
      },
    });
    const postedId = postRes.json().message.id;

    const getRes = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/waggle-dance/signals',
    });
    const signals = getRes.json().signals;
    const found = signals.find((s: { id: string }) => s.id === postedId);
    expect(found).toBeTruthy();
    expect(found.content.topic).toBe('rotation');
    expect(found.senderId).toBe('claude-code-hook');
    expect(found.teamId).toBe('personal::claude-code-hook');
  });
});
