/**
 * Compliance Template Routes Tests (M-03)
 *
 * Covers the 5-endpoint CRUD surface:
 *   GET    /api/compliance/templates
 *   GET    /api/compliance/templates/:id
 *   POST   /api/compliance/templates
 *   PATCH  /api/compliance/templates/:id
 *   DELETE /api/compliance/templates/:id
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';
import { MindDB, SessionStore, FrameStore } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import { injectWithAuth } from '../test-utils.js';

const ALL_ON = {
  interactions: true,
  oversight: true,
  models: true,
  provenance: true,
  riskAssessment: true,
  fria: true,
};

const ALL_OFF = {
  interactions: false,
  oversight: false,
  models: false,
  provenance: false,
  riskAssessment: false,
  fria: false,
};

describe('Compliance Template Routes (M-03)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-compliance-templates-test-'));
    const mind = new MindDB(path.join(tmpDir, 'personal.mind'));
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s = sessions.create('template-test-seed');
    frames.createIFrame(s.gop_id, 'seed', 'normal');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('POST /api/compliance/templates', () => {
    it('creates a template with 201 + returns the full row', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/compliance/templates',
        payload: {
          name: 'Test template',
          description: 'unit test',
          sections: ALL_ON,
          riskClassification: 'high-risk',
          orgName: 'Acme',
          footerText: 'Confidential',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.template.id).toBeGreaterThan(0);
      expect(body.template.name).toBe('Test template');
      expect(body.template.sections).toEqual(ALL_ON);
      expect(body.template.riskClassification).toBe('high-risk');
    });

    it('400s on missing name', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/compliance/templates',
        payload: { sections: ALL_OFF },
      });
      expect(res.statusCode).toBe(400);
    });

    it('400s on missing sections', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/compliance/templates',
        payload: { name: 'no sections' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('400s on invalid risk classification', async () => {
      const res = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/compliance/templates',
        payload: { name: 'bad risk', sections: ALL_OFF, riskClassification: 'catastrophic' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/compliance/templates', () => {
    it('returns the list of all templates', async () => {
      const res = await injectWithAuth(server, {
        method: 'GET',
        url: '/api/compliance/templates',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.templates)).toBe(true);
      expect(body.templates.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/compliance/templates/:id', () => {
    it('returns a specific template', async () => {
      const create = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/compliance/templates',
        payload: { name: 'fetch-me', sections: ALL_OFF },
      });
      const id = create.json().template.id;

      const res = await injectWithAuth(server, {
        method: 'GET',
        url: `/api/compliance/templates/${id}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().template.id).toBe(id);
    });

    it('404s on missing id', async () => {
      const res = await injectWithAuth(server, {
        method: 'GET',
        url: '/api/compliance/templates/999999',
      });
      expect(res.statusCode).toBe(404);
    });

    it('400s on non-numeric id', async () => {
      const res = await injectWithAuth(server, {
        method: 'GET',
        url: '/api/compliance/templates/not-a-number',
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /api/compliance/templates/:id', () => {
    it('updates partial fields and returns the new row', async () => {
      const create = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/compliance/templates',
        payload: { name: 'orig', description: 'old', sections: ALL_OFF, orgName: 'X' },
      });
      const id = create.json().template.id;

      const patch = await injectWithAuth(server, {
        method: 'PATCH',
        url: `/api/compliance/templates/${id}`,
        payload: { name: 'renamed', orgName: null },
      });
      expect(patch.statusCode).toBe(200);
      const body = patch.json();
      expect(body.template.name).toBe('renamed');
      expect(body.template.description).toBe('old'); // preserved
      expect(body.template.orgName).toBeNull(); // cleared
    });

    it('404s on missing id', async () => {
      const res = await injectWithAuth(server, {
        method: 'PATCH',
        url: '/api/compliance/templates/999999',
        payload: { name: 'x' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('400s on invalid body shape', async () => {
      const create = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/compliance/templates',
        payload: { name: 'for-bad-patch', sections: ALL_OFF },
      });
      const id = create.json().template.id;

      const res = await injectWithAuth(server, {
        method: 'PATCH',
        url: `/api/compliance/templates/${id}`,
        payload: { sections: { interactions: true } }, // missing other 5 flags
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/compliance/templates/:id', () => {
    it('deletes an existing template + returns { deleted: true }', async () => {
      const create = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/compliance/templates',
        payload: { name: 'doomed', sections: ALL_OFF },
      });
      const id = create.json().template.id;

      const del = await injectWithAuth(server, {
        method: 'DELETE',
        url: `/api/compliance/templates/${id}`,
      });
      expect(del.statusCode).toBe(200);
      expect(del.json().deleted).toBe(true);

      const refetch = await injectWithAuth(server, {
        method: 'GET',
        url: `/api/compliance/templates/${id}`,
      });
      expect(refetch.statusCode).toBe(404);
    });

    it('404s on missing id', async () => {
      const res = await injectWithAuth(server, {
        method: 'DELETE',
        url: '/api/compliance/templates/999999',
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
