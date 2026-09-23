import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const SOURCE_RESOURCES = path.join(ROOT, 'app', 'src-tauri', 'resources');
const SOURCE_BUNDLED_NODE = path.join(
  SOURCE_RESOURCES,
  process.platform === 'win32' ? 'node.exe' : 'node',
);
const SOURCE_STAGED_NODE_MODULES = path.join(SOURCE_RESOURCES, 'node_modules');
const SOURCE_STAGED_SERVICE = path.join(SOURCE_RESOURCES, 'service.js');
const SOURCE_STAGED_MEMORY_MCP = path.join(
  SOURCE_STAGED_NODE_MODULES,
  'waggle-memory-mcp',
  'dist',
  'index.js',
);
const REQUIRE_STAGED_RUNTIME = process.env.WAGGLE_VERIFY_STAGED_HOOK_RUNTIME === '1';
const ANY_STAGED_RUNTIME = [
  SOURCE_BUNDLED_NODE,
  SOURCE_STAGED_NODE_MODULES,
  SOURCE_STAGED_SERVICE,
].some((entry) => fs.existsSync(entry));
const COMPLETE_STAGED_RUNTIME = [
  SOURCE_BUNDLED_NODE,
  SOURCE_STAGED_NODE_MODULES,
  SOURCE_STAGED_SERVICE,
  SOURCE_STAGED_MEMORY_MCP,
].every((entry) => fs.existsSync(entry));

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
  hookNodePath = process.execPath,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      APPDATA: path.join(home, 'AppData', 'Roaming'),
      HERMES_HOME: path.join(home, '.hermes'),
      NO_COLOR: '1',
      ...(stripPath ? {
        PATH: '',
        Path: '',
        WAGGLE_HOOK_NODE_PATH: hookNodePath,
      } : {}),
    };
    delete env.NODE_PATH;
    delete env.NODE_OPTIONS;
    delete env.WAGGLE_MEMORY_MCP_ENTRY;
    delete env.WAGGLE_CLAUDE_DESKTOP_CONFIG_DIR;
    const child = spawn(command, args, {
      cwd,
      env,
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
  layout: (home: string) => HookLayout;
  precreateConfig?: string;
}

interface HookLayout {
  configDir: string;
  configPath: string;
  pointerPath: string;
}

function standardLayout(configDirName: string, configFile: string) {
  return (home: string): HookLayout => {
    const configDir = path.join(home, configDirName);
    return {
      configDir,
      configPath: path.join(configDir, configFile),
      pointerPath: path.join(configDir, 'hive-mind-install.json'),
    };
  };
}

function claudeDesktopLayout(home: string): HookLayout {
  let configDir: string;
  if (process.platform === 'win32') {
    configDir = path.join(home, 'AppData', 'Roaming', 'Claude');
  } else if (process.platform === 'darwin') {
    configDir = path.join(home, 'Library', 'Application Support', 'Claude');
  } else {
    configDir = path.join(home, '.config', 'Claude');
  }
  return {
    configDir,
    configPath: path.join(configDir, 'claude_desktop_config.json'),
    pointerPath: path.join(home, '.waggle', 'claude-desktop', 'hive-mind-install.json'),
  };
}

const HOOK_PACKAGE_CASES: HookPackageCase[] = [
  {
    id: 'claude-code',
    packageName: '@waggle/hive-mind-hooks-claude-code',
    layout: standardLayout('.claude', 'settings.json'),
    precreateConfig: '{}\n',
  },
  {
    id: 'claude-desktop',
    packageName: '@waggle/hive-mind-hooks-claude-desktop',
    layout: claudeDesktopLayout,
    precreateConfig: '{}\n',
  },
  {
    id: 'codex',
    packageName: '@waggle/hive-mind-hooks-codex',
    layout: standardLayout('.codex', 'hooks.json'),
    precreateConfig: '{ "custom": "preserve-codex", "hooks": {} }\n',
  },
  {
    id: 'codex-desktop',
    packageName: '@waggle/hive-mind-hooks-codex-desktop',
    layout: standardLayout('.codex', 'hooks.json'),
    precreateConfig: '{ "custom": "preserve-codex-desktop", "hooks": {} }\n',
  },
  {
    id: 'cursor',
    packageName: '@waggle/hive-mind-hooks-cursor',
    layout: standardLayout('.cursor', 'hooks.json'),
    precreateConfig: '{ "version": 1, "custom": "preserve-cursor", "hooks": {} }\n',
  },
  {
    id: 'hermes',
    packageName: '@waggle/hive-mind-hooks-hermes',
    layout: standardLayout('.hermes', 'config.yaml'),
    precreateConfig: '# preserve Hermes comment\nmodel: existing\nhooks: {}\n',
  },
  {
    id: 'openclaw',
    packageName: '@waggle/hive-mind-hooks-openclaw',
    layout: standardLayout('.openclaw', 'openclaw.json'),
    precreateConfig: '{\n  // preserve OpenClaw comment\n  model: "existing",\n}\n',
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

function expectNoSourceRuntimePaths(contents: string, label: string): void {
  for (const sourcePath of [ROOT, SOURCE_RESOURCES, SOURCE_BUNDLED_NODE, process.execPath]) {
    expect(contents, `${label} leaked source runtime path ${sourcePath}`).not.toContain(sourcePath);
    if (sourcePath.includes('\\')) {
      expect(contents, `${label} leaked JSON-escaped source runtime path ${sourcePath}`).not.toContain(
        sourcePath.replace(/\\/g, '\\\\'),
      );
      expect(contents, `${label} leaked slash-normalized source runtime path ${sourcePath}`).not.toContain(
        sourcePath.replace(/\\/g, '/'),
      );
    }
  }
}

describe('hook runtime clean-build contract', () => {
  it('orders workspace declaration prerequisites before packaged runtimes', () => {
    const buildScript = fs.readFileSync(
      path.join(ROOT, 'scripts', 'build-hook-runtime.mjs'),
      'utf8',
    );
    const projectOrder = Array.from(
      buildScript.matchAll(/['"](packages\/[^'"]+\/tsconfig\.json)['"]/g),
      (match) => match[1],
    );

    const requiredOrder = [
      'packages/shared/tsconfig.json',
      'packages/hive-mind-core/tsconfig.json',
      'packages/core/tsconfig.json',
      'packages/wiki-compiler/tsconfig.json',
      'packages/memory-mcp/tsconfig.json',
    ];

    expect(projectOrder.filter((project) => requiredOrder.includes(project))).toEqual(
      requiredOrder,
    );
  });
});

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
        const { configDir, configPath, pointerPath } = hookPackage.layout(home);
        fs.mkdirSync(configDir, { recursive: true });
        if (hookPackage.precreateConfig !== undefined) {
          fs.writeFileSync(configPath, hookPackage.precreateConfig, 'utf8');
        }

        const packageDir = path.join(ROOT, 'packages', `hive-mind-hooks-${hookPackage.id}`);
        const manifest = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')) as {
          bin: Record<string, string>;
        };
        const hookEntry = path.join(packageDir, Object.values(manifest.bin)[0]);
        const runHook = (action: 'install' | 'verify' | 'uninstall') => {
          const args = [hookEntry, action];
          if (action === 'install' || (action === 'verify' && hookPackage.id === 'openclaw')) {
            args.push('--cli-path', fakeCliPath);
          }
          if (action === 'install') {
            if (hookPackage.id === 'claude-desktop') {
              args.push('--mcp-entry', fakeCliPath);
            }
          }
          return runInCwd(process.execPath, args, projectDir, home, true);
        };

        const installResult = await runHook('install');
        expectCommandOk(installResult, `${hookPackage.id} install`);
        expect(installResult.stdout).toContain('install');
        expect(fs.existsSync(configPath)).toBe(true);
        expect(fs.existsSync(pointerPath)).toBe(true);
        if (hookPackage.id !== 'openclaw') {
          const installedConfig = fs.readFileSync(configPath, 'utf8');
          const nodePathHaystack = process.platform === 'win32'
            && (hookPackage.id === 'codex' || hookPackage.id === 'codex-desktop')
            ? [...installedConfig.matchAll(/-EncodedCommand ([A-Za-z0-9+/=]+)/g)]
                .map(match => Buffer.from(match[1], 'base64').toString('utf16le'))
                .join('\n')
            : installedConfig;
          expect(
            nodePathHaystack.includes(process.execPath)
              || nodePathHaystack.includes(process.execPath.replace(/\\/g, '\\\\')),
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
      // A just-exited hook process can still hold node.exe on Windows (EBUSY).
      fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    }
  }, 300_000);

  it.runIf(ANY_STAGED_RUNTIME || REQUIRE_STAGED_RUNTIME)(
    'runs staged Tauri hook lifecycles from a physical runtime copy',
    async () => {
      expect(
        COMPLETE_STAGED_RUNTIME,
        'staged hook verification requires service.js, bundled Node, node_modules, and memory MCP',
      ).toBe(true);

      const tempRoot = makeTempRoot();
      try {
        const isolatedResources = path.join(tempRoot, 'isolated-resources');
        const isolatedNodeModules = path.join(isolatedResources, 'node_modules');
        const bundledNode = path.join(
          isolatedResources,
          process.platform === 'win32' ? 'node.exe' : 'node',
        );
        fs.mkdirSync(isolatedResources, { recursive: true });
        fs.copyFileSync(SOURCE_BUNDLED_NODE, bundledNode);
        fs.chmodSync(bundledNode, fs.statSync(SOURCE_BUNDLED_NODE).mode);
        await fs.promises.cp(SOURCE_STAGED_NODE_MODULES, isolatedNodeModules, {
          recursive: true,
          dereference: true,
        });

        const relativeToRepo = path.relative(ROOT, isolatedResources);
        const copiedInsideRepo = relativeToRepo === ''
          || (!relativeToRepo.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeToRepo));
        expect(copiedInsideRepo).toBe(false);

        const projectDir = path.join(tempRoot, 'project');
        fs.mkdirSync(projectDir, { recursive: true });
        const stagedCli = path.join(
          isolatedNodeModules,
          '@waggle',
          'hive-mind-cli',
          'dist',
          'index.js',
        );
        const stagedMemoryMcp = path.join(
          isolatedNodeModules,
          'waggle-memory-mcp',
          'dist',
          'index.js',
        );
        expect(fs.existsSync(stagedMemoryMcp)).toBe(true);
        const cliHelp = await runInCwd(
          bundledNode,
          [stagedCli, '--help'],
          projectDir,
          tempRoot,
          true,
          bundledNode,
        );
        expectCommandOk(cliHelp, 'isolated staged hive-mind-cli');

        for (const hookPackage of HOOK_PACKAGE_CASES) {
          const home = path.join(tempRoot, `staged-home-${hookPackage.id}`);
          const { configDir, configPath, pointerPath } = hookPackage.layout(home);
          fs.mkdirSync(configDir, { recursive: true });
          if (hookPackage.precreateConfig !== undefined) {
            fs.writeFileSync(configPath, hookPackage.precreateConfig, 'utf8');
          }

          const packageDir = path.join(
            isolatedNodeModules,
            ...hookPackage.packageName.split('/'),
          );
          const manifest = JSON.parse(
            fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
          ) as { bin: Record<string, string> };
          const hookEntry = path.join(packageDir, Object.values(manifest.bin)[0]);
          const runHook = (action: 'install' | 'verify' | 'uninstall') => {
            const shouldPinCli = action === 'install'
              || (action === 'verify' && hookPackage.id === 'openclaw');
            const args = shouldPinCli
              ? [hookEntry, action, '--cli-path', stagedCli]
              : [hookEntry, action];
            return runInCwd(
              bundledNode,
              args,
              projectDir,
              home,
              true,
              bundledNode,
            );
          };

          const installResult = await runHook('install');
          expectCommandOk(installResult, `isolated staged ${hookPackage.id} install`);
          expect(fs.existsSync(configPath)).toBe(true);
          expect(fs.existsSync(pointerPath)).toBe(true);

          const installedConfig = fs.readFileSync(configPath, 'utf8');
          const installedPointer = fs.readFileSync(pointerPath, 'utf8');
          expectNoSourceRuntimePaths(installedConfig, `${hookPackage.id} config`);
          expectNoSourceRuntimePaths(installedPointer, `${hookPackage.id} pointer`);

          if (hookPackage.id === 'openclaw') {
            const installedHandler = path.join(
              home,
              '.openclaw',
              'hooks',
              'hive-mind',
              'handler.js',
            );
            const installedBundle = path.join(
              home,
              '.openclaw',
              'hooks',
              'hive-mind',
              'handler.cjs',
            );
            expect(fs.existsSync(installedHandler)).toBe(true);
            expect(fs.readFileSync(installedHandler, 'utf8')).toBe(
              [
                "'use strict';",
                "const handler = require('./handler.cjs');",
                `module.exports = (event) => handler(event, ${JSON.stringify({
                  cliPath: stagedCli,
                  nodePath: bundledNode,
                })});`,
                '',
              ].join('\n'),
            );
            expect(fs.readFileSync(installedBundle)).toEqual(
              fs.readFileSync(path.join(packageDir, 'dist', 'handler.bundle.cjs')),
            );
            expect(installedConfig).toContain(stagedCli.replace(/\\/g, '\\\\'));
            expect(installedConfig).toContain(bundledNode.replace(/\\/g, '\\\\'));
            expect(JSON.parse(installedPointer)).toMatchObject({
              cli_path: stagedCli,
              extra: {
                runtime_binding: {
                  version: 1,
                  cli_path: stagedCli,
                  node_path: bundledNode,
                },
              },
            });
            expectNoSourceRuntimePaths(
              fs.readFileSync(installedHandler, 'utf8'),
              'openclaw installed handler loader',
            );
            expectNoSourceRuntimePaths(
              fs.readFileSync(installedBundle, 'utf8'),
              'openclaw installed handler bundle',
            );
          } else if (hookPackage.id === 'claude-desktop') {
            const config = JSON.parse(installedConfig) as {
              mcpServers: Record<string, { command: string; args: string[] }>;
            };
            expect(config.mcpServers['waggle-memory']).toEqual({
              command: bundledNode,
              args: [stagedMemoryMcp],
            });
          } else {
            const nodePathHaystacks = process.platform === 'win32'
              && (hookPackage.id === 'codex' || hookPackage.id === 'codex-desktop')
              ? [...installedConfig.matchAll(/-EncodedCommand ([A-Za-z0-9+/=]+)/g)]
                  .map(match => Buffer.from(match[1], 'base64').toString('utf16le'))
              : [installedConfig];
            if (process.platform === 'win32'
              && (hookPackage.id === 'codex' || hookPackage.id === 'codex-desktop')) {
              expect(nodePathHaystacks).toHaveLength(4);
            }
            for (const nodePathHaystack of nodePathHaystacks) {
              expect(
                nodePathHaystack.includes(bundledNode)
                  || nodePathHaystack.includes(bundledNode.replace(/\\/g, '\\\\')),
                `${hookPackage.id} did not pin every command to the copied bundled Node path`,
              ).toBe(true);
              expectNoSourceRuntimePaths(
                nodePathHaystack,
                `${hookPackage.id} decoded runtime command`,
              );
            }
          }

          const verifyResult = await runHook('verify');
          expectCommandOk(verifyResult, `isolated staged ${hookPackage.id} verify`);
          expect(verifyResult.stdout).toContain('All checks passed.');

          const uninstallResult = await runHook('uninstall');
          expectCommandOk(uninstallResult, `isolated staged ${hookPackage.id} uninstall`);
          expect(fs.existsSync(pointerPath)).toBe(false);
          if (hookPackage.precreateConfig !== undefined) {
            expect(fs.readFileSync(configPath, 'utf8')).toBe(hookPackage.precreateConfig);
          } else {
            expect(fs.existsSync(configPath)).toBe(false);
          }
        }
      } finally {
        // The copied node.exe may still be held by a just-exited child on
        // Windows (EBUSY on the runner); let rm retry instead of failing the test.
        await fs.promises.rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      }
    },
    600_000,
  );
});
