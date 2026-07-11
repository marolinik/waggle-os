import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

function makeTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-hook-packages-'));
}

interface CommandResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

async function runInCwd(
  command: string,
  args: string[],
  cwd: string,
  home: string,
  stripPath = false,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        NO_COLOR: '1',
        ...(stripPath ? {
          PATH: '', Path: '', WAGGLE_HOOK_NODE_PATH: process.execPath,
        } : {}),
      },
      shell: process.platform === 'win32' && command.endsWith('.cmd'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
}

interface HookPackageCase {
  id: string;
  packageName: string;
  configDir: string;
  configFile: string;
  precreateConfig?: string;
}

const HOOK_PACKAGE_CASES: HookPackageCase[] = [
  {
    id: 'claude-code',
    packageName: '@waggle/hive-mind-hooks-claude-code',
    configDir: '.claude',
    configFile: 'settings.json',
    precreateConfig: '{}\n',
  },
  {
    id: 'codex',
    packageName: '@waggle/hive-mind-hooks-codex',
    configDir: '.codex',
    configFile: 'hooks.json',
  },
  {
    id: 'codex-desktop',
    packageName: '@waggle/hive-mind-hooks-codex-desktop',
    configDir: '.codex',
    configFile: 'hooks.json',
  },
  {
    id: 'cursor',
    packageName: '@waggle/hive-mind-hooks-cursor',
    configDir: '.cursor',
    configFile: 'hooks.json',
  },
  {
    id: 'hermes',
    packageName: '@waggle/hive-mind-hooks-hermes',
    configDir: '.hermes',
    configFile: 'config.yaml',
  },
  {
    id: 'openclaw',
    packageName: '@waggle/hive-mind-hooks-openclaw',
    configDir: '.openclaw',
    configFile: 'openclaw.json',
  },
];

function writeFakeHiveMindCli(root: string): string {
  const cliPath = path.join(root, 'fake-hive-mind-cli.js');
  fs.writeFileSync(
    cliPath,
    [
      '#!/usr/bin/env node',
      "if (process.argv.includes('--help')) {",
      "  console.log('hive-mind-cli test help');",
      '  process.exit(0);',
      '}',
      "console.error('unexpected fake hive-mind-cli invocation');",
      'process.exit(1);',
      '',
    ].join('\n'),
    'utf8',
  );
  return cliPath;
}

function expectCommandOk(
  result: CommandResult,
  label: string,
): void {
  expect(
    result.status,
    [
      `${label} failed`,
      `status=${result.status ?? 'null'} signal=${result.signal ?? 'none'}`,
      `stdout:\n${result.stdout}`,
      `stderr:\n${result.stderr}`,
    ].join('\n'),
  ).toBe(0);
}

describe('hook package installed lifecycle UX', () => {
  it('runs the packaged CLI and hook lifecycles through Node with npm and npx absent', async () => {
    const tempRoot = makeTempRoot();
    try {
      const projectDir = path.join(tempRoot, 'project');
      fs.mkdirSync(projectDir, { recursive: true });

      const runtimeBuild = await runInCwd(process.execPath, ['scripts/build-hook-runtime.mjs'], ROOT, tempRoot);
      expectCommandOk(runtimeBuild, 'build npm-free hook runtime');

      const fakeCliPath = writeFakeHiveMindCli(tempRoot);
      const stagedCli = path.join(ROOT, 'packages', 'hive-mind-cli', 'dist', 'index.js');
      const cliHelp = await runInCwd(process.execPath, [stagedCli, '--help'], projectDir, tempRoot, true);
      expectCommandOk(cliHelp, 'direct hive-mind-cli');

      for (const hookPackage of HOOK_PACKAGE_CASES) {
        const home = path.join(tempRoot, `home-${hookPackage.id}`);
        const toolDir = path.join(home, hookPackage.configDir);
        const configPath = path.join(toolDir, hookPackage.configFile);
        const pointerPath = path.join(toolDir, 'hive-mind-install.json');
        fs.mkdirSync(toolDir, { recursive: true });
        if (hookPackage.precreateConfig !== undefined) {
          fs.writeFileSync(configPath, hookPackage.precreateConfig, 'utf8');
        }

        const packageDir = path.join(ROOT, 'packages', `hive-mind-hooks-${hookPackage.id}`);
        const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')) as {
          bin: Record<string, string>;
        };
        const hookEntry = path.join(packageDir, Object.values(manifest.bin)[0]);
        const runHook = (action: 'install' | 'verify' | 'uninstall') => runInCwd(
          process.execPath,
          action === 'install'
            ? [hookEntry, action, '--cli-path', fakeCliPath]
            : [hookEntry, action],
          projectDir,
          home,
          true,
        );

        const installResult = await runHook('install');
        expectCommandOk(installResult, `${hookPackage.id} install`);
        expect(installResult.stdout).toContain('install');
        expect(fs.existsSync(configPath)).toBe(true);
        expect(fs.existsSync(pointerPath)).toBe(true);
        if (hookPackage.id !== 'openclaw') {
          const installedConfig = fs.readFileSync(configPath, 'utf8');
          expect(
            installedConfig.includes(process.execPath)
              || installedConfig.includes(process.execPath.replace(/\\/g, '\\\\')),
            `${hookPackage.id} did not pin the bundled Node path`,
          ).toBe(true);
        }

        const verifyResult = await runHook('verify');
        expectCommandOk(verifyResult, `${hookPackage.id} verify`);
        expect(verifyResult.stdout).toContain('All checks passed.');

        const uninstallResult = await runHook('uninstall');
        expectCommandOk(uninstallResult, `${hookPackage.id} uninstall`);
        expect(uninstallResult.stdout).toContain('uninstall');
        expect(fs.existsSync(pointerPath)).toBe(false);

        if (hookPackage.precreateConfig !== undefined) {
          expect(fs.readFileSync(configPath, 'utf8')).toBe(hookPackage.precreateConfig);
        } else {
          expect(fs.existsSync(configPath)).toBe(false);
        }
      }
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }, 300_000);
});
