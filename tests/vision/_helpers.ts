/**
 * Vision-harness shared helpers.
 *
 * Extracted from the proven (but copy-pasted) navigation idioms in
 * tests/e2e/full-product-audit.spec.ts + the theme contract documented in
 * docs/audits/2026-06-01-vision-e2e-harness-design.md. Centralised here so the
 * capture spec drives the real desktop-OS shell deterministically.
 */
import type { Page } from '@playwright/test';

export const BASE = process.env.WAGGLE_E2E_BASE_URL ?? 'http://127.0.0.1:3333';

/** Console errors / pageerrors / failed requests that are environmental noise,
 * not product defects (mirrors full-product-audit.spec.ts:312). */
const BENIGN = [
  'Failed to fetch', 'net::ERR', 'favicon', '401', '404', 'sync',
  'WebSocket', 'fetch', 'chunk', 'ResizeObserver',
];

const REDACTED = '[REDACTED]';
const SENSITIVE_TEXT_KEY = [
  'access_token', 'id_token', 'refresh_token', 'session_token', 'api_key',
  'accessToken', 'idToken', 'refreshToken', 'sessionToken', 'apiKey',
  'api-key', 'x-api-key', 'x_api_key', 'xApiKey',
  'client_secret', 'authorization', 'credential', 'signature', 'password',
  'clientSecret', 'token', 'apikey', 'secret', 'cookie',
].join('|');
const SENSITIVE_STRUCTURED_KEY = `${SENSITIVE_TEXT_KEY}|auth|code|sig|key`;
const URL_USERINFO = /\b([a-z][a-z0-9+.-]*:\/\/)([^/@\s]+)@/gi;
const AUTHORIZATION_HEADER = /\b(authorization|auth)(\s*[:=]\s*)(?:Bearer|Basic)\s+[^\s,;]+/gi;
const COOKIE_HEADER = /\b(cookie|set-cookie)(\s*:\s*)[^\r\n]*/gi;
const QUERY_SECRET = new RegExp(
  `([?&#](?:${SENSITIVE_STRUCTURED_KEY})=)([^&#\\s]*)`,
  'gi',
);
const QUOTED_STRUCTURED_SECRET = new RegExp(
  `(["'])(${SENSITIVE_STRUCTURED_KEY})\\1(\\s*:\\s*)(["'])((?:\\\\.|(?!\\4)[^\\r\\n])*)\\4`,
  'gi',
);
const NAMED_SECRET = new RegExp(
  `\\b(${SENSITIVE_TEXT_KEY})\\b(\\s*[:=]\\s*)(?:"[^"]*"|'[^']*'|[^\\s,;&}]+)`,
  'gi',
);

function redactEmbeddedSecrets(value: string): string {
  return value
    .replace(URL_USERINFO, `$1${REDACTED}@`)
    .replace(AUTHORIZATION_HEADER, (_match, key: string, separator: string) => (
      `${key}${separator}${REDACTED}`
    ))
    .replace(COOKIE_HEADER, (_match, key: string, separator: string) => (
      `${key}${separator}${REDACTED}`
    ))
    .replace(QUERY_SECRET, (_match, prefix: string) => `${prefix}${REDACTED}`)
    .replace(
      QUOTED_STRUCTURED_SECRET,
      (_match, keyQuote: string, key: string, separator: string, valueQuote: string) => (
        `${keyQuote}${key}${keyQuote}${separator}${valueQuote}${REDACTED}${valueQuote}`
      ),
    )
    .replace(NAMED_SECRET, (_match, key: string, separator: string) => (
      `${key}${separator}${REDACTED}`
    ));
}

/** Preserve diagnostic structure while removing credentials embedded in a URL. */
export function redactDiagnosticUrl(value: string): string {
  return redactEmbeddedSecrets(value);
}

/** Redact URLs, query parameters, and header-like secrets inside diagnostic text. */
export function redactDiagnosticText(value: string): string {
  return redactEmbeddedSecrets(value);
}

export interface ConsoleCapture {
  errors: string[];
  pageErrors: string[];
  networkFailures: string[];
  /** Console errors with environmental noise filtered out. */
  critical(): string[];
}

/** Attach BEFORE navigation so nothing is missed. */
export function attachConsoleCapture(page: Page): ConsoleCapture {
  const cap: ConsoleCapture = {
    errors: [],
    pageErrors: [],
    networkFailures: [],
    critical() {
      return this.errors.filter((e) => !BENIGN.some((b) => e.includes(b)));
    },
  };
  page.on('console', (msg) => {
    if (msg.type() === 'error') cap.errors.push(redactDiagnosticText(msg.text()));
  });
  page.on('pageerror', (err) => cap.pageErrors.push(redactDiagnosticText(err.message)));
  page.on('requestfailed', (req) => {
    const url = redactDiagnosticUrl(req.url());
    if (!BENIGN.some((b) => url.includes(b))) {
      const failure = redactDiagnosticText(req.failure()?.errorText ?? 'failed');
      cap.networkFailures.push(`${req.method()} ${url} — ${failure}`);
    }
  });
  return cap;
}

