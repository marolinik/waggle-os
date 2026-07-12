import { expect, test, type Page, type Route } from '@playwright/test';
import Fastify, { type FastifyInstance } from 'fastify';
import { securityMiddleware } from '../../server/src/local/security-middleware.js';

const teamSlug = 'design-team';
const authToken = 'test-token';
const realAuthTeamSlug = 'admin-real-auth';
const realAuthToken = 'admin-real-token';

const pages = [
  { key: 'dashboard', label: 'Dashboard', heading: /Test Team Dashboard|Dashboard/ },
  { key: 'analytics', label: 'Analytics', heading: /Usage Analytics/ },
  { key: 'members', label: 'Members', heading: /Team Members/ },
  { key: 'capabilities', label: 'Capabilities', heading: /Capabilities/ },
  { key: 'jobs', label: 'Jobs', heading: /Agent Jobs/ },
  { key: 'audit', label: 'Audit Log', heading: /Audit Log/ },
  { key: 'settings', label: 'Team Settings', heading: /Team Settings/ },
] as const;

const mockTeam = {
  id: 'team-1',
  name: 'Test Team',
  slug: teamSlug,
  ownerId: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  members: [
    { userId: 'u1', displayName: 'Alice Admin', email: 'alice@example.com', role: 'owner', joinedAt: '2026-01-02T00:00:00Z' },
    { userId: 'u2', displayName: 'Bob Builder', email: 'bob@example.com', role: 'admin', joinedAt: '2026-01-03T00:00:00Z' },
    { userId: 'u3', displayName: 'Cara Coordinator', email: 'cara@example.com', role: 'member', joinedAt: '2026-01-04T00:00:00Z' },
  ],
};

const mockTasks = [
  { id: 'task-1', teamId: 'team-1', title: 'Review enterprise rollout', status: 'open', priority: 'high', createdBy: 'u1', createdAt: '2026-01-05T10:00:00Z', updatedAt: '2026-01-05T10:00:00Z' },
  { id: 'task-2', teamId: 'team-1', title: 'Prepare audit packet', status: 'in-progress', priority: 'medium', createdBy: 'u2', createdAt: '2026-01-06T10:00:00Z', updatedAt: '2026-01-06T10:00:00Z' },
];

const mockAnalytics = {
  activeUsers: { daily: 7, weekly: 19, monthly: 42 },
  tokenUsage: {
    total: 1500000,
    byUser: [
      { userId: 'u1', name: 'Alice Admin', tokens: 800000, cost: 4.5 },
      { userId: 'u2', name: 'Bob Builder', tokens: 700000, cost: 3.2 },
    ],
  },
  topTools: [
    { name: 'memory_search', invocations: 150 },
    { name: 'shell_exec', invocations: 80 },
  ],
  topCommands: [
    { name: '/research', count: 45 },
    { name: '/draft', count: 30 },
  ],
  capabilityGaps: [
    { tool: 'browser_navigate', requestCount: 9, suggestion: 'Install browser skill' },
  ],
  performanceTrends: { correctionRate: 0.15, correctionTrend: -0.03, avgResponseTime: 8.5 },
};

