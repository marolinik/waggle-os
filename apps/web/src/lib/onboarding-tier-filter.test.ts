/**
 * Phase 4.1 unblock — onboarding tier-filter tests.
 *
 * Spec: docs/ux-disclosure-levels.md r2 §"Templates — filter for Essential" + §"Personas — filter for Essential".
 * Decision (Marko Q1, 2026-05-07): drop `coder` from Essential personas — quote: "this is not the target."
 */
import { describe, it, expect } from 'vitest';
import {
  ESSENTIAL_TEMPLATE_IDS,
  ESSENTIAL_PERSONA_IDS,
  getTemplatesForTier,
  getPersonasForTier,
} from './onboarding-tier-filter';
import { TEMPLATES, ALL_ONBOARDING_PERSONAS, getPersonasForTemplate } from '@/components/os/overlays/onboarding/constants';

describe('ESSENTIAL_TEMPLATE_IDS', () => {
  it('contains exactly 3 IDs in spec order: agency-consulting, research-project, blank', () => {
    expect(ESSENTIAL_TEMPLATE_IDS).toEqual(['agency-consulting', 'research-project', 'blank']);
  });

  it('every essential ID exists in TEMPLATES', () => {
    const all = new Set(TEMPLATES.map(t => t.id));
    for (const id of ESSENTIAL_TEMPLATE_IDS) {
      expect(all.has(id), `${id} not in TEMPLATES`).toBe(true);
    }
  });
});

describe('ESSENTIAL_PERSONA_IDS', () => {
  it('contains exactly 4 IDs', () => {
    expect(ESSENTIAL_PERSONA_IDS).toEqual(['general-purpose', 'researcher', 'writer', 'analyst']);
  });

  it('does NOT include coder (Marko Q1 drop decision)', () => {
    expect(ESSENTIAL_PERSONA_IDS).not.toContain('coder');
  });

  it('every essential ID exists in ALL_ONBOARDING_PERSONAS', () => {
    const all = new Set(ALL_ONBOARDING_PERSONAS.map(p => p.id));
    for (const id of ESSENTIAL_PERSONA_IDS) {
      expect(all.has(id), `${id} not in ALL_ONBOARDING_PERSONAS`).toBe(true);
    }
  });
});

describe('getTemplatesForTier', () => {
  it('returns 3 essential templates for simple tier', () => {
    const result = getTemplatesForTier('simple', TEMPLATES);
    expect(result.map(t => t.id)).toEqual(['agency-consulting', 'research-project', 'blank']);
  });

  it('preserves spec ordering, not input ordering, for simple tier', () => {
    // TEMPLATES order is [sales-pipeline, research-project, code-review, ..., agency-consulting, ..., blank]
    // ESSENTIAL_TEMPLATE_IDS order is [agency-consulting, research-project, blank] — that's what we surface
    const result = getTemplatesForTier('simple', TEMPLATES);
    expect(result[0].id).toBe('agency-consulting');
    expect(result[1].id).toBe('research-project');
    expect(result[2].id).toBe('blank');
  });

  it('returns all templates for professional tier', () => {
    const result = getTemplatesForTier('professional', TEMPLATES);
    expect(result.length).toBe(TEMPLATES.length);
  });

  it('returns all templates for power tier', () => {
    const result = getTemplatesForTier('power', TEMPLATES);
    expect(result.length).toBe(TEMPLATES.length);
  });

  it('returns all templates for admin tier', () => {
    const result = getTemplatesForTier('admin', TEMPLATES);
    expect(result.length).toBe(TEMPLATES.length);
  });

  it('non-simple tiers preserve input array reference (no copy)', () => {
    // Optimization sanity check — non-simple tiers should pass through untouched
    const result = getTemplatesForTier('professional', TEMPLATES);
    expect(result).toBe(TEMPLATES);
  });

  it('handles empty input gracefully', () => {
    expect(getTemplatesForTier('simple', [])).toEqual([]);
    expect(getTemplatesForTier('professional', [])).toEqual([]);
  });
});

