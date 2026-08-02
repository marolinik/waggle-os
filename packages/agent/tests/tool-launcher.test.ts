/**
 * AI-OS Phase 2A — tool launcher tests.
 *
 * TDD coverage for launchTool() + runHookCommand(). All process
 * spawns are injected so the test never actually executes a binary.
 */

import { describe, it, expect, vi } from 'vitest';
import { join, resolve } from 'node:path';
import {
  launchTool,
  runHookCommand,
  hookPackageFor,
  HOOKS_COHORT,
  resolveHookRuntime,
  resolveSpawnInvocation,
  type HookRuntimePaths,
  type ToolLauncherDeps,
  type ObservedHandle,
} from '../src/tool-launcher.js';
import { BUILTIN_TOOL_MANIFESTS, type ToolId, type ToolManifest } from '@waggle/shared';

function captureSpawn() {
  const calls: Array<{
    binary: string;
    args: string[];
    options: { cwd?: string; env?: NodeJS.ProcessEnv };
  }> = [];
  const spawnDetached: NonNullable<ToolLauncherDeps['spawnDetached']> = (
    binary,
    args,
    options,
  ) => {
    calls.push({ binary, args, options });
    return { pid: 12345 };
  };
  return { calls, spawnDetached };
}

function captureExec(
  result: { stdout: string; stderr: string; code: number } | null = {
    stdout: 'ok',
    stderr: '',
    code: 0,
  },
) {
  const calls: Array<{
    binary: string;
    args: string[];
    options?: { timeoutMs?: number; env?: NodeJS.ProcessEnv };
  }> = [];
  const execCapture: NonNullable<ToolLauncherDeps['execCapture']> = async (
    binary,
    args,
    options,
  ) => {
    calls.push({ binary, args, options });
    return result;
  };
  return { calls, execCapture };
}

function testHookRuntime(id: ToolId = 'claude-code'): HookRuntimePaths {
  return {
    nodePath: '/waggle/resources/node',
    cliEntry: '/waggle/resources/node_modules/@waggle/hive-mind-cli/dist/index.js',
    hookEntry: `/waggle/resources/node_modules/@waggle/hive-mind-hooks-${id}/dist/bin/${id}-hooks.js`,
  };
}

// ── launchTool ──────────────────────────────────────────────────────

