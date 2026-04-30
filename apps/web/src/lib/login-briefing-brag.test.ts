/**
 * L-22 regression — memory-brag summary + global last-active picker.
 */

import { describe, it, expect } from 'vitest';
import {
  computeBragSummary,
  pickGlobalLastActive,
  timeAgo,
  formatBragLine,
  type BriefingWorkspaceSummary,
} from './login-briefing-brag';

const NOW = new Date('2026-04-19T22:00:00Z').getTime();

function mkSummary(lastActive?: string, pending: number = 0): BriefingWorkspaceSummary {
  return {
    lastActive,
    pendingTasks: Array.from({ length: pending }, (_, i) => `task-${i}`),
  };
}

describe('computeBragSummary', () => {
  it('uses stats.total when present', () => {
    const out = computeBragSummary({
      personal: { frames: 100, entities: 20, relations: 50 },
      workspace: { frames: 200, entities: 40, relations: 80 },
      total: { frames: 400, entities: 75, relations: 150 },
    }, [], NOW);
    expect(out.totalFrames).toBe(400);
    expect(out.totalEntities).toBe(75);
    expect(out.totalRelations).toBe(150);
  });

  it('falls back to summing personal + workspace when total is absent', () => {
    const out = computeBragSummary({
      personal: { frames: 100, entities: 20, relations: 50 },
      workspace: { frames: 200, entities: 40, relations: 80 },
    }, [], NOW);
    expect(out.totalFrames).toBe(300);
    expect(out.totalEntities).toBe(60);
    expect(out.totalRelations).toBe(130);
  });

  it('returns zeros when stats is null / undefined', () => {
    expect(computeBragSummary(null, [], NOW)).toMatchObject({
      totalFrames: 0,
      totalEntities: 0,
      totalRelations: 0,
      workspaceCount: 0,
      pendingCount: 0,
      lastActiveIso: null,
    });
  });

  it('counts workspaces and pending tasks from summaries', () => {
    const summaries = [
      mkSummary('2026-04-19T20:00:00Z', 2),
      mkSummary('2026-04-19T15:00:00Z', 0),
      mkSummary('2026-04-18T10:00:00Z', 1),
    ];
    const out = computeBragSummary(null, summaries, NOW);
    expect(out.workspaceCount).toBe(3);
    expect(out.pendingCount).toBe(3);
  });

  it('surfaces the most recent lastActive across workspaces', () => {
    const summaries = [
      mkSummary('2026-04-17T10:00:00Z'),
      mkSummary('2026-04-19T20:00:00Z'), // newest
      mkSummary('2026-04-18T10:00:00Z'),
    ];
    const out = computeBragSummary(null, summaries, NOW);
    expect(out.lastActiveIso).toBe('2026-04-19T20:00:00Z');
    expect(out.lastActiveLabel).toBe('2h ago');
  });
});

describe('pickGlobalLastActive', () => {
  it('returns null for an empty list', () => {
    expect(pickGlobalLastActive([])).toBeNull();
  });

  it('returns null when no summary has a valid iso', () => {
    expect(pickGlobalLastActive([
      { lastActive: '' },
      { lastActive: null },
      { lastActive: 'not-a-date' },
    ])).toBeNull();
  });

  it('ignores invalid iso strings and picks the newest valid one', () => {
    expect(pickGlobalLastActive([
      { lastActive: 'garbage' },
      { lastActive: '2026-04-18T10:00:00Z' },
      { lastActive: '2026-04-19T20:00:00Z' },
      { lastActive: '' },
    ])).toBe('2026-04-19T20:00:00Z');
  });

  it('handles a single-item list', () => {
    expect(pickGlobalLastActive([{ lastActive: '2026-04-19T20:00:00Z' }]))
      .toBe('2026-04-19T20:00:00Z');
  });
});

