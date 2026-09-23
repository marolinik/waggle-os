/**
 * Knowledge graph route projection — regression for the QA-polish P0
 * (2026-06-24). The route used to return raw SQLite rows
 * ({id, entity_type, name} / {id, source_id, target_id, relation_type}),
 * but the FE contract is KGNode {id,label,type} / KGEdge {source,target,
 * relationship}. The mismatch made every node render as type "Unknown" and
 * every edge fail the FE's `visibleNodeIds.has(e.source)` filter (undefined),
 * yielding "0 / 312 edges". The prior FE test only passed empty arrays, so
 * this shipped. This asserts the projected contract on real rows.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { MindDB } from '@waggle/core';
import type { MultiMind } from '@waggle/core';
import type { AgentState } from '../../src/local/index.js';
import { knowledgeRoutes } from '../../src/local/routes/knowledge.js';

function createTestServer(db: MindDB) {
  const server = Fastify({ logger: false });
  // Deliberate partial doubles: the knowledge route reads only these members.
  server.decorate('multiMind', { personal: db } as unknown as MultiMind);
  server.decorate('agentState', {
    getWorkspaceMindDb: () => undefined,
    listWorkspaces: () => [],
  } as unknown as AgentState);
  server.register(knowledgeRoutes);
  return server;
}

describe('Knowledge graph route projection (regression: raw-column passthrough)', () => {
  let db: MindDB;
  let server: ReturnType<typeof Fastify>;

  beforeEach(() => {
    db = new MindDB(':memory:');
    const raw = db.getDatabase();
    const e1 = raw
      .prepare('INSERT INTO knowledge_entities (entity_type, name) VALUES (?, ?)')
      .run('person', 'Marko');
    const e2 = raw
      .prepare('INSERT INTO knowledge_entities (entity_type, name) VALUES (?, ?)')
      .run('organization', 'Egzakta');
    raw
      .prepare('INSERT INTO knowledge_relations (source_id, target_id, relation_type) VALUES (?, ?, ?)')
      .run(e1.lastInsertRowid, e2.lastInsertRowid, 'works_at');
    server = createTestServer(db);
  });

  afterEach(async () => {
    await server.close();
    db.close();
  });

  it('projects raw rows to the FE KGNode/KGEdge contract', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/memory/graph?scope=personal' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      nodes: Array<{ id: string; label: string; type: string }>;
      edges: Array<{ source: string; target: string; relationship: string }>;
    };

    expect(body).toHaveProperty('nodes');
    expect(body).toHaveProperty('edges');
    expect(body.nodes).toHaveLength(2);
    expect(body.edges).toHaveLength(1);

    // Node contract: real label + real type (NOT the "unknown" fallback), id is string.
    const marko = body.nodes.find((n) => n.label === 'Marko');
    expect(marko).toBeDefined();
    expect(typeof marko!.id).toBe('string');
    expect(marko!.type).toBe('person');
    expect(marko as Record<string, unknown>).not.toHaveProperty('entity_type'); // raw column not leaked

    // Edge contract: source/target are string ids that resolve to nodes (the bug
    // was undefined source/target → FE drew 0 edges), relationship is set.
    const edge = body.edges[0];
    expect(typeof edge.source).toBe('string');
    expect(typeof edge.target).toBe('string');
    expect(edge.relationship).toBe('works_at');
    const ids = new Set(body.nodes.map((n) => n.id));
    expect(ids.has(edge.source)).toBe(true);
    expect(ids.has(edge.target)).toBe(true);
  });

  it('returns empty nodes/edges (not entities/relations) for an empty mind', async () => {
    const empty = new MindDB(':memory:');
    const s = createTestServer(empty);
    const res = await s.inject({ method: 'GET', url: '/api/memory/graph?scope=personal' });
    expect(res.json()).toEqual({ nodes: [], edges: [] });
    await s.close();
    empty.close();
  });
});
