/**
 * Characterization tests for the "agent finished" notification a successful
 * chat turn emits (TD-CHAT-12).
 *
 * The notification is persisted to the inbox and broadcast as a toast. These
 * pins read it back through `GET /api/notifications`, the surface the client
 * polls, for an interactive turn and for an automation turn.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';
import {
  installFakeLlmProvider,
  markFakeProviderHealthy,
  type FakeLlmProvider,
} from '../helpers/fake-llm-provider.js';

describe('POST /api/chat finished-turn notification (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let provider: FakeLlmProvider;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-turn-notification-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    // The real agent loop runs; only the model call is scripted (TD-CHAT-16).
    markFakeProviderHealthy(server);
    provider = installFakeLlmProvider({
      respond: { type: 'text', content: 'Here is the answer.', usage: { inputTokens: 5, outputTokens: 5 } },
    });
  });

  afterAll(async () => {
    provider.restore();
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  async function finishedNotificationsAfter(payload: Record<string, unknown>): Promise<string[]> {
    const before = await listFinished();
    const requestsBefore = provider.requests.length;
    resetRateLimiter(server);
    const res = await injectWithAuth(server, { method: 'POST', url: '/api/chat', payload });
    expect(res.statusCode).toBe(200);
    expect(parseSSE(res.body).some(e => e.event === 'done')).toBe(true);
    // The model was reached: the setup-required reply also streams a done.
    expect(provider.requests.length).toBe(requestsBefore + 1);
    const after = await listFinished();
    return after.slice(0, after.length - before.length);
  }

  async function listFinished(): Promise<string[]> {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/notifications?limit=500' });
    const body = res.json() as { notifications: Array<{ title: string }> };
    return body.notifications.map(n => n.title).filter(title => title.includes(' finished in '));
  }

  it('does not notify after an interactive turn, whose answer is already on screen', async () => {
    const added = await finishedNotificationsAfter({ message: 'What is on my plate?', session: 'notify-interactive' });
    // Until TD-CHAT-12 every interactive reply also wrote an inbox entry.
    expect(added).toEqual([]);
  });

  it('notifies after an automation turn', async () => {
    const added = await finishedNotificationsAfter({
      message: 'Daily digest', session: 'notify-automation', origin: 'automation',
    });
    expect(added).toEqual(['Agent finished in Default Workspace']);
  });
});
