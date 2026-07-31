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
import { once } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { MindDB, FrameStore, SessionStore } from '@waggle/core';

vi.mock('@waggle/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@waggle/agent')>();
  const builtinsOnly = actual.getToolRegistry({
    dir: '/no-adapters',
    readDir: () => [],
    readFile: () => '',
  });
  const thirdPartyAdapter = {
    id: 'foo-cli',
    displayName: 'Foo CLI',
    launchable: true,
    hookCapable: false,
    hookPointer: '.foo/hive-mind-install.json',
    detect: { kind: 'path' as const, binaryName: 'foo' },
    promptArgTemplate: ['--print', '{prompt}'],
    builtin: false,
  };
  return {
    ...actual,
    getToolRegistry: vi.fn(() => [...builtinsOnly, thirdPartyAdapter]),
    detectInstalledTools: vi.fn(async () => ({
      platform: process.platform,
      detectedAt: new Date().toISOString(),
      tools: [...builtinsOnly, thirdPartyAdapter].map((manifest) => ({
        id: manifest.id,
        displayName: manifest.displayName,
        installed: true,
        installedPath: `/server-detected/${manifest.id}`,
        version: 'test',
        hooksInstalled: false,
        hookPointerPath: null,
      })),
    })),
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
import { detectInstalledTools, launchTool, runHookCommand } from '@waggle/agent';
import { loopbackSidecarUrl } from '../src/local/routes/tools.js';
import { resolveWorkspaceExecutionRoot } from '../src/local/workspace-execution-root.js';

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

function spawnSleeper(): ChildProcess {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: 'ignore',
  });
  if (child.pid == null) throw new Error('test sleeper did not start');
  return child;
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill();
  await once(child, 'exit');
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('POST /api/tools/launch', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let workspaceId: string;

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
    workspaceId = server.workspaceManager.getDefault() ?? server.workspaceManager.list()[0]!.id;
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
        installedPath: '/attacker/controlled/claude',
        workspaceId,
      },
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.pid).toBe(99999);
    expect(launchTool).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'claude-code',
        installedPath: '/server-detected/claude-code',
        workspaceId,
        dataDir: tmpDir,
        runId: expect.stringMatching(/^run_/),
        roomId: expect.stringMatching(/^room_/),
        runToken: expect.any(String),
      }),
    );
    expect(body.roomId).toMatch(/^room_/);
    expect(body.runId).toMatch(/^run_/);
    expect(server.agentRunRegistry.get(body.runId)).toMatchObject({
      roomId: body.roomId,
      workspaceId,
      status: 'running',
      executor: { pid: 99999 },
    });
  });

  it('settles an observed process from its exit event without polling the process route', async () => {
    vi.mocked(launchTool).mockClear();
    const exitListeners: Array<(code: number | null) => void> = [];
    vi.mocked(launchTool).mockReturnValueOnce({
      ok: true,
      pid: 876543,
      executed: { binary: '/server-detected/claude-code', args: [] },
      output: {
        onData: () => {},
        onExit: (listener) => { exitListeners.push(listener); },
      },
    });
    const response = await injectWithAuth(server, {
      method: 'POST', url: '/api/tools/launch',
      headers: { 'content-type': 'application/json' },
      payload: {
        id: 'claude-code', installedPath: '/usr/local/bin/claude', workspaceId,
        observe: true,
      },
    });
    const body = response.json() as { runId: string };
    const call = vi.mocked(launchTool).mock.calls[0][0] as { runToken?: string };
    expect(server.agentRunRegistry.authenticateCredential(call.runToken ?? '')?.id).toBe(body.runId);

    for (const listener of exitListeners) listener(0);

    expect(server.agentRunRegistry.get(body.runId)).toMatchObject({
      status: 'completed', result: { summary: 'Interactive tool process exited successfully' },
    });
    expect(server.agentRunRegistry.authenticateCredential(call.runToken ?? '')).toBeUndefined();
  });

  it('passes signalEmit:true so a dock launch lights the bus (#1)', async () => {
    vi.mocked(launchTool).mockClear();
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/launch',
      headers: { 'content-type': 'application/json' },
      payload: { id: 'claude-code', installedPath: '/usr/local/bin/claude' },
    });
    expect(res.statusCode).toBe(202);
    expect(launchTool).toHaveBeenCalledWith(
      expect.objectContaining({ signalEmit: true }),
    );
    // sidecarUrl is derived from the loopback host fastify.inject used,
    // so it is either undefined (non-loopback authority) or an
    // http://<loopback> string — never a non-loopback origin.
    const callArg = vi.mocked(launchTool).mock.calls[0][0] as { sidecarUrl?: string };
    if (callArg.sidecarUrl !== undefined) {
      expect(callArg.sidecarUrl).toMatch(/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]|::1)(:\d+)?$/i);
    }
  });

  it('does not require or trust a client-supplied executable path', async () => {
    vi.mocked(launchTool).mockClear();
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/launch',
      headers: { 'content-type': 'application/json' },
      payload: { id: 'claude-code' },
    });
    expect(res.statusCode).toBe(202);
    expect(launchTool).toHaveBeenLastCalledWith(
      expect.objectContaining({ installedPath: '/server-detected/claude-code' }),
    );
  });

  it('rejects a dynamically blocked executable before creating a run or process', async () => {
    vi.mocked(launchTool).mockClear();
    const runCountBefore = server.agentRunRegistry.snapshot().runs.length;
    vi.mocked(detectInstalledTools).mockResolvedValueOnce({
      platform: 'win32',
      detectedAt: new Date().toISOString(),
      tools: [{
        id: 'codex', displayName: 'Codex CLI', installed: true,
        installedPath: 'C:\\Program Files\\WindowsApps\\OpenAI.Codex\\resources\\codex.exe',
        version: null, hooksInstalled: false, hookPointerPath: null,
        launchable: false, diagnostic: 'The Store resource CLI cannot launch outside its package.',
      }],
    });

    const response = await injectWithAuth(server, {
      method: 'POST', url: '/api/tools/launch',
      headers: { 'content-type': 'application/json' },
      payload: { id: 'codex', workspaceId },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'tool_not_launchable',
      toolId: 'codex',
      message: 'The Store resource CLI cannot launch outside its package.',
    });
    expect(launchTool).not.toHaveBeenCalled();
    expect(server.agentRunRegistry.snapshot().runs).toHaveLength(runCountBefore);
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

  it('launches a registered third-party adapter and applies its prompt template', async () => {
    vi.mocked(launchTool).mockClear();
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/launch',
      headers: { 'content-type': 'application/json' },
      payload: {
        id: 'foo-cli',
        installedPath: '/server-detected/foo-cli',
        prompt: 'summarize this workspace',
      },
    });
    expect(res.statusCode).toBe(202);
    expect(launchTool).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'foo-cli',
        installedPath: '/server-detected/foo-cli',
        args: ['--print', 'summarize this workspace'],
      }),
    );
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

  it('terminates a spawned process and settles the run when bookkeeping throws', async () => {
    vi.mocked(launchTool).mockClear();
    const sleeper = spawnSleeper();
    const update = vi.spyOn(server.agentRunRegistry, 'update');
    update.mockImplementationOnce(() => {
      throw new Error('simulated registry persistence failure');
    });
    vi.mocked(launchTool).mockReturnValueOnce({
      ok: true,
      pid: sleeper.pid!,
      executed: { binary: '/server-detected/claude-code', args: [] },
    });
    const workerIdsBefore = new Set(
      server.agentRunRegistry
        .list({ workspaceId, source: 'external_tool', limit: 1_000 })
        .filter((run) => run.kind === 'worker')
        .map((run) => run.id),
    );

    try {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/tools/launch',
        headers: { 'content-type': 'application/json' },
        payload: { id: 'claude-code', workspaceId },
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toMatchObject({
        ok: false,
        error: 'tool_launch_failed',
      });
      await vi.waitFor(() => {
        expect(sleeper.exitCode !== null || sleeper.signalCode !== null).toBe(true);
      });
      expect(server.toolProcessTracker?.list().some(({ pid }) => pid === sleeper.pid)).toBe(false);
      const failedWorker = server.agentRunRegistry
        .list({ workspaceId, source: 'external_tool', limit: 1_000 })
        .find((run) => run.kind === 'worker' && !workerIdsBefore.has(run.id));
      expect(failedWorker).toMatchObject({ kind: 'worker', status: 'failed' });
    } finally {
      update.mockRestore();
      await stopChild(sleeper);
      await injectWithAuth(server, { method: 'GET', url: '/api/tools/processes' });
    }
  });

  it('registers the spawned pid in the process tracker', async () => {
    const sleeper = spawnSleeper();
    try {
      const fakePid = sleeper.pid!;
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
          installedPath: '/server-detected/claude-code',
          workspaceId,
        },
      });
      expect(res.statusCode).toBe(202);
      const tracked = server.toolProcessTracker?.list() ?? [];
      const match = tracked.find((p) => p.pid === fakePid);
      expect(match).toBeDefined();
      expect(match?.toolId).toBe('claude-code');
      expect(match?.workspaceId).toBe(workspaceId);
    } finally {
      await stopChild(sleeper);
      await injectWithAuth(server, { method: 'GET', url: '/api/tools/processes' });
    }
  });

  it('keeps explicit cancellation authoritative when reconciliation observes process exit first', async () => {
    vi.mocked(launchTool).mockClear();
    const sleeper = spawnSleeper();
    vi.mocked(launchTool).mockReturnValueOnce({
      ok: true,
      pid: sleeper.pid!,
      executed: { binary: '/server-detected/claude-code', args: [] },
    });
    const launched = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/launch',
      headers: { 'content-type': 'application/json' },
      payload: { id: 'claude-code', workspaceId },
    });
    expect(launched.statusCode).toBe(202);
    const { runId } = launched.json() as { runId: string };

    const killStarted = deferred();
    const allowKillToSettle = deferred();
    const kill = vi.spyOn(server.toolProcessTracker!, 'kill').mockImplementationOnce(async (pid) => {
      killStarted.resolve();
      await allowKillToSettle.promise;
      return { ok: true, pid, reason: 'sigterm-ok' };
    });
    let killRequest: ReturnType<typeof injectWithAuth> | undefined;

    try {
      killRequest = injectWithAuth(server, {
        method: 'POST',
        url: '/api/tools/kill',
        headers: { 'content-type': 'application/json' },
        payload: { pid: sleeper.pid },
      });
      await killStarted.promise;
      await stopChild(sleeper);
      await injectWithAuth(server, { method: 'GET', url: '/api/tools/processes' });

      expect(server.agentRunRegistry.get(runId)?.status).toBe('cancelled');
      allowKillToSettle.resolve();
      expect((await killRequest).statusCode).toBe(200);
      expect(server.agentRunRegistry.get(runId)?.status).toBe('cancelled');
    } finally {
      allowKillToSettle.resolve();
      if (killRequest) await killRequest;
      kill.mockRestore();
      await stopChild(sleeper);
      await injectWithAuth(server, { method: 'GET', url: '/api/tools/processes' });
    }
  });

  it.each(['route', 'registry'] as const)(
    'keeps cancellation intent while %s termination remains ambiguous',
    async (surface) => {
      vi.mocked(launchTool).mockClear();
      const sleeper = spawnSleeper();
      vi.mocked(launchTool).mockReturnValueOnce({
        ok: true,
        pid: sleeper.pid!,
        executed: { binary: '/server-detected/claude-code', args: [] },
      });
      const launched = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/tools/launch',
        headers: { 'content-type': 'application/json' },
        payload: { id: 'claude-code', workspaceId },
      });
      expect(launched.statusCode).toBe(202);
      const { runId } = launched.json() as { runId: string };
      const kill = vi.spyOn(server.toolProcessTracker!, 'kill').mockResolvedValueOnce({
        ok: false,
        pid: sleeper.pid!,
        reason: 'sigterm-failed-sigkill-failed',
      });

      try {
        if (surface === 'route') {
          const response = await injectWithAuth(server, {
            method: 'POST',
            url: '/api/tools/kill',
            headers: { 'content-type': 'application/json' },
            payload: { pid: sleeper.pid },
          });
          expect(response.statusCode).toBe(500);
        } else {
          await expect(server.agentRunRegistry.control(runId, 'cancel')).rejects.toThrow(
            `Could not stop process ${sleeper.pid}`,
          );
        }

        await stopChild(sleeper);
        await injectWithAuth(server, { method: 'GET', url: '/api/tools/processes' });
        expect(server.agentRunRegistry.get(runId)?.status).toBe('cancelled');
      } finally {
        kill.mockRestore();
        await stopChild(sleeper);
        await injectWithAuth(server, { method: 'GET', url: '/api/tools/processes' });
      }
    },
  );

  it('keeps the workspace leased when the registry becomes terminal before the process exits', async () => {
    vi.mocked(launchTool).mockClear();
    const sleeper = spawnSleeper();
    vi.mocked(launchTool).mockReturnValueOnce({
      ok: true,
      pid: sleeper.pid!,
      executed: { binary: '/server-detected/claude-code', args: [] },
    });

    try {
      const launched = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/tools/launch',
        headers: { 'content-type': 'application/json' },
        payload: { id: 'claude-code', workspaceId },
      });
      expect(launched.statusCode).toBe(202);
      const { runId } = launched.json() as { runId: string };
      server.agentRunRegistry.update(runId, {
        status: 'completed',
        result: { summary: 'Premature terminal registry state' },
      });

      await injectWithAuth(server, { method: 'GET', url: '/api/tools/processes' });
      const launchCallsBeforeCompeting = vi.mocked(launchTool).mock.calls.length;
      const competing = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/tools/launch',
        headers: { 'content-type': 'application/json' },
        payload: { id: 'hermes', workspaceId },
      });

      expect(competing.statusCode).toBe(409);
      expect(competing.json()).toMatchObject({ error: 'workspace_busy', workspaceId });
      expect(launchTool).toHaveBeenCalledTimes(launchCallsBeforeCompeting);
    } finally {
      await stopChild(sleeper);
      await injectWithAuth(server, { method: 'GET', url: '/api/tools/processes' });
    }
  });

  it('rejects a second interactive agent until the first releases the same workspace checkout', async () => {
    vi.mocked(launchTool).mockClear();
    const sleeper = spawnSleeper();
    try {
      const exitListeners: Array<(code: number | null) => void> = [];
      vi.mocked(launchTool).mockReturnValueOnce({
        ok: true,
        pid: sleeper.pid!,
        executed: { binary: '/server-detected/claude-code', args: [] },
        output: {
          onData: () => {},
          onExit: (listener) => { exitListeners.push(listener); },
        },
      });

      const first = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/tools/launch',
        headers: { 'content-type': 'application/json' },
        payload: {
          id: 'claude-code',
          workspaceId,
          observe: true,
        },
      });
      expect(first.statusCode).toBe(202);

      const workspace = server.workspaceManager.get(workspaceId)!;
      const workspaceRoot = resolveWorkspaceExecutionRoot(tmpDir, workspace);
      const queuedScope = server.agentState.workspaceTurnCoordinator.createScope(workspaceRoot);
      let queuedScopeAcquired = false;
      const queuedAcquire = queuedScope.acquire('write').then(() => {
        queuedScopeAcquired = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(queuedScopeAcquired).toBe(false);

      const runCountBeforeCompeting = server.agentRunRegistry.snapshot().runs.length;
      const processCountBeforeCompeting = server.toolProcessTracker?.list().length;
      const competing = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/tools/launch',
        headers: { 'content-type': 'application/json' },
        payload: {
          id: 'hermes',
          workspaceId,
        },
      });
      expect(competing.statusCode).toBe(409);
      expect(competing.json()).toMatchObject({
        error: 'workspace_busy',
        workspaceId,
      });
      expect(launchTool).toHaveBeenCalledTimes(1);
      expect(server.agentRunRegistry.snapshot().runs).toHaveLength(runCountBeforeCompeting);
      expect(server.toolProcessTracker?.list()).toHaveLength(processCountBeforeCompeting ?? 0);

      await stopChild(sleeper);
      for (const listener of exitListeners) listener(0);
      await queuedAcquire;
      expect(queuedScopeAcquired).toBe(true);
      await queuedScope.release();

      vi.mocked(launchTool).mockReturnValueOnce({
        ok: true,
        pid: null,
        executed: { binary: '/server-detected/hermes', args: [] },
      });
      const afterRelease = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/tools/launch',
        headers: { 'content-type': 'application/json' },
        payload: {
          id: 'hermes',
          workspaceId,
        },
      });
      expect(afterRelease.statusCode).toBe(500);
      expect(afterRelease.json()).toMatchObject({
        ok: false,
        error: 'tool_launch_missing_pid',
      });
      expect(launchTool).toHaveBeenCalledTimes(2);
    } finally {
      await stopChild(sleeper);
      await injectWithAuth(server, { method: 'GET', url: '/api/tools/processes' });
    }
  });

  it('serializes aliases of one physical root but permits a different checkout', async () => {
    vi.mocked(launchTool).mockClear();
    const rootA = fs.mkdtempSync(path.join(tmpDir, 'interactive-root-a-'));
    const rootB = fs.mkdtempSync(path.join(tmpDir, 'interactive-root-b-'));
    const workspaceA = server.workspaceManager.create({
      name: `Interactive root A ${Date.now()}`,
      group: 'test',
      directory: rootA,
    });
    const workspaceAlias = server.workspaceManager.create({
      name: `Interactive root A alias ${Date.now()}`,
      group: 'test',
      directory: path.join(rootA, '.'),
    });
    const workspaceB = server.workspaceManager.create({
      name: `Interactive root B ${Date.now()}`,
      group: 'test',
      directory: rootB,
    });
    const sleeperA = spawnSleeper();
    const sleeperB = spawnSleeper();

    try {
      vi.mocked(launchTool)
        .mockReturnValueOnce({
          ok: true,
          pid: sleeperA.pid!,
          executed: { binary: '/server-detected/claude-code', args: [] },
        })
        .mockReturnValueOnce({
          ok: true,
          pid: sleeperB.pid!,
          executed: { binary: '/server-detected/hermes', args: [] },
        });

      const first = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/tools/launch',
        headers: { 'content-type': 'application/json' },
        payload: { id: 'claude-code', workspaceId: workspaceA.id },
      });
      expect(first.statusCode).toBe(202);

      const alias = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/tools/launch',
        headers: { 'content-type': 'application/json' },
        payload: { id: 'hermes', workspaceId: workspaceAlias.id },
      });
      expect(alias.statusCode).toBe(409);
      expect(alias.json()).toMatchObject({
        error: 'workspace_busy',
        workspaceId: workspaceAlias.id,
      });

      const differentRoot = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/tools/launch',
        headers: { 'content-type': 'application/json' },
        payload: { id: 'hermes', workspaceId: workspaceB.id },
      });
      expect(differentRoot.statusCode).toBe(202);
      expect(launchTool).toHaveBeenCalledTimes(2);
    } finally {
      await Promise.all([stopChild(sleeperA), stopChild(sleeperB)]);
      await injectWithAuth(server, { method: 'GET', url: '/api/tools/processes' });
      fs.rmSync(rootA, { recursive: true, force: true });
      fs.rmSync(rootB, { recursive: true, force: true });
    }
  });

  it('shares the same nonblocking checkout lease with chat and worker execution', async () => {
    vi.mocked(launchTool).mockClear();
    const workspace = server.workspaceManager.get(workspaceId)!;
    const workspaceRoot = resolveWorkspaceExecutionRoot(tmpDir, workspace);
    const competingScope = server.agentState.workspaceTurnCoordinator.createScope(workspaceRoot);
    await competingScope.acquire('write');
    const runCountBefore = server.agentRunRegistry.snapshot().runs.length;

    try {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/tools/launch',
        headers: { 'content-type': 'application/json' },
        payload: {
          id: 'claude-code',
          workspaceId,
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        error: 'workspace_busy',
        workspaceId,
      });
      expect(launchTool).not.toHaveBeenCalled();
      expect(server.agentRunRegistry.snapshot().runs).toHaveLength(runCountBefore);
    } finally {
      await competingScope.release();
    }
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

  it('rejects a client-supplied CLI path instead of executing it', async () => {
    vi.mocked(runHookCommand).mockClear();
    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/hooks',
      headers: { 'content-type': 'application/json' },
      payload: {
        id: 'claude-code',
        action: 'install',
        cliPath: 'C:\\hive-mind-cli.js',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(runHookCommand).not.toHaveBeenCalled();
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

  it('returns 503 when the packaged hook runtime is missing', async () => {
    vi.mocked(runHookCommand).mockResolvedValueOnce({
      ok: false,
      action: 'install',
      packageName: '@waggle/hive-mind-hooks-claude-code',
      stdout: '', stderr: '', code: -1,
      errorCode: 'hook_runtime_missing',
      error: 'runtime missing',
    });
    const res = await injectWithAuth(server, {
      method: 'POST', url: '/api/tools/hooks',
      headers: { 'content-type': 'application/json' },
      payload: { id: 'claude-code', action: 'install' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().errorCode).toBe('hook_runtime_missing');
  });
});

// ── loopbackSidecarUrl helper (#1) ──────────────────────────────────

describe('loopbackSidecarUrl', () => {
  it.each([
    ['127.0.0.1:3333', 'http://127.0.0.1:3333'],
    ['localhost', 'http://localhost'],
    ['localhost:8080', 'http://localhost:8080'],
    ['[::1]:3000', 'http://[::1]:3000'],
  ])('maps loopback host %s → %s', (host, expected) => {
    expect(loopbackSidecarUrl(host)).toBe(expected);
  });

  it.each([
    undefined,
    '',
    'evil.com',
    '10.0.0.5:3333',
    'example.com:80',
    '169.254.1.1',
    '::1', // bare (unbracketed) IPv6 → rejected; would be a malformed URL
  ])('returns undefined for non-loopback / missing host %s', (host) => {
    expect(loopbackSidecarUrl(host as string | undefined)).toBeUndefined();
  });
});

// ── persistence + reconcile across sidecar restart (#2) ─────────────

describe('POST /api/tools/launch — persistence + reconcile', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = createTmpDir('persist');
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s = sessions.create('persist-test');
    frames.createIFrame(s.gop_id, 'persist-test seed', 'normal');
    mind.close();
  });

  afterAll(() => {
    if (tmpDir) cleanupDir(tmpDir);
  });

  it('rebinds cancel control for an alive detached process after restart', async () => {
    const child = spawnSleeper();
    let server1: FastifyInstance | undefined;
    let server2: FastifyInstance | undefined;
    try {
      vi.mocked(launchTool).mockClear();
      vi.mocked(launchTool).mockReturnValueOnce({
        ok: true,
        pid: child.pid!,
        executed: { binary: '/x', args: [] },
      });

      server1 = await buildLocalServer({ dataDir: tmpDir });
      await server1.ready();
      const workspaceId = server1.workspaceManager.getDefault() ?? server1.workspaceManager.list()[0]!.id;
      const response = await injectWithAuth(server1, {
        method: 'POST', url: '/api/tools/launch',
        headers: { 'content-type': 'application/json' },
        payload: { id: 'claude-code', installedPath: '/x', workspaceId },
      });
      expect(response.statusCode).toBe(202);
      const { runId } = response.json() as { runId: string };
      const runToken = (vi.mocked(launchTool).mock.calls[0][0] as { runToken: string }).runToken;
      expect(fs.existsSync(path.join(tmpDir, 'launched-processes.json'))).toBe(true);
      await server1.close();
      server1 = undefined;

      server2 = await buildLocalServer({ dataDir: tmpDir });
      await server2.ready();
      expect(server2.agentRunRegistry.get(runId)?.status).toBe('running');
      expect(server2.agentRunRegistry.authenticateCredential(runToken)).toBeUndefined();
      expect(server2.toolProcessTracker?.list().some((process) => process.pid === child.pid)).toBe(true);

      const launchCallsBeforeCompeting = vi.mocked(launchTool).mock.calls.length;
      const competing = await injectWithAuth(server2, {
        method: 'POST',
        url: '/api/tools/launch',
        headers: { 'content-type': 'application/json' },
        payload: { id: 'hermes', workspaceId },
      });
      expect(competing.statusCode).toBe(409);
      expect(competing.json()).toMatchObject({ error: 'workspace_busy', workspaceId });
      expect(launchTool).toHaveBeenCalledTimes(launchCallsBeforeCompeting);

      const cancelled = await server2.agentRunRegistry.control(runId, 'cancel');
      expect(cancelled.status).toBe('cancelled');
      expect(server2.toolProcessTracker?.list().some((process) => process.pid === child.pid)).toBe(false);
      const restoredWorkspace = server2.workspaceManager.get(workspaceId)!;
      const restoredRoot = resolveWorkspaceExecutionRoot(tmpDir, restoredWorkspace);
      const releaseAfterCancel =
        server2.agentState.workspaceTurnCoordinator.tryAcquireWorkspace(restoredRoot, 'write');
      expect(releaseAfterCancel).toEqual(expect.any(Function));
      releaseAfterCancel?.();
    } finally {
      if (server1) await server1.close();
      if (server2) await server2.close();
      await stopChild(child);
    }
  }, 30_000);

  it('adopts a workspace lease for a live persisted tracker row without a registry worker', async () => {
    const child = spawnSleeper();
    let server1: FastifyInstance | undefined;
    let server2: FastifyInstance | undefined;
    try {
      vi.mocked(launchTool).mockClear();
      server1 = await buildLocalServer({ dataDir: tmpDir });
      await server1.ready();
      const workspaceId =
        server1.workspaceManager.getDefault() ?? server1.workspaceManager.list()[0]!.id;
      server1.toolProcessTracker?.register(child.pid!, 'claude-code', workspaceId);
      await server1.close();
      server1 = undefined;

      server2 = await buildLocalServer({ dataDir: tmpDir });
      await server2.ready();
      const launchCallsBefore = vi.mocked(launchTool).mock.calls.length;
      const competing = await injectWithAuth(server2, {
        method: 'POST',
        url: '/api/tools/launch',
        headers: { 'content-type': 'application/json' },
        payload: { id: 'hermes', workspaceId },
      });
      expect(competing.statusCode).toBe(409);
      expect(competing.json()).toMatchObject({ error: 'workspace_busy', workspaceId });
      expect(launchTool).toHaveBeenCalledTimes(launchCallsBefore);

      const killed = await injectWithAuth(server2, {
        method: 'POST',
        url: '/api/tools/kill',
        headers: { 'content-type': 'application/json' },
        payload: { pid: child.pid },
      });
      expect(killed.statusCode).toBe(200);
      const workspace = server2.workspaceManager.get(workspaceId)!;
      const workspaceRoot = resolveWorkspaceExecutionRoot(tmpDir, workspace);
      const release =
        server2.agentState.workspaceTurnCoordinator.tryAcquireWorkspace(workspaceRoot, 'write');
      expect(release).toEqual(expect.any(Function));
      release?.();
    } finally {
      if (server1) await server1.close();
      if (server2) await server2.close();
      await stopChild(child);
    }
  }, 10_000);

  it('rebuilds a corrupt process tracker from an alive external-tool registry run', async () => {
    const child = spawnSleeper();
    let server1: FastifyInstance | undefined;
    let server2: FastifyInstance | undefined;
    try {
      vi.mocked(launchTool).mockClear();
      vi.mocked(launchTool).mockReturnValueOnce({
        ok: true,
        pid: child.pid!,
        executed: { binary: '/x', args: [] },
      });
      server1 = await buildLocalServer({ dataDir: tmpDir });
      await server1.ready();
      const workspaceId =
        server1.workspaceManager.getDefault() ?? server1.workspaceManager.list()[0]!.id;
      const launched = await injectWithAuth(server1, {
        method: 'POST',
        url: '/api/tools/launch',
        headers: { 'content-type': 'application/json' },
        payload: { id: 'claude-code', installedPath: '/x', workspaceId },
      });
      expect(launched.statusCode).toBe(202);
      const { runId } = launched.json() as { runId: string };
      await server1.close();
      server1 = undefined;
      fs.writeFileSync(path.join(tmpDir, 'launched-processes.json'), '{"truncated":', 'utf8');

      server2 = await buildLocalServer({ dataDir: tmpDir });
      await server2.ready();
      expect(server2.agentRunRegistry.get(runId)?.status).toBe('running');
      expect(
        server2.toolProcessTracker?.list().some((process) => process.pid === child.pid),
      ).toBe(true);

      const launchCallsBefore = vi.mocked(launchTool).mock.calls.length;
      const competing = await injectWithAuth(server2, {
        method: 'POST',
        url: '/api/tools/launch',
        headers: { 'content-type': 'application/json' },
        payload: { id: 'hermes', workspaceId },
      });
      expect(competing.statusCode).toBe(409);
      expect(competing.json()).toMatchObject({ error: 'workspace_busy', workspaceId });
      expect(launchTool).toHaveBeenCalledTimes(launchCallsBefore);
    } finally {
      if (server1) await server1.close();
      if (server2) await server2.close();
      await stopChild(child);
    }
  }, 10_000);

  it('marks a detached run interrupted when its process disappeared during restart', async () => {
    const child = spawnSleeper();
    let server1: FastifyInstance | undefined;
    let server2: FastifyInstance | undefined;
    try {
      vi.mocked(launchTool).mockClear();
      vi.mocked(launchTool).mockReturnValueOnce({
        ok: true,
        pid: child.pid!,
        executed: { binary: '/x', args: [] },
      });

      server1 = await buildLocalServer({ dataDir: tmpDir });
      await server1.ready();
      const workspaceId = server1.workspaceManager.getDefault() ?? server1.workspaceManager.list()[0]!.id;
      const response = await injectWithAuth(server1, {
        method: 'POST', url: '/api/tools/launch',
        headers: { 'content-type': 'application/json' },
        payload: { id: 'claude-code', installedPath: '/x', workspaceId },
      });
      const { runId } = response.json() as { runId: string };
      const runToken = (vi.mocked(launchTool).mock.calls[0][0] as { runToken: string }).runToken;
      await server1.close();
      server1 = undefined;
      await stopChild(child);

      server2 = await buildLocalServer({ dataDir: tmpDir });
      await server2.ready();
      expect(server2.agentRunRegistry.get(runId)).toMatchObject({
        status: 'interrupted',
        result: { error: 'External process was not running when Waggle restarted' },
      });
      expect(server2.agentRunRegistry.authenticateCredential(runToken)).toBeUndefined();
      expect(server2.toolProcessTracker?.list().some((process) => process.pid === child.pid)).toBe(false);
    } finally {
      if (server1) await server1.close();
      if (server2) await server2.close();
      await stopChild(child);
    }
  });
});
