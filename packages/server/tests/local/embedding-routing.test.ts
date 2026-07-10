/**
 * Embedding routing API tests (steal #10) —
 *   GET  /api/embedding/status   (enriched: configuredProvider + envOverride)
 *   POST /api/embedding/provider (validate → tier-gate → persist → restartRequired)
 *
 * Note: vitest.setup.ts pins EMBEDDING_PROVIDER='mock' for the whole suite, so the
 * env-override branch would otherwise 409 every write. We clear it per-test to
 * exercise the real paths, and set it explicitly for the override test.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, SessionStore, FrameStore } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

describe('Embedding routing API', () => {
  let server: FastifyInstance;
  let tmpDir: string;
  const ORIGINAL_ENV = process.env.EMBEDDING_PROVIDER;

  function readConfig(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8'));
  }

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-embrouting-test-'));
    // No `tier` field → effective tier resolves to FREE (litellm gated off).
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({}));
    fs.mkdirSync(path.join(tmpDir, 'skills'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'skills', '.starter-installed'), 'test');

    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('embrouting-test');
    frames.createIFrame(s1.gop_id, 'Embedding routing test frame', 'normal');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (ORIGINAL_ENV === undefined) delete process.env.EMBEDDING_PROVIDER;
    else process.env.EMBEDDING_PROVIDER = ORIGINAL_ENV;
  });

  // Default to the no-env-override path; the override test opts back in.
  beforeEach(() => { delete process.env.EMBEDDING_PROVIDER; });

  it('GET /api/embedding/status returns the enriched shape', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/embedding/status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.activeProvider).toBe('string');
    expect(Array.isArray(body.availableProviders)).toBe(true);
    expect(typeof body.dimensions).toBe('number');
    expect(typeof body.modelName).toBe('string');
    // Enrichment fields added by steal #10.
    expect(body.configuredProvider).toBe('auto'); // fresh config → default
    expect(typeof body.envOverride).toBe('boolean');
    expect(body.envOverride).toBe(false); // beforeEach cleared the env var
  });

  it('POST /api/embedding/provider rejects an unknown provider with 400', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/embedding/provider',
      payload: { provider: 'banana' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/embedding/provider rejects "mock" with 400 (not user-selectable)', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/embedding/provider',
      payload: { provider: 'mock' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/embedding/provider tier-gates litellm on FREE with 403', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/embedding/provider',
      payload: { provider: 'litellm' },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('TIER_REQUIRED');
    expect(body.requiredTier).toBeDefined();
    expect(body.currentTier).toBe('FREE');
    // Rejected write must not have persisted.
    expect(readConfig().embedding).toBeUndefined();
  });

  it('POST /api/embedding/provider persists "auto" (no restart required)', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/embedding/provider',
      payload: { provider: 'auto' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.configuredProvider).toBe('auto');
    expect(body.restartRequired).toBe(false);
    expect((readConfig().embedding as { provider?: string }).provider).toBe('auto');
  });

  it('POST /api/embedding/provider persists a tier-allowed provider with restartRequired', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/embedding/provider',
      payload: { provider: 'inprocess' }, // FREE allows inprocess
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.configuredProvider).toBe('inprocess');
    // Active provider at boot is mock (test env), so switching needs a restart.
    expect(body.restartRequired).toBe(true);
    expect((readConfig().embedding as { provider?: string }).provider).toBe('inprocess');
  });

  it('POST /api/embedding/provider rejects the write when EMBEDDING_PROVIDER env is set', async () => {
    process.env.EMBEDDING_PROVIDER = 'voyage';
    // config currently persists 'inprocess' from the previous test.
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/embedding/provider',
      payload: { provider: 'auto' },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('EMBEDDING_PROVIDER_ENV_OVERRIDE');
    expect(body.envOverride).toBe(true);
    // The env-forced write must not have changed the persisted choice.
    expect((readConfig().embedding as { provider?: string }).provider).toBe('inprocess');

    // And status reports the override too.
    const statusRes = await injectWithAuth(server, { method: 'GET', url: '/api/embedding/status' });
    expect(JSON.parse(statusRes.body).envOverride).toBe(true);
  });
});
