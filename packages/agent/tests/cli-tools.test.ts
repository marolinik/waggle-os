import { describe, it, expect, vi } from 'vitest';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCliTools } from '../src/cli-tools.js';
import { resolveToolCommandInvocationFromPath } from '../src/tool-command.js';

// The Windows supervisor gives taskkill /T /F up to 5s to finish walking the
// process tree. Keep the orphan sentinel beyond that documented cleanup budget.
const WINDOWS_DESCENDANT_SENTINEL_MS = 6_500;
const WINDOWS_DESCENDANT_ASSERT_MS = 7_000;

describe('Windows CLI command resolution', () => {
  it('resolves npm 11 shims without cmd.exe and isolates the lookup environment', async () => {
    let lookupEnv: NodeJS.ProcessEnv | undefined;
    const invocation = await resolveToolCommandInvocationFromPath(
      'npx',
      ['arg&still-literal', '%PATH%'],
      'win32',
      {
        env: {
          Path: 'C:\\Node',
          PATHEXT: '.EXE;.CMD',
          SystemRoot: 'C:\\Windows',
          WAGGLE_PHASE2_AMBIENT_SECRET: 'must-not-leak',
        },
        pathLookup: async (_binary, env) => {
          lookupEnv = env;
          return ['C:\\Node\\npx', 'C:\\Node\\npx.cmd'];
        },
        readTextFile: () => [
          '@ECHO OFF',
          'SET "NPX_CLI_JS=%~dp0\\node_modules\\npm\\bin\\npx-cli.js"',
          '"%NODE_EXE%" "%NPX_CLI_JS%" %*',
        ].join('\n'),
        fileExists: (path) => path === 'C:\\Node\\node.exe',
      },
    );

    expect(invocation).toEqual({
      binary: 'C:\\Node\\node.exe',
      args: [
        'C:\\Node\\node_modules\\npm\\bin\\npx-cli.js',
        'arg&still-literal',
        '%PATH%',
      ],
    });
    expect(lookupEnv?.WAGGLE_PHASE2_AMBIENT_SECRET).toBeUndefined();
    expect(Object.keys(lookupEnv ?? {}).sort()).toEqual(['PATH', 'PATHEXT', 'SYSTEMROOT']);
  });
});

describe('cli_discover', () => {
  it('scans PATH and returns available CLIs', async () => {
    const tools = createCliTools({ allowlist: [] });
    const discover = tools.find(t => t.name === 'cli_discover')!;
    const result = JSON.parse(await discover.execute({}));

    // At minimum, node and npm should be found (we're in a Node.js environment)
    expect(result.found).toBeGreaterThanOrEqual(1);
    expect(result.programs.some((p: { name: string }) => p.name === 'node')).toBe(true);
  });

  it('marks allowed programs correctly', async () => {
    const tools = createCliTools({ allowlist: ['node'] });
    const discover = tools.find(t => t.name === 'cli_discover')!;
    const result = JSON.parse(await discover.execute({}));

    const nodeProg = result.programs.find((p: { name: string }) => p.name === 'node');
    expect(nodeProg?.allowed).toBe(true);

    // git may or may not be present, but if it is, it shouldn't be allowed
    const gitProg = result.programs.find((p: { name: string }) => p.name === 'git');
    if (gitProg) {
      expect(gitProg.allowed).toBe(false);
    }
  });

  it('returns version info for found programs', async () => {
    const tools = createCliTools({ allowlist: [] });
    const discover = tools.find(t => t.name === 'cli_discover')!;
    const result = JSON.parse(await discover.execute({}));

    const nodeProg = result.programs.find((p: { name: string }) => p.name === 'node');
    expect(nodeProg?.version).toBeTruthy();
    expect(nodeProg?.version.length).toBeGreaterThan(0);
  });

  it.runIf(process.platform === 'win32')('discovers npm and npx Windows command shims', async () => {
    const tools = createCliTools({ allowlist: [] });
    const discover = tools.find(t => t.name === 'cli_discover')!;
    const result = JSON.parse(await discover.execute({}));

    expect(result.programs.some((p: { name: string }) => p.name === 'npm')).toBe(true);
    expect(result.programs.some((p: { name: string }) => p.name === 'npx')).toBe(true);
  });
});

