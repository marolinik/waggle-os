/**
 * Characterization tests for POST /api/chat request validation.
 *
 * These pin CURRENT behavior of branches the existing chat suites did not
 * reach (coverage run 2026-09-14, docs/TESTING.md Safety Net Map). They are
 * not a spec: if one fails after a refactor, the refactor changed behavior.
 * Bugs found while pinning are recorded in docs/TECH-DEBT.md, never fixed here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AgentLoopConfig, AgentResponse } from '@waggle/agent';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth } from '../test-utils.js';

describe('POST /api/chat request validation (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let runnerCalls = 0;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-char-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    // Object seam: the route reads server.agentRunner; a rejected request must
    // never reach it, so the counter doubles as a sensing point.
    server.agentRunner = async (_config: AgentLoopConfig): Promise<AgentResponse> => {
      runnerCalls += 1;
      return { content: 'unreachable', toolsUsed: [], usage: { inputTokens: 1, outputTokens: 1 } };
    };
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  async function post(payload: Record<string, unknown>) {
    const res = await injectWithAuth(server, { method: 'POST', url: '/api/chat', payload });
    return { status: res.statusCode, body: res.json() as { error?: string; code?: string } };
  }

  it('rejects a non-boolean retry flag', async () => {
    const { status, body } = await post({ message: 'hi', retry: 'yes' });
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'retry must be a boolean', code: 'INVALID_FIELD_TYPE' });
  });

  it.each([
    ['string', 'tail'],
    ['array', [1]],
    ['missing expectedMessageCount', { kind: 'lone-user' }],
    ['zero expectedMessageCount', { kind: 'lone-user', expectedMessageCount: 0 }],
    ['non-integer expectedMessageCount', { kind: 'lone-user', expectedMessageCount: 1.5 }],
    ['unknown kind', { kind: 'other', expectedMessageCount: 1 }],
    ['lone-user with extra key', { kind: 'lone-user', expectedMessageCount: 1, extra: true }],
    ['assistant-pair without content', { kind: 'assistant-pair', expectedMessageCount: 2 }],
    ['assistant-pair with non-string content', { kind: 'assistant-pair', expectedMessageCount: 2, expectedAssistantContent: 5 }],
  ])('rejects a malformed retryTarget (%s)', async (_label, retryTarget) => {
    const { status, body } = await post({ message: 'hi', retry: true, retryTarget });
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'retryTarget is invalid', code: 'INVALID_RETRY_TARGET' });
  });

  it.each([
    ['lone-user', { kind: 'lone-user', expectedMessageCount: 1 }],
    ['assistant-pair', { kind: 'assistant-pair', expectedMessageCount: 2, expectedAssistantContent: 'prior' }],
  ])('rejects a well-formed %s retryTarget when retry is not true', async (_label, retryTarget) => {
    const { status, body } = await post({ message: 'hi', retryTarget });
    expect(status).toBe(400);
    expect(body).toEqual({ error: 'retryTarget requires retry: true', code: 'INVALID_RETRY_TARGET' });
  });

  it.each([
    ['workspace', { workspace: 123 }],
    ['workspaceId', { workspaceId: { id: 'x' } }],
    ['session', { session: false }],
    ['sessionId', { sessionId: ['a'] }],
  ])('rejects a non-string %s segment', async (field, extra) => {
    const { status, body } = await post({ message: 'hi', ...extra });
    expect(status).toBe(400);
    expect(body).toEqual({ error: `${field} must be a string`, code: 'INVALID_FIELD_TYPE' });
  });

  it.each(['workspace', 'workspaceId', 'session', 'sessionId'])(
    'rejects a %s segment longer than 200 chars',
    async (field) => {
      const { status, body } = await post({ message: 'hi', [field]: 'a'.repeat(201) });
      expect(status).toBe(400);
      expect(body).toEqual({ error: `${field} is too long (max 200 chars)`, code: 'INVALID_FIELD_LENGTH' });
    },
  );

  it('accepts a 200-char segment (boundary) and proceeds to the SSE turn', async () => {
    // 200 'a's is a safe segment: the length gate passes and the turn streams.
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'hi', session: 'a'.repeat(200) },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
  });

  it('never invokes the agent runner for a rejected request', () => {
    // Every rejection above ran before the runner seam; the boundary test is the
    // only request that reached it.
    expect(runnerCalls).toBe(1);
  });
});
