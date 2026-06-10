/**
 * Extend-layer shared routes (Phase 4, S21 / C18):
 *   GET /api/marketplace      — bare alias of /search with the B7 six-domain
 *                               type facet (A5 federate-at-read honesty)
 *   GET /api/extend/audit     — ONE shared install-audit feed with
 *                               ?type= / ?capability= / ?limit= filters
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { MindDB, InstallAuditStore, type RecordAuditInput } from '@waggle/core';
import { extendRoutes } from '../../src/local/routes/extend.js';
import { marketplaceRoutes } from '../../src/local/routes/marketplace.js';

describe('Extend routes (Phase 4)', () => {
  let db: MindDB;
  let auditStore: InstallAuditStore;
  let server: ReturnType<typeof Fastify>;

  function seed(overrides: Partial<RecordAuditInput> & Pick<RecordAuditInput, 'capabilityName' | 'capabilityType'>) {
    auditStore.record({
      source: overrides.capabilityType,
      riskLevel: 'low',
      trustSource: 'local_user',
      approvalClass: 'standard',
      action: 'installed',
      initiator: 'user',
      detail: '',
      ...overrides,
    });
  }

  beforeEach(async () => {
    db = new MindDB(':memory:');
    auditStore = new InstallAuditStore(db);

    server = Fastify({ logger: false });
    server.decorate('localConfig', { dataDir: '' } as never);
    server.decorate('auditStore', auditStore as never);
    server.decorate('marketplace', null as never); // search → 503 passthrough
    await server.register(marketplaceRoutes);
    await server.register(extendRoutes);
  });

  afterEach(async () => {
    await server.close();
    db.close();
  });

  // ── GET /api/marketplace (bare alias) ──────────────────────────────────

  it('rejects a type outside the B7 six-domain union', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/marketplace?type=external_tool' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('skill, agent, connector, mcp, model, template');
  });

  it('answers non-marketplace-backed domains with an honest empty envelope (A5)', async () => {
    for (const t of ['agent', 'model', 'template', 'connector']) {
      const res = await server.inject({ method: 'GET', url: `/api/marketplace?type=${t}` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ packages: [], total: 0, federated: true });
    }
  });

  it('delegates marketplace-backed domains to /api/marketplace/search (503 passthrough without db)', async () => {
    const bare = await server.inject({ method: 'GET', url: '/api/marketplace' });
    expect(bare.statusCode).toBe(503); // the REAL search handler answered
    expect(bare.json().error).toBe('Marketplace not available');

    const typed = await server.inject({ method: 'GET', url: '/api/marketplace?type=mcp&query=git' });
    expect(typed.statusCode).toBe(503);
  });

  // ── GET /api/extend/audit (C18) ────────────────────────────────────────

  it('returns recent entries across all types by default (camelCased shape)', async () => {
    seed({ capabilityName: 'a-skill', capabilityType: 'skill' });
    seed({ capabilityName: 'a-server', capabilityType: 'mcp' });
    seed({ capabilityName: 'a-conn', capabilityType: 'connector', action: 'rejected' });

    const res = await server.inject({ method: 'GET', url: '/api/extend/audit' });
    expect(res.statusCode).toBe(200);
    const { entries } = res.json();
    expect(entries).toHaveLength(3);
    // Most recent first + the same projection /api/audit/installs uses
    expect(entries[0]).toMatchObject({
      capabilityName: 'a-conn',
      capabilityType: 'connector',
      action: 'rejected',
      riskLevel: 'low',
      initiator: 'user',
    });
  });

  it('?type= filters to one capability type (serves S06/S07/S08/S21 from one route)', async () => {
    seed({ capabilityName: 'a-skill', capabilityType: 'skill' });
    seed({ capabilityName: 'srv-1', capabilityType: 'mcp' });
    seed({ capabilityName: 'srv-2', capabilityType: 'mcp' });

    const res = await server.inject({ method: 'GET', url: '/api/extend/audit?type=mcp' });
    const { entries } = res.json();
    expect(entries).toHaveLength(2);
    expect(entries.map((e: { capabilityName: string }) => e.capabilityName)).toEqual(['srv-2', 'srv-1']);

    const none = await server.inject({ method: 'GET', url: '/api/extend/audit?type=plugin' });
    expect(none.json().entries).toEqual([]);
  });

  it('?capability= filters by name; ?limit= caps the result', async () => {
    seed({ capabilityName: 'github', capabilityType: 'connector', action: 'installed' });
    seed({ capabilityName: 'github', capabilityType: 'connector', action: 'rejected' });
    seed({ capabilityName: 'slack', capabilityType: 'connector' });

    const byCap = await server.inject({ method: 'GET', url: '/api/extend/audit?capability=github' });
    expect(byCap.json().entries).toHaveLength(2);

    const limited = await server.inject({ method: 'GET', url: '/api/extend/audit?capability=github&limit=1' });
    expect(limited.json().entries).toHaveLength(1);
    expect(limited.json().entries[0].action).toBe('rejected'); // most recent

    const typeLimited = await server.inject({ method: 'GET', url: '/api/extend/audit?type=connector&limit=2' });
    expect(typeLimited.json().entries).toHaveLength(2);
  });

  it('rejects an unknown audit type with 400', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/extend/audit?type=banana' });
    expect(res.statusCode).toBe(400);
  });

  it('?capability= ANDs with ?type= — cross-type name collisions stay scoped', async () => {
    // 'github' is simultaneously a connector id and an MCP package name in
    // the shipped seeds — a connector-scoped feed must not leak MCP rows.
    seed({ capabilityName: 'github', capabilityType: 'connector', action: 'installed' });
    seed({ capabilityName: 'github', capabilityType: 'mcp', action: 'installed' });
    seed({ capabilityName: 'github', capabilityType: 'connector', action: 'rejected' });

    const conn = await server.inject({ method: 'GET', url: '/api/extend/audit?type=connector&capability=github' });
    const { entries } = conn.json();
    expect(entries).toHaveLength(2);
    expect(entries.every((e: { capabilityType: string }) => e.capabilityType === 'connector')).toBe(true);

    const mcp = await server.inject({ method: 'GET', url: '/api/extend/audit?type=mcp&capability=github' });
    expect(mcp.json().entries).toHaveLength(1);
    expect(mcp.json().entries[0].capabilityType).toBe('mcp');
  });

  it('clamps ?limit= on both ends (negative LIMIT means "unlimited" in SQLite)', async () => {
    for (let i = 0; i < 5; i++) seed({ capabilityName: `cap-${i}`, capabilityType: 'skill' });

    const negative = await server.inject({ method: 'GET', url: '/api/extend/audit?limit=-1' });
    expect(negative.json().entries).toHaveLength(1); // floored at 1, not the whole table

    const negativeTyped = await server.inject({ method: 'GET', url: '/api/extend/audit?type=skill&limit=-5' });
    expect(negativeTyped.json().entries).toHaveLength(1);

    const huge = await server.inject({ method: 'GET', url: '/api/extend/audit?limit=999' });
    expect(huge.json().entries).toHaveLength(5); // capped at 100; table has 5
  });
});
