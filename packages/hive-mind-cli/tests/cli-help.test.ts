import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const HIVE_MIND_CLI_DIR = path.join(ROOT, 'packages', 'hive-mind-cli');

function bin(name: string): string {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function makeDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hive-mind-cli-help-'));
}

interface AsyncRunResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

function run(command: string, args: string[], dataDir: string): Promise<AsyncRunResult> {
  return runInCwd(command, args, ROOT, dataDir);
}

function runInCwd(
  command: string,
  args: string[],
  cwd: string,
  dataDir: string,
): Promise<AsyncRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        HIVE_MIND_DATA_DIR: dataDir,
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

function personalMindExists(dataDir: string): boolean {
  return fs.existsSync(path.join(dataDir, 'personal.mind'));
}

const HIVE_MIND_CLI_PACKAGE_CLOSURE = [
  '@waggle/shared',
  '@waggle/hive-mind-core',
  '@waggle/hive-mind-wiki-compiler',
  '@waggle/hive-mind-mcp-server',
  '@waggle/hive-mind-cli',
] as const;

describe('hive-mind CLI subcommand help', () => {
  it('prints init help without creating a personal mind', async () => {
    const dataDir = makeDataDir();
    try {
      const result = await run(bin('npx'), [
        'tsx',
        'packages/hive-mind-cli/src/index.ts',
        'init',
        '--help',
      ], dataDir);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Usage: hive-mind-cli init');
      expect(result.stdout).toContain('--data-dir PATH');
      expect(result.stderr).toBe('');
      expect(personalMindExists(dataDir)).toBe(false);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('prints built status help without creating a personal mind', async () => {
    const dataDir = makeDataDir();
    try {
      const build = await run(bin('npm'), ['run', 'build', '--workspace', '@waggle/hive-mind-cli'], dataDir);
      expect(build.status).toBe(0);

      const result = await run(process.execPath, [
        path.join(HIVE_MIND_CLI_DIR, 'dist', 'index.js'),
        'status',
        '--help',
      ], dataDir);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Usage: hive-mind-cli status');
      expect(result.stdout).toContain('--json');
      expect(result.stderr).toBe('');
      expect(personalMindExists(dataDir)).toBe(false);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('installs the local package closure and runs npx subcommand help', async () => {
    const dataDir = makeDataDir();
    try {
      const packsDir = path.join(dataDir, 'packs');
      const projectDir = path.join(dataDir, 'project');
      fs.mkdirSync(packsDir, { recursive: true });
      fs.mkdirSync(projectDir, { recursive: true });

      const dependencies: Record<string, string> = {};
      for (const workspace of HIVE_MIND_CLI_PACKAGE_CLOSURE) {
        const build = await run(bin('npm'), ['run', 'build', '--workspace', workspace], dataDir);
        expect(build.status).toBe(0);

        const pack = await run(
          bin('npm'),
          ['pack', '--workspace', workspace, '--pack-destination', packsDir, '--json'],
          dataDir,
        );
        expect(pack.status).toBe(0);

        const [packResult] = JSON.parse(pack.stdout) as Array<{ filename: string }>;
        const tarball = path.join(packsDir, packResult.filename).replace(/\\/g, '/');
        dependencies[workspace] = `file:${tarball}`;
      }

      fs.writeFileSync(
        path.join(projectDir, 'package.json'),
        JSON.stringify({ private: true, type: 'module', dependencies }, null, 2),
      );

      const install = await runInCwd(
        bin('npm'),
        ['install', '--no-audit', '--no-fund', '--prefer-offline'],
        projectDir,
        dataDir,
      );
      expect(install.status).toBe(0);

      const result = await runInCwd(
        bin('npx'),
        ['hive-mind-cli', 'status', '--help'],
        projectDir,
        dataDir,
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Usage: hive-mind-cli status');
      expect(result.stdout).toContain('--json');
      expect(result.stderr).toBe('');
      expect(personalMindExists(dataDir)).toBe(false);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, 120_000);
});
