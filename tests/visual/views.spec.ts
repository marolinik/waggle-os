/**
 * Legacy Visual Regression suite for the current AppShell.
 *
 * Keeps the original 7-view snapshot names, but routes directly to the modern
 * surfaces instead of clicking retired positional sidebar items.
 */

import { test, expect, type Page } from '@playwright/test';

const SKIP_PARAMS = 'skipOnboarding=true&skipBoot=true&skipBriefing=true&tier=power';

const VIEWS = [
  { name: 'chat', route: 'chat' },
  { name: 'memory', route: '/memory' },
  { name: 'events', route: '/settings/events' },
  { name: 'capabilities', route: '/skills' },
  { name: 'cockpit', route: '/home' },
  { name: 'mission-control', route: '/settings/mission-control' },
  { name: 'settings', route: '/settings?tab=models' },
] as const;

const THEME_LABELS = {
  dark: 'Dark Mode',
  light: 'Light Mode',
} as const;

const VISUAL_MODEL = 'openai/visual-fixture-model';
const VISUAL_DATE = '2026-07-12T23:39:00';
const VISUAL_SHELL_WORKSPACE = {
  id: 'visual-shell-workspace',
  name: 'Workspace',
  group: 'workspace',
  lastActive: '2026-07-12T19:39:00.000Z',
};
const VISUAL_WORKSPACE = {
  id: 'visual-workspace',
  name: 'Default Workspace',
  group: 'workspace',
  lastActive: '2026-07-12T20:39:00.000Z',
};
const VISUAL_PROVIDER_META = [
  ['anthropic', 'Anthropic'],
  ['openai', 'OpenAI'],
  ['google', 'Google'],
  ['deepseek', 'DeepSeek'],
  ['xai', 'xAI'],
  ['mistral', 'Mistral'],
  ['alibaba', 'Alibaba / Qwen'],
  ['minimax', 'MiniMax'],
  ['zhipu', 'GLM / Zhipu'],
  ['moonshot', 'Kimi / Moonshot'],
  ['perplexity', 'Perplexity'],
  ['openrouter', 'OpenRouter'],
  ['ollama', 'Local / Ollama'],
] as const;

function routeWithSkip(route: string) {
  const sep = route.includes('?') ? '&' : '?';
  return `${route}${sep}${SKIP_PARAMS}`;
}

async function firstWorkspaceChatRoute(page: Page) {
  const res = await page.request.get('/api/workspaces');
  const workspaces = await res.json();
  const workspaceId = Array.isArray(workspaces) ? workspaces[0]?.id : null;
  return workspaceId ? `/workspaces/${workspaceId}/chat` : '/home';
}