/** Dismiss the onboarding / "Start Working" overlay if present (3 attempts). */
export async function dismissOverlay(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const overlay = page.locator('.fixed.backdrop-blur-sm');
    if (!(await overlay.isVisible({ timeout: 1000 }).catch(() => false))) break;
    const startBtn = page.locator('button:has-text("Start Working")');
    if (await startBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await startBtn.click({ force: true });
      await page.waitForTimeout(500);
      continue;
    }
    await page.mouse.click(5, 5);
    await page.waitForTimeout(500);
  }
}

/** Deterministic entry: power tier, onboarding skipped, overlay dismissed. */
export async function gotoDesktop(page: Page): Promise<void> {
  await page.goto(`${BASE}/home?skipOnboarding=true&skipBoot=true&tier=power&skipBriefing=true`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.waggle-sidebar, [role="navigation"], main', { timeout: 15_000 });
  await page.waitForTimeout(500);
  await dismissOverlay(page);
}

/**
 * Theme contract: light = `data-theme="light"` on <html>; dark = attribute
 * absent (Index.tsx:11 / useIsLightTheme.ts / index.css:140). We persist to
 * localStorage so the React app keeps it, then apply live to avoid a reload.
 */
export async function setTheme(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.evaluate((t) => {
    localStorage.setItem('waggle-theme', t);
    if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
  }, theme);
  await page.waitForTimeout(400);
}

/**
 * Open a dock app by its visible label. Handles three cases the real Dock uses:
 *  1. a direct dock button with aria-label={label}
 *  2. a label inside an Ops/Extend zone tray ([data-dock-tray] portal)
 *  3. nothing found → returns false (caller records a nav miss)
 */
export async function openAppViaDock(page: Page, label: string): Promise<boolean> {
  const route = await routeForLabel(page, label);
  const directBtn = page.locator(`button[aria-label="${label}"]`);
  if (await directBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await directBtn.click();
    await page.waitForTimeout(900);
    return true;
  }
  for (const zone of ['Ops', 'Extend']) {
    const zoneBtn = page.locator(`button[aria-label="${zone}"]`);
    if (await zoneBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await zoneBtn.click();
      await page.waitForTimeout(400);
      const tray = page.locator('[data-dock-tray]');
      if (await tray.isVisible({ timeout: 1000 }).catch(() => false)) {
        const childBtn = tray.locator('button', { hasText: label });
        if (await childBtn.isVisible({ timeout: 500 }).catch(() => false)) {
          await childBtn.click();
          await page.waitForTimeout(900);
          return true;
        }
      }
      await page.mouse.click(5, 5);
      await page.waitForTimeout(200);
    }
  }
  if (route) {
    await page.goto(`${BASE}${route}${route.includes('?') ? '&' : '?'}skipOnboarding=true&skipBoot=true&tier=power&skipBriefing=true`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('.waggle-sidebar, [role="navigation"], main', { timeout: 15_000 });
    await page.waitForTimeout(600);
    return true;
  }
  return false;
}

async function firstWorkspaceId(page: Page): Promise<string | null> {
  const res = await page.request.get(`${BASE}/api/workspaces`).catch(() => null);
  if (!res?.ok()) return null;
  const rows = await res.json().catch(() => null);
  return Array.isArray(rows) ? rows[0]?.id ?? null : null;
}

async function routeForLabel(page: Page, label: string): Promise<string | null> {
  if (label === 'Chat') {
    const wsId = await firstWorkspaceId(page);
    return wsId ? `/workspaces/${wsId}/chat` : '/home';
  }
  const routes: Record<string, string> = {
    Home: '/home',
    Room: '/room',
    Memory: '/memory',
    'Agents': '/agents',
    Files: '/files',
    Approvals: '/approvals',
    'Mission Control': '/settings/mission-control',
    Timeline: '/settings/timeline',
    'Usage & Cost': '/settings/usage',
    'Events & Logs': '/settings/events',
    'Team Governance': '/team',
    'Skills Hub': '/skills',
    'Connector Hub': '/connectors',
    'MCP Hub': '/mcps',
    Marketplace: '/marketplace',
    Settings: '/settings',
    Vault: '/settings/vault',
  };
  return routes[label] ?? null;
}

/** Fire a keyboard shortcut at the window (the app listens on window keydown). */
export async function pressShortcut(
  page: Page,
  opts: { key: string; code: string; ctrl?: boolean; shift?: boolean },
): Promise<void> {
  await page.evaluate((o) => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: o.key, code: o.code, ctrlKey: !!o.ctrl, shiftKey: !!o.shift, bubbles: true,
      }),
    );
  }, opts);
  await page.waitForTimeout(600);
}
