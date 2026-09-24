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
import { MindDB, VaultStore, WorkspaceManager } from '@waggle/core';
import { workspaceRoutes, toStateItemViews } from '../../src/local/routes/workspaces.js';
import type { StateItem } from '../../src/local/workspace-state.js';

describe('workspace lifecycle routes', () => {
  let tmpDir: string;
  let manager: WorkspaceManager;
  let server: FastifyInstance;
  let closeWorkspaceMind: ReturnType<typeof vi.fn>;
  let wsId: string;
  let personal: MindDB;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-ws-lifecycle-'));
    manager = new WorkspaceManager(tmpDir);
    wsId = manager.create({ name: 'Side Project', group: 'Personal' }).id;

    closeWorkspaceMind = vi.fn();
    server = Fastify({ logger: false });
    server.decorate('workspaceManager', manager);
    // A workspace delete pseudonymizes the personal mind's interaction log
    // with a vault key (D-1), so both are real.
    personal = new MindDB(path.join(tmpDir, 'personal.mind'));
    server.decorate('multiMind', { personal } as unknown as FastifyInstance['multiMind']);
    server.decorate('vault', new VaultStore(tmpDir));
    // Deliberate partial double: only the members the workspace routes read.
    server.decorate('agentState', {
      activateWorkspaceMind: () => undefined,
      closeWorkspaceMind,
    } as unknown as FastifyInstance['agentState']);
    // localConfig intentionally absent — see file header.
    await server.register(workspaceRoutes);
  });

  afterEach(async () => {
    await server.close();
    try { personal.close(); } catch { /* a test closed it already */ }
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

  it('PATCH normalizes the legacy persona alias and accepts safe type metadata', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/workspaces/${wsId}`,
      payload: { persona: 'coder', type: 'project' },
    });

    expect(res.statusCode).toBe(200);
    const stored = manager.get(wsId);
    expect(stored?.personaId).toBe('coder');
    expect(stored?.type).toBe('project');
    expect(stored).not.toHaveProperty('persona');
  });

  it.each([
    ['storageType', 'local'],
    ['storagePath', 'C:\\outside'],
    ['storageConfig', { bucket: 'outside' }],
    ['directory', 'C:\\outside'],
  ] as const)('PUT and PATCH reject immutable %s updates', async (field, value) => {
    const before = manager.get(wsId);

    for (const method of ['PUT', 'PATCH'] as const) {
      const res = await server.inject({
        method,
        url: `/api/workspaces/${wsId}`,
        payload: { [field]: value },
      });

      expect(res.statusCode).toBe(400);
      expect(manager.get(wsId)).toEqual(before);
    }
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

  it('DELETE keeps the workspace when its interaction log cannot be pseudonymized (D-1)', async () => {
    const rollback = vi.fn();
    closeWorkspaceMind.mockResolvedValue({ release: vi.fn(), rollback });
    personal.close(); // pseudonymization now throws: the database is not open

    const res = await server.inject({ method: 'DELETE', url: `/api/workspaces/${wsId}` });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe('governance_pseudonymization_failed');
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(manager.get(wsId)).not.toBeNull();
  });
});
