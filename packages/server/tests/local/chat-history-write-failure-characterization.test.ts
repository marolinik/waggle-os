/**
 * Characterization tests for a chat-history write that fails on the turn
 * path (TD-CHAT-14, TD-CHAT-21 residual).
 *
 * `persistMessage` is replaced through a module mock so the failure is the
 * same on every platform: a read-only directory does not stop writes on
 * Windows. The injected error has the shape Node's fs gives: a message naming
 * the absolute file, plus `code`, `syscall` and `path`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/** Which persistMessage call of the next turn throws (1-based); 0 = none. */
const persistence = vi.hoisted(() => ({ failOnCall: 0, calls: 0 }));
const LEAKED_PATH = path.join('C:', 'Users', 'someone', 'AppData', 'waggle', 'sessions', 'secret-session.jsonl');

vi.mock('../../src/local/routes/chat-persistence.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/local/routes/chat-persistence.js')>();
  return {
    ...actual,
    persistMessage: (...args: Parameters<typeof actual.persistMessage>) => {
      persistence.calls += 1;
      if (persistence.calls === persistence.failOnCall) {
        throw Object.assign(new Error(`EACCES: permission denied, open '${LEAKED_PATH}'`), {
          code: 'EACCES', syscall: 'open', path: LEAKED_PATH,
        });
      }
      return actual.persistMessage(...args);
    },
  };
});

import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth, resetRateLimiter, parseSSE } from '../test-utils.js';

describe('POST /api/chat history write failure (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-history-write-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    server.agentRunner = async (_config: AgentLoopConfig): Promise<AgentResponse> => ({
      content: 'unreachable', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 },
    });
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  async function turnFailingPersistCall(message: string, session: string, failOnCall: number) {
    persistence.calls = 0;
    persistence.failOnCall = failOnCall;
    try {
      resetRateLimiter(server);
      const res = await injectWithAuth(server, { method: 'POST', url: '/api/chat', payload: { message, session } });
      expect(res.statusCode).toBe(200);
      return parseSSE(res.body).filter(e => e.event === 'error').map(e => JSON.parse(e.data) as Record<string, unknown>);
    } finally {
      persistence.failOnCall = 0;
    }
  }

  it('QUIRK (TD-CHAT-14): sends the raw fs error, absolute path included, to the client', async () => {
    const errors = await turnFailingPersistCall('Keep this one please', 'history-write-fail', 1);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain(LEAKED_PATH);
  });

  it('QUIRK (TD-CHAT-21): a slash-command reply whose persist fails also sends the raw fs error', async () => {
    // Call 1 persists the user's turn; call 2 is streamCannedReply persisting
    // the command's answer.
    const errors = await turnFailingPersistCall('/status', 'history-write-fail-command', 2);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain(LEAKED_PATH);
  });
});
