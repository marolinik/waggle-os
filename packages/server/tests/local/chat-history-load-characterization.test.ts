/**
 * Characterization tests for the chat turn's history load (TD-CHAT-3
 * slice 16).
 *
 * A structured retry is checked twice: against the cached history, then by
 * the atomic disk replacement. `chat-api.test.ts` pins the first refusal
 * (the cached tail is stale). This pins the second: the cached tail still
 * matches, but the saved transcript moved underneath it, so the replacement
 * refuses and the turn ends before the runner.
 *
 * These pin CURRENT behavior, not a specification.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { GENERATION_FAILED_PREFIX } from '@waggle/shared';
import { buildLocalServer } from '../../src/local/index.js';
import {
  chatSessionStateKey,
  loadSessionMessages,
  persistMessage,
} from '../../src/local/routes/chat-persistence.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';
import { installFakeLlmProvider } from '../helpers/fake-llm-provider.js';

describe('POST /api/chat history load (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-history-load-'));
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  it('refuses a structured retry when the saved transcript no longer matches the cached one', async () => {
    const workspaceId = server.workspaceManager.create({
      name: `History load retry ${Date.now()}`,
      group: 'test',
    }).id;
    const sessionId = `history-load-retry-${Date.now()}`;
    const message = 'Retry this turn.';
    const failedAssistant = `${GENERATION_FAILED_PREFIX}temporary failure`;
    persistMessage(tmpDir, workspaceId, sessionId, { role: 'user', content: message });
    persistMessage(tmpDir, workspaceId, sessionId, { role: 'assistant', content: failedAssistant });
    const stateKey = chatSessionStateKey(workspaceId, sessionId);
    const cached = loadSessionMessages(tmpDir, workspaceId, sessionId).map(entry => ({ ...entry }));
    server.agentState.sessionHistories.set(stateKey, cached.map(entry => ({ ...entry })));
    // Another writer appended to the transcript after it was cached.
    persistMessage(tmpDir, workspaceId, sessionId, { role: 'user', content: 'a later turn' });
    const sessionFile = path.join(tmpDir, 'workspaces', workspaceId, 'sessions', `${sessionId}.jsonl`);
    const diskBefore = fs.readFileSync(sessionFile);
    // The real agent loop is armed; the model must never be called (TD-CHAT-16).
    const provider = installFakeLlmProvider({ respond: { type: 'text', content: 'must not run' } });

    try {
      resetRateLimiter(server);
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: {
          message,
          workspace: workspaceId,
          session: sessionId,
          retry: true,
          retryTarget: {
            kind: 'assistant-pair',
            expectedMessageCount: 2,
            expectedAssistantContent: failedAssistant,
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const events = parseSSE(response.body);
      expect(events.map(e => e.event)).toEqual(['error']);
      expect(JSON.parse(events[0]!.data)).toEqual({
        message: 'Retry could not safely replace this conversation. Reload and try again.',
        code: 'RETRY_TARGET_STALE',
      });
      expect(provider.requests).toHaveLength(0);
      // Neither copy of the conversation changed.
      expect(fs.readFileSync(sessionFile)).toEqual(diskBefore);
      expect(server.agentState.sessionHistories.get(stateKey)).toEqual(cached);
    } finally {
      provider.restore();
      server.agentState.sessionHistories.delete(stateKey);
    }
  });
});
