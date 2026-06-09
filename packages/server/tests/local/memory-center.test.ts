/**
 * Memory Center REST API Route Tests (UX-Refactor Phase 2B.2)
 *
 * Covers the new shared-`Memory`-entity surface in memory-center.ts:
 *   GET    /api/memory            — list + filters (kind/status/scope/confidence)
 *   GET    /api/memory/:id        — one
 *   POST   /api/memory            — create (stamps metadata)
 *   PATCH  /api/memory/:id        — edit content/importance/classification
 *   POST   /api/memory/:id/archive — reversible Archive (A8)
 *   DELETE /api/memory/:id        — hard delete (A8)
 *   POST   /api/memory/merge      — concatenate + archive originals (C11)
 *
 * Registers memoryRoutes ALONGSIDE memoryCenterRoutes so a successful boot also
 * proves the two plugins do not collide on the /api/memory* namespace.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { MindDB, FrameStore } from '@waggle/core';
import { memoryRoutes } from '../../src/local/routes/memory.js';
import { memoryCenterRoutes } from '../../src/local/routes/memory-center.js';

function createTestServer(db: MindDB) {
  const server = Fastify({ logger: false });
  server.decorate('multiMind', {
    personal: db,
    getFrameStore: (label: string) => (label === 'personal' ? new FrameStore(db) : undefined),
    search: () => [],
    workspace: undefined,
    setWorkspace: () => {},
  });
  server.decorate('agentState', {
    getWorkspaceMindDb: () => undefined,
    listWorkspaces: () => [],
  });
  // localConfig intentionally absent → emitAuditEvent is a safe no-op.
  server.register(memoryRoutes);
  server.register(memoryCenterRoutes);
  return server;
}

describe('Memory Center routes (Phase 2B.2)', () => {
  let db: MindDB;
  let server: ReturnType<typeof Fastify>;

  beforeEach(() => {
    db = new MindDB(':memory:');
    server = createTestServer(db);
  });

  afterEach(async () => {
    await server.close();
    db.close();
  });

  async function createMemory(body: Record<string, unknown>) {
    const res = await server.inject({ method: 'POST', url: '/api/memory', payload: body });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  it('boots both memory plugins without a route collision', async () => {
    // A failed radix-tree merge throws at ready(); inject() triggers ready().
    const res = await server.inject({ method: 'GET', url: '/api/memory' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ results: [], count: 0 });
  });

  it('POST /api/memory creates a memory with stamped classification', async () => {
    const mem = await createMemory({
      content: 'KVARK pricing is consultative for enterprise.',
      kind: 'fact',
      scope: 'personal',
      tags: ['kvark', 'pricing'],
    });
    expect(mem.kind).toBe('fact');
    expect(mem.status).toBe('active');
    expect(mem.scope).toBe('personal');
    expect(mem.tags).toEqual(['kvark', 'pricing']);
    expect(mem.title).toContain('KVARK pricing');
    expect(typeof mem.id).toBe('string');
  });

  it('GET /api/memory lists created memories; GET /:id fetches one', async () => {
    const mem = await createMemory({ content: 'Ship Phase 2 by July.', kind: 'goal' });
    const list = await server.inject({ method: 'GET', url: '/api/memory' });
    expect(list.json().count).toBe(1);
    expect(list.json().results[0].kind).toBe('goal');

    const one = await server.inject({ method: 'GET', url: `/api/memory/${mem.id}` });
    expect(one.statusCode).toBe(200);
    expect(one.json().id).toBe(mem.id);
  });

  it('PATCH /api/memory/:id updates classification and content', async () => {
    const mem = await createMemory({ content: 'Draft preference.', kind: 'fact' });
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/memory/${mem.id}`,
      payload: { kind: 'preference', tags: ['ui'], status: 'active', title: 'My preference' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().kind).toBe('preference');
    expect(res.json().tags).toEqual(['ui']);
    expect(res.json().title).toBe('My preference');
  });

  it('PATCH rejects an invalid kind/status/importance', async () => {
    const mem = await createMemory({ content: 'X', kind: 'fact' });
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/memory/${mem.id}`,
      payload: { kind: 'nonsense' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /:id/archive sets a reversible archived status, filterable by status', async () => {
    const mem = await createMemory({ content: 'Old note.', kind: 'fact' });
    const arch = await server.inject({ method: 'POST', url: `/api/memory/${mem.id}/archive` });
    expect(arch.statusCode).toBe(200);
    expect(arch.json().status).toBe('archived');

    const active = await server.inject({ method: 'GET', url: '/api/memory?status=active' });
    expect(active.json().count).toBe(0);
    const archived = await server.inject({ method: 'GET', url: '/api/memory?status=archived' });
    expect(archived.json().count).toBe(1);

    // Reversible: PATCH back to active.
    const restore = await server.inject({
      method: 'PATCH',
      url: `/api/memory/${mem.id}`,
      payload: { status: 'active' },
    });
    expect(restore.json().status).toBe('active');
  });

  it('POST /api/memory/merge concatenates and archives the originals (C11)', async () => {
    const a = await createMemory({ content: 'Fact A about Germany GTM.', kind: 'fact' });
    const b = await createMemory({ content: 'Fact B about Germany GTM.', kind: 'fact' });
    const res = await server.inject({
      method: 'POST',
      url: '/api/memory/merge',
      payload: { ids: [a.id, b.id], title: 'Germany GTM (merged)' },
    });
    expect(res.statusCode).toBe(200);
    const merged = res.json();
    expect(merged.title).toBe('Germany GTM (merged)');
    expect(merged.content).toContain('Fact A');
    expect(merged.content).toContain('Fact B');
    expect(merged.relatedMemoryIds).toEqual([String(a.id), String(b.id)]);
    expect(merged.status).toBe('active');

    // Originals are archived, not deleted.
    const origA = await server.inject({ method: 'GET', url: `/api/memory/${a.id}` });
    expect(origA.statusCode).toBe(200);
    expect(origA.json().status).toBe('archived');
  });

  it('merge requires >= 2 ids', async () => {
    const a = await createMemory({ content: 'Lonely.', kind: 'fact' });
    const res = await server.inject({
      method: 'POST',
      url: '/api/memory/merge',
      payload: { ids: [a.id] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE /api/memory/:id hard-deletes (A8 — no tombstone)', async () => {
    const mem = await createMemory({ content: 'Delete me.', kind: 'fact' });
    const del = await server.inject({ method: 'DELETE', url: `/api/memory/${mem.id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json().deleted).toBe(true);

    const gone = await server.inject({ method: 'GET', url: `/api/memory/${mem.id}` });
    expect(gone.statusCode).toBe(404);
  });

  it('GET /api/memory/:id 404s for an unknown id; 400s for a non-numeric id', async () => {
    expect((await server.inject({ method: 'GET', url: '/api/memory/99999' })).statusCode).toBe(404);
    expect((await server.inject({ method: 'GET', url: '/api/memory/abc' })).statusCode).toBe(400);
  });
});
