/**
 * Vision-harness CAPTURE phase (Option C hybrid, per
 * docs/audits/2026-06-01-vision-e2e-harness-design.md).
 *
 * Drives the real desktop-OS shell deterministically and writes, per surface:
 *   artifacts/<surface>-<theme>.png   — the screenshot the vision model grades
 *   artifacts/<surface>-<theme>.json  — { surface, theme, expectation, nav,
 *                                          consoleErrors[], networkFailures[] }
 *
 * The JUDGE phase (scripts/vision-judge.mjs Workflow) reads these and grades
 * meaning; the reducer cross-checks vision verdicts against the objective
 * console/network signals captured here.
 *
 * Chat round-trip is graded on Path 2 (REAL LLM) per the product decision —
 * the capture server must run WITHOUT --skip-litellm (a real provider key in
 * the vault). Run: see scripts/vision-run.md.
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  attachConsoleCapture, gotoDesktop, openAppViaDock, setTheme, pressShortcut,
  type ConsoleCapture,
} from './_helpers';

const ARTIFACTS = join(process.cwd(), 'tests', 'vision', 'artifacts');
mkdirSync(ARTIFACTS, { recursive: true });

/** Expectation strings for non-static surfaces (memory/overlays/flows), set in
 * their test bodies and read by write(). Declared up top to avoid TDZ. */
const FLOW_EXPECT: Record<string, string> = {};

const THEMES = ['dark', 'light'] as const;
type Theme = (typeof THEMES)[number];

interface Surface {
  key: string;
  /** Dock label (direct or zone tray) — or 'memory'/'home' special-cased. */
  label: string;
  /** One-line expectation handed to the vision judge. */
  expectation: string;
}

/** Static surface matrix — real labels verified from full-product-audit.spec.ts. */
const SURFACES: Surface[] = [
  { key: 'chat', label: 'Chat', expectation: 'AI chat: a persona/model header, a message thread area, and a message input box at the bottom.' },
  { key: 'room', label: 'Room', expectation: 'The Room: a canvas for running agents, or a clean empty state ("no agents running").' },
  { key: 'agents', label: 'Agent Center', expectation: 'Agent Center: a list of agents with status badges and category tabs, or an empty "no agents yet" state.' },
  { key: 'files', label: 'Files', expectation: 'Files: a workspace file/folder browser, or an empty state.' },
  { key: 'approvals', label: 'Approvals', expectation: 'Approvals inbox: pending approval requests or a clean "no pending approvals" state.' },
  { key: 'cockpit', label: 'Command Center', expectation: 'Command Center / cockpit: KPI cards for health, cost, and activity.' },
  { key: 'timeline', label: 'Timeline', expectation: 'Timeline: a chronological activity feed, or an empty "no activity" state.' },
  { key: 'telemetry', label: 'Usage & Cost', expectation: 'Usage & Cost: token/cost telemetry charts or numbers.' },
  { key: 'backup', label: 'Backup & Restore', expectation: 'Backup & Restore: backup list/controls, or a "no backups" empty state.' },
  { key: 'events', label: 'Events & Logs', expectation: 'Events & Logs: a filterable list of agent steps/events.' },
  { key: 'governance', label: 'Governance', expectation: 'Governance: team roles, permissions, or policy controls.' },
  { key: 'capabilities', label: 'Skills Hub', expectation: 'Skills Hub: installed skills and a marketplace/starter affordance.' },
  { key: 'connectors', label: 'Connectors', expectation: 'Connectors: a catalog of services/integrations to connect.' },
  { key: 'marketplace', label: 'Marketplace', expectation: 'Marketplace: browsable skill/connector packs with install affordances.' },
  { key: 'settings', label: 'Settings', expectation: 'Settings: tabbed config (General/Models/Vault/Permissions/Team/Advanced).' },
  { key: 'vault', label: 'API Keys', expectation: 'Vault / API Keys: per-provider key management rows.' },
  { key: 'dashboard', label: 'Home', expectation: 'Home/dashboard: workspace overview, welcome, or create-workspace affordance.' },
];

function write(surface: string, theme: Theme, nav: boolean, cap: ConsoleCapture) {
  writeFileSync(
    join(ARTIFACTS, `${surface}-${theme}.json`),
    JSON.stringify(
      {
        surface, theme, nav,
        expectation: SURFACES.find((s) => s.key === surface)?.expectation ?? FLOW_EXPECT[surface] ?? '',
        consoleErrors: cap.critical(),
        networkFailures: cap.networkFailures,
        pageErrors: cap.pageErrors,
      },
      null, 2,
    ),
  );
}

test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: 'serial' });

