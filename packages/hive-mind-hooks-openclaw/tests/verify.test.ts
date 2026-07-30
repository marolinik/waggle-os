import { describe, expect, it, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { copyFile, mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { install } from '../src/install.js';
import { createRecallBootstrapFile } from '../src/handler.js';
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
  const handlerSource = join(distDir, 'handler.bundle.cjs');
  await writeFile(handlerSource, 'module.exports = async () => {};\n', 'utf-8');
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
    await writeFile(join(env.home, 'package.json'), '{"type":"module"}\n', 'utf-8');
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
    expect(result.checks.find((c) => c.name === 'handler.cjs readable on disk')?.ok).toBe(true);
    expect(result.checks.find((c) => c.name === 'handler.cjs matches trusted bundle')?.ok).toBe(true);
    expect(result.checks.find((c) => c.name === 'handler.js matches managed loader')?.ok).toBe(true);
    expect(result.checks.find((c) => c.name === 'hook package locks CommonJS mode')?.ok).toBe(true);
    expect(result.checks.find((c) => c.name === 'installed handler runtime-loads')?.ok).toBe(true);
    expect(result.checks.find((c) => c.name === 'hive-mind-cli reachable')?.ok).toBe(true);
  });

  it('rejects a tampered .cjs bundle without executing its side effect', async () => {
    const env = await bootstrap('{ "hooks": {} }');
    envs.push(env);
    await install({ home: env.home, handlerSourcePath: env.handlerSource });
    const sideEffectPath = join(env.home, 'tampered-handler-executed.txt');
    await writeFile(
      join(env.home, '.openclaw', 'hooks', 'hive-mind', 'handler.cjs'),
      [
        "const { writeFileSync } = require('node:fs');",
        `writeFileSync(${JSON.stringify(sideEffectPath)}, 'executed');`,
        'module.exports = async () => {};',
        '',
      ].join('\n'),
      'utf-8',
    );
    const result = await verify({
      home: env.home,
      handlerSourcePath: env.handlerSource,
      spawnImpl: mockSpawnImpl({ exitCode: 0 }),
    });
    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === 'handler.cjs matches trusted bundle')?.ok).toBe(false);
    const runtimeCheck = result.checks.find((c) => c.name === 'installed handler runtime-loads');
    expect(runtimeCheck?.ok).toBe(false);
    expect(runtimeCheck?.detail).toContain('skipped');
    expect(existsSync(sideEffectPath)).toBe(false);
  });

  it('runtime-loads trusted code without forwarding provider API secrets', async () => {
    const env = await bootstrap('{ "hooks": {} }');
    envs.push(env);
    const receiptPath = join(env.home, 'runtime-env.json');
    await writeFile(env.handlerSource, [
      "const { writeFileSync } = require('node:fs');",
      'module.exports = async () => {',
      `  writeFileSync(${JSON.stringify(receiptPath)}, JSON.stringify({`,
      '    openrouter: process.env.OPENROUTER_API_KEY ?? null,',
      '    anthropic: process.env.ANTHROPIC_API_KEY ?? null,',
      '  }));',
      '};',
      '',
    ].join('\n'), 'utf-8');
    await install({ home: env.home, handlerSourcePath: env.handlerSource });
    const previousOpenRouter = process.env['OPENROUTER_API_KEY'];
    const previousAnthropic = process.env['ANTHROPIC_API_KEY'];
    process.env['OPENROUTER_API_KEY'] = 'must-not-reach-runtime-probe';
    process.env['ANTHROPIC_API_KEY'] = 'must-not-reach-runtime-probe';
    try {
      const result = await verify({
        home: env.home,
        handlerSourcePath: env.handlerSource,
        spawnImpl: mockSpawnImpl({ exitCode: 0 }),
      });
      expect(result.ok).toBe(true);
      expect(JSON.parse(await readFile(receiptPath, 'utf-8'))).toEqual({
        openrouter: null,
        anthropic: null,
      });
    } finally {
      if (previousOpenRouter === undefined) delete process.env['OPENROUTER_API_KEY'];
      else process.env['OPENROUTER_API_KEY'] = previousOpenRouter;
      if (previousAnthropic === undefined) delete process.env['ANTHROPIC_API_KEY'];
      else process.env['ANTHROPIC_API_KEY'] = previousAnthropic;
    }
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

    const records: Array<{
      command: string;
      args: readonly string[];
      options?: { env?: NodeJS.ProcessEnv; windowsHide?: boolean };
    }> = [];
    const recordingSpawn = ((cmd: string, args: readonly string[], options?: SpawnOptions) => {
      records.push({
        command: cmd,
        args,
        options,
      });
      return mockSpawnImpl({ exitCode: 0 })(cmd, args);
    }) as unknown as typeof import('node:child_process').spawn;

    const previousOpenRouter = process.env['OPENROUTER_API_KEY'];
    const previousAnthropic = process.env['ANTHROPIC_API_KEY'];
    process.env['OPENROUTER_API_KEY'] = 'must-not-reach-cli-probe';
    process.env['ANTHROPIC_API_KEY'] = 'must-not-reach-cli-probe';
    try {
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
      expect(probeRecord.options?.env?.['OPENROUTER_API_KEY']).toBeUndefined();
      expect(probeRecord.options?.env?.['ANTHROPIC_API_KEY']).toBeUndefined();
      expect(probeRecord.options?.windowsHide).toBe(true);
      // Sanity: the pinned cli path was actually written into the pointer.
      const pointer = JSON.parse(await readFile(join(env.home, '.openclaw', 'hive-mind-install.json'), 'utf-8')) as Record<string, unknown>;
      expect(pointer['cli_path']).toBe(cliPath);
    } finally {
      if (previousOpenRouter === undefined) delete process.env['OPENROUTER_API_KEY'];
      else process.env['OPENROUTER_API_KEY'] = previousOpenRouter;
      if (previousAnthropic === undefined) delete process.env['ANTHROPIC_API_KEY'];
      else process.env['ANTHROPIC_API_KEY'] = previousAnthropic;
    }
  });

  it('uses the install-pinned Node runtime for a JavaScript CLI probe', async () => {
    const env = await bootstrap(undefined);
    envs.push(env);
    const cliPath = join(env.home, 'hive-mind-cli.js');
    const nodePath = join(env.home, 'waggle-node.exe');
    await writeFile(cliPath, 'console.log("hive-mind-cli");\n', 'utf-8');
    await copyFile(process.execPath, nodePath);
    await install({
      home: env.home,
      handlerSourcePath: env.handlerSource,
      cliPath,
      nodePath,
    });
    const pointer = JSON.parse(
      await readFile(join(env.home, '.openclaw', 'hive-mind-install.json'), 'utf-8'),
    ) as Record<string, unknown>;
    const binding = (pointer['extra'] as Record<string, unknown>)['runtime_binding'] as Record<string, unknown>;
    expect(binding).toMatchObject({
      version: 1,
      node_path: nodePath,
      cli_path: cliPath,
      node_sha256: createHash('sha256').update(await readFile(nodePath)).digest('hex'),
      cli_sha256: createHash('sha256').update(await readFile(cliPath)).digest('hex'),
    });
    const config = JSON.parse(await readFile(env.configPath, 'utf-8')) as {
      hooks: { internal: { entries: { 'hive-mind': { env: Record<string, string> } } } };
    };
    expect(config.hooks.internal.entries['hive-mind'].env['WAGGLE_HOOK_NODE_PATH']).toBe(nodePath);

    const probes: Array<{ command: string; args: readonly string[] }> = [];
    const recordingSpawn = ((command: string, args: readonly string[]) => {
      probes.push({ command, args });
      return mockSpawnImpl({ exitCode: 0 })(command, args);
    }) as unknown as typeof import('node:child_process').spawn;

    const result = await verify({
      home: env.home,
      handlerSourcePath: env.handlerSource,
      nodePath,
      spawnImpl: recordingSpawn,
    });

    expect(result.checks.find((c) => c.name === 'packaged Node matches verifier expectation')?.ok).toBe(true);
    expect(result.checks.find((c) => c.name === 'packaged Node matches install receipt')?.ok).toBe(true);
    expect(probes.at(-1)).toEqual({
      command: nodePath,
      args: [cliPath, '--help'],
    });
  });

  it.each(['node', 'cli'] as const)(
    'rejects changed pinned %s bytes without spawning the managed runtime',
    async (artifact) => {
      const env = await bootstrap(undefined);
      envs.push(env);
      const cliPath = join(env.home, 'hive-mind-cli.js');
      const nodePath = join(env.home, 'waggle-node.exe');
      await writeFile(cliPath, 'console.log("hive-mind-cli");\n', 'utf-8');
      await copyFile(process.execPath, nodePath);
      await install({
        home: env.home,
        handlerSourcePath: env.handlerSource,
        cliPath,
        nodePath,
      });
      await writeFile(
        artifact === 'node' ? nodePath : cliPath,
        `tampered-${artifact}`,
        'utf-8',
      );

      const probes: Array<{ command: string; args: readonly string[] }> = [];
      const recordingSpawn = ((command: string, args: readonly string[]) => {
        probes.push({ command, args });
        return mockSpawnImpl({ exitCode: 0 })(command, args);
      }) as unknown as typeof import('node:child_process').spawn;
      const result = await verify({
        home: env.home,
        handlerSourcePath: env.handlerSource,
        nodePath,
        spawnImpl: recordingSpawn,
      });

      const digestCheck = artifact === 'node'
        ? 'packaged Node matches install receipt'
        : 'packaged CLI matches install receipt';
      expect(result.checks.find((check) => check.name === digestCheck)?.ok).toBe(false);
      expect(result.checks.find((check) => check.name === 'installed handler runtime-loads')?.detail)
        .toContain('skipped');
      expect(result.checks.find((check) => check.name === 'hive-mind-cli reachable')?.detail)
        .toContain('skipped');
      expect(probes).toEqual([]);
    },
  );

  it('rejects a verifier CLI expectation that differs from the loader pin', async () => {
    const env = await bootstrap('{ "hooks": {} }');
    envs.push(env);
    const pinnedCliPath = '/abs/broken-pinned-cli.js';
    const overrideCliPath = '/abs/working-override-cli.js';
    await install({
      home: env.home,
      handlerSourcePath: env.handlerSource,
      cliPath: pinnedCliPath,
    });

    const invokedPaths: string[] = [];
    const recordingSpawn = ((
      cmd: string,
      args: readonly string[],
    ) => {
      const invokedPath = cmd === process.execPath ? args[0] : cmd;
      if (invokedPath !== undefined) invokedPaths.push(invokedPath);
      return mockSpawnImpl({
        exitCode: invokedPath === pinnedCliPath ? 127 : 0,
        stderr: invokedPath === pinnedCliPath ? 'not found' : '',
      })(cmd, args);
    }) as unknown as typeof import('node:child_process').spawn;

    const result = await verify({
      home: env.home,
      handlerSourcePath: env.handlerSource,
      cliPath: overrideCliPath,
      spawnImpl: recordingSpawn,
    });

    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === 'hive-mind-cli reachable')?.ok).toBe(false);
    expect(result.checks.find((c) => c.name === 'packaged CLI matches verifier expectation')?.ok)
      .toBe(false);
    expect(invokedPaths).not.toContain(pinnedCliPath);
    expect(invokedPaths).not.toContain(overrideCliPath);
  });

  it('rejects managed verification when the loader has no runtime pin', async () => {
    const env = await bootstrap('{ "hooks": {} }');
    envs.push(env);
    const overrideCliPath = '/abs/working-override-cli.js';
    await install({
      home: env.home,
      handlerSourcePath: env.handlerSource,
    });

    const invokedPaths: string[] = [];
    const recordingSpawn = ((
      cmd: string,
      args: readonly string[],
    ) => {
      const invokedPath = cmd === process.execPath ? args[0] : cmd;
      if (invokedPath !== undefined) invokedPaths.push(invokedPath);
      return mockSpawnImpl({
        exitCode: invokedPath === 'hive-mind-cli' ? 127 : 0,
        stderr: invokedPath === 'hive-mind-cli' ? 'not found' : '',
      })(cmd, args);
    }) as unknown as typeof import('node:child_process').spawn;

    const result = await verify({
      home: env.home,
      handlerSourcePath: env.handlerSource,
      cliPath: overrideCliPath,
      spawnImpl: recordingSpawn,
    });

    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === 'hive-mind-cli reachable')?.ok).toBe(false);
    expect(result.checks.find((c) => c.name === 'packaged CLI matches verifier expectation')?.ok)
      .toBe(false);
    expect(invokedPaths).not.toContain('hive-mind-cli');
    expect(invokedPaths).not.toContain(overrideCliPath);
  });

  it('rejects coordinated CLI substitution against the verifier expectation', async () => {
    const env = await bootstrap('{ "hooks": {} }');
    envs.push(env);
    const trustedCliPath = join(env.home, 'trusted-hive-mind-cli.js');
    const attackerCliPath = join(env.home, 'substituted-hive-mind-cli.js');
    const nodePath = join(env.home, 'waggle-node.exe');
    await writeFile(trustedCliPath, 'console.log("trusted");\n', 'utf-8');
    await writeFile(attackerCliPath, 'console.log("substituted");\n', 'utf-8');
    await copyFile(process.execPath, nodePath);
    await install({
      home: env.home,
      handlerSourcePath: env.handlerSource,
      cliPath: trustedCliPath,
      nodePath,
    });

    const pointerPath = join(env.home, '.openclaw', 'hive-mind-install.json');
    const pointer = JSON.parse(await readFile(pointerPath, 'utf-8')) as {
      cli_path: string;
      extra: { runtime_binding: Record<string, unknown> };
    };
    pointer.cli_path = attackerCliPath;
    pointer.extra.runtime_binding['cli_path'] = attackerCliPath;
    pointer.extra.runtime_binding['cli_sha256'] = createHash('sha256')
      .update(await readFile(attackerCliPath))
      .digest('hex');
    await writeFile(pointerPath, `${JSON.stringify(pointer, null, 2)}\n`, 'utf-8');

    const config = JSON.parse(await readFile(env.configPath, 'utf-8')) as {
      hooks: { internal: { entries: { 'hive-mind': { env: Record<string, string> } } } };
    };
    config.hooks.internal.entries['hive-mind'].env['WAGGLE_HIVE_MIND_CLI'] = attackerCliPath;
    await writeFile(env.configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
    const handlerPath = join(env.home, '.openclaw', 'hooks', 'hive-mind', 'handler.js');
    await writeFile(
      handlerPath,
      [
        `'use strict';`,
        `const handler = require('./handler.cjs');`,
        `module.exports = (event) => handler(event, ${JSON.stringify({
          cliPath: attackerCliPath,
          nodePath,
        })});`,
        '',
      ].join('\n'),
      'utf-8',
    );

    const probes: string[] = [];
    const recordingSpawn = ((command: string) => {
      probes.push(command);
      return mockSpawnImpl({ exitCode: 0 })(command, []);
    }) as unknown as typeof import('node:child_process').spawn;
    const result = await verify({
      home: env.home,
      handlerSourcePath: env.handlerSource,
      cliPath: trustedCliPath,
      nodePath,
      spawnImpl: recordingSpawn,
    });

    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === 'packaged CLI matches verifier expectation')?.ok)
      .toBe(false);
    expect(probes).toEqual([]);
  });

  it('rejects a stripped managed binding instead of downgrading to legacy verification', async () => {
    const env = await bootstrap('{ "hooks": {} }');
    envs.push(env);
    const cliPath = join(env.home, 'hive-mind-cli.js');
    const nodePath = join(env.home, 'waggle-node.exe');
    await writeFile(cliPath, 'console.log("trusted");\n', 'utf-8');
    await copyFile(process.execPath, nodePath);
    await install({
      home: env.home,
      handlerSourcePath: env.handlerSource,
      cliPath,
      nodePath,
    });

    const pointerPath = join(env.home, '.openclaw', 'hive-mind-install.json');
    const pointer = JSON.parse(await readFile(pointerPath, 'utf-8')) as Record<string, unknown>;
    delete pointer['cli_path'];
    const extra = pointer['extra'] as Record<string, unknown>;
    delete extra['runtime_binding'];
    await writeFile(pointerPath, `${JSON.stringify(pointer, null, 2)}\n`, 'utf-8');
    const config = JSON.parse(await readFile(env.configPath, 'utf-8')) as {
      hooks: { internal: { entries: { 'hive-mind': { env: Record<string, string> } } } };
    };
    delete config.hooks.internal.entries['hive-mind'].env['WAGGLE_HIVE_MIND_CLI'];
    delete config.hooks.internal.entries['hive-mind'].env['WAGGLE_HOOK_NODE_PATH'];
    await writeFile(env.configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
    const handlerPath = join(env.home, '.openclaw', 'hooks', 'hive-mind', 'handler.js');
    await writeFile(
      handlerPath,
      "'use strict';\nmodule.exports = require('./handler.cjs');\n",
      'utf-8',
    );

    const probes: string[] = [];
    const recordingSpawn = ((command: string) => {
      probes.push(command);
      return mockSpawnImpl({ exitCode: 0 })(command, []);
    }) as unknown as typeof import('node:child_process').spawn;
    const result = await verify({
      home: env.home,
      handlerSourcePath: env.handlerSource,
      cliPath,
      requireManagedRuntime: true,
      spawnImpl: recordingSpawn,
    });

    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === 'packaged CLI matches verifier expectation')?.ok)
      .toBe(false);
    expect(probes).toEqual([]);
  });

  it('rejects a tampered pointer cli_path without spawning it', async () => {
    const env = await bootstrap('{ "hooks": {} }');
    envs.push(env);
    const trustedCliPath = '/abs/trusted-cli.js';
    await install({ home: env.home, handlerSourcePath: env.handlerSource, cliPath: trustedCliPath });

    const pointerPath = join(env.home, '.openclaw', 'hive-mind-install.json');
    const pointer = JSON.parse(await readFile(pointerPath, 'utf-8')) as Record<string, unknown>;
    const tamperedCliPath = join(env.home, 'tampered-cli.js');
    pointer['cli_path'] = tamperedCliPath;
    await writeFile(pointerPath, `${JSON.stringify(pointer, null, 2)}\n`, 'utf-8');

    const spawned: Array<{ command: string; args: readonly string[] }> = [];
    const recordingSpawn = ((command: string, args: readonly string[], _options?: SpawnOptions) => {
      spawned.push({ command, args });
      return mockSpawnImpl({ exitCode: 0 })(command, args);
    }) as unknown as typeof import('node:child_process').spawn;
    const result = await verify({
      home: env.home,
      handlerSourcePath: env.handlerSource,
      spawnImpl: recordingSpawn,
    });

    expect(result.ok).toBe(false);
    expect(result.checks.find((c) => c.name === 'install pointer cli_path matches managed config')?.ok).toBe(false);
    expect(spawned.some(({ command, args }) => command === tamperedCliPath || args.includes(tamperedCliPath))).toBe(false);
  });

  it('escalates a timed-out CLI probe to SIGKILL before returning', async () => {
    const env = await bootstrap('{ "hooks": {} }');
    envs.push(env);
    await install({ home: env.home, handlerSourcePath: env.handlerSource });

    const signals: NodeJS.Signals[] = [];
    const hangingSpawn = (() => {
      const emitter = new EventEmitter();
      const child = Object.assign(emitter, {
        stdout: Readable.from([]),
        stderr: Readable.from([]),
        kill: vi.fn((signal: NodeJS.Signals) => {
          signals.push(signal);
          if (signal === 'SIGKILL') setImmediate(() => emitter.emit('exit', null, 'SIGKILL'));
          return true;
        }),
      }) as unknown as ChildProcess;
      return child;
    }) as unknown as typeof import('node:child_process').spawn;

    const result = await verify({
      home: env.home,
      handlerSourcePath: env.handlerSource,
      spawnImpl: hangingSpawn,
      cliProbeTimeoutMs: 10,
    });

    expect(result.ok).toBe(false);
    expect(signals).toEqual(['SIGTERM', 'SIGKILL']);
    expect(result.checks.find((c) => c.name === 'hive-mind-cli reachable')?.detail).toContain('timed out');
  });
});

describe('OpenClaw 2026.6.11 bootstrap file contract', () => {
  it('preserves recalled text in a path/name/content object accepted by the host sanitizer', () => {
    const recalled = 'hive-mind: recalled exact text';
    expect(createRecallBootstrapFile(recalled)).toEqual({
      path: 'HIVE_MIND_RECALL.md',
      name: 'HIVE_MIND_RECALL.md',
      content: recalled,
    });
  });
});
