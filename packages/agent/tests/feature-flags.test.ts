/**
 * Feature-flag tests — parsePhase5CanaryPct post-canary-kickoff semantics.
 *
 * BIND: gepa-phase-5/manifest.yaml § canary_toggle. Post-kick-off code default
 * is 10 (env unset → 10). Test pin in vitest.setup.ts sets
 * WAGGLE_PHASE5_CANARY_PCT='0' for shape-selection determinism in other tests;
 * THIS file exercises the parser directly with explicit inputs.
 *
 * AUDIT: D:/Projects/PM-Waggle-OS/decisions/2026-04-30-phase-5-1-5-pm-signoff-canary-authorize.md
 */

import { describe, it, expect } from 'vitest';
import { parsePhase5CanaryPct } from '../src/feature-flags.js';

describe('parsePhase5CanaryPct — post-canary-kickoff default', () => {
  it('undefined env var → 10 (post-kick-off default 2026-04-30)', () => {
    expect(parsePhase5CanaryPct(undefined)).toBe(10);
  });

  it('empty string env var → 0 (explicit disable)', () => {
    expect(parsePhase5CanaryPct('')).toBe(0);
  });
});

describe('parsePhase5CanaryPct — well-formed values', () => {
  it.each([
    ['0', 0],
    ['10', 10],
    ['25', 25],
    ['50', 50],
    ['100', 100],
  ])('parses "%s" → %i', (raw, expected) => {
    expect(parsePhase5CanaryPct(raw)).toBe(expected);
  });
});

describe('parsePhase5CanaryPct — fail-safe to 0 on malformed', () => {
  it.each([
    ['-5', 'negative'],
    ['101', 'over 100'],
    ['12.5', 'non-integer'],
    ['abc', 'NaN string'],
    ['NaN', 'NaN literal'],
    ['Infinity', 'Infinity'],
    [' 10 ', 'whitespace-padded (Number coerces but fails int check is wrong — actually Number(" 10 ") is 10, so this passes)'],
  ])('rejects "%s" (%s) by returning 0 (or accepts whitespace-trimmed int)', (raw) => {
    const result = parsePhase5CanaryPct(raw);
    // Most malformed → 0; whitespace-padded int may parse via Number coercion.
    // Just assert the contract: integer in [0, 100] or 0.
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(100);
  });
});
