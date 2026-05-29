/**
 * Regression test for FINDING R6-001 (path traversal) —
 * POST /api/chat persists a per-session JSONL file whose path is built from the
 * `workspace` and `session` values taken from the REQUEST BODY. Without
 * validation, a crafted value like '../evil' escapes the sessions/ dir when
 * chat-persistence (persistMessage / loadSessionMessages) does
 *   path.join(dataDir, 'workspaces', workspaceId, 'sessions', `${sessionId}.jsonl`).
 *
 * The fix adds, at the top of the chat handler BEFORE reply.hijack() and before
 * any persistence runs:
 *   if (workspace) assertSafeSegment(workspace, 'workspace');
 *   if (session)   assertSafeSegment(session, 'session');
 * Fastify's default error handler converts the thrown { statusCode: 400 } into a
 * 400 response.
 *
 * This test uses the real wired server (buildLocalServer) so the actual route +
 * the real chat-persistence boundary are exercised. Echo mode is forced (LLM
 * provider unavailable + unreachable litellm URL) so a VALID request completes
 * and returns 200 rather than hanging on a live stream.
 *
 * Asserts:
 *   (a) a malicious `workspace` / `session` yields 400 and writes NOTHING
 *       outside the workspaces/sessions root, and
 *   (b) a normal valid `workspace`/`session` is NOT rejected (echo-mode 200) and
 *       the session file lands UNDER the workspaces root, as expected.
 *
 * Also unit-tests the raw chat-persistence path builder to make the escape that
 * the guard prevents concrete (a traversal segment lands outside the sessions
 * root when persistMessage runs unguarded).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, SessionStore, FrameStore } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';
import { persistMessage } from '../../src/local/routes/chat-persistence.js';

describe('R6-001 — POST /api/chat session-persistence path traversal guard', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-traversal-'));

    // Create personal.mind (required by buildLocalServer).
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('chat-traversal-test');
    frames.createIFrame(s1.gop_id, 'chat traversal test frame', 'normal');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });

    // Force echo mode so a VALID chat request completes instead of streaming
    // against a live LLM: mark the provider unavailable AND point the litellm
    // health probe at an unreachable port (mirrors sse-resilience.test.ts).
    (server as unknown as { agentState: { llmProvider: unknown } }).agentState.llmProvider = {
      provider: 'none', health: 'unavailable', detail: 'Test: force echo mode',
      checkedAt: new Date().toISOString(),
    };
    (server as unknown as { localConfig: { litellmUrl: string } }).localConfig.litellmUrl =
      'http://127.0.0.1:1';
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects a traversal `workspace` with 400 and writes nothing out of root', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'hello', workspace: '../evil', session: 'sess-1' },
    });

    expect(res.statusCode).toBe(400);

    // The escaped path would be <tmpDir>/evil/sessions/sess-1.jsonl (one level
    // up from <tmpDir>/workspaces). Confirm nothing landed outside the root.
    expect(fs.existsSync(path.join(tmpDir, 'evil'))).toBe(false);
  });

  it('rejects a traversal `session` with 400 and writes nothing out of root', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'hello', workspace: 'ws-ok', session: '../evil' },
    });

    expect(res.statusCode).toBe(400);

    // Escaped path would be <tmpDir>/workspaces/ws-ok/evil.jsonl (sibling of the
    // sessions/ dir). The sessions dir must NOT contain an escaped artifact.
    expect(fs.existsSync(path.join(tmpDir, 'workspaces', 'ws-ok', 'evil.jsonl'))).toBe(false);
  });

  it('rejects an encoded-traversal `workspace` with 400', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'hello', workspace: '..%2f..%2fevil', session: 'sess-2' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('does NOT reject a normal valid `workspace`/`session` (echo-mode 200)', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: { message: 'hello world', workspace: 'ws-valid', session: 'sess-valid' },
    });

    // Valid segments pass the guard; echo mode completes the stream → 200.
    expect(res.statusCode).not.toBe(400);
    expect(res.statusCode).toBe(200);

    // And the session file landed UNDER the workspaces root, as expected.
    const sessionFile = path.join(
      tmpDir, 'workspaces', 'ws-valid', 'sessions', 'sess-valid.jsonl',
    );
    expect(fs.existsSync(sessionFile)).toBe(true);
  });
});

// ── Boundary demonstration: the raw persistence escape the guard prevents ──
// chat-persistence joins the segments into an fs path with no validation of its
// own — so an unguarded traversal segment DOES escape the sessions root. This
// makes the vulnerability that the chat.ts guard closes concrete and proves the
// guard must live at the request boundary (chat-persistence trusts its inputs).
describe('R6-001 — chat-persistence trusts its path segments (guard rationale)', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-persist-escape-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persistMessage with a traversal workspaceId escapes the workspaces root (no guard)', () => {
    // Demonstrates the sink: without the chat.ts boundary guard, a '../evil'
    // workspace lands the file OUTSIDE <tmpDir>/workspaces.
    persistMessage(tmpDir, '../evil', 'sess', { role: 'user', content: 'pwned' });

    const escaped = path.join(tmpDir, 'evil', 'sessions', 'sess.jsonl');
    expect(fs.existsSync(escaped)).toBe(true);
    // Confirms the escape is real (one level up from the workspaces dir),
    // which is exactly what assertSafeSegment(workspace, 'workspace') blocks
    // before this function is ever reached on the /api/chat path.
  });

  it('a valid workspaceId stays under the workspaces root', () => {
    persistMessage(tmpDir, 'good-ws', 'sess', { role: 'user', content: 'ok' });
    const inside = path.join(tmpDir, 'workspaces', 'good-ws', 'sessions', 'sess.jsonl');
    expect(fs.existsSync(inside)).toBe(true);
  });
});
