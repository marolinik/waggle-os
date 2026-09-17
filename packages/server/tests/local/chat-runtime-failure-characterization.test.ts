/**
 * Characterization tests for the managed workspace chat-runtime construction
 * at `routes/chat.ts` (P4-03, docs/TESTING.md Safety Net Map).
 *
 * The seam here is FAULT INJECTION, not a fetch spy. The throw that ends this
 * block precedes every provider call, so no `globalThis.fetch` stub is ever
 * reached and the fetch-spy harness the rest of the chat suites use cannot
 * drive it. What drives it is a managed named workspace whose mind handle is
 * unavailable.
 *
 * `server.agentRunner` is deliberately LEFT UNSET in this file: the block is
 * gated on `!hasCustomRunner`, so the object seam every other characterization
 * file relies on would skip it entirely.
 *
 * These pin CURRENT behavior, not a specification. A bug found while pinning is
 * marked `QUIRK` and ledgered in docs/TECH-DEBT.md, never fixed here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { WaggleConfig } from '@waggle/core';
import { GENERATION_FAILED_PREFIX } from '@waggle/shared';
import { buildLocalServer } from '../../src/local/index.js';
import { loadSessionMessages } from '../../src/local/routes/chat-persistence.js';
import { injectWithAuth, resetRateLimiter } from '../test-utils.js';

/** Splits an SSE body into its `event:`/`data:` pairs. */
function parseSSE(raw: string): Array<{ event: string; data: string }> {
  const events: Array<{ event: string; data: string }> = [];
  for (const block of raw.split(/\n\n/).filter(Boolean)) {
    let event = '';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) data = line.slice(6);
    }
    if (event || data) events.push({ event, data });
  }
  return events;
}

describe('POST /api/chat workspace runtime construction (characterization)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let workspaceId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-chat-runtime-'));
    server = await buildLocalServer({ dataDir: tmpDir });
    // No `server.agentRunner`: the construction block is `!hasCustomRunner`
    // gated, so injecting a runner would skip the branch under test.
    server.vault.set('anthropic', 'sk-runtime-pin');
    server.agentState.llmProvider = {
      provider: 'anthropic-proxy',
      health: 'healthy',
      detail: 'test',
      checkedAt: new Date().toISOString(),
    };
    new WaggleConfig(tmpDir).save();
    workspaceId = server.workspaceManager.create({
      name: `runtime pin ${Date.now()}`,
      group: 'test',
      directory: tmpDir,
    }).id;
  });

  afterAll(async () => {
    await server.close();
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
  });

  it('fails the turn closed when the workspace mind is unavailable', async () => {
    // The request workspace has to equal the authorized one, or the route
    // pre-empts with a 409 `WORKSPACE_NOT_READY` long before this block.
    server.agentState.activeWorkspaceId = workspaceId;
    const realGetWorkspaceMindDb = server.agentState.getWorkspaceMindDb;
    // Convention 146: the swapped seam is restored on every exit path.
    server.agentState.getWorkspaceMindDb = () => null;

    const session = 'runtime-unavailable';
    let res: Awaited<ReturnType<typeof injectWithAuth>>;
    try {
      resetRateLimiter(server);
      res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'hello', workspace: workspaceId, session, model: 'claude-sonnet-4-6' },
      });
    } finally {
      server.agentState.getWorkspaceMindDb = realGetWorkspaceMindDb;
    }

    // The stream opened before the failure, so the transport is a 200 and the
    // failure is an SSE frame, not a status code.
    expect(res.statusCode).toBe(200);
    const events = parseSSE(res.body);
    const error = events.find(e => e.event === 'error');
    expect(error).toBeDefined();
    // Verbatim, and on `message` rather than `error`: the catch replaces the
    // internal cause with this sentence, so `Workspace mind is unavailable`
    // never reaches the client.
    expect(JSON.parse(error!.data)).toEqual({
      message: `Workspace "${workspaceId}" is not ready for chat.`,
    });
    // The failure is the WHOLE stream: no `step`, no `token`, no `done`.
    expect(events.map(e => e.event)).toEqual(['error']);

    // Absence pin 1: no GENERATION FAILED assistant turn is persisted. The
    // guard that would write one reads `activeHistory`, which is only assigned
    // further down the handler, so it is false on this path.
    const persisted = loadSessionMessages(tmpDir, workspaceId, session);
    expect(persisted.some(m => m.role === 'assistant')).toBe(false);
    expect(persisted.some(m => typeof m.content === 'string'
      && m.content.startsWith(GENERATION_FAILED_PREFIX))).toBe(false);

    // Absence pin 2: no raw-turn memory capture. The mind handle this turn
    // would have written through is exactly the one that was unavailable.
    expect(fs.existsSync(path.join(tmpDir, 'workspaces', workspaceId, 'mind.db'))).toBe(false);
  });

  it('reaches the model when the same workspace has its mind', async () => {
    // The sibling case, so the pin above witnesses the failure and not merely
    // an unreachable route. No seam is swapped here.
    server.agentState.activeWorkspaceId = workspaceId;
    resetRateLimiter(server);
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/chat',
      payload: {
        message: 'hello again',
        workspace: workspaceId,
        session: 'runtime-available',
        model: 'claude-sonnet-4-6',
      },
    });

    expect(res.statusCode).toBe(200);
    const events = parseSSE(res.body);
    const error = events.find(e => e.event === 'error');
    // Whatever this turn does next, it does NOT fail in runtime construction.
    expect(JSON.parse(error?.data ?? '{}').message)
      .not.toBe(`Workspace "${workspaceId}" is not ready for chat.`);
  });
});
