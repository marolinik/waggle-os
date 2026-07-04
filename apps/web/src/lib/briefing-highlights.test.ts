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
    // Distinct contents — identical ones are now collapsed by the dedup.
    const input = Array.from({ length: 10 }, (_, i) => make({ content: `A reasonably long concrete memory about topic number ${i}.` }));
    expect(selectBriefingHighlights(input)).toHaveLength(BRIEFING_HIGHLIGHT_LIMIT);
  });

  it('filters deprecated/archived frames and extraction echoes', () => {
    const input = [
      make({ content: 'A deprecated but otherwise concrete memory.', status: 'deprecated' }),
      make({ content: 'An archived but otherwise concrete memory.', status: 'archived' }),
      make({ content: 'User asked: Review recent decisions and next steps' }),
      make({ content: 'A living, concrete memory about the launch plan.', status: 'active' }),
    ];
    const result = selectBriefingHighlights(input);
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain('living');
  });

  it('collapses duplicate content to one highlight, keeping the earliest timestamp', () => {
    const input = [
      make({ content: 'Session (2026-04-30): What is sovereign AI — 4 messages', timestamp: '2026-06-11T00:00:00Z' }),
      make({ content: 'Session (2026-04-30): What is sovereign AI — 4 messages', timestamp: '2026-05-01T00:00:00Z' }),
      make({ content: 'A different, equally concrete memory about the launch.', timestamp: '2026-06-01T00:00:00Z' }),
    ];
    const result = selectBriefingHighlights(input);
    const dupes = result.filter(f => (f.content ?? '').startsWith('Session (2026-04-30)'));
    expect(dupes).toHaveLength(1);
    // The kept copy is the moment it was learned, not the consolidation rewrite.
    expect(dupes[0].timestamp).toBe('2026-05-01T00:00:00Z');
  });

  it('collapses near-duplicates that differ only by an embedded run/uuid token (F22)', () => {
    const input = [
      make({ content: 'LoCoMo benchmark hit 86.49 (audit-run-id: 3f9a2b)', timestamp: '2026-07-04T00:00:00Z' }),
      make({ content: 'LoCoMo benchmark hit 86.49 (audit-run-id: 71ee44)', timestamp: '2026-07-01T00:00:00Z' }),
      make({ content: 'A different, equally concrete memory about pricing.', timestamp: '2026-06-01T00:00:00Z' }),
    ];
    const result = selectBriefingHighlights(input);
    const benchmarks = result.filter(f => (f.content ?? '').startsWith('LoCoMo benchmark'));
    expect(benchmarks).toHaveLength(1);
    // Earliest-learned copy is kept.
    expect(benchmarks[0].timestamp).toBe('2026-07-01T00:00:00Z');
  });

  it('collapses near-duplicates that differ only by a bare "audit-<digits>" id (live wave-4 QA regression)', () => {
    // Reproduces the actual finding: "Imran uses 2x2 frameworks…" appeared
    // twice in the briefing, differing only by "audit-1782648502308" vs
    // "audit-1782638749061" — a form RUN_ID_RE didn't cover (no "run" word).
    const input = [
      make({ content: 'Imran uses 2x2 frameworks and wants every client decision remembered by account. (audit-1782648502308)', timestamp: '2026-07-04T00:00:00Z' }),
      make({ content: 'Imran uses 2x2 frameworks and wants every client decision remembered by account. (audit-1782638749061)', timestamp: '2026-07-01T00:00:00Z' }),
    ];
    const result = selectBriefingHighlights(input);
    const imran = result.filter(f => (f.content ?? '').startsWith('Imran uses 2x2'));
    expect(imran).toHaveLength(1);
    expect(imran[0].timestamp).toBe('2026-07-01T00:00:00Z');
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
