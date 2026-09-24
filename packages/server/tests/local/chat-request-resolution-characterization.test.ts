/**
 * Characterization pin for the one request-resolution exit of POST /api/chat
 * that had no executing test (TD-CHAT-3 slice 15): a body carrying both
 * `session` and `sessionId` with different values. The other exits
 * (field validation, unknown workspace, viewer, path traversal, injection)
 * are pinned in chat-route-characterization, chat-request-fields and
 * chat-api.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter } from '../test-utils.js';
import {
  installFakeLlmProvider,
  markFakeProviderHealthy,
  type FakeLlmProvider,
} from '../helpers/fake-llm-provider.js';

describe('POST /api/chat request resolution (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let provider: FakeLlmProvider;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-request-resolution-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    // The real agent loop runs; the provider call is the sensing point (TD-CHAT-16).
    markFakeProviderHealthy(server);
    provider = installFakeLlmProvider({ respond: { type: 'text', content: 'resolved' } });
  });

  afterAll(async () => {
    provider.restore();
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* EBUSY on Windows */ }
  });

  it('refuses a body whose session and sessionId disagree, before the turn starts', async () => {
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'hello there', session: 'alpha', sessionId: 'beta' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: 'session and sessionId must match when both are provided',
      code: 'SESSION_ID_CONFLICT',
    });
    expect(provider.requests).toHaveLength(0);
  });

  it('accepts the same value under both names', async () => {
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'hello there', session: 'gamma', sessionId: 'gamma' },
    });
    expect(res.statusCode).toBe(200);
    expect(provider.requests).toHaveLength(1);
  });
});
