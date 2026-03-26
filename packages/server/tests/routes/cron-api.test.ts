/**
 * Cron REST API Route Tests
 *
 * Validates CRUD operations and manual trigger for the Solo cron service.
 * Uses the same pattern as trust-wiring.test.ts — tmpDir + buildLocalServer + server.inject().
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

describe('Cron REST API Routes', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-cron-api-'));

    // Create personal.mind
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('POST /api/cron creates a schedule and returns camelCase response', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/cron',
      payload: {
        name: 'Test job',
        cronExpr: '*/5 * * * *',
        jobType: 'memory_consolidation',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBeDefined();
    expect(body.name).toBe('Test job');
    expect(body.cronExpr).toBe('*/5 * * * *');
    expect(body.nextRunAt).toBeDefined();
    expect(body.enabled).toBe(true);
  });

  it('POST /api/cron with invalid cron expression returns 400', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/cron',
      payload: {
        name: 'Bad cron',
        cronExpr: 'not-a-valid-cron',
        jobType: 'memory_consolidation',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
  });

  it('GET /api/cron lists schedules including seeded defaults', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/cron',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.schedules).toBeDefined();
    expect(Array.isArray(body.schedules)).toBe(true);
    // Should have at least the 2 seeded defaults + 1 created in previous test
    expect(body.schedules.length).toBeGreaterThanOrEqual(3);
    // Check that seeded defaults are present
    const names = body.schedules.map((s: { name: string }) => s.name);
    expect(names).toContain('Memory consolidation');
    expect(names).toContain('Workspace health check');
  });

  it('PATCH /api/cron/:id updates name and enabled flag', async () => {
    // First create a schedule to update
    const createRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/cron',
      payload: {
        name: 'To be updated',
        cronExpr: '0 12 * * *',
        jobType: 'workspace_health',
      },
    });
    const created = JSON.parse(createRes.body);

    // Update it
    const res = await injectWithAuth(server, {
      method: 'PATCH',
      url: `/api/cron/${created.id}`,
      payload: {
        name: 'Updated name',
        enabled: false,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Updated name');
    expect(body.enabled).toBe(false);
  });

  it('DELETE /api/cron/:id removes schedule; subsequent GET returns 404', async () => {
    // Create a schedule to delete
    const createRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/cron',
      payload: {
        name: 'To be deleted',
        cronExpr: '0 0 * * *',
        jobType: 'memory_consolidation',
      },
    });
    const created = JSON.parse(createRes.body);

    // Delete it
    const delRes = await injectWithAuth(server, {
      method: 'DELETE',
      url: `/api/cron/${created.id}`,
    });
    expect(delRes.statusCode).toBe(200);

    // Verify it's gone
    const getRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/cron/${created.id}`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  it('POST /api/cron/:id/trigger manually triggers a schedule', async () => {
    // Create a schedule to trigger
    const createRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/cron',
      payload: {
        name: 'Manual trigger test',
        cronExpr: '0 0 1 1 *', // yearly — not naturally due
        jobType: 'memory_consolidation',
      },
    });
    const created = JSON.parse(createRes.body);

    const res = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/cron/${created.id}/trigger`,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.triggered).toBe(true);
  });
});
