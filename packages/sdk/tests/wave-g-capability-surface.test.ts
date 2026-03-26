/**
 * Wave G — Capability Surface Productization tests.
 *
 * Verifies:
 * 1. Pack catalog structure and completeness
 * 2. Pack-to-skill relationships are valid
 * 3. Product language consistency (no internal categories leaked)
 * 4. Capability summary data shape
 */

import { describe, it, expect } from 'vitest';
import { listCapabilityPacks, getPackManifest } from '../src/capability-packs/index.js';

describe('Wave G: Capability Surface', () => {
  describe('Pack Catalog', () => {
    it('has exactly 5 curated packs', () => {
      const packs = listCapabilityPacks();
      expect(packs).toHaveLength(5);
    });

    it('all packs have required fields', () => {
      const packs = listCapabilityPacks();
      for (const pack of packs) {
        expect(pack.id).toBeTruthy();
        expect(pack.name).toBeTruthy();
        expect(pack.description).toBeTruthy();
        expect(pack.skills.length).toBeGreaterThan(0);
      }
    });

    it('includes the 5 core pack IDs', () => {
      const packs = listCapabilityPacks();
      const ids = packs.map(p => p.id);
      expect(ids).toContain('writing-suite');
      expect(ids).toContain('research-workflow');
      expect(ids).toContain('planning-master');
      expect(ids).toContain('decision-framework');
      expect(ids).toContain('team-collaboration');
    });

    it('each pack has user-facing name (not slug)', () => {
      const packs = listCapabilityPacks();
      for (const pack of packs) {
        // Names should have spaces and be title-cased, not slugs
        expect(pack.name).toMatch(/[A-Z]/); // Contains uppercase
        expect(pack.name).not.toMatch(/^[a-z-]+$/); // Not a slug
      }
    });
  });

  describe('Pack-to-Skill Relationships', () => {
    it('each pack references valid skill IDs', () => {
      const packs = listCapabilityPacks();
      for (const pack of packs) {
        for (const skillId of pack.skills) {
          expect(typeof skillId).toBe('string');
          expect(skillId.length).toBeGreaterThan(0);
          // Skill IDs should be kebab-case
          expect(skillId).toMatch(/^[a-z][a-z0-9-]*$/);
        }
      }
    });

    it('getPackManifest returns correct pack by ID', () => {
      const pack = getPackManifest('writing-suite');
      expect(pack).not.toBeNull();
      expect(pack!.name).toBe('Writing Suite');
      expect(pack!.skills).toContain('draft-memo');
    });

    it('getPackManifest returns null for unknown pack', () => {
      const pack = getPackManifest('nonexistent-pack');
      expect(pack).toBeNull();
    });
  });

  describe('Product Language', () => {
    it('pack descriptions use user-facing language (no internal terms)', () => {
      const packs = listCapabilityPacks();
      const internalTerms = ['plugin', 'MCP', 'hook', 'mcp_server'];
      for (const pack of packs) {
        for (const term of internalTerms) {
          expect(pack.description.toLowerCase()).not.toContain(term.toLowerCase());
        }
      }
    });

    it('pack names do not reference implementation details', () => {
      const packs = listCapabilityPacks();
      for (const pack of packs) {
        expect(pack.name.toLowerCase()).not.toContain('plugin');
        expect(pack.name.toLowerCase()).not.toContain('mcp');
        expect(pack.name.toLowerCase()).not.toContain('hook');
      }
    });
  });

  describe('Capability Summary Shape', () => {
    it('can construct a unified capability count from component data', () => {
      // Simulates what the UI does: merge implementation counts into product counts
      const mockCapabilities = {
        tools: { count: 25, native: 20, plugin: 3, mcp: 2 },
        skills: [{ name: 'draft-memo' }, { name: 'research-synthesis' }],
        workflows: [{ name: 'research-team' }],
        plugins: [{ name: 'p1', state: 'active' }],
        mcpServers: [{ name: 'm1', healthy: true }],
        commands: [{ name: '/help' }, { name: '/cost' }],
      };

      // Product-level counts (what user sees)
      const toolCount = mockCapabilities.tools.count;
      const skillCount = mockCapabilities.skills.length;
      const workflowCount = mockCapabilities.workflows.length;
      const extensionCount = mockCapabilities.plugins.length + mockCapabilities.mcpServers.length;
      const commandCount = mockCapabilities.commands.length;

      expect(toolCount).toBe(25);
      expect(skillCount).toBe(2);
      expect(workflowCount).toBe(1);
      expect(extensionCount).toBe(2); // unified plugins + MCP
      expect(commandCount).toBe(2);
    });
  });
});
