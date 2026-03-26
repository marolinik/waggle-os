/**
 * Custom Workflows REST API Route Tests
 *
 * Tests the workflow CRUD endpoints:
 *   GET    /api/workflows       — list built-in + custom workflows
 *   POST   /api/workflows       — create a custom workflow
 *   DELETE /api/workflows/:name — delete a custom workflow
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import Fastify from 'fastify';
import { workflowRoutes } from '../../src/local/routes/workflows.js';

function createTestServer(dataDir: string) {
  const server = Fastify({ logger: false });
  // Mimic the localConfig decoration that the real server provides
  server.decorate('localConfig', { dataDir, port: 0, host: '127.0.0.1', litellmUrl: '' });
  server.register(workflowRoutes);
  return server;
}

describe('Workflow Routes', () => {
  let tmpDir: string;
  let server: ReturnType<typeof Fastify>;

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `waggle-workflow-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    server = createTestServer(tmpDir);
  });

  afterEach(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── GET /api/workflows ──────────────────────────────────────────

  describe('GET /api/workflows', () => {
    it('returns built-in workflows with counts', async () => {
      const res = await server.inject({ method: 'GET', url: '/api/workflows' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.workflows).toBeDefined();
      expect(Array.isArray(body.workflows)).toBe(true);
      expect(body.builtInCount).toBeGreaterThanOrEqual(3); // research-team, review-pair, plan-execute
      expect(body.customCount).toBe(0);
    });

    it('includes custom workflows after creation', async () => {
      // Create a custom workflow on disk directly
      const wfDir = path.join(tmpDir, 'workflows');
      fs.mkdirSync(wfDir, { recursive: true });
      fs.writeFileSync(
        path.join(wfDir, 'my-flow.json'),
        JSON.stringify({
          name: 'my-flow',
          description: 'test custom workflow',
          steps: [{ name: 'Step1', role: 'analyst', task: 'do things' }],
          aggregation: 'concatenate',
        }),
      );

      const res = await server.inject({ method: 'GET', url: '/api/workflows' });
      const body = res.json();
      expect(body.customCount).toBe(1);
      const custom = body.workflows.find((w: any) => w.name === 'my-flow');
      expect(custom).toBeDefined();
      expect(custom.builtIn).toBe(false);
    });
  });

  // ── POST /api/workflows ─────────────────────────────────────────

  describe('POST /api/workflows', () => {
    it('creates a workflow file on disk and returns 201', async () => {
      const payload = {
        name: 'Sprint Review',
        description: 'A sprint review workflow',
        steps: [
          { name: 'Analyst', role: 'analyst', task: 'Analyze sprint metrics' },
          { name: 'Writer', role: 'writer', task: 'Write sprint summary', dependsOn: ['Analyst'], contextFrom: ['Analyst'] },
        ],
        aggregation: 'last',
      };

      const res = await server.inject({
        method: 'POST',
        url: '/api/workflows',
        payload,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.name).toBe('Sprint Review');
      expect(body.steps).toHaveLength(2);

      // Verify file on disk
      const filePath = path.join(tmpDir, 'workflows', 'sprint-review.json');
      expect(fs.existsSync(filePath)).toBe(true);
      const saved = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(saved.name).toBe('Sprint Review');
    });

    it('returns 400 when name is missing', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/workflows',
        payload: { steps: [{ name: 'A', role: 'analyst', task: 'x' }] },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain('name');
    });

    it('returns 400 when steps is empty', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/workflows',
        payload: { name: 'Empty', steps: [] },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 400 when steps is missing', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/workflows',
        payload: { name: 'No Steps' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('defaults aggregation to concatenate', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/workflows',
        payload: {
          name: 'Defaults Test',
          steps: [{ name: 'A', role: 'researcher', task: 'research' }],
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().aggregation).toBe('concatenate');
    });
  });

  // ── DELETE /api/workflows/:name ─────────────────────────────────

  describe('DELETE /api/workflows/:name', () => {
    it('deletes an existing custom workflow', async () => {
      // First create one
      await server.inject({
        method: 'POST',
        url: '/api/workflows',
        payload: {
          name: 'To Delete',
          steps: [{ name: 'A', role: 'analyst', task: 'x' }],
        },
      });

      const filePath = path.join(tmpDir, 'workflows', 'to-delete.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const res = await server.inject({
        method: 'DELETE',
        url: '/api/workflows/To Delete',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().deleted).toBe(true);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('returns 404 for non-existent workflow', async () => {
      const res = await server.inject({
        method: 'DELETE',
        url: '/api/workflows/does-not-exist',
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toContain('not found');
    });
  });
});
