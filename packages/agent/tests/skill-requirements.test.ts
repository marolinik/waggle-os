/**
 * #15 skill requirement badges (v1 badge-only): extraction from frontmatter +
 * presence checks with injectable deps + the bin-lookup TTL cache.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  extractSkillRequirements,
  buildSkillBinLookupInvocation,
  checkSkillRequirements,
  clearSkillRequirementsCache,
} from '../src/skill-requirements.js';

beforeEach(() => {
  clearSkillRequirementsCache();
});

describe('extractSkillRequirements', () => {
  it('returns null when the skill declares no requires block', () => {
    expect(extractSkillRequirements('---\nname: Plain\n---\n# body')).toBeNull();
    expect(extractSkillRequirements('# no frontmatter at all')).toBeNull();
  });

  it('normalizes a requires block to always-present env/bins arrays', () => {
    const content = `---
name: Video
requires:
  bins: [ffmpeg]
---
body`;
    expect(extractSkillRequirements(content)).toEqual({ env: [], bins: ['ffmpeg'] });
  });
});

describe('checkSkillRequirements', () => {
  it('reports satisfied when every env key and bin is present', async () => {
    const status = await checkSkillRequirements(
      { env: ['A_KEY'], bins: ['ffmpeg'] },
      { hasEnv: () => true, hasBin: async () => true },
    );
    expect(status).toEqual({ satisfied: true, missingEnv: [], missingBins: [] });
  });

  it('lists missing env keys', async () => {
    const status = await checkSkillRequirements(
      { env: ['PRESENT', 'ABSENT'], bins: [] },
      { hasEnv: (k) => k === 'PRESENT', hasBin: async () => true },
    );
    expect(status.satisfied).toBe(false);
    expect(status.missingEnv).toEqual(['ABSENT']);
    expect(status.missingBins).toEqual([]);
  });

  it('lists missing bins', async () => {
    const status = await checkSkillRequirements(
      { env: [], bins: ['git', 'not-a-bin'] },
      { hasEnv: () => true, hasBin: async (n) => n === 'git' },
    );
    expect(status.satisfied).toBe(false);
    expect(status.missingBins).toEqual(['not-a-bin']);
  });

  it('empty requirements are trivially satisfied', async () => {
    const status = await checkSkillRequirements({ env: [], bins: [] });
    expect(status).toEqual({ satisfied: true, missingEnv: [], missingBins: [] });
  });

  it('default hasEnv reads process.env', async () => {
    process.env.WAGGLE_TEST_REQ_15 = '1';
    try {
      const status = await checkSkillRequirements({ env: ['WAGGLE_TEST_REQ_15'], bins: [] });
      expect(status.satisfied).toBe(true);
    } finally {
      delete process.env.WAGGLE_TEST_REQ_15;
    }
  });

  it('caches bin lookups within the TTL', async () => {
    const hasBin = vi.fn(async () => true);
    await checkSkillRequirements({ env: [], bins: ['ffmpeg'] }, { hasBin });
    await checkSkillRequirements({ env: [], bins: ['ffmpeg'] }, { hasBin });
    expect(hasBin).toHaveBeenCalledTimes(1);
  });

  it('re-runs bin lookups after the TTL expires', async () => {
    const hasBin = vi.fn(async () => false);
    let clock = 1_000_000;
    const now = () => clock;
    await checkSkillRequirements({ env: [], bins: ['ffmpeg'] }, { hasBin, now });
    clock += 5 * 60_000 + 1; // past the 5-min TTL
    await checkSkillRequirements({ env: [], bins: ['ffmpeg'] }, { hasBin, now });
    expect(hasBin).toHaveBeenCalledTimes(2);
  });

  it('clearSkillRequirementsCache forces a fresh bin lookup', async () => {
    const hasBin = vi.fn(async () => false);
    await checkSkillRequirements({ env: [], bins: ['ffmpeg'] }, { hasBin });
    clearSkillRequirementsCache();
    await checkSkillRequirements({ env: [], bins: ['ffmpeg'] }, { hasBin });
    expect(hasBin).toHaveBeenCalledTimes(2);
  });
});

describe('buildSkillBinLookupInvocation', () => {
  it('uses a sanitized env and absolute System32 where.exe on win32', () => {
    const invocation = buildSkillBinLookupInvocation('win32', {
      PATH: 'C:\\Tools',
      SystemRoot: 'C:\\Windows',
      OPENAI_API_KEY: 'must-not-cross',
    });

    expect(invocation.command).toBe('C:\\Windows\\System32\\where.exe');
    expect(invocation.env.PATH).toBe('C:\\Tools');
    expect(invocation.env.OPENAI_API_KEY).toBeUndefined();
  });
});
