import { test, expect, type Page } from '@playwright/test';

const SKIP_PARAMS = 'skipOnboarding=true&skipBoot=true&skipBriefing=true&tier=power';

function routeWithSkip(route: string): string {
  const sep = route.includes('?') ? '&' : '?';
  return `${route}${sep}${SKIP_PARAMS}`;
}

async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('.waggle-sidebar, [role="navigation"], main', { timeout: 15_000 });
  await page.waitForTimeout(300);
}

async function gotoLauncher(page: Page): Promise<void> {
  await page.goto(routeWithSkip('/launcher?watch=1'), { waitUntil: 'domcontentloaded' });
  await waitForShell(page);
  await expect(page.getByText('Tool Launcher')).toBeVisible({ timeout: 10_000 });
}

async function mockProcesses(page: Page): Promise<void> {
  await page.route('**/api/tools/processes', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ processes: [], total: 0 }),
  }));
}

const HOOK_RENDER_CASES = [
  { id: 'claude-code', displayName: 'Claude Code', packageName: '@waggle/hive-mind-hooks-claude-code', configDir: '.claude', configFile: 'settings.json' },
  { id: 'claude-desktop', displayName: 'Claude Desktop', packageName: '@waggle/hive-mind-hooks-claude-desktop', configDir: '.waggle/claude-desktop', configFile: 'claude_desktop_config.json' },
  { id: 'codex', displayName: 'Codex CLI', packageName: '@waggle/hive-mind-hooks-codex', configDir: '.codex', configFile: 'hooks.json' },
  { id: 'codex-desktop', displayName: 'Codex Desktop', packageName: '@waggle/hive-mind-hooks-codex-desktop', configDir: '.codex', configFile: 'hooks.json' },
  { id: 'hermes', displayName: 'Hermes Agent', packageName: '@waggle/hive-mind-hooks-hermes', configDir: '.hermes', configFile: 'config.yaml' },
] as const;

