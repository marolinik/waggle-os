/**
 * Phase 4B (S21) — pure-module tests for the six-domain extension federation
 * (extension-catalog.ts): normalizer shapes, lifecycle derivation, honest
 * installability flags, filter and sort.
 */
import { describe, it, expect } from 'vitest';
import type { ConnectorDefinition } from '@waggle/shared';
import type { SkillPack } from './types';
import {
  filterExtensions, sortExtensions,
  fromConnector, fromMarketplacePackage, fromMcpCatalogRow, fromModel,
  fromPersona, fromSkillPack, fromTemplate,
  type Extension,
} from './extension-catalog';

describe('extension-catalog normalizers', () => {
  it('marketplace packages are installable with a namespaced id + scan status', () => {
    const ext = fromMarketplacePackage({
      id: 12, name: 'web-scraper', description: 'Scrape', type: 'skill',
      installed: false, scanStatus: 'passed',
    });
    expect(ext).toMatchObject({
      id: 'pkg:12', type: 'skill', kind: 'package', packageId: 12,
      installable: true, installed: false, lifecycle: 'available', scanStatus: 'passed',
    });
  });

  it('an mcp registry package maps to the mcp facet via waggle_install_type (real rows have no `type`)', () => {
    const ext = fromMarketplacePackage({
      id: 3, name: 'pg-mcp', description: '', waggle_install_type: 'mcp', installed: true,
    });
    expect(ext.type).toBe('mcp');
    expect(ext.lifecycle).toBe('installed');
    // Legacy fixture `type` still honoured when waggle_install_type is absent.
    expect(fromMarketplacePackage({ id: 4, name: 'x', description: '', type: 'mcp', installed: false }).type).toBe('mcp');
  });

  it('skill packs normalize the RAW /api/marketplace/packs row (slug/display_name, no name/installed) and are browse-only', () => {
    // Exactly what db.listPacks() emits — the route adds nothing.
    const raw = {
      id: 1, slug: 'research-pack', display_name: 'Research Pack',
      description: 'Research skills', target_roles: '["researcher"]',
      icon: 'book', priority: 1, connectors_needed: '[]', created_at: '2026-06-01',
    };
    const ext = fromSkillPack(raw);
    expect(ext).toMatchObject({
      id: 'pack:research-pack', name: 'Research Pack', type: 'skill', kind: 'pack',
      // A4: no pack-install route exists — packs must not offer Install.
      installable: false, installed: false, lifecycle: 'available',
    });
    // ≥2 raw rows must sort without throwing (the live-registry crash).
    expect(() => sortExtensions([ext, fromSkillPack({ ...raw, id: 2, slug: 'ops-pack', display_name: 'Ops Pack' })])).not.toThrow();
  });

  it('legacy FE SkillPack fixtures keep their trust label and stay browse-only', () => {
    const legacy: SkillPack = {
      id: 'research', name: 'research', description: 'Research skills',
      category: 'research', skills: [], installed: true, trust: 'verified',
    };
    const ext = fromSkillPack(legacy);
    expect(ext).toMatchObject({ id: 'pack:research', kind: 'pack', trust: 'verified', installed: true, installable: false });
  });

  it('connectors federate as NON-installable with the Connector Hub deep link (A5 honesty)', () => {
    const conn: ConnectorDefinition = {
      id: 'github', name: 'GitHub', description: 'Code', service: 'github',
      authType: 'bearer', status: 'connected', capabilities: ['read'],
      substrate: 'waggle', tools: [], category: 'development',
    };
    const ext = fromConnector(conn);
    expect(ext).toMatchObject({
      id: 'connector:github', type: 'connector', installable: false,
      kind: 'federated', installed: true, source: 'local registry',
    });
    expect(ext.openIn).toEqual({ appId: 'connectors', label: 'Connector Hub' });
  });

  it('mcp catalog rows deep-link to the MCP Hub instead of faking a direct install', () => {
    const ext = fromMcpCatalogRow({ id: 'postgres', name: 'PostgreSQL', description: '', category: 'Database', installed: false });
    expect(ext.installable).toBe(false);
    expect(ext.openIn?.appId).toBe('mcp-hub');
    expect(ext.lifecycle).toBe('available');
  });

  it('personas, models and templates are local — always installed, never installable', () => {
    const agent = fromPersona({ id: 'researcher', name: 'Researcher', description: 'Deep research' });
    const model = fromModel('claude-fable-5');
    const tpl = fromTemplate({
      id: 't1', name: 'Research', description: '', persona: 'researcher',
      connectors: [], suggestedCommands: [], starterMemory: [], builtIn: true,
    });
    for (const ext of [agent, model, tpl]) {
      expect(ext.installed).toBe(true);
      expect(ext.installable).toBe(false);
      expect(ext.kind).toBe('federated');
    }
    expect(agent.openIn?.appId).toBe('agents');
    expect(model.openIn?.appId).toBe('settings');
  });
});

describe('filterExtensions / sortExtensions', () => {
  const list = [
    fromModel('zeta-model'),
    fromMarketplacePackage({ id: 1, name: 'alpha-skill', description: 'first', type: 'skill', installed: false }),
    fromMarketplacePackage({ id: 2, name: 'beta-skill', description: 'scraper tool', type: 'skill', installed: false }),
  ];

  it('filters case-insensitively across name and description', () => {
    expect(filterExtensions(list, 'SCRAPER').map(e => e.name)).toEqual(['beta-skill']);
    expect(filterExtensions(list, '')).toHaveLength(3);
  });

  it('sorts available before installed, then by name, without mutating the input', () => {
    const sorted = sortExtensions(list);
    expect(sorted.map(e => e.name)).toEqual(['alpha-skill', 'beta-skill', 'zeta-model']);
    expect(list[0].name).toBe('zeta-model'); // input untouched (immutability)
  });

  it('tolerates rows whose name/description went missing (raw-envelope defensiveness)', () => {
    const broken = [
      { ...fromModel('a-model'), name: undefined, description: undefined },
      fromModel('b-model'),
    ] as unknown as Extension[];
    expect(() => sortExtensions(broken)).not.toThrow();
    expect(() => filterExtensions(broken, 'b')).not.toThrow();
    expect(filterExtensions(broken, 'b-model')).toHaveLength(1);
  });
});
