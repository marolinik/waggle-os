/**
 * Workspace lifecycle route tests (UX-Northstar 2026-06-13 G1/G2).
 *
 * Covers the management surface the UI now exposes (WorkspaceActionsMenu):
 *  - PATCH/PUT accept `status` (archive/restore/pause) and `description`,
 *    persist via WorkspaceManager, and reject invalid status values with 400.
 *  - Rename round-trips.
 *  - DELETE closes the workspace mind before removing the directory.
 *
 * Scaffolding follows home.test.ts: Fastify inject + plain-object decorators,
 * but with a REAL WorkspaceManager on a tmp dir so persistence is verified.
 * localConfig is intentionally absent → emitAuditEvent stays a safe no-op.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { WorkspaceManager } from '@waggle/core';
import { workspaceRoutes, toStateItemViews } from '../../src/local/routes/workspaces.js';
import type { StateItem } from '../../src/local/workspace-state.js';

describe('workspace lifecycle routes', () => {
  let tmpDir: string;
  let manager: WorkspaceManager;
  let server: FastifyInstance;
  let closeWorkspaceMind: ReturnType<typeof vi.fn>;
  let wsId: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-ws-lifecycle-'));
    manager = new WorkspaceManager(tmpDir);
    wsId = manager.create({ name: 'Side Project', group: 'Personal' }).id;

    closeWorkspaceMind = vi.fn();
    server = Fastify({ logger: false });
    server.decorate('workspaceManager', manager);
    server.decorate('agentState', {
      activateWorkspaceMind: () => undefined,
      closeWorkspaceMind,
    });
    // localConfig intentionally absent — see file header.
    await server.register(workspaceRoutes);
  });

  afterEach(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('PATCH archives a workspace and persists the status', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/workspaces/${wsId}`,
      payload: { status: 'archived' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('archived');
    expect(manager.get(wsId)?.status).toBe('archived');
  });

  it('PATCH restores an archived workspace to active', async () => {
    manager.update(wsId, { status: 'archived' });
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/workspaces/${wsId}`,
      payload: { status: 'active' },
    });
    expect(res.statusCode).toBe(200);
    expect(manager.get(wsId)?.status).toBe('active');
  });

  it('PATCH rejects an invalid status with 400 and persists nothing', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/workspaces/${wsId}`,
      payload: { status: 'banana' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/Invalid status/);
    expect(manager.get(wsId)?.status).toBeUndefined();
  });

  it('PUT rejects an invalid status with 400', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/api/workspaces/${wsId}`,
      payload: { status: 'deleted' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT pauses a workspace and accepts a description', async () => {
    const res = await server.inject({
      method: 'PUT',
      url: `/api/workspaces/${wsId}`,
      payload: { status: 'paused', description: 'On hold until Q3' },
    });
    expect(res.statusCode).toBe(200);
    const stored = manager.get(wsId);
    expect(stored?.status).toBe('paused');
    expect(stored?.description).toBe('On hold until Q3');
  });

  it('PATCH renames a workspace', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/workspaces/${wsId}`,
      payload: { name: 'Client Alpha' },
    });
    expect(res.statusCode).toBe(200);
    expect(manager.get(wsId)?.name).toBe('Client Alpha');
    // Rename must not disturb identity or grouping
    expect(manager.get(wsId)?.id).toBe(wsId);
    expect(manager.get(wsId)?.group).toBe('Personal');
  });

  it('PATCH on an unknown workspace returns 404', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/workspaces/nope',
      payload: { status: 'archived' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('toStateItemViews produces unique ids when items share a sourceId', () => {
    // Multiple completed items from one session all carry the same sourceId —
    // the FE uses these ids as React keys, so collisions are a rendering bug
    // (live-observed as `completed:default-workspace` duplicate-key errors).
    const items: StateItem[] = [
      { content: 'a', sourceId: 'default-workspace' },
      { content: 'b', sourceId: 'default-workspace' },
      { content: 'c' },
    ] as StateItem[];
    const ids = toStateItemViews(items, 'completed').map(v => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('DELETE closes the workspace mind, removes the directory, and 404s after', async () => {
    const res = await server.inject({ method: 'DELETE', url: `/api/workspaces/${wsId}` });
    expect(res.statusCode).toBe(204);
    expect(closeWorkspaceMind).toHaveBeenCalledWith(wsId);
    expect(manager.get(wsId)).toBeNull();
    expect(fs.existsSync(path.join(tmpDir, 'workspaces', wsId))).toBe(false);

    const after = await server.inject({ method: 'DELETE', url: `/api/workspaces/${wsId}` });
    expect(after.statusCode).toBe(404);
  });
});
