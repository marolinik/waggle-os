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
  hermesDir: string;
}

async function bootstrap(
  initialYaml: string | undefined,
  withHookFiles: boolean,
): Promise<TestEnv> {
  const home = await mkdtemp(join(tmpdir(), 'hmher-verify-'));
  const hermesDir = join(home, '.hermes');
  await mkdir(hermesDir, { recursive: true });
  if (initialYaml !== undefined) {
    await writeFile(join(hermesDir, 'config.yaml'), initialYaml, 'utf-8');
  }
  const hooksDir = join(home, 'fake-dist', 'hooks');
  await mkdir(hooksDir, { recursive: true });
  if (withHookFiles) {
    // THREE scripts only — Hermes ships no pre-compact hook.
    for (const b of ['session-start', 'user-prompt-submit', 'stop']) {
      await writeFile(join(hooksDir, `${b}.js`), '/* mock hook */', 'utf-8');
    }
  }
  return { home, hooksDir, hermesDir };
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

describe('verify (hermes)', () => {
  const envs: TestEnv[] = [];
  afterEach(async () => {
    for (const env of envs.splice(0)) await rm(env.home, { recursive: true, force: true });
  });

  it('reports failure when config.yaml is missing', async () => {
    const env = await bootstrap(undefined, true);
    envs.push(env);
    const result = await verify({
      home: env.home,
      hooksDir: env.hooksDir,
      spawnImpl: mockSpawnImpl({ exitCode: 0 }),
    });
    expect(result.ok).toBe(false);
    expect(result.checks[0].name).toBe('config.yaml exists');
    expect(result.checks[0].ok).toBe(false);
  });

  it('reports failure when hooks are not yet installed', async () => {
    const env = await bootstrap('model: opus\nhooks: {}\n', true);
    envs.push(env);
    const result = await verify({
      home: env.home,
      hooksDir: env.hooksDir,
      spawnImpl: mockSpawnImpl({ exitCode: 0 }),
    });
    expect(result.ok).toBe(false);
    expect(result.checks.some((c) => !c.ok && c.name.includes('hive-mind hook entries'))).toBe(true);
  });

  it('passes after install with the 3 hook files on disk and CLI reachable', async () => {
    const env = await bootstrap('model: opus\nhooks: {}\n', true);
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
    expect(result.checks.find((c) => c.name === 'config.yaml contains hive-mind hook entries')?.ok).toBe(true);
    const diskChecks = result.checks.filter((c) => c.name.includes('readable on disk'));
    expect(diskChecks).toHaveLength(3); // exactly 3 — no pre-compact
    expect(diskChecks.every((c) => c.ok)).toBe(true);
  });

  it('reports CLI unreachable when the spawn exits non-zero', async () => {
    const env = await bootstrap('hooks: {}\n', true);
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

  it('flags missing hook script files even when the config entry is present', async () => {
    const env = await bootstrap('hooks: {}\n', false); // no hook .js files
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
    const env = await bootstrap('hooks: {}\n', true);
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

  // ── hermes-specific surfacing: headless consent / registration ────────

  it('surfaces the headless-consent check as PASS when auto-accept is seeded (default install)', async () => {
    const env = await bootstrap('hooks: {}\n', true);
    envs.push(env);
    await install({ home: env.home, hooksDir: env.hooksDir }); // auto-accept seeded by default
    const result = await verify({
      home: env.home,
      hooksDir: env.hooksDir,
      spawnImpl: mockSpawnImpl({ exitCode: 0 }),
    });
    const consent = result.checks.find((c) => c.name.toLowerCase().includes('consent'));
    expect(consent).toBeDefined();
    expect(consent?.ok).toBe(true);
    expect(consent?.detail?.toLowerCase()).toContain('hooks_auto_accept');
  });

  it('FAILS the headless-consent check + overall ok when auto-accept was NOT seeded', async () => {
    const env = await bootstrap('hooks: {}\n', true);
    envs.push(env);
    // --no-auto-accept: hooks silently never register under a headless launch.
    await install({ home: env.home, hooksDir: env.hooksDir, autoAccept: false });
    const result = await verify({
      home: env.home,
      hooksDir: env.hooksDir,
      spawnImpl: mockSpawnImpl({ exitCode: 0 }),
    });
    const consent = result.checks.find((c) => c.name.toLowerCase().includes('consent'));
    expect(consent?.ok).toBe(false);
    expect(consent?.detail?.toLowerCase()).toContain('hermes_accept_hooks=1');
    // The advisory failing drags overall ok to false.
    expect(result.ok).toBe(false);
  });
});
