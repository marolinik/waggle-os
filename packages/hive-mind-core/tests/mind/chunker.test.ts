import { describe, it, expect } from 'vitest';
import { chunkText } from '../../src/mind/chunker.js';

/**
 * D1 (oss-drift triage, 2026-06-11) — chunker unit tests for the
 * reverse-ported OSS hive-mind semantic chunker (paragraph-first,
 * sentence-fallback, max 2000 chars, 200 overlap).
 */

/** A single paragraph of `sentences` short sentences (~55 chars each). */
function para(topic: string, sentences: number): string {
  return Array.from(
    { length: sentences },
    (_, i) => `The ${topic} system processes record number ${i} every day.`
  ).join(' ');
}

describe('chunkText (D1 chunk-level retrieval)', () => {
  it('returns [] for empty input', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('returns short content as a single chunk with full-span offsets', () => {
    const text = 'A short memory frame about the deploy checklist.';
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(text);
    expect(chunks[0].charStart).toBe(0);
    expect(chunks[0].charEnd).toBe(text.length);
  });

  it('treats content at exactly minChunkChars as a single chunk', () => {
    const text = 'x'.repeat(1500);
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
  });

  it('splits multi-paragraph content on blank lines (paragraph-first)', () => {
    const p1 = para('alpha', 30); // ~1650 chars
    const p2 = para('beta', 30); // ~1650 chars
    const text = `${p1}\n\n${p2}`;

    const chunks = chunkText(text);
    // p1 + p2 can't pack into one 2000-char chunk → 2 chunks.
    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toBe(p1);
    expect(chunks[0].charStart).toBe(0);
    expect(chunks[0].charEnd).toBe(p1.length);
    // Second chunk's PRIMARY span is p2 (overlap never alters offsets).
    expect(chunks[1].charStart).toBe(p1.length + 2);
    expect(chunks[1].charEnd).toBe(text.length);
    expect(chunks[1].text).toContain('beta');
  });

  it('falls back to sentence splitting for a single oversize paragraph', () => {
    // One paragraph, no blank lines, > maxChars → must sub-split on sentences.
    const text = para('gamma', 60); // ~3300 chars, single paragraph
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      // 2000 maxChars + up to 200 prepended overlap + 1 joining newline.
      expect(c.text.length).toBeLessThanOrEqual(2000 + 200 + 1);
    }
    // Sentence boundaries respected: each chunk's primary span starts at a
    // sentence start within the source text.
    expect(text.slice(chunks[1].charStart)).toMatch(/^The gamma system/);
  });

  it('hard-cuts a single sentence longer than maxChars', () => {
    const text = 'y'.repeat(4500); // no sentence boundaries at all
    const chunks = chunkText(text, { overlapChars: 0 });
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks[0].text).toBe('y'.repeat(2000));
    expect(chunks[0].charStart).toBe(0);
    expect(chunks[0].charEnd).toBe(2000);
    expect(chunks[1].charStart).toBe(2000);
  });

  it('prepends the previous chunk tail as overlap (offsets untouched)', () => {
    const p1 = para('delta', 30);
    const p2 = para('epsilon', 30);
    const text = `${p1}\n\n${p2}`;

    const chunks = chunkText(text, { overlapChars: 200 });
    expect(chunks).toHaveLength(2);
    const prevTail = chunks[0].text.slice(-200);
    expect(chunks[1].text.startsWith(prevTail)).toBe(true);
    // Offsets still describe the primary span only.
    expect(chunks[1].charStart).toBe(p1.length + 2);
  });

  it('overlapChars: 0 makes chunk text exactly equal its source span', () => {
    const p1 = para('zeta', 30);
    const p2 = para('eta', 30);
    const text = `${p1}\n\n${p2}`;

    const chunks = chunkText(text, { overlapChars: 0 });
    expect(chunks).toHaveLength(2);
    for (const c of chunks) {
      expect(c.text).toBe(text.slice(c.charStart, c.charEnd));
    }
  });

  it('returns at least one chunk for whitespace-padded long content', () => {
    const text = `${para('theta', 30)}\n\n   \n\n${para('iota', 30)}`;
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Blank/whitespace-only paragraphs never become chunks.
    for (const c of chunks) {
      expect(c.text.trim().length).toBeGreaterThan(0);
    }
  });
});
