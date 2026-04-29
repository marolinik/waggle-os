import { describe, expect, it } from 'vitest';
import { summarizeTurn } from '../src/prompt-summarizer.js';

describe('summarizeTurn', () => {
  it('returns empty string for empty input', () => {
    expect(summarizeTurn('')).toBe('');
    expect(summarizeTurn('   \n  ')).toBe('');
  });

  it('returns input unchanged when within budget (collapsed whitespace)', () => {
    expect(summarizeTurn('Short reply.')).toBe('Short reply.');
    expect(summarizeTurn('Hello   world.\n\n\nNice.')).toBe('Hello world. Nice.');
  });

  it('truncates with ellipsis when over budget', () => {
    const long = 'A'.repeat(800);
    const out = summarizeTurn(long, { maxChars: 100 });
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith('…')).toBe(true);
  });

  it('keeps the leading sentence when possible', () => {
    const text = 'First sentence here. Second one is longer and contains more words. Third.';
    const out = summarizeTurn(text, { maxChars: 30 });
    expect(out.startsWith('First sentence here.')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
  });

  it('replaces fenced code blocks with [code]', () => {
    const text = 'Here is some code:\n```ts\nconst x = 1;\n```\nthat is all.';
    const out = summarizeTurn(text);
    expect(out).toContain('[code]');
    expect(out).not.toContain('const x = 1;');
  });

  it('respects custom maxChars', () => {
    const text = 'A'.repeat(50) + '. ' + 'B'.repeat(50);
    expect(summarizeTurn(text, { maxChars: 200 })).toBe(text);
    const small = summarizeTurn(text, { maxChars: 30 });
    expect(small.length).toBeLessThanOrEqual(30);
  });

  it('hard-truncates when no sentence boundary fits', () => {
    const blob = 'A'.repeat(500);
    const out = summarizeTurn(blob, { maxChars: 50 });
    expect(out.length).toBe(50);
    expect(out.endsWith('…')).toBe(true);
  });

  it('is deterministic — same input -> same output', () => {
    const a = summarizeTurn('Repeatable. Same. Output.', { maxChars: 30 });
    const b = summarizeTurn('Repeatable. Same. Output.', { maxChars: 30 });
    expect(a).toBe(b);
  });
});
