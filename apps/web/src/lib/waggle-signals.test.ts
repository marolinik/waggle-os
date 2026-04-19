/**
 * M-41 / P18 — waggle-signal sort + group regression.
 */
import { describe, it, expect } from 'vitest';
import {
  sortSignalsForDisplay,
  groupSignalsByType,
  countUnacknowledged,
  type WaggleSignalLike,
} from './waggle-signals';

function make(overrides: Partial<WaggleSignalLike> = {}): WaggleSignalLike {
  return {
    id: overrides.id ?? `s-${Math.random()}`,
    type: overrides.type ?? 'discovery',
    severity: overrides.severity ?? 'normal',
    acknowledged: overrides.acknowledged ?? false,
    timestamp: overrides.timestamp ?? '2026-04-19T00:00:00Z',
    ...overrides,
  };
}

describe('sortSignalsForDisplay', () => {
  it('surfaces unacknowledged before acknowledged', () => {
    const input = [
      make({ id: 'a', acknowledged: true }),
      make({ id: 'b', acknowledged: false }),
    ];
    expect(sortSignalsForDisplay(input).map(s => s.id)).toEqual(['b', 'a']);
  });

  it('within the same ack bucket, higher severity wins', () => {
    const input = [
      make({ id: 'normal', severity: 'normal' }),
      make({ id: 'critical', severity: 'critical' }),
      make({ id: 'high', severity: 'high' }),
      make({ id: 'low', severity: 'low' }),
    ];
    expect(sortSignalsForDisplay(input).map(s => s.id)).toEqual(['critical', 'high', 'normal', 'low']);
  });

  it('within the same severity, more recent timestamp wins', () => {
    const input = [
      make({ id: 'old', timestamp: '2026-04-10T00:00:00Z' }),
      make({ id: 'new', timestamp: '2026-04-19T00:00:00Z' }),
      make({ id: 'mid', timestamp: '2026-04-15T00:00:00Z' }),
    ];
    expect(sortSignalsForDisplay(input).map(s => s.id)).toEqual(['new', 'mid', 'old']);
  });

  it('composes ack > severity > timestamp', () => {
    const input = [
      make({ id: 'ack-critical', acknowledged: true, severity: 'critical', timestamp: '2026-04-19T00:00:00Z' }),
      make({ id: 'new-normal', acknowledged: false, severity: 'normal', timestamp: '2026-04-19T00:00:00Z' }),
      make({ id: 'old-critical', acknowledged: false, severity: 'critical', timestamp: '2026-04-01T00:00:00Z' }),
    ];
    // Unacknowledged first; within unack, critical > normal; within critical, only one item.
    expect(sortSignalsForDisplay(input).map(s => s.id)).toEqual([
      'old-critical', 'new-normal', 'ack-critical',
    ]);
  });

  it('tolerates missing / null fields', () => {
    const input = [
      make({ id: 'a', severity: null, timestamp: null }),
      make({ id: 'b', severity: undefined, timestamp: undefined }),
    ];
    // No crash — treat missing as normal / 0.
    expect(sortSignalsForDisplay(input)).toHaveLength(2);
  });

  it('does not mutate the input array', () => {
    const input = [make({ id: '1' }), make({ id: '2' })];
    const before = input.slice();
    sortSignalsForDisplay(input);
    expect(input).toEqual(before);
  });

  it('parses numeric timestamps as raw ms', () => {
    const input = [
      make({ id: 'old', timestamp: 1000 }),
      make({ id: 'new', timestamp: 2000 }),
    ];
    expect(sortSignalsForDisplay(input).map(s => s.id)).toEqual(['new', 'old']);
  });
});

describe('groupSignalsByType', () => {
  it('groups by the type field', () => {
    const input = [
      make({ id: '1', type: 'discovery' }),
      make({ id: '2', type: 'handoff' }),
      make({ id: '3', type: 'discovery' }),
    ];
    const groups = groupSignalsByType(input);
    expect(groups.discovery?.map(s => s.id)).toEqual(['1', '3']);
    expect(groups.handoff?.map(s => s.id)).toEqual(['2']);
  });

  it('buckets unknown types under "unknown"', () => {
    const input = [make({ id: '1', type: 123 as unknown as string })];
    const groups = groupSignalsByType(input);
    expect(groups.unknown?.map(s => s.id)).toEqual(['1']);
  });
});

describe('countUnacknowledged', () => {
  it('counts only unacked items', () => {
    const input = [
      make({ acknowledged: false }),
      make({ acknowledged: false }),
      make({ acknowledged: true }),
    ];
    expect(countUnacknowledged(input)).toBe(2);
  });

  it('treats missing acknowledged as false (unacked)', () => {
    const input = [
      { id: '1', type: 'discovery' } as WaggleSignalLike,
      { id: '2', type: 'discovery', acknowledged: true } as WaggleSignalLike,
    ];
    expect(countUnacknowledged(input)).toBe(1);
  });
});
