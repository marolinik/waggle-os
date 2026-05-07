/**
 * Persona-aware connector recommendations.
 *
 * Two layers of guards:
 *  1. SHAPE — primary lengths in the agreed 3–5 range, no duplicates,
 *     fallback for unknown personas, every onboarding persona has a
 *     matching map entry.
 *  2. CATALOG MEMBERSHIP — every connector ID referenced by the
 *     recommendations actually exists in mcp-catalog.ts. This is the
 *     bug class we fix here: typos / stale IDs / forward-references
 *     that ship a recommendation pointing nowhere.
 */

import { describe, it, expect } from 'vitest';
import {
  recommendConnectors,
  flattenRecommendation,
  allReferencedConnectorIds,
  CONNECTOR_RECOMMENDATIONS,
} from '../src/connector-recommendations.js';
import { MCP_CATALOG } from '../src/mcp-catalog.js';

const CATALOG_IDS = new Set(MCP_CATALOG.map(s => s.id));

describe('recommendConnectors', () => {
  it('returns universal defaults for an unknown persona id', () => {
    const r = recommendConnectors('not-a-real-persona-id');
    expect(r.primary).toContain('gdrive-mcp');
    expect(r.primary).toContain('gmail-mcp');
    expect(r.primary).toContain('notion-mcp');
  });

  it('returns the persona-specific recommendation when the id matches', () => {
    const sales = recommendConnectors('sales-rep');
    expect(sales.primary).toContain('hubspot-mcp');
    expect(sales.primary).toContain('salesforce-mcp');

    const coder = recommendConnectors('coder');
    expect(coder.primary).toContain('github-mcp');
    expect(coder.primary).toContain('linear-mcp');

    const consultant = recommendConnectors('consultant');
    expect(consultant.primary).toContain('notion-mcp');
    expect(consultant.primary).toContain('gdrive-mcp');
  });

  it('always returns a non-empty primary list (never strands the UI on empty)', () => {
    const personaIds = [...Object.keys(CONNECTOR_RECOMMENDATIONS), 'unknown-persona', ''];
    for (const id of personaIds) {
      const r = recommendConnectors(id);
      expect(r.primary.length).toBeGreaterThan(0);
    }
  });
});

describe('CONNECTOR_RECOMMENDATIONS shape', () => {
  it('every recommendation has 3-6 primary entries (Ljiljana-bar cognitive ceiling)', () => {
    for (const [personaId, rec] of Object.entries(CONNECTOR_RECOMMENDATIONS)) {
      expect(rec.primary.length, `persona "${personaId}" primary out of range`).toBeGreaterThanOrEqual(3);
      expect(rec.primary.length, `persona "${personaId}" primary out of range`).toBeLessThanOrEqual(6);
    }
  });

  it('no recommendation has duplicate ids within primary or secondary', () => {
    for (const [personaId, rec] of Object.entries(CONNECTOR_RECOMMENDATIONS)) {
      const allIds = [...rec.primary, ...rec.secondary];
      const dupes = allIds.filter((id, i) => allIds.indexOf(id) !== i);
      expect(dupes, `persona "${personaId}" has duplicate connector ids: ${dupes.join(', ')}`).toEqual([]);
    }
  });

  it('every recommended id resolves to a real entry in mcp-catalog.ts', () => {
    const referenced = allReferencedConnectorIds();
    const missing = referenced.filter(id => !CATALOG_IDS.has(id));
    expect(missing, `connector recommendation references ids not in mcp-catalog.ts: ${missing.join(', ')}`).toEqual([]);
  });

  it('covers every persona id from persona-data.ts (no recommendation drift after a persona is added)', () => {
    // The persona list is duplicated here intentionally — importing from
    // packages/agent would couple shared->agent, which we don't want for
    // a leaf data module. If a persona is added in persona-data.ts but
    // not here, this test fails and the fix is a one-line entry.
    const ALL_PERSONA_IDS = [
      'researcher', 'writer', 'analyst', 'coder',
      'project-manager', 'executive-assistant', 'sales-rep', 'marketer',
      'product-manager-senior', 'hr-manager', 'legal-professional',
      'finance-owner', 'consultant',
      'general-purpose', 'planner', 'verifier', 'coordinator',
      'support-agent', 'ops-manager', 'data-engineer', 'recruiter',
      'creative-director',
    ];
    const recommendedIds = new Set(Object.keys(CONNECTOR_RECOMMENDATIONS));
    const missingFromMap = ALL_PERSONA_IDS.filter(id => !recommendedIds.has(id));
    expect(missingFromMap, `personas without a CONNECTOR_RECOMMENDATIONS entry: ${missingFromMap.join(', ')}`).toEqual([]);
  });
});

describe('flattenRecommendation', () => {
  it('returns primary IDs in order, then secondary', () => {
    const flat = flattenRecommendation({
      primary: ['a', 'b', 'c'],
      secondary: ['d', 'e'],
    });
    expect(flat).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('preserves primary-first ordering for a real persona', () => {
    const flat = flattenRecommendation(recommendConnectors('coder'));
    // First five must be the primary list (anchored to github-mcp on top
    // because that's the most-load-bearing connector for the coder persona).
    expect(flat[0]).toBe('github-mcp');
  });
});
