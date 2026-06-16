/**
 * Firewall normalizer tests — the canonical fold used by the gold-substring gate.
 * Deterministic; no I/O, no PRNG.
 */
import { describe, expect, it } from 'vitest';
import { normalizeForMatch } from '../../src/firewall/normalize.js';

describe('normalizeForMatch', () => {
  it('lowercases', () => {
    expect(normalizeForMatch('HELLO World')).toBe('hello world');
  });

  it('collapses all whitespace runs (spaces/tabs/newlines) to a single space', () => {
    expect(normalizeForMatch('a\t b\n\n  c')).toBe('a b c');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizeForMatch('   padded   ')).toBe('padded');
  });

  it('folds punctuation to a single space (so "order#123!" ~ "order 123")', () => {
    expect(normalizeForMatch('order#123!')).toBe('order 123');
  });

  it('treats hyphenated and spaced forms identically', () => {
    expect(normalizeForMatch('re-book flight')).toBe(normalizeForMatch('re book flight'));
  });

  it('applies Unicode NFKC so full-width and ligature forms canonicalize', () => {
    // Full-width "ＡＢＣ" (U+FF21..) → "abc"; ﬁ ligature (U+FB01) → "fi".
    expect(normalizeForMatch('ＡＢＣ')).toBe('abc');
    expect(normalizeForMatch('ﬁle')).toBe('file');
  });

  it('strips zero-width characters that could split a banned substring', () => {
    // zero-width space (U+200B) between letters must not survive
    expect(normalizeForMatch('go​ld')).toBe('gold');
  });

  it('is idempotent', () => {
    const once = normalizeForMatch('  The   Quick-Brown FOX.  ');
    expect(normalizeForMatch(once)).toBe(once);
  });

  it('rejects non-string input', () => {
    expect(() => normalizeForMatch(42 as unknown as string)).toThrow(/expects a string/);
  });

  it('returns empty string for empty/whitespace-only input', () => {
    expect(normalizeForMatch('')).toBe('');
    expect(normalizeForMatch('   \n\t ')).toBe('');
  });
});