const mockPolicies = [
  { id: 'p1', teamId: 'team-1', role: 'owner', allowedSources: ['native', 'skill', 'mcp'], blockedTools: [], approvalThreshold: 'none', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { id: 'p2', teamId: 'team-1', role: 'member', allowedSources: ['native', 'skill'], blockedTools: ['shell_exec'], approvalThreshold: 'medium', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

const mockOverrides = [
  { id: 'o1', teamId: 'team-1', capabilityName: 'browser_navigate', capabilityType: 'mcp', decision: 'approved', reason: 'Needed for research', decidedBy: 'u1', createdAt: '2026-01-01T00:00:00Z', decidedAt: '2026-01-01T00:00:00Z' },
];

const mockRequests = [
  { id: 'r1', teamId: 'team-1', requestedBy: 'u2', capabilityName: 'send_email', capabilityType: 'plugin', justification: 'Send customer follow-up', status: 'pending', createdAt: '2026-01-01T00:00:00Z' },
];

const mockJobs = [
  { id: 'job-abc12345-long-id', teamId: 'team-1', userId: 'u1', jobType: 'agent_task', status: 'completed', input: {}, output: {}, createdAt: '2026-01-07T12:00:00Z', completedAt: '2026-01-07T12:05:00Z' },
  { id: 'job-def67890-long-id', teamId: 'team-1', userId: 'u2', jobType: 'research', status: 'running', input: {}, createdAt: '2026-01-08T10:00:00Z' },
];

const mockAudit = [
  { id: 'a1', userId: 'u1', teamId: 'team-1', agentName: 'waggle-1', actionType: 'tool_use', description: 'Executed shell command for deployment diagnostics', requiresApproval: true, approved: true, approvedBy: 'u1', createdAt: '2026-01-08T10:00:00Z' },
  { id: 'a2', userId: 'u2', teamId: 'team-1', agentName: 'waggle-2', actionType: 'memory_write', description: 'Stored project context', requiresApproval: false, createdAt: '2026-01-08T11:00:00Z' },
];

async function fulfillMockAdminApi(route: Route) {
  const url = new URL(route.request().url());
  const path = `${url.pathname}${url.search}`;
  let body: unknown;

  if (path === `/api/teams/${teamSlug}`) body = mockTeam;
  else if (path === `/api/teams/${teamSlug}/tasks`) body = mockTasks;
  else if (path === `/api/admin/teams/${teamSlug}/analytics`) body = mockAnalytics;
  else if (path === `/api/teams/${teamSlug}/capability-policies`) body = mockPolicies;
  else if (path === `/api/teams/${teamSlug}/capability-overrides`) body = mockOverrides;
  else if (path === `/api/teams/${teamSlug}/capability-requests`) body = mockRequests;
  else if (path === `/api/jobs?teamSlug=${teamSlug}`) body = mockJobs;
  else if (path === `/api/admin/teams/${teamSlug}/audit`) body = mockAudit;
  else body = {};

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function mockAdminApi(page: Page) {
  await page.route('http://localhost:3100/**', fulfillMockAdminApi);
}

type RealAuthServer = FastifyInstance;

async function buildRealAuthServer() {
  const server = Fastify({ logger: false });
  await server.register(securityMiddleware, { sessionToken: realAuthToken });
  server.get(`/api/teams/${realAuthTeamSlug}`, async () => ({
    id: 'real-auth-team-id',
    name: 'Real Auth Team',
    slug: realAuthTeamSlug,
    ownerId: 'real-auth-owner-id',
    createdAt: '2026-07-08T00:00:00Z',
    members: [
      {
        userId: 'real-auth-owner-id',
        displayName: 'Real Auth Owner',
        email: 'admin-real-auth-owner@test.com',
        role: 'owner',
        joinedAt: '2026-07-08T00:00:00Z',
      },
    ],
  }));
  server.get(`/api/teams/${realAuthTeamSlug}/tasks`, async () => ([
    {
      id: 'real-auth-task-id',
      teamId: 'real-auth-team-id',
      title: 'Review real-auth launch gate',
      status: 'open',
      priority: 'high',
      createdBy: 'real-auth-owner-id',
      createdAt: '2026-07-08T00:00:00Z',
      updatedAt: '2026-07-08T00:00:00Z',
    },
  ]));
  await server.ready();

  return server;
}

async function routeAdminApiThroughServer(page: Page, server: RealAuthServer) {
  await page.unroute('http://localhost:3100/**');
  await page.route('http://localhost:3100/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const requestHeaders = request.headers();
    const response = await server.inject({
      method: request.method(),
      url: `${url.pathname}${url.search}`,
      headers: {
        ...(requestHeaders.authorization ? { authorization: requestHeaders.authorization } : {}),
        ...(requestHeaders['content-type'] ? { 'content-type': requestHeaders['content-type'] } : {}),
      },
      payload: request.postData() ?? undefined,
    });
    const contentTypeHeader = response.headers['content-type'];
    const contentType = Array.isArray(contentTypeHeader)
      ? contentTypeHeader[0]
      : contentTypeHeader;

    await route.fulfill({
      status: response.statusCode,
      contentType: typeof contentType === 'string' ? contentType : 'application/json',
      body: response.body,
    });
  });
}

async function connect(page: Page, hash: string) {
  await page.goto(`/#${hash}`);
  await page.getByLabel('Team Slug').fill(teamSlug);
  await page.getByLabel('Auth Token').fill(authToken);
}

async function renderedMetrics(page: Page) {
  return page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const overflowers = Array.from(document.querySelectorAll('body *'))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          inScrollRegion: Boolean(el.closest('[data-admin-scroll-region="true"]')),
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
          width: Math.round(rect.width),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        };
      })
      .filter((item) => !item.inScrollRegion && item.width > 0 && (item.left < -1 || item.right > viewportWidth + 1))
      .slice(0, 10);

    const tableProblems = Array.from(document.querySelectorAll('table'))
      .map((table) => {
        const wrapper = table.closest('[data-admin-scroll-region="true"]');
        return {
          hasWrapper: Boolean(wrapper),
          wrapperLabel: wrapper?.getAttribute('aria-label') ?? '',
        };
      })
      .filter((item) => !item.hasWrapper || !item.wrapperLabel);

    const unlabeledControls = Array.from(document.querySelectorAll('input, select, textarea'))
      .filter((control) => {
        const id = control.getAttribute('id');
        const hasLabel = Boolean(id && document.querySelector(`label[for="${CSS.escape(id)}"]`));
        const hasAria = Boolean(control.getAttribute('aria-label') || control.getAttribute('aria-labelledby'));
        const nestedLabel = Boolean(control.closest('label'));
        return !hasLabel && !hasAria && !nestedLabel;
      })
      .map((control) => ({
        tag: control.tagName.toLowerCase(),
        name: control.getAttribute('name') ?? '',
        placeholder: control.getAttribute('placeholder') ?? '',
      }));

    return {
      documentScrollWidth: document.documentElement.scrollWidth,
      viewportWidth,
      overflowers,
      tableProblems,
      unlabeledControls,
      activeText: document.querySelector('[aria-current="page"]')?.textContent?.trim() ?? null,
      activeCurrent: document.querySelector('[aria-current="page"]')?.getAttribute('aria-current') ?? null,
      hasFrameworkOverlay: Boolean(document.querySelector('[data-nextjs-dialog-overlay], vite-error-overlay, .vite-error-overlay')),
    };
  });
}

