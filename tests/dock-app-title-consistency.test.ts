/**
 * M-35 / P8 — guard that the dock label for an appId matches the
 * AppWindow title rendered when that app opens.
 *
 * The Agents↔Personas inconsistency existed for months because the
 * dock said "Agents", the window title said "Agents", but the app
 * actually managed persona definitions. This test extracts both
 * surfaces and asserts they agree for every app the dock references
 * — so renaming just one side in the future fails loudly.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');
const DOCK_PATH = resolve(REPO_ROOT, 'apps/web/src/lib/dock-tiers.ts');
const DESKTOP_PATH = resolve(REPO_ROOT, 'apps/web/src/components/os/Desktop.tsx');

/** Extract `{ appId: 'x', ..., label: 'Y' }` occurrences from dock config. */
function extractDockLabels(source: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const re = /appId:\s*'([^']+)'[^{}]*?label:\s*'([^']+)'/g;
  for (const match of source.matchAll(re)) {
    const [, appId, label] = match;
    if (!out.has(appId)) out.set(appId, new Set());
    out.get(appId)!.add(label);
  }
  return out;
}

/** Extract `"appId": { title: "Y" }` entries from Desktop.tsx appConfig. */
function extractAppTitles(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /"([a-z][a-z-]*)":\s*\{\s*title:\s*"([^"]+)"/g;
  for (const match of source.matchAll(re)) {
    const [, appId, title] = match;
    out.set(appId, title);
  }
  return out;
}

describe('dock label ↔ Desktop appConfig title parity', () => {
  const dockSource = readFileSync(DOCK_PATH, 'utf-8');
  const desktopSource = readFileSync(DESKTOP_PATH, 'utf-8');
  const dockLabels = extractDockLabels(dockSource);
  const appTitles = extractAppTitles(desktopSource);

  it('extracted non-trivial counts from both files (guards against regex drift)', () => {
    expect(dockLabels.size).toBeGreaterThan(5);
    expect(appTitles.size).toBeGreaterThan(5);
  });

  it('every appId referenced by the dock has a matching appConfig title', () => {
    const missingTitle: string[] = [];
    for (const appId of dockLabels.keys()) {
      if (!appTitles.has(appId)) missingTitle.push(appId);
    }
    expect(missingTitle, `dock appIds with no appConfig title: ${missingTitle.join(', ')}`).toEqual([]);
  });

  it('label and title agree for every dock-referenced appId', () => {
    const mismatches: string[] = [];
    for (const [appId, labels] of dockLabels) {
      const title = appTitles.get(appId);
      if (!title) continue;
      for (const label of labels) {
        // Intentional divergences — the dock uses short / friendly
        // names while the window title carries a more formal wording.
        // New entries must match by default; document the reason in
        // the tuple comment when adding.
        const allowed: Array<[string, string, string]> = [
          ['Home', 'Dashboard', 'dock: short nav name; title: canonical app name'],
          ['Chat', 'Waggle Chat', 'title adds the brand prefix to disambiguate chat windows'],
          ['Command Center', 'Cockpit', 'friendly nav label; legacy window title'],
          ['Usage & Cost', 'Usage & Telemetry', 'dock emphasises cost; title emphasises telemetry scope'],
          ['Events & Logs', 'Events', 'dock bundles logs + events; window lives as Events only'],
        ];
        const isAllowed = allowed.some(([l, t]) => l === label && t === title);
        if (label !== title && !isAllowed) {
          mismatches.push(`${appId}: dock=${JSON.stringify(label)} vs title=${JSON.stringify(title)}`);
        }
      }
    }
    expect(mismatches, `label/title mismatches:\n${mismatches.join('\n')}`).toEqual([]);
  });

  it('the agents appId canonicalises to "Personas" (M-35 / P8)', () => {
    // Explicit regression pin: this is the specific rename the backlog
    // item closed. A future silent revert to "Agents" breaks here first.
    expect(appTitles.get('agents')).toBe('Personas');
    expect([...(dockLabels.get('agents') ?? [])]).toEqual(['Personas']);
  });
});
