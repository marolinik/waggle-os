import { expect, test, type Page } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { redactDiagnosticText, redactDiagnosticUrl } from '../vision/_helpers';

type DisclosureTier = 'simple' | 'professional' | 'power' | 'admin';

interface RouteProbe {
  id: string;
  path: string;
  expected: RegExp;
  loading?: RegExp;
  viewport?: { width: number; height: number };
}

interface FailureRouteMock {
  url: string | RegExp;
  abort?: boolean;
  status?: number;
  delayMs?: number;
  body?: unknown | ((url: string) => unknown);
}

type FailureAction =
  | 'none'
  | 'send-chat'
  | 'create-backup'
  | 'restore-backup'
  | 'approvals-revoke-all'
  | 'open-local-model-tab'
  | 'upload-file'
  | 'upload-file-success'
  | 'inspect-large-file-list'
  | 'inspect-large-marketplace-catalog'
  | 'inspect-slow-memory-list'
  | 'inspect-large-memory-list'
  | 'wiki-export-obsidian-failure'
  | 'inspect-slow-agent-list'
  | 'inspect-large-agent-list'
  | 'inspect-large-timeline-events';
type OverlayProbe = 'workspace-switcher' | 'notifications' | 'command-center';

interface FailureProbe {
  id: string;
  path: string;
  action: FailureAction;
  expected: RegExp;
  actionText?: string;
  viewport?: { width: number; height: number };
  mocks: FailureRouteMock[];
  expectedConsoleErrors?: RegExp[];
  expectedNetworkFailures?: RegExp[];
}

interface PersonaBundle {
  slug: string;
  title: string;
  accountMode: string;
  billingTier: string;
  uiDisclosureTier: DisclosureTier;
  modelState: string;
  dataState: string;
  offlineErrorState: string;
  viewport: { width: number; height: number };
  nonMainGateDecisions: string[];
  routes: RouteProbe[];
  failureProbes: FailureProbe[];
  overlayProbes?: OverlayProbe[];
}

interface BrowserCapture {
  consoleErrors: string[];
  pageErrors: string[];
  networkFailures: string[];
}

interface BoundsIssue {
  text: string;
  left: number;
  right: number;
  width: number;
  viewport: number;
}

interface RouteEvidence {
  id: string;
  path: string;
  url: string;
  viewport: { width: number; height: number };
  screenshot: string;
  overflow: BoundsIssue[];
  bodyPreview: string;
}

interface FailureEvidence extends RouteEvidence {
  action: FailureAction;
  expected: string;
  mockedRoutes: string[];
}

interface OverlayEvidence {
  id: OverlayProbe;
  result: string;
  screenshot: string;
  overflow: BoundsIssue[];
}

const ARTIFACT_ROOT = join(process.cwd(), 'output', 'playwright', 'five-persona-state-bundles');
const SKIP_KEYS = {
  skipOnboarding: 'true',
  skipBoot: 'true',
  skipBriefing: 'true',
};

const BENIGN = [
  /favicon/i,
  /ResizeObserver/i,
  /WebSocket/i,
  /net::ERR_ABORTED/i,
  /Failed to fetch/i,
  /\b401\b/,
  /\b404\b/,
];

