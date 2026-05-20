/**
 * AI-OS Phase 0 — integration test for the tool-detection route.
 *
 * Boots a real local server (with the same fixture pattern used by
 * cross-platform.test.ts) and hits GET /api/tools/detect end-to-end.
 *
 * The detector itself is exhaustively unit-tested with injected deps
 * in `packages/agent/tests/tool-detection.test.ts`. This test verifies
 * that:
 *   1. The route is wired into the local server.
 *   2. The response envelope shape matches the shared contract.
 *   3. Every SUPPORTED_TOOLS id appears in the response.
 *
 * We deliberately do NOT assert on specific tool installation state
 * — that depends on the host machine running the tests and would
 * make the suite non-hermetic. We also do not assert on auth
 * rejection: the local sidecar is loopback-bound and intentionally
 * permits read-only in-process calls; tool detection reports only
 * what's already on the user's own machine and is not sensitive.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { MindDB, FrameStore, SessionStore } from '@waggle/core';
import { SUPPORTED_TOOLS } from '@waggle/shared';
import { buildLocalServer } from '../src/local/index.js';
import { injectWithAuth } from './test-utils.js';

function createTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `waggle-tools-${prefix}-`));
}

function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

describe('GET /api/tools/detect', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = createTmpDir('routes');
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s = sessions.create('tools-routes-test');
    frames.createIFrame(s.gop_id, 'tools-routes-test seed frame', 'normal');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });
    await server.ready();
  });

  afterAll(async () => {
    if (server) await server.close();
    if (tmpDir) cleanupDir(tmpDir);
  });

  it('returns 200 with a stable envelope shape', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/tools/detect',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('platform');
    expect(body).toHaveProperty('detectedAt');
    expect(body).toHaveProperty('tools');
    expect(Array.isArray(body.tools)).toBe(true);
  });

  it('covers every supported tool id in the envelope', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/tools/detect',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ids = body.tools.map((t: { id: string }) => t.id);
    for (const id of SUPPORTED_TOOLS) {
      expect(ids).toContain(id);
    }
  });

  it('each tool entry has the expected fields', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/tools/detect',
    });
    const body = res.json();
    for (const t of body.tools) {
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('displayName');
      expect(t).toHaveProperty('installed');
      expect(t).toHaveProperty('installedPath');
      expect(t).toHaveProperty('version');
      expect(t).toHaveProperty('hooksInstalled');
      expect(t).toHaveProperty('hookPointerPath');
      expect(typeof t.installed).toBe('boolean');
      expect(typeof t.hooksInstalled).toBe('boolean');
    }
  });

});
