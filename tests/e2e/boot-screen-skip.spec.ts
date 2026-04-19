/**
 * H-01 · QW-3 regression — skip BootScreen on return visits.
 *
 * apps/web/src/pages/Index.tsx gates BootScreen on a `waggle-booted`
 * localStorage key. First visit: key absent → BootScreen mounts, runs
 * through phase animation, calls `onComplete` which writes the key and
 * sets `booted=true`. Subsequent visits: key present → BootScreen never
 * mounts; Desktop renders immediately.
 *
 * Guards three properties:
 *  1. Fresh storage shows BootScreen (behavior under the gate).
 *  2. Pre-seeded BOOT_KEY makes BootScreen skip entirely.
 *  3. Completing the boot writes the key and persists across reload.
 *
 * Run: npx playwright test tests/e2e/boot-screen-skip.spec.ts --reporter=list
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://127.0.0.1:3333';
const BOOT_KEY = 'waggle-booted';
const BOOT_SCREEN = '[data-testid="boot-screen"]';

async function clearBootFlag(page: Page) {
  // Fresh-storage setup: wipe BOOT_KEY before React mounts. Using
  // addInitScript so the removal lands before the useState initializer
  // in Index.tsx reads localStorage. Wrap in try-catch because some
  // browsers throw on localStorage access in file:// contexts.
  await page.addInitScript(() => {
    try {
      window.localStorage.removeItem('waggle-booted');
    } catch {
      // ignore — localStorage unavailable
    }
  });
}

async function seedBootFlag(page: Page) {
  // Return-visit setup: mark boot as completed before first navigation.
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('waggle-booted', 'true');
    } catch {
      // ignore
    }
  });
}

test.describe('H-01 · QW-3 · BootScreen skip on return visits', () => {
  test('fresh storage renders BootScreen', async ({ page }) => {
    await clearBootFlag(page);
    await page.goto(`${BASE}/`);

    // BootScreen should mount immediately (before the ~2.5s auto-advance
    // completes). 1s window is well inside the animation runtime.
    await expect(page.locator(BOOT_SCREEN)).toBeVisible({ timeout: 1_000 });
  });

  test('pre-seeded BOOT_KEY skips BootScreen entirely', async ({ page }) => {
    await seedBootFlag(page);
    await page.goto(`${BASE}/`);
    await page.waitForLoadState('domcontentloaded');

    // Assert BootScreen never mounted. toHaveCount(0) proves non-rendered,
    // not merely off-screen — the AnimatePresence branch in Index.tsx
    // conditionally renders on `!booted`.
    await expect(page.locator(BOOT_SCREEN)).toHaveCount(0);

    // Sanity: confirm the localStorage key survived into the page runtime.
    const bootFlag = await page.evaluate(() => window.localStorage.getItem('waggle-booted'));
    expect(bootFlag).not.toBeNull();
  });

  test('completing boot persists the flag across reload', async ({ page }) => {
    await clearBootFlag(page);
    await page.goto(`${BASE}/`);

    // First visit: BootScreen visible.
    await expect(page.locator(BOOT_SCREEN)).toBeVisible({ timeout: 1_000 });

    // Click to skip — BootScreen listens for click + keydown and fires
    // `onComplete`, which writes BOOT_KEY and flips the booted state.
    await page.locator(BOOT_SCREEN).click();

    // Wait for BootScreen to unmount (AnimatePresence exit anim ~500ms).
    await expect(page.locator(BOOT_SCREEN)).toHaveCount(0, { timeout: 3_000 });

    // The flag should now be persisted.
    const bootFlag = await page.evaluate(() => window.localStorage.getItem('waggle-booted'));
    expect(bootFlag).toBe('true');

    // Reload — BootScreen must stay skipped.
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator(BOOT_SCREEN)).toHaveCount(0);
  });
});