// ── Static surface matrix ────────────────────────────────────────────────
for (const theme of THEMES) {
  test.describe(`surfaces:${theme}`, () => {
    for (const s of SURFACES) {
      test(`${s.key}:${theme}`, async ({ page }) => {
        const cap = attachConsoleCapture(page);
        await gotoDesktop(page);
        await setTheme(page, theme);
        // Memory is reachable by aria-label or the Ctrl+Shift+5 shortcut.
        let nav = await openAppViaDock(page, s.label);
        if (!nav && s.key === 'dashboard') nav = await openAppViaDock(page, 'Home');
        await page.waitForTimeout(800);
        await page.screenshot({ path: join(ARTIFACTS, `${s.key}-${theme}.png`) });
        write(s.key, theme, nav, cap);
        expect(nav, `dock nav to "${s.label}"`).toBeTruthy();
      });
    }

    // Memory (special-cased trigger)
    test(`memory:${theme}`, async ({ page }) => {
      const cap = attachConsoleCapture(page);
      await gotoDesktop(page);
      await setTheme(page, theme);
      let nav = await openAppViaDock(page, 'Memory');
      if (!nav) {
        await pressShortcut(page, { key: '5', code: 'Digit5', ctrl: true, shift: true });
        nav = true;
      }
      await page.waitForTimeout(800);
      await page.screenshot({ path: join(ARTIFACTS, `memory-${theme}.png`) });
      FLOW_EXPECT['memory'] = 'Memory: a searchable list of memory frames, or a clean empty state.';
      write('memory', theme, nav, cap);
    });
  });
}

// ── Overlays (dark only — overlays inherit theme; cheap, best-effort) ──────
test.describe('overlays', () => {
  test('global-search', async ({ page }) => {
    const cap = attachConsoleCapture(page);
    await gotoDesktop(page);
    await pressShortcut(page, { key: 'k', code: 'KeyK', ctrl: true });
    FLOW_EXPECT['global-search'] = 'Global search palette (Ctrl+K): a search input with results/commands.';
    await page.screenshot({ path: join(ARTIFACTS, 'global-search-dark.png') });
    write('global-search', 'dark', true, cap);
  });

  test('spawn-agent', async ({ page }) => {
    const cap = attachConsoleCapture(page);
    await gotoDesktop(page);
    const btn = page.locator('[data-testid="dock-spawn-agent"]');
    const nav = await btn.isVisible({ timeout: 1500 }).catch(() => false);
    if (nav) { await btn.click(); await page.waitForTimeout(900); }
    FLOW_EXPECT['spawn-agent'] = 'Spawn-agent dialog: a persona picker + model selector + confirm button.';
    await page.screenshot({ path: join(ARTIFACTS, 'spawn-agent-dark.png') });
    write('spawn-agent', 'dark', nav, cap);
  });
});

// ── Flows (end-state graded) ──────────────────────────────────────────────
test.describe('flows', () => {
  // Chat round-trip — Path 2 (REAL LLM): a coherent assistant reply must render.
  test('flow:chat-roundtrip', async ({ page }) => {
    const cap = attachConsoleCapture(page);
    await gotoDesktop(page);
    await openAppViaDock(page, 'Chat');
    await page.waitForTimeout(1200);
    const box = page.locator('textarea').first();
    const placeholderInput = page.getByPlaceholder(/message|ask|waggle/i).first();
    const target = (await box.isVisible({ timeout: 2000 }).catch(() => false))
      ? box
      : placeholderInput;
    await target.fill('In one short sentence, what is Waggle OS?');
    await target.press('Enter');
    // Real LLM: wait for an assistant reply to stream in (best-effort up to 35s).
    await page.waitForTimeout(2000);
    await page.waitForFunction(
      () => document.body.innerText.length > 400,
      { timeout: 35_000 },
    ).catch(() => { /* capture whatever state exists; judge decides */ });
    await page.waitForTimeout(1500);
    FLOW_EXPECT['flow-chat'] =
      'Chat round-trip (real LLM): the user question and a coherent assistant reply are both visible in the thread. NOT a blank thread, error banner, or "configure API key" prompt.';
    await page.screenshot({ path: join(ARTIFACTS, 'flow-chat-dark.png') });
    write('flow-chat', 'dark', true, cap);
  });

  // Settings tab walk — each tab renders.
  test('flow:settings-tabs', async ({ page }) => {
    const cap = attachConsoleCapture(page);
    await gotoDesktop(page);
    await openAppViaDock(page, 'Settings');
    await page.waitForTimeout(1000);
    FLOW_EXPECT['flow-settings'] =
      'Settings opened: a tabbed settings panel (General/Models/Vault/Permissions/Team/Advanced) rendering content, no error state.';
    await page.screenshot({ path: join(ARTIFACTS, 'flow-settings-dark.png') });
    write('flow-settings', 'dark', true, cap);
  });

  // Marketplace browse.
  test('flow:marketplace', async ({ page }) => {
    const cap = attachConsoleCapture(page);
    await gotoDesktop(page);
    await openAppViaDock(page, 'Marketplace');
    await page.waitForTimeout(1200);
    FLOW_EXPECT['flow-marketplace'] =
      'Marketplace browse: packs/items listed with install affordances, or a clean empty/loading state — not an error.';
    await page.screenshot({ path: join(ARTIFACTS, 'flow-marketplace-dark.png') });
    write('flow-marketplace', 'dark', true, cap);
  });

  // Onboarding wizard (forceWizard).
  test('flow:onboarding', async ({ page }) => {
    const cap = attachConsoleCapture(page);
    await page.goto('http://127.0.0.1:3333/?forceWizard=true', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    FLOW_EXPECT['flow-onboarding'] =
      'Onboarding wizard: a welcome/setup step with a clear primary action to proceed.';
    await page.screenshot({ path: join(ARTIFACTS, 'flow-onboarding-dark.png') });
    write('flow-onboarding', 'dark', true, cap);
  });
});
