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

function createTestServer(db: MindDB, wsDbs: Record<string, MindDB> = {}) {
  const server = Fastify({ logger: false });
  server.decorate('multiMind', {
    personal: db,
    getFrameStore: (label: string) => (label === 'personal' ? new FrameStore(db) : undefined),
    search: () => [],
    workspace: undefined,
    setWorkspace: () => {},
  });
  server.decorate('agentState', {
    getWorkspaceMindDb: (id: string) => wsDbs[id],
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

describe('Memory Center two-mind split — GET /api/memory?mind= (P3/D2)', () => {
  let personalDb: MindDB;
  let wsDb: MindDB;
  let server: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    personalDb = new MindDB(':memory:');
    wsDb = new MindDB(':memory:');
    server = createTestServer(personalDb, { 'ws-1': wsDb });
    // Seed one frame per mind through the route itself (workspace targeting via
    // the create body), so normalization paths match production.
    const p = await server.inject({
      method: 'POST', url: '/api/memory',
      payload: { content: 'Personal-mind fact about Marko.', kind: 'fact' },
    });
    expect(p.statusCode).toBe(200);
    const w = await server.inject({
      method: 'POST', url: '/api/memory',
      payload: { content: 'Workspace-mind fact about the GTM project.', kind: 'fact', workspace: 'ws-1' },
    });
    expect(w.statusCode).toBe(200);
  });

  afterEach(async () => {
    await server.close();
    personalDb.close();
    wsDb.close();
  });

  it('mind=personal returns only personal-mind memories (no workspaceId)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/memory?mind=personal&workspace=ws-1' });
    expect(res.statusCode).toBe(200);
    const { results } = res.json();
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('Personal-mind');
    expect(results[0].workspaceId).toBeUndefined();
  });

  it('mind=workspace returns only that workspace mind (workspaceId stamped)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/memory?mind=workspace&workspace=ws-1' });
    expect(res.statusCode).toBe(200);
    const { results } = res.json();
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('Workspace-mind');
    expect(results[0].workspaceId).toBe('ws-1');
  });

  it('mind=workspace without a workspace param is a 400 (not a silent merge)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/memory?mind=workspace' });
    expect(res.statusCode).toBe(400);
  });

  it('an invalid mind value is a 400 (not a silent merge)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/memory?mind=personl&workspace=ws-1' });
    expect(res.statusCode).toBe(400);
  });

  it('omitting mind keeps the legacy merge (back-compat pin)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/memory?workspace=ws-1' });
    expect(res.statusCode).toBe(200);
    const { results } = res.json();
    expect(results).toHaveLength(2);
    const minds = results.map((m: { workspaceId?: string }) => m.workspaceId ?? 'personal').sort();
    expect(minds).toEqual(['personal', 'ws-1']);
  });

  it('mind=workspace with an unknown workspace returns empty, not personal fallback', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/memory?mind=workspace&workspace=nope' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ results: [], count: 0 });
  });

  // ── Mind-strict mutations (P3 review HIGH) ────────────────────────────────
  // Frame ids collide across the per-mind SQLite stores. Without mind, the
  // legacy resolver falls through workspace→personal on a miss — for mutations
  // that means a stale workspace id can hard-delete/patch an UNRELATED personal
  // frame. With mind declared, resolution must be strict: hit or 404.

  async function workspaceMemoryId(): Promise<string> {
    const res = await server.inject({ method: 'GET', url: '/api/memory?mind=workspace&workspace=ws-1' });
    return res.json().results[0].id;
  }

  it('PATCH/archive/DELETE with mind=workspace operate on the workspace mind (the 404 class this phase fixes)', async () => {
    const id = await workspaceMemoryId();

    const patched = await server.inject({
      method: 'PATCH', url: `/api/memory/${id}?workspace=ws-1&mind=workspace`,
      payload: { kind: 'decision' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().kind).toBe('decision');
    expect(patched.json().workspaceId).toBe('ws-1');

    const archived = await server.inject({
      method: 'POST', url: `/api/memory/${id}/archive?workspace=ws-1&mind=workspace`,
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json().status).toBe('archived');

    const deleted = await server.inject({
      method: 'DELETE', url: `/api/memory/${id}?workspace=ws-1&mind=workspace`,
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().deleted).toBe(true);
  });

  it('mind=workspace mutations 404 on a personal-only id — the personal frame survives (HIGH pin)', async () => {
    // A second personal memory whose id does NOT exist in the workspace store.
    const extra = await server.inject({
      method: 'POST', url: '/api/memory',
      payload: { content: 'Second personal-only fact.', kind: 'fact' },
    });
    const personalOnlyId = extra.json().id;

    const del = await server.inject({
      method: 'DELETE', url: `/api/memory/${personalOnlyId}?workspace=ws-1&mind=workspace`,
    });
    expect(del.statusCode).toBe(404);
    const patch = await server.inject({
      method: 'PATCH', url: `/api/memory/${personalOnlyId}?workspace=ws-1&mind=workspace`,
      payload: { status: 'deprecated' },
    });
    expect(patch.statusCode).toBe(404);

    // The colliding personal frame is untouched.
    const intact = await server.inject({ method: 'GET', url: `/api/memory/${personalOnlyId}` });
    expect(intact.statusCode).toBe(200);
    expect(intact.json().content).toContain('Second personal-only');
    expect(intact.json().status).toBe('active');
  });

  it('merge with mind=workspace never resolves the id set in the personal store', async () => {
    const a = await server.inject({ method: 'POST', url: '/api/memory', payload: { content: 'P-A', kind: 'fact' } });
    const b = await server.inject({ method: 'POST', url: '/api/memory', payload: { content: 'P-B', kind: 'fact' } });
    const res = await server.inject({
      method: 'POST', url: '/api/memory/merge',
      payload: { ids: [a.json().id, b.json().id], workspace: 'ws-1', mind: 'workspace' },
    });
    expect(res.statusCode).toBe(404);
    // Originals not archived by the failed merge.
    const origA = await server.inject({ method: 'GET', url: `/api/memory/${a.json().id}` });
    expect(origA.json().status).toBe('active');
  });

  it('mutation routes 400 on an invalid mind or workspace-less mind=workspace', async () => {
    const id = await workspaceMemoryId();
    expect((await server.inject({ method: 'DELETE', url: `/api/memory/${id}?workspace=ws-1&mind=bogus` })).statusCode).toBe(400);
    expect((await server.inject({ method: 'DELETE', url: `/api/memory/${id}?mind=workspace` })).statusCode).toBe(400);
  });

  it('WITHOUT mind, the legacy ordered fall-through is preserved (back-compat pin)', async () => {
    // Personal-only id + workspace param, no mind → resolves in personal
    // (documented legacy semantics; the new UI always declares mind).
    const extra = await server.inject({
      method: 'POST', url: '/api/memory',
      payload: { content: 'Legacy fall-through target.', kind: 'fact' },
    });
    const personalOnlyId = extra.json().id;
    const patched = await server.inject({
      method: 'PATCH', url: `/api/memory/${personalOnlyId}?workspace=ws-1`,
      payload: { kind: 'learning' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().workspaceId).toBeUndefined(); // resolved in personal
  });
});
