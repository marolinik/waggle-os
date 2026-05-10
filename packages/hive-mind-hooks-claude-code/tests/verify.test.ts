import { describe, expect, it, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { install } from '../src/install.js';
import { verify } from '../src/verify.js';
import type { ClaudeCodeSettings } from '../src/settings-merger.js';

interface TestEnv {
  home: string;
  hooksDir: string;
}

async function bootstrap(initial: ClaudeCodeSettings, withHookFiles: boolean): Promise<TestEnv> {
  const home = await mkdtemp(join(tmpdir(), 'hmc-verify-'));
  const claudeDir = join(home, '.claude');
  await mkdir(claudeDir, { recursive: true });
  const settingsPath = join(claudeDir, 'settings.json');
  await writeFile(settingsPath, JSON.stringify(initial, null, 2), 'utf-8');
  const hooksDir = join(home, 'fake-dist', 'hooks');
  await mkdir(hooksDir, { recursive: true });
  if (withHookFiles) {
    for (const b of ['session-start', 'user-prompt-submit', 'stop', 'pre-compact']) {
      await writeFile(join(hooksDir, `${b}.js`), '/* mock hook */', 'utf-8');
    }
  }
  return { home, hooksDir };
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

describe('verify', () => {
  const envs: TestEnv[] = [];
  afterEach(async () => {
    for (const env of envs.splice(0)) await rm(env.home, { recursive: true, force: true });
  });

  it('reports failure when settings.json is missing', async () => {
    const home = await mkdtemp(join(tmpdir(), 'hmc-verify-missing-'));
    envs.push({ home, hooksDir: '' });
    const result = await verify({
      home,
      hooksDir: join(home, 'fake-dist', 'hooks'),
      spawnImpl: mockSpawnImpl({ exitCode: 0 }),
    });
    expect(result.ok).toBe(false);
    expect(result.checks[0].name).toBe('settings.json exists');
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
    expect(result.checks.some((c) => !c.ok && c.name.includes('contains hive-mind entry'))).toBe(true);
  });

  it('passes after a successful install with hook files on disk and CLI reachable', async () => {
    const env = await bootstrap({}, true);
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
  });

  it('reports CLI unreachable when the spawn exits non-zero', async () => {
    const env = await bootstrap({}, true);
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

  it('uses cli_path from the install pointer for the probe', async () => {
    const env = await bootstrap({}, true);
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
    // For a .js cli_path, verify should spawn `node <path> --help`.
    const probeRecord = records[records.length - 1];
    expect(probeRecord.command).toBe(process.execPath);
    expect(probeRecord.args[0]).toBe(cliPath);
    expect(probeRecord.args[1]).toBe('--help');
  });

  it('flags missing hook script files even when settings entry is present', async () => {
    const env = await bootstrap({}, false); // no hook .js files
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
});
