import { describe, it, expect } from 'vitest';
import { SPRING, DUR, EASE_OUT, STAGGER, SIGNATURE, REDUCED, dampingRatio } from './tokens';

describe('motion tokens — the vocabulary invariants', () => {
  it('every spring family variant shares the `spring` type', () => {
    for (const variant of Object.values(SPRING)) {
      expect(variant.type).toBe('spring');
    }
  });

  it('all three springs share ONE physical character (damping ratio band)', () => {
    // ζ = damping / (2·√(stiffness·mass)); all variants must read as the same
    // "material" — a light single-overshoot settle. Band is tight on purpose so
    // a future retune of amplitude/speed can never silently change the feel.
    const ratios = Object.values(SPRING).map(dampingRatio);
    for (const z of ratios) {
      expect(z).toBeGreaterThan(0.7);
      expect(z).toBeLessThan(0.8);
    }
    const spread = Math.max(...ratios) - Math.min(...ratios);
    expect(spread).toBeLessThan(0.05);
  });

  it('DUR is strictly ascending (fast < base < slow < settle)', () => {
    const seq = [DUR.fast, DUR.base, DUR.slow, DUR.settle];
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i]).toBeGreaterThan(seq[i - 1]);
    }
  });

  it('EASE_OUT is a valid 4-point cubic-bezier control tuple', () => {
    expect(EASE_OUT).toHaveLength(4);
    for (const n of EASE_OUT) {
      expect(typeof n).toBe('number');
    }
  });

  it('STAGGER list is tighter than brief and both are positive', () => {
    expect(STAGGER.list).toBeGreaterThan(0);
    expect(STAGGER.brief).toBeGreaterThan(STAGGER.list);
  });

  it('SIGNATURE full vs micro moment sets are disjoint', () => {
    const full = new Set<string>(SIGNATURE.full.moments);
    const overlap = SIGNATURE.micro.moments.filter((m) => full.has(m));
    expect(overlap).toEqual([]);
  });

  it('SIGNATURE full is the rare/flourish tier, micro is the frequent tier', () => {
    // Full flourishes carry a per-session cooldown; micro must not (routine).
    expect(SIGNATURE.full.perSessionCooldownMs).toBeGreaterThan(0);
    expect(SIGNATURE.full.durS).toBe(DUR.settle);
    expect(SIGNATURE.micro.durS).toBe(DUR.fast);
  });

  it('REDUCED covers every motion tier with a non-empty mapping', () => {
    const tiers = ['routeTransition', 'hover', 'settle', 'streamingCaret', 'countUp', 'ambient'] as const;
    // Exactly these tiers, no more (no orphan tier, no missing tier).
    expect(Object.keys(REDUCED).sort()).toEqual([...tiers].sort());
    for (const tier of tiers) {
      expect(REDUCED[tier]).toBeTruthy();
      expect(typeof REDUCED[tier]).toBe('string');
    }
  });
});
