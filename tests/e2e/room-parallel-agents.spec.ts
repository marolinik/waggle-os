/**
 * P6 regression — Room canvas visualises multiple parallel sub-agents
 * correctly, without cross-contamination.
 *
 * Mocks the adapter's /health handshake and replaces window.EventSource
 * with a stub that emits one `subagent_status` event carrying two
 * simultaneously-running agents. Then asserts the Room renders two
 * distinct tiles with the right role badges + running status.
 *
 * Pairs with `apps/web/src/lib/room-state-reducer.test.ts` (12 unit
 * tests covering the reducer directly). This E2E adds the render-path
 * guarantee on top.
 *
 * Run: npx playwright test tests/e2e/room-parallel-agents.spec.ts --reporter=list
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://127.0.0.1:3333';

// Canonical test payload — two agents in one status event, different roles.
const AGENT_ALPHA_ID = 'agent-alpha-p6';
const AGENT_BETA_ID = 'agent-beta-p6';

const MOCK_ROSTER = {
  type: 'subagent_status',
  workspaceId: 'default',
  agents: [
    {
      id: AGENT_ALPHA_ID,
      name: 'Alpha Researcher',
      role: 'researcher',
      status: 'running',
      task: 'Scout the competitive landscape for bee pollinator tech',
      toolsUsed: ['web_search'],
      startedAt: Date.now() - 30_000,
    },
    {
      id: AGENT_BETA_ID,
      name: 'Beta Coder',
      role: 'coder',
      status: 'running',
      task: 'Draft the TypeScript API surface for the honey-ledger module',
      toolsUsed: ['read_file'],
      startedAt: Date.now() - 15_000,
    },
  ],
  timestamp: new Date().toISOString(),
};

async function installSseMock(page: Page) {
  // Adapter gates subscribe() on `_connected`, which flips to true only
  // after a successful /health call. Mock it.
  await page.route('**/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ wsToken: 'p6-ws-token', authToken: 'p6-auth-token' }),
    });
  });

  // Replace EventSource with a stub that dispatches our mock roster on
  // the `subagent_status` named event type. Installed via addInitScript
  // so it lands before the adapter ever calls `new EventSource(...)`.
  await page.addInitScript((roster) => {
    type Listener = (e: MessageEvent) => void;

    class MockEventSource {
      url: string;
      readyState = 1; // OPEN
      onerror: ((e: Event) => void) | null = null;
      onmessage: ((e: MessageEvent) => void) | null = null;
      onopen: ((e: Event) => void) | null = null;
      private listeners: Record<string, Listener[]> = {};

      constructor(url: string) {
        this.url = url;
        (window as any).__p6MockSources = ((window as any).__p6MockSources || []);
        (window as any).__p6MockSources.push(this);

        // Give React a moment to mount and the adapter to call addEventListener.
        setTimeout(() => {
          const ls = this.listeners['subagent_status'] ?? [];
          const evt = new MessageEvent('subagent_status', {
            data: JSON.stringify(roster),
          });
          for (const l of ls) l(evt);
        }, 300);
      }

      addEventListener(type: string, listener: Listener) {
        (this.listeners[type] ??= []).push(listener);
      }

      removeEventListener(type: string, listener: Listener) {
        this.listeners[type] = (this.listeners[type] ?? []).filter((l) => l !== listener);
      }

      close() { this.readyState = 2; }

      // Test helper — re-emit the same roster, useful for cross-contamination check.
      __reemit() {
        const ls = this.listeners['subagent_status'] ?? [];
        const evt = new MessageEvent('subagent_status', { data: JSON.stringify(roster) });
        for (const l of ls) l(evt);
      }
    }

    (window as any).EventSource = MockEventSource;
    // Skip boot screen so we get to Desktop immediately.
    try {
      window.localStorage.setItem('waggle-booted', 'true');
    } catch { /* storage might be unavailable */ }
  }, MOCK_ROSTER);
}

async function dismissOverlay(page: Page) {
  for (let i = 0; i < 3; i++) {
    const overlay = page.locator('.fixed.backdrop-blur-sm').first();
    if (!(await overlay.isVisible({ timeout: 500 }).catch(() => false))) break;
    const startBtn = page.locator('button:has-text("Start Working")').first();
    if (await startBtn.isVisible({ timeout: 400 }).catch(() => false)) {
      await startBtn.click({ force: true });
    } else {
      await page.mouse.click(5, 5);
    }
    await page.waitForTimeout(400);
  }
}

async function openRoom(page: Page) {
  // Matches the working pattern from tests/e2e/phase-ab-verification.spec.ts.
  // Dock icons carry aria-label matching the app's display name.
  const roomBtn = page.locator('button[aria-label="Room"]');
  await roomBtn.waitFor({ state: 'visible', timeout: 5000 });
  await roomBtn.click();
  await expect(page.locator('[data-testid="room-root"]')).toBeVisible({ timeout: 5000 });
}

test.describe('Room — parallel agent visualization (P6)', () => {
  test('renders two simultaneous agents with distinct tiles', async ({ page }) => {
    await installSseMock(page);
    await page.goto(`${BASE}/?skipOnboarding=true&tier=power`);
    await page.waitForLoadState('networkidle');
    await dismissOverlay(page);
    await openRoom(page);

    // Both tiles present, keyed by agent id.
    const alpha = page.locator(`[data-testid="room-agent-tile"][data-agent-id="${AGENT_ALPHA_ID}"]`);
    const beta = page.locator(`[data-testid="room-agent-tile"][data-agent-id="${AGENT_BETA_ID}"]`);
    await expect(alpha).toBeVisible({ timeout: 5000 });
    await expect(beta).toBeVisible({ timeout: 5000 });

    // Live count chip reflects both.
    await expect(page.locator('[data-testid="room-live-count"]')).toContainText('2 live');

    // Total tile count = exactly 2 (no duplicates, no phantom tiles).
    const allTiles = page.locator('[data-testid="room-agent-tile"]');
    await expect(allTiles).toHaveCount(2);
  });

  test('role badges do not cross-contaminate between simultaneous agents', async ({ page }) => {
    await installSseMock(page);
    await page.goto(`${BASE}/?skipOnboarding=true&tier=power`);
    await page.waitForLoadState('networkidle');
    await dismissOverlay(page);
    await openRoom(page);

    const alpha = page.locator(`[data-testid="room-agent-tile"][data-agent-id="${AGENT_ALPHA_ID}"]`);
    const beta = page.locator(`[data-testid="room-agent-tile"][data-agent-id="${AGENT_BETA_ID}"]`);
    await expect(alpha).toBeVisible({ timeout: 5000 });
    await expect(beta).toBeVisible();

    // Each tile carries its own role attribute — verify independence.
    await expect(alpha).toHaveAttribute('data-agent-role', 'researcher');
    await expect(beta).toHaveAttribute('data-agent-role', 'coder');

    // Both are running concurrently.
    await expect(alpha).toHaveAttribute('data-agent-status', 'running');
    await expect(beta).toHaveAttribute('data-agent-status', 'running');

    // Task bodies are distinct — one tile's task text must not leak into the other.
    await expect(alpha).toContainText('Scout the competitive landscape');
    await expect(beta).toContainText('honey-ledger module');
    await expect(alpha).not.toContainText('honey-ledger');
    await expect(beta).not.toContainText('Scout the competitive');
  });
});
