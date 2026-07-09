/**
 * /api/dreams — response shape, days clamp, lazy narrative polish
 * (single-flight, quiet-night skip, LLM-failure fallback) (DREAM-DIARY spec).
 *
 * Polish behavior uses a bare Fastify instance with the `polish` test seam;
 * one full-server test confirms the route is wired into buildLocalServer.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MindDB } from '@waggle/core';
import { buildLocalServer } from '../src/local/index.js';
import { injectWithAuth } from './test-utils.js';
import { DreamJournal } from '../src/local/dream-journal.js';
import { dreamRoutes, type NarrativePolish } from '../src/local/routes/dreams.js';

async function waitFor(predicate: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise(r => setTimeout(r, 5));
  }
}

describe('dreams routes (bare instance + polish seam)', () => {
  let dir: string;
  let server: FastifyInstance;
  let journal: DreamJournal;
  let polish: ReturnType<typeof vi.fn>;
  let resolvePolish: ((v: string) => void) | null;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-dreams-rt-'));
    journal = new DreamJournal(dir);
    resolvePolish = null;
    polish = vi.fn(() => new Promise<string>(resolve => { resolvePolish = resolve; }));
    server = Fastify();
    server.decorate('dreamJournal', journal);
    await server.register(dreamRoutes, { polish: polish as unknown as NarrativePolish });
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns newest-first entries with summary and events', async () => {
    journal.record('memory_compact', { temporaryPruned: 3, deprecatedPruned: 0, pframesMerged: 1 }, new Date('2026-07-08T03:00:00'));
    journal.record('index_reconcile', { ftsFixed: 2, vecFixed: 0 }, new Date('2026-07-09T03:00:00'));

    const res = await server.inject({ method: 'GET', url: '/api/dreams?days=7' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<{ date: string; summary: string; events: unknown[] }>;
    expect(body.map(d => d.date)).toEqual(['2026-07-09', '2026-07-08']);
    expect(body[0].summary).toContain('repaired 2 search-index entries');
    expect(body[1].events).toHaveLength(2 - 1);
  });

  it('clamps the days query to a sane range', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/dreams?days=99999' });
    expect(res.statusCode).toBe(200);
    const bad = await server.inject({ method: 'GET', url: '/api/dreams?days=banana' });
    expect(bad.statusCode).toBe(200); // falls back to default 7
  });

  it('rejects non-local origins', async () => {
    const res = await server.inject({
      method: 'GET', url: '/api/dreams', headers: { origin: 'https://evil.example.com' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('schedules ONE polish per active day even under polling (single-flight)', async () => {
    journal.record('memory_compact', { temporaryPruned: 5, deprecatedPruned: 0, pframesMerged: 0 }, new Date('2026-07-09T03:00:00'));

    await server.inject({ method: 'GET', url: '/api/dreams' });
    await server.inject({ method: 'GET', url: '/api/dreams' });
    await server.inject({ method: 'GET', url: '/api/dreams' });
    expect(polish).toHaveBeenCalledTimes(1);

    // Complete the in-flight polish → persisted → no further calls.
    resolvePolish?.('While you slept I tidied five memories.');
    await waitFor(() => journal.read('2026-07-09')?.narrative !== undefined);
    await server.inject({ method: 'GET', url: '/api/dreams' });
    expect(polish).toHaveBeenCalledTimes(1);
    expect(journal.read('2026-07-09')?.narrative).toContain('tidied five memories');
  });

  it('skips the LLM entirely for quiet nights', async () => {
    journal.record('memory_compact', { temporaryPruned: 0, deprecatedPruned: 0, pframesMerged: 0 }, new Date('2026-07-09T03:00:00'));
    await server.inject({ method: 'GET', url: '/api/dreams' });
    expect(polish).not.toHaveBeenCalled();
  });

  it('keeps the deterministic summary when the polish fails, and can retry later', async () => {
    journal.record('index_reconcile', { ftsFixed: 4, vecFixed: 0 }, new Date('2026-07-09T03:00:00'));
    polish.mockRejectedValueOnce(new Error('proxy down'));

    const res = await server.inject({ method: 'GET', url: '/api/dreams' });
    const body = res.json() as Array<{ summary: string; narrative?: string }>;
    expect(body[0].summary).toContain('repaired 4 search-index entries');
    await waitFor(() => polish.mock.calls.length === 1);
    await new Promise(r => setTimeout(r, 20)); // let the rejection settle + clear the guard
    expect(journal.read('2026-07-09')?.narrative).toBeUndefined();

    // Guard cleared → a later read may try again.
    await server.inject({ method: 'GET', url: '/api/dreams' });
    expect(polish.mock.calls.length).toBe(2);
  });
});

describe('dreams route wiring in buildLocalServer', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-dreams-full-'));
    const mind = new MindDB(path.join(tmpDir, 'personal.mind'));
    mind.close();
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('exposes GET /api/dreams with the decorated journal (empty at first)', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/dreams' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});
