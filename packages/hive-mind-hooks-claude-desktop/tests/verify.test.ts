import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { install, MCP_SERVER_NAME } from '../src/install.js';
import { resolvePaths } from '../src/paths.js';
import { verify } from '../src/verify.js';

interface TestEnv {
  home: string;
  mcpEntry: string;
}

async function bootstrap(): Promise<TestEnv> {
  const home = await mkdtemp(join(tmpdir(), 'hm-claude-desktop-verify-'));
  const mcpEntry = join(home, 'memory-mcp.js');
  await writeFile(mcpEntry, 'export const ready = true;\n', 'utf-8');
  return { home, mcpEntry };
}

async function writeConfig(home: string, config: Record<string, unknown>): Promise<void> {
  const paths = resolvePaths({ home, platform: 'linux' });
  await mkdir(paths.claudeConfigDir, { recursive: true });
  await writeFile(paths.configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

function hangingSpawn(onSpawn: () => void): typeof import('node:child_process').spawn {
  return ((_command: string, _args: readonly string[], _options?: unknown) => {
    onSpawn();
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(() => true),
    }) as unknown as ChildProcess;
    return child;
  }) as unknown as typeof import('node:child_process').spawn;
}

describe('verify (claude-desktop)', () => {
  const homes: string[] = [];

  afterEach(async () => {
    vi.useRealTimers();
    for (const home of homes.splice(0)) {
      await rm(home, { recursive: true, force: true });
    }
  });

  it('passes with an installed config, readable entry, valid syntax, and pointer', async () => {
    const env = await bootstrap();
    homes.push(env.home);
    await install({ home: env.home, platform: 'linux', mcpEntry: env.mcpEntry });

    const result = await verify({ home: env.home, platform: 'linux' });

    expect(result.ok).toBe(true);
    expect(result.checks.map((check) => check.name)).toEqual([
      'claude_desktop_config.json exists',
      'config parses as JSON',
      "mcpServers contains 'waggle-memory' entry",
      'server entry points at waggle-memory-mcp',
      'memory-mcp entry readable on disk',
      'memory-mcp entry parses (node --check)',
      'install pointer present',
    ]);
  });

  it('fails the config existence check when the config is missing', async () => {
    const env = await bootstrap();
    homes.push(env.home);

    const result = await verify({ home: env.home, platform: 'linux' });

    expect(result.ok).toBe(false);
    expect(result.checks).toEqual([{
      name: 'claude_desktop_config.json exists',
      ok: false,
      detail: resolvePaths({ home: env.home, platform: 'linux' }).configPath,
    }]);
  });

  it("fails the mcpServers contains 'waggle-memory' entry check when absent", async () => {
    const env = await bootstrap();
    homes.push(env.home);
    await writeConfig(env.home, { mcpServers: { other: { command: 'node', args: [] } } });

    const result = await verify({ home: env.home, platform: 'linux' });
    const check = result.checks.find((item) => item.name.includes("contains 'waggle-memory'"));

    expect(result.ok).toBe(false);
    expect(check?.ok).toBe(false);
  });

  it('fails the entry readability check when args[0] is missing on disk', async () => {
    const env = await bootstrap();
    homes.push(env.home);
    const missingEntry = join(env.home, 'missing-memory-mcp.js');
    await writeConfig(env.home, {
      mcpServers: {
        [MCP_SERVER_NAME]: { command: process.execPath, args: [missingEntry] },
      },
    });

    const result = await verify({ home: env.home, platform: 'linux' });
    const check = result.checks.find((item) => item.name === 'memory-mcp entry readable on disk');

    expect(result.ok).toBe(false);
    expect(check?.ok).toBe(false);
    expect(check?.detail).toBe(missingEntry);
  });

  it('times out and kills a hung node --check probe through spawnImpl', async () => {
    const env = await bootstrap();
    homes.push(env.home);
    await install({ home: env.home, platform: 'linux', mcpEntry: env.mcpEntry });
    vi.useFakeTimers();
    let spawned = false;
    const spawnImpl = hangingSpawn(() => { spawned = true; });

    const resultPromise = verify({ home: env.home, platform: 'linux', spawnImpl });
    await vi.waitFor(() => expect(spawned).toBe(true));
    await vi.advanceTimersByTimeAsync(4000);
    const result = await resultPromise;
    const check = result.checks.find(
      (item) => item.name === 'memory-mcp entry parses (node --check)',
    );

    expect(result.ok).toBe(false);
    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain('timed out');
  });
});
