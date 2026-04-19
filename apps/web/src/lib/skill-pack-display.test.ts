/**
 * M-45 / P29 — SkillPack display helper regression.
 */
import { describe, it, expect } from 'vitest';
import {
  describeTrust,
  packIdentity,
  summariseSkills,
} from './skill-pack-display';

describe('describeTrust', () => {
  it('returns the Verified copy', () => {
    const d = describeTrust('verified');
    expect(d.label).toBe('Verified');
    expect(d.explainer).toMatch(/Waggle/);
  });

  it('returns the Community copy', () => {
    const d = describeTrust('community');
    expect(d.label).toBe('Community');
    expect(d.explainer).toMatch(/user/i);
  });

  it('returns the Experimental copy', () => {
    const d = describeTrust('experimental');
    expect(d.label).toBe('Experimental');
    expect(d.explainer.length).toBeGreaterThan(0);
  });

  it('falls back to Unknown for undefined or novel trust strings', () => {
    expect(describeTrust(undefined).label).toBe('Unknown');
    expect(describeTrust('').label).toBe('Unknown');
    expect(describeTrust('future-tier').label).toBe('Unknown');
  });
});

describe('packIdentity', () => {
  it('prefers id when present', () => {
    expect(packIdentity({ id: 'pack-1', name: 'Research Pack' })).toBe('pack-1');
  });

  it('falls back to name when id is empty / whitespace / missing', () => {
    expect(packIdentity({ id: '', name: 'Research Pack' })).toBe('Research Pack');
    expect(packIdentity({ id: '  ', name: 'Research Pack' })).toBe('Research Pack');
    expect(packIdentity({ name: 'Research Pack' })).toBe('Research Pack');
  });

  it('returns empty string when neither is populated (caller must handle)', () => {
    expect(packIdentity({ id: '', name: '' })).toBe('');
    expect(packIdentity({ name: '' })).toBe('');
  });
});

describe('summariseSkills', () => {
  it('handles the zero case', () => {
    expect(summariseSkills(undefined)).toBe('No skills bundled');
    expect(summariseSkills([])).toBe('No skills bundled');
  });

  it('pluralises correctly', () => {
    expect(summariseSkills(['a'])).toBe('1 skill');
    expect(summariseSkills(['a', 'b'])).toBe('2 skills');
    expect(summariseSkills(['a', 'b', 'c', 'd'])).toBe('4 skills');
  });
});
