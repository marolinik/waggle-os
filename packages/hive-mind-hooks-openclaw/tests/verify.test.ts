import { describe, expect, it, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { install } from '../src/install.js';
import { verify } from '../src/verify.js';

interface TestEnv {
  home: string;
  handlerSource: string;
  configPath: string;
}

async function bootstrap(initial: string | undefined): Promise<TestEnv> {
  const home = await mkdtemp(join(tmpdir(), 'hmocl-verify-'));
  const openclawDir = join(home, '.openclaw');
  await mkdir(openclawDir, { recursive: true });
  const configPath = join(openclawDir, 'openclaw.json');
  if (initial !== undefined) {
    await writeFile(configPath, initial, 'utf-8');
  }
  const distDir = join(home, 'fake-dist');
  await mkdir(distDir, { recursive: true });
  const handlerSource = join(distDir, 'handler.js');
  await writeFile(handlerSource, 'export default async () => {};\n', 'utf-8');
  return { home, handlerSource, configPath };
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

describe('verify (openclaw)', () => {
  const envs: TestEnv[] = [];
  afterEach(async () => {
    for (const env of envs.splice(0)) await rm(env.home, { recursive: true, force: true });
  });

  it('reports failure when openclaw.json is missing', async () => {
    const env = await bootstrap(undefined);
    envs.push(env);
    const result = await verify({
      home: env.home,
      handlerSourcePath: env.handlerSource,
      spawnImpl: mockSpawnImpl({ exitCode: 0 }),
    });
    expect(result.ok).toBe(false);
    expect(result.checks[0].name).toBe('openclaw.json exists');
    expect(result.checks[0].ok).toBe(false);
  });

  it('reports failure when the hive entry is not yet installed', async () => {
    const env = await bootstrap('{ "model": "opus", "hooks": {} }');
    envs.push(env);
    const result = await verify({
      home: env.home,
      handlerSourcePath: env.handlerSource,
      spawnImpl: mockSpawnImpl({ exitCode: 0 }),
    });
    expect(result.ok).toBe(false);
    expect(result.checks.some((c) => !c.ok && c.name.includes('hive-mind internal-hooks entry'))).toBe(true);
  });

  it('passes after install — entry present, subsystem enabled, dir+HOOK.md+handler on disk, CLI reachable', async () => {
    const env = await bootstrap('{ "model": "opus", "hooks": {} }');
    envs.push(env);
    await install({ home: env.home, handlerSourcePath: env.handlerSource });
    const result = await verify({
      home: env.home,
      handlerSourcePath: env.handlerSource,
      spawnImpl: mockSpawnImpl({ exitCode: 0 }),
    });
    expect(result.ok).toBe(true);
    expect(result.checks.find((c) => c.name.includes('hive-mind internal-hooks entry'))?.ok).toBe(true);
    expect(result.checks.find((c) => c.name === 'internal hooks subsystem enabled')?.ok).toBe(true);
    expect(result.checks.find((c) => c.name === 'managed hook dir exists')?.ok).toBe(true);
    expect(result.checks.find((c) => c.name === 'HOOK.md readable on disk')?.ok).toBe(true);
    expect(result.checks.find((c) => c.name === 'handler.js readable on disk')?.ok).toBe(true);
    expect(result.checks.find((c) => c.name === 'hive-mind-cli reachable')?.ok).toBe(true);
  });

  it('flags the activation advisory (FAIL) when internal.enabled is false even with the entry present', async () => {
    // Entry present but subsystem OFF — hooks are inert until opted in (§5.5/§6.2).
    const config = '{ "hooks": { "internal": { "enabled": false, "entries": { "hive-mind": { "enabled": true } } } } }';
    const env = await bootstrap(config);
    envs.push(env);
    // Write the managed dir so only the activation check is at fault.
    await install({ home: env.home, handlerSourcePath: env.handlerSource });
    // Re-disable the subsystem post-install to isolate the advisory.
    await writeFile(env.configPath, config, 'utf-8');
    const result = await verify({
      home: env.home,
      handlerSourcePath: env.handlerSource,
      spawnImpl: mockSpawnImpl({ exitCode: 0 }),
    });
    const enabledCheck = result.checks.find((c) => c.name === 'internal hooks subsystem enabled');
    expect(enabledCheck?.ok).toBe(false);
    expect(enabledCheck?.detail?.toLowerCase()).toContain('hooks are off');
    expect(result.ok).toBe(false);
  });

  it('reports CLI unreachable when the spawn exits non-zero', async () => {
    const env = await bootstrap('{ "hooks": {} }');
    envs.push(env);
    await install({ home: env.home, handlerSourcePath: env.handlerSource });
    const result = await verify({
      home: env.home,
      handlerSourcePath: env.handlerSource,
      spawnImpl: mockSpawnImpl({ exitCode: 127, stderr: 'command not found' }),
    });
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === 'hive-mind-cli reachable')?.ok).toBe(false);
  });

  it('flags a missing handler.js even when the config entry is present', async () => {
    const env = await bootstrap('{ "hooks": {} }');
    envs.push(env);
    await install({ home: env.home, handlerSourcePath: env.handlerSource });
    // Remove the installed handler from the managed dir.
    await rm(join(env.home, '.openclaw', 'hooks', 'hive-mind', 'handler.js'), { force: true });
    const result = await verify({
      home: env.home,
      handlerSourcePath: env.handlerSource,
      spawnImpl: mockSpawnImpl({ exitCode: 0 }),
    });
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === 'handler.js readable on disk')?.ok).toBe(false);
  });

  it('uses cli_path from the install pointer for the probe (node <path> --help)', async () => {
    const env = await bootstrap('{ "hooks": {} }');
    envs.push(env);
    const cliPath = '/abs/from/pointer.js';
    await install({ home: env.home, handlerSourcePath: env.handlerSource, cliPath });

    const records: Array<{ command: string; args: readonly string[] }> = [];
    const recordingSpawn = ((cmd: string, args: readonly string[]) => {
      records.push({ command: cmd, args });
      return mockSpawnImpl({ exitCode: 0 })(cmd, args);
    }) as typeof import('node:child_process').spawn;

    const result = await verify({
      home: env.home,
      handlerSourcePath: env.handlerSource,
      spawnImpl: recordingSpawn,
    });
    expect(result.ok).toBe(true);
    const probeRecord = records[records.length - 1];
    expect(probeRecord.command).toBe(process.execPath);
    expect(probeRecord.args[0]).toBe(cliPath);
    expect(probeRecord.args[1]).toBe('--help');
    // Sanity: the pinned cli path was actually written into the pointer.
    const pointer = JSON.parse(await readFile(join(env.home, '.openclaw', 'hive-mind-install.json'), 'utf-8')) as Record<string, unknown>;
    expect(pointer['cli_path']).toBe(cliPath);
  });
});
