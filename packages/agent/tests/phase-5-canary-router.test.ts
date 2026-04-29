/**
 * Phase 5 canary router tests.
 *
 * Coverage matrix (per manifest gepa-phase-5/manifest.yaml § canary_toggle):
 *   - Deterministic bucket: same requestId → same bucket
 *   - Bucket distribution: spread across 0-99 over varied requestIds
 *   - Empty / non-string requestId → fail-safe bucket 0
 *   - canary_pct = 0 → all requests route to baseline
 *   - canary_pct = 100 → all requests with mapping route to canary
 *   - canary_pct = 50 → ~50% routing (stochastic; sample size 1000)
 *   - Base shape without canary mapping → always baseline (gpt, generic-simple)
 *   - Canary mapping but variant not in REGISTRY → fail-safe baseline
 *   - Invalid canary_pct (negative, > 100, non-integer, NaN) → treated as 0
 *   - Override path: routes through canary against override base name
 *   - listCanaryEligibleShapes / listCanaryVariants return LOCKED scope
 *
 * Audit anchor: gepa-phase-5/manifest.yaml, decisions/2026-04-29-phase-5-scope-LOCKED.md.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  hashRequestIdToBucket,
  routeRequestToVariant,
  listCanaryEligibleShapes,
  listCanaryVariants,
  BASE_TO_CANARY_VARIANT_MAP,
} from '../src/canary/phase-5-router.js';
import {
  REGISTRY,
  registerShape,
} from '../src/prompt-shapes/index.js';
import { claudeGen1V1Shape } from '../src/prompt-shapes/gepa-evolved/claude-gen1-v1.js';
import { qwenThinkingGen1V1Shape } from '../src/prompt-shapes/gepa-evolved/qwen-thinking-gen1-v1.js';

// Ensure GEPA-evolved variants are registered before the canary router tests
// run. Production wiring registers these at boot; in test isolation we ensure
// they exist via the canonical registerShape API per Amendment 8.
beforeEach(() => {
  if (!REGISTRY['claude::gen1-v1']) {
    registerShape('claude::gen1-v1', claudeGen1V1Shape);
  }
  if (!REGISTRY['qwen-thinking::gen1-v1']) {
    registerShape('qwen-thinking::gen1-v1', qwenThinkingGen1V1Shape);
  }
});

describe('hashRequestIdToBucket — determinism + distribution', () => {
  it('returns same bucket for same requestId across many calls', () => {
    const requestId = 'req-abc-123';
    const first = hashRequestIdToBucket(requestId);
    for (let i = 0; i < 100; i++) {
      expect(hashRequestIdToBucket(requestId)).toBe(first);
    }
  });

  it('returns bucket in range [0, 99]', () => {
    for (let i = 0; i < 1000; i++) {
      const bucket = hashRequestIdToBucket(`req-${i}`);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThanOrEqual(99);
    }
  });

  it('produces reasonable spread across 1000 sequential request ids', () => {
    const buckets = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      buckets.add(hashRequestIdToBucket(`req-${i}-${Date.now() % 1000}`));
    }
    // Should hit at least 50 distinct buckets in 1000 attempts (reality: usually 90+).
    expect(buckets.size).toBeGreaterThan(50);
  });

  it('different requestIds produce different buckets (statistical sample)', () => {
    let differentCount = 0;
    const reference = hashRequestIdToBucket('req-reference');
    for (let i = 0; i < 100; i++) {
      if (hashRequestIdToBucket(`req-${i}`) !== reference) differentCount++;
    }
    expect(differentCount).toBeGreaterThan(80); // expect at least 80% to differ
  });

  it('empty string requestId → fail-safe bucket 0', () => {
    expect(hashRequestIdToBucket('')).toBe(0);
  });

  it('non-string requestId (cast at runtime) → fail-safe bucket 0', () => {
    // @ts-expect-error — testing runtime safety against non-string input
    expect(hashRequestIdToBucket(undefined)).toBe(0);
    // @ts-expect-error — testing runtime safety against non-string input
    expect(hashRequestIdToBucket(null)).toBe(0);
    // @ts-expect-error — testing runtime safety against non-string input
    expect(hashRequestIdToBucket(42)).toBe(0);
  });
});

describe('routeRequestToVariant — canary OFF (canary_pct = 0)', () => {
  it('claude alias routes to baseline shape "claude" when canary_pct = 0', () => {
    const result = routeRequestToVariant('claude-opus-4-7', 'req-1', { canaryPctOverride: 0 });
    expect(result.isCanary).toBe(false);
    expect(result.shape.name).toBe('claude');
    expect(result.baseShapeName).toBe('claude');
    expect(result.canaryPct).toBe(0);
    expect(result.canaryShapeName).toBeUndefined();
  });

  it('qwen-thinking alias routes to baseline when canary_pct = 0', () => {
    const result = routeRequestToVariant('qwen3.6-35b-a3b-via-dashscope-direct', 'req-2', {
      canaryPctOverride: 0,
    });
    expect(result.isCanary).toBe(false);
    expect(result.shape.name).toBe('qwen-thinking');
    expect(result.canaryPct).toBe(0);
  });

  it('gpt alias routes to baseline when canary_pct = 0 (no canary mapping anyway)', () => {
    const result = routeRequestToVariant('gpt-5.4', 'req-3', { canaryPctOverride: 0 });
    expect(result.isCanary).toBe(false);
    expect(result.shape.name).toBe('gpt');
  });
});

describe('routeRequestToVariant — canary FULL (canary_pct = 100)', () => {
  it('claude alias routes to claude::gen1-v1 when canary_pct = 100', () => {
    const result = routeRequestToVariant('claude-opus-4-7', 'req-full-1', { canaryPctOverride: 100 });
    expect(result.isCanary).toBe(true);
    expect(result.canaryShapeName).toBe('claude::gen1-v1');
    expect(result.shape.name).toBe('claude-gen1-v1');
    expect(result.canaryPct).toBe(100);
  });

  it('qwen-thinking alias routes to qwen-thinking::gen1-v1 when canary_pct = 100', () => {
    const result = routeRequestToVariant(
      'qwen3.6-35b-a3b-via-dashscope-direct',
      'req-full-2',
      { canaryPctOverride: 100 },
    );
    expect(result.isCanary).toBe(true);
    expect(result.canaryShapeName).toBe('qwen-thinking::gen1-v1');
    expect(result.shape.name).toBe('qwen-thinking-gen1-v1');
  });

  it('gpt alias stays on baseline even at canary_pct = 100 (out of scope per LOCK)', () => {
    const result = routeRequestToVariant('gpt-5.4', 'req-full-3', { canaryPctOverride: 100 });
    expect(result.isCanary).toBe(false);
    expect(result.shape.name).toBe('gpt');
    expect(result.canaryShapeName).toBeUndefined();
  });

  it('generic-simple alias stays on baseline at canary_pct = 100 (out of scope)', () => {
    const result = routeRequestToVariant(
      'mistral-7b-some-future-alias',
      'req-full-4',
      { canaryPctOverride: 100 },
    );
    expect(result.isCanary).toBe(false);
    expect(result.shape.name).toBe('generic-simple');
  });
});

describe('routeRequestToVariant — gradient (canary_pct = 50)', () => {
  it('routes ~50% of claude requests to canary at canary_pct = 50 (stochastic, N=1000)', () => {
    let canaryCount = 0;
    const sampleSize = 1000;
    for (let i = 0; i < sampleSize; i++) {
      const result = routeRequestToVariant(
        'claude-opus-4-7',
        `req-grad-${i}-${i * 7919 + 31}`, // mixed entropy
        { canaryPctOverride: 50 },
      );
      if (result.isCanary) canaryCount++;
    }
    // FNV-1a should distribute reasonably; expect 35%-65% with 1000 samples.
    expect(canaryCount).toBeGreaterThan(350);
    expect(canaryCount).toBeLessThan(650);
  });

  it('same requestId always routes the same way at canary_pct = 50 (deterministic)', () => {
    const requestId = 'req-deterministic-50';
    const first = routeRequestToVariant('claude-opus-4-7', requestId, { canaryPctOverride: 50 });
    for (let i = 0; i < 50; i++) {
      const next = routeRequestToVariant('claude-opus-4-7', requestId, { canaryPctOverride: 50 });
      expect(next.isCanary).toBe(first.isCanary);
      expect(next.bucket).toBe(first.bucket);
    }
  });
});

describe('routeRequestToVariant — gradient (canary_pct = 10)', () => {
  it('routes ~10% of claude requests at canary_pct = 10 (N=1000, expect 50-200)', () => {
    let canaryCount = 0;
    for (let i = 0; i < 1000; i++) {
      const result = routeRequestToVariant(
        'claude-opus-4-7',
        `req-canary10-${i}-${(i * 104729) % 999983}`,
        { canaryPctOverride: 10 },
      );
      if (result.isCanary) canaryCount++;
    }
    expect(canaryCount).toBeGreaterThanOrEqual(50);
    expect(canaryCount).toBeLessThanOrEqual(200);
  });
});

describe('routeRequestToVariant — invalid canary_pct (fail-safe)', () => {
  it('negative canary_pct → treated as 0 (canary OFF)', () => {
    const result = routeRequestToVariant('claude-opus-4-7', 'req-neg', { canaryPctOverride: -5 });
    expect(result.isCanary).toBe(false);
    expect(result.canaryPct).toBe(0);
  });

  it('canary_pct > 100 → treated as 0 (canary OFF, not clamped to 100)', () => {
    // Per parser semantics: > 100 is malformed → 0, not 100. Ensures safe-by-default.
    const result = routeRequestToVariant('claude-opus-4-7', 'req-big', { canaryPctOverride: 150 });
    expect(result.isCanary).toBe(false);
    expect(result.canaryPct).toBe(0);
  });

  it('non-integer canary_pct → treated as 0', () => {
    const result = routeRequestToVariant('claude-opus-4-7', 'req-frac', { canaryPctOverride: 12.5 });
    expect(result.isCanary).toBe(false);
    expect(result.canaryPct).toBe(0);
  });

  it('NaN canary_pct → treated as 0', () => {
    const result = routeRequestToVariant('claude-opus-4-7', 'req-nan', { canaryPctOverride: NaN });
    expect(result.isCanary).toBe(false);
    expect(result.canaryPct).toBe(0);
  });
});

describe('routeRequestToVariant — override path', () => {
  it('override directly routes to the named base shape, then applies canary on top', () => {
    const result = routeRequestToVariant('any-alias-here', 'req-ovr-1', {
      override: 'claude',
      canaryPctOverride: 100,
    });
    expect(result.baseShapeName).toBe('claude');
    expect(result.isCanary).toBe(true);
    expect(result.canaryShapeName).toBe('claude::gen1-v1');
  });

  it('override on a non-canary base name (e.g. generic-simple) → baseline at any pct', () => {
    const result = routeRequestToVariant('any-alias-here', 'req-ovr-2', {
      override: 'generic-simple',
      canaryPctOverride: 100,
    });
    expect(result.baseShapeName).toBe('generic-simple');
    expect(result.isCanary).toBe(false);
  });
});

describe('routeRequestToVariant — fail-safe when canary variant not registered', () => {
  it('temporarily de-registering claude::gen1-v1 → routes to baseline at canary_pct = 100', () => {
    const original = REGISTRY['claude::gen1-v1'];
    try {
      // Direct deletion is forbidden by lint rule but acceptable in test isolation
      // because we restore in `finally`. We simulate the "shape file missing" hazard.
      delete (REGISTRY as Record<string, unknown>)['claude::gen1-v1'];

      const result = routeRequestToVariant('claude-opus-4-7', 'req-missing-variant', {
        canaryPctOverride: 100,
      });
      expect(result.isCanary).toBe(false);
      expect(result.shape.name).toBe('claude');
      // baseShapeName still resolves to 'claude' even with canary registered missing.
      expect(result.baseShapeName).toBe('claude');
    } finally {
      if (original) {
        registerShape('claude::gen1-v1', original);
      }
    }
  });
});

describe('inspectors — listCanaryEligibleShapes / listCanaryVariants', () => {
  it('listCanaryEligibleShapes returns LOCKED scope base names', () => {
    expect(listCanaryEligibleShapes().sort()).toEqual(['claude', 'qwen-thinking']);
  });

  it('listCanaryVariants returns LOCKED scope variant REGISTRY keys', () => {
    expect(listCanaryVariants().sort()).toEqual([
      'claude::gen1-v1',
      'qwen-thinking::gen1-v1',
    ]);
  });

  it('BASE_TO_CANARY_VARIANT_MAP is frozen (mutation-safe)', () => {
    expect(Object.isFrozen(BASE_TO_CANARY_VARIANT_MAP)).toBe(true);
  });

  it('LOCKED scope excludes gpt, qwen-non-thinking, generic-simple', () => {
    expect(BASE_TO_CANARY_VARIANT_MAP['gpt']).toBeUndefined();
    expect(BASE_TO_CANARY_VARIANT_MAP['qwen-non-thinking']).toBeUndefined();
    expect(BASE_TO_CANARY_VARIANT_MAP['generic-simple']).toBeUndefined();
  });
});

describe('routeRequestToVariant — RouteResult provenance fields', () => {
  it('returns full provenance: shape, isCanary, baseShapeName, bucket, canaryPct', () => {
    const result = routeRequestToVariant('claude-opus-4-7', 'req-full-prov', {
      canaryPctOverride: 100,
    });
    expect(result.shape).toBeDefined();
    expect(typeof result.isCanary).toBe('boolean');
    expect(typeof result.baseShapeName).toBe('string');
    expect(typeof result.bucket).toBe('number');
    expect(typeof result.canaryPct).toBe('number');
    expect(result.canaryShapeName).toBe('claude::gen1-v1'); // populated when isCanary=true
  });

  it('canaryShapeName field is undefined when isCanary = false', () => {
    const result = routeRequestToVariant('gpt-5.4', 'req-no-canary', {
      canaryPctOverride: 100,
    });
    expect(result.isCanary).toBe(false);
    expect(result.canaryShapeName).toBeUndefined();
  });
});
