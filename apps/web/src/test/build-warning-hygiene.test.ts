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

  it('keeps cloud analytics out of the startup bundle', () => {
    const mainSource = readFileSync(join(sourceRoot, 'main.tsx'), 'utf8');

    expect(mainSource).not.toContain('from "@/lib/posthog"');
    expect(mainSource).toContain('import("@/lib/posthog")');
  });
});
