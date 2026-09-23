/**
 * Which session a directly saved memory joins (R-3).
 *
 * The memory write routes attach a new frame to the most recent active
 * session, creating one when none is active. These pins hold that choice
 * while the routes stop loading every active session to use the first.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { MindDB, FrameStore, SessionStore } from '@waggle/core';
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
  } as unknown as FastifyInstance['multiMind']);
  server.decorate('agentState', {
    getWorkspaceMindDb: () => undefined,
    listWorkspaces: () => [],
  } as unknown as FastifyInstance['agentState']);
  server.register(memoryRoutes);
  server.register(memoryCenterRoutes);
  return server;
}

/** Inserts a session with an explicit start time, so ordering does not depend on the clock. */
function seedSession(db: MindDB, gopId: string, status: 'active' | 'closed', startedAt: string): void {
  db.getDatabase().prepare(
    'INSERT INTO sessions (gop_id, status, started_at) VALUES (?, ?, ?)',
  ).run(gopId, status, startedAt);
}

function latestFrameGop(db: MindDB): string {
  const row = db.getDatabase().prepare(
    'SELECT gop_id FROM memory_frames ORDER BY id DESC LIMIT 1',
  ).get() as { gop_id: string };
  return row.gop_id;
}

const WRITES = [
  { name: 'POST /api/memory/frames', url: '/api/memory/frames', payload: { content: 'The launch review moved to Thursday.' } },
  { name: 'POST /api/quick-capture', url: '/api/quick-capture', payload: { content: 'Call the notary about the lease.' } },
  { name: 'POST /api/memory', url: '/api/memory', payload: { content: 'The Belgrade office opens at nine.' } },
] as const;

describe('memory writes pick the most recent active session', () => {
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

  it.each(WRITES)('$name joins the newest active session, not a newer closed one', async ({ url, payload }) => {
    seedSession(db, 'session:older', 'active', '2026-01-01 09:00:00');
    seedSession(db, 'session:newer', 'active', '2026-03-01 09:00:00');
    seedSession(db, 'session:closed', 'closed', '2026-06-01 09:00:00');

    const res = await server.inject({ method: 'POST', url, payload });

    expect(res.statusCode).toBe(200);
    expect(latestFrameGop(db)).toBe('session:newer');
  });

  it.each(WRITES)('$name opens exactly one session when none is active', async ({ url, payload }) => {
    seedSession(db, 'session:closed', 'closed', '2026-06-01 09:00:00');

    const res = await server.inject({ method: 'POST', url, payload });

    expect(res.statusCode).toBe(200);
    const active = new SessionStore(db).getActive();
    expect(active).toHaveLength(1);
    expect(latestFrameGop(db)).toBe(active[0].gop_id);
  });
});
