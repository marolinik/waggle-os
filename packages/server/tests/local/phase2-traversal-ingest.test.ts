/**
 * Regression test for FINDING R1-004 (path traversal) —
 * POST /api/ingest builds a filesystem path from a `workspaceId` taken from the
 * request body. Without validation, a value like '../evil' escapes the
 * workspaces/ root when addToFileRegistry does
 *   path.join(dataDir, 'workspaces', workspaceId, 'files.jsonl').
 *
 * The fix adds assertSafeSegment(workspaceId, 'workspaceId') at the top of the
 * handler, before the value reaches any fs path. Fastify's default error handler
 * converts the thrown { statusCode: 400 } into a 400 response.
 *
 * This test registers ingestRoutes onto a bare Fastify instance with the minimal
 * decorators the route reads (localConfig.dataDir + agentState), then asserts:
 *   (a) a malicious workspaceId yields 400 and writes NOTHING outside the root, and
 *   (b) a normal valid workspaceId is NOT rejected.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ingestRoutes } from '../../src/local/routes/ingest.js';

function buildServer(dataDir: string): FastifyInstance {
  const s = Fastify({ logger: false });

  // Minimal decorators the ingest handler reads. The traversal guard fires
  // before any of these are touched; for the valid-path case the registry
  // write needs localConfig.dataDir and the memory block needs agentState.
  s.decorate('localConfig', { dataDir });
  s.decorate('agentState', {
    activateWorkspaceMind: () => {},
    orchestrator: {
      autoSaveFromExchange: async () => {},
    },
  });

  s.register(ingestRoutes);
  return s;
}

// A small valid base64 payload ("hi") for a supported text file.
const VALID_FILE = { name: 'note.txt', content: Buffer.from('hi').toString('base64') };

describe('R1-004 — POST /api/ingest path traversal guard', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-ingest-traversal-'));
    server = buildServer(tmpDir);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects a traversal workspaceId with 400 and writes nothing out of root', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/ingest',
      payload: { files: [VALID_FILE], workspaceId: '../evil' },
    });

    expect(res.statusCode).toBe(400);

    // The escaped path would be <tmpDir>/evil/files.jsonl (one level up from
    // <tmpDir>/workspaces). Confirm nothing was written outside the workspaces root.
    const escapedDir = path.join(tmpDir, 'evil');
    expect(fs.existsSync(escapedDir)).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'workspaces', '..', 'evil'))).toBe(false);
  });

  it('rejects an encoded-traversal workspaceId with 400', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/ingest',
      payload: { files: [VALID_FILE], workspaceId: '..%2f..%2fevil' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('does NOT reject a normal valid workspaceId', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/ingest',
      payload: { files: [VALID_FILE], workspaceId: 'workspace-123' },
    });

    expect(res.statusCode).not.toBe(400);
    expect(res.statusCode).toBe(200);

    // And the registry write landed UNDER the workspaces root, as expected.
    const registry = path.join(tmpDir, 'workspaces', 'workspace-123', 'files.jsonl');
    expect(fs.existsSync(registry)).toBe(true);
  });
});
