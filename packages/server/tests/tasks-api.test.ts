/**
 * Task API route tests.
 *
 * Tests CRUD operations on workspace-scoped tasks.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildLocalServer } from '../src/local/index.js';
import { injectWithAuth } from './test-utils.js';

describe('Task routes', () => {
  let server: Awaited<ReturnType<typeof buildLocalServer>>;
  let tmpDir: string;
  const wsId = 'test-workspace';

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-task-test-'));
    fs.mkdirSync(path.join(tmpDir, 'workspaces', wsId, 'sessions'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'personal.mind'), '');

    server = await buildLocalServer({
      dataDir: tmpDir,
      port: 0,
      host: '127.0.0.1',
    });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty tasks for a new workspace', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${wsId}/tasks`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).tasks).toEqual([]);
  });

  it('creates a task', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${wsId}/tasks`,
      payload: { title: 'Fix the bug' },
    });
    expect(res.statusCode).toBe(201);
    const task = JSON.parse(res.body);
    expect(task.title).toBe('Fix the bug');
    expect(task.status).toBe('open');
    expect(task.id).toBeDefined();
  });

  it('rejects empty title', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: `/api/workspaces/${wsId}/tasks`,
      payload: { title: '' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('lists created tasks', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${wsId}/tasks`,
    });
    const body = JSON.parse(res.body);
    expect(body.tasks.length).toBeGreaterThanOrEqual(1);
    expect(body.tasks[0].title).toBe('Fix the bug');
  });

  it('updates task status', async () => {
    // Get the task ID
    const listRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${wsId}/tasks`,
    });
    const taskId = JSON.parse(listRes.body).tasks[0].id;

    const res = await injectWithAuth(server, {
      method: 'PATCH',
      url: `/api/workspaces/${wsId}/tasks/${taskId}`,
      payload: { status: 'in_progress' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('in_progress');
  });

  it('filters tasks by status', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${wsId}/tasks?status=in_progress`,
    });
    const body = JSON.parse(res.body);
    expect(body.tasks.length).toBe(1);
    expect(body.tasks[0].status).toBe('in_progress');
  });

  it('deletes a task', async () => {
    const listRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${wsId}/tasks`,
    });
    const taskId = JSON.parse(listRes.body).tasks[0].id;

    const res = await injectWithAuth(server, {
      method: 'DELETE',
      url: `/api/workspaces/${wsId}/tasks/${taskId}`,
    });
    expect(res.statusCode).toBe(204);

    // Verify empty
    const afterRes = await injectWithAuth(server, {
      method: 'GET',
      url: `/api/workspaces/${wsId}/tasks`,
    });
    expect(JSON.parse(afterRes.body).tasks).toHaveLength(0);
  });

  it('returns 404 for non-existent task update', async () => {
    const res = await injectWithAuth(server, {
      method: 'PATCH',
      url: `/api/workspaces/${wsId}/tasks/nonexistent`,
      payload: { status: 'done' },
    });
    expect(res.statusCode).toBe(404);
  });
});
