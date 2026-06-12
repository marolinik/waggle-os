import { describe, it, expect } from 'vitest';
import {
  WORK_TYPES,
  TEAM_SIZES,
  GOALS,
  buildProfilePreview,
} from './onboarding-profile';

describe('onboarding-profile option constants', () => {
  it('exposes non-empty option lists with unique ids', () => {
    for (const list of [WORK_TYPES, TEAM_SIZES, GOALS]) {
      expect(list.length).toBeGreaterThan(0);
      const ids = list.map(o => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const o of list) {
        expect(o.id).toBeTruthy();
        expect(o.label).toBeTruthy();
      }
    }
  });
});

describe('buildProfilePreview', () => {
  const at = (hour: number) => new Date(2026, 5, 12, hour, 0, 0);

  it('prompts for a name when nothing is filled in', () => {
    expect(buildProfilePreview({})).toBe("Tell me your name and I'll greet you properly.");
  });

  it('treats a whitespace-only name as empty', () => {
    const out = buildProfilePreview({ name: '   ', role: 'Consultant', goals: [] });
    expect(out).toBe("Tell me your name and I'll greet you properly.");
  });

  it('greets by name with the memory promise when only the name is set', () => {
    expect(buildProfilePreview({ name: 'Marko' }, at(20)))
      .toBe('Good evening, Marko — your work will be remembered here.');
  });

  it('varies the salutation with the time of day', () => {
    expect(buildProfilePreview({ name: 'Marko' }, at(9))).toMatch(/^Good morning, Marko/);
    expect(buildProfilePreview({ name: 'Marko' }, at(14))).toMatch(/^Good afternoon, Marko/);
    expect(buildProfilePreview({ name: 'Marko' }, at(20))).toMatch(/^Good evening, Marko/);
  });

  it('adds a role-aware clause from the selected work type', () => {
    expect(buildProfilePreview({ name: 'Marko', workType: 'consulting' }, at(20)))
      .toBe('Good evening, Marko — ready to pick up your consulting work?');
  });

  it('falls back to the free-text role when no work type is selected', () => {
    expect(buildProfilePreview({ name: 'Marko', role: 'Strategy Consultant' }, at(9)))
      .toBe('Good morning, Marko — ready to pick up your strategy consultant work?');
  });

  it('falls back to the raw id for an unknown work-type id', () => {
    expect(buildProfilePreview({ name: 'A', workType: 'mystery' }, at(20))).toContain('mystery work');
  });
});
