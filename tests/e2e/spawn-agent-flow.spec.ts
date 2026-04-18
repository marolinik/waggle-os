/**
 * Phase A/B polish verification — boot skip + spawn-agent flow.
 *
 * Covers:
 *   H-01 (QW-3): BootScreen shows on first visit, skipped on subsequent visits.
 *   H-02 (P35):  SpawnAgentDialog empty-state branches correctly:
 *                - no keys configured  → Settings → Vault CTA with Key icon
 *                - keys configured but no models → retry CTA
 *                - models present     → model chips rendered
 *   H-03 (P36):  Dock spawn-agent icon click opens SpawnAgentDialog.
 *
 * Run: npx playwright test tests/e2e/spawn-agent-flow.spec.ts --reporter=list
 */
import { test, expect, type Page } from '@playwright/test';

/**
 * Navigate to the Desktop with onboarding + boot screen both skipped.
 * Uses the supported `?skipOnboarding=true&tier=power` bypass defined in
 * `hooks/useOnboarding.ts:25-32` — that branch writes the completed state
 * to localStorage synchronously before the first render so the Desktop
 * mounts immediately with the power-tier dock (which includes the
 * spawn-agent shortcut).
 */
async function gotoDesktop(page: Page, url = '/?skipOnboarding=true&tier=power&skipBriefing=true') {
  await page.addInitScript(() => {
    localStorage.setItem('waggle-booted', 'true');
  });
  await page.goto(url);
}

// ── H-01 · BootScreen skip on return visits ────────────────────────────

test.describe('H-01 QW-3 · BootScreen skip', () => {
  test('first visit renders BootScreen', async ({ page }) => {
    // Do NOT set waggle-booted — we want the fresh-state path.
    // skipOnboarding bypass still applies so nothing else blocks.
    await page.addInitScript(() => {
      localStorage.removeItem('waggle-booted');
    });
    await page.goto('/?skipOnboarding=true&tier=power&skipBriefing=true');
    await expect(page.getByTestId('boot-screen')).toBeVisible({ timeout: 5_000 });
  });

  test('return visit skips BootScreen', async ({ page }) => {
    await gotoDesktop(page);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('boot-screen')).toHaveCount(0);
  });
});

// ── H-03 · Dock spawn-agent click opens the dialog ─────────────────────

test.describe('H-03 P36 · Dock spawn-agent wiring', () => {
  test('clicking the dock rocket icon opens SpawnAgentDialog', async ({ page }) => {
    await gotoDesktop(page);
    const dockIcon = page.getByRole('button', { name: /spawn agent/i });
    await expect(dockIcon).toBeVisible({ timeout: 10_000 });
    await dockIcon.click();
    await expect(page.getByTestId('spawn-agent-dialog')).toBeVisible();
  });
});

// ── H-02 · SpawnAgentDialog empty-state branches ───────────────────────

test.describe('H-02 P35 · Spawn-agent models empty-state', () => {
  test('no keys configured → Settings→Vault CTA', async ({ page }) => {
    // Mock both endpoints BEFORE navigation so the dialog's useEffect hits them.
    await page.route('**/api/litellm/models', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.route('**/api/providers', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          providers: [
            { id: 'anthropic', name: 'Anthropic', hasKey: false, models: [] },
            { id: 'openai', name: 'OpenAI', hasKey: false, models: [] },
          ],
        }),
      }),
    );
    await gotoDesktop(page);
    await page.getByRole('button', { name: /spawn agent/i }).click();
    await expect(page.getByTestId('spawn-no-keys-cta')).toBeVisible();
    await expect(page.getByTestId('spawn-no-keys-cta')).toContainText(/Settings → Vault|Ollama/i);
  });

  test('keys configured but no models → retry CTA', async ({ page }) => {
    await page.route('**/api/litellm/models', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.route('**/api/providers', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          providers: [
            { id: 'anthropic', name: 'Anthropic', hasKey: true, models: [] },
          ],
        }),
      }),
    );
    await gotoDesktop(page);
    await page.getByRole('button', { name: /spawn agent/i }).click();
    await expect(page.getByTestId('spawn-no-models-cta')).toBeVisible();
    await expect(page.getByTestId('spawn-no-models-cta')).toContainText(/Retry/i);
  });

  test('models present → model chip list', async ({ page }) => {
    await page.route('**/api/litellm/models', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(['claude-sonnet-4-6', 'gpt-4.1', 'gemma4:31b']),
      }),
    );
    await page.route('**/api/providers', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          providers: [{ id: 'anthropic', name: 'Anthropic', hasKey: true, models: [] }],
        }),
      }),
    );
    await gotoDesktop(page);
    await page.getByRole('button', { name: /spawn agent/i }).click();
    await expect(page.getByTestId('spawn-models-list')).toBeVisible();
    await expect(page.getByTestId('spawn-models-list')).toContainText('claude-sonnet-4-6');
  });
});
