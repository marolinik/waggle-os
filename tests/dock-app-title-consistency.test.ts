/**
 * M-35 / P8 — guard the canonical user-facing app names in the nav config.
 *
 * The Agents↔Personas inconsistency existed for months because the
 * dock said "Agents" while the app actually managed persona definitions.
 * Originally this test cross-checked dock labels against Desktop.tsx's
 * window-title appConfig; the P1a AppShell conversion (plan §3.1) deleted
 * Desktop.tsx and the window manager, so labels now have ONE source of
 * truth — `dock-tiers.ts`, rendered by the AppShell left nav. What remains
 * load-bearing is the set of canonical-name regression pins below: a silent
 * rename in the nav config breaks here first. (Label↔route agreement is
 * pinned separately in apps/web/src/test/p1a-routes.test.ts.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');
const DOCK_PATH = resolve(REPO_ROOT, 'apps/web/src/lib/dock-tiers.ts');

/** Extract `{ appId: 'x', ..., label: 'Y' }` occurrences from the nav config. */
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

describe('nav (dock-tiers) canonical label pins', () => {
  const dockSource = readFileSync(DOCK_PATH, 'utf-8');
  const dockLabels = extractDockLabels(dockSource);

  it('extracted a non-trivial entry count (guards against regex drift)', () => {
    expect(dockLabels.size).toBeGreaterThan(5);
  });

  it('every appId labels consistently across tier configs (no per-tier rename drift)', () => {
    const inconsistent: string[] = [];
    for (const [appId, labels] of dockLabels) {
      if (labels.size > 1) {
        inconsistent.push(`${appId}: ${[...labels].map(l => JSON.stringify(l)).join(' vs ')}`);
      }
    }
    expect(inconsistent, `appIds labelled differently across tiers:\n${inconsistent.join('\n')}`).toEqual([]);
  });

  it('the Extend zone apps canonicalise to "Connector Hub" / "MCP Hub" / "Marketplace" (UX-Refactor Phase 4B, S07/S08/S21)', () => {
    // Phase 4B pins: the Connector Hub rename (S07), the new standalone MCP
    // Hub (S08), and Marketplace's first real nav entry (S21). A silent
    // revert to "Connectors", a re-merge of MCPs into the connectors app, or
    // Marketplace dropping off the nav breaks here first.
    expect([...(dockLabels.get('connectors') ?? [])]).toEqual(['Connector Hub']);
    expect([...(dockLabels.get('mcp-hub') ?? [])]).toEqual(['MCP Hub']);
    expect([...(dockLabels.get('marketplace') ?? [])]).toEqual(['Marketplace']);
  });

  it('the agents appId canonicalises to "Agents" (W2F IA-naming: "Agent Center" → "Agents")', () => {
    // Explicit regression pin. History: M-35/P8 renamed Agents→Personas (the
    // app managed persona definitions); Phase 3B reworked it into the Agent
    // Center over the B3 /api/agents entity; W2F renamed the user-facing label
    // to the plain "Agents" to end the sidebar/breadcrumb/header naming drift.
    // A silent revert to "Personas" or "Agent Center" breaks here first.
    expect([...(dockLabels.get('agents') ?? [])]).toEqual(['Agents']);
  });

  it('the cockpit appId canonicalises to "Mission Control" (D8: "Command Center" reserved for the Ctrl+K palette)', () => {
    expect([...(dockLabels.get('cockpit') ?? [])]).toEqual(['Mission Control']);
  });
});
