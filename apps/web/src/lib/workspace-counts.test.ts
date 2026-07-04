import { describe, it, expect } from 'vitest';
import { isDevNoiseWorkspace, workspaceCounts, compareWorkspaceRecency } from './workspace-counts';

describe('isDevNoiseWorkspace (W2B — dev-noise predicate)', () => {
  it('flags ai-os-audit / ai-os-flow / StressTest / E2E-Audit artefacts', () => {
    expect(isDevNoiseWorkspace('ai-os-audit-daniel-finance')).toBe(true);
    expect(isDevNoiseWorkspace('ai-os-flow-x')).toBe(true);
    expect(isDevNoiseWorkspace('StressTest-1')).toBe(true);
    expect(isDevNoiseWorkspace('E2E-Audit-42')).toBe(true);
    expect(isDevNoiseWorkspace('audit-thing')).toBe(true);
  });

  it('does not flag real user workspaces', () => {
    expect(isDevNoiseWorkspace('Research Hub')).toBe(false);
    expect(isDevNoiseWorkspace('Marketing Site')).toBe(false);
  });
});

describe('workspaceCounts (W2B — one truth for counts)', () => {
  it('separates total, visible (non-noise, non-archived), and archived', () => {
    const counts = workspaceCounts([
      { name: 'Research Hub' },
      { name: 'Marketing Site' },
      { name: 'ai-os-audit-x' },
      { name: 'StressTest-1' },
      { name: 'Old Project', status: 'archived' },
    ]);
    expect(counts.total).toBe(5);
    expect(counts.visible).toBe(2);
    expect(counts.archived).toBe(1);
  });

  it('is zero-safe', () => {
    expect(workspaceCounts([])).toEqual({ total: 0, visible: 0, archived: 0 });
  });
});

describe('compareWorkspaceRecency (W2B — switcher ordering)', () => {
  it('sorts most-recent first, pushing missing timestamps to the bottom stably', () => {
    const list = [
      { name: 'no-date-a' },
      { name: 'old', lastActive: '2026-01-01T00:00:00Z' },
      { name: 'no-date-b' },
      { name: 'new', lastActive: '2026-06-01T00:00:00Z' },
    ];
    const ordered = [...list].sort(compareWorkspaceRecency).map(w => w.name);
    expect(ordered).toEqual(['new', 'old', 'no-date-a', 'no-date-b']);
  });
});
