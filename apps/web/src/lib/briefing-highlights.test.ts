/**
 * L-22 — briefing highlight ranker regression.
 */
import { describe, it, expect } from 'vitest';
import {
  BRIEFING_HIGHLIGHT_LIMIT,
  selectBriefingHighlights,
  type BriefingFrameLike,
} from './briefing-highlights';

function make(overrides: Partial<BriefingFrameLike> = {}): BriefingFrameLike {
  return {
    content: overrides.content ?? 'A reasonably long concrete memory about a topic.',
    importance: overrides.importance ?? 'normal',
    timestamp: overrides.timestamp ?? '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

describe('selectBriefingHighlights', () => {
  it('returns at most BRIEFING_HIGHLIGHT_LIMIT items', () => {
    const input = Array.from({ length: 10 }, () => make());
    expect(selectBriefingHighlights(input)).toHaveLength(BRIEFING_HIGHLIGHT_LIMIT);
  });

  it('filters out content shorter than 20 chars', () => {
    const input = [make({ content: 'short' }), make({ content: '' }), make({ content: 'x'.repeat(50) })];
    const result = selectBriefingHighlights(input);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('x'.repeat(50));
  });

  it('orders by importance desc', () => {
    const input = [
      make({ content: 'x'.repeat(30), importance: 'normal', timestamp: '2026-04-10T00:00:00Z' }),
      make({ content: 'y'.repeat(30), importance: 'critical', timestamp: '2026-04-01T00:00:00Z' }),
      make({ content: 'z'.repeat(30), importance: 'important', timestamp: '2026-04-05T00:00:00Z' }),
    ];
    const result = selectBriefingHighlights(input);
    expect(result.map(r => r.content)).toEqual([
      'y'.repeat(30),
      'z'.repeat(30),
      'x'.repeat(30),
    ]);
  });

  it('breaks importance ties by recency desc', () => {
    const input = [
      make({ content: 'old' + 'x'.repeat(30), importance: 'important', timestamp: '2026-04-01T00:00:00Z' }),
      make({ content: 'new' + 'x'.repeat(30), importance: 'important', timestamp: '2026-04-19T00:00:00Z' }),
    ];
    const result = selectBriefingHighlights(input);
    expect(result[0].content).toBe('new' + 'x'.repeat(30));
  });

  it('accepts numeric importance values too', () => {
    const input = [
      make({ content: 'lo' + 'x'.repeat(30), importance: 1 }),
      make({ content: 'hi' + 'x'.repeat(30), importance: 5 }),
    ];
    const result = selectBriefingHighlights(input);
    expect(result[0].content).toBe('hi' + 'x'.repeat(30));
  });

  it('does not mutate the input', () => {
    const input = [make(), make()];
    const before = input.slice();
    selectBriefingHighlights(input);
    expect(input).toEqual(before);
  });

  it('tolerates missing fields', () => {
    const input = [
      { content: 'x'.repeat(30) } as BriefingFrameLike,
      { content: 'y'.repeat(30), importance: undefined, timestamp: null } as BriefingFrameLike,
    ];
    const result = selectBriefingHighlights(input);
    expect(result).toHaveLength(2);
  });
});
