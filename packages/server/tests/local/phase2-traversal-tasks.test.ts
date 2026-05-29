import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { taskRoutes } from '../../src/local/routes/tasks.js';

// R6-002: the /api/workspaces/:id/tasks handlers used the :id route param
// directly in the tasks filesystem path (mkdir + write + read) with no
// validation, enabling directory-creation + write traversal. assertSafeSegment
// is now called at the top of every handler that uses :id in a path.

function buildServer(dataDir: string): FastifyInstance {
  const server = Fastify({ logger: false });
  // taskRoutes only needs localConfig.dataDir for the workspace-scoped routes.
  server.decorate('localConfig', { dataDir } as any);
  server.register(taskRoutes);
  return server;
}

describe('tasks routes — path traversal guard (R6-002)', () => {
  let dataDir: string;
  let server: FastifyInstance;

  beforeEach(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-tasks-test-'));
    server = buildServer(dataDir);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('GET rejects a traversal :id with 400', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/workspaces/..%2f..%2fevil/tasks',
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST rejects a traversal :id with 400 and writes NO out-of-root file', async () => {
    // Sentinel: a sibling of dataDir that a successful traversal would create.
    const escapeTarget = path.join(path.dirname(dataDir), 'evil');

    const res = await server.inject({
      method: 'POST',
      url: '/api/workspaces/..%2f..%2fevil/tasks',
      payload: { title: 'pwned' },
    });

    expect(res.statusCode).toBe(400);
    // No directory should have been created outside the data root.
    expect(fs.existsSync(escapeTarget)).toBe(false);
    expect(fs.existsSync(path.join(escapeTarget, 'tasks.jsonl'))).toBe(false);
  });

  it('PATCH rejects a traversal :id with 400', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/workspaces/..%2fevil/tasks/some-task',
      payload: { status: 'done' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('DELETE rejects a traversal :id with 400', async () => {
    const res = await server.inject({
      method: 'DELETE',
      url: '/api/workspaces/..%2fevil/tasks/some-task',
    });
    expect(res.statusCode).toBe(400);
  });

  it('accepts a normal valid :id (POST is NOT rejected as 400)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/workspaces/my-workspace_01/tasks',
      payload: { title: 'real task' },
    });
    // 201 Created on success — and definitely not the 400 traversal rejection.
    expect(res.statusCode).not.toBe(400);
    expect(res.statusCode).toBe(201);
    // The task file lands inside the data root, not outside it.
    expect(
      fs.existsSync(path.join(dataDir, 'workspaces', 'my-workspace_01', 'tasks.jsonl')),
    ).toBe(true);
  });

  it('GET accepts a normal valid :id (NOT 400)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/workspaces/my-workspace_01/tasks',
    });
    expect(res.statusCode).not.toBe(400);
    expect(res.statusCode).toBe(200);
  });
});