describe('getPersonasForTier', () => {
  it('returns 4 essential personas for simple tier when no recommended persona', () => {
    const personas = getPersonasForTemplate('blank');
    const result = getPersonasForTier('simple', personas);
    const ids = result.map(p => p.id);
    expect(ids).toContain('general-purpose');
    expect(ids).toContain('researcher');
    expect(ids).toContain('writer');
    expect(ids).toContain('analyst');
    expect(ids).not.toContain('coder');
    expect(result.length).toBe(4);
  });

  it('drops coder from simple tier', () => {
    const personas = getPersonasForTemplate('code-review'); // recommended = coder
    const result = getPersonasForTier('simple', personas);
    // Even though coder is recommended for code-review, simple tier drops it
    expect(result.find(p => p.id === 'coder')).toBeUndefined();
  });

  it('preserves the input ordering for simple tier (recommended-first when in essential set)', () => {
    const personas = getPersonasForTemplate('research-project'); // recommended = researcher (in essentials)
    const result = getPersonasForTier('simple', personas);
    // getPersonasForTemplate sorts: domain.recommended (none for knowledge-recommended), universal, knowledge, domain.others
    // For research-project: input is [general-purpose, researcher, writer, analyst, coder, ...domain]
    // After filtering: [general-purpose, researcher, writer, analyst]
    expect(result[0].id).toBe('general-purpose');
    expect(result[1].id).toBe('researcher');
    expect(result[2].id).toBe('writer');
    expect(result[3].id).toBe('analyst');
  });

  it('includes the recommended domain persona at simple tier (consultant for agency-consulting)', () => {
    const personas = getPersonasForTemplate('agency-consulting'); // recommended = consultant (domain)
    const result = getPersonasForTier('simple', personas);
    // Spec: simple tier = 4 essentials + recommended-domain-persona (if not already in essentials)
    expect(result.find(p => p.id === 'consultant'), 'consultant must appear at simple tier when recommended').toBeDefined();
    // Plus all 4 essentials
    for (const id of ['general-purpose', 'researcher', 'writer', 'analyst']) {
      expect(result.find(p => p.id === id), `${id} missing`).toBeDefined();
    }
    expect(result.length).toBe(5);
  });

  it('places the recommended domain persona FIRST in simple tier (matches getPersonasForTemplate ordering)', () => {
    const personas = getPersonasForTemplate('agency-consulting');
    const result = getPersonasForTier('simple', personas);
    expect(result[0].id).toBe('consultant');
  });

  it('does not duplicate when recommended is already in essentials', () => {
    const personas = getPersonasForTemplate('research-project'); // recommended = researcher (in essentials)
    const result = getPersonasForTier('simple', personas);
    const researcherCount = result.filter(p => p.id === 'researcher').length;
    expect(researcherCount).toBe(1);
    expect(result.length).toBe(4);
  });

  it('returns all personas for professional tier', () => {
    const personas = getPersonasForTemplate('blank');
    const result = getPersonasForTier('professional', personas);
    expect(result.length).toBe(personas.length);
    expect(result).toBe(personas); // pass-through reference
  });

  it('returns all personas for power tier', () => {
    const personas = getPersonasForTemplate('blank');
    const result = getPersonasForTier('power', personas);
    expect(result.length).toBe(personas.length);
  });

  it('returns all personas for admin tier', () => {
    const personas = getPersonasForTemplate('blank');
    const result = getPersonasForTier('admin', personas);
    expect(result.length).toBe(personas.length);
  });

  it('handles empty input gracefully', () => {
    expect(getPersonasForTier('simple', [])).toEqual([]);
    expect(getPersonasForTier('professional', [])).toEqual([]);
  });
});

describe('integration with constants.ts', () => {
  it('every essential template ID maps to an OnboardingTemplate object', () => {
    const filtered = getTemplatesForTier('simple', TEMPLATES);
    expect(filtered).toHaveLength(3);
    expect(filtered.every(t => typeof t.name === 'string' && t.icon !== undefined)).toBe(true);
  });

  it('Ljiljana-archetype journey: simple tier + agency-consulting → consultant first, 5 personas total', () => {
    // The named-user persona Marko anchors against (consulting partner archetype).
    // This test guards against the "Ljiljana sees 19 personas + 15 templates" regression.
    const templates = getTemplatesForTier('simple', TEMPLATES);
    expect(templates.find(t => t.id === 'agency-consulting')).toBeDefined();

    const personas = getPersonasForTemplate('agency-consulting');
    const filtered = getPersonasForTier('simple', personas);
    expect(filtered.length).toBe(5);
    expect(filtered[0].id).toBe('consultant');
  });
});
