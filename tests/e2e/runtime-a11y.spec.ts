import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

test.use({ bypassCSP: true });

const SKIP_PARAMS = 'skipOnboarding=true&skipBoot=true&skipBriefing=true&tier=power';

const ROUTES = [
  '/home',
  '/settings',
  '/settings?tab=models',
  '/settings?tab=permissions',
  '/settings?tab=team',
  '/settings?tab=backup',
  '/settings?tab=billing',
  '/settings?tab=advanced',
  '/settings/profile',
  '/settings/vault',
  '/settings/mission-control',
  '/settings/timeline',
  '/settings/events',
  '/settings/usage',
  '/memory',
  '/memory?tab=trust',
  '/memory?tab=memories',
  '/memory?tab=timeline',
  '/memory?tab=graph',
  '/memory?tab=harvest',
  '/memory?tab=weaver',
  '/memory?tab=wiki',
  '/memory?tab=evolution',
  '/workspaces',
  '/workspaces/default-workspace/chat',
  '/workspaces/default-workspace/tasks',
  '/agents',
  '/automations',
  '/skills',
  '/room',
  '/waggle-dance',
  '/launcher',
  '/connectors',
  '/mcps',
  '/marketplace',
  '/files',
  '/approvals',
  '/artifacts',
  '/team',
  '/benchmarks',
  '/platform',
] as const;

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

type AxeViolation = {
  id: string;
  impact: string | null;
  description: string;
  help: string;
  nodes: Array<{ target: string[]; failureSummary?: string }>;
};

type AxeResult = {
  violations: AxeViolation[];
};

function routeWithSkip(route: string) {
  const sep = route.includes('?') ? '&' : '?';
  return `${route}${sep}${SKIP_PARAMS}`;
}

async function gotoApp(page: Page, route: string) {
  await page.goto(routeWithSkip(route), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.waggle-sidebar, [role="navigation"], main', { timeout: 15_000 });
  // Let lazy route content and the shell's 200ms entrance transition settle
  // before axe samples transient dialog/backdrop layers.
  await page.waitForTimeout(800);
}

async function runAxe(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () => {
    const axe = (window as typeof window & {
      axe: { run: (context?: unknown, options?: unknown) => Promise<AxeResult> };
    }).axe;
    return axe.run(document, {
      resultTypes: ['violations'],
    });
  });
  return result.violations;
}

function formatViolations(violations: AxeViolation[]) {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }));
}

test.describe('Runtime accessibility smoke', () => {
  for (const viewport of VIEWPORTS) {
    test(`axe has no violations across core routes (${viewport.name})`, async ({ page }) => {
      test.setTimeout(150_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      const findings: Array<{ route: string; violations: ReturnType<typeof formatViolations> }> = [];
      for (const route of ROUTES) {
        await gotoApp(page, route);
        const violations = await runAxe(page);
        if (violations.length > 0) {
          findings.push({ route, violations: formatViolations(violations) });
        }
      }

      expect(findings).toEqual([]);
    });
  }
});
