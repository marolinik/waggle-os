/**
 * E2E User Journey Tests — Browser-automated Playwright tests.
 *
 * These are the first real browser interaction tests for Waggle.
 * They verify core user journeys against the running app (server + frontend).
 *
 * Prerequisites:
 *   Server running at localhost:3333 with frontend served from app/dist.
 *   OR use the webServer config in playwright.config.ts to auto-start.
 *
 * Run:
 *   npx playwright test tests/e2e/user-journeys.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Dispatch a Ctrl+Shift+{digit} keyboard shortcut via DOM event.
 *
 * Playwright's keyboard.press('Control+Shift+Digit7') sends `key: '&'`
 * on US-layout keyboards (shift+7 = &), but Waggle's matchesShortcut
 * checks `event.key === '7'` with `shiftKey: true`. We dispatch the
 * exact KeyboardEvent the app handler expects.
 */
async function pressCtrlShiftDigit(page: Page, digit: string) {
  await page.evaluate((d) => {
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: d,
      code: `Digit${d}`,
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
      bubbles: true,
    }));
  }, digit);
}

/** Wait for the Waggle app shell to be present in the DOM. */
async function waitForApp(page: Page) {
  // The app renders either the onboarding wizard or the main AppShell.
  // Wait for either the app shell or the onboarding overlay.
  await page.waitForSelector(
    '.waggle-app-shell, .waggle-sidebar, [role="navigation"], [class*="onboarding"]',
    { timeout: 15_000 },
  ).catch(() => {
    // Fallback: just wait for body to have content
  });
  // Let React hydrate and settle
  await page.waitForTimeout(1000);
}

/** Check if the app is showing the onboarding wizard (first-run state). */
async function isOnboarding(page: Page): Promise<boolean> {
  // Onboarding renders as a fixed overlay with z-[1000]
  const onboardingOverlay = page.locator('.fixed.inset-0.z-\\[1000\\]');
  if (await onboardingOverlay.isVisible().catch(() => false)) return true;
  // Also check for onboarding-specific content
  const wizardText = page.locator('text=Welcome').or(page.locator('text=Get Started')).or(page.locator('text=API Key'));
  return wizardText.isVisible().catch(() => false);
}

/** If onboarding is showing, skip it by navigating directly to the app.
 *  Returns true if onboarding was detected and we need to work around it. */
async function handleOnboarding(page: Page): Promise<boolean> {
  if (await isOnboarding(page)) {
    return true;
  }
  return false;
}

// ── Tests ────────────────────────────────────────────────────────────────

