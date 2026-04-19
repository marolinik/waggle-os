/**
 * M-24 / ENG-3 — dock unlock nudge decision regression.
 * Pure function, deterministic.
 */
import { describe, it, expect } from 'vitest';
import {
  DOCK_NUDGE_MILESTONES,
  DOCK_NUDGE_COPY,
  findPendingMilestone,
  copyForMilestone,
} from './dock-nudge';

describe('findPendingMilestone', () => {
  it('returns null below every milestone', () => {
    expect(findPendingMilestone(0, [])).toBeNull();
    expect(findPendingMilestone(9, [])).toBeNull();
  });

  it('returns the first milestone when it has been reached and nothing is dismissed', () => {
    expect(findPendingMilestone(10, [])).toBe(10);
    expect(findPendingMilestone(25, [])).toBe(10);
    expect(findPendingMilestone(50, [])).toBe(10);
  });

  it('returns the next milestone after the first is dismissed', () => {
    expect(findPendingMilestone(50, [10])).toBe(50);
    expect(findPendingMilestone(200, [10])).toBe(50);
  });

  it('returns null when every reached milestone is dismissed', () => {
    expect(findPendingMilestone(100, [10, 50])).toBeNull();
    expect(findPendingMilestone(50, [10, 50])).toBeNull();
  });

  it('defensive: rejects non-finite or negative counts', () => {
    expect(findPendingMilestone(Number.NaN, [])).toBeNull();
    expect(findPendingMilestone(Number.POSITIVE_INFINITY, [])).toBeNull();
    expect(findPendingMilestone(-5, [])).toBeNull();
  });

  it('ignores dismissed milestones that do not correspond to any real milestone', () => {
    // A stale "dismissed" entry of 999 from a future contract doesn't
    // suppress the current 10/50 milestones.
    expect(findPendingMilestone(10, [999])).toBe(10);
  });
});

describe('DOCK_NUDGE_MILESTONES + DOCK_NUDGE_COPY', () => {
  it('milestones are strictly ascending', () => {
    for (let i = 1; i < DOCK_NUDGE_MILESTONES.length; i += 1) {
      expect(DOCK_NUDGE_MILESTONES[i]).toBeGreaterThan(DOCK_NUDGE_MILESTONES[i - 1]);
    }
  });

  it('every milestone has copy', () => {
    for (const m of DOCK_NUDGE_MILESTONES) {
      expect(DOCK_NUDGE_COPY[m], `copy for ${m}`).toBeDefined();
      expect(DOCK_NUDGE_COPY[m].title.length).toBeGreaterThan(0);
      expect(DOCK_NUDGE_COPY[m].description.length).toBeGreaterThan(0);
    }
  });

  it('the canonical milestones are [10, 50]', () => {
    // Pin the current contract so a silent re-order or addition of a
    // new milestone trips this test and forces an explicit update.
    expect([...DOCK_NUDGE_MILESTONES]).toEqual([10, 50]);
  });
});

describe('copyForMilestone', () => {
  it('returns the keyed copy when available', () => {
    expect(copyForMilestone(10)).toBe(DOCK_NUDGE_COPY[10]);
  });

  it('falls back to a generic string for an unknown milestone', () => {
    const copy = copyForMilestone(999);
    expect(copy.title).toContain('999');
    expect(copy.description.length).toBeGreaterThan(0);
  });
});