describe('cli_execute', () => {
  it('executes allowed CLI program', async () => {
    const tools = createCliTools({ allowlist: ['node'] });
    const execute = tools.find(t => t.name === 'cli_execute')!;

    const result = JSON.parse(await execute.execute({
      program: 'node',
      args: ['--version'],
    }));

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/^v\d+/);
  });

  it('rejects programs not in allowlist', async () => {
    const tools = createCliTools({ allowlist: ['node'] });
    const execute = tools.find(t => t.name === 'cli_execute')!;

    const result = JSON.parse(await execute.execute({
      program: 'curl',
      args: ['--version'],
    }));

    expect(result.success).toBe(false);
    expect(result.error).toContain('not in the CLI allowlist');
  });

  it('respects wildcard allowlist', async () => {
    const tools = createCliTools({ allowlist: ['*'] });
    const execute = tools.find(t => t.name === 'cli_execute')!;

    const result = JSON.parse(await execute.execute({
      program: 'node',
      args: ['--version'],
    }));

    expect(result.success).toBe(true);
  });

  it('captures stdout and stderr separately', async () => {
    const tools = createCliTools({ allowlist: ['node'] });
    const execute = tools.find(t => t.name === 'cli_execute')!;

    const result = JSON.parse(await execute.execute({
      program: 'node',
      args: ['-e', 'console.log("out"); console.error("err")'],
    }));

    expect(result.success).toBe(true);
    expect(result.stdout).toBe('out');
    expect(result.stderr).toBe('err');
  });

  it('returns exit code in result', async () => {
    const tools = createCliTools({ allowlist: ['node'] });
    const execute = tools.find(t => t.name === 'cli_execute')!;

    const result = JSON.parse(await execute.execute({
      program: 'node',
      args: ['-e', 'process.exit(42)'],
    }));

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(42);
    expect(result.error).toBeTruthy();
  });

  it('normalizes a negative timeout instead of killing immediately', async () => {
    const tools = createCliTools({ allowlist: ['node'] });
    const execute = tools.find(t => t.name === 'cli_execute')!;

    const result = JSON.parse(await execute.execute({
      program: 'node',
      args: ['--version'],
      timeout: -1,
    }));

    expect(result.success).toBe(true);
  });

  it('logs execution to audit trail', async () => {
    const auditLog = vi.fn();
    const tools = createCliTools({ allowlist: ['node'], auditLog });
    const execute = tools.find(t => t.name === 'cli_execute')!;

    await execute.execute({ program: 'node', args: ['--version'] });

    expect(auditLog).toHaveBeenCalledWith({
      actionType: 'cli.execute.node',
      description: 'CLI: node --version',
    });
  });

  it('handles empty allowlist', async () => {
    const tools = createCliTools({ allowlist: [] });
    const execute = tools.find(t => t.name === 'cli_execute')!;

    const result = JSON.parse(await execute.execute({
      program: 'node',
      args: ['--version'],
    }));

    expect(result.success).toBe(false);
    expect(result.error).toContain('not in the CLI allowlist');
  });

  it('reads an updated allowlist without recreating the tools', async () => {
    let allowlist: string[] = [];
    const tools = createCliTools({ allowlist, getAllowlist: () => allowlist });
    const execute = tools.find(t => t.name === 'cli_execute')!;

    const denied = JSON.parse(await execute.execute({ program: 'node', args: ['--version'] }));
    expect(denied.success).toBe(false);

    allowlist = ['node'];
    const allowed = JSON.parse(await execute.execute({ program: 'node', args: ['--version'] }));
    expect(allowed.success).toBe(true);
  });

  it.runIf(process.platform === 'win32')('executes an allowed npm Windows command shim', async () => {
    const tools = createCliTools({ allowlist: ['npm'] });
    const execute = tools.find(t => t.name === 'cli_execute')!;

    const result = JSON.parse(await execute.execute({ program: 'npm', args: ['--version'] }));

    expect(result.success).toBe(true);
    expect(result.stdout).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('does not expose ambient secrets to allowed CLI processes', async () => {
    const previous = process.env.WAGGLE_PHASE2_AMBIENT_SECRET;
    process.env.WAGGLE_PHASE2_AMBIENT_SECRET = 'must-not-leak';
    try {
      const tools = createCliTools({ allowlist: ['node'] });
      const execute = tools.find(t => t.name === 'cli_execute')!;
      const result = JSON.parse(await execute.execute({
        program: 'node',
        args: ['-e', 'console.log(process.env.WAGGLE_PHASE2_AMBIENT_SECRET ?? "absent")'],
      }));

      expect(result.success).toBe(true);
      expect(result.stdout).toBe('absent');
    } finally {
      if (previous === undefined) delete process.env.WAGGLE_PHASE2_AMBIENT_SECRET;
      else process.env.WAGGLE_PHASE2_AMBIENT_SECRET = previous;
    }
  });

  it.runIf(process.platform === 'win32')('terminates descendants when an allowed CLI times out', async () => {
    const marker = join(tmpdir(), `waggle-cli-orphan-${process.pid}-${Date.now()}.txt`);
    const childScript = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'orphan'), ${WINDOWS_DESCENDANT_SENTINEL_MS})`;
    const parentScript = [
      'const { spawn } = require("node:child_process")',
      `const child = spawn(process.execPath, ['-e', ${JSON.stringify(childScript)}], { detached: true, stdio: 'ignore' })`,
      'child.unref()',
      'setInterval(() => {}, 1000)',
    ].join(';');
    const tools = createCliTools({ allowlist: ['node'] });
    const execute = tools.find(t => t.name === 'cli_execute')!;

    try {
      const result = JSON.parse(await execute.execute({
        program: 'node',
        args: ['-e', parentScript],
        timeout: 0.3,
      }));
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
      await new Promise(resolve => setTimeout(resolve, WINDOWS_DESCENDANT_ASSERT_MS));
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(marker, { force: true });
    }
  }, 20_000);

  it.runIf(process.platform === 'win32')('terminates descendants before rejecting oversized CLI output', async () => {
    const marker = join(tmpdir(), `waggle-cli-maxbuffer-orphan-${process.pid}-${Date.now()}.txt`);
    const childScript = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'orphan'), ${WINDOWS_DESCENDANT_SENTINEL_MS})`;
    const parentScript = [
      'const { spawn } = require("node:child_process")',
      `const child = spawn(process.execPath, ['-e', ${JSON.stringify(childScript)}], { detached: true, stdio: 'ignore' })`,
      'child.unref()',
      "process.stdout.write('x'.repeat(2 * 1024 * 1024))",
      'setInterval(() => {}, 1000)',
    ].join(';');
    const tools = createCliTools({ allowlist: ['node'] });
    const execute = tools.find(t => t.name === 'cli_execute')!;

    try {
      const result = JSON.parse(await execute.execute({
        program: 'node',
        args: ['-e', parentScript],
        timeout: 10,
      }));
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(-1);
      expect(result.error).toContain('maxBuffer');
      expect(result.stdout.length).toBeLessThanOrEqual(1024 * 1024);
      await new Promise(resolve => setTimeout(resolve, WINDOWS_DESCENDANT_ASSERT_MS));
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(marker, { force: true });
    }
  }, 20_000);

  it.runIf(process.platform === 'win32')('terminates descendants on time while the main event loop is blocked', async () => {
    const suffix = `${process.pid}-${Date.now()}`;
    const ready = join(tmpdir(), `waggle-cli-ready-${suffix}.txt`);
    const marker = join(tmpdir(), `waggle-cli-starved-orphan-${suffix}.txt`);
    const childScript = [
      `const fs = require('node:fs')`,
      `fs.writeFileSync(${JSON.stringify(ready)}, 'ready')`,
      `setTimeout(() => fs.writeFileSync(${JSON.stringify(marker)}, 'orphan'), ${WINDOWS_DESCENDANT_SENTINEL_MS})`,
      'setTimeout(() => {}, 30000)',
    ].join(';');
    const parentScript = [
      `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(childScript)}], { stdio: 'ignore' })`,
      'setTimeout(() => {}, 30000)',
    ].join(';');
    const tools = createCliTools({ allowlist: ['node'] });
    const execute = tools.find(t => t.name === 'cli_execute')!;

    try {
      const execution = Promise.resolve(execute.execute({
        program: 'node',
        args: ['-e', parentScript],
        timeout: 1,
      }));
      const readyDeadline = Date.now() + 5_000;
      while (!existsSync(ready) && Date.now() < readyDeadline) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(existsSync(ready)).toBe(true);

      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, WINDOWS_DESCENDANT_ASSERT_MS);
      const result = JSON.parse(await execution);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(ready, { force: true });
      rmSync(marker, { force: true });
    }
  }, 20_000);

  it.runIf(process.platform === 'win32')('preserves CLI success when completion delivery is event-loop blocked', async () => {
    const suffix = `${process.pid}-${Date.now()}`;
    const ready = join(tmpdir(), `waggle-cli-completion-ready-${suffix}.txt`);
    const finished = join(tmpdir(), `waggle-cli-completion-finished-${suffix}.txt`);
    const script = [
      `const fs = require('node:fs')`,
      `fs.writeFileSync(${JSON.stringify(ready)}, 'ready')`,
      'setTimeout(() => {',
      `  fs.writeFileSync(${JSON.stringify(finished)}, 'finished')`,
      "  console.log('cli-completed-before-deadline')",
      '}, 200)',
    ].join(';');
    const tools = createCliTools({ allowlist: ['node'] });
    const execute = tools.find(t => t.name === 'cli_execute')!;

    try {
      const execution = Promise.resolve(execute.execute({
        program: 'node',
        args: ['-e', script],
        timeout: 1,
      }));
      const readyDeadline = Date.now() + 5_000;
      while (!existsSync(ready) && Date.now() < readyDeadline) {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(existsSync(ready)).toBe(true);

      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_800);
      const result = JSON.parse(await execution);

      expect(existsSync(finished)).toBe(true);
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('cli-completed-before-deadline');
    } finally {
      rmSync(ready, { force: true });
      rmSync(finished, { force: true });
    }
  }, 10_000);
});
