import { describe, it, expect } from 'vitest';
import { normalizeMemoryKey, isGroupableKey, MIN_NORMALIZED_KEY_CHARS } from './memory-text-normalize';

describe('normalizeMemoryKey', () => {
  it('collapses two strings that differ only by an embedded audit-run id', () => {
    const a = normalizeMemoryKey('BENCHMARK completed for audit-run-id: 3f9a2b0c on the LoCoMo suite');
    const b = normalizeMemoryKey('BENCHMARK completed for audit-run-id: 71ee4400 on the LoCoMo suite');
    expect(a).toBe(b);
    expect(a).toContain('benchmark completed');
    expect(a).not.toContain('3f9a2b0c');
  });

  it('strips bare "audit-<digits>" ids without requiring the word "run"', () => {
    // Real live-data shape found in wave-4 QA: "audit-1782648502308", not the
    // "audit-run-id: …" form RUN_ID_RE already covers.
    const a = normalizeMemoryKey('Imran uses 2x2 frameworks and wants every decision remembered (audit-1782648502308)');
    const b = normalizeMemoryKey('Imran uses 2x2 frameworks and wants every decision remembered (audit-1782638749061)');
    expect(a).toBe(b);
    expect(a).toContain('imran uses 2x2 frameworks');
  });

  it('does NOT strip ordinary prose containing the word "audit" (e.g. "audit trail")', () => {
    const key = normalizeMemoryKey('This constitutes an audit trail requirement for the compliance review');
    expect(key).toContain('audit trail');
  });

  it('strips a raw epoch-ms "Timestamp: …" label (not just ISO-8601)', () => {
    const a = normalizeMemoryKey('BENCHMARK anchor fact. Timestamp: 1782400441971');
    const b = normalizeMemoryKey('BENCHMARK anchor fact. Timestamp: 1782639999999');
    expect(a).toBe(b);
    expect(a).toContain('benchmark anchor fact');
  });

  it('strips BENCH-SECRET benchmark-harness tokens', () => {
    const a = normalizeMemoryKey('Confidential: BENCH-SECRET-5yu27cwrmsv');
    const b = normalizeMemoryKey('Confidential: BENCH-SECRET-9zz10qexampl');
    expect(a).toBe(b);
    expect(a).toContain('confidential');
  });

  it('strips UUIDs', () => {
    const a = normalizeMemoryKey('Imran prefers dark mode (uuid a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d)');
    const b = normalizeMemoryKey('Imran prefers dark mode (uuid ffffffff-1111-4222-8333-444455556666)');
    expect(a).toBe(b);
    expect(a).toContain('imran prefers dark mode');
  });

  it('strips ISO timestamps', () => {
    const a = normalizeMemoryKey('Session recorded 2026-07-01T12:30:00Z about the launch plan');
    const b = normalizeMemoryKey('Session recorded 2026-07-04T09:00:00Z about the launch plan');
    expect(a).toBe(b);
  });

  it('case-folds and collapses whitespace', () => {
    expect(normalizeMemoryKey('  The   Launch\nPlan  ')).toBe('the launch plan');
  });

  it('returns empty string for nullish input', () => {
    expect(normalizeMemoryKey(null)).toBe('');
    expect(normalizeMemoryKey(undefined)).toBe('');
    expect(normalizeMemoryKey('')).toBe('');
  });

  it('does not merge genuinely different facts (guard via isGroupableKey)', () => {
    const a = normalizeMemoryKey('Ships in Q3');
    const b = normalizeMemoryKey('Ships in Q4');
    expect(a).not.toBe(b);
  });

  it('min-length guard flags short normalized keys as non-groupable', () => {
    expect(isGroupableKey(normalizeMemoryKey('#42'))).toBe(false);
    expect(isGroupableKey(normalizeMemoryKey(''))).toBe(false);
    expect(normalizeMemoryKey('#42').length).toBeLessThan(MIN_NORMALIZED_KEY_CHARS);
    expect(isGroupableKey(normalizeMemoryKey('The Germany GTM launches in Q3'))).toBe(true);
  });

  it('does not mutate or retain state across calls', () => {
    const input = 'audit-run-id: abc123 stable body text here';
    const first = normalizeMemoryKey(input);
    const second = normalizeMemoryKey(input);
    expect(first).toBe(second);
  });
});
