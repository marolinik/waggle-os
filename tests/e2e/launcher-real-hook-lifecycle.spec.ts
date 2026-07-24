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
  id: 'claude-code' | 'claude-desktop' | 'codex' | 'codex-desktop' | 'cursor' | 'hermes' | 'openclaw';
  packageName: string;
  configPath: string;
  pointerPath: string;
  cleanupDirs: string[];
  precreateConfig?: string;
  managedHookDir?: string;
};

const HOOK_TOOL_CASES: HookToolCase[] = [
  {
    id: 'claude-code',
    packageName: '@waggle/hive-mind-hooks-claude-code',
    configPath: path.join('.claude', 'settings.json'),
    pointerPath: path.join('.claude', 'hive-mind-install.json'),
    cleanupDirs: ['.claude'],
    precreateConfig: '{}\n',
  },
  {
    id: 'claude-desktop',
    packageName: '@waggle/hive-mind-hooks-claude-desktop',
    configPath: path.join('AppData', 'Roaming', 'Claude', 'claude_desktop_config.json'),
    pointerPath: path.join('.waggle', 'claude-desktop', 'hive-mind-install.json'),
    cleanupDirs: [path.join('AppData', 'Roaming', 'Claude'), path.join('.waggle', 'claude-desktop')],
    precreateConfig: '{}\n',
  },
  {
    id: 'codex',
    packageName: '@waggle/hive-mind-hooks-codex',
    configPath: path.join('.codex', 'hooks.json'),
    pointerPath: path.join('.codex', 'hive-mind-install.json'),
    cleanupDirs: ['.codex'],
  },
  {
    id: 'codex-desktop',
    packageName: '@waggle/hive-mind-hooks-codex-desktop',
    configPath: path.join('.codex', 'hooks.json'),
    pointerPath: path.join('.codex', 'hive-mind-install.json'),
    cleanupDirs: ['.codex'],
  },
  {
    id: 'cursor',
    packageName: '@waggle/hive-mind-hooks-cursor',
    configPath: path.join('.cursor', 'hooks.json'),
    pointerPath: path.join('.cursor', 'hive-mind-install.json'),
    cleanupDirs: ['.cursor'],
  },
  {
    id: 'hermes',
    packageName: '@waggle/hive-mind-hooks-hermes',
    configPath: path.join('.hermes', 'config.yaml'),
    pointerPath: path.join('.hermes', 'hive-mind-install.json'),
    cleanupDirs: ['.hermes'],
  },
  {
    id: 'openclaw',
    packageName: '@waggle/hive-mind-hooks-openclaw',
    configPath: path.join('.openclaw', 'openclaw.json'),
    pointerPath: path.join('.openclaw', 'hive-mind-install.json'),
    cleanupDirs: ['.openclaw'],
    managedHookDir: path.join('.openclaw', 'hooks', 'hive-mind'),
  },
];

function selectRequestedHookTools(tools: readonly HookToolCase[]): HookToolCase[] {
  const raw = process.env.WAGGLE_E2E_HOST_IDS;
  if (raw === undefined) return [...tools];

  const rawIds = raw.split(',');
  if (rawIds.some(id => id.trim().length === 0)) {
    throw new Error('Invalid WAGGLE_E2E_HOST_IDS: empty host ID.');
  }
  const requestedIds = rawIds.map(id => id.trim());
  const duplicateIds = requestedIds.filter(
    (id, index) => requestedIds.indexOf(id) !== index,
  );
  if (duplicateIds.length > 0) {
    throw new Error(`Duplicate WAGGLE_E2E_HOST_IDS: ${[...new Set(duplicateIds)].join(', ')}`);
  }
  const availableIds = new Set(tools.map(tool => tool.id));
  const unknownIds = requestedIds.filter(
    id => !availableIds.has(id as HookToolCase['id']),
  );
  if (unknownIds.length > 0) {
    throw new Error(`Unknown WAGGLE_E2E_HOST_IDS: ${unknownIds.join(', ')}`);
  }
  const requested = new Set(requestedIds);
  return tools.filter(tool => requested.has(tool.id));
}

function normalized(value: string): string {
  return path.resolve(value).toLowerCase();
}