describe('launchTool', () => {
  it('spawns claude-code with the supplied installedPath and returns pid', () => {
    const { calls, spawnDetached } = captureSpawn();
    const result = launchTool({
      id: 'claude-code',
      installedPath: '/usr/local/bin/claude',
      deps: { spawnDetached },
    });
    expect(result.ok).toBe(true);
    expect(result.pid).toBe(12345);
    expect(calls).toHaveLength(1);
    expect(calls[0].binary).toBe('/usr/local/bin/claude');
  });

  it('injects WAGGLE_WORKSPACE_ID env when provided', () => {
    const { calls, spawnDetached } = captureSpawn();
    launchTool({
      id: 'codex-desktop',
      installedPath: '/Applications/Codex.app/Contents/MacOS/Codex',
      workspaceId: 'ws-kvark',
      deps: { spawnDetached },
    });
    expect(calls[0].options.env?.WAGGLE_WORKSPACE_ID).toBe('ws-kvark');
  });

  it('fails closed against ambient provider and infrastructure secrets', () => {
    const { calls, spawnDetached } = captureSpawn();
    launchTool({
      id: 'claude-code',
      installedPath: 'C:\\tools\\claude.exe',
      workspaceId: 'ws-isolated',
      runId: 'run-1',
      roomId: 'room-1',
      runToken: 'narrow-room-token',
      deps: {
        platform: 'win32',
        baseEnv: {
          PATH: 'C:\\Windows\\System32',
          PATHEXT: '.COM;.EXE;.CMD',
          USERPROFILE: 'C:\\Users\\tester',
          APPDATA: 'C:\\Users\\tester\\AppData\\Roaming',
          LOCALAPPDATA: 'C:\\Redirected\\Local',
          HERMES_HOME: 'D:\\Hermes Data',
          TERM: 'xterm-256color',
          ANTHROPIC_API_KEY: 'anthropic-secret',
          OPENAI_API_KEY: 'openai-secret',
          OPENROUTER_API_KEY: 'openrouter-secret',
          GEMINI_API_KEY: 'gemini-secret',
          STRIPE_SECRET_KEY: 'stripe-secret',
          AWS_SECRET_ACCESS_KEY: 'aws-secret',
          DATABASE_URL: 'database-secret',
          SSH_AUTH_SOCK: 'credential-socket',
          GIT_ASKPASS: 'credential-helper',
          HTTPS_PROXY: 'https://user:secret@proxy.invalid',
          NODE_OPTIONS: '--require C:\\malicious.js',
          WAGGLE_RUN_TOKEN: 'stale-ambient-token',
        },
        spawnDetached,
      },
    });

    expect(calls[0].options.env).toMatchObject({
      PATH: 'C:\\Windows\\System32',
      PATHEXT: '.COM;.EXE;.CMD',
      USERPROFILE: 'C:\\Users\\tester',
      APPDATA: 'C:\\Users\\tester\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Redirected\\Local',
      HERMES_HOME: 'D:\\Hermes Data',
      TERM: 'xterm-256color',
      WAGGLE_WORKSPACE_ID: 'ws-isolated',
      WAGGLE_RUN_TOKEN: 'narrow-room-token',
    });
    for (const name of [
      'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY',
      'GEMINI_API_KEY', 'STRIPE_SECRET_KEY', 'AWS_SECRET_ACCESS_KEY',
      'DATABASE_URL', 'SSH_AUTH_SOCK', 'GIT_ASKPASS', 'HTTPS_PROXY',
      'NODE_OPTIONS',
    ]) {
      expect(calls[0].options.env?.[name], name).toBeUndefined();
    }
  });

  it('does not inject env when workspaceId is absent', () => {
    const { calls, spawnDetached } = captureSpawn();
    launchTool({
      id: 'codex-desktop',
      installedPath: '/Applications/Codex.app/Contents/MacOS/Codex',
      deps: { spawnDetached },
    });
    expect(calls[0].options.env?.WAGGLE_WORKSPACE_ID).toBeUndefined();
  });

  it('forwards cwd and args', () => {
    const { calls, spawnDetached } = captureSpawn();
    launchTool({
      id: 'claude-code',
      installedPath: '/usr/local/bin/claude',
      cwd: '/home/user/project',
      args: ['--continue'],
      deps: { spawnDetached },
    });
    expect(calls[0].args).toEqual(['--continue']);
    expect(calls[0].options.cwd).toBe('/home/user/project');
  });

  it('reports ok=false when the spawn returns no pid', () => {
    const spawnDetached: NonNullable<ToolLauncherDeps['spawnDetached']> = () => ({
      pid: null,
      error: 'ENOENT',
    });
    const result = launchTool({
      id: 'claude-code',
      installedPath: '/missing/path/claude',
      deps: { spawnDetached },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('ENOENT');
  });

  it.each<ToolId>([
    'claude-code', 'claude-desktop', 'codex', 'codex-desktop', 'hermes', 'hermes-desktop',
  ])('accepts every release-supported launch cohort tool (%s)', (id) => {
    const { spawnDetached } = captureSpawn();
    const result = launchTool({
      id,
      installedPath: `/somewhere/${id}`,
      deps: { spawnDetached },
    });
    expect(result.ok).toBe(true);
    expect(result.pid).toBe(12345);
  });

  it.each<ToolId>(['cursor', 'openclaw'])(
    'rejects roadmap tool %s without spawning it',
    (id) => {
      const { calls, spawnDetached } = captureSpawn();
      const result = launchTool({
        id,
        installedPath: `/somewhere/${id}`,
        deps: { spawnDetached },
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not launchable');
      expect(calls).toHaveLength(0);
    },
  );

  it('rejects empty installedPath', () => {
    const { spawnDetached } = captureSpawn();
    const result = launchTool({
      id: 'claude-code',
      installedPath: '',
      deps: { spawnDetached },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('installedPath is required');
  });

  it('accepts a launchable third-party adapter from the supplied registry', () => {
    const { calls, spawnDetached } = captureSpawn();
    const thirdParty: ToolManifest = {
      id: 'foo-cli',
      displayName: 'Foo CLI',
      launchable: true,
      hookCapable: false,
      hookPointer: '.foo/hive-mind-install.json',
      detect: { kind: 'path', binaryName: 'foo' },
      builtin: false,
    };
    const result = launchTool({
      id: 'foo-cli',
      installedPath: '/usr/local/bin/foo',
      toolRegistry: [thirdParty],
      deps: { spawnDetached },
    });
    expect(result.ok).toBe(true);
    expect(result.pid).toBe(12345);
    expect(calls[0].binary).toBe('/usr/local/bin/foo');
  });

  it('refuses a registered adapter that is not launchable', () => {
    const { calls, spawnDetached } = captureSpawn();
    const thirdParty: ToolManifest = {
      id: 'foo-cli',
      displayName: 'Foo CLI',
      launchable: false,
      hookCapable: false,
      hookPointer: '.foo/hive-mind-install.json',
      detect: { kind: 'path', binaryName: 'foo' },
      builtin: false,
    };
    const result = launchTool({
      id: 'foo-cli',
      installedPath: '/usr/local/bin/foo',
      toolRegistry: [thirdParty],
      deps: { spawnDetached },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not launchable');
    expect(calls).toHaveLength(0);
  });
});

// ── launchTool — self-enabling signal env (#1) ──────────────────────
// A dock launch should light the SignalBus it was built to feed: the
// launched tool's hive-mind hook only emits when WAGGLE_SIGNAL_EMIT is
// truthy, and it posts to WAGGLE_SIDECAR_URL. Without these the whole
// detect→launch→hook→bus→UI pipeline stays dark.

describe('launchTool — self-enabling signal env', () => {
  it('injects WAGGLE_SIGNAL_EMIT=1 by default (lights the bus)', () => {
    const { calls, spawnDetached } = captureSpawn();
    launchTool({
      id: 'claude-code',
      installedPath: '/usr/local/bin/claude',
      deps: { spawnDetached },
    });
    expect(calls[0].options.env?.WAGGLE_SIGNAL_EMIT).toBe('1');
  });

  it('omits WAGGLE_SIGNAL_EMIT when signalEmit:false (silent launch opt-out)', () => {
    const { calls, spawnDetached } = captureSpawn();
    launchTool({
      id: 'claude-code',
      installedPath: '/usr/local/bin/claude',
      signalEmit: false,
      deps: { spawnDetached },
    });
    expect(calls[0].options.env?.WAGGLE_SIGNAL_EMIT).toBeUndefined();
  });

  it('injects WAGGLE_SIDECAR_URL when provided', () => {
    const { calls, spawnDetached } = captureSpawn();
    launchTool({
      id: 'claude-code',
      installedPath: '/usr/local/bin/claude',
      sidecarUrl: 'http://127.0.0.1:7777',
      deps: { spawnDetached },
    });
    expect(calls[0].options.env?.WAGGLE_SIDECAR_URL).toBe('http://127.0.0.1:7777');
  });

  it('does not inject WAGGLE_SIDECAR_URL when absent', () => {
    const { calls, spawnDetached } = captureSpawn();
    launchTool({
      id: 'claude-code',
      installedPath: '/usr/local/bin/claude',
      deps: { spawnDetached },
    });
    expect(calls[0].options.env?.WAGGLE_SIDECAR_URL).toBeUndefined();
  });

  it('injects signal env alongside WAGGLE_WORKSPACE_ID', () => {
    const { calls, spawnDetached } = captureSpawn();
    launchTool({
      id: 'claude-code',
      installedPath: '/usr/local/bin/claude',
      workspaceId: 'ws-1',
      sidecarUrl: 'http://127.0.0.1:3333',
      deps: { spawnDetached },
    });
    expect(calls[0].options.env).toMatchObject({
      WAGGLE_WORKSPACE_ID: 'ws-1',
      WAGGLE_SIGNAL_EMIT: '1',
      WAGGLE_SIDECAR_URL: 'http://127.0.0.1:3333',
    });
  });
});

// ── runHookCommand ──────────────────────────────────────────────────

describe('runHookCommand', () => {
  it('invokes the packaged hook bin through bundled Node for install', async () => {
    const { calls, execCapture } = captureExec();
    const runtime = testHookRuntime();
    const result = await runHookCommand({
      id: 'claude-code',
      action: 'install',
      runtime,
      dataDir: '/waggle-data',
      deps: {
        baseEnv: {
          LOCALAPPDATA: 'C:\\Redirected\\Local',
          HERMES_HOME: 'D:\\Hermes Data',
          OPENAI_API_KEY: 'must-not-cross',
        },
        execCapture,
      },
    });
    expect(result.ok).toBe(true);
    expect(calls[0].binary).toBe(runtime.nodePath);
    expect(calls[0].args).toEqual([
      runtime.hookEntry,
      'install',
      '--cli-path',
      runtime.cliEntry,
    ]);
    expect(calls[0].options?.env).toMatchObject({
      LOCALAPPDATA: 'C:\\Redirected\\Local',
      HERMES_HOME: 'D:\\Hermes Data',
      WAGGLE_HOOK_NODE_PATH: runtime.nodePath,
      HIVE_MIND_DATA_DIR: '/waggle-data',
    });
    expect(calls[0].options?.env?.OPENAI_API_KEY).toBeUndefined();
  });

  it('pins the packaged CLI for install but not verify or uninstall', async () => {
    const { calls, execCapture } = captureExec();
    const runtime = testHookRuntime();
    await runHookCommand({ id: 'claude-code', action: 'install', runtime, deps: { execCapture } });
    await runHookCommand({ id: 'claude-code', action: 'verify', runtime, deps: { execCapture } });
    await runHookCommand({ id: 'claude-code', action: 'uninstall', runtime, deps: { execCapture } });
    expect(calls.map((call) => call.args)).toEqual([
      [runtime.hookEntry, 'install', '--cli-path', runtime.cliEntry],
      [runtime.hookEntry, 'verify'],
      [runtime.hookEntry, 'uninstall'],
    ]);
  });

  it('captures stdout, stderr, and code on success', async () => {
    const { execCapture } = captureExec({
      stdout: 'Done.',
      stderr: '',
      code: 0,
    });
    const result = await runHookCommand({
      id: 'claude-code',
      action: 'install',
      runtime: testHookRuntime(),
      deps: { execCapture },
    });
    expect(result.ok).toBe(true);
    expect(result.stdout).toBe('Done.');
    expect(result.code).toBe(0);
  });

  it('reports ok=false on non-zero exit', async () => {
    const { execCapture } = captureExec({
      stdout: '',
      stderr: 'Failed to write settings.json',
      code: 1,
    });
    const result = await runHookCommand({
      id: 'claude-code',
      action: 'install',
      runtime: testHookRuntime(),
      deps: { execCapture },
    });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('Failed');
  });

  it('reports ok=false with diagnostic when exec returns null', async () => {
    const execCapture: NonNullable<ToolLauncherDeps['execCapture']> = async () =>
      null;
    const result = await runHookCommand({
      id: 'claude-code',
      action: 'install',
      runtime: testHookRuntime(),
      deps: { execCapture },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('exec failed');
  });

  // R8-001: hook management is gated on the release-supported HOOKS_COHORT.
  it.each<ToolId>(['claude-code', 'claude-desktop', 'codex', 'codex-desktop', 'hermes'])(
    'routes the hook command for HOOKS_COHORT tool (%s)',
    async (id) => {
      const { calls, execCapture } = captureExec();
      const runtime = testHookRuntime(id);
      const result = await runHookCommand({ id, action: 'install', runtime, deps: { execCapture } });
      expect(result.ok).toBe(true);
      expect(calls[0].args).toEqual([runtime.hookEntry, 'install', '--cli-path', runtime.cliEntry]);
    },
  );

  it.each<ToolId>(['cursor', 'openclaw'])(
    'refuses hook commands for roadmap tool %s without invoking exec',
    async (id) => {
      const { calls, execCapture } = captureExec();
      const result = await runHookCommand({ id, action: 'install', deps: { execCapture } });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not supported');
      expect(calls).toHaveLength(0);
    },
  );

  it('refuses hook command for an unsupported tool id without invoking exec', async () => {
    const fakeId = 'not-a-real-tool' as ToolId;
    const { calls, execCapture } = captureExec();
    const result = await runHookCommand({ id: fakeId, action: 'install', deps: { execCapture } });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not supported');
    expect(calls).toHaveLength(0);
  });

  it('fails closed when the packaged runtime payload cannot be resolved', () => {
    expect(resolveHookRuntime('claude-code', { nodeModulesRoots: ['/missing'], fileExists: () => false })).toBeUndefined();
  });
});

describe('HOOKS_COHORT derivation (#5)', () => {
  it('equals the hook-capable manifests and includes claude-desktop', () => {
    const expected = BUILTIN_TOOL_MANIFESTS.filter((m) => m.hookCapable).map((m) => m.id).sort();
    expect([...HOOKS_COHORT].sort()).toEqual(expected);
    expect(HOOKS_COHORT).toContain('claude-desktop');
  });
});

describe('hookPackageFor', () => {
  it.each<ToolId>(['claude-code', 'claude-desktop', 'cursor'])(
    'returns @waggle/hive-mind-hooks-%s',
    (id) => {
      expect(hookPackageFor(id)).toBe(`@waggle/hive-mind-hooks-${id}`);
    },
  );
});

describe('launchTool observe mode', () => {
  it('uses spawnObserved and returns its handle when observe:true', () => {
    const handle: ObservedHandle = { onData: () => {}, onExit: () => {} };
    const spawnObserved = vi.fn(() => ({ pid: 4242, handle }));
    const spawnDetached = vi.fn(() => ({ pid: 1 }));
    const res = launchTool({
      id: 'claude-code',
      installedPath: '/usr/bin/claude',
      observe: true,
      deps: { spawnObserved, spawnDetached },
    });
    expect(spawnObserved).toHaveBeenCalledTimes(1);
    expect(spawnDetached).not.toHaveBeenCalled();
    expect(res.ok).toBe(true);
    expect(res.pid).toBe(4242);
    expect(res.output).toBe(handle);
  });

  it('uses spawnDetached and omits output when observe is absent', () => {
    const spawnObserved = vi.fn(() => ({ pid: 9, handle: { onData() {}, onExit() {} } }));
    const spawnDetached = vi.fn(() => ({ pid: 7 }));
    const res = launchTool({
      id: 'claude-code',
      installedPath: '/usr/bin/claude',
      deps: { spawnObserved, spawnDetached },
    });
    expect(spawnDetached).toHaveBeenCalledTimes(1);
    expect(spawnObserved).not.toHaveBeenCalled();
    expect(res.output).toBeUndefined();
  });

  it('reports observe spawn failure as ok:false', () => {
    const res = launchTool({
      id: 'claude-code',
      installedPath: '/usr/bin/claude',
      observe: true,
      deps: { spawnObserved: () => ({ pid: null, error: 'boom' }) },
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('boom');
    expect(res.output).toBeUndefined();
  });
});

describe('resolveHookRuntime', () => {
  it('resolves the CLI and hook bin from an explicit staged node_modules root', () => {
    const root = join('resources', 'node_modules');
    const cliEntry = join(root, '@waggle', 'hive-mind-cli', 'dist', 'index.js');
    const hookEntry = join(root, '@waggle', 'hive-mind-hooks-codex', 'dist', 'bin', 'codex-hooks.js');
    const runtime = resolveHookRuntime('codex', {
      nodePath: join('resources', 'node'),
      nodeModulesRoots: [root],
      fileExists: (candidate) => candidate === resolve(cliEntry) || candidate === resolve(hookEntry),
    });
    expect(runtime).toEqual({
      nodePath: join('resources', 'node'),
      cliEntry: resolve(cliEntry),
      hookEntry: resolve(hookEntry),
    });
  });

  it('injects the canonical Waggle data root for hook memory', () => {
    const { calls, spawnDetached } = captureSpawn();
    launchTool({
      id: 'claude-code',
      installedPath: '/usr/local/bin/claude',
      dataDir: '/waggle-data',
      deps: { spawnDetached },
    });
    expect(calls[0].options.env?.HIVE_MIND_DATA_DIR).toBe('/waggle-data');
  });

  it('injects only the narrow Room credential and canonical run identity', () => {
    const { calls, spawnDetached } = captureSpawn();
    launchTool({
      id: 'claude-code', installedPath: '/usr/local/bin/claude',
      runId: 'run-1', roomId: 'room-1', runToken: 'secret-run-token',
      deps: { spawnDetached },
    });
    expect(calls[0].options.env).toMatchObject({
      WAGGLE_RUN_ID: 'run-1',
      WAGGLE_ROOM_ID: 'room-1',
      WAGGLE_DANCE_TEAM_ID: 'room::room-1',
      WAGGLE_SENDER_ID: 'run::run-1',
      WAGGLE_RUN_TOKEN: 'secret-run-token',
    });
    expect(calls[0].options.env?.WAGGLE_SESSION_TOKEN).toBeUndefined();
  });
});

describe('resolveSpawnInvocation', () => {
  it('wraps Windows cmd shims through cmd.exe', () => {
    const invocation = resolveSpawnInvocation(
      'C:\\Users\\test\\AppData\\Roaming\\npm\\openclaw.cmd',
      ['--version'],
      'win32',
    );
    expect(invocation.binary).toBe('cmd.exe');
    expect(invocation.args).toEqual([
      '/d',
      '/v:off',
      '/s',
      '/c',
      'call "C:\\Users\\test\\AppData\\Roaming\\npm\\openclaw.cmd" "--version"',
    ]);
    expect(invocation.windowsVerbatimArguments).toBe(true);
  });

  it('leaves Windows exe launches untouched', () => {
    const invocation = resolveSpawnInvocation(
      'C:\\Users\\test\\.local\\bin\\claude.exe',
      ['--version'],
      'win32',
    );
    expect(invocation.binary).toBe('C:\\Users\\test\\.local\\bin\\claude.exe');
    expect(invocation.args).toEqual(['--version']);
  });
});