test.describe('Launcher rendered states', () => {
  test('sidecar-offline detection shows an inline retry action', async ({ page }) => {
    let detectCalls = 0;
    await mockProcesses(page);
    await page.route('**/api/tools/detect', route => {
      detectCalls += 1;
      if (detectCalls === 1) {
        return route.abort('failed');
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          platform: 'linux',
          detectedAt: '2026-07-08T00:00:00.000Z',
          tools: [
            {
              id: 'foo-cli',
              displayName: 'Foo CLI',
              launchable: true,
              hookCapable: false,
              builtin: false,
              acceptsInlinePrompt: true,
              installed: true,
              installedPath: '/usr/local/bin/foo',
              version: '1.0.0',
              hooksInstalled: false,
              hookPointerPath: null,
            },
          ],
        }),
      });
    });

    await gotoLauncher(page);

    await expect(page.getByText(/sidecar may be offline/i)).toBeVisible();
    await page.getByRole('button', { name: /retry tool detection/i }).click();
    await expect(page.getByText('Foo CLI')).toBeVisible();
    await expect(page.getByText(/sidecar may be offline/i)).not.toBeVisible();
  });

  test('long hook stderr is summarized instead of flooding the rendered panel', async ({ page }) => {
    await mockProcesses(page);
    await page.route('**/api/tools/detect', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        platform: 'linux',
        detectedAt: '2026-07-08T00:00:00.000Z',
        tools: [
          {
            id: 'codex',
            displayName: 'Codex CLI',
            launchable: true,
            hookCapable: true,
            builtin: true,
            acceptsInlinePrompt: true,
            installed: true,
            installedPath: '/usr/local/bin/codex',
            version: '1.0.0',
            hooksInstalled: false,
            hookPointerPath: null,
          },
        ],
      }),
    }));
    await page.route('**/api/tools/hooks', route => route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        action: 'verify',
        packageName: '@waggle/hive-mind-hooks-codex',
        stdout: '',
        stderr: [
          'failure detail 1: missing hook pointer',
          'failure detail 2: stale backup file',
          'failure detail 3: cli not trusted',
          'failure detail 4: config mismatch',
          'failure detail 5: lifecycle skipped',
          'failure detail 6: retry recommended',
          'failure detail 7: noisy internal trace',
          'failure detail 8: noisy internal trace',
        ].join('\n'),
        code: 1,
        error: 'verify failed',
      }),
    }));

    await gotoLauncher(page);
    await page.getByRole('button', { name: /^Verify$/ }).click();

    await expect(page.getByText(/verify failed/i)).toBeVisible();
    await expect(page.getByText('More output')).toBeVisible();
    await expect(page.getByText(/2 additional hook output lines hidden/i)).toBeVisible();
    await expect(page.getByText(/failure detail 8/i)).not.toBeVisible();
    await expect(page.getByText('Recovery')).toBeVisible();
  });

  test('standard hook install output renders changed file, pointer, backup, and recovery labels', async ({ page }) => {
    await mockProcesses(page);
    await page.route('**/api/tools/detect', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        platform: 'linux',
        detectedAt: '2026-07-08T00:00:00.000Z',
        tools: [
          {
            id: 'codex',
            displayName: 'Codex CLI',
            launchable: true,
            hookCapable: true,
            builtin: true,
            acceptsInlinePrompt: true,
            installed: true,
            installedPath: '/usr/local/bin/codex',
            version: '1.0.0',
            hooksInstalled: false,
            hookPointerPath: null,
          },
        ],
      }),
    }));
    await page.route('**/api/tools/hooks', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        action: 'install',
        packageName: '@waggle/hive-mind-hooks-codex',
        stdout: [
          'hive-mind/codex-hooks: install',
          '  - hooks.json:      /home/.codex/hooks.json',
          '  - install pointer: /home/.codex/hive-mind-install.json',
          '  - backup:          /home/.codex/hooks.json.hive-mind-backup.2026-07-08T19-00-00Z',
          'Done. Run "codex" once and approve the hook command if prompted.',
        ].join('\n'),
        stderr: '',
        code: 0,
      }),
    }));

    await gotoLauncher(page);
    await page.getByRole('button', { name: /install hooks/i }).click();

    await expect(page.getByText(/Codex CLI: install OK/i)).toBeVisible();
    await expect(page.getByText('Changed file', { exact: true })).toBeVisible();
    await expect(page.getByText('/home/.codex/hooks.json', { exact: true })).toBeVisible();
    await expect(page.getByText('Install pointer', { exact: true })).toBeVisible();
    await expect(page.getByText('/home/.codex/hive-mind-install.json', { exact: true })).toBeVisible();
    await expect(page.getByText('Backup', { exact: true })).toBeVisible();
    await expect(page.getByText(/hooks\.json\.hive-mind-backup/i)).toBeVisible();
    await expect(page.getByText('Recovery', { exact: true })).toBeVisible();
    await expect(page.getByText(/hive-mind\/codex-hooks: install/i)).not.toBeVisible();
  });

  test('all hook-capable tools render install, verify, and uninstall state transitions', async ({ page }) => {
    const hookState = new Map(HOOK_RENDER_CASES.map(tool => [tool.id, false]));

    await mockProcesses(page);
    await page.route('**/api/tools/detect', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        platform: 'linux',
        detectedAt: '2026-07-09T00:00:00.000Z',
        tools: HOOK_RENDER_CASES.map(tool => ({
          id: tool.id,
          displayName: tool.displayName,
          launchable: true,
          hookCapable: true,
          builtin: true,
          acceptsInlinePrompt: true,
          installed: true,
          installedPath: `/usr/local/bin/${tool.id}`,
          version: '1.0.0',
          hooksInstalled: hookState.get(tool.id) === true,
          hookPointerPath: hookState.get(tool.id) === true
            ? `/home/${tool.configDir}/hive-mind-install.json`
            : null,
        })),
      }),
    }));
    await page.route('**/api/tools/hooks', route => {
      const body = route.request().postDataJSON() as { id: string; action: 'install' | 'verify' | 'uninstall' };
      const tool = HOOK_RENDER_CASES.find(item => item.id === body.id);
      if (!tool) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, action: body.action, error: 'unknown tool' }),
        });
      }
      if (body.action === 'install') hookState.set(tool.id, true);
      if (body.action === 'uninstall') hookState.set(tool.id, false);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          action: body.action,
          packageName: tool.packageName,
          stdout: body.action === 'verify'
            ? 'All checks passed.'
            : [
              `hive-mind/${tool.id}-hooks: ${body.action}`,
              `  - ${tool.configFile}: /home/${tool.configDir}/${tool.configFile}`,
              `  - install pointer: /home/${tool.configDir}/hive-mind-install.json`,
              '  - backup removed: yes',
              'Done.',
            ].join('\n'),
          stderr: '',
          code: 0,
        }),
      });
    });

    await gotoLauncher(page);

    for (const tool of HOOK_RENDER_CASES) {
      const card = page.getByTestId(`launcher-tool-${tool.id}`);
      await expect(card.getByText(tool.displayName, { exact: true })).toBeVisible();

      await card.getByRole('button', { name: /install hooks/i }).click();
      await expect(page.getByText(`${tool.displayName}: install OK`, { exact: true })).toBeVisible();
      await expect(card.getByText('Hooks active', { exact: true })).toBeVisible();

      await card.getByRole('button', { name: /^Verify$/ }).click();
      await expect(page.getByText(`${tool.displayName}: verify OK`, { exact: true })).toBeVisible();

      await card.getByRole('button', { name: /uninstall hooks/i }).click();
      await expect(page.getByText(`${tool.displayName}: uninstall OK`, { exact: true })).toBeVisible();
      await expect(card.getByText('Hooks active', { exact: true })).not.toBeVisible();
      await expect(card.getByRole('button', { name: /install hooks/i })).toBeVisible();
    }
  });

  test('third-party adapter renders launch-only state and sends its prompt', async ({ page }) => {
    let launchPayload: unknown = null;
    await mockProcesses(page);
    await page.route('**/api/tools/detect', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        platform: 'linux',
        detectedAt: '2026-07-08T00:00:00.000Z',
        tools: [
          {
            id: 'foo-cli',
            displayName: 'Foo CLI',
            launchable: true,
            hookCapable: false,
            builtin: false,
            acceptsInlinePrompt: true,
            installed: true,
            installedPath: '/usr/local/bin/foo',
            version: '2.1.0',
            hooksInstalled: false,
            hookPointerPath: null,
          },
        ],
      }),
    }));
    await page.route('**/api/tools/launch', async route => {
      launchPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, pid: 9876 }),
      });
    });

    await gotoLauncher(page);
    await expect(page.getByText('Foo CLI', { exact: true })).toBeVisible();
    await expect(page.getByText(/v2\.1\.0/i)).toBeVisible();
    await expect(page.getByText(/Sent to:/i)).not.toBeVisible();
    await expect(page.getByText(/Launch only/i)).toBeVisible();
    await expect(page.getByText(/Hook management is not supported for this tool yet/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Launch$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /install hooks/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /^Verify$/ })).not.toBeVisible();

    await page.getByLabel(/optional launch prompt/i).fill('summarize adapter context');
    await expect(page.getByText('Sent to: Foo CLI', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Launch$/ }).click();

    await expect(page.getByText(/Launched Foo CLI with prompt \(pid 9876\)/i)).toBeVisible();
    expect(launchPayload).toMatchObject({
      id: 'foo-cli',
      installedPath: '/usr/local/bin/foo',
      prompt: 'summarize adapter context',
      observe: true,
    });
  });
});
