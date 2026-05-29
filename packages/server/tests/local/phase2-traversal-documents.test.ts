import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { documentRoutes } from '../../src/local/routes/documents.js';

/**
 * R2-005 regression — path traversal via the workspace :id param and the
 * document :name segment in documents.ts. A malicious segment must be
 * rejected with 400 BEFORE it reaches the workspaces/<id>/documents.json
 * filesystem path; a normal segment must pass the guard.
 */

async function buildServer(): Promise<FastifyInstance> {
  const s = Fastify({ logger: false });
  await s.register(documentRoutes);
  await s.ready();
  return s;
}

describe('R2-005 documents.ts path-traversal guard', () => {
  let server: FastifyInstance;

  afterEach(async () => {
    if (server) await server.close();
  });

  it('rejects a traversal :id on GET list with 400', async () => {
    server = await buildServer();
    const res = await server.inject({
      method: 'GET',
      url: '/api/workspaces/..%2f..%2fevil/documents',
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a traversal :id on POST register with 400', async () => {
    server = await buildServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/workspaces/..%2fevil/documents',
      payload: { name: 'doc', path: '/tmp/doc.txt' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a traversal document name on POST register with 400, writing NO out-of-root file', async () => {
    server = await buildServer();
    const evilName = '..%2f..%2fevil';
    const res = await server.inject({
      method: 'POST',
      url: '/api/workspaces/ws-safe/documents',
      payload: { name: '../../evil', path: '/tmp/doc.txt' },
    });
    expect(res.statusCode).toBe(400);

    // Confirm no registry file leaked outside the workspace root.
    const outOfRoot = path.join(os.homedir(), '.waggle', 'evil');
    expect(fs.existsSync(outOfRoot)).toBe(false);
    expect(evilName).toContain('evil'); // keep the literal in scope
  });

  it('rejects a traversal :id on GET versions with 400', async () => {
    server = await buildServer();
    const res = await server.inject({
      method: 'GET',
      url: '/api/workspaces/..%2fevil/documents/doc/versions',
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a traversal :name on GET versions with 400', async () => {
    server = await buildServer();
    const res = await server.inject({
      method: 'GET',
      url: '/api/workspaces/ws-safe/documents/..%2f..%2fevil/versions',
    });
    expect(res.statusCode).toBe(400);
  });

  it('does NOT reject a valid :id on GET list', async () => {
    server = await buildServer();
    const res = await server.inject({
      method: 'GET',
      url: '/api/workspaces/ws-valid_1/documents',
    });
    expect(res.statusCode).not.toBe(400);
  });

  it('does NOT reject a valid :id + :name on GET versions', async () => {
    server = await buildServer();
    const res = await server.inject({
      method: 'GET',
      url: '/api/workspaces/ws-valid_1/documents/my-doc_v1/versions',
    });
    expect(res.statusCode).not.toBe(400);
  });
});
