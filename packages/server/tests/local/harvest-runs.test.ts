/**
 * Harvest Runs Routes Tests (M-08 — resumable harvest)
 *
 * Covers:
 *   POST /api/harvest/commit — now creates a harvest_runs row + caches the
 *     input payload + completes on success (deleting the cache).
 *   GET  /api/harvest/runs — lists recent runs.
 *   GET  /api/harvest/runs/latest-interrupted — single latest resume candidate.
 *   POST /api/harvest/runs/:id/abandon — marks abandoned + deletes cache.
 *   POST /api/harvest/commit with resumeFromRun — replays cached input.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, SessionStore, FrameStore, HarvestRunStore } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

const CHATGPT_EXPORT = [
  {
    title: 'A small chat',
    create_time: 1700000000,
    mapping: {
      node1: {
        message: {
          author: { role: 'user' },
          content: { parts: ['My preferred editor is VSCode with vim bindings.'] },
          create_time: 1700000001,
        },
      },
      node2: {
        message: {
          author: { role: 'assistant' },
          content: { parts: ['Got it — VSCode with vim is a solid setup.'] },
          create_time: 1700000002,
        },
      },
    },
  },
];

describe('Harvest Run Routes (M-08)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-harvest-runs-test-'));

    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('run-test-seed');
    frames.createIFrame(s1.gop_id, 'seed frame', 'normal');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('POST /api/harvest/commit + run lifecycle', () => {
    it('creates a completed run + deletes the cache on success', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/harvest/commit',
        payload: { data: CHATGPT_EXPORT, source: 'chatgpt' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(typeof body.runId).toBe('number');
      expect(body.saved).toBeGreaterThan(0);

      // Confirm the run was marked completed + cache file was removed.
      const personalPath = path.join(tmpDir, 'personal.mind');
      const mind = new MindDB(personalPath);
      const runs = new HarvestRunStore(mind);
      const run = runs.getById(body.runId);
      expect(run?.status).toBe('completed');
      expect(run?.inputCachePath).toBeTruthy();
      if (run?.inputCachePath) {
        expect(fs.existsSync(run.inputCachePath)).toBe(false);
      }
      mind.close();
    });
  });

  describe('GET /api/harvest/runs', () => {
    it('returns recent runs newest-first', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/harvest/runs' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.runs)).toBe(true);
      expect(body.runs.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/harvest/runs/latest-interrupted', () => {
    it('returns null when no runs are interrupted (all terminal)', async () => {
      // After the previous test the only run is completed.
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/harvest/runs/latest-interrupted' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.run).toBeNull();
    });

    it('surfaces a hand-seeded interrupted run with a surviving cache', async () => {
      // Craft a 'running' row directly in the DB to simulate client disconnect
      // mid-flight. The route requires the cache file to actually exist, so
      // we also write one.
      const personalPath = path.join(tmpDir, 'personal.mind');
      const mind = new MindDB(personalPath);
      const runs = new HarvestRunStore(mind);
      const cacheDir = path.join(tmpDir, 'harvest-cache');
      fs.mkdirSync(cacheDir, { recursive: true });
      const cacheFile = path.join(cacheDir, 'seeded.json');
      fs.writeFileSync(cacheFile, JSON.stringify(CHATGPT_EXPORT));
      runs.start('chatgpt', 10, cacheFile);
      mind.close();

      const res = await injectWithAuth(server, { method: 'GET', url: '/api/harvest/runs/latest-interrupted' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.run).not.toBeNull();
      expect(body.run.status).toBe('running');
      expect(body.run.source).toBe('chatgpt');
    });

    it('returns null when the row exists but the cache file is gone', async () => {
      // Delete the seeded cache and refetch.
      const cacheFile = path.join(tmpDir, 'harvest-cache', 'seeded.json');
      if (fs.existsSync(cacheFile)) fs.unlinkSync(cacheFile);

      const res = await injectWithAuth(server, { method: 'GET', url: '/api/harvest/runs/latest-interrupted' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.run).toBeNull();
    });
  });

  describe('POST /api/harvest/runs/:id/abandon', () => {
    it('marks a running run abandoned + deletes its cache', async () => {
      // Seed another interrupted run with a real cache file.
      const personalPath = path.join(tmpDir, 'personal.mind');
      const mind = new MindDB(personalPath);
      const runs = new HarvestRunStore(mind);
      const cacheDir = path.join(tmpDir, 'harvest-cache');
      fs.mkdirSync(cacheDir, { recursive: true });
      const cacheFile = path.join(cacheDir, 'abandon-test.json');
      fs.writeFileSync(cacheFile, JSON.stringify(CHATGPT_EXPORT));
      const run = runs.start('chatgpt', 10, cacheFile);
      mind.close();

      const res = await injectWithAuth(server, {
        method: 'POST',
        url: `/api/harvest/runs/${run.id}/abandon`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.run.status).toBe('abandoned');
      expect(fs.existsSync(cacheFile)).toBe(false);
    });

    it('returns 404 for a non-existent run id', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/harvest/runs/999999/abandon',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/harvest/commit { resumeFromRun }', () => {
    it('replays the cached input (dedup produces a no-op count)', async () => {
      // Seed an interrupted run backed by CHATGPT_EXPORT as the cache.
      const personalPath = path.join(tmpDir, 'personal.mind');
      const mind = new MindDB(personalPath);
      const runs = new HarvestRunStore(mind);
      const cacheDir = path.join(tmpDir, 'harvest-cache');
      fs.mkdirSync(cacheDir, { recursive: true });
      const cacheFile = path.join(cacheDir, 'resume-test.json');
      fs.writeFileSync(cacheFile, JSON.stringify(CHATGPT_EXPORT));
      const seed = runs.start('chatgpt', 1, cacheFile);
      mind.close();

      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/harvest/commit',
        payload: { resumeFromRun: seed.id },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.runId).toBe(seed.id);
      // FrameStore dedup returns the existing frame from the original commit,
      // so the saved counter is bumped but no new rows are created.
      expect(body.saved).toBeGreaterThan(0);

      // Run is now completed + cache deleted.
      const mind2 = new MindDB(personalPath);
      const runs2 = new HarvestRunStore(mind2);
      expect(runs2.getById(seed.id)?.status).toBe('completed');
      expect(fs.existsSync(cacheFile)).toBe(false);
      mind2.close();
    });

    it('returns 404 for an unknown resumeFromRun id', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/harvest/commit',
        payload: { resumeFromRun: 999999 },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 410 when the cache file has been deleted', async () => {
      const personalPath = path.join(tmpDir, 'personal.mind');
      const mind = new MindDB(personalPath);
      const runs = new HarvestRunStore(mind);
      // Cache path that points nowhere.
      const stale = runs.start('chatgpt', 5, path.join(tmpDir, 'harvest-cache', 'nope.json'));
      mind.close();

      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/harvest/commit',
        payload: { resumeFromRun: stale.id },
      });
      expect(res.statusCode).toBe(410);
    });

    it('returns 409 when the run is already completed', async () => {
      const personalPath = path.join(tmpDir, 'personal.mind');
      const mind = new MindDB(personalPath);
      const runs = new HarvestRunStore(mind);
      const cacheDir = path.join(tmpDir, 'harvest-cache');
      fs.mkdirSync(cacheDir, { recursive: true });
      const cacheFile = path.join(cacheDir, '409-test.json');
      fs.writeFileSync(cacheFile, JSON.stringify(CHATGPT_EXPORT));
      const run = runs.start('chatgpt', 1, cacheFile);
      runs.complete(run.id, 1);
      mind.close();

      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/harvest/commit',
        payload: { resumeFromRun: run.id },
      });
      expect(res.statusCode).toBe(409);
    });
  });
});
