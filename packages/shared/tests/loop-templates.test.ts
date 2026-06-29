import { describe, it, expect } from 'vitest';
import { LOOP_TEMPLATES } from '../src/loop-templates.js';

describe('LOOP_TEMPLATES (knowledge-worker Loop catalog)', () => {
  it('ships a useful set of templates', () => {
    expect(LOOP_TEMPLATES.length).toBeGreaterThanOrEqual(5);
  });

  it('every template id is unique', () => {
    const ids = LOOP_TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template has a non-empty name, description, role and prompt', () => {
    for (const t of LOOP_TEMPLATES) {
      expect(t.name.trim().length, t.id).toBeGreaterThan(0);
      expect(t.description.trim().length, t.id).toBeGreaterThan(0);
      expect(t.role.trim().length, t.id).toBeGreaterThan(0);
      expect(t.jobConfig.prompt.trim().length, t.id).toBeGreaterThan(0);
    }
  });

  it('every defaultCron is a valid 5-field cron expression', () => {
    for (const t of LOOP_TEMPLATES) {
      const fields = t.defaultCron.trim().split(/\s+/);
      expect(fields.length, `${t.id}: "${t.defaultCron}"`).toBe(5);
      for (const f of fields) {
        expect(/^[\d*,/-]+$/.test(f), `${t.id} field "${f}"`).toBe(true);
      }
    }
  });

  it('cadences are daily-or-slower — never a minute/sub-hourly wildcard', () => {
    // A Loop is several LLM round-trips; a '*' or '*/n' minute field would burn
    // tokens every minute. Templates must use a concrete minute.
    for (const t of LOOP_TEMPLATES) {
      const minute = t.defaultCron.trim().split(/\s+/)[0];
      expect(minute === '*' || minute.includes('/'), `${t.id} fires too often (minute="${minute}")`).toBe(false);
    }
  });
});
