/**
 * M-27 / ENG-6 — Brain Health score regression coverage.
 * Pure function, no React, no server — trivially fast vitest.
 */
import { describe, it, expect } from 'vitest';
import {
  computeBrainHealth,
  brainHealthTier,
  brainHealthBreakdown,
  HEALTH_TARGETS,
  HEALTH_WEIGHTS,
} from './brain-health';

describe('computeBrainHealth', () => {
  it('returns 0 for an empty brain', () => {
    expect(computeBrainHealth({ frames: 0, entities: 0, relations: 0 })).toBe(0);
  });

  it('returns 100 when every dimension is at or above its target', () => {
    expect(
      computeBrainHealth({
        frames: HEALTH_TARGETS.frames,
        entities: HEALTH_TARGETS.entities,
        relations: HEALTH_TARGETS.relations,
      }),
    ).toBe(100);
  });

  it('caps at 100 when counts exceed targets', () => {
    expect(
      computeBrainHealth({
        frames: HEALTH_TARGETS.frames * 10,
        entities: HEALTH_TARGETS.entities * 10,
        relations: HEALTH_TARGETS.relations * 10,
      }),
    ).toBe(100);
  });

  it('each dimension at its target contributes its full weight', () => {
    expect(computeBrainHealth({
      frames: HEALTH_TARGETS.frames, entities: 0, relations: 0,
    })).toBe(Math.round(HEALTH_WEIGHTS.frames * 100));

    expect(computeBrainHealth({
      frames: 0, entities: HEALTH_TARGETS.entities, relations: 0,
    })).toBe(Math.round(HEALTH_WEIGHTS.entities * 100));

    expect(computeBrainHealth({
      frames: 0, entities: 0, relations: HEALTH_TARGETS.relations,
    })).toBe(Math.round(HEALTH_WEIGHTS.relations * 100));
  });

  it('half-saturated counts contribute half of the dimension weight', () => {
    const score = computeBrainHealth({
      frames: HEALTH_TARGETS.frames / 2,
      entities: HEALTH_TARGETS.entities / 2,
      relations: HEALTH_TARGETS.relations / 2,
    });
    // 0.5 × (0.4 + 0.3 + 0.3) × 100 = 50
    expect(score).toBe(50);
  });

  it('negative inputs are treated as zero', () => {
    expect(computeBrainHealth({ frames: -10, entities: -1, relations: -5 })).toBe(0);
  });

  it('handles missing / undefined counts defensively', () => {
    expect(computeBrainHealth({
      frames: undefined as unknown as number,
      entities: undefined as unknown as number,
      relations: undefined as unknown as number,
    })).toBe(0);
  });

  it('returns an integer (never fractional)', () => {
    const score = computeBrainHealth({ frames: 1234, entities: 67, relations: 89 });
    expect(Number.isInteger(score)).toBe(true);
  });

  it('weights sum to 1 — guarantees 100 is the ceiling', () => {
    const sum = HEALTH_WEIGHTS.frames + HEALTH_WEIGHTS.entities + HEALTH_WEIGHTS.relations;
    // Allow for floating point rounding noise.
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });
});

describe('brainHealthTier', () => {
  it.each([
    [0, 'empty'],
    [4, 'empty'],
    [5, 'sparse'],
    [24, 'sparse'],
    [25, 'growing'],
    [49, 'growing'],
    [50, 'healthy'],
    [79, 'healthy'],
    [80, 'mature'],
    [100, 'mature'],
  ] as const)('score %d → tier %s', (score, tier) => {
    expect(brainHealthTier(score)).toBe(tier);
  });
});

describe('brainHealthBreakdown', () => {
  it('components sum to the overall score at saturation', () => {
    const counts = {
      frames: HEALTH_TARGETS.frames,
      entities: HEALTH_TARGETS.entities,
      relations: HEALTH_TARGETS.relations,
    };
    const breakdown = brainHealthBreakdown(counts);
    const total = breakdown.frames + breakdown.entities + breakdown.relations;
    expect(total).toBe(computeBrainHealth(counts));
    expect(total).toBe(100);
  });

  it('components reflect dimension weights when uniform saturation is half', () => {
    const breakdown = brainHealthBreakdown({
      frames: HEALTH_TARGETS.frames / 2,
      entities: HEALTH_TARGETS.entities / 2,
      relations: HEALTH_TARGETS.relations / 2,
    });
    expect(breakdown.frames).toBe(20); // 0.5 × 0.4 × 100
    expect(breakdown.entities).toBe(15); // 0.5 × 0.3 × 100
    expect(breakdown.relations).toBe(15); // 0.5 × 0.3 × 100
  });

  it('reports 0 for empty brain', () => {
    expect(brainHealthBreakdown({ frames: 0, entities: 0, relations: 0 })).toEqual({
      frames: 0, entities: 0, relations: 0,
    });
  });
});