async function applyTheme(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript((mode) => {
    localStorage.setItem('waggle-theme', mode);
    localStorage.setItem('waggle:onboarding', JSON.stringify({
      completed: true,
      step: 7,
      tier: 'power',
      tooltipsDismissed: true,
    }));
    if (mode === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
  }, theme);
}

async function stubDynamicRuntime(page: Page, viewName: typeof VIEWS[number]['name']) {
  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
  const providers = VISUAL_PROVIDER_META.map(([id, name]) => ({
    id,
    name,
    hasKey: id === 'openai',
    badge: null,
    keyUrl: null,
    requiresKey: id !== 'ollama',
    models: id === 'openai'
      ? [{ id: VISUAL_MODEL, name: 'Visual Fixture Model', cost: '$$', speed: 'medium', source: 'provider-api' }]
      : [],
    modelsSource: id === 'openai' ? 'provider-api' : id === 'ollama' ? 'local-runtime' : 'requires-key',
    ...(id === 'ollama' ? { reachable: false } : {}),
  }));

  await page.route('**/api/providers', route => route.fulfill(json({
    providers,
    search: [],
    activeSearch: 'duckduckgo',
  })));
  await page.route('**/api/agent/status', route => route.fulfill(json({
    model: VISUAL_MODEL,
    tokensUsed: 0,
    costUsd: 0,
    isActive: false,
  })));
  await page.route('**/api/agent/model', route => route.fulfill(json({ model: VISUAL_MODEL })));
  await page.route('**/api/litellm/models', route => route.fulfill(json({ models: [VISUAL_MODEL] })));
  await page.route('**/api/local-inference/status', route => route.fulfill(json({
    servers: [],
    ollamaInstalled: false,
    totalLocalModels: 0,
  })));
  await page.route('**/api/settings/probe-model', route => route.fulfill(json({
    model: VISUAL_MODEL,
    configured: true,
    verified: true,
  })));
  await page.route('**/api/settings', route => {
    if (route.request().method() === 'GET') return route.fulfill(json({ defaultModel: VISUAL_MODEL }));
    return route.continue();
  });

  if (viewName === 'cockpit') {
    await page.route('**/api/home/briefing', route => route.fulfill(json({
      greeting: 'Welcome, Waggle — anything you discuss here will be remembered.',
      date: VISUAL_DATE,
      recentWorkspaces: [{
        ...VISUAL_WORKSPACE,
        pendingCount: 0,
        continueSessionId: 'visual-session',
      }],
      suggestedActions: [],
      upNext: [],
      activeModels: [VISUAL_MODEL],
      isFirstRun: false,
      needsReviewCount: 0,
    })));
    await page.route('**/api/home/overnight**', route => route.fulfill(json({
      consolidated: 0,
      artifactsCreated: 0,
      automationsCompleted: 0,
      failures: [],
      window: {
        from: '2026-07-11T21:39:00.000Z',
        to: VISUAL_DATE,
      },
    })));
    await page.route('**/api/workspaces', route => route.fulfill(json([
      VISUAL_SHELL_WORKSPACE,
      VISUAL_WORKSPACE,
    ])));
    await page.route('**/api/workspaces/*/context', route => {
      const workspace = route.request().url().includes('/visual-shell-workspace/')
        ? VISUAL_SHELL_WORKSPACE
        : VISUAL_WORKSPACE;
      return route.fulfill(json({
        workspace,
        summary: '',
        pendingTasks: [],
        stats: { memoryCount: 0, sessionCount: 0, fileCount: 0 },
      }));
    });
    await page.route('**/api/memory/search**', route => route.fulfill(json([])));
    await page.route('**/api/memory/stats**', route => route.fulfill(json({
      personal: { frameCount: 0, entityCount: 0, relationCount: 0 },
      workspace: { frameCount: 0, entityCount: 0, relationCount: 0 },
      total: { frameCount: 0, entityCount: 0, relationCount: 0 },
    })));
    await page.route('**/api/dreams**', route => route.fulfill(json([])));
  }
}

async function gotoVisualView(page: Page, view: typeof VIEWS[number], theme: 'dark' | 'light') {
  await stubDynamicRuntime(page, view.name);
  await applyTheme(page, theme);
  const route = view.route === 'chat' ? await firstWorkspaceChatRoute(page) : view.route;
  await page.goto(routeWithSkip(route), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.waggle-sidebar, [role="navigation"], main', { timeout: 15_000 });
  await page.waitForLoadState('domcontentloaded');
  await waitForVisualReady(page, view.name);
  await page.evaluate((mode) => {
    localStorage.setItem('waggle-theme', mode);
    if (mode === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
  }, theme);
  await page.waitForTimeout(800);
  await stabilizeVisuals(page);
}

async function waitForVisualReady(page: Page, viewName: typeof VIEWS[number]['name']) {
  await page.waitForFunction(() => !document.body.innerText.includes('Loading workspace'), null, { timeout: 15_000 }).catch(() => {});

  if (viewName === 'chat') {
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 15_000 });
    return;
  }
  if (viewName === 'memory') {
    await expect(page.getByTestId('memory-center-app')).toBeVisible({ timeout: 15_000 });
    return;
  }
  if (viewName === 'cockpit') {
    const cockpit = page.getByTestId('home-cockpit');
    await expect(cockpit).toBeVisible({ timeout: 15_000 });
    await expect(cockpit).toContainText('Welcome, Waggle — anything you discuss here will be remembered.');
    await expect(page.getByTestId('home-cockpit-ws-visual-workspace')).toHaveCount(1);
    await expect(page.getByTestId('home-cockpit-start-here')).toContainText('Continue Default Workspace');
    await expect(cockpit).not.toContainText(/E2E-Audit|Power Workspace/);
    await expect(page.getByTestId('home-cockpit-recall')).toHaveCount(0);
    await expect(page.getByTestId('home-dream-diary')).toHaveCount(0);
    return;
  }
  if (viewName === 'settings') {
    await expect(page.getByRole('tablist', { name: 'Settings sections' })).toBeVisible({ timeout: 15_000 });
    return;
  }
  if (viewName === 'capabilities') {
    await expect(page.locator('body')).toContainText(/skill|capabilit|marketplace/i, { timeout: 15_000 });
    return;
  }
  if (viewName === 'events') {
    await expect(page.locator('body')).toContainText(/event|timeline|agent/i, { timeout: 15_000 });
    return;
  }
  if (viewName === 'mission-control') {
    await expect(page.locator('body')).toContainText(/cockpit|health|cost/i, { timeout: 15_000 });
  }
}

async function stabilizeVisuals(page: Page) {
  await page.addStyleTag({
    content: `
      [aria-label="Notifications"],
      [data-testid="statusbar-memory-count"],
      [data-testid="statusbar-tokens"],
      [data-testid="statusbar-cost"],
      [data-testid="import-reminder-banner"],
      [data-testid="import-reminder-banner-cc"],
      [data-testid="home-cockpit-facts"],
      [data-testid="home-cockpit-start-here"] h2,
      [data-testid="home-cockpit-start-here"] h2 ~ p,
      [data-testid^="home-cockpit-ws-"] .truncate,
      [data-testid^="home-cockpit-ws-"] p,
      [data-testid^="home-cockpit-continue-"] {
        visibility: hidden !important;
      }
    `,
  });
  await page.evaluate(() => {
    const dynamicText = [
      /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s/i,
      /^\d{1,2}:\d{2}$/,
      /^Last active:/i,
      /^just now$/i,
      /^\d+[mhdw] ago$/i,
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/i,
      /^Upcoming:/i,
    ];
    for (const el of Array.from(document.querySelectorAll('span, p, button, time, div'))) {
      const text = (el.textContent ?? '').trim();
      if (dynamicText.some(pattern => pattern.test(text)) && (el.children.length === 0 || el.tagName === 'BUTTON')) {
        (el as HTMLElement).style.visibility = 'hidden';
      }
    }
  });
  await page.waitForTimeout(200);
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`Visual Regression - ${THEME_LABELS[theme]}`, () => {
    for (const view of VIEWS) {
      test(`${view.name} view - ${theme}`, async ({ page }) => {
        await gotoVisualView(page, view, theme);
        await expect(page).toHaveScreenshot(`${view.name}-${theme}.png`, {
          fullPage: false,
        });
      });
    }
  });
}
