import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sourceRoot = join(process.cwd(), 'src');

describe('build warning hygiene', () => {
  it('does not dynamically import shape-selection from the adapter', () => {
    const adapterSource = readFileSync(join(sourceRoot, 'lib', 'adapter.ts'), 'utf8');

    expect(adapterSource).not.toContain("import('./shape-selection')");
    expect(adapterSource).toContain("from './shape-selection'");
  });

  it('keeps routed app surfaces out of the root app bundle', () => {
    const appSource = readFileSync(join(sourceRoot, 'App.tsx'), 'utf8');

    expect(appSource).not.toContain('from "@/routes"');
    for (const route of ['HomeRoute', 'LauncherRoute', 'SettingsRoute']) {
      expect(appSource).toContain(`lazy(() => import("@/routes/${route}"))`);
    }
  });

  it('keeps closed shell overlays out of the root shell bundle', () => {
    const shellSource = readFileSync(join(sourceRoot, 'components', 'os', 'AppShell.tsx'), 'utf8');

    expect(shellSource).not.toContain("import ChatHost from './ChatHost'");
    expect(shellSource).toContain("lazy(() => import('./ChatHost'))");

    for (const overlay of [
      'CommandCenter',
      'CreateWorkspaceDialog',
      'PersonaSwitcher',
      'SpawnAgentDialog',
      'WorkspaceSwitcher',
      'NotificationInbox',
      'KeyboardShortcutsHelp',
      'OnboardingWizard',
      'OnboardingTooltips',
      'LoginBriefing',
      'ContextRail',
      'TrialExpiredModal',
    ]) {
      expect(shellSource).not.toContain(`import ${overlay} from './overlays/${overlay}'`);
      expect(shellSource).toContain(`lazy(() => import('./overlays/${overlay}'))`);
    }
  });

  it('arms the desktop gate before loading the app graph and keeps analytics lazy', () => {
    const mainSource = readFileSync(join(sourceRoot, 'main.tsx'), 'utf8');
    const appEntrySource = readFileSync(join(sourceRoot, 'app-entry.tsx'), 'utf8');

    const armIndex = mainSource.indexOf('armBootConnection()');
    const appImportIndex = mainSource.indexOf("import('./app-entry')");
    expect(armIndex).toBeGreaterThanOrEqual(0);
    expect(appImportIndex).toBeGreaterThan(armIndex);
    expect(mainSource).toMatch(
      /^import\s+\{\s*armBootConnection\s*\}\s+from\s+['"]\.\/boot-connect['"];\s*armBootConnection\(\);\s*void\s+import\(['"]\.\/app-entry['"]\)/,
    );
    expect(mainSource).not.toMatch(/from ['"].*App(?:\.tsx)?['"]/);
    expect(mainSource).not.toMatch(/from ['"]\.\/app-entry['"]/);
    expect(mainSource).not.toMatch(/posthog/i);
    expect(mainSource).not.toMatch(/\bawait\b/);

    expect(appEntrySource).not.toMatch(/^\s*import(?!\s*\()[^;\n]*['"]@\/lib\/posthog['"]/m);
    expect(appEntrySource).toMatch(/import\(\s*['"]@\/lib\/posthog['"]\s*\)/);
  });
});
