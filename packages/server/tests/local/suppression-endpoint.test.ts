import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

/**
 * #7 sticky erasure — the re-consent surface. GET lists erased subjects on the
 * suppression list; POST /allow removes one so it may be re-imported again.
 */
describe('#7 suppression re-consent routes', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-suppression-ep-'));
    server = await buildLocalServer({ dataDir: tmpDir });
  });
  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists a suppressed subject after a subject-mode erase, then clears it on allow', async () => {
    // Subject-mode erase records the subject on the suppression list.
    const erase = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/memory/erase',
      payload: { source: 'chatgpt', sourceRef: 'thread-abc', reason: 'gdpr' },
    });
    expect(erase.statusCode).toBe(200);

    // GET lists it.
    const list1 = await injectWithAuth(server, { method: 'GET', url: '/api/memory/suppression' });
    expect(list1.statusCode).toBe(200);
    const body1 = list1.json() as { suppressed: Array<{ source: string; sourceRef: string }> };
    expect(body1.suppressed.some(s => s.source === 'chatgpt' && s.sourceRef === 'thread-abc')).toBe(true);

    // POST /allow re-consents (removes it).
    const allow = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/memory/suppression/allow',
      payload: { source: 'chatgpt', sourceRef: 'thread-abc' },
    });
    expect(allow.statusCode).toBe(200);
    expect((allow.json() as { removed: boolean }).removed).toBe(true);

    // GET no longer lists it.
    const list2 = await injectWithAuth(server, { method: 'GET', url: '/api/memory/suppression' });
    const body2 = list2.json() as { suppressed: Array<{ source: string; sourceRef: string }> };
    expect(body2.suppressed.some(s => s.source === 'chatgpt' && s.sourceRef === 'thread-abc')).toBe(false);

    // Allow again is idempotent (nothing to remove) but still 200.
    const allow2 = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/memory/suppression/allow',
      payload: { source: 'chatgpt', sourceRef: 'thread-abc' },
    });
    expect(allow2.statusCode).toBe(200);
    expect((allow2.json() as { removed: boolean }).removed).toBe(false);
  });

  it('rejects an allow request missing source/sourceRef', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/memory/suppression/allow',
      payload: { source: 'chatgpt' },
    });
    expect(res.statusCode).toBe(400);
  });
});
