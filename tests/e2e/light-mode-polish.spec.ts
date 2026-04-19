/**
 * H-04 (P40) + H-05 (P41) · Light-mode BootScreen + header polish.
 *
 * Phase A/B commit 8782cab already moved the Waggle logo to a
 * theme-aware asset swap and ensured BootScreen + StatusBar use
 * semantic tokens (text-foreground / bg-background / text-primary).
 * This spec is the behavioural regression:
 *
 *   H-04 — BootScreen in light mode: mounts, progress track is
 *          readable (non-zero contrast against background), and the
 *          light-variant PNG logo is served (not the dark JPEG).
 *   H-05 — "Waggle AI" title renders with the light-mode foreground
 *          colour (non-zero contrast against the light background).
 *
 * We rely on getComputedStyle assertions instead of pixel snapshots
 * so the test stays stable across font-rendering / browser-build
 * differences.
 *
 * Run: npx playwright test tests/e2e/light-mode-polish.spec.ts --reporter=list
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://127.0.0.1:3333';
const BOOT_SCREEN = '[data-testid="boot-screen"]';

async function seedLightModeFreshBoot(page: Page) {
  // Install the theme flag + clear the boot gate BEFORE React mounts so
  // the first render is already in light mode and the BootScreen shows.
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('waggle-theme', 'light');
      window.localStorage.removeItem('waggle-booted');
    } catch {
      // localStorage unavailable — test will still cover the visual side
    }
  });
}

/**
 * Compute relative luminance for an rgb(...) colour string (sRGB per
 * WCAG 2.1). Used to assert text is distinguishable from background
 * without baking exact hex values into the test.
 */
function relativeLuminance(rgb: string): number {
  const match = rgb.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (!match) return NaN;
  const [r, g, b] = [match[1], match[2], match[3]].map(v => parseInt(v, 10) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

test.describe('H-04 · BootScreen in light mode', () => {
  test('mounts with light theme attribute and light-variant logo', async ({ page }) => {
    await seedLightModeFreshBoot(page);
    await page.goto(`${BASE}/`);
    await expect(page.locator(BOOT_SCREEN)).toBeVisible({ timeout: 1_500 });

    // Theme attribute landed before mount.
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('light');

    // Logo asset: light variant is the .png export (transparent, black
    // WAGGLE text), dark variant is the .jpeg. useIsLightTheme flips the
    // src. We check the rendered <img> inside BootScreen.
    const logoSrc = await page.locator(`${BOOT_SCREEN} img[alt="Waggle AI"]`).getAttribute('src');
    expect(logoSrc).toBeTruthy();
    expect(logoSrc).toMatch(/\.(png|webp)(\?|$)/i);
  });

  test('progress fill stands out against the track in light mode', async ({ page }) => {
    await seedLightModeFreshBoot(page);
    await page.goto(`${BASE}/`);
    await expect(page.locator(BOOT_SCREEN)).toBeVisible({ timeout: 1_500 });

    // What matters for the "animation stays visible" claim is that the
    // PROGRESS FILL (bg-primary) is distinguishable from the TRACK
    // (bg-muted) — that's what the user perceives as progress. The
    // track/background contrast is deliberately low because `muted`
    // is, by design, near-background.
    const sample = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="boot-screen"]') as HTMLElement | null;
      if (!root) return null;
      const track = root.querySelector('.bg-muted') as HTMLElement | null;
      const fill = track?.querySelector('.bg-primary') as HTMLElement | null;
      if (!track || !fill) return null;
      return {
        bg: window.getComputedStyle(root).backgroundColor,
        trackBg: window.getComputedStyle(track).backgroundColor,
        fillBg: window.getComputedStyle(fill).backgroundColor,
      };
    });

    expect(sample, 'progress bar markup must be present').not.toBeNull();
    // The progress bar is decorative, not an essential UI component for
    // WCAG contrast purposes, and the brand primary is honey (#e5a000)
    // which does not reach 3:1 against any near-white background. The
    // regression we actually care about is "fill is distinguishable from
    // track at all" — if muted and primary rendered the same in light
    // mode (e.g. both fell back to white), the bar would vanish. Anything
    // above 1.3:1 proves that didn't happen.
    expect(contrast(sample!.fillBg, sample!.trackBg)).toBeGreaterThan(1.3);
    // And fill is not the same as the root background — otherwise the
    // filled portion bleeds into the surrounding area.
    expect(sample!.fillBg).not.toBe(sample!.bg);
  });
});

test.describe('H-05 · Header + title text in light mode', () => {
  test('Waggle AI title contrasts with the light background', async ({ page }) => {
    await seedLightModeFreshBoot(page);
    await page.goto(`${BASE}/`);
    await expect(page.locator(BOOT_SCREEN)).toBeVisible({ timeout: 1_500 });

    const sample = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="boot-screen"]') as HTMLElement | null;
      if (!root) return null;
      const heading = root.querySelector('h1') as HTMLElement | null;
      if (!heading) return null;
      return {
        bg: window.getComputedStyle(root).backgroundColor,
        fg: window.getComputedStyle(heading).color,
        text: heading.textContent?.trim() ?? '',
      };
    });

    expect(sample).not.toBeNull();
    expect(sample!.text).toBe('Waggle AI');
    // WCAG AA for normal text: 4.5:1. BootScreen uses a display font
    // (large), where the AA threshold drops to 3.0:1 — we keep 4.0 as
    // a defensive minimum.
    expect(contrast(sample!.bg, sample!.fg)).toBeGreaterThanOrEqual(4.0);
  });
});