function inside(root: string, relativePath: string): string {
  const candidate = path.resolve(root, relativePath);
  const relative = path.relative(path.resolve(root), candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing path outside isolated hook profile: ${candidate}`);
  }
  return candidate;
}

function safeRemove(root: string, relativePath: string): void {
  fs.rmSync(inside(root, relativePath), { recursive: true, force: true });
}

function assertIsolatedWindowsProfile(hookHome: string): void {
  const guardedRoot = process.env.WAGGLE_E2E_TEMP_ROOT;
  expect(guardedRoot, 'guarded runner must issue WAGGLE_E2E_TEMP_ROOT').toBeTruthy();
  const relativeToRoot = path.relative(path.resolve(guardedRoot!), path.resolve(hookHome));
  expect(relativeToRoot, 'hook profile must be a child of the guarded temp root').not.toMatch(/^\.\.|^[\\/]/);
  expect(relativeToRoot, 'hook profile must not be the guarded temp root itself').not.toBe('');
  expect(normalized(process.env.USERPROFILE ?? ''), 'isolated USERPROFILE').toBe(normalized(hookHome));
  expect(normalized(process.env.HOME ?? ''), 'isolated HOME').toBe(normalized(hookHome));
  expect(normalized(process.env.APPDATA ?? ''), 'isolated APPDATA').toBe(
    normalized(path.join(hookHome, 'AppData', 'Roaming')),
  );
  expect(normalized(process.env.LOCALAPPDATA ?? ''), 'isolated LOCALAPPDATA').toBe(
    normalized(path.join(hookHome, 'AppData', 'Local')),
  );
}

test.describe('Launcher real Windows hook lifecycle', () => {
  test('runs requested packaged hook routes with server-owned CLI wiring and reversible temp-profile cleanup', async ({ request }, testInfo) => {
    test.setTimeout(240_000);
    test.skip(process.platform !== 'win32', 'This real-host safety lane is Windows-specific.');
    test.skip(
      process.env.WAGGLE_E2E_REAL_HOOKS !== '1' || !process.env.WAGGLE_E2E_HOOK_HOME,
      'Use scripts/test-windows-external-agents.ps1 to provide a throwaway Windows profile.',
    );

    const hookToolCases = selectRequestedHookTools(HOOK_TOOL_CASES);
    const hookHome = path.resolve(process.env.WAGGLE_E2E_HOOK_HOME!);
    assertIsolatedWindowsProfile(hookHome);
    fs.mkdirSync(hookHome, { recursive: true });
    const completed: Array<{ id: HookToolCase['id']; actions: string[]; packagedCli: string }> = [];

    const postHook = async (tool: HookToolCase, action: HookEnvelope['action']) => {
      const response = await request.post('/api/tools/hooks', {
        data: { id: tool.id, action },
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
      for (const tool of hookToolCases) {
        const configPath = inside(hookHome, tool.configPath);
        const pointerPath = inside(hookHome, tool.pointerPath);
        const managedHookDir = tool.managedHookDir ? inside(hookHome, tool.managedHookDir) : null;

        await test.step(`${tool.id} hook install -> verify -> uninstall`, async () => {
          for (const cleanupDir of tool.cleanupDirs) safeRemove(hookHome, cleanupDir);
          if (tool.precreateConfig !== undefined) {
            fs.mkdirSync(path.dirname(configPath), { recursive: true });
            fs.writeFileSync(configPath, tool.precreateConfig, 'utf8');
          }

          const install = await postHook(tool, 'install');
          expect(install.stdout).toContain('install');
          expect(fs.existsSync(configPath)).toBe(true);
          expect(fs.existsSync(pointerPath)).toBe(true);
          if (managedHookDir) expect(fs.existsSync(managedHookDir)).toBe(true);

          const pointer = JSON.parse(fs.readFileSync(pointerPath, 'utf8')) as { cli_path?: unknown };
          expect(pointer.cli_path, 'route pins the packaged hive-mind CLI').toEqual(expect.any(String));
          const packagedCli = path.resolve(String(pointer.cli_path));
          expect(fs.existsSync(packagedCli), `packaged CLI exists: ${packagedCli}`).toBe(true);
          expect(packagedCli.replace(/\\/g, '/')).toMatch(/hive-mind-cli\/dist\/index\.js$/);

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
          if (managedHookDir) expect(fs.existsSync(managedHookDir)).toBe(false);
          completed.push({ id: tool.id, actions: ['install', 'verify', 'uninstall'], packagedCli });
        });
      }

      await testInfo.attach('windows-hook-route-summary', {
        body: Buffer.from(JSON.stringify({ hookHome, completed }, null, 2)),
        contentType: 'application/json',
      });
      expect(completed.map(item => item.id)).toEqual(hookToolCases.map(tool => tool.id));
    } finally {
      for (const tool of hookToolCases) {
        for (const cleanupDir of tool.cleanupDirs) safeRemove(hookHome, cleanupDir);
      }
    }
  });
});
