/**
 * Suggestion-title sanitization — regression for the QA-polish P0 (2026-06-24).
 * "Waggle suggests" titles leaked literal `|` cursor markers
 * ("Decide: | Which segment first? … |") and lost their head via mid-sentence
 * trigger-word capture ("What should I do next?" → "I do next?").
 */

import { describe, it, expect } from 'vitest';
import { sanitizeExtracted } from '../../src/local/routes/session-utils.js';

describe('sanitizeExtracted', () => {
  it('strips leaking pipe/cursor markers (the "Decide: | … |" bug)', () => {
    const out = sanitizeExtracted('| Which segment first? Gov→Banking→… |');
    expect(out).not.toContain('|');
    expect(out).toContain('Which segment first?');
    expect(out.startsWith('Which')).toBe(true);
  });

  it('strips markdown bold + leading bullet markers', () => {
    expect(sanitizeExtracted('- **Ship the landing** page')).toBe('Ship the landing page');
  });

  it('drops trailing punctuation but keeps a question mark', () => {
    expect(sanitizeExtracted('do the thing.')).toBe('do the thing');
    expect(sanitizeExtracted('What should I do next?')).toBe('What should I do next?');
  });

  it('truncates the TAIL at a word boundary with an ellipsis, never the head', () => {
    const long = 'Decide which enterprise segment to pursue first across government banking and healthcare before the launch window closes next quarter';
    const out = sanitizeExtracted(long, 40);
    expect(out.startsWith('Decide which')).toBe(true); // head preserved
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(41);
    // The body (sans ellipsis) is a clean prefix of the source that ends on a
    // word boundary (no mid-word cut).
    const body = out.replace(/…$/, '');
    expect(long.startsWith(body)).toBe(true);
    expect(body.length === long.length || long[body.length] === ' ').toBe(true);
  });

  it('collapses internal whitespace/newlines', () => {
    expect(sanitizeExtracted('foo\n\n  bar   baz')).toBe('foo bar baz');
  });
});
