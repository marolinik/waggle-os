import { describe, it, expect } from 'vitest';
import { formatPersonaName } from './persona-display';

describe('formatPersonaName', () => {
  it('title-cases a kebab-case id', () => {
    expect(formatPersonaName('sales-rep')).toBe('Sales Rep');
    expect(formatPersonaName('product-manager-senior')).toBe('Product Manager Senior');
    expect(formatPersonaName('general-purpose')).toBe('General Purpose');
  });

  it('capitalizes a single-word id', () => {
    expect(formatPersonaName('writer')).toBe('Writer');
    expect(formatPersonaName('coder')).toBe('Coder');
  });

  it('returns empty string for empty / undefined / non-string input — surface stays clean instead of showing "Undefined"', () => {
    expect(formatPersonaName('')).toBe('');
    expect(formatPersonaName(undefined)).toBe('');
    expect(formatPersonaName(null)).toBe('');
    expect(formatPersonaName(42)).toBe('');
  });

  it('preserves consecutive dashes as empty segments without crashing', () => {
    // Defensive: any malformed id from the wire shouldn't blow up the UI.
    expect(formatPersonaName('foo--bar')).toBe('Foo  Bar');
  });
});
