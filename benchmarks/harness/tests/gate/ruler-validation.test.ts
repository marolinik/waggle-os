/**
 * Ruler-validation gate tests (03-REDTEAM-RESOLUTIONS D6).
 * Reproduce a published τ²/SWE number within a pre-registered tolerance
 * BEFORE claiming any delta. FAIL ⇒ block the priced run.
 */
import { describe, expect, it } from 'vitest';
import {
  validateRuler,
  type RulerSpec,
  type RulerVerdict,
} from '../../src/gate/ruler-validation.js';

const TAU2_RETAIL: RulerSpec = {
  substrate: 'tau2-bench',
  split: 'retail',
  model: 'gpt-4.1-mini',
  published_score: 0.8195, // Memori-precedent style: fraction in [0,1]
  tolerance_abs: 0.01, // ±1pp pre-registered band
  source: 'Sierra tau2-bench leaderboard 2026-06 (pre-registered ref)',
};

describe('validateRuler — tolerance band', () => {
  it('PASS when the measured score is inside the ±tolerance band', () => {
    const v: RulerVerdict = validateRuler(TAU2_RETAIL, 0.8198);
    expect(v.pass).toBe(true);
    expect(v.measured_score).toBe(0.8198);
    expect(v.published_score).toBe(0.8195);
    expect(v.delta).toBeCloseTo(0.0003, 10);
    expect(v.abs_delta).toBeCloseTo(0.0003, 10);
    expect(v.tolerance_abs).toBe(0.01);
  });

  it('PASS at the exact lower edge (band is inclusive)', () => {
    const v = validateRuler(TAU2_RETAIL, 0.8195 - 0.01);
    expect(v.pass).toBe(true);
    expect(v.abs_delta).toBeCloseTo(0.01, 10);
  });

  it('PASS at the exact upper edge (band is inclusive)', () => {
    const v = validateRuler(TAU2_RETAIL, 0.8195 + 0.01);
    expect(v.pass).toBe(true);
  });

  it('FAIL when measured is below the band', () => {
    const v = validateRuler(TAU2_RETAIL, 0.80);
    expect(v.pass).toBe(false);
    expect(v.abs_delta).toBeGreaterThan(0.01);
    expect(v.reason).toMatch(/outside the pre-registered/);
  });

  it('FAIL when measured is above the band (a too-good reproduction is also suspect)', () => {
    const v = validateRuler(TAU2_RETAIL, 0.95);
    expect(v.pass).toBe(false);
    expect(v.abs_delta).toBeGreaterThan(0.01);
  });

  it('echoes the spec identity fields for the audit trail', () => {
    const v = validateRuler(TAU2_RETAIL, 0.8198);
    expect(v.substrate).toBe('tau2-bench');
    expect(v.split).toBe('retail');
    expect(v.model).toBe('gpt-4.1-mini');
    expect(v.source).toBe(TAU2_RETAIL.source);
  });
});

describe('validateRuler — validation', () => {
  it('rejects a non-positive tolerance', () => {
    expect(() => validateRuler({ ...TAU2_RETAIL, tolerance_abs: 0 }, 0.8195)).toThrow(/tolerance_abs > 0/);
  });
  it('rejects a published_score outside [0,1]', () => {
    expect(() => validateRuler({ ...TAU2_RETAIL, published_score: 1.5 }, 0.8)).toThrow(/published_score ∈ \[0, 1\]/);
  });
  it('rejects a measured score outside [0,1]', () => {
    expect(() => validateRuler(TAU2_RETAIL, 1.2)).toThrow(/measured ∈ \[0, 1\]/);
  });
  it('rejects a non-finite measured score', () => {
    expect(() => validateRuler(TAU2_RETAIL, Number.NaN)).toThrow(/measured ∈ \[0, 1\]/);
  });
});
