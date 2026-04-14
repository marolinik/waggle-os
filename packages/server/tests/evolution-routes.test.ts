import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MindDB } from '@waggle/core';
import { buildLocalServer } from '../src/local/index.js';
import { injectWithAuth } from './test-utils.js';
import type { FastifyInstance } from 'fastify';

describe('Evolution Routes', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-evolution-routes-'));
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    mind.close();
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  function seedRun(overrides: Partial<Parameters<typeof server.evolutionStore.create>[0]> = {}) {
    return server.evolutionStore.create({
      targetKind: 'persona-system-prompt',
      targetName: 'coder',
      baselineText: 'baseline prompt that is long enough',
      winnerText: 'evolved prompt that is long enough to pass the gate',
      deltaAccuracy: 0.08,
      gateVerdict: 'pass',
      gateReasons: [{ gate: 'size', verdict: 'pass', reason: 'within limit' }],
      ...overrides,
    });
  }

  // ── GET /api/evolution/runs ──

  describe('GET /api/evolution/runs', () => {
    beforeAll(() => server.evolutionStore.clear());

    it('returns an empty list when nothing has run', async () => {
      const res = await injectWithAuth(server, {
        method: 'GET', url: '/api/evolution/runs',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.runs).toEqual([]);
      expect(body.count).toBe(0);
    });

    it('returns seeded runs in reverse-chronological order', async () => {
      seedRun({ targetName: 'a' });
      seedRun({ targetName: 'b' });
      seedRun({ targetName: 'c' });

      const res = await injectWithAuth(server, {
        method: 'GET', url: '/api/evolution/runs',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.count).toBe(3);
      expect(body.runs[0].id).toBeGreaterThan(body.runs[body.runs.length - 1].id);
    });

    it('filters by status', async () => {
      const a = seedRun({ targetName: 'x' });
      server.evolutionStore.reject(a.run_uuid, 'test reject');

      const res = await injectWithAuth(server, {
        method: 'GET', url: '/api/evolution/runs?status=rejected',
      });
      const body = JSON.parse(res.body);
      expect(body.runs.length).toBeGreaterThanOrEqual(1);
      expect(body.runs.every((r: { status: string }) => r.status === 'rejected')).toBe(true);
    });

    it('respects the limit query param', async () => {
      for (let i = 0; i < 5; i++) seedRun({ targetName: `limit-${i}` });
      const res = await injectWithAuth(server, {
        method: 'GET', url: '/api/evolution/runs?limit=2',
      });
      const body = JSON.parse(res.body);
      expect(body.runs).toHaveLength(2);
    });
  });

  // ── GET /api/evolution/runs/:uuid ──

  describe('GET /api/evolution/runs/:uuid', () => {
    it('returns a single run with parsed JSON blobs', async () => {
      const run = seedRun({
        winnerSchema: { name: 'test', fields: [{ name: 'answer', type: 'string' }] },
        artifacts: { seed: 42, generations: 2 },
      });
      const res = await injectWithAuth(server, {
        method: 'GET', url: `/api/evolution/runs/${run.run_uuid}`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.run_uuid).toBe(run.run_uuid);
      expect(body.winnerSchema).toEqual({ name: 'test', fields: [{ name: 'answer', type: 'string' }] });
      expect(body.artifacts).toEqual({ seed: 42, generations: 2 });
      expect(body.gateReasons).toHaveLength(1);
    });

    it('returns 404 for unknown uuid', async () => {
      const res = await injectWithAuth(server, {
        method: 'GET', url: '/api/evolution/runs/does-not-exist',
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns run even when artifacts are null/malformed', async () => {
      const run = seedRun();
      const res = await injectWithAuth(server, {
        method: 'GET', url: `/api/evolution/runs/${run.run_uuid}`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.winnerSchema).toBeNull();
      expect(body.artifacts).toBeNull();
    });
  });

  // ── POST /api/evolution/runs/:uuid/reject ──

  describe('POST /api/evolution/runs/:uuid/reject', () => {
    it('moves proposed run to rejected with reason', async () => {
      const run = seedRun();
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `/api/evolution/runs/${run.run_uuid}/reject`,
        payload: { reason: 'not great' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('rejected');
      expect(body.user_note).toBe('not great');
    });

    it('rejects 404 for unknown uuid', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/evolution/runs/ghost/reject',
        payload: {},
      });
      expect(res.statusCode).toBe(404);
    });

    it('rejects 409 when run is not proposed', async () => {
      const run = seedRun();
      server.evolutionStore.reject(run.run_uuid);
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `/api/evolution/runs/${run.run_uuid}/reject`,
        payload: {},
      });
      expect(res.statusCode).toBe(409);
    });
  });

  // ── POST /api/evolution/runs/:uuid/accept ──

  describe('POST /api/evolution/runs/:uuid/accept', () => {
    it('writes a persona override to disk and moves to deployed', async () => {
      const run = seedRun({
        targetKind: 'persona-system-prompt',
        targetName: 'coder',
        winnerText: 'EVOLVED coder system prompt',
      });
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `/api/evolution/runs/${run.run_uuid}/accept`,
        payload: { note: 'looks good' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('deployed');

      const overridePath = path.join(tmpDir, 'personas', 'coder.json');
      expect(fs.existsSync(overridePath)).toBe(true);
      const loaded = JSON.parse(fs.readFileSync(overridePath, 'utf-8'));
      expect(loaded.systemPrompt).toBe('EVOLVED coder system prompt');
    });

    it('writes a behavioral-spec override to disk', async () => {
      const run = seedRun({
        targetKind: 'behavioral-spec-section',
        targetName: 'coreLoop',
        winnerText: 'EVOLVED core loop text',
      });
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `/api/evolution/runs/${run.run_uuid}/accept`,
        payload: {},
      });
      expect(res.statusCode).toBe(200);

      const overridePath = path.join(tmpDir, 'behavioral-overrides', 'coreLoop.json');
      expect(fs.existsSync(overridePath)).toBe(true);
      const loaded = JSON.parse(fs.readFileSync(overridePath, 'utf-8'));
      expect(loaded.text).toBe('EVOLVED core loop text');
      expect(loaded.runUuid).toBe(run.run_uuid);
    });

    it('marks run failed when deploy throws (unsupported target_kind)', async () => {
      const run = seedRun({
        targetKind: 'tool-description',
        targetName: 'some_tool',
        winnerText: 'new description',
      });
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `/api/evolution/runs/${run.run_uuid}/accept`,
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('failed');
      expect(body.failure_reason).toMatch(/not yet implemented/);
    });

    it('emits persona:reloaded event on persona deploy', async () => {
      const run = seedRun({
        targetKind: 'persona-system-prompt',
        targetName: 'writer',
        winnerText: 'EVOLVED writer',
      });

      let emitted: unknown = null;
      const listener = (payload: unknown) => { emitted = payload; };
      server.eventBus.on('persona:reloaded', listener);

      await injectWithAuth(server, {
        method: 'POST',
        url: `/api/evolution/runs/${run.run_uuid}/accept`,
        payload: {},
      });

      server.eventBus.off('persona:reloaded', listener);
      expect(emitted).toEqual({ personaId: 'writer' });
    });

    it('returns 409 for already-accepted run', async () => {
      const run = seedRun();
      await injectWithAuth(server, {
        method: 'POST',
        url: `/api/evolution/runs/${run.run_uuid}/accept`,
        payload: {},
      });
      const second = await injectWithAuth(server, {
        method: 'POST',
        url: `/api/evolution/runs/${run.run_uuid}/accept`,
        payload: {},
      });
      expect(second.statusCode).toBe(409);
    });
  });

  // ── GET /api/evolution/status ──

  describe('GET /api/evolution/status', () => {
    it('returns aggregate counts per status', async () => {
      server.evolutionStore.clear();
      const a = seedRun();
      const b = seedRun();
      server.evolutionStore.reject(a.run_uuid);
      server.evolutionStore.accept(b.run_uuid);
      server.evolutionStore.markDeployed(b.run_uuid);

      const res = await injectWithAuth(server, {
        method: 'GET', url: '/api/evolution/status',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.counts.rejected).toBe(1);
      expect(body.counts.deployed).toBe(1);
      expect(body.pendingCount).toBe(0);
    });
  });
});
