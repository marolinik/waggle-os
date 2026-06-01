import { describe, expect, it, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { install } from '../src/install.js';
import { verify } from '../src/verify.js';

interface TestEnv {
  home: string;
  hooksDir: string;
  codexDir: string;
}

async function bootstrap(
  initial: Record<string, unknown> | undefined,
  withHookFiles: boolean,
): Promise<TestEnv> {
  const home = await mkdtemp(join(tmpdir(), 'hmcdx-verify-'));
  const codexDir = join(home, '.codex');
  await mkdir(codexDir, { recursive: true });
  if (initial !== undefined) {
    await writeFile(join(codexDir, 'hooks.json'), JSON.stringify(initial, null, 2) + '\n', 'utf-8');
  }
  const hooksDir = join(home, 'fake-dist', 'hooks');
  await mkdir(hooksDir, { recursive: true });
  if (withHookFiles) {
    for (const b of ['session-start', 'user-prompt-submit', 'stop', 'pre-compact']) {
      await writeFile(join(hooksDir, `${b}.js`), '/* mock hook */', 'utf-8');
    }
  }
  return { home, hooksDir, codexDir };
}

function mockSpawnImpl(opts: { exitCode: number; stdout?: string; stderr?: string }): typeof import('node:child_process').spawn {
  return ((_cmd: string, _args: readonly string[], _options?: unknown) => {
    const emitter = new EventEmitter();
    const stdout = Readable.from([Buffer.from(opts.stdout ?? 'hive-mind-cli help text\n')]);
    const stderr = Readable.from([Buffer.from(opts.stderr ?? '')]);
    const child = Object.assign(emitter, {
      stdout,
      stderr,
      kill: vi.fn(() => true),
    }) as unknown as ChildProcess;
    setImmediate(() => emitter.emit('exit', opts.exitCode));
    return child;
  }) as unknown as typeof import('node:child_process').spawn;
}

describe('verify (codex)', () => {
  const envs: TestEnv[] = [];
  afterEach(async () => {
    for (const env of envs.splice(0)) await rm(env.home, { recursive: true, force: true });
  });

  it('reports failure when hooks.json is missing', async () => {
    const env = await bootstrap(undefined, true);
    envs.push(env);
    const result = await verify({
      home: env.home,
      hooksDir: env.hooksDir,
      spawnImpl: mockSpawnImpl({ exitCode: 0 }),
    });
    expect(result.ok).toBe(false);
    expect(result.checks[0].name).toBe('hooks.json exists');
    expect(result.checks[0].ok).toBe(false);
  });

  it('reports failure when hooks are not yet installed', async () => {
    const env = await bootstrap({ hooks: {} }, true);
    envs.push(env);
    const result = await verify({
      home: env.home,
      hooksDir: env.hooksDir,
      spawnImpl: mockSpawnImpl({ exitCode: 0 }),
    });
    expect(result.ok).toBe(false);
    expect(result.checks.some((c) => !c.ok && c.name.includes('hive-mind entries'))).toBe(true);
  });

  it('passes after install with hook files on disk and CLI reachable', async () => {
    const env = await bootstrap({ hooks: {} }, true);
    envs.push(env);
    await install({ home: env.home, hooksDir: env.hooksDir });
    const result = await verify({
      home: env.home,
      hooksDir: env.hooksDir,
      spawnImpl: mockSpawnImpl({ exitCode: 0 }),
    });
    expect(result.ok).toBe(true);
    const cliCheck = result.checks.find((c) => c.name === 'hive-mind-cli reachable');
    expect(cliCheck?.ok).toBe(true);
    // The entry-presence check + each hook-script-readable check passed.
    expect(result.checks.find((c) => c.name === 'hooks.json contains hive-mind entries')?.ok).toBe(true);
    expect(result.checks.filter((c) => c.name.includes('readable on disk')).every((c) => c.ok)).toBe(true);
  });

  it('reports CLI unreachable when the spawn exits non-zero', async () => {
    const env = await bootstrap({ hooks: {} }, true);
    envs.push(env);
    await install({ home: env.home, hooksDir: env.hooksDir });
    const result = await verify({
      home: env.home,
      hooksDir: env.hooksDir,
      spawnImpl: mockSpawnImpl({ exitCode: 127, stderr: 'command not found' }),
    });
    expect(result.ok).toBe(false);
    const cliCheck = result.checks.find((c) => c.name === 'hive-mind-cli reachable');
    expect(cliCheck?.ok).toBe(false);
  });

  it('flags missing hook script files even when the settings entry is present', async () => {
    const env = await bootstrap({ hooks: {} }, false); // no hook .js files
    envs.push(env);
    await install({ home: env.home, hooksDir: env.hooksDir });
    const result = await verify({
      home: env.home,
      hooksDir: env.hooksDir,
      spawnImpl: mockSpawnImpl({ exitCode: 0 }),
    });
    expect(result.ok).toBe(false);
    const fileCheck = result.checks.find((c) => c.name.includes('readable on disk'));
    expect(fileCheck?.ok).toBe(false);
  });

  it('uses cli_path from the install pointer for the probe (node <path> --help)', async () => {
    const env = await bootstrap({ hooks: {} }, true);
    envs.push(env);
    const cliPath = '/abs/from/pointer.js';
    await install({ home: env.home, hooksDir: env.hooksDir, cliPath });

    const records: Array<{ command: string; args: readonly string[] }> = [];
    const recordingSpawn = ((cmd: string, args: readonly string[]) => {
      records.push({ command: cmd, args });
      return mockSpawnImpl({ exitCode: 0 })(cmd, args);
    }) as typeof import('node:child_process').spawn;

    const result = await verify({
      home: env.home,
      hooksDir: env.hooksDir,
      spawnImpl: recordingSpawn,
    });
    expect(result.ok).toBe(true);
    const probeRecord = records[records.length - 1];
    expect(probeRecord.command).toBe(process.execPath);
    expect(probeRecord.args[0]).toBe(cliPath);
    expect(probeRecord.args[1]).toBe('--help');
  });

  // ── codex-specific surfacings ─────────────────────────────────────────

  it('always surfaces the one-time /hooks trust step as an advisory check', async () => {
    const env = await bootstrap({ hooks: {} }, true);
    envs.push(env);
    await install({ home: env.home, hooksDir: env.hooksDir });
    const result = await verify({
      home: env.home,
      hooksDir: env.hooksDir,
      spawnImpl: mockSpawnImpl({ exitCode: 0 }),
    });
    const trust = result.checks.find((c) => c.name.includes('/hooks trust step'));
    expect(trust).toBeDefined();
    expect(trust?.detail).toContain('/hooks');
  });

  it('surfaces allow_managed_hooks_only lockdown as a FAILING check', async () => {
    const env = await bootstrap({ hooks: {} }, true);
    envs.push(env);
    await install({ home: env.home, hooksDir: env.hooksDir });
    // Admin lockdown suppresses user hooks — install would silently no-op.
    await writeFile(
      join(env.codexDir, 'requirements.toml'),
      'allow_managed_hooks_only = true\n',
      'utf-8',
    );
    const result = await verify({
      home: env.home,
      hooksDir: env.hooksDir,
      spawnImpl: mockSpawnImpl({ exitCode: 0 }),
    });
    const lockdown = result.checks.find((c) => c.name.includes('allow_managed_hooks_only'));
    expect(lockdown).toBeDefined();
    expect(lockdown?.ok).toBe(false);
    expect(result.ok).toBe(false);
  });

  it('does not flag lockdown when requirements.toml does not set it', async () => {
    const env = await bootstrap({ hooks: {} }, true);
    envs.push(env);
    await install({ home: env.home, hooksDir: env.hooksDir });
    await writeFile(
      join(env.codexDir, 'requirements.toml'),
      'allow_managed_hooks_only = false\n',
      'utf-8',
    );
    const result = await verify({
      home: env.home,
      hooksDir: env.hooksDir,
      spawnImpl: mockSpawnImpl({ exitCode: 0 }),
    });
    const lockdown = result.checks.find((c) => c.name.includes('allow_managed_hooks_only'));
    expect(lockdown?.ok).toBe(true);
  });
});
