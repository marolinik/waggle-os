/**
 * Mind-isolation contract for GET /api/memory/stats (founder directive
 * 2026-06-12): workspace minds are SEPARATE stores — no leakage between
 * users. The default response counts the personal mind only; the cross-mind
 * aggregate is explicit opt-in (?scope=all-minds), counts-only, and exists
 * solely for the single-user loopback sidecar.
 */
import { describe, it, expect, afterEach } from 'vitest';
import Fastify from 'fastify';
import { MindDB, FrameStore, SessionStore } from '@waggle/core';
import { memoryRoutes } from '../../src/local/routes/memory.js';

function seedFrames(db: MindDB, contents: string[]) {
  const sessions = new SessionStore(db);
  const gop = sessions.create().gop_id;
  const frames = new FrameStore(db);
  for (const c of contents) frames.createIFrame(gop, c);
}

describe('GET /api/memory/stats — mind isolation', () => {
  let dbs: MindDB[] = [];
  let server: ReturnType<typeof Fastify>;

  afterEach(async () => {
    await server.close();
    for (const db of dbs) db.close();
    dbs = [];
  });

  function boot() {
    const personal = new MindDB(':memory:');
    const wsA = new MindDB(':memory:');
    const wsB = new MindDB(':memory:');
    dbs = [personal, wsA, wsB];
    seedFrames(personal, ['A personal memory that is long enough to count.']);
    seedFrames(wsA, ['Workspace A memory one is long enough.', 'Workspace A memory two is long enough.']);
    seedFrames(wsB, ['Workspace B memory one is long enough.']);

    server = Fastify({ logger: false });
    server.decorate('multiMind', {
      personal,
      workspace: undefined,
      setWorkspace: () => {},
      getFrameStore: (scope: string) => (scope === 'personal' ? new FrameStore(personal) : undefined),
      search: () => [],
    });
    server.decorate('agentState', {
      getWorkspaceMindDb: (id: string) => (id === 'ws-a' ? wsA : id === 'ws-b' ? wsB : undefined),
      activateWorkspaceMind: () => true,
    });
    server.decorate('workspaceManager', {
      list: () => [
        { id: 'ws-a', name: 'A', group: 'Personal' },
        { id: 'ws-b', name: 'B', group: 'Personal' },
      ],
      get: () => undefined,
    });
    server.register(memoryRoutes);
  }

  it('default response counts the personal mind ONLY — no silent cross-mind mixing', async () => {
    boot();
    const res = await server.inject({ method: 'GET', url: '/api/memory/stats' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.personal.frameCount).toBe(1);
    expect(body.total.frameCount).toBe(1);
    expect(body.workspace).toBeNull();
  });

  it('?scope=all-minds aggregates counts across the local user’s minds, opt-in only', async () => {
    boot();
    const res = await server.inject({ method: 'GET', url: '/api/memory/stats?scope=all-minds' });
    const body = res.json();
    expect(body.personal.frameCount).toBe(1);
    expect(body.total.frameCount).toBe(4); // 1 personal + 2 wsA + 1 wsB
  });

  it('an explicit workspaceId scopes to that single workspace mind', async () => {
    boot();
    const res = await server.inject({ method: 'GET', url: '/api/memory/stats?workspaceId=ws-a' });
    const body = res.json();
    expect(body.workspace.frameCount).toBe(2);
    expect(body.total.frameCount).toBe(3); // personal + ws-a only
  });
});
