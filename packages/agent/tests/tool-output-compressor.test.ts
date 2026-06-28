import { describe, it, expect } from 'vitest';
import {
  compressToolOutput,
  estimateTokens,
  truncateToTokenBudget,
  dedupTextResults,
} from '../src/tool-output-compressor.js';

// Build an array-of-objects JSON payload large enough to clear the 2KB gate.
function bigRows(n: number, mut?: (i: number, row: Record<string, unknown>) => void): string {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) {
    const row: Record<string, unknown> = {
      id: i,
      name: `item-number-${i}`,
      description: `A reasonably long description field for row ${i} that repeats the key names every single row.`,
      status: 'ok',
      score: 10 + (i % 5),
    };
    mut?.(i, row);
    rows.push(row);
  }
  return JSON.stringify(rows, null, 2);
}

describe('compressToolOutput', () => {
  it('passes through strings below the gate unchanged', () => {
    const small = JSON.stringify([{ a: 1 }, { a: 2 }, { a: 3 }]);
    expect(compressToolOutput(small)).toBe(small);
  });

  it('never enlarges output (output length <= input length, always)', () => {
    const inputs = [bigRows(50), 'x'.repeat(5000), bigRows(5), JSON.stringify({ k: 'v'.repeat(3000) })];
    for (const input of inputs) {
      expect(compressToolOutput(input).length).toBeLessThanOrEqual(input.length);
    }
  });

  it('crushes a large array-of-objects into a shorter pipe table with a header', () => {
    const input = bigRows(50);
    const out = compressToolOutput(input);
    expect(out.length).toBeLessThan(input.length);
    expect(out.split('\n')[0]).toBe('id | name | description | status | score'); // header, keys once
    expect(out).not.toContain('"description":'); // key names no longer repeated per row
  });

  it('elides middle rows but force-keeps head, tail, and error rows', () => {
    const input = bigRows(100, (i, row) => { if (i === 90) row.status = 'error: disk full'; });
    const out = compressToolOutput(input);
    expect(out).toMatch(/rows omitted/); // elision marker present
    expect(out).toContain('item-number-0'); // head kept
    expect(out).toContain('item-number-99'); // tail kept
    expect(out).toContain('error: disk full'); // error row force-kept despite being in the middle
  });

  it('unwraps a single { key: array } wrapper and keeps scalar siblings as a prefix', () => {
    const input = JSON.stringify({ total: 50, items: JSON.parse(bigRows(50)) }, null, 2);
    const out = compressToolOutput(input);
    expect(out.startsWith('total=50')).toBe(true);
    expect(out).toContain('id | name | description');
  });

  it('passes through long non-JSON prose unchanged', () => {
    const prose = 'The quick brown fox. '.repeat(200); // > 2KB, not JSON
    expect(compressToolOutput(prose)).toBe(prose);
  });

  it('passes through malformed JSON without throwing', () => {
    const broken = '[{"id":1, ' + 'x'.repeat(3000);
    expect(() => compressToolOutput(broken)).not.toThrow();
    expect(compressToolOutput(broken)).toBe(broken);
  });

  it('bails on a heterogeneous array (objects mixed with primitives)', () => {
    const mixed = JSON.stringify([{ a: 1 }, 'string', { a: 2 }, ...Array(50).fill({ a: 'v'.repeat(40) })]);
    expect(compressToolOutput(mixed)).toBe(mixed);
  });
});

describe('estimateTokens', () => {
  it('estimates ASCII at ~4 chars/token', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
  it('estimates CJK at ~1 token/char', () => {
    expect(estimateTokens('文'.repeat(50))).toBe(50);
  });
});

describe('truncateToTokenBudget', () => {
  it('returns text under budget unchanged', () => {
    expect(truncateToTokenBudget('short text', 100)).toBe('short text');
  });

  it('truncates over-budget text and marks it', () => {
    const out = truncateToTokenBudget('word '.repeat(1000), 50);
    expect(out).toContain('… [truncated]');
    expect(estimateTokens(out)).toBeLessThan(120); // budget + marker, bounded
  });

  it('never splits a surrogate pair / emoji at the boundary', () => {
    const out = truncateToTokenBudget('😀'.repeat(200), 20);
    const body = out.replace('\n… [truncated]', '');
    // A split emoji would leave a lone surrogate code unit that is not '😀'.
    expect([...body].every((c) => c === '😀')).toBe(true);
    expect(body.length % 2).toBe(0); // each 😀 is exactly 2 UTF-16 units — no half pair
  });
});

describe('dedupTextResults', () => {
  it('drops near-duplicate snippets while preserving order', () => {
    const items = [
      { url: 'a', snippet: 'OpenHuman is a local-first agent harness with memory.' },
      { url: 'b', snippet: 'OpenHuman is a local first agent harness with memory!' }, // ~dup
      { url: 'c', snippet: 'Completely different content about quantum widgets and gears.' },
    ];
    const out = dedupTextResults(items, (r) => r.snippet);
    expect(out.map((r) => r.url)).toEqual(['a', 'c']);
  });

  it('keeps all when nothing is similar', () => {
    const items = [{ s: 'alpha beta gamma' }, { s: 'delta epsilon zeta' }, { s: 'eta theta iota' }];
    expect(dedupTextResults(items, (r) => r.s)).toHaveLength(3);
  });
});
