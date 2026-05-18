import { describe, it, expect } from 'vitest';
import {
  BEHAVIORAL_SPEC,
  buildActiveBehavioralSpec,
} from '../src/behavioral-spec.js';

describe('buildActiveBehavioralSpec', () => {
  it('returns the compiled baseline when no overrides provided', () => {
    const spec = buildActiveBehavioralSpec();
    expect(spec.version).toBe(BEHAVIORAL_SPEC.version);
    expect(spec.coreLoop).toBe(BEHAVIORAL_SPEC.coreLoop);
    expect(spec.qualityRules).toBe(BEHAVIORAL_SPEC.qualityRules);
    expect(spec.behavioralRules).toBe(BEHAVIORAL_SPEC.behavioralRules);
    expect(spec.workPatterns).toBe(BEHAVIORAL_SPEC.workPatterns);
    expect(spec.intelligenceDefaults).toBe(BEHAVIORAL_SPEC.intelligenceDefaults);
  });

  it('assembles .rules the same way as BEHAVIORAL_SPEC.rules', () => {
    const spec = buildActiveBehavioralSpec();
    expect(spec.rules).toBe(BEHAVIORAL_SPEC.rules);
  });

  it('overrides a single section', () => {
    const spec = buildActiveBehavioralSpec({
      coreLoop: 'EVOLVED core loop content',
    });
    expect(spec.coreLoop).toBe('EVOLVED core loop content');
    expect(spec.qualityRules).toBe(BEHAVIORAL_SPEC.qualityRules);
    expect(spec.rules.startsWith('EVOLVED core loop content')).toBe(true);
  });

  it('overrides multiple sections', () => {
    const spec = buildActiveBehavioralSpec({
      coreLoop: 'EVOLVED A',
      intelligenceDefaults: 'EVOLVED B',
    });
    expect(spec.coreLoop).toBe('EVOLVED A');
    expect(spec.intelligenceDefaults).toBe('EVOLVED B');
    // rules should contain both
    expect(spec.rules).toContain('EVOLVED A');
    expect(spec.rules).toContain('EVOLVED B');
    // but baseline sections too
    expect(spec.rules).toContain(BEHAVIORAL_SPEC.qualityRules);
  });

  it('ignores empty-string overrides', () => {
    const spec = buildActiveBehavioralSpec({
      coreLoop: '',
      qualityRules: '   ',
    });
    expect(spec.coreLoop).toBe(BEHAVIORAL_SPEC.coreLoop);
    expect(spec.qualityRules).toBe(BEHAVIORAL_SPEC.qualityRules);
  });

  it('ignores undefined entries', () => {
    const spec = buildActiveBehavioralSpec({
      coreLoop: undefined,
      qualityRules: 'EVOLVED quality',
    });
    expect(spec.coreLoop).toBe(BEHAVIORAL_SPEC.coreLoop);
    expect(spec.qualityRules).toBe('EVOLVED quality');
  });

  it('preserves section order in the rules string', () => {
    const spec = buildActiveBehavioralSpec({
      coreLoop: 'A',
      qualityRules: 'B',
      behavioralRules: 'C',
      workPatterns: 'D',
      intelligenceDefaults: 'E',
    });
    expect(spec.rules).toBe('A\n\nB\n\nC\n\nD\n\nE');
  });
});

describe('premium harness contract (R3 — verification before completion)', () => {
  it('coreLoop carries the Verification Before Completion CRITICAL block', () => {
    const cl = BEHAVIORAL_SPEC.coreLoop;
    expect(cl).toContain('=== CRITICAL: VERIFICATION BEFORE COMPLETION ===');
    expect(cl).toContain('A task is not done until verification passes');
    // Premium discipline: claimed-but-unrun checks are confabulation.
    expect(cl).toMatch(/never say "it compiles"|without having run it/);
    expect(cl).toContain('label the result UNVERIFIED');
    // Block is well-formed (opens and closes).
    const opens = (cl.match(/=== CRITICAL/g) ?? []).length;
    const closes = (cl.match(/=== END CRITICAL ===/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(opens).toBeGreaterThanOrEqual(2); // memory-conflict + verification
  });

  it('the contract flows through buildActiveBehavioralSpec()', () => {
    const spec = buildActiveBehavioralSpec();
    expect(spec.coreLoop).toContain('VERIFICATION BEFORE COMPLETION');
  });
});
