/**
 * Harvest Identity Extraction Tests (M-09)
 *
 * Covers:
 *  POST /api/harvest/extract-identity — happy-path guards that don't need
 *    an Anthropic key. LLM-mocked happy path is deferred to a follow-up
 *    because the internal proxy call is opaque from this layer.
 *  PUT  /api/profile with identitySuggestions — the surface the client uses
 *    to accept/dismiss suggestions (reuses the existing route).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, SessionStore, FrameStore } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

describe('Harvest Identity Routes (M-09)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-harvest-identity-test-'));

    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);

    // Seed the 'harvest' GOP the way the commit route does, so the
    // extract-identity route has something to read.
    sessions.ensure('harvest', 'harvest', 'Imported memory from external sources');
    frames.createIFrame('harvest', '[Harvest:claude] About me\n\nUser is a senior partner at Egzakta Advisory, working in strategy consulting.', 'normal', 'import');
    frames.createIFrame('harvest', '[Harvest:chatgpt] Project kickoff\n\nMarko Markovic from Egzakta mentioned leading the Waggle OS project.', 'normal', 'import');

    mind.close();
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('GET /api/profile', () => {
    it('returns empty identitySuggestions by default', async () => {
      const res = await injectWithAuth(server, { method: 'GET', url: '/api/profile' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.identitySuggestions)).toBe(true);
      expect(body.identitySuggestions).toHaveLength(0);
    });
  });

  describe('PUT /api/profile with identitySuggestions', () => {
    it('persists a suggestion list', async () => {
      const suggestions = [
        {
          field: 'name',
          value: 'Marko Markovic',
          confidence: 0.92,
          sourceHint: 'mentioned in 2 harvested frames',
          extractedAt: '2026-04-20T00:00:00.000Z',
        },
      ];
      const putRes = await injectWithAuth(server, {
        method: 'PUT',
        url: '/api/profile',
        payload: { identitySuggestions: suggestions },
      });
      expect(putRes.statusCode).toBe(200);

      const getRes = await injectWithAuth(server, { method: 'GET', url: '/api/profile' });
      const body = getRes.json();
      expect(body.identitySuggestions).toHaveLength(1);
      expect(body.identitySuggestions[0].field).toBe('name');
      expect(body.identitySuggestions[0].value).toBe('Marko Markovic');
    });

    it('shrinks the list on accept (field set + suggestion removed in one PUT)', async () => {
      // Seed two suggestions, then accept 'role' (populates field, removes row).
      await injectWithAuth(server, {
        method: 'PUT',
        url: '/api/profile',
        payload: {
          identitySuggestions: [
            { field: 'role', value: 'Partner', confidence: 0.88, sourceHint: 's1', extractedAt: '2026-04-20T00:00:00.000Z' },
            { field: 'company', value: 'Egzakta Advisory', confidence: 0.95, sourceHint: 's2', extractedAt: '2026-04-20T00:00:00.000Z' },
          ],
        },
      });

      await injectWithAuth(server, {
        method: 'PUT',
        url: '/api/profile',
        payload: {
          role: 'Partner',
          identitySuggestions: [
            { field: 'company', value: 'Egzakta Advisory', confidence: 0.95, sourceHint: 's2', extractedAt: '2026-04-20T00:00:00.000Z' },
          ],
        },
      });

      const getRes = await injectWithAuth(server, { method: 'GET', url: '/api/profile' });
      const body = getRes.json();
      expect(body.role).toBe('Partner');
      expect(body.identitySuggestions).toHaveLength(1);
      expect(body.identitySuggestions[0].field).toBe('company');
    });

    it('shrinks the list on dismiss (suggestion removed, field untouched)', async () => {
      // Seed, then dismiss 'industry' — name should NOT be set.
      await injectWithAuth(server, {
        method: 'PUT',
        url: '/api/profile',
        payload: {
          identitySuggestions: [
            { field: 'industry', value: 'Consulting', confidence: 0.7, sourceHint: 's', extractedAt: '2026-04-20T00:00:00.000Z' },
          ],
        },
      });
      const getBefore = await injectWithAuth(server, { method: 'GET', url: '/api/profile' });
      const prevIndustry = getBefore.json().industry;

      await injectWithAuth(server, {
        method: 'PUT',
        url: '/api/profile',
        payload: { identitySuggestions: [] },
      });

      const getAfter = await injectWithAuth(server, { method: 'GET', url: '/api/profile' });
      const body = getAfter.json();
      expect(body.identitySuggestions).toHaveLength(0);
      expect(body.industry).toBe(prevIndustry); // unchanged
    });
  });

  describe('POST /api/harvest/extract-identity', () => {
    it('returns the current suggestion list (possibly empty) when no Anthropic key is configured', async () => {
      // In the test server no vault entries are seeded → the route short-
      // circuits with `note: 'no_anthropic_key'` and the currently stored
      // suggestions pass through unchanged.
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/harvest/extract-identity',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.suggestions)).toBe(true);
      // We're agnostic about the suggestion count here — prior tests may have
      // seeded entries. The important invariants are the shape and the note.
      expect(body.note).toBe('no_anthropic_key');
    });

    it('returns suggestions even after the frames are all wiped (degrades gracefully)', async () => {
      // Clear the harvest session's frames to exercise the "no frames" path.
      // The route returns the persisted suggestions from the profile in this
      // case — it does NOT wipe them just because the frames are gone.
      const personalPath = path.join(tmpDir, 'personal.mind');
      const mind = new MindDB(personalPath);
      const raw = mind.getDatabase();
      raw.prepare(`DELETE FROM memory_frames WHERE gop_id = 'harvest'`).run();
      mind.close();

      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/harvest/extract-identity',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.suggestions)).toBe(true);
    });
  });
});