describe('timeAgo', () => {
  it('returns "just now" for times less than a minute ago', () => {
    expect(timeAgo('2026-04-19T21:59:30Z', NOW)).toBe('just now');
  });

  it('renders minutes for recent times', () => {
    expect(timeAgo('2026-04-19T21:30:00Z', NOW)).toBe('30m ago');
  });

  it('renders hours for same-day-ish', () => {
    expect(timeAgo('2026-04-19T17:00:00Z', NOW)).toBe('5h ago');
  });

  it('renders "yesterday" for ~1 day ago', () => {
    expect(timeAgo('2026-04-18T22:00:00Z', NOW)).toBe('yesterday');
  });

  it('renders days for 2-6 days ago', () => {
    expect(timeAgo('2026-04-16T22:00:00Z', NOW)).toBe('3d ago');
  });

  it('renders weeks for 7+ days ago', () => {
    expect(timeAgo('2026-04-05T22:00:00Z', NOW)).toBe('2w ago');
  });

  it('returns empty string for bad input', () => {
    expect(timeAgo('', NOW)).toBe('');
    expect(timeAgo('not-a-date', NOW)).toBe('');
  });
});

describe('formatBragLine', () => {
  it('renders the full memory+entity+relation brag with thousands separators', () => {
    const line = formatBragLine({
      totalFrames: 1487,
      totalEntities: 234,
      totalRelations: 892,
      workspaceCount: 5,
      pendingCount: 0,
      lastActiveIso: '2026-04-19T20:00:00Z',
      lastActiveLabel: '2h ago',
    });
    expect(line).toBe('1,487 memories · 234 entities · 892 relations across 5 workspaces · active 2h ago');
  });

  it('hides entity/relation chips when zero (first-run polish)', () => {
    const line = formatBragLine({
      totalFrames: 42,
      totalEntities: 0,
      totalRelations: 0,
      workspaceCount: 1,
      pendingCount: 0,
      lastActiveIso: null,
      lastActiveLabel: '',
    });
    expect(line).toBe('42 memories across 1 workspace');
  });

  it('omits the active-suffix when lastActive is unknown', () => {
    const line = formatBragLine({
      totalFrames: 100,
      totalEntities: 20,
      totalRelations: 30,
      workspaceCount: 2,
      pendingCount: 0,
      lastActiveIso: null,
      lastActiveLabel: '',
    });
    expect(line).not.toContain('active');
    expect(line).toBe('100 memories · 20 entities · 30 relations across 2 workspaces');
  });

  it('suppresses the active-suffix when totalFrames is 0 even if lastActiveLabel is set', () => {
    // FR #24/#26: fresh user has a default workspace (workspaceCount=1) whose
    // `lastActive` is just the creation time. Without this guard the brag line
    // reads "0 memories across 1 workspace · active 2h ago", which falsely
    // implies the user has activity worth tracking. Suppress the suffix until
    // the user actually has memories.
    const line = formatBragLine({
      totalFrames: 0,
      totalEntities: 0,
      totalRelations: 0,
      workspaceCount: 1,
      pendingCount: 0,
      lastActiveIso: '2026-04-19T20:00:00Z',
      lastActiveLabel: '2h ago',
    });
    expect(line).not.toContain('active');
    expect(line).toBe('0 memories across 1 workspace');
  });

  it('renders the empty state copy when zero memories + zero workspaces', () => {
    const line = formatBragLine({
      totalFrames: 0,
      totalEntities: 0,
      totalRelations: 0,
      workspaceCount: 0,
      pendingCount: 0,
      lastActiveIso: null,
      lastActiveLabel: '',
    });
    expect(line).toBe('No memories yet — create a workspace to start building yours');
  });

  it('uses singular "memory" / "entity" / "workspace" when count is 1', () => {
    const line = formatBragLine({
      totalFrames: 1,
      totalEntities: 1,
      totalRelations: 1,
      workspaceCount: 1,
      pendingCount: 0,
      lastActiveIso: null,
      lastActiveLabel: '',
    });
    expect(line).toContain('1 memory');
    expect(line).toContain('1 entity');
    expect(line).toContain('1 relation');
    expect(line).toContain('across 1 workspace');
  });
});
