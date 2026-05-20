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
  type ToolLauncherDeps,
} from '../src/tool-launcher.js';
import type { ToolId } from '@waggle/shared';

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

  it('rejects tools outside the launch cohort', () => {
    const { spawnDetached } = captureSpawn();
    const result = launchTool({
      id: 'codex' as ToolId,
      installedPath: '/somewhere/codex',
      deps: { spawnDetached },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('launch cohort');
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
      id: 'cursor',
      action: 'verify',
      deps: { execCapture },
    });
    expect(calls[0].args).toEqual([
      '--yes',
      '@waggle/hive-mind-hooks-cursor',
      'verify',
    ]);
  });

  it('routes the uninstall action', async () => {
    const { calls, execCapture } = captureExec();
    await runHookCommand({
      id: 'claude-desktop',
      action: 'uninstall',
      deps: { execCapture },
    });
    expect(calls[0].args).toEqual([
      '--yes',
      '@waggle/hive-mind-hooks-claude-desktop',
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

  it('rejects out-of-cohort tools', async () => {
    const execCapture = vi.fn();
    const result = await runHookCommand({
      id: 'hermes' as ToolId,
      action: 'install',
      deps: { execCapture },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('cohort');
    expect(execCapture).not.toHaveBeenCalled();
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