async function focusedControlName(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return '';

    const labelFor = active.id
      ? document.querySelector(`label[for="${CSS.escape(active.id)}"]`)?.textContent?.trim()
      : '';
    const labelElement = active.closest('label');
    const nestedLabel = labelElement
      ? Array.from(labelElement.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent?.trim() ?? '')
        .filter(Boolean)
        .join(' ')
      : '';

    return active.getAttribute('aria-label')
      || active.getAttribute('aria-labelledby')
      || labelFor
      || nestedLabel
      || active.textContent?.replace(/\s+/g, ' ').trim()
      || active.getAttribute('placeholder')
      || active.getAttribute('name')
      || active.tagName.toLowerCase();
  });
}

async function tabFocusNames(page: Page, count: number) {
  const names: string[] = [];
  for (let i = 0; i < count; i += 1) {
    await page.keyboard.press('Tab');
    names.push(await focusedControlName(page));
  }
  return names;
}

async function blurActiveElement(page: Page) {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
}

test.describe('admin web rendered UX', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminApi(page);
  });

  for (const viewport of [
    { name: 'desktop', width: 1200, height: 800 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`renders all admin pages without overflow or unlabeled controls on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const consoleMessages: string[] = [];
      page.on('console', (message) => {
        if (['error', 'warning'].includes(message.type())) consoleMessages.push(message.text());
      });
      page.on('pageerror', (error) => consoleMessages.push(error.message));

      for (const item of pages) {
        await connect(page, item.key);
        await expect(page.getByRole('heading', { name: item.heading })).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`#${item.key}$`));
        await expect(page.getByRole('button', { name: item.label })).toHaveAttribute('aria-current', 'page');
        await expect.poll(() => page.evaluate(() => window.scrollY), { message: `${item.key} scroll position` }).toBe(0);

        const metrics = await renderedMetrics(page);
        expect(metrics.hasFrameworkOverlay, item.key).toBe(false);
        expect(metrics.documentScrollWidth, item.key).toBeLessThanOrEqual(metrics.viewportWidth);
        expect(metrics.overflowers, item.key).toEqual([]);
        expect(metrics.tableProblems, item.key).toEqual([]);
        expect(metrics.unlabeledControls, item.key).toEqual([]);
      }

      expect(consoleMessages).toEqual([]);
    });
  }

  test('keeps admin pages visually stable on desktop and mobile', async ({ page }) => {
    for (const viewport of [
      { name: 'desktop', width: 1200, height: 800 },
      { name: 'mobile', width: 390, height: 844 },
    ] as const) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const item of pages) {
        await connect(page, item.key);
        await expect(page.getByRole('heading', { name: item.heading })).toBeVisible();
        await expect.poll(() => page.evaluate(() => window.scrollY), { message: `${item.key} scroll position` }).toBe(0);
        await blurActiveElement(page);
        await expect(page).toHaveScreenshot(`admin-${item.key}-${viewport.name}.png`, {
          animations: 'disabled',
          fullPage: true,
          maxDiffPixelRatio: 0.01,
        });
      }
    }
  });

  test('surfaces real server auth failures and renders real server data after a valid token', async ({ page }) => {
    const server = await buildRealAuthServer();
    try {
      await routeAdminApiThroughServer(page, server);
      await page.setViewportSize({ width: 390, height: 844 });

      await page.goto('/#dashboard');
      await page.getByLabel('Team Slug').fill(realAuthTeamSlug);
      await page.getByLabel('Auth Token').fill('wrong-token');

      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
      await expect(page.getByRole('alert')).toContainText('Authentication failed');

      await page.getByLabel('Auth Token').fill(realAuthToken);
      await expect(page.getByRole('heading', { name: 'Real Auth Team Dashboard' })).toBeVisible();
      await expect(page.getByText('Real Auth Owner')).toBeVisible();
      await expect(page.getByText('Review real-auth launch gate')).toBeVisible();

      const metrics = await renderedMetrics(page);
      expect(metrics.hasFrameworkOverlay).toBe(false);
      expect(metrics.overflowers).toEqual([]);
      expect(metrics.unlabeledControls).toEqual([]);
    } finally {
      await server.close();
    }
  });

  test('moves focus through the admin shell with keyboard alone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await connect(page, 'dashboard');
    await expect(page.getByRole('heading', { name: /Test Team Dashboard|Dashboard/ })).toBeVisible();

    const focusNames: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      focusNames.push(await page.evaluate(() => {
        const active = document.activeElement;
        return active?.getAttribute('aria-label')
          || active?.textContent?.replace(/\s+/g, ' ').trim()
          || active?.getAttribute('placeholder')
          || active?.getAttribute('name')
          || active?.tagName.toLowerCase()
          || '';
      }));
    }

    expect(focusNames).toContain('Dashboard');
    expect(focusNames).toContain('Analytics');
    expect(focusNames).toContain('Members');
    expect(focusNames).toContain('Capabilities');
  });

  test('moves keyboard focus from connection fields into page-level admin controls', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const keyboardTargets = [
      { key: 'dashboard', expected: ['Recent tasks table'] },
      { key: 'members', expected: ['Invite email', 'Invite role', 'Invite'] },
      { key: 'capabilities', expected: ['Role Policies', 'Overrides', 'Requests', 'Capability role policies table'] },
      { key: 'jobs', expected: ['Agent jobs table'] },
      { key: 'audit', expected: ['Audit log table'] },
      { key: 'settings', expected: ['Team Name'] },
    ] as const;

    for (const item of keyboardTargets) {
      await connect(page, item.key);
      const pageInfo = pages.find((candidate) => candidate.key === item.key);
      if (!pageInfo) throw new Error(`Unknown admin page ${item.key}`);
      await expect(page.getByRole('heading', { name: pageInfo.heading })).toBeVisible();
      if (item.key === 'members') {
        await page.getByLabel('Invite email').fill('keyboard@example.com');
      }
      await page.getByLabel('Auth Token').focus();
      const focusNames = await tabFocusNames(page, 8);

      for (const expected of item.expected) {
        expect(focusNames, `${item.key} keyboard focus`).toContain(expected);
      }
    }
  });

  test('keeps hash navigation aligned with browser back and forward', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await connect(page, 'dashboard');
    await expect(page.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Members' }).click();
    await expect(page).toHaveURL(/#members$/);
    await expect(page.getByRole('heading', { name: /Team Members/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Members' })).toHaveAttribute('aria-current', 'page');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    await page.getByRole('button', { name: 'Capabilities' }).click();
    await expect(page).toHaveURL(/#capabilities$/);
    await expect(page.getByRole('heading', { name: /Capabilities/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Capabilities' })).toHaveAttribute('aria-current', 'page');

    await page.goBack();
    await expect(page).toHaveURL(/#members$/);
    await expect(page.getByRole('heading', { name: /Team Members/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Members' })).toHaveAttribute('aria-current', 'page');

    await page.goBack();
    await expect(page).toHaveURL(/#dashboard$/);
    await expect(page.getByRole('heading', { name: /Test Team Dashboard|Dashboard/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');

    await page.goForward();
    await expect(page).toHaveURL(/#members$/);
    await expect(page.getByRole('heading', { name: /Team Members/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Members' })).toHaveAttribute('aria-current', 'page');

    await page.goForward();
    await expect(page).toHaveURL(/#capabilities$/);
    await expect(page.getByRole('heading', { name: /Capabilities/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Capabilities' })).toHaveAttribute('aria-current', 'page');
  });

  test('capability governance forms stay labelled and mobile-safe', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await connect(page, 'capabilities');
    await expect(page.getByRole('heading', { name: /Capabilities/ })).toBeVisible();

    await page.getByRole('button', { name: 'Edit' }).first().click();
    let metrics = await renderedMetrics(page);
    expect(metrics.overflowers, 'policy edit').toEqual([]);
    expect(metrics.tableProblems, 'policy edit').toEqual([]);
    expect(metrics.unlabeledControls, 'policy edit').toEqual([]);

    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Overrides' }).click();
    await expect(page.getByText('browser_navigate')).toBeVisible();
    await page.getByRole('button', { name: '+ Add Override' }).click();
    metrics = await renderedMetrics(page);
    expect(metrics.overflowers, 'override form').toEqual([]);
    expect(metrics.tableProblems, 'override form').toEqual([]);
    expect(metrics.unlabeledControls, 'override form').toEqual([]);

    await page.getByRole('button', { name: 'Requests' }).click();
    await expect(page.getByText('send_email')).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).click();
    metrics = await renderedMetrics(page);
    expect(metrics.overflowers, 'request decision').toEqual([]);
    expect(metrics.unlabeledControls, 'request decision').toEqual([]);
  });

  test('keeps capability policy save recoverable when the mutation fails', async ({ page }) => {
    await page.unroute('http://localhost:3100/**');

    let policySaveRoute: Route | null = null;
    let resolvePolicySave: () => void = () => {};
    const policySaveStarted = new Promise<void>((resolve) => {
      resolvePolicySave = resolve;
    });

    await page.route('http://localhost:3100/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (request.method() === 'PUT' && url.pathname.includes('/capability-policies/')) {
        policySaveRoute = route;
        resolvePolicySave();
        return;
      }

      await fulfillMockAdminApi(route);
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await connect(page, 'capabilities');
    await expect(page.getByRole('heading', { name: /Capabilities/ })).toBeVisible();

    await page.getByRole('button', { name: 'Edit' }).first().click();
    await expect(page.getByRole('heading', { name: /Edit Policy:/ })).toBeVisible();

    const saveButton = page.getByRole('button', { name: 'Save' });
    await saveButton.click();
    await policySaveStarted;

    const savingButton = page.getByRole('button', { name: 'Saving...' });
    await expect(savingButton).toBeDisabled();

    const pendingRoute = policySaveRoute;
    expect(pendingRoute, 'policy save request was sent').not.toBeNull();
    await pendingRoute!.fulfill({
      status: 500,
      contentType: 'text/plain',
      body: 'policy denied',
    });

    await expect(page.getByRole('alert')).toContainText('policy denied');
    await expect(page.getByRole('heading', { name: /Edit Policy:/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();

    const metrics = await renderedMetrics(page);
    expect(metrics.hasFrameworkOverlay).toBe(false);
    expect(metrics.overflowers).toEqual([]);
    expect(metrics.unlabeledControls).toEqual([]);
  });

  test('keeps capability override and request mutations recoverable when they fail', async ({ page }) => {
    await page.unroute('http://localhost:3100/**');

    let overrideCreateRoute: Route | null = null;
    let requestDecisionRoute: Route | null = null;
    let resolveOverrideCreate: () => void = () => {};
    let resolveRequestDecision: () => void = () => {};
    const overrideCreateStarted = new Promise<void>((resolve) => {
      resolveOverrideCreate = resolve;
    });
    const requestDecisionStarted = new Promise<void>((resolve) => {
      resolveRequestDecision = resolve;
    });

    await page.route('http://localhost:3100/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (request.method() === 'POST' && url.pathname.endsWith('/capability-overrides')) {
        overrideCreateRoute = route;
        resolveOverrideCreate();
        return;
      }

      if (request.method() === 'PATCH' && url.pathname.includes('/capability-requests/')) {
        requestDecisionRoute = route;
        resolveRequestDecision();
        return;
      }

      await fulfillMockAdminApi(route);
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await connect(page, 'capabilities');
    await expect(page.getByRole('heading', { name: /Capabilities/ })).toBeVisible();

    await page.getByRole('button', { name: 'Overrides' }).click();
    await page.getByRole('button', { name: '+ Add Override' }).click();
    await page.getByLabel('Capability Name').fill('shell_exec');
    await page.getByLabel('Reason').fill('Production incident response');
    await page.getByRole('button', { name: 'Submit' }).click();
    await overrideCreateStarted;

    await expect(page.getByRole('button', { name: 'Submitting...' })).toBeDisabled();

    const pendingOverrideRoute = overrideCreateRoute;
    expect(pendingOverrideRoute, 'override create request was sent').not.toBeNull();
    await pendingOverrideRoute!.fulfill({
      status: 500,
      contentType: 'text/plain',
      body: 'override denied',
    });

    await expect(page.getByRole('alert')).toContainText('override denied');
    await expect(page.getByLabel('Capability Name')).toHaveValue('shell_exec');
    await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();

    await page.getByRole('button', { name: 'Requests' }).click();
    await page.getByRole('button', { name: 'Approve' }).click();
    await page.getByLabel('Decision reason').fill('Reviewed by admin');
    await page.getByRole('button', { name: 'Approve' }).click();
    await requestDecisionStarted;

    await expect(page.getByRole('button', { name: 'Saving...' })).toBeDisabled();

    const pendingDecisionRoute = requestDecisionRoute;
    expect(pendingDecisionRoute, 'request decision request was sent').not.toBeNull();
    await pendingDecisionRoute!.fulfill({
      status: 500,
      contentType: 'text/plain',
      body: 'decision denied',
    });

    await expect(page.getByRole('alert')).toContainText('decision denied');
    await expect(page.getByLabel('Decision reason')).toHaveValue('Reviewed by admin');
    await expect(page.getByRole('button', { name: 'Approve' })).toBeEnabled();

    const metrics = await renderedMetrics(page);
    expect(metrics.hasFrameworkOverlay).toBe(false);
    expect(metrics.overflowers).toEqual([]);
    expect(metrics.unlabeledControls).toEqual([]);
  });

  test('keeps member invite and team settings mutations recoverable when they fail', async ({ page }) => {
    await page.unroute('http://localhost:3100/**');

    let inviteRoute: Route | null = null;
    let settingsRoute: Route | null = null;
    let resolveInvite: () => void = () => {};
    let resolveSettings: () => void = () => {};
    const inviteStarted = new Promise<void>((resolve) => {
      resolveInvite = resolve;
    });
    const settingsStarted = new Promise<void>((resolve) => {
      resolveSettings = resolve;
    });

    await page.route('http://localhost:3100/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (request.method() === 'POST' && url.pathname.endsWith('/members')) {
        inviteRoute = route;
        resolveInvite();
        return;
      }

      if (request.method() === 'PATCH' && url.pathname === `/api/teams/${teamSlug}`) {
        settingsRoute = route;
        resolveSettings();
        return;
      }

      await fulfillMockAdminApi(route);
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await connect(page, 'members');
    await expect(page.getByRole('heading', { name: /Team Members/ })).toBeVisible();

    await page.getByLabel('Invite email').fill('new.admin@example.com');
    await page.getByRole('button', { name: 'Invite' }).click();
    await inviteStarted;

    await expect(page.getByRole('button', { name: 'Inviting...' })).toBeDisabled();

    const pendingInviteRoute = inviteRoute;
    expect(pendingInviteRoute, 'member invite request was sent').not.toBeNull();
    await pendingInviteRoute!.fulfill({
      status: 500,
      contentType: 'text/plain',
      body: 'invite rejected',
    });

    await expect(page.getByRole('alert')).toContainText('invite rejected');
    await expect(page.getByLabel('Invite email')).toHaveValue('new.admin@example.com');
    await expect(page.getByRole('button', { name: 'Invite' })).toBeEnabled();

    await page.getByRole('button', { name: 'Team Settings' }).click();
    await expect(page.getByRole('heading', { name: /Team Settings/ })).toBeVisible();

    await page.getByLabel('Team Name').fill('Renamed Team');
    await page.getByRole('button', { name: 'Save' }).click();
    await settingsStarted;

    await expect(page.getByRole('button', { name: 'Saving...' })).toBeDisabled();

    const pendingSettingsRoute = settingsRoute;
    expect(pendingSettingsRoute, 'team settings save request was sent').not.toBeNull();
    await pendingSettingsRoute!.fulfill({
      status: 500,
      contentType: 'text/plain',
      body: 'settings rejected',
    });

    await expect(page.getByRole('alert')).toContainText('settings rejected');
    await expect(page.getByLabel('Team Name')).toHaveValue('Renamed Team');
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();

    const metrics = await renderedMetrics(page);
    expect(metrics.hasFrameworkOverlay).toBe(false);
    expect(metrics.overflowers).toEqual([]);
    expect(metrics.unlabeledControls).toEqual([]);
  });

  test('keeps member role, member removal, and override removal recoverable when they fail', async ({ page }) => {
    await page.unroute('http://localhost:3100/**');

    let roleChangeRoute: Route | null = null;
    let memberRemovalRoute: Route | null = null;
    let overrideRemovalRoute: Route | null = null;
    let resolveRoleChange: () => void = () => {};
    let resolveMemberRemoval: () => void = () => {};
    let resolveOverrideRemoval: () => void = () => {};
    const roleChangeStarted = new Promise<void>((resolve) => {
      resolveRoleChange = resolve;
    });
    const memberRemovalStarted = new Promise<void>((resolve) => {
      resolveMemberRemoval = resolve;
    });
    const overrideRemovalStarted = new Promise<void>((resolve) => {
      resolveOverrideRemoval = resolve;
    });

    await page.route('http://localhost:3100/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (request.method() === 'PATCH' && url.pathname.endsWith('/members/u2')) {
        roleChangeRoute = route;
        resolveRoleChange();
        return;
      }

      if (request.method() === 'DELETE' && url.pathname.endsWith('/members/u2')) {
        memberRemovalRoute = route;
        resolveMemberRemoval();
        return;
      }

      if (request.method() === 'DELETE' && url.pathname.endsWith('/capability-overrides/o1')) {
        overrideRemovalRoute = route;
        resolveOverrideRemoval();
        return;
      }

      await fulfillMockAdminApi(route);
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await connect(page, 'members');
    await expect(page.getByRole('heading', { name: /Team Members/ })).toBeVisible();

    const bobRole = page.getByLabel('Role for Bob Builder');
    await bobRole.selectOption('viewer');
    await roleChangeStarted;
    await expect(page.getByRole('status')).toContainText('Updating role');
    await expect(bobRole).toBeDisabled();

    const pendingRoleRoute = roleChangeRoute;
    expect(pendingRoleRoute, 'member role-change request was sent').not.toBeNull();
    await pendingRoleRoute!.fulfill({
      status: 500,
      contentType: 'text/plain',
      body: 'role rejected',
    });

    await expect(page.getByRole('alert')).toContainText('role rejected');
    await expect(page.getByLabel('Role for Bob Builder')).toBeEnabled();
    await expect(page.getByLabel('Role for Bob Builder')).toHaveValue('admin');

    await page.getByRole('button', { name: 'Remove Bob Builder' }).click();
    await expect(page.getByRole('dialog')).toContainText('Remove Bob Builder from the team?');
    await page.getByRole('button', { name: 'Remove member' }).click();
    await memberRemovalStarted;
    await expect(page.getByRole('button', { name: 'Removing...' })).toBeDisabled();

    const pendingMemberRemovalRoute = memberRemovalRoute;
    expect(pendingMemberRemovalRoute, 'member removal request was sent').not.toBeNull();
    await pendingMemberRemovalRoute!.fulfill({
      status: 500,
      contentType: 'text/plain',
      body: 'remove rejected',
    });

    await expect(page.getByRole('alert')).toContainText('remove rejected');
    await expect(page.getByRole('dialog')).toContainText('Remove Bob Builder from the team?');
    await expect(page.getByRole('button', { name: 'Remove member' })).toBeEnabled();

    await page.getByRole('button', { name: 'Capabilities' }).click();
    await page.getByRole('button', { name: 'Overrides' }).click();
    await expect(page.getByText('browser_navigate')).toBeVisible();
    await page.getByRole('button', { name: 'Remove' }).click();
    await overrideRemovalStarted;
    await expect(page.getByRole('button', { name: 'Removing...' })).toBeDisabled();

    const pendingOverrideRemovalRoute = overrideRemovalRoute;
    expect(pendingOverrideRemovalRoute, 'override removal request was sent').not.toBeNull();
    await pendingOverrideRemovalRoute!.fulfill({
      status: 500,
      contentType: 'text/plain',
      body: 'override removal rejected',
    });

    await expect(page.getByRole('alert')).toContainText('override removal rejected');
    await expect(page.getByText('browser_navigate')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove' })).toBeEnabled();

    const metrics = await renderedMetrics(page);
    expect(metrics.hasFrameworkOverlay).toBe(false);
    expect(metrics.overflowers).toEqual([]);
    expect(metrics.unlabeledControls).toEqual([]);
  });

  test('keeps the shell usable when analytics returns malformed data', async ({ page }) => {
    await page.unroute('http://localhost:3100/**');
    await page.route('http://localhost:3100/**', async (route) => {
      const url = new URL(route.request().url());
      const path = `${url.pathname}${url.search}`;
      const body = path === `/api/admin/teams/${teamSlug}/analytics`
        ? { tokenUsage: { total: 5, byUser: [] } }
        : {};

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });

    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 390, height: 844 });
    await connect(page, 'analytics');

    await expect(page.getByRole('button', { name: 'Analytics' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('alert')).toContainText('Analytics data is incomplete');
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test('shows accessible page errors without breaking the admin shell when APIs fail', async ({ page }) => {
    await page.unroute('http://localhost:3100/**');
    await page.route('http://localhost:3100/**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'server unavailable',
      });
    });

    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 390, height: 844 });

    for (const item of pages) {
      await connect(page, item.key);
      await expect(page.getByRole('button', { name: item.label })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('heading', { name: item.heading })).toBeVisible();
      await expect(page.getByRole('alert')).toBeVisible();

      const metrics = await renderedMetrics(page);
      expect(metrics.hasFrameworkOverlay, item.key).toBe(false);
      expect(metrics.documentScrollWidth, item.key).toBeLessThanOrEqual(metrics.viewportWidth);
      expect(metrics.overflowers, item.key).toEqual([]);
      expect(metrics.unlabeledControls, item.key).toEqual([]);
      await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible();
    }

    expect(pageErrors).toEqual([]);
  });
});
