import { describe, it, expect } from 'vitest';
import { dedupeMemoriesForDisplay } from './memory-dedup';
import type { Memory } from '@/lib/types';

const mem = (over: Partial<Memory> = {}): Memory => ({
  id: '1',
  kind: 'fact',
  title: 'GTM fact',
  content: 'The Germany GTM launches in Q3.',
  scope: 'workspace',
  workspaceId: 'w1',
  source: 'user_stated',
  sourceId: null,
  sourceUrl: null,
  importance: 'normal',
  status: 'active',
  confidence: 50,
  createdAt: '2026-06-11T08:00:00.000Z',
  ...over,
});

describe('dedupeMemoriesForDisplay', () => {
  it('collapses exact duplicates and counts them', () => {
    const result = dedupeMemoriesForDisplay([mem({ id: 'a' }), mem({ id: 'b' }), mem({ id: 'c' })]);
    expect(result).toHaveLength(1);
    expect(result[0].duplicateCount).toBe(3);
  });

  it('collapses near-duplicates differing only by an embedded audit-run id', () => {
    const result = dedupeMemoriesForDisplay([
      mem({ id: 'a', title: 'Benchmark', content: 'LoCoMo scored 86.49 (audit-run-id: 3f9a2b)' }),
      mem({ id: 'b', title: 'Benchmark', content: 'LoCoMo scored 86.49 (audit-run-id: 71ee44)' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].duplicateCount).toBe(2);
  });

  it('collapses a growing-composite chain (same title, each record a prefix of the next)', () => {
    // Reproduces the live wave-4 QA finding: a benchmark "anchor" record kept
    // getting re-written with more appended `---`-separated turns over time,
    // so every copy has different LENGTH content and pass-1's exact-key match
    // never merges them, even though they're visibly "the same memory".
    const base = 'BENCHMARK: User prefers TypeScript, works at Egzakta Group, building Waggle OS. Timestamp: 1782400441971';
    const result = dedupeMemoriesForDisplay([
      mem({ id: 'shortest', title: 'BENCHMARK: User prefers TypeScript…', content: base }),
      mem({ id: 'middle', title: 'BENCHMARK: User prefers TypeScript…', content: `${base}\n---\nI lead a team building an enterprise AI platform.` }),
      mem({ id: 'longest', title: 'BENCHMARK: User prefers TypeScript…', content: `${base}\n---\nI lead a team building an enterprise AI platform.\n---\nComposite benchmark test memory anchor` }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].memory.id).toBe('longest');
    expect(result[0].duplicateCount).toBe(3);
  });

  it('does NOT collapse two records that share content but have different titles', () => {
    const result = dedupeMemoriesForDisplay([
      mem({ id: '1', title: 'GTM fact' }),
      mem({ id: '2', title: 'Second' }),
    ]);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.duplicateCount === 1)).toBe(true);
  });

  it('prefers an active record over an archived one as the representative', () => {
    const result = dedupeMemoriesForDisplay([
      mem({ id: 'archived', status: 'archived' }),
      mem({ id: 'active', status: 'active' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].memory.id).toBe('active');
    expect(result[0].duplicateCount).toBe(2);
  });

  it('breaks status ties by higher confidence', () => {
    const result = dedupeMemoriesForDisplay([
      mem({ id: 'lo', confidence: 30 }),
      mem({ id: 'hi', confidence: 90 }),
    ]);
    expect(result[0].memory.id).toBe('hi');
  });

  it('keeps short/empty-content records distinct (min-length guard)', () => {
    const result = dedupeMemoriesForDisplay([
      mem({ id: '1', title: '', content: 'hi' }),
      mem({ id: '2', title: '', content: 'ok' }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('preserves first-seen order', () => {
    const result = dedupeMemoriesForDisplay([
      mem({ id: '1', title: 'Alpha', content: 'First distinct memory about alpha topic' }),
      mem({ id: '2', title: 'Beta', content: 'Second distinct memory about beta topic' }),
    ]);
    expect(result.map((r) => r.memory.id)).toEqual(['1', '2']);
  });

  it('does not mutate the input array or its members', () => {
    const input = [mem({ id: 'a' }), mem({ id: 'b' })];
    const snapshot = JSON.parse(JSON.stringify(input));
    dedupeMemoriesForDisplay(input);
    expect(input).toEqual(snapshot);
  });
});
