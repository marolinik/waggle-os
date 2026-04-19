/**
 * M-01 — persona-tier vitest.
 */
import { describe, it, expect } from 'vitest';
import {
  UNIVERSAL_MODE_IDS,
  ALL_SPECIALIST_IDS,
  TEMPLATE_SPECIALISTS,
  getPersonaTier,
  getSpecialistsForTemplate,
  isUniversalMode,
} from './persona-tier';

describe('getPersonaTier', () => {
  it('classifies the 8 universal modes', () => {
    for (const id of UNIVERSAL_MODE_IDS) {
      expect(getPersonaTier(id)).toBe('universal');
    }
  });

  it('classifies every specialist as "specialist"', () => {
    for (const id of ALL_SPECIALIST_IDS) {
      expect(getPersonaTier(id)).toBe('specialist');
    }
  });

  it('treats unknown ids (e.g. custom personas) as specialists', () => {
    expect(getPersonaTier('my-custom-persona')).toBe('specialist');
  });
});

describe('UNIVERSAL_MODE_IDS', () => {
  it('contains exactly 8 entries (4 universal + 4 knowledge workers merged)', () => {
    expect(UNIVERSAL_MODE_IDS).toHaveLength(8);
  });

  it('includes all 4 agentic modes + all 4 knowledge workers', () => {
    for (const id of ['general-purpose', 'planner', 'verifier', 'coordinator']) {
      expect(UNIVERSAL_MODE_IDS).toContain(id);
    }
    for (const id of ['researcher', 'writer', 'analyst', 'coder']) {
      expect(UNIVERSAL_MODE_IDS).toContain(id);
    }
  });

  it('has no overlap with ALL_SPECIALIST_IDS', () => {
    const u = new Set(UNIVERSAL_MODE_IDS);
    for (const id of ALL_SPECIALIST_IDS) {
      expect(u.has(id)).toBe(false);
    }
  });
});

describe('ALL_SPECIALIST_IDS', () => {
  it('has 14 entries (22 canonical personas minus 8 universal modes)', () => {
    expect(ALL_SPECIALIST_IDS).toHaveLength(14);
  });
});

describe('TEMPLATE_SPECIALISTS mapping', () => {
  it('maps each known template id to a valid specialist list', () => {
    const validSpecialists = new Set(ALL_SPECIALIST_IDS);
    for (const [tid, specs] of Object.entries(TEMPLATE_SPECIALISTS)) {
      for (const id of specs) {
        expect(validSpecialists.has(id), `${tid} maps to invalid id ${id}`).toBe(true);
      }
    }
  });

  it('covers the 15 onboarding template ids', () => {
    // If a template is added to onboarding/constants.ts this guard catches it.
    const expected = [
      'sales-pipeline', 'research-project', 'code-review', 'marketing-campaign',
      'product-launch', 'legal-review', 'agency-consulting', 'customer-support',
      'finance-accounting', 'hr-people', 'operations-center', 'data-analytics',
      'recruiting-pipeline', 'design-studio', 'blank',
    ];
    for (const id of expected) {
      expect(TEMPLATE_SPECIALISTS).toHaveProperty(id);
    }
  });
});

describe('getSpecialistsForTemplate', () => {
  it('returns the full roster for an unknown templateId', () => {
    const r = getSpecialistsForTemplate('not-a-template');
    expect(r.primary).toEqual([...ALL_SPECIALIST_IDS]);
    expect(r.others).toEqual([]);
    expect(r.hasMapping).toBe(false);
  });

  it('returns the full roster when templateId is undefined', () => {
    const r = getSpecialistsForTemplate(undefined);
    expect(r.primary).toEqual([...ALL_SPECIALIST_IDS]);
    expect(r.hasMapping).toBe(false);
  });

  it('returns the full roster for "blank" (empty mapping)', () => {
    const r = getSpecialistsForTemplate('blank');
    expect(r.primary).toEqual([...ALL_SPECIALIST_IDS]);
    expect(r.hasMapping).toBe(false);
  });

  it('scopes primary to mapping + others to the rest for a mapped template', () => {
    const r = getSpecialistsForTemplate('sales-pipeline');
    expect(r.primary).toEqual(['sales-rep', 'marketer']);
    expect(r.others).not.toContain('sales-rep');
    expect(r.others).not.toContain('marketer');
    expect(r.primary.length + r.others.length).toBe(ALL_SPECIALIST_IDS.length);
    expect(r.hasMapping).toBe(true);
  });

  it('preserves primary ordering from TEMPLATE_SPECIALISTS', () => {
    const r = getSpecialistsForTemplate('operations-center');
    expect(r.primary).toEqual(['ops-manager', 'executive-assistant']);
  });

  it('filters out specialists that are not in the available set', () => {
    const r = getSpecialistsForTemplate('sales-pipeline', ['sales-rep', 'hr-manager']);
    expect(r.primary).toEqual(['sales-rep']);
    expect(r.others).toEqual(['hr-manager']);
  });
});

describe('isUniversalMode', () => {
  it('returns true for universal ids, false otherwise', () => {
    expect(isUniversalMode('planner')).toBe(true);
    expect(isUniversalMode('sales-rep')).toBe(false);
    expect(isUniversalMode('nope')).toBe(false);
  });
});
