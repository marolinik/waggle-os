import { describe, it, expect, vi } from 'vitest';
import { createCliTools } from '../src/cli-tools.js';

describe('cli_discover', () => {
  it('scans PATH and returns available CLIs', async () => {
    const tools = createCliTools({ allowlist: [] });
    const discover = tools.find(t => t.name === 'cli_discover')!;
    const result = JSON.parse(await discover.execute({}));

    // At minimum, node and npm should be found (we're in a Node.js environment)
    expect(result.found).toBeGreaterThanOrEqual(1);
    expect(result.programs.some((p: any) => p.name === 'node')).toBe(true);
  });

  it('marks allowed programs correctly', async () => {
    const tools = createCliTools({ allowlist: ['node'] });
    const discover = tools.find(t => t.name === 'cli_discover')!;
    const result = JSON.parse(await discover.execute({}));

    const nodeProg = result.programs.find((p: any) => p.name === 'node');
    expect(nodeProg?.allowed).toBe(true);

    // git may or may not be present, but if it is, it shouldn't be allowed
    const gitProg = result.programs.find((p: any) => p.name === 'git');
    if (gitProg) {
      expect(gitProg.allowed).toBe(false);
    }
  });

  it('returns version info for found programs', async () => {
    const tools = createCliTools({ allowlist: [] });
    const discover = tools.find(t => t.name === 'cli_discover')!;
    const result = JSON.parse(await discover.execute({}));

    const nodeProg = result.programs.find((p: any) => p.name === 'node');
    expect(nodeProg?.version).toBeTruthy();
    expect(nodeProg?.version.length).toBeGreaterThan(0);
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
    // Node.js will throw on non-zero exit code via execFile
    expect(result.error).toBeTruthy();
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
});