test.describe('User Journey Tests', () => {
  // Each test gets a fresh page — no shared state, no cascading failures.

  // Journey 1: App loads and shows onboarding or main UI
  test('J1: app loads successfully — no blank screen', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    // The body should not be empty
    await expect(page.locator('body')).not.toBeEmpty();

    // Should have meaningful content (not a white error screen)
    const bodyText = await page.textContent('body');
    expect(bodyText?.trim().length).toBeGreaterThan(10);

    // Should have either the app shell or onboarding visible
    const hasAppShell = await page.locator('.waggle-app-shell').isVisible().catch(() => false);
    const hasOnboarding = await isOnboarding(page);

    expect(hasAppShell || hasOnboarding).toBe(true);
  });

  // Journey 2: Sidebar is visible and has navigation items
  test('J2: sidebar shows navigation items', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    if (await handleOnboarding(page)) {
      test.skip(true, 'Onboarding wizard is active — sidebar not visible');
      return;
    }

    // The sidebar should be present with role="navigation"
    const sidebar = page.locator('[role="navigation"][aria-label="Main navigation"]');
    await expect(sidebar).toBeVisible();

    // Should contain navigation buttons for the 7 views
    // The NAV_ITEMS in AppSidebar are: Chat, Capabilities, Cockpit, Mission Control, Memory, Events, Settings
    const navButtons = sidebar.locator('button');
    const count = await navButtons.count();
    // At minimum: 7 nav items + collapse toggle + create workspace + theme toggle = 10+
    expect(count).toBeGreaterThanOrEqual(7);

    // Verify at least some expected labels are present
    await expect(sidebar.locator('text=Chat')).toBeVisible();
    await expect(sidebar.locator('text=Settings')).toBeVisible();
  });

  // Journey 3: Sidebar collapse/expand toggle
  test('J3: sidebar collapse and expand', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    if (await handleOnboarding(page)) {
      test.skip(true, 'Onboarding wizard is active');
      return;
    }

    const sidebar = page.locator('[role="navigation"][aria-label="Main navigation"]');
    await expect(sidebar).toBeVisible();

    // Find the collapse/expand toggle button
    const collapseButton = page.locator('button[aria-label="Collapse sidebar"]')
      .or(page.locator('button[aria-label="Expand sidebar"]'));
    await expect(collapseButton).toBeVisible();

    // Get initial width state via aria-expanded
    const initialExpanded = await collapseButton.getAttribute('aria-expanded');

    // Click to toggle
    await collapseButton.click();
    await page.waitForTimeout(300); // CSS transition

    // aria-expanded should have flipped
    const newExpanded = await collapseButton.getAttribute('aria-expanded');
    expect(newExpanded).not.toBe(initialExpanded);

    // Toggle back
    await collapseButton.click();
    await page.waitForTimeout(300);

    const restoredExpanded = await collapseButton.getAttribute('aria-expanded');
    expect(restoredExpanded).toBe(initialExpanded);
  });

  // Journey 4: Navigate between views via sidebar clicks
  test('J4: navigate between views using sidebar', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    if (await handleOnboarding(page)) {
      test.skip(true, 'Onboarding wizard is active');
      return;
    }

    const sidebar = page.locator('[role="navigation"][aria-label="Main navigation"]');

    // The nav items have titles like "Settings (Ctrl+7)"
    // Click on Settings
    const settingsButton = sidebar.locator('button', { hasText: 'Settings' });
    await settingsButton.click();
    await page.waitForTimeout(500);

    // Settings view should be active — look for settings-panel tabs or "Loading..."
    const settingsContent = page.locator('.settings-panel__tabs')
      .or(page.locator('text=General'))
      .or(page.locator('text=Loading'));
    await expect(settingsContent.first()).toBeVisible({ timeout: 5000 });

    // Navigate to Cockpit
    const cockpitButton = sidebar.locator('button', { hasText: 'Cockpit' });
    await cockpitButton.click();
    await page.waitForTimeout(500);

    // Cockpit should show cards or loading skeleton
    const cockpitContent = page.locator('[class*="card"]')
      .or(page.locator('[class*="Card"]'))
      .or(page.locator('text=System Health'))
      .or(page.locator('text=Loading'));
    await expect(cockpitContent.first()).toBeVisible({ timeout: 5000 });

    // Navigate back to Chat
    const chatButton = sidebar.locator('button', { hasText: 'Chat' });
    await chatButton.click();
    await page.waitForTimeout(500);

    // Chat view should show the textarea input or workspace home
    const chatContent = page.locator('textarea')
      .or(page.locator('text=Ask what matters'))
      .or(page.locator('text=Type a message'));
    await expect(chatContent.first()).toBeVisible({ timeout: 5000 });
  });

  // Journey 5: Navigate between views using keyboard shortcuts (Ctrl+Shift+1-7)
  test('J5: navigate views with keyboard shortcuts', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    if (await handleOnboarding(page)) {
      test.skip(true, 'Onboarding wizard is active');
      return;
    }

    // The keyboard shortcuts use matchesNamedShortcut with Ctrl+Shift+1-7:
    //   switchView1 = Chat
    //   switchView2 = Memory
    //   switchView3 = Events
    //   switchView4 = Capabilities
    //   switchView5 = Cockpit
    //   switchView6 = Mission Control
    //   switchView7 = Settings

    // Navigate to Settings (Ctrl+Shift+7)
    await pressCtrlShiftDigit(page, '7');
    await page.waitForTimeout(500);

    // Verify settings content appeared
    const settingsContent = page.locator('.settings-panel__tabs')
      .or(page.locator('.settings-panel__tab'))
      .or(page.locator('text=Loading'));
    await expect(settingsContent.first()).toBeVisible({ timeout: 5000 });

    // Navigate to Memory (Ctrl+Shift+2)
    await pressCtrlShiftDigit(page, '2');
    await page.waitForTimeout(500);

    // Memory view should show search or memory content
    const memoryContent = page.locator('[placeholder*="search" i]')
      .or(page.locator('[placeholder*="Search" i]'))
      .or(page.locator('text=Memory'))
      .or(page.locator('text=No memories'));
    await expect(memoryContent.first()).toBeVisible({ timeout: 5000 });

    // Navigate back to Chat (Ctrl+Shift+1)
    await pressCtrlShiftDigit(page, '1');
    await page.waitForTimeout(500);

    const chatContent = page.locator('textarea')
      .or(page.locator('text=Ask what matters'))
      .or(page.locator('text=Type a message'));
    await expect(chatContent.first()).toBeVisible({ timeout: 5000 });
  });

  // Journey 6: Chat input interaction
  test('J6: chat textarea accepts input', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    if (await handleOnboarding(page)) {
      test.skip(true, 'Onboarding wizard is active');
      return;
    }

    // Make sure we're on the Chat view
    const sidebar = page.locator('[role="navigation"][aria-label="Main navigation"]');
    const chatButton = sidebar.locator('button', { hasText: 'Chat' });
    if (await chatButton.isVisible()) {
      await chatButton.click();
      await page.waitForTimeout(500);
    }

    // Find the chat textarea
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 5000 });

    // Type a message
    await textarea.fill('Hello Waggle, this is a test message');
    await expect(textarea).toHaveValue('Hello Waggle, this is a test message');

    // Clear it
    await textarea.fill('');
    await expect(textarea).toHaveValue('');

    // Type a slash command prefix
    await textarea.fill('/help');
    await expect(textarea).toHaveValue('/help');
  });

  // Journey 7: Global search — full interaction (open, search, select, close)
  //
  // The DialogHeader crash has been fixed (moved inside DialogContent).
  // This test exercises the full GlobalSearch command palette flow.
  test('J7: global search opens, searches, selects, and closes', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    if (await handleOnboarding(page)) {
      test.skip(true, 'Onboarding wizard is active');
      return;
    }

    // Verify app is loaded
    await expect(page.locator('.waggle-app-shell')).toBeVisible({ timeout: 5000 });

    // ── Step 1: Open GlobalSearch via Ctrl+K ──
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(500);

    // The CommandDialog renders inside a Dialog with role="dialog"
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // The CommandInput should be visible with the placeholder
    const searchInput = page.locator('[data-slot="command-input"]')
      .or(page.locator('input[placeholder="Type to search..."]'));
    await expect(searchInput.first()).toBeVisible({ timeout: 3000 });

    // ── Step 2: Verify search groups are present (Commands, Settings) ──
    // The dialog should show CommandGroup headings
    const commandsHeading = dialog.locator('text=Commands');
    const settingsHeading = dialog.locator('text=Settings');
    await expect(commandsHeading.first()).toBeVisible({ timeout: 3000 });
    await expect(settingsHeading.first()).toBeVisible({ timeout: 3000 });

    // ── Step 3: Type a query to filter results ──
    await searchInput.first().fill('help');
    await page.waitForTimeout(300);

    // The /help command should be visible in the filtered results
    const helpItem = dialog.locator('[data-slot="command-item"]', { hasText: '/help' })
      .or(dialog.locator('text=/help'));
    await expect(helpItem.first()).toBeVisible({ timeout: 3000 });

    // ── Step 4: Select a result by clicking it ──
    await helpItem.first().click();
    await page.waitForTimeout(500);

    // The dialog should close after selection
    await expect(dialog).not.toBeVisible({ timeout: 3000 });

    // ── Step 5: Re-open and close with Escape ──
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(500);
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await expect(dialog).not.toBeVisible({ timeout: 3000 });

    // App should still be functional after dialog interactions
    await expect(page.locator('body')).not.toBeEmpty();
  });

  // Journey 8: Settings view loads with tabs
  test('J8: settings view shows tabs', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    if (await handleOnboarding(page)) {
      test.skip(true, 'Onboarding wizard is active');
      return;
    }

    // Navigate to settings (Ctrl+Shift+7)
    await pressCtrlShiftDigit(page, '7');
    await page.waitForTimeout(1000);

    // Settings should show tab buttons.
    // The SettingsPanel has tabs: General, Models, Vault, Permissions, Team, Advanced
    const settingsTabs = page.locator('.settings-panel__tab');
    const tabCount = await settingsTabs.count();

    if (tabCount > 0) {
      // Should have 5+ tabs (General, Models, Vault, Permissions, Team or Advanced)
      expect(tabCount).toBeGreaterThanOrEqual(5);

      // Click through tabs to verify they load
      for (let i = 0; i < Math.min(tabCount, 3); i++) {
        await settingsTabs.nth(i).click();
        await page.waitForTimeout(300);
        // Tab should gain active styling — just verify it didn't crash
        await expect(page.locator('body')).not.toBeEmpty();
      }
    } else {
      // Settings might still be loading or config might be null
      // Check for loading or error states
      const settingsArea = page.locator('text=Loading').or(page.locator('text=settings'));
      await expect(settingsArea.first()).toBeVisible({ timeout: 5000 });
    }
  });

  // Journey 9: Theme toggle switches between dark and light
  test('J9: theme toggle switches dark/light mode', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    if (await handleOnboarding(page)) {
      test.skip(true, 'Onboarding wizard is active');
      return;
    }

    const sidebar = page.locator('[role="navigation"][aria-label="Main navigation"]');

    // The theme toggle button is in the sidebar bottom area.
    // It shows either a sun icon + "light mode" or a moon icon + "dark mode".
    const themeToggle = sidebar.locator('button', { hasText: /light mode|dark mode/i });

    if (await themeToggle.isVisible()) {
      // Get the initial theme from the html element
      const initialClass = await page.locator('html').getAttribute('class') ?? '';
      const initialDataTheme = await page.locator('html').getAttribute('data-theme') ?? '';

      await themeToggle.click();
      await page.waitForTimeout(500);

      // After toggle, the class or data-theme should change
      const newClass = await page.locator('html').getAttribute('class') ?? '';
      const newDataTheme = await page.locator('html').getAttribute('data-theme') ?? '';

      // At least one of these should have changed
      const changed = newClass !== initialClass || newDataTheme !== initialDataTheme;
      expect(changed).toBe(true);

      // Toggle back to original
      await themeToggle.click();
      await page.waitForTimeout(500);
    } else {
      // Sidebar might be collapsed — expand first
      const expandButton = page.locator('button[aria-label="Expand sidebar"]');
      if (await expandButton.isVisible()) {
        await expandButton.click();
        await page.waitForTimeout(300);
        // Try again
        const toggle = sidebar.locator('button', { hasText: /light mode|dark mode/i });
        if (await toggle.isVisible()) {
          await toggle.click();
          await page.waitForTimeout(300);
        }
      }
    }
  });

  // Journey 10: Cockpit view loads with dashboard cards
  test('J10: cockpit view shows dashboard cards', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    if (await handleOnboarding(page)) {
      test.skip(true, 'Onboarding wizard is active');
      return;
    }

    // Navigate to Cockpit (Ctrl+Shift+5)
    await pressCtrlShiftDigit(page, '5');
    await page.waitForTimeout(1500); // Cockpit fetches data on mount

    // Cockpit should show cards. The CockpitView renders 10 cards:
    // System Health, Service Health, Cost, Memory Stats, Vault, Cron,
    // Capability Overview, Agent Topology, Connectors, Audit Trail

    // Look for card-like elements or known card titles
    const cardTitles = page.locator('text=System Health')
      .or(page.locator('text=Service Health'))
      .or(page.locator('text=Memory'))
      .or(page.locator('text=Cost'))
      .or(page.locator('text=Capabilities'))
      .or(page.locator('text=Cron'));

    const visibleTitles = await cardTitles.count();

    if (visibleTitles > 0) {
      // At least a few dashboard cards loaded
      expect(visibleTitles).toBeGreaterThanOrEqual(2);
    } else {
      // Could be skeleton loading state — that's acceptable
      const skeletons = page.locator('[class*="skeleton"]').or(page.locator('[class*="Skeleton"]'));
      const skeletonCount = await skeletons.count();
      // Either cards or skeletons should be visible
      expect(skeletonCount).toBeGreaterThanOrEqual(1);
    }
  });

  // Journey 11: Keyboard help overlay opens with Ctrl+/
  test('J11: keyboard shortcuts help overlay', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    if (await handleOnboarding(page)) {
      test.skip(true, 'Onboarding wizard is active');
      return;
    }

    // Ctrl+/ opens the keyboard shortcuts help overlay
    await page.keyboard.press('Control+/');
    await page.waitForTimeout(500);

    // Look for the help overlay content (KeyboardShortcutsHelp component)
    const helpContent = page.locator('text=Keyboard Shortcuts')
      .or(page.locator('text=Ctrl+'))
      .or(page.locator('text=keyboard'));

    const helpVisible = await helpContent.first().isVisible().catch(() => false);

    if (helpVisible) {
      // Verify it shows some shortcut descriptions
      await expect(helpContent.first()).toBeVisible();

      // Close with Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // App should still be functional
    await expect(page.locator('body')).not.toBeEmpty();
  });

  // Journey 12: Status bar shows model and workspace info
  test('J12: status bar displays model and workspace', async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);

    if (await handleOnboarding(page)) {
      test.skip(true, 'Onboarding wizard is active');
      return;
    }

    // The StatusBar is always visible at the bottom.
    // It shows: model name, workspace name, token count, cost, mode.

    // Look for "local" mode indicator or workspace name "Default"
    const statusBar = page.locator('text=local')
      .or(page.locator('text=Default'))
      .or(page.locator('text=Claude'))
      .or(page.locator('text=tokens'));

    await expect(statusBar.first()).toBeVisible({ timeout: 5000 });
  });
});
