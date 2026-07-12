import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const MARKETPLACE_DIR = path.join(ROOT, 'packages', 'marketplace');

function bin(name: string): string {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function makeHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-market-cli-'));
}

interface AsyncRunResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

function run(
  command: string,
  args: string[],
  home: string,
  cwd = ROOT,
): Promise<AsyncRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
      },
      shell: process.platform === 'win32' && command.endsWith('.cmd'),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

function marketplaceDbExists(home: string): boolean {
  return fs.existsSync(path.join(home, '.waggle', 'marketplace.db'));
}

function readPackageJson(): {
  main: string;
  types: string;
  exports: Record<string, { import: string; types: string }>;
} {
  return JSON.parse(fs.readFileSync(path.join(MARKETPLACE_DIR, 'package.json'), 'utf8'));
}

describe('marketplace CLI runtime UX', () => {
  it('rejects unknown commands without opening the marketplace database', async () => {
    const home = makeHome();
    try {
      const result = await run(bin('npx'), [
        'tsx',
        'packages/marketplace/src/cli.ts',
        'definitely-not-a-command',
      ], home);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Unknown command: definitely-not-a-command');
      expect(result.stdout).toContain('Usage:');
      expect(marketplaceDbExists(home)).toBe(false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('runs built help under Node ESM without opening the marketplace database', async () => {
    const home = makeHome();
    try {
      const build = await run(bin('npm'), ['run', 'build', '--workspace', '@waggle/marketplace'], home);
      expect(build.status).toBe(0);

      const result = await run(process.execPath, [path.join(MARKETPLACE_DIR, 'dist', 'cli.js'), '--help'], home);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Waggle Marketplace CLI');
      expect(result.stdout).toContain('Usage:');
      expect(result.stderr).toBe('');
      expect(marketplaceDbExists(home)).toBe(false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('publishes package entrypoints that exist in the packed files', async () => {
    const home = makeHome();
    try {
      const build = await run(bin('npm'), ['run', 'build', '--workspace', '@waggle/marketplace'], home);
      expect(build.status).toBe(0);

      const pack = await run(bin('npm'), ['pack', '--workspace', '@waggle/marketplace', '--dry-run', '--json'], home);
      expect(pack.status).toBe(0);
      const [packResult] = JSON.parse(pack.stdout) as Array<{ files: Array<{ path: string }> }>;
      const packedFiles = new Set(packResult.files.map((file) => file.path.replace(/\\/g, '/')));
      const pkg = readPackageJson();

      expect(pkg.main).toBe('dist/index.js');
      expect(pkg.types).toBe('dist/index.d.ts');
      expect(pkg.exports['.']).toEqual({
        import: './dist/index.js',
        types: './dist/index.d.ts',
      });
      expect(packedFiles.has('dist/index.js')).toBe(true);
      expect(packedFiles.has('dist/index.d.ts')).toBe(true);
      expect(packedFiles.has('dist/cli.js')).toBe(true);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('installs the packed CLI and runs npx help plus invalid-command recovery', async () => {
    const home = makeHome();
    try {
      const build = await run(bin('npm'), ['run', 'build', '--workspace', '@waggle/marketplace'], home);
      expect(build.status).toBe(0);

      const pack = await run(
        bin('npm'),
        ['pack', '--workspace', '@waggle/marketplace', '--pack-destination', home, '--json'],
        home,
      );
      expect(pack.status).toBe(0);

      const [packResult] = JSON.parse(pack.stdout) as Array<{ filename: string }>;
      const projectDir = path.join(home, 'project');
      fs.mkdirSync(projectDir, { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ private: true, type: 'module' }, null, 2),
      );

      const install = await run(
        bin('npm'),
        [
          'install',
          path.join(home, packResult.filename),
          '--no-audit',
          '--no-fund',
          '--prefer-offline',
        ],
        home,
        projectDir,
      );
      expect(install.status).toBe(0);

      const help = await run(bin('npx'), ['waggle-market', '--help'], home, projectDir);
      expect(help.status).toBe(0);
      expect(help.stdout).toContain('Waggle Marketplace CLI');
      expect(help.stdout).toContain('Usage:');
      expect(help.stderr).toBe('');
      expect(marketplaceDbExists(home)).toBe(false);

      const invalid = await run(bin('npx'), ['waggle-market', 'definitely-not-a-command'], home, projectDir);
      expect(invalid.status).toBe(1);
      expect(invalid.stderr).toContain('Unknown command: definitely-not-a-command');
      expect(invalid.stdout).toContain('Usage:');
      expect(marketplaceDbExists(home)).toBe(false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }, 120_000);
});
