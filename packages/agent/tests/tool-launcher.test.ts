/**
 * AI-OS Phase 2A — tool launcher tests.
 *
 * TDD coverage for launchTool() + runHookCommand(). All process
 * spawns are injected so the test never actually executes a binary.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  launchTool,
  runHookCommand,
  hookPackageFor,
  HOOKS_COHORT,
  type ToolLauncherDeps,
  type ObservedHandle,
} from '../src/tool-launcher.js';
import { BUILTIN_TOOL_MANIFESTS, type ToolId } from '@waggle/shared';

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
      id: 'cursor',
      installedPath: '/Applications/Cursor.app/Contents/MacOS/Cursor',
      workspaceId: 'ws-kvark',
      deps: { spawnDetached },
    });
    expect(calls[0].options.env?.WAGGLE_WORKSPACE_ID).toBe('ws-kvark');
  });

  it('does not inject env when workspaceId is absent', () => {
    const { calls, spawnDetached } = captureSpawn();
    launchTool({
      id: 'cursor',
      installedPath: '/Applications/Cursor.app/Contents/MacOS/Cursor',
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
    'claude-code', 'cursor', 'claude-desktop',
    'codex', 'codex-desktop', 'hermes', 'openclaw',
  ])('accepts every cohort tool (%s) after Phase 4 expansion', (id) => {
    const { spawnDetached } = captureSpawn();
    const result = launchTool({
      id,
      installedPath: `/somewhere/${id}`,
      deps: { spawnDetached },
    });
    expect(result.ok).toBe(true);
    expect(result.pid).toBe(12345);
  });

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
  it('invokes npx with the right package + action for install', async () => {
    const { calls, execCapture } = captureExec();
    const result = await runHookCommand({
      id: 'claude-code',
      action: 'install',
      deps: { execCapture },
    });
    expect(result.ok).toBe(true);
    expect(calls[0].binary).toBe('npx');
    expect(calls[0].args).toEqual([
      '--yes',
      '@waggle/hive-mind-hooks-claude-code',
      'install',
    ]);
  });

  it('appends --cli-path when provided for install', async () => {
    const { calls, execCapture } = captureExec();
    await runHookCommand({
      id: 'claude-code',
      action: 'install',
      cliPath: 'C:\\Users\\me\\AppData\\Roaming\\npm\\hive-mind-cli.js',
      deps: { execCapture },
    });
    expect(calls[0].args).toEqual([
      '--yes',
      '@waggle/hive-mind-hooks-claude-code',
      'install',
      '--cli-path',
      'C:\\Users\\me\\AppData\\Roaming\\npm\\hive-mind-cli.js',
    ]);
  });

  it('does not append --cli-path on verify even if provided (install-only flag)', async () => {
    const { calls, execCapture } = captureExec();
    await runHookCommand({
      id: 'claude-code',
      action: 'verify',
      cliPath: '/usr/local/bin/hive-mind-cli',
      deps: { execCapture },
    });
    expect(calls[0].args).not.toContain('--cli-path');
  });

  it('routes the verify action', async () => {
    const { calls, execCapture } = captureExec();
    await runHookCommand({
      id: 'claude-code',
      action: 'verify',
      deps: { execCapture },
    });
    expect(calls[0].args).toEqual([
      '--yes',
      '@waggle/hive-mind-hooks-claude-code',
      'verify',
    ]);
  });

  it('routes the uninstall action', async () => {
    const { calls, execCapture } = captureExec();
    await runHookCommand({
      id: 'claude-code',
      action: 'uninstall',
      deps: { execCapture },
    });
    expect(calls[0].args).toEqual([
      '--yes',
      '@waggle/hive-mind-hooks-claude-code',
      'uninstall',
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
      deps: { execCapture },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('exec failed');
  });

  // R8-001: hook management is gated on HOOKS_COHORT — the claude-desktop
  // hook package is still a binless stub (deferred MCP-bridge category), so
  // routing npx at it always failed for the user. claude-code, codex,
  // codex-desktop, cursor, hermes, and openclaw ship real bins (codex-desktop
  // is a thin re-export of codex sharing ~/.codex/; cursor is a JSON installer
  // with degraded events; hermes is a YAML installer with 3 events, no
  // PreCompact; openclaw is a JSON5 + in-process-TS installer with 4 events,
  // Stop debounced), so they ROUTE; every remaining stub tool must REFUSE
  // without invoking npx.
  it.each<ToolId>(['claude-code', 'codex', 'codex-desktop', 'cursor', 'hermes', 'openclaw'])(
    'routes the hook command for HOOKS_COHORT tool (%s)',
    async (id) => {
      const { calls, execCapture } = captureExec();
      const result = await runHookCommand({ id, action: 'install', deps: { execCapture } });
      expect(result.ok).toBe(true);
      expect(calls[0].args).toEqual(['--yes', `@waggle/hive-mind-hooks-${id}`, 'install']);
    },
  );

  it.each<ToolId>([
    'claude-desktop',
  ])('refuses hook command for non-HOOKS_COHORT stub tool (%s) without calling npx', async (id) => {
    const { calls, execCapture } = captureExec();
    const result = await runHookCommand({ id, action: 'install', deps: { execCapture } });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not supported');
    expect(calls).toHaveLength(0);
  });
});

describe('HOOKS_COHORT derivation (#5)', () => {
  it('equals the hook-capable manifests (claude-desktop excluded)', () => {
    const expected = BUILTIN_TOOL_MANIFESTS.filter((m) => m.hookCapable).map((m) => m.id).sort();
    expect([...HOOKS_COHORT].sort()).toEqual(expected);
    expect(HOOKS_COHORT).not.toContain('claude-desktop');
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
