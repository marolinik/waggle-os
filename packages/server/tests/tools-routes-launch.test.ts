/**
 * AI-OS Phase 2A — integration tests for /api/tools/launch and
 * /api/tools/hooks.
 *
 * The launch + hook routes call into `@waggle/agent`'s launchTool /
 * runHookCommand. To keep these tests hermetic AND non-destructive
 * (`npx --yes @waggle/hive-mind-hooks-claude-code install` would
 * actually modify ~/.claude/settings.json on the test machine), we
 * mock the launcher module at the module level.
 *
 * The launcher unit tests (`packages/agent/tests/tool-launcher.test.ts`)
 * cover the actual spawn / exec paths with injected deps — this
 * file just verifies the route plumbing.
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
    launchTool: vi.fn((opts: { id: string; installedPath: string }) => ({
      ok: true,
      pid: 99999,
      executed: { binary: opts.installedPath, args: [] },
    })),
    runHookCommand: vi.fn(
      async (opts: { id: string; action: string }) => ({
        ok: true,
        action: opts.action,
        packageName: `@waggle/hive-mind-hooks-${opts.id}`,
        stdout: 'mock install output',
        stderr: '',
        code: 0,
      }),
    ),
  };
});

import { buildLocalServer } from '../src/local/index.js';
import { injectWithAuth } from './test-utils.js';
import { launchTool, runHookCommand } from '@waggle/agent';

function createTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `waggle-launch-${prefix}-`));
}

function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

describe('POST /api/tools/launch', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = createTmpDir('launch');
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s = sessions.create('launch-test');
    frames.createIFrame(s.gop_id, 'launch-test seed', 'normal');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });
    await server.ready();
  });

  afterAll(async () => {
    if (server) await server.close();
    if (tmpDir) cleanupDir(tmpDir);
  });

  it('launches a cohort tool with installedPath and returns 202 + pid', async () => {
    vi.mocked(launchTool).mockClear();
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/launch',
      headers: { 'content-type': 'application/json' },
      payload: {
        id: 'claude-code',
        installedPath: '/usr/local/bin/claude',
        workspaceId: 'ws-test',
      },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.pid).toBe(99999);
    expect(launchTool).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'claude-code',
        installedPath: '/usr/local/bin/claude',
        workspaceId: 'ws-test',
      }),
    );
  });

  it('rejects missing installedPath', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/launch',
      headers: { 'content-type': 'application/json' },
      payload: { id: 'claude-code' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unknown tool id', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/launch',
      headers: { 'content-type': 'application/json' },
      payload: { id: 'made-up-tool', installedPath: '/somewhere' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when launch fails (out-of-cohort)', async () => {
    vi.mocked(launchTool).mockReturnValueOnce({
      ok: false,
      pid: null,
      executed: { binary: '/somewhere', args: [] },
      error: 'outside cohort',
    });
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/launch',
      headers: { 'content-type': 'application/json' },
      payload: { id: 'hermes', installedPath: '/somewhere' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('outside cohort');
  });

  it('registers the spawned pid in the process tracker', async () => {
    // Use this test runner's pid as the spawned-pid stub — it is
    // guaranteed alive so the tracker's default liveness probe
    // (process.kill 0) doesn't GC the entry before we read it.
    const fakePid = process.pid;
    vi.mocked(launchTool).mockReturnValueOnce({
      ok: true,
      pid: fakePid,
      executed: { binary: '/somewhere', args: [] },
    });
    server.toolProcessTracker?.clear();
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/launch',
      headers: { 'content-type': 'application/json' },
      payload: {
        id: 'claude-code',
        installedPath: '/usr/local/bin/claude',
        workspaceId: 'ws-track',
      },
    });
    expect(res.statusCode).toBe(202);
    const tracked = server.toolProcessTracker?.list() ?? [];
    const match = tracked.find((p) => p.pid === fakePid);
    expect(match).toBeDefined();
    expect(match?.toolId).toBe('claude-code');
    expect(match?.workspaceId).toBe('ws-track');
  });
});

describe('GET /api/tools/processes', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = createTmpDir('processes');
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s = sessions.create('processes-test');
    frames.createIFrame(s.gop_id, 'processes-test seed', 'normal');
    mind.close();
    server = await buildLocalServer({ dataDir: tmpDir });
    await server.ready();
  });

  afterAll(async () => {
    if (server) await server.close();
    if (tmpDir) cleanupDir(tmpDir);
  });

  it('returns the tracked-and-alive process list', async () => {
    server.toolProcessTracker?.clear();
    // Use process.pid (this test runner) as a known-alive pid so the
    // tracker's default liveness probe doesn't GC the entry.
    server.toolProcessTracker?.register(process.pid, 'claude-code', 'ws-A');
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/tools/processes',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(1);
    expect(body.processes[0].pid).toBe(process.pid);
    expect(body.processes[0].toolId).toBe('claude-code');
  });

  it('returns an empty list when nothing is tracked', async () => {
    server.toolProcessTracker?.clear();
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/tools/processes',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ processes: [], total: 0 });
  });
});

describe('POST /api/tools/kill', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = createTmpDir('kill');
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s = sessions.create('kill-test');
    frames.createIFrame(s.gop_id, 'kill-test seed', 'normal');
    mind.close();
    server = await buildLocalServer({ dataDir: tmpDir });
    await server.ready();
  });

  afterAll(async () => {
    if (server) await server.close();
    if (tmpDir) cleanupDir(tmpDir);
  });

  it('rejects a pid we never tracked with 404 not-tracked', async () => {
    server.toolProcessTracker?.clear();
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/kill',
      headers: { 'content-type': 'application/json' },
      payload: { pid: 99999 },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().reason).toBe('not-tracked');
  });

  it('rejects malformed body (non-positive pid)', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/kill',
      headers: { 'content-type': 'application/json' },
      payload: { pid: -1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects missing pid', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/kill',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 + reason=already-dead when the tracked pid is already gone', async () => {
    // Use this test runner's pid + an injected isAlive=false would
    // require swapping the tracker entirely. Simpler: register a
    // synthetic pid that the default isAlive (process.kill 0) will
    // immediately fail on, so the route surfaces 'already-dead'.
    server.toolProcessTracker?.clear();
    const SYNTHETIC_DEAD_PID = 2147483646; // near max int32, very unlikely to be alive
    server.toolProcessTracker?.register(SYNTHETIC_DEAD_PID, 'claude-code');
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/kill',
      headers: { 'content-type': 'application/json' },
      payload: { pid: SYNTHETIC_DEAD_PID },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().reason).toBe('already-dead');
    expect(server.toolProcessTracker?.list().find((p) => p.pid === SYNTHETIC_DEAD_PID)).toBeUndefined();
  });
});

describe('POST /api/tools/hooks', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = createTmpDir('hooks');
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s = sessions.create('hooks-test');
    frames.createIFrame(s.gop_id, 'hooks-test seed', 'normal');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });
    await server.ready();
  });

  afterAll(async () => {
    if (server) await server.close();
    if (tmpDir) cleanupDir(tmpDir);
  });

  it('runs install action and returns 200 + stdout', async () => {
    vi.mocked(runHookCommand).mockClear();
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/hooks',
      headers: { 'content-type': 'application/json' },
      payload: { id: 'claude-code', action: 'install' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe('install');
    expect(body.stdout).toBe('mock install output');
    expect(runHookCommand).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'claude-code', action: 'install' }),
    );
  });

  it('forwards cliPath through to the launcher', async () => {
    vi.mocked(runHookCommand).mockClear();
    await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/hooks',
      headers: { 'content-type': 'application/json' },
      payload: {
        id: 'claude-code',
        action: 'install',
        cliPath: 'C:\\hive-mind-cli.js',
      },
    });
    expect(runHookCommand).toHaveBeenCalledWith(
      expect.objectContaining({ cliPath: 'C:\\hive-mind-cli.js' }),
    );
  });

  it.each(['install', 'verify', 'uninstall'])(
    'accepts action=%s',
    async (action) => {
      vi.mocked(runHookCommand).mockClear();
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/tools/hooks',
        headers: { 'content-type': 'application/json' },
        payload: { id: 'cursor', action },
      });
      expect(res.statusCode).toBe(200);
      expect(runHookCommand).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'cursor', action }),
      );
    },
  );

  it('rejects unknown action', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/hooks',
      headers: { 'content-type': 'application/json' },
      payload: { id: 'claude-code', action: 'destroy' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unknown tool id', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/hooks',
      headers: { 'content-type': 'application/json' },
      payload: { id: 'unknown-tool', action: 'install' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when the underlying command fails', async () => {
    vi.mocked(runHookCommand).mockResolvedValueOnce({
      ok: false,
      action: 'install',
      packageName: '@waggle/hive-mind-hooks-claude-code',
      stdout: '',
      stderr: 'permission denied writing settings.json',
      code: 1,
    });
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/hooks',
      headers: { 'content-type': 'application/json' },
      payload: { id: 'claude-code', action: 'install' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().stderr).toContain('permission denied');
  });
});
