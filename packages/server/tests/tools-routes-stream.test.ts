/**
 * AI-OS #4 — integration tests for GET /api/tools/stream + observe launch.
 *
 * Mocks the launcher (like tools-routes-launch.test.ts) so no real process
 * spawns; injects an observable handle so the output buffer is populated and
 * the SSE stream can replay it. The stream route ends synchronously for an
 * already-exited process, so fastify.inject resolves with the captured body.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { MindDB, FrameStore, SessionStore } from '@waggle/core';

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  return {
    ...actual,
    detectInstalledTools: vi.fn(async () => ({
      platform: process.platform,
      detectedAt: new Date().toISOString(),
      tools: [{
        id: 'claude-code',
        displayName: 'Claude Code',
        installed: true,
        installedPath: '/server-detected/claude-code',
        version: 'test',
        hooksInstalled: false,
        hookPointerPath: null,
      }],
    })),
    launchTool: vi.fn((opts: { id: string; installedPath: string }) => ({
      ok: true,
      pid: 99999,
      executed: { binary: opts.installedPath, args: [] },
    })),
  };
});

import { buildLocalServer } from '../src/local/index.js';
import { injectWithAuth } from './test-utils.js';
import { launchTool } from '@waggle/agent';

/** Controllable observable handle: capture the buffer's callbacks, drive them. */
function makeHandle() {
  let onData: ((c: string) => void) | undefined;
  let onExit: ((c: number | null) => void) | undefined;
  return {
    handle: {
      onData: (cb: (c: string) => void) => { onData = cb; },
      onExit: (cb: (c: number | null) => void) => { onExit = cb; },
    },
    emit: (c: string) => onData?.(c),
    end: (code: number | null) => onExit?.(code),
  };
}

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `waggle-stream-${prefix}-`));
}
function cleanup(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

describe('GET /api/tools/stream', () => {
  let server: FastifyInstance;
  let dir: string;

  beforeAll(async () => {
    dir = tmp('s');
    const mind = new MindDB(path.join(dir, 'personal.mind'));
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s = sessions.create('stream-test');
    frames.createIFrame(s.gop_id, 'stream seed', 'normal');
    mind.close();
    server = await buildLocalServer({ dataDir: dir });
    await server.ready();
  });

  afterAll(async () => {
    if (server) await server.close();
    if (dir) cleanup(dir);
  });

  it('400s on a missing/invalid pid', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/tools/stream?pid=abc' });
    expect(res.statusCode).toBe(400);
  });

  it('404s when the pid has no observed output buffer', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/tools/stream?pid=987654' });
    expect(res.statusCode).toBe(404);
  });

  it('observe launch attaches a buffer the stream replays as SSE', async () => {
    const f = makeHandle();
    const PID = 4242;
    vi.mocked(launchTool).mockReturnValueOnce({
      ok: true,
      pid: PID,
      executed: { binary: '/x', args: [] },
      output: f.handle,
    });
    const launch = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/launch',
      headers: { 'content-type': 'application/json' },
      payload: { id: 'claude-code', installedPath: '/x', observe: true },
    });
    expect(launch.statusCode).toBe(202);

    // Buffer is now attached; emit + exit so the stream takes the exited
    // path (replay + exit + end) and inject resolves.
    f.emit('building...\n');
    f.end(0);
    expect(server.toolOutputBuffer?.has(PID)).toBe(true);

    const stream = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/tools/stream?pid=${PID}`,
    });
    expect(stream.statusCode).toBe(200);
    expect(stream.headers['content-type']).toContain('text/event-stream');
    expect(stream.body).toContain('event: line');
    expect(stream.body).toContain('building...');
    expect(stream.body).toContain('event: exit');
  });
});
