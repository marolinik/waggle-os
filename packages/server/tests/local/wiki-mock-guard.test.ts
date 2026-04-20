/**
 * M-11 BLOCKER-5 — wiki routes refuse to run with a mock embedder.
 *
 * The test server seeds no embedding API keys, so
 * `createEmbeddingProvider` falls back to the mock provider in its fallback
 * chain. Before this fix, wiki compile + health + the post-harvest recompile
 * hook all silently produced results using zero-vector embeddings (see
 * BUCKET-1 code review, BLOCKER-5). Now each endpoint must return an
 * explicit degraded-state signal instead.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, SessionStore, FrameStore } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

describe('Wiki routes + mock embedder guard (M-11)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-wiki-mock-guard-'));

    // Seed a harvest session + a couple of frames so the compile path has
    // data to work with (we want to prove compile SKIPS not "returns zero
    // because there's nothing to compile").
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    new SessionStore(mind).ensure('harvest', 'harvest', 'harvest session');
    const frames = new FrameStore(mind);
    frames.createIFrame('harvest', '[Harvest:test] User works at Egzakta Advisory.', 'normal', 'import');
    frames.createIFrame('harvest', '[Harvest:test] Partnered with Waggle OS team.', 'normal', 'import');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('server boots with mock embedder in the test env (baseline sanity)', () => {
    expect(server.embeddingProvider).toBeDefined();
    expect(server.embeddingProvider.getActiveProvider()).toBe('mock');
  });

  it('POST /api/wiki/compile returns 503 with skippedReason instead of compiling against mock vectors', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/wiki/compile',
      payload: { mode: 'incremental' },
    });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.skippedReason).toBe('no_real_embedder');
    expect(typeof body.error).toBe('string');
    expect(body.error).toMatch(/embedding provider/i);
  });

  it('GET /api/wiki/health returns 503 with skippedReason on mock-only env', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/wiki/health',
    });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.skippedReason).toBe('no_real_embedder');
  });

  it('POST /api/harvest/commit still succeeds but reports wikiSkippedReason = no_real_embedder', async () => {
    // A minimal chatgpt-style payload so the adapter has 1+ items.
    const payload = {
      source: 'chatgpt',
      data: [{
        title: 'Test chat',
        create_time: 1700000000,
        mapping: {
          n1: { message: { author: { role: 'user' }, content: { parts: ['Preference: VSCode with vim.'] }, create_time: 1700000001 } },
        },
      }],
    };
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/harvest/commit',
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Harvest itself succeeds (frames saved, cognify ran) — only the wiki
    // compile step is skipped because we have no real embedder.
    expect(body.saved).toBeGreaterThanOrEqual(0);
    expect(body.wikiSkippedReason).toBe('no_real_embedder');
    expect(body.wikiCompiled.pagesCreated).toBe(0);
    expect(body.message).toMatch(/wiki skipped/i);
  });
});
