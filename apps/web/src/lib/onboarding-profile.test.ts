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
  it('returns a friendly fallback when nothing is filled in', () => {
    const out = buildProfilePreview({});
    expect(out).toMatch(/greet you by name/i);
  });

  it('treats whitespace-only fields as empty', () => {
    const out = buildProfilePreview({ name: '   ', role: '', goals: [] });
    expect(out).toMatch(/greet you by name/i);
  });

  it('renders name, role and industry in the lead clause', () => {
    const out = buildProfilePreview({ name: 'Marko', role: 'Consultant', industry: 'Consulting' });
    expect(out).toContain('Marko');
    expect(out).toContain('Consultant');
    expect(out).toContain('in Consulting');
  });

  it('maps workType + teamSize ids to their labels', () => {
    const out = buildProfilePreview({ name: 'A', workType: 'engineering', teamSize: '2-10' });
    expect(out).toContain('Engineering work');
    expect(out).toContain('team of 2–10');
  });

  it('lists one or two goals verbatim and summarizes 3+', () => {
    const two = buildProfilePreview({ name: 'A', goals: ['remember', 'research'] });
    expect(two).toMatch(/wants to/i);
    expect(two).toContain('remember everything i work on');
    expect(two).toContain('research faster');

    const many = buildProfilePreview({ name: 'A', goals: ['remember', 'research', 'code', 'plan'] });
    expect(many).toMatch(/and 2 more/i);
  });

  it('falls back to the raw id for an unknown option id', () => {
    const out = buildProfilePreview({ name: 'A', workType: 'mystery' });
    expect(out).toContain('mystery work');
  });
});