const PERSONAS: PersonaBundle[] = [
  {
    slug: 'solo-founder',
    title: 'Persona 1: Solo Founder',
    accountMode: 'accountless local',
    billingTier: 'Solo / FREE',
    uiDisclosureTier: 'simple',
    modelState: 'no-model recovery plus shell-first usability',
    dataState: 'fresh local profile with route-created default workspace state',
    offlineErrorState: 'accountless Clerk/CSP lane',
    viewport: { width: 1440, height: 900 },
    nonMainGateDecisions: ['T13/T14 deferred unless launch or packaged desktop evidence enters this score.'],
    routes: [
      { id: 'home-desktop', path: '/home', expected: /home|workspace|memory|start|chat/i },
      { id: 'profile-mobile', path: '/settings/profile', expected: /who are you|identity|profile|save/i, viewport: { width: 390, height: 844 } },
    ],
    failureProbes: [
      {
        id: 'chat-backend-offline',
        path: '/chat',
        action: 'send-chat',
        actionText: 'Summarize my next move.',
        mocks: [{ url: '**/api/chat', abort: true }],
        expected: /Backend is offline/i,
        expectedConsoleErrors: [/Failed to load resource: net::ERR_FAILED/i],
        expectedNetworkFailures: [/\/api\/chat\b/],
      },
    ],
    overlayProbes: ['workspace-switcher'],
  },
  {
    slug: 'researcher',
    title: 'Persona 2: Researcher',
    accountMode: 'accountless local',
    billingTier: 'Solo / FREE unless Teams memory governance is intentionally sampled',
    uiDisclosureTier: 'power',
    modelState: 'skipped-LLM memory UI focus',
    dataState: 'memory, artifacts, and timeline shells with empty/no-result recovery visible',
    offlineErrorState: 'memory unavailable, export failure, and slow/large research data states sampled',
    viewport: { width: 1440, height: 900 },
    nonMainGateDecisions: ['T19 deferred unless browser-capture extension evidence enters this score.'],
    routes: [
      { id: 'memory', path: '/memory', expected: /memory|trust|timeline|wiki|harvest/i, loading: /Loading memories/i },
      { id: 'artifacts', path: '/artifacts', expected: /artifact|library|document|presentation/i },
      { id: 'timeline', path: '/settings/timeline', expected: /timeline|workspace|activity|event/i },
    ],
    failureProbes: [
      {
        id: 'memory-list-unavailable',
        path: '/memory',
        action: 'none',
        mocks: [{ url: '**/api/memory**', status: 503, body: { error: 'MEMORY_UNAVAILABLE', message: 'Memory temporarily unavailable' } }],
        expected: /failed|error|unavailable|could not/i,
        expectedConsoleErrors: [/Failed to load resource: the server responded with a status of 503/i],
      },
      {
        id: 'memory-slow-list',
        path: '/memory?tab=memories',
        action: 'inspect-slow-memory-list',
        mocks: [
          { url: /\/api\/memory\?[^#]*\blimit=200\b/, status: 200, delayMs: 2_000, body: largeMemoryList(40) },
        ],
        expected: /40 memories|Bulk Memory 000/i,
      },
      {
        id: 'memory-large-list',
        path: '/memory?tab=memories',
        action: 'inspect-large-memory-list',
        mocks: [
          { url: /\/api\/memory\?[^#]*\blimit=200\b/, status: 200, body: largeMemoryList() },
        ],
        expected: /200 memories|Bulk Memory 000/i,
      },
      {
        id: 'timeline-large-events',
        path: '/settings/timeline?activeWorkspace=ws-main',
        action: 'inspect-large-timeline-events',
        mocks: [
          {
            url: '**/api/workspaces',
            status: 200,
            body: [{
              id: 'ws-main',
              name: 'Bulk Timeline Workspace',
              group: 'Research',
              status: 'active',
              health: 'healthy',
              memoryCount: 0,
              sessionCount: 0,
              lastActive: '2026-07-09T12:00:00.000Z',
            }],
          },
          { url: /\/api\/events\?[^#]*\blimit=500\b/, status: 200, body: { events: largeTimelineEvents() } },
        ],
        expected: /360 events|Used bulk_tool_000/i,
      },
      {
        id: 'wiki-export-obsidian-failure',
        path: '/memory?tab=wiki',
        action: 'wiki-export-obsidian-failure',
        mocks: [
          { url: '**/api/wiki/pages', status: 200, body: wikiPages() },
          {
            url: '**/api/wiki/export/obsidian',
            status: 500,
            body: { error: 'Disk permission denied for C:/Research Vault' },
          },
        ],
        expected: /Export Failed|Disk permission denied for C:\/Research Vault/i,
        expectedConsoleErrors: [/Failed to load resource: the server responded with a status of 500/i],
      },
    ],
  },
  {
    slug: 'engineer-power-user',
    title: 'Persona 3: Engineer / Power User',
    accountMode: 'accountless local',
    billingTier: 'Solo / FREE with Teams-only surfaces evidenced or deferred',
    uiDisclosureTier: 'power',
    modelState: 'local/no-LLM plus route recovery for tool surfaces',
    dataState: 'one local workspace state plus tool detection/MCP/file shells',
    offlineErrorState: 'marketplace local-only and tool/hook unavailable states',
    viewport: { width: 1440, height: 900 },
    nonMainGateDecisions: ['T15/T16/T17/T18 evidenced or explicitly deferred for utility, hook, developer, and ops surfaces.'],
    routes: [
      { id: 'launcher', path: '/launcher', expected: /tool launcher|optional prompt|detecting installed tools|launch/i, loading: /Detecting installed tools/i },
      { id: 'mcps', path: '/mcps', expected: /mcp hub|installed|catalog|custom/i },
      { id: 'files', path: '/files', expected: /storage|files|workspace|local/i },
    ],
    failureProbes: [
      {
        id: 'launcher-sidecar-offline',
        path: '/launcher',
        action: 'none',
        mocks: [
          { url: '**/api/tools/processes', status: 200, body: { processes: [], total: 0 } },
          { url: '**/api/tools/detect', abort: true },
        ],
        expected: /sidecar may be offline/i,
        expectedConsoleErrors: [/Failed to load resource: net::ERR_FAILED/i],
        expectedNetworkFailures: [/\/api\/tools\/detect\b/],
      },
      {
        id: 'mission-control-health-degraded',
        path: '/settings/mission-control',
        action: 'none',
        mocks: [
          {
            url: '**/health',
            status: 200,
            body: {
              status: 'degraded',
              uptime: 7200,
              services: [
                { name: 'LiteLLM', status: 'down' },
                { name: 'Memory', status: 'healthy' },
              ],
            },
          },
        ],
        expected: /degraded|LiteLLM: down/i,
      },
      {
        id: 'agents-slow-list',
        path: '/agents',
        action: 'inspect-slow-agent-list',
        mocks: [
          { url: '**/api/agents', status: 200, delayMs: 2_000, body: largeAgentList(40) },
        ],
        expected: /40 agents|Bulk Agent 000/i,
      },
      {
        id: 'agents-large-list',
        path: '/agents',
        action: 'inspect-large-agent-list',
        mocks: [
          { url: '**/api/agents', status: 200, body: largeAgentList() },
        ],
        expected: /180 agents|Bulk Agent 000/i,
      },
      {
        id: 'marketplace-unavailable',
        path: '/marketplace',
        action: 'none',
        mocks: [
          { url: '**/api/marketplace**', abort: true },
          { url: '**/api/connectors', abort: true },
          { url: '**/api/mcps', abort: true },
        ],
        expected: /Could not load extensions|server may be unreachable|Retry/i,
        expectedConsoleErrors: [/Failed to load resource: net::ERR_FAILED/i],
        expectedNetworkFailures: [/\/api\/marketplace\b/, /\/api\/connectors\b/, /\/api\/mcps\b/],
      },
      {
        id: 'marketplace-large-catalog',
        path: '/marketplace',
        action: 'inspect-large-marketplace-catalog',
        mocks: [
          { url: '**/api/marketplace**', status: 200, body: largeMarketplaceCatalogBody },
          { url: '**/api/connectors', status: 200, body: largeMarketplaceConnectors() },
          { url: '**/api/mcps', status: 200, body: largeMarketplaceMcps() },
        ],
        expected: /Bulk Skill 000|Skills\s*.?\s*120|Connectors\s*.?\s*60|MCPs\s*.?\s*60/i,
      },
      {
        id: 'files-upload-failure',
        path: '/files',
        action: 'upload-file',
        mocks: [
          { url: '**/api/workspaces/**/files/upload', status: 500, body: { error: 'Disk full' } },
        ],
        expected: /Upload failed|failed-upload\.md could not be uploaded/i,
        expectedConsoleErrors: [/Failed to load resource: the server responded with a status of 500/i],
      },
      {
        id: 'files-upload-success',
        path: '/files',
        action: 'upload-file-success',
        mocks: [],
        expected: /successful-upload\.md/i,
      },
      {
        id: 'files-large-list',
        path: '/files',
        action: 'inspect-large-file-list',
        mocks: [
          { url: '**/api/workspaces/**/files/list**', status: 200, body: largeFileList() },
        ],
        expected: /240 items|bulk-file-000\.md/i,
      },
    ],
  },
  {
    slug: 'team-admin-security-reviewer',
    title: 'Persona 4: Team Admin / Security Reviewer',
    accountMode: 'accountless local with mocked Teams-tier billing/admin state',
    billingTier: 'Solo / FREE comparison lane plus mocked Teams billing and governance lane; real authenticated Teams server still deferred',
    uiDisclosureTier: 'admin',
    modelState: 'not central unless Settings model copy is inspected',
    dataState: 'billing, vault, backup, approvals, governance shell, and Teams-unlocked settings state',
    offlineErrorState: 'backup failure, restore failure, checkout recovery, and approval-grant revocation sampled',
    viewport: { width: 1440, height: 900 },
    nonMainGateDecisions: ['T13/T14/T15 evidenced or explicitly deferred for launch, desktop, and admin/utility paths.'],
    routes: [
      { id: 'billing', path: '/settings?tab=billing', expected: /billing|plan|solo|team|checkout/i },
      { id: 'vault', path: '/settings/vault', expected: /vault|secret|encrypted|key/i },
      { id: 'team', path: '/team', expected: /team|governance|permission|member|upgrade/i },
      { id: 'approvals', path: '/approvals', expected: /approval|pending|risk|agent/i },
    ],
    failureProbes: [
      {
        id: 'billing-checkout-unavailable',
        path: '/settings?tab=billing',
        action: 'none',
        mocks: [
          { url: '**/api/tier', status: 200, body: { tier: 'FREE', capabilities: {}, usage: {} } },
          { url: '**/api/stripe/status', status: 200, body: { configured: false } },
        ],
        expected: /Unavailable/i,
      },
      {
        id: 'billing-team-active-state',
        path: '/settings?tab=billing',
        action: 'none',
        mocks: [
          { url: '**/api/tier', status: 200, body: { tier: 'TEAMS', capabilities: {}, usage: {} } },
          { url: '**/api/stripe/status', status: 200, body: { configured: true } },
        ],
        expected: /Waggle Team|\$49\/mo per seat|shared workspaces, WaggleDance, governance|Manage subscription/i,
      },
      {
        id: 'team-settings-unlocked-state',
        path: '/settings?tab=team',
        action: 'none',
        mocks: [
          { url: '**/api/tier', status: 200, body: { tier: 'TEAMS', capabilities: {}, usage: {} } },
          { url: '**/api/team/status', status: 200, body: { connected: false } },
        ],
        expected: /Team Server|Team Server URL|Auth Token|Connecting to a team server/i,
      },
      {
        id: 'billing-checkout-success-return',
        path: '/payment-success?session_id=cs_bundle_team',
        action: 'none',
        mocks: [
          { url: '**/api/tier', status: 200, body: { tier: 'FREE', capabilities: {}, usage: {} } },
          { url: '**/api/stripe/sync', status: 200, body: { tier: 'TEAMS', customerId: 'cus_bundle' } },
        ],
        expected: /Team|Manage billing|shared team memory/i,
      },
      {
        id: 'billing-checkout-cancel-return',
        path: '/payment-cancelled',
        action: 'none',
        mocks: [
          { url: '**/api/tier', status: 200, body: { tier: 'FREE', capabilities: {}, usage: {} } },
          { url: '**/api/stripe/status', status: 200, body: { configured: true } },
        ],
        expected: /Checkout was cancelled|No charge was made/i,
      },
      {
        id: 'backup-create-failure',
        path: '/settings?tab=backup',
        action: 'create-backup',
        mocks: [{ url: '**/api/backup', status: 500, body: { error: 'Vault key missing' } }],
        expected: /Vault key missing|backup failed|failed to create backup/i,
        expectedConsoleErrors: [/Failed to load resource: the server responded with a status of 500/i],
      },
      {
        id: 'backup-restore-failure',
        path: '/settings?tab=backup',
        action: 'restore-backup',
        mocks: [{ url: '**/api/restore', status: 500, body: { error: 'Backup is corrupt' } }],
        expected: /Backup is corrupt|Restore failed/i,
        expectedConsoleErrors: [/Failed to load resource: the server responded with a status of 500/i],
      },
      {
        id: 'approvals-revoke-all-grants',
        path: '/approvals',
        action: 'approvals-revoke-all',
        mocks: [
          { url: '**/api/approval/pending', status: 200, body: { pending: [], count: 0 } },
          { url: '**/api/approval/grants', status: 200, body: { grants: approvalGrants(), count: 1 } },
          { url: '**/api/approval/grants/clear', status: 200, body: { ok: true } },
        ],
        expected: /No saved grants/i,
      },
    ],
  },
  {
    slug: 'mobile-executive',
    title: 'Persona 5: Mobile Executive',
    accountMode: 'accountless local',
    billingTier: 'Solo / FREE unless Team account view is sampled',
    uiDisclosureTier: 'simple',
    modelState: 'no-model or verified-model banner must fit mobile',
    dataState: 'one workspace plus some memory shell state',
    offlineErrorState: 'overlay close plus readable empty/error state',
    viewport: { width: 390, height: 844 },
    nonMainGateDecisions: ['T13/T14/T19 deferred unless launch, desktop, or browser-capture flows enter this mobile score.'],
    routes: [
      { id: 'home-mobile', path: '/home', expected: /home|workspace|memory|start|chat/i },
      { id: 'settings-mobile', path: '/settings', expected: /settings|plan|models|profile|general/i, loading: /Checking your models/i },
      { id: 'memory-mobile', path: '/memory', expected: /memory|trust|timeline|wiki|harvest/i, loading: /Loading memories/i },
    ],
    failureProbes: [
      {
        id: 'local-model-runtime-unavailable',
        path: '/settings?tab=models',
        action: 'open-local-model-tab',
        viewport: { width: 390, height: 844 },
        mocks: [
          {
            url: '**/api/providers',
            status: 200,
            body: {
              providers: [
                {
                  id: 'anthropic',
                  name: 'Anthropic',
                  hasKey: false,
                  badge: null,
                  keyUrl: null,
                  requiresKey: true,
                  models: [{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet', cost: '$$', speed: 'fast' }],
                },
              ],
              search: [{ id: 'duckduckgo', name: 'DuckDuckGo', hasKey: true, priority: 1 }],
              activeSearch: 'duckduckgo',
            },
          },
          { url: '**/api/settings/probe-model', status: 200, body: { model: null, configured: false, verified: false } },
          {
            url: '**/api/local-inference/status',
            status: 200,
            body: {
              servers: [],
              ollamaInstalled: false,
              ollamaRunning: false,
              totalLocalModels: 0,
              offlineReady: false,
              dockerRequired: false,
              managedRuntime: {
                source: 'waggle-managed',
                supported: true,
                installed: false,
                running: false,
                targetVersion: '0.32.0',
                version: null,
                artifactSizeBytes: 1_503_047_573,
                downloadRequired: true,
                dockerRequired: false,
              },
              setupRequired: true,
              setupMessage: 'Install the private runtime in Waggle, then download an offline model. Docker and a system Ollama install are not required.',
            },
          },
        ],
        expected: /No local runtime yet[\s\S]*Install private runtime/i,
      },
      {
        id: 'mobile-chat-backend-offline',
        path: '/chat',
        action: 'send-chat',
        actionText: 'What needs my attention?',
        viewport: { width: 390, height: 844 },
        mocks: [{ url: '**/api/chat', abort: true }],
        expected: /Backend is offline/i,
        expectedConsoleErrors: [/Failed to load resource: net::ERR_FAILED/i],
        expectedNetworkFailures: [/\/api\/chat\b/],
      },
    ],
    overlayProbes: ['notifications', 'command-center'],
  },
];

mkdirSync(ARTIFACT_ROOT, { recursive: true });

function routeWithState(path: string, tier: DisclosureTier): string {
  const [pathname, existingSearch = ''] = path.split('?');
  const params = new URLSearchParams(existingSearch);
  for (const [key, value] of Object.entries(SKIP_KEYS)) {
    params.set(key, value);
  }
  params.set('tier', tier);
  return `${pathname}?${params.toString()}`;
}

function attachBrowserCapture(page: Page): BrowserCapture {
  const capture: BrowserCapture = {
    consoleErrors: [],
    pageErrors: [],
    networkFailures: [],
  };

  page.on('console', (message) => {
    if (message.type() === 'error') {
      capture.consoleErrors.push(redactDiagnosticText(message.text()));
    }
  });
  page.on('pageerror', (error) => {
    capture.pageErrors.push(redactDiagnosticText(error.message));
  });
  page.on('requestfailed', (request) => {
    capture.networkFailures.push(redactDiagnosticText(
      `${request.method()} ${redactDiagnosticUrl(request.url())} - ${request.failure()?.errorText ?? 'failed'}`,
    ));
  });

  return capture;
}

function critical(items: string[], extraBenign: RegExp[] = []): string[] {
  const benignPatterns = [...BENIGN, ...extraBenign];
  return items.filter((item) => !benignPatterns.some((pattern) => pattern.test(item)));
}

async function waitForShell(page: Page): Promise<void> {
  await page.waitForSelector('.waggle-sidebar, [role="navigation"], main', { timeout: 20_000 });
  await page.waitForTimeout(400);
}

async function waitForSettledRoute(page: Page): Promise<void> {
  await expect.poll(
    async () => page.locator('[aria-busy="true"]:visible').count(),
    { message: 'Visible route loaders should settle before judge capture', timeout: 20_000 },
  ).toBe(0);
  await page.waitForTimeout(200);
}

async function captureScreenshot(page: Page, path: string): Promise<void> {
  await page.screenshot({ path, fullPage: false, animations: 'disabled' });
}

async function visibleHorizontalOverflow(
  page: Page,
  selector = 'main, [role="navigation"], [role="dialog"], button, input, textarea, select, [role="tab"], [role="tabpanel"], [data-testid]',
): Promise<BoundsIssue[]> {
  return page.locator(selector).evaluateAll((elements) => elements
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return {
        text: (element.textContent || element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.tagName).trim().slice(0, 100),
        left: Math.floor(rect.left),
        right: Math.ceil(rect.right),
        width: Math.ceil(rect.width),
        viewport: window.innerWidth,
        visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
      };
    })
    .filter((item) => item.visible && (item.left < -1 || item.right > item.viewport + 1))
    .slice(0, 20)
    .map(({ visible: _visible, ...item }) => item));
}

async function runOverlayProbe(page: Page, dir: string, probe: OverlayProbe, index: number): Promise<OverlayEvidence> {
  if (probe === 'workspace-switcher') {
    await page.getByTestId('sidebar-workspace').click();
    const dialog = page.getByRole('dialog', { name: /switch workspace/i });
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    const overflow = await visibleHorizontalOverflow(page);
    const screenshotPath = join(dir, `overlay-${String(index + 1).padStart(2, '0')}-${probe}.png`);
    await captureScreenshot(page, screenshotPath);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    return {
      id: probe,
      result: 'workspace switcher opened and closed with Escape',
      screenshot: relative(process.cwd(), screenshotPath),
      overflow,
    };
  }

  if (probe === 'notifications') {
    await page.getByRole('button', { name: /^Notifications/ }).click();
    const dialog = page.getByRole('dialog', { name: /notifications/i });
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    const overflow = await visibleHorizontalOverflow(page);
    const screenshotPath = join(dir, `overlay-${String(index + 1).padStart(2, '0')}-${probe}.png`);
    await captureScreenshot(page, screenshotPath);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
    return {
      id: probe,
      result: 'notifications dialog opened and closed with Escape',
      screenshot: relative(process.cwd(), screenshotPath),
      overflow,
    };
  }

  await page.keyboard.press('Control+k');
  const dialog = page.getByTestId('command-center-dialog');
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await expect(dialog).toHaveAttribute('aria-describedby', /.+/);
  const describedBy = await dialog.getAttribute('aria-describedby');
  const description = await page.evaluate((id) => document.getElementById(id ?? '')?.textContent ?? '', describedBy);
  expect(description).toMatch(/search and run commands/i);
  const overflow = await visibleHorizontalOverflow(
    page,
    '[data-testid="command-center-dialog"] [cmdk-item]:visible, [data-testid="command-center-dialog"] [cmdk-item] *:visible, [data-testid="command-center-dialog"] input:visible, [data-testid="command-center-dialog"] kbd:visible',
  );
  const screenshotPath = join(dir, `overlay-${String(index + 1).padStart(2, '0')}-${probe}.png`);
  await captureScreenshot(page, screenshotPath);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  return {
    id: probe,
    result: 'command center opened, described, fit, and closed with Escape',
    screenshot: relative(process.cwd(), screenshotPath),
    overflow,
  };
}

async function registerFailureMocks(page: Page, mocks: FailureRouteMock[]): Promise<void> {
  for (const mock of mocks) {
    await page.route(mock.url, async (route) => {
      if (mock.abort) {
        await route.abort('failed');
        return;
      }

      if (mock.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, mock.delayMs));
      }

      await route.fulfill({
        status: mock.status ?? 503,
        contentType: 'application/json',
        body: JSON.stringify(
          typeof mock.body === 'function'
            ? mock.body(route.request().url())
            : mock.body ?? { error: 'TEST_FAILURE', message: 'Simulated degraded service' },
        ),
      });
    });
  }
}

async function clearFailureMocks(page: Page, mocks: FailureRouteMock[]): Promise<void> {
  for (const mock of mocks) {
    await page.unroute(mock.url);
  }
}

function largeFileList(count = 240): unknown[] {
  return Array.from({ length: count }, (_, index) => {
    const suffix = String(index).padStart(3, '0');
    return {
      name: `bulk-file-${suffix}.md`,
      path: `/bulk-file-${suffix}.md`,
      type: 'file',
      size: 1024 + index,
      mimeType: 'text/markdown',
      modifiedAt: '2026-07-09T12:00:00.000Z',
      createdAt: '2026-07-09T12:00:00.000Z',
    };
  });
}

function largeMemoryList(count = 200): unknown {
  const kinds = ['fact', 'decision', 'task', 'preference', 'strategy', 'learning', 'goal', 'entity'];
  const statuses = ['active', 'unreviewed', 'active', 'active', 'low_confidence'];
  return {
    results: Array.from({ length: count }, (_, index) => {
      const suffix = String(index).padStart(3, '0');
      return {
        id: `bulk-memory-${suffix}`,
        kind: kinds[index % kinds.length],
        title: `Bulk Memory ${suffix}`,
        content: `Research memory ${suffix} with enough unique detail to avoid display dedupe and keep the list scannable for audit evidence.`,
        scope: 'personal',
        source: 'test-fixture',
        sourceId: `source-${suffix}`,
        confidence: 45 + (index % 55),
        importance: index % 19 === 0 ? 'important' : 'normal',
        evidence: [`Evidence snippet ${suffix}`],
        tags: ['bulk', `batch-${index % 10}`],
        status: statuses[index % statuses.length],
        createdAt: '2026-07-09T12:00:00.000Z',
        updatedAt: '2026-07-09T12:00:00.000Z',
        lastAccessedAt: '2026-07-09T12:00:00.000Z',
      };
    }),
    count,
  };
}

function wikiPages(): unknown[] {
  return [{
    slug: 'research-guide',
    pageType: 'entity',
    name: 'Research Guide',
    contentHash: 'hash-research-guide',
    markdown: '# Research Guide\n\nField notes for the Researcher judge export-failure lane.',
    frameIds: 'memory-1',
    compiledAt: '2026-07-09T12:00:00.000Z',
    sourceCount: 3,
  }];
}

function approvalGrants(): unknown[] {
  return [{
    id: 'grant-send-email',
    toolName: 'send_email',
    targetKey: 'client@example.com',
    sourceWorkspaceId: 'workspace-1',
    description: 'Always allow send_email to client@example.com',
    grantedAt: '2026-07-09T12:00:00.000Z',
    expiresAt: null,
  }];
}

function largeAgentList(count = 180): unknown {
  const types = ['personal', 'workspace', 'team', 'autonomous'];
  const statuses = ['idle', 'running', 'paused', 'completed', 'waiting_for_approval'];
  const personas = ['researcher', 'writer', 'analyst', 'coder', 'planner'];

  return {
    agents: Array.from({ length: count }, (_, index) => {
      const suffix = String(index).padStart(3, '0');
      return {
        id: `bulk-agent-${suffix}`,
        name: `Bulk Agent ${suffix}`,
        goal: `Handle high-volume operational task ${suffix} while keeping the roster scannable.`,
        description: `Generated large-roster fixture agent ${suffix}.`,
        type: types[index % types.length],
        personaId: personas[index % personas.length],
        model: index % 2 === 0 ? 'gpt-5-mini' : 'local/llama',
        autonomyLevel: index % 3 === 0 ? 'guided' : 'manual',
        workspaceIds: ['ws-main'],
        teamId: 'team-bulk',
        memoryScopes: ['personal', 'workspace'],
        skillIds: [`bulk-skill-${index % 12}`],
        connectorIds: [`bulk-connector-${index % 8}`],
        mcpIds: [`bulk-mcp-${index % 6}`],
        permissions: {},
        status: statuses[index % statuses.length],
        createdBy: 'test-fixture',
        createdAt: '2026-07-09T12:00:00.000Z',
        updatedAt: '2026-07-09T12:00:00.000Z',
        lastRunAt: '2026-07-09T11:00:00.000Z',
        successRate: 0.55 + ((index % 40) / 100),
      };
    }),
  };
}

function largeTimelineEvents(count = 360): unknown[] {
  const types = ['tool_call', 'tool_result', 'memory_write', 'approval_requested', 'workspace_update'];
  return Array.from({ length: count }, (_, index) => {
    const suffix = String(index).padStart(3, '0');
    return {
      id: index + 1,
      eventType: types[index % types.length],
      toolName: `bulk_tool_${suffix}`,
      input: `Large timeline input ${suffix}`,
      output: `Large timeline output ${suffix}`,
      model: index % 2 === 0 ? 'gpt-5-mini' : 'local/llama',
      tokensUsed: 100 + index,
      cost: Number((0.0001 * (index % 20)).toFixed(6)),
      sessionId: `bulk-session-${index % 12}`,
      approved: index % 3 !== 0,
      timestamp: '2026-07-09T12:00:00.000Z',
    };
  });
}

function largeMarketplaceCatalogBody(url: string): unknown {
  if (url.includes('/api/marketplace/packs')) return [];

  const parsed = new URL(url);
  const type = parsed.searchParams.get('type');
  const count = type === 'mcp' ? 40 : 120;

  return {
    packages: Array.from({ length: count }, (_, index) => {
      const suffix = String(index).padStart(3, '0');
      const mcp = type === 'mcp';
      return {
        id: (mcp ? 20_000 : 10_000) + index,
        name: mcp ? `Bulk MCP Package ${suffix}` : `Bulk Skill ${suffix}`,
        description: mcp
          ? `High-volume marketplace MCP package ${suffix}`
          : `High-volume marketplace skill package ${suffix}`,
        waggle_install_type: mcp ? 'mcp' : 'skill',
        category: mcp ? 'data' : 'automation',
        source: 'marketplace',
        installed: false,
        scanStatus: 'passed',
      };
    }),
    total: count,
    federated: true,
  };
}

function largeMarketplaceConnectors(count = 60): unknown[] {
  return Array.from({ length: count }, (_, index) => {
    const suffix = String(index).padStart(3, '0');
    return {
      id: `bulk-connector-${suffix}`,
      name: `Bulk Connector ${suffix}`,
      description: `High-volume connector catalog entry ${suffix}`,
      category: 'productivity',
      status: 'available',
      authType: 'api_key',
    };
  });
}

function largeMarketplaceMcps(count = 20): unknown[] {
  return Array.from({ length: count }, (_, index) => {
    const suffix = String(index).padStart(3, '0');
    return {
      id: `bulk-mcp-catalog-${suffix}`,
      name: `Bulk MCP Catalog ${suffix}`,
      description: `High-volume local MCP catalog entry ${suffix}`,
      category: 'data',
      official: true,
      installCmd: `npx bulk-mcp-catalog-${suffix}`,
      source: 'catalog',
      installed: false,
      tools: ['search'],
    };
  });
}

async function runFailureAction(page: Page, probe: FailureProbe): Promise<void> {
  if (probe.action === 'none') return;

  if (probe.action === 'send-chat') {
    let input = page.getByRole('textbox', { name: /reply|ask waggle|message/i }).first();
    if (!(await input.isVisible({ timeout: 1_500 }).catch(() => false))) {
      const chatButton = page.getByRole('button', { name: /^Chat$/ }).first();
      if (await chatButton.isVisible({ timeout: 1_500 }).catch(() => false)) {
        await chatButton.click();
        await page.waitForTimeout(400);
      }
      input = page.locator('textarea').first();
    }
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill(probe.actionText ?? 'Trigger an offline state.');
    await input.press('Enter');
    return;
  }

  if (probe.action === 'create-backup') {
    const createBackupButton = page.getByRole('button', { name: /create backup/i }).first();
    await expect(createBackupButton).toBeVisible({ timeout: 10_000 });
    await createBackupButton.click();
    return;
  }

  if (probe.action === 'restore-backup') {
    const restoreInput = page.locator('input[type="file"][accept=".waggle-backup"]').first();
    await restoreInput.setInputFiles({
      name: 'corrupt.waggle-backup',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('backup-data'),
    });
    const modal = page.getByTestId('approval-modal');
    await expect(modal).toBeVisible({ timeout: 10_000 });
    await expect(modal).toContainText(/restore backup/i);
    await page.getByTestId('approval-modal-approve').click();
    return;
  }

  if (probe.action === 'approvals-revoke-all') {
    await page.getByRole('button', { name: /grants/i }).click();
    await expect(page.getByText('1 active grant', { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /revoke all/i }).click();
    const modal = page.getByTestId('approval-modal');
    await expect(modal).toContainText(/revoke all saved approval grants/i, { timeout: 10_000 });
    await expect(modal).toContainText(/agents will ask again/i);
    await page.getByTestId('approval-modal-approve').click();
    await expect(page.getByText('No saved grants', { exact: true })).toBeVisible({ timeout: 10_000 });
    return;
  }

  if (probe.action === 'open-local-model-tab') {
    const localTab = page.getByRole('tab', { name: /local model/i }).first();
    await expect(localTab).toBeVisible({ timeout: 10_000 });
    await localTab.click();
    return;
  }

  if (probe.action === 'upload-file') {
    await page.getByTestId('storage-view-b').click();
    await expect(page.getByRole('region', { name: /files in/i })).toBeVisible({ timeout: 10_000 });
    await page.locator('input[type="file"]').last().setInputFiles({
      name: 'failed-upload.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('draft'),
    });
    await expect(page.getByText('failed-upload.md', { exact: true })).not.toBeVisible({ timeout: 1_000 });
    return;
  }

  if (probe.action === 'upload-file-success') {
    await page.getByTestId('storage-view-b').click();
    await expect(page.getByRole('region', { name: /files in/i })).toBeVisible({ timeout: 10_000 });
    const uploadResponsePromise = page.waitForResponse(
      response => response.url().includes('/api/workspaces/') && response.url().includes('/files/upload'),
      { timeout: 10_000 },
    );
    await page.locator('input[type="file"]').last().setInputFiles({
      name: 'successful-upload.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Successful upload\n'),
    });
    const uploadResponse = await uploadResponsePromise;
    const uploadBody = await uploadResponse.text();
    expect(uploadResponse.ok(), `upload response ${uploadResponse.status()}: ${uploadBody}`).toBe(true);
    const uploaded = JSON.parse(uploadBody) as { name?: string; path?: string };
    expect(uploaded).toMatchObject({ name: 'successful-upload.md', path: '/successful-upload.md' });
    await expect(page.getByText('successful-upload.md', { exact: true })).toBeVisible({ timeout: 10_000 });
    return;
  }

  if (probe.action === 'inspect-large-file-list') {
    await page.getByTestId('storage-view-b').click();
    await expect(page.getByRole('region', { name: /files in/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('bulk-file-000.md', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('240 items', { exact: true })).toBeVisible({ timeout: 10_000 });
    return;
  }

  if (probe.action === 'inspect-large-marketplace-catalog') {
    const results = page.getByTestId('marketplace-results');
    await expect(results).toContainText('Bulk Skill 000', { timeout: 20_000 });
    await expect(page.getByTestId('marketplace-section-skills')).toContainText(/Skills\s*.?\s*120/i);
    await expect(page.getByTestId('marketplace-section-connectors')).toContainText(/Connectors\s*.?\s*60/i);
    await expect(page.getByTestId('marketplace-section-mcps')).toContainText(/MCPs\s*.?\s*60/i);
    return;
  }

  if (probe.action === 'inspect-slow-memory-list') {
    await expect.poll(async () => page.locator('[role="status"][aria-busy="true"]').evaluateAll((elements) => elements
      .some((element) => /Loading memories/i.test(element.textContent || ''))), {
      message: 'Memory list should announce a loading state while the API is delayed',
      timeout: 1_500,
    }).toBe(true);
    await expect(page.getByText('40 memories', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Bulk Memory 000', { exact: true })).toBeVisible({ timeout: 20_000 });
    return;
  }

  if (probe.action === 'inspect-large-memory-list') {
    await expect(page.getByText('200 memories', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Bulk Memory 000', { exact: true })).toBeVisible({ timeout: 20_000 });
    return;
  }

  if (probe.action === 'wiki-export-obsidian-failure') {
    await expect(page.getByText('Research Guide', { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /export to obsidian vault/i }).click();
    const dialog = page.getByTestId('wiki-export-dialog');
    await expect(dialog).toContainText(/export to obsidian/i, { timeout: 10_000 });
    await page.getByLabel(/obsidian vault directory/i).fill('C:/Research Vault');
    await page.getByRole('button', { name: /^export to obsidian$/i }).click();
    return;
  }

  if (probe.action === 'inspect-slow-agent-list') {
    await expect(page.getByTestId('bee-loader')).toHaveAttribute('aria-busy', 'true', { timeout: 1_500 });
    await expect(page.getByTestId('bee-loader')).toContainText(/Loading agents/i, { timeout: 1_500 });
    await expect(page.getByTestId('agent-center-kpis')).toContainText(/40\s+agents/i, { timeout: 20_000 });
    await expect(page.getByRole('button', { name: /Open agent Bulk Agent 000/i })).toBeVisible({ timeout: 20_000 });
    return;
  }

  if (probe.action === 'inspect-large-agent-list') {
    await expect(page.getByTestId('agent-center-kpis')).toContainText(/180\s+agents/i, { timeout: 20_000 });
    await expect(page.getByRole('button', { name: /Open agent Bulk Agent 000/i })).toBeVisible({ timeout: 20_000 });
    return;
  }

  if (probe.action === 'inspect-large-timeline-events') {
    await expect(page.getByText('360 events', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Used bulk_tool_000', { exact: true })).toBeVisible({ timeout: 20_000 });
    return;
  }
}

function writeStateBundle(
  dir: string,
  persona: PersonaBundle,
  routeEvidence: RouteEvidence[],
  failureEvidence: FailureEvidence[],
  overlayEvidence: OverlayEvidence[],
  capture: BrowserCapture,
): void {
  const expectedConsoleErrors = persona.failureProbes.flatMap((probe) => probe.expectedConsoleErrors ?? []);
  const expectedNetworkFailures = persona.failureProbes.flatMap((probe) => probe.expectedNetworkFailures ?? []);
  const overlayResult = overlayEvidence.length > 0
    ? overlayEvidence.map((probe) => probe.result).join('; ')
    : 'not required for this persona';
  const data = {
    persona: {
      title: persona.title,
      accountMode: persona.accountMode,
      billingTier: persona.billingTier,
      uiDisclosureTier: persona.uiDisclosureTier,
      modelState: persona.modelState,
      dataState: persona.dataState,
      offlineErrorState: persona.offlineErrorState,
      viewport: persona.viewport,
      nonMainGateDecisions: persona.nonMainGateDecisions,
    },
    routes: routeEvidence,
    failureEvidence,
    overlayEvidence,
    overlayResult,
    consoleErrors: capture.consoleErrors,
    criticalConsoleErrors: critical(capture.consoleErrors, expectedConsoleErrors),
    pageErrors: capture.pageErrors,
    networkFailures: capture.networkFailures,
    criticalNetworkFailures: critical(capture.networkFailures, expectedNetworkFailures),
  };

  writeFileSync(join(dir, 'state-bundle.json'), JSON.stringify(data, null, 2));
  writeFileSync(join(dir, 'state-bundle.md'), [
    `# ${persona.title}`,
    '',
    `- Account mode: ${persona.accountMode}`,
    `- Billing tier: ${persona.billingTier}`,
    `- UI disclosure tier: ${persona.uiDisclosureTier}`,
    `- Model state: ${persona.modelState}`,
    `- Data state: ${persona.dataState}`,
    `- Offline/error state: ${persona.offlineErrorState}`,
    `- Viewport: ${persona.viewport.width} x ${persona.viewport.height}`,
    `- Non-main gate decisions: ${persona.nonMainGateDecisions.join(' ')}`,
    `- Failure probes captured: ${failureEvidence.length}`,
    `- Overlay probes captured: ${overlayEvidence.length}`,
    `- Overlay close result: ${overlayResult}`,
    `- Critical console errors: ${critical(capture.consoleErrors, expectedConsoleErrors).length}`,
    `- Critical page errors: ${capture.pageErrors.length}`,
    `- Critical network failures: ${critical(capture.networkFailures, expectedNetworkFailures).length}`,
    '',
    '## Routes',
    '',
    ...routeEvidence.flatMap((route) => [
      `### ${route.id}`,
      '',
      `- Path: ${route.path}`,
      `- Final URL: ${route.url}`,
      `- Viewport: ${route.viewport.width} x ${route.viewport.height}`,
      `- Screenshot: ${route.screenshot}`,
      `- Visible horizontal overflow items: ${route.overflow.length}`,
      '',
    ]),
    '## Failure Probes',
    '',
    ...failureEvidence.flatMap((probe) => [
      `### ${probe.id}`,
      '',
      `- Path: ${probe.path}`,
      `- Final URL: ${probe.url}`,
      `- Action: ${probe.action}`,
      `- Expected copy: ${probe.expected}`,
      `- Mocked routes: ${probe.mockedRoutes.join(', ')}`,
      `- Viewport: ${probe.viewport.width} x ${probe.viewport.height}`,
      `- Screenshot: ${probe.screenshot}`,
      `- Visible horizontal overflow items: ${probe.overflow.length}`,
      '',
    ]),
    '## Overlay Probes',
    '',
    ...overlayEvidence.flatMap((probe) => [
      `### ${probe.id}`,
      '',
      `- Result: ${probe.result}`,
      `- Screenshot: ${probe.screenshot}`,
      `- Visible horizontal overflow items: ${probe.overflow.length}`,
      '',
    ]),
  ].join('\n'));
}

test.describe.configure({ timeout: 180_000 });

test.describe('five-persona state-bundle evidence', () => {
  for (const persona of PERSONAS) {
    test(persona.slug, async ({ page }) => {
      const dir = join(ARTIFACT_ROOT, persona.slug);
      mkdirSync(dir, { recursive: true });
      const capture = attachBrowserCapture(page);
      const routeEvidence: RouteEvidence[] = [];
      const failureEvidence: FailureEvidence[] = [];
      const overlayEvidence: OverlayEvidence[] = [];

      expect(persona.failureProbes, `${persona.slug} failure probes`).not.toHaveLength(0);

      await page.addInitScript(() => {
        localStorage.clear();
        sessionStorage.clear();
        localStorage.setItem('waggle:tooltips_done', 'true');
        const activeWorkspace = new URLSearchParams(window.location.search).get('activeWorkspace');
        if (activeWorkspace) {
          localStorage.setItem('waggle:active-workspace-v1', activeWorkspace);
        }
      });

      for (const [index, route] of persona.routes.entries()) {
        const viewport = route.viewport ?? persona.viewport;
        await page.setViewportSize(viewport);
        await page.goto(routeWithState(route.path, persona.uiDisclosureTier), { waitUntil: 'domcontentloaded' });
        await waitForShell(page);
        await expect(page.locator('body')).toContainText(route.expected, { timeout: 20_000 });
        await waitForSettledRoute(page);
        if (route.loading) {
          await expect(page.getByText(route.loading).first()).not.toBeVisible({ timeout: 20_000 });
        }
        const screenshotPath = join(dir, `${String(index + 1).padStart(2, '0')}-${route.id}.png`);
        await captureScreenshot(page, screenshotPath);

        routeEvidence.push({
          id: route.id,
          path: route.path,
          url: redactDiagnosticUrl(page.url()),
          viewport,
          screenshot: relative(process.cwd(), screenshotPath),
          overflow: await visibleHorizontalOverflow(page),
          bodyPreview: (await page.locator('body').innerText()).slice(0, 1200),
        });
      }

      for (const [index, probe] of persona.failureProbes.entries()) {
        const viewport = probe.viewport ?? persona.viewport;
        await page.setViewportSize(viewport);
        await registerFailureMocks(page, probe.mocks);
        try {
          await page.goto(routeWithState(probe.path, persona.uiDisclosureTier), { waitUntil: 'domcontentloaded' });
          await waitForShell(page);
          await runFailureAction(page, probe);
          await expect(page.locator('body')).toContainText(probe.expected, { timeout: 20_000 });
          const screenshotPath = join(dir, `failure-${String(index + 1).padStart(2, '0')}-${probe.id}.png`);
          await captureScreenshot(page, screenshotPath);

          failureEvidence.push({
            id: probe.id,
            path: probe.path,
            url: redactDiagnosticUrl(page.url()),
            viewport,
            screenshot: relative(process.cwd(), screenshotPath),
            overflow: await visibleHorizontalOverflow(page),
            bodyPreview: (await page.locator('body').innerText()).slice(0, 1200),
            action: probe.action,
            expected: probe.expected.toString(),
            mockedRoutes: probe.mocks.map((mock) => mock.url),
          });
        } finally {
          await clearFailureMocks(page, probe.mocks);
        }
      }

      for (const [index, probe] of (persona.overlayProbes ?? []).entries()) {
        overlayEvidence.push(await runOverlayProbe(page, dir, probe, index));
      }

      writeStateBundle(dir, persona, routeEvidence, failureEvidence, overlayEvidence, capture);

      const expectedConsoleErrors = persona.failureProbes.flatMap((probe) => probe.expectedConsoleErrors ?? []);
      const expectedNetworkFailures = persona.failureProbes.flatMap((probe) => probe.expectedNetworkFailures ?? []);
      const visibleOverflow = [...routeEvidence, ...failureEvidence, ...overlayEvidence].flatMap((evidence) => evidence.overflow);

      expect(routeEvidence, `${persona.slug} route evidence`).toHaveLength(persona.routes.length);
      expect(failureEvidence, `${persona.slug} failure evidence`).toHaveLength(persona.failureProbes.length);
      expect(overlayEvidence, `${persona.slug} overlay evidence`).toHaveLength(persona.overlayProbes?.length ?? 0);
      expect(existsSync(join(dir, 'state-bundle.md')), `${persona.slug} markdown bundle`).toBeTruthy();
      expect(existsSync(join(dir, 'state-bundle.json')), `${persona.slug} json bundle`).toBeTruthy();
      expect(visibleOverflow, `${persona.slug} visible horizontal overflow`).toEqual([]);
      expect(critical(capture.consoleErrors, expectedConsoleErrors), `${persona.slug} critical console errors`).toEqual([]);
      expect(critical(capture.networkFailures, expectedNetworkFailures), `${persona.slug} critical network failures`).toEqual([]);
      expect(capture.pageErrors, `${persona.slug} page errors`).toEqual([]);
    });
  }
});
