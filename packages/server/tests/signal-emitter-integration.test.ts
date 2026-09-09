/**
 * AI-OS Phase 1D — end-to-end integration test for the shim signal
 * emitter against a real local Waggle sidecar.
 *
 * Lives in the server tests (not shim-core) because importing
 * @waggle/server from shim-core would invert the dependency
 * direction. The emitter is consumed via @waggle/hive-mind-shim-core
 * just like a real hook package would.
 *
 * What this catches:
 *   - Schema drift between emitter body and server zod schema
 *   - URL path drift
 *   - HTTP semantics (status codes, response shape)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { MindDB, FrameStore, SessionStore } from '@waggle/core';
import { emitSignalToWaggleDance } from '@waggle/hive-mind-shim-core';
import { buildLocalServer } from '../src/local/index.js';

function createTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `waggle-shim-int-${prefix}-`));
}

function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

describe('emitSignalToWaggleDance — real sidecar round-trip', () => {
  let server: FastifyInstance;
  let baseUrl: string;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = createTmpDir('emit');
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s = sessions.create('emit-int-test');
    frames.createIFrame(s.gop_id, 'emit-int-test seed', 'normal');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });
    // Bind to a random local port so we don't collide with any
    // running sidecar on 3333.
    baseUrl = await server.listen({ host: '127.0.0.1', port: 0 });
  }, 30_000);

  afterAll(async () => {
    if (server) await server.close();
    if (tmpDir) cleanupDir(tmpDir);
  });

  it('round-trips a discovery signal through the real route', async () => {
    const out = await emitSignalToWaggleDance({
      type: 'broadcast',
      subtype: 'discovery',
      senderId: 'shim-int-test',
      content: { tool: 'claude-code', topic: 'integration roundtrip' },
      url: baseUrl,
    });
    expect(out).not.toBeNull();
    expect(out!.id).toBeTruthy();
    expect(out!.teamId).toBe('personal::shim-int-test');
    expect(out!.subtype).toBe('discovery');
    expect((out!.content as Record<string, unknown>).tool).toBe('claude-code');
  });

  it('round-trips a knowledge_match response with referenceId', async () => {
    const out = await emitSignalToWaggleDance({
      type: 'response',
      subtype: 'knowledge_match',
      senderId: 'cursor',
      referenceId: 'parent-msg-id',
      content: { matched: ['e1', 'e2'], confidence: 0.91 },
      url: baseUrl,
    });
    expect(out).not.toBeNull();
    expect(out!.referenceId).toBe('parent-msg-id');
  });

  it('returns null when sidecar URL points to a closed port (fail-open)', async () => {
    const out = await emitSignalToWaggleDance({
      type: 'broadcast',
      subtype: 'discovery',
      content: {},
      url: 'http://127.0.0.1:1', // closed
      timeoutMs: 200,
      onWarn: () => {
        /* swallow for clean test output */
      },
    });
    expect(out).toBeNull();
  });
});
