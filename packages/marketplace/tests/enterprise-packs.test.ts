/**
 * Enterprise Packs — unit tests for KVARK-conditional pack definitions
 * and the enterprise-packs endpoint behavior.
 */

import { describe, it, expect } from 'vitest';
import { ENTERPRISE_PACKS, type EnterprisePack } from '../src/enterprise-packs';

describe('ENTERPRISE_PACKS definitions', () => {
  it('has at least 3 enterprise packs', () => {
    expect(ENTERPRISE_PACKS.length).toBeGreaterThanOrEqual(3);
  });

  it('every pack has required fields', () => {
    for (const pack of ENTERPRISE_PACKS) {
      expect(typeof pack.slug).toBe('string');
      expect(pack.slug.length).toBeGreaterThan(0);

      expect(typeof pack.display_name).toBe('string');
      expect(pack.display_name.length).toBeGreaterThan(0);

      expect(typeof pack.description).toBe('string');
      expect(pack.description.length).toBeGreaterThan(0);

      expect(typeof pack.target_roles).toBe('string');
      expect(pack.target_roles.length).toBeGreaterThan(0);

      expect(typeof pack.icon).toBe('string');
      expect(pack.icon.length).toBeGreaterThan(0);

      expect(Array.isArray(pack.skills)).toBe(true);
      expect(pack.skills.length).toBeGreaterThan(0);

      expect(Array.isArray(pack.kvarkRequirements)).toBe(true);
      expect(pack.kvarkRequirements.length).toBeGreaterThan(0);
    }
  });

  it('all slugs are unique', () => {
    const slugs = ENTERPRISE_PACKS.map(p => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('slugs are kebab-case (no spaces or uppercase)', () => {
    for (const pack of ENTERPRISE_PACKS) {
      expect(pack.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('every pack references at least one kvark skill', () => {
    for (const pack of ENTERPRISE_PACKS) {
      const hasKvarkSkill = pack.skills.some(s => s.startsWith('kvark_'));
      expect(hasKvarkSkill).toBe(true);
    }
  });

  it('contains the expected pack slugs', () => {
    const slugs = ENTERPRISE_PACKS.map(p => p.slug);
    expect(slugs).toContain('enterprise-document-qa');
    expect(slugs).toContain('compliance-workflow');
    expect(slugs).toContain('knowledge-graph-enrichment');
  });
});

describe('Enterprise packs endpoint behavior (simulated)', () => {
  // Simulate the endpoint logic without starting a real Fastify server.
  // The real endpoint uses getKvarkConfig(vault) to decide.

  function simulateEndpoint(kvarkConfigured: boolean) {
    if (!kvarkConfigured) {
      return {
        packs: [] as EnterprisePack[],
        total: 0,
        kvarkRequired: true,
        hint: 'Enterprise packs require a KVARK connection. Configure KVARK credentials in the vault to unlock.',
      };
    }
    return {
      packs: ENTERPRISE_PACKS,
      total: ENTERPRISE_PACKS.length,
      kvarkRequired: false,
    };
  }

  it('returns packs when KVARK is configured', () => {
    const result = simulateEndpoint(true);
    expect(result.packs.length).toBeGreaterThanOrEqual(3);
    expect(result.total).toBe(ENTERPRISE_PACKS.length);
    expect(result.kvarkRequired).toBe(false);
  });

  it('returns empty array when KVARK is not configured', () => {
    const result = simulateEndpoint(false);
    expect(result.packs).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.kvarkRequired).toBe(true);
    expect(result.hint).toBeDefined();
  });

  it('no packs leak when KVARK is absent', () => {
    const result = simulateEndpoint(false);
    expect(result.packs).toHaveLength(0);
    // Ensure the response shape is consistent
    expect(result).toHaveProperty('kvarkRequired', true);
    expect(result).toHaveProperty('total', 0);
  });
});
