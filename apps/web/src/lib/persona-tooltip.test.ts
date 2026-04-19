/**
 * M-01 follow-up — persona-tooltip vitest.
 */
import { describe, it, expect } from 'vitest';
import { buildPersonaTooltip, MAX_BEST_FOR } from './persona-tooltip';

describe('buildPersonaTooltip', () => {
  it('uses tagline as headline when present', () => {
    const c = buildPersonaTooltip({
      name: 'Researcher',
      description: 'Deep investigation...',
      tagline: 'Finds truth across sources.',
    });
    expect(c.headline).toBe('Finds truth across sources.');
  });

  it('falls back to description when tagline is missing', () => {
    const c = buildPersonaTooltip({ name: 'Writer', description: 'Drafts documents.' });
    expect(c.headline).toBe('Drafts documents.');
  });

  it('falls back to description when tagline is whitespace', () => {
    const c = buildPersonaTooltip({ name: 'X', description: 'Desc', tagline: '   ' });
    expect(c.headline).toBe('Desc');
  });

  it('caps bestFor at MAX_BEST_FOR and strips empties', () => {
    const c = buildPersonaTooltip({
      name: 'X', description: 'd',
      bestFor: ['one', '', '  ', 'two', 'three', 'four', 'five', 'six'],
    });
    expect(c.bestFor).toEqual(['one', 'two', 'three', 'four']);
    expect(MAX_BEST_FOR).toBe(4);
  });

  it('trims individual bestFor entries', () => {
    const c = buildPersonaTooltip({
      name: 'X', description: 'd',
      bestFor: ['  spaced  ', '\tindented'],
    });
    expect(c.bestFor).toEqual(['spaced', 'indented']);
  });

  it('returns empty bestFor when field is missing or wrong type', () => {
    expect(buildPersonaTooltip({ name: 'X', description: 'd' }).bestFor).toEqual([]);
  });

  it('returns wontDo trimmed or null when empty', () => {
    expect(buildPersonaTooltip({ name: 'X', description: 'd', wontDo: '  hard line  ' }).wontDo)
      .toBe('hard line');
    expect(buildPersonaTooltip({ name: 'X', description: 'd', wontDo: '' }).wontDo).toBeNull();
    expect(buildPersonaTooltip({ name: 'X', description: 'd' }).wontDo).toBeNull();
  });

  it('hasRichContent is true only when at least one rich field has substance', () => {
    expect(buildPersonaTooltip({ name: 'X', description: 'd' }).hasRichContent).toBe(false);
    expect(buildPersonaTooltip({ name: 'X', description: 'd', tagline: 't' }).hasRichContent).toBe(true);
    expect(buildPersonaTooltip({ name: 'X', description: 'd', bestFor: ['a'] }).hasRichContent).toBe(true);
    expect(buildPersonaTooltip({ name: 'X', description: 'd', wontDo: 'no' }).hasRichContent).toBe(true);
  });

  it('isReadOnly defaults to false when missing or falsy', () => {
    expect(buildPersonaTooltip({ name: 'X', description: 'd' }).isReadOnly).toBe(false);
    expect(buildPersonaTooltip({ name: 'X', description: 'd', isReadOnly: false }).isReadOnly).toBe(false);
    expect(buildPersonaTooltip({ name: 'X', description: 'd', isReadOnly: true }).isReadOnly).toBe(true);
  });

  it('carries the name through unchanged', () => {
    expect(buildPersonaTooltip({ name: 'Planner', description: 'd' }).name).toBe('Planner');
  });
});
