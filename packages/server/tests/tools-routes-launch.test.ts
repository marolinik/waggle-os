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
