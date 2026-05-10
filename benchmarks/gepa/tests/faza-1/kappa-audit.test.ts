/**
 * GEPA Faza 1 — κ audit utility tests.
 *
 * Coverage targets:
 *   - Drift band semantics: PASS / DRIFT_LOW / DRIFT_HIGH per Faza 1 §F.3
 *   - Conservative trio = min of three pairwise (matches manifest v6 §5.4 + v7 anchor)
 *   - v6 policy floor cross-validation reporting
 *   - Cohen's κ computation against known-correct values from kappa-recal artifact
 */

import { describe, expect, it } from 'vitest';
import {
  CANONICAL_KAPPA,
  KAPPA_DRIFT_THRESHOLD,
  KAPPA_DRIFT_BAND_LOW,
  KAPPA_DRIFT_BAND_HIGH,
  V6_KAPPA_POLICY_FLOOR_PASS,
  auditKappa,
  computeCohensKappa,
} from '../../src/faza-1/kappa-audit.js';

// ───────────────────────────────────────────────────────────────────────────
// Constants exposed for external auditing
// ───────────────────────────────────────────────────────────────────────────

describe('canonical κ + drift band constants', () => {
  it('CANONICAL_KAPPA matches kappa-recal artifact value (0.7877758913412564)', () => {
    expect(CANONICAL_KAPPA).toBe(0.7877758913412564);
  });

  it('drift threshold is 0.05 per brief §4 condition 3', () => {
    expect(KAPPA_DRIFT_THRESHOLD).toBe(0.05);
  });

  it('drift band low = canonical - 0.05', () => {
    // Canonical is 0.7877758913412564; minus 0.05 = 0.7377758913412564 ≈ 0.7378.
    // toBeCloseTo precision 4 = absolute diff < 5e-5 (covers the ~2.4e-5 rounding gap).
    expect(KAPPA_DRIFT_BAND_LOW).toBeCloseTo(0.7378, 4);
    // Stronger invariant: equals canonical minus drift threshold exactly (within IEEE 754).
    expect(KAPPA_DRIFT_BAND_LOW).toBe(CANONICAL_KAPPA - KAPPA_DRIFT_THRESHOLD);
  });

  it('drift band high = canonical + 0.05', () => {
    expect(KAPPA_DRIFT_BAND_HIGH).toBeCloseTo(0.8378, 4);
    expect(KAPPA_DRIFT_BAND_HIGH).toBe(CANONICAL_KAPPA + KAPPA_DRIFT_THRESHOLD);
  });

  it('v6 policy floor pass threshold is 0.70', () => {
    expect(V6_KAPPA_POLICY_FLOOR_PASS).toBe(0.70);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Drift band verdicts
// ───────────────────────────────────────────────────────────────────────────

describe('auditKappa — drift band verdicts', () => {
  it('canonical value triggers PASS_WITHIN_DRIFT_BAND', () => {
    const r = auditKappa({ kOpusGpt: CANONICAL_KAPPA, kOpusMinimax: CANONICAL_KAPPA, kGptMinimax: CANONICAL_KAPPA });
    expect(r.kConservativeTrio).toBe(CANONICAL_KAPPA);
    expect(r.verdict).toBe('PASS_WITHIN_DRIFT_BAND');
    expect(r.driftFromCanonical).toBe(0);
  });

  it('value below band low triggers DRIFT_LOW_BELOW_BAND', () => {
    const r = auditKappa({ kOpusGpt: 0.85, kOpusMinimax: 0.85, kGptMinimax: 0.70 });
    // min = 0.70 < 0.7378 band low
    expect(r.verdict).toBe('DRIFT_LOW_BELOW_BAND');
  });

  it('value above band high triggers DRIFT_HIGH_ABOVE_BAND', () => {
    const r = auditKappa({ kOpusGpt: 0.90, kOpusMinimax: 0.90, kGptMinimax: 0.85 });
    // min = 0.85 > 0.8378 band high
    expect(r.verdict).toBe('DRIFT_HIGH_ABOVE_BAND');
  });

  it('exact band low boundary inclusive (PASS)', () => {
    const r = auditKappa({ kOpusGpt: 1.0, kOpusMinimax: 1.0, kGptMinimax: KAPPA_DRIFT_BAND_LOW });
    expect(r.verdict).toBe('PASS_WITHIN_DRIFT_BAND');
  });

  it('exact band high boundary inclusive (PASS)', () => {
    const r = auditKappa({ kOpusGpt: KAPPA_DRIFT_BAND_HIGH, kOpusMinimax: KAPPA_DRIFT_BAND_HIGH, kGptMinimax: KAPPA_DRIFT_BAND_HIGH });
    expect(r.verdict).toBe('PASS_WITHIN_DRIFT_BAND');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Conservative trio = min — anchor against actual kappa-recal data
// ───────────────────────────────────────────────────────────────────────────

describe('auditKappa — conservative trio = min of pairwise', () => {
  it('reproduces v6-kappa-recal conservative trio from pairwise', () => {
    // From benchmarks/calibration/v6-kappa-recal/_summary-v6-kappa.json
    // (SHA 657d4490... pinned in launch decision §B)
    const r = auditKappa({
      kOpusGpt: 0.847958297132928,
      kOpusMinimax: 0.8548922056384745,
      kGptMinimax: 0.7877758913412564,
    });
    expect(r.kConservativeTrio).toBe(0.7877758913412564);
    expect(r.verdict).toBe('PASS_WITHIN_DRIFT_BAND');
    expect(r.v6PolicyFloorPass).toBe(true);
  });

  it('v6 policy floor PASS when conservative >= 0.70', () => {
    const r = auditKappa({ kOpusGpt: 0.75, kOpusMinimax: 0.72, kGptMinimax: 0.70 });
    expect(r.v6PolicyFloorPass).toBe(true);
  });

  it('v6 policy floor FAIL when conservative < 0.70', () => {
    const r = auditKappa({ kOpusGpt: 0.75, kOpusMinimax: 0.72, kGptMinimax: 0.65 });
    expect(r.v6PolicyFloorPass).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Audit log line format
// ───────────────────────────────────────────────────────────────────────────

describe('auditKappa — audit log line format', () => {
  it('audit log contains all required fields', () => {
    const r = auditKappa({ kOpusGpt: 0.85, kOpusMinimax: 0.84, kGptMinimax: 0.78 });
    expect(r.auditLogLine).toContain('κ_conservative_trio=');
    expect(r.auditLogLine).toContain('canonical=');
    expect(r.auditLogLine).toContain('drift=');
    expect(r.auditLogLine).toContain('verdict=');
    expect(r.auditLogLine).toContain('v6_policy_floor=');
  });

  it('positive drift includes + sign', () => {
    const r = auditKappa({ kOpusGpt: 0.83, kOpusMinimax: 0.83, kGptMinimax: 0.80 });
    expect(r.driftFromCanonical).toBeGreaterThan(0);
    expect(r.auditLogLine).toContain('drift=+');
  });

  it('negative drift uses - sign', () => {
    const r = auditKappa({ kOpusGpt: 0.85, kOpusMinimax: 0.85, kGptMinimax: 0.70 });
    expect(r.driftFromCanonical).toBeLessThan(0);
    expect(r.auditLogLine).toContain('drift=-');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Cohen's κ primitive
// ───────────────────────────────────────────────────────────────────────────

describe('computeCohensKappa primitive', () => {
  it('returns 1.0 for perfect agreement', () => {
    const k = computeCohensKappa({
      bothCorrect: 50,
      bothIncorrect: 50,
      firstCorrectSecondIncorrect: 0,
      firstIncorrectSecondCorrect: 0,
    });
    expect(k).toBe(1.0);
  });

  it('returns 0 for chance-level agreement (50/50 base rate, random co-occurrence)', () => {
    // 100 trials, both raters each correct 50% with independent assignment
    const k = computeCohensKappa({
      bothCorrect: 25,
      bothIncorrect: 25,
      firstCorrectSecondIncorrect: 25,
      firstIncorrectSecondCorrect: 25,
    });
    expect(k).toBeCloseTo(0, 2);
  });

  it('reproduces v6 Opus-vs-GPT pairwise κ from kappa-recal data', () => {
    // From _summary-v6-kappa.json line 58-63 confusion_opus_gpt:
    //   correct_correct: 32, incorrect_incorrect: 61
    //   correct_incorrect: 7, incorrect_correct: 0
    // expected κ = 0.847958297132928 (per same file line 3 k_opus_gpt)
    const k = computeCohensKappa({
      bothCorrect: 32,
      bothIncorrect: 61,
      firstCorrectSecondIncorrect: 7,
      firstIncorrectSecondCorrect: 0,
    });
    expect(k).toBeCloseTo(0.847958297132928, 6);
  });

  it('returns NaN for empty observation set', () => {
    const k = computeCohensKappa({
      bothCorrect: 0,
      bothIncorrect: 0,
      firstCorrectSecondIncorrect: 0,
      firstIncorrectSecondCorrect: 0,
    });
    expect(Number.isNaN(k)).toBe(true);
  });

  it('handles unanimous-correct edge case (100% base rate, no variance)', () => {
    // Both raters agree everything is correct — observed = 1, expected = 1, κ undefined → return 1
    const k = computeCohensKappa({
      bothCorrect: 100,
      bothIncorrect: 0,
      firstCorrectSecondIncorrect: 0,
      firstIncorrectSecondCorrect: 0,
    });
    expect(k).toBe(1.0);
  });
});
