import { describe, it, expect, vi } from 'vitest';
import { detectMode, type ModeDetectorDeps } from '../src/mode-detector.js';

function makeDeps(overrides: Partial<ModeDetectorDeps> = {}): ModeDetectorDeps {
  return {
    hasToken: false,
    serverUrl: 'http://localhost:3000',
    forceLocal: false,
    forceTeam: false,
    healthCheck: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('detectMode', () => {
  it('returns local when no token', async () => {
    const result = await detectMode(makeDeps({ hasToken: false }));
    expect(result).toEqual({ type: 'local' });
  });

  it('returns team when token + server reachable', async () => {
    const result = await detectMode(makeDeps({
      hasToken: true,
      healthCheck: vi.fn().mockResolvedValue(true),
    }));
    expect(result).toEqual({ type: 'team' });
  });

  it('returns local with warning when token + server unreachable', async () => {
    const result = await detectMode(makeDeps({
      hasToken: true,
      healthCheck: vi.fn().mockResolvedValue(false),
    }));
    expect(result).toEqual({
      type: 'local',
      warning: 'Server unreachable — running in local mode.',
    });
  });

  it('returns local when --local forced', async () => {
    const result = await detectMode(makeDeps({
      hasToken: true,
      forceLocal: true,
      healthCheck: vi.fn().mockResolvedValue(true),
    }));
    expect(result).toEqual({ type: 'local' });
  });

  it('returns team when --team forced + token', async () => {
    const healthCheck = vi.fn().mockResolvedValue(false);
    const result = await detectMode(makeDeps({
      hasToken: true,
      forceTeam: true,
      healthCheck,
    }));
    expect(result).toEqual({ type: 'team' });
    // Should not even check health when forced
    expect(healthCheck).not.toHaveBeenCalled();
  });

  it('returns error when --team forced + no token', async () => {
    const result = await detectMode(makeDeps({
      hasToken: false,
      forceTeam: true,
    }));
    expect(result).toEqual({
      type: 'error',
      error: 'Team mode requires login. Run: waggle login',
    });
  });
});
