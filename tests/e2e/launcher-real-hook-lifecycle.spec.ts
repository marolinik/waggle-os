import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

type HookEnvelope = {
  ok: boolean;
  action: 'install' | 'verify' | 'uninstall';
  packageName: string;
  stdout: string;
  stderr: string;
  code: number;
  error?: string;
};

type HookToolCase = {
  id: 'claude-code' | 'codex' | 'codex-desktop' | 'cursor' | 'hermes' | 'openclaw';
  packageName: string;
  configDir: string;
  configFile: string;
  precreateConfig?: string;
  managedHookDir?: string;
};

const HOOK_TOOL_CASES: HookToolCase[] = [
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
    managedHookDir: path.join('hooks', 'hive-mind'),
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

test.describe('Launcher real hook lifecycle', () => {
  test('runs every hook-capable tool install, verify, and uninstall through the sidecar route in an isolated profile', async ({ request }) => {
    test.setTimeout(180_000);
    test.skip(
      process.env.WAGGLE_E2E_REAL_HOOKS !== '1' || !process.env.WAGGLE_E2E_HOOK_HOME,
      'Set WAGGLE_E2E_REAL_HOOKS=1 and WAGGLE_E2E_HOOK_HOME to a throwaway profile; also set USERPROFILE/HOME to that profile before the server starts.',
    );

    const hookHome = process.env.WAGGLE_E2E_HOOK_HOME!;
    fs.mkdirSync(hookHome, { recursive: true });
    const fakeCliPath = writeFakeHiveMindCli(hookHome);

    const postHook = async (tool: HookToolCase, action: 'install' | 'verify' | 'uninstall') => {
      const response = await request.post('/api/tools/hooks', {
        data: {
          id: tool.id,
          action,
          ...(action === 'install' ? { cliPath: fakeCliPath } : {}),
        },
      });
      expect(response.status(), await response.text()).toBe(200);
      const body = await response.json() as HookEnvelope;
      expect(body, body.error ?? body.stderr).toMatchObject({
        ok: true,
        action,
        packageName: tool.packageName,
        code: 0,
      });
      return body;
    };

    try {
      for (const tool of HOOK_TOOL_CASES) {
        const toolRoot = path.join(hookHome, tool.configDir);
        const configPath = path.join(toolRoot, tool.configFile);
        const pointerPath = path.join(toolRoot, 'hive-mind-install.json');
        const managedHookDir = tool.managedHookDir
          ? path.join(toolRoot, tool.managedHookDir)
          : null;

        await test.step(`${tool.id} hook lifecycle`, async () => {
          fs.rmSync(toolRoot, { recursive: true, force: true });
          if (tool.precreateConfig !== undefined) {
            fs.mkdirSync(toolRoot, { recursive: true });
            fs.writeFileSync(configPath, tool.precreateConfig, 'utf8');
          }

          const install = await postHook(tool, 'install');
          expect(install.stdout).toContain('install');
          expect(fs.existsSync(configPath)).toBe(true);
          expect(fs.existsSync(pointerPath)).toBe(true);
          if (managedHookDir) {
            expect(fs.existsSync(managedHookDir)).toBe(true);
          }

          const verify = await postHook(tool, 'verify');
          expect(verify.stdout).toContain('All checks passed.');

          const uninstall = await postHook(tool, 'uninstall');
          expect(uninstall.stdout).toContain('uninstall');
          expect(fs.existsSync(pointerPath)).toBe(false);
          if (tool.precreateConfig !== undefined) {
            expect(fs.readFileSync(configPath, 'utf8')).toBe(tool.precreateConfig);
          } else {
            expect(fs.existsSync(configPath)).toBe(false);
          }
          if (managedHookDir) {
            expect(fs.existsSync(managedHookDir)).toBe(false);
          }
        });
      }
    } finally {
      for (const tool of HOOK_TOOL_CASES) {
        fs.rmSync(path.join(hookHome, tool.configDir), { recursive: true, force: true });
      }
      fs.rmSync(fakeCliPath, { force: true });
    }
  });
});
