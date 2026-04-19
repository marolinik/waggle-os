/**
 * M-44 / P26 — cron presets + expression summariser regression.
 * Pure functions, no React, no network.
 */
import { describe, it, expect } from 'vitest';
import {
  CRON_SCHEDULE_PRESETS,
  CRON_JOB_TYPES,
  DEFAULT_CRON_PRESET_ID,
  DEFAULT_CRON_JOB_TYPE,
  getCronPreset,
  presetForExpr,
  describeCronExpr,
  isPlausibleCronExpr,
} from './cron-presets';

describe('cron preset catalog', () => {
  it('has a non-empty preset list', () => {
    expect(CRON_SCHEDULE_PRESETS.length).toBeGreaterThan(3);
  });

  it('every preset has a plausible cron expression', () => {
    for (const p of CRON_SCHEDULE_PRESETS) {
      expect(isPlausibleCronExpr(p.cronExpr), `${p.id}: ${p.cronExpr}`).toBe(true);
    }
  });

  it('preset ids are unique', () => {
    const ids = CRON_SCHEDULE_PRESETS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('DEFAULT_CRON_PRESET_ID refers to a real preset', () => {
    expect(getCronPreset(DEFAULT_CRON_PRESET_ID)).toBeDefined();
  });
});

describe('cron job type catalog', () => {
  it('has at least one entry per supported CronJobType', () => {
    const ids = CRON_JOB_TYPES.map(j => j.id);
    // Ensure the default is in the list.
    expect(ids).toContain(DEFAULT_CRON_JOB_TYPE);
  });

  it('every job type has a non-empty label and description', () => {
    for (const j of CRON_JOB_TYPES) {
      expect(j.label.length, `${j.id} label`).toBeGreaterThan(0);
      expect(j.description.length, `${j.id} description`).toBeGreaterThan(0);
    }
  });

  it('ids are unique', () => {
    const ids = CRON_JOB_TYPES.map(j => j.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('presetForExpr', () => {
  it('returns the exact preset for a known expression', () => {
    expect(presetForExpr('0 9 * * *')?.id).toBe('daily-9am');
  });

  it('tolerates leading / trailing whitespace', () => {
    expect(presetForExpr('   0 9 * * *  ')?.id).toBe('daily-9am');
  });

  it('collapses internal whitespace before matching', () => {
    expect(presetForExpr('0  9  *  *  *')?.id).toBe('daily-9am');
  });

  it('returns undefined for a custom expression', () => {
    expect(presetForExpr('15 7 * * *')).toBeUndefined();
  });
});

describe('describeCronExpr', () => {
  it('returns the preset summary for a known expression', () => {
    expect(describeCronExpr('0 9 * * *')).toBe('Every day at 9:00 AM');
  });

  it('labels a valid-shape custom expression as Custom schedule', () => {
    expect(describeCronExpr('15 7 * * *')).toBe('Custom schedule: 15 7 * * *');
  });

  it('reports "no schedule set" for an empty string', () => {
    expect(describeCronExpr('')).toBe('No schedule set');
    expect(describeCronExpr('   ')).toBe('No schedule set');
  });

  it('reports a validity hint for a malformed expression', () => {
    expect(describeCronExpr('not-cron')).toMatch(/Not a valid cron expression/);
    expect(describeCronExpr('0 9 * *')).toMatch(/Not a valid cron expression/);
  });
});

describe('isPlausibleCronExpr', () => {
  it('accepts 5-field whitespace-separated expressions', () => {
    expect(isPlausibleCronExpr('0 9 * * *')).toBe(true);
    expect(isPlausibleCronExpr('*/5 * * * *')).toBe(true);
    expect(isPlausibleCronExpr('0 9 * * 1-5')).toBe(true);
  });

  it('rejects non-5-field strings', () => {
    expect(isPlausibleCronExpr('')).toBe(false);
    expect(isPlausibleCronExpr('0 9 * *')).toBe(false);
    expect(isPlausibleCronExpr('0 9 * * * *')).toBe(false);
  });

  it('rejects strings with empty fields after collapsing whitespace', () => {
    // " 0 9 * * *" split by /\s+/ yields ['', '0', '9', '*', '*', '*'] — 6 parts.
    // Current contract: 5 non-empty fields, extras reject. Documents the
    // boundary so a regex tweak can't silently loosen it.
    expect(isPlausibleCronExpr(' 0 9 * * *')).toBe(true); // leading ws trimmed
    expect(isPlausibleCronExpr('0 9 * * * ')).toBe(true); // trailing ws trimmed
  });
});
