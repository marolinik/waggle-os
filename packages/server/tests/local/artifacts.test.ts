/**
 * Artifact Center REST API Route Tests (UX-Refactor Phase 2C, S05).
 *
 * Covers the 6 artifact routes in artifacts.ts:
 *   GET    /api/artifacts                 list + facet filters (kind/status/tag/q)
 *   POST   /api/artifacts                 create (A6 artifacts.json index)
 *   GET    /api/artifacts/:id             one (resolves owning workspace)
 *   PATCH  /api/artifacts/:id             edit; Archive = status:'archived' (A8)
 *   DELETE /api/artifacts/:id             hard delete (A8)
 *   GET    /api/artifacts/search-related  federated (artifacts+memories+tasks)
 *
 * Uses a tmp `localConfig.dataDir` so the artifacts.json / tasks.jsonl writes are
 * isolated and cleaned up. A ':memory:' personal mind backs the memory federation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MindDB, FrameStore, SessionStore } from '@waggle/core';
import { artifactRoutes } from '../../src/local/routes/artifacts.js';

function createTestServer(db: MindDB, dataDir: string) {
  const server = Fastify({ logger: false });
  server.decorate('localConfig', { dataDir });
  server.decorate('workspaceManager', {
    list: () => [{ id: 'ws-test', name: 'Test Workspace' }],
  });
  server.decorate('agentState', {
    getWorkspaceMindDb: () => undefined,
    listWorkspaces: () => [],
  });
  server.decorate('multiMind', { personal: db });
  server.register(artifactRoutes);
  return server;
}

describe('Artifact Center routes (Phase 2C)', () => {
  let db: MindDB;
  let dataDir: string;
  let server: ReturnType<typeof Fastify>;

  beforeEach(() => {
    dataDir = path.join(os.tmpdir(), `waggle-art-${randomUUID()}`);
    fs.mkdirSync(dataDir, { recursive: true });
    db = new MindDB(':memory:');
    server = createTestServer(db, dataDir);
  });

  afterEach(async () => {
    await server.close();
    db.close();
    // Best-effort: emitAuditEvent opens a long-lived audit.db connection (by
    // design — the sidecar keeps it open), so on Windows the file can still be
    // locked here. A temp-dir cleanup race must not fail a passing test; the OS
    // reclaims os.tmpdir().
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* audit.db handle may linger on Windows — ignore */
    }
  });

  async function createArtifact(body: Record<string, unknown>) {
    const res = await server.inject({ method: 'POST', url: '/api/artifacts', payload: body });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  it('boots and lists an empty index', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/artifacts' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ results: [], count: 0 });
  });

  it('POST creates an artifact with id/status/source defaults', async () => {
    const a = await createArtifact({ title: 'Q3 GTM Deck', kind: 'presentation', workspaceId: 'ws-test' });
    expect(a.id).toMatch(/^art_/);
    expect(a.kind).toBe('presentation');
    expect(a.status).toBe('draft');
    expect(a.source).toBe('user');
    expect(a.workspaceId).toBe('ws-test');
    expect(a.title).toBe('Q3 GTM Deck');
    expect(typeof a.createdAt).toBe('string');
  });

  it('GET list returns created artifacts; GET /:id fetches one', async () => {
    const a = await createArtifact({ title: 'Spec', kind: 'document', workspaceId: 'ws-test' });
    const list = await server.inject({ method: 'GET', url: '/api/artifacts' });
    expect(list.json().count).toBe(1);
    expect(list.json().results[0].id).toBe(a.id);

    const one = await server.inject({ method: 'GET', url: `/api/artifacts/${a.id}` });
    expect(one.statusCode).toBe(200);
    expect(one.json().id).toBe(a.id);
  });

  it('POST rejects missing title / missing workspaceId / invalid kind', async () => {
    expect((await server.inject({ method: 'POST', url: '/api/artifacts', payload: { kind: 'document', workspaceId: 'ws-test' } })).statusCode).toBe(400);
    expect((await server.inject({ method: 'POST', url: '/api/artifacts', payload: { title: 'X', kind: 'document' } })).statusCode).toBe(400);
    expect((await server.inject({ method: 'POST', url: '/api/artifacts', payload: { title: 'X', kind: 'nonsense', workspaceId: 'ws-test' } })).statusCode).toBe(400);
  });

  it('PATCH updates status + tags', async () => {
    const a = await createArtifact({ title: 'Report', kind: 'document', workspaceId: 'ws-test' });
    const res = await server.inject({
      method: 'PATCH', url: `/api/artifacts/${a.id}`,
      payload: { status: 'final', tags: ['gtm', 'q3'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('final');
    expect(res.json().tags).toEqual(['gtm', 'q3']);
  });

  it('PATCH rejects an invalid kind/status', async () => {
    const a = await createArtifact({ title: 'X', kind: 'document', workspaceId: 'ws-test' });
    expect((await server.inject({ method: 'PATCH', url: `/api/artifacts/${a.id}`, payload: { kind: 'bogus' } })).statusCode).toBe(400);
    expect((await server.inject({ method: 'PATCH', url: `/api/artifacts/${a.id}`, payload: { status: 'bogus' } })).statusCode).toBe(400);
  });

  it('Archive = reversible status:archived (A8), filterable by status', async () => {
    const a = await createArtifact({ title: 'Old deck', kind: 'presentation', workspaceId: 'ws-test' });
    const arch = await server.inject({ method: 'PATCH', url: `/api/artifacts/${a.id}`, payload: { status: 'archived' } });
    expect(arch.json().status).toBe('archived');

    expect((await server.inject({ method: 'GET', url: '/api/artifacts?status=draft' })).json().count).toBe(0);
    expect((await server.inject({ method: 'GET', url: '/api/artifacts?status=archived' })).json().count).toBe(1);

    const restore = await server.inject({ method: 'PATCH', url: `/api/artifacts/${a.id}`, payload: { status: 'draft' } });
    expect(restore.json().status).toBe('draft');
  });

  it('facet filters: kind / tag / q', async () => {
    await createArtifact({ title: 'Germany GTM Deck', kind: 'presentation', workspaceId: 'ws-test', tags: ['gtm'] });
    await createArtifact({ title: 'API Spec', kind: 'document', workspaceId: 'ws-test', tags: ['eng'] });

    expect((await server.inject({ method: 'GET', url: '/api/artifacts?kind=presentation' })).json().count).toBe(1);
    expect((await server.inject({ method: 'GET', url: '/api/artifacts?tag=eng' })).json().count).toBe(1);
    expect((await server.inject({ method: 'GET', url: '/api/artifacts?q=germany' })).json().count).toBe(1);
  });

  it('DELETE hard-deletes the index entry (A8 — no tombstone)', async () => {
    const a = await createArtifact({ title: 'Delete me', kind: 'document', workspaceId: 'ws-test' });
    const del = await server.inject({ method: 'DELETE', url: `/api/artifacts/${a.id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json().deleted).toBe(true);
    expect((await server.inject({ method: 'GET', url: `/api/artifacts/${a.id}` })).statusCode).toBe(404);
  });

  it('GET /:id 404s for an unknown id', async () => {
    expect((await server.inject({ method: 'GET', url: '/api/artifacts/art_unknown' })).statusCode).toBe(404);
  });

  it('search-related requires q', async () => {
    expect((await server.inject({ method: 'GET', url: '/api/artifacts/search-related' })).statusCode).toBe(400);
  });

  it('search-related federates artifacts + memories + tasks (agents empty in v1)', async () => {
    // artifact
    await createArtifact({ title: 'Germany GTM deck', kind: 'presentation', workspaceId: 'ws-test' });
    // memory in the personal mind
    const session = new SessionStore(db).ensureActive();
    new FrameStore(db).createIFrame(session.gop_id, 'Germany GTM strategy notes', 'normal', 'user_stated');
    // task in the workspace tasks.jsonl
    const wsDir = path.join(dataDir, 'workspaces', 'ws-test');
    fs.mkdirSync(wsDir, { recursive: true });
    const now = new Date().toISOString();
    fs.writeFileSync(
      path.join(wsDir, 'tasks.jsonl'),
      JSON.stringify({ id: 't1', title: 'Germany GTM follow-up', status: 'open', createdAt: now, updatedAt: now }) + '\n',
    );

    const res = await server.inject({ method: 'GET', url: '/api/artifacts/search-related?q=germany' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.artifacts.length).toBeGreaterThanOrEqual(1);
    expect(body.memories.length).toBeGreaterThanOrEqual(1);
    expect(body.tasks.length).toBeGreaterThanOrEqual(1);
    expect(body.agents).toEqual([]);
  });
});
