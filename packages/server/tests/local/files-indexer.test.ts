/**
 * File Indexer Integration Tests (L-20)
 *
 * Verifies that file-route mutations call into the workspace mind's FileIndexer:
 *   POST /upload (base64 JSON path) indexes a new .md/.txt
 *   POST /delete removes the index row + frame
 *   POST /move updates the index row path
 *   POST /copy indexes the destination
 *
 * The indexer itself is unit-tested in packages/core/tests/file-indexer.test.ts —
 * this file only confirms the wiring.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { MindDB, SessionStore, FrameStore, FileIndexer } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth } from '../test-utils.js';

describe('File Indexer — integration with /files routes (L-20)', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  let workspaceId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-files-indexer-'));
    const mind = new MindDB(path.join(tmpDir, 'personal.mind'));
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s = sessions.create('files-indexer-seed');
    frames.createIFrame(s.gop_id, 'seed', 'normal');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });

    const create = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/workspaces',
      payload: { name: 'Indexer test', group: 'Test' },
    });
    workspaceId = create.json().id;
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const prefix = () => `/api/workspaces/${workspaceId}/files`;

  /** Reach the same workspace mind the route handlers use (via mindCache). */
  function getIndexer(): FileIndexer {
    const mind = server.mindCache.getOrOpen(workspaceId);
    if (!mind) throw new Error('workspace mind unavailable');
    return new FileIndexer(mind);
  }

  function getFrameStore(): FrameStore {
    const mind = server.mindCache.getOrOpen(workspaceId);
    if (!mind) throw new Error('workspace mind unavailable');
    return new FrameStore(mind);
  }

  async function uploadViaJson(name: string, content: string, dir = '/notes') {
    return injectWithAuth(server, {
      method: 'POST',
      url: `${prefix()}/upload`,
      payload: { path: dir, name, data: Buffer.from(content).toString('base64') },
    });
  }

  it('indexes a .md file on upload', async () => {
    const res = await uploadViaJson('indexed.md', '# indexed\n\nbody text');
    expect(res.statusCode).toBe(201);

    const row = getIndexer().getRow('/notes/indexed.md');
    expect(row).toBeTruthy();
    expect(row!.frameId).toBeGreaterThan(0);
    const frame = getFrameStore().getById(row!.frameId);
    expect(frame?.content).toContain('# indexed');
    expect(frame?.content).toContain('/notes/indexed.md');
  });

  it('skips non-indexable extensions silently (pdf)', async () => {
    const res = await uploadViaJson('skipped.pdf', 'PDF bytes (fake)');
    expect(res.statusCode).toBe(201); // upload still works
    expect(getIndexer().getRow('/notes/skipped.pdf')).toBeNull();
  });

  it('removes the index row on delete', async () => {
    await uploadViaJson('doomed.md', 'bye');
    expect(getIndexer().getRow('/notes/doomed.md')).toBeTruthy();

    const del = await injectWithAuth(server, {
      method: 'POST',
      url: `${prefix()}/delete`,
      payload: { path: '/notes/doomed.md' },
    });
    expect(del.statusCode).toBe(204);

    expect(getIndexer().getRow('/notes/doomed.md')).toBeNull();
  });

  it('updates the path on move', async () => {
    await uploadViaJson('movable.md', 'contents');
    const move = await injectWithAuth(server, {
      method: 'POST',
      url: `${prefix()}/move`,
      payload: { from: '/notes/movable.md', to: '/notes/moved.md' },
    });
    expect(move.statusCode).toBe(200);

    const indexer = getIndexer();
    expect(indexer.getRow('/notes/movable.md')).toBeNull();
    expect(indexer.getRow('/notes/moved.md')).toBeTruthy();
  });

  it('indexes the destination on copy', async () => {
    await uploadViaJson('source.md', 'copy me');
    const copy = await injectWithAuth(server, {
      method: 'POST',
      url: `${prefix()}/copy`,
      payload: { from: '/notes/source.md', to: '/notes/copy.md' },
    });
    expect(copy.statusCode).toBe(200);

    const indexer = getIndexer();
    expect(indexer.getRow('/notes/source.md')).toBeTruthy();
    expect(indexer.getRow('/notes/copy.md')).toBeTruthy();
  });

  it('re-indexes on overwrite (upload same path with different content)', async () => {
    await uploadViaJson('overwrite.md', 'first');
    const firstRow = getIndexer().getRow('/notes/overwrite.md')!;

    await uploadViaJson('overwrite.md', 'second');
    const secondRow = getIndexer().getRow('/notes/overwrite.md')!;
    expect(secondRow.frameId).not.toBe(firstRow.frameId);
    expect(secondRow.contentHash).not.toBe(firstRow.contentHash);
  });

  it('skips re-indexing when content is unchanged', async () => {
    await uploadViaJson('same.md', 'same');
    const firstRow = getIndexer().getRow('/notes/same.md')!;

    await uploadViaJson('same.md', 'same');
    const secondRow = getIndexer().getRow('/notes/same.md')!;
    expect(secondRow.frameId).toBe(firstRow.frameId);
    expect(secondRow.contentHash).toBe(firstRow.contentHash);
  });
});
