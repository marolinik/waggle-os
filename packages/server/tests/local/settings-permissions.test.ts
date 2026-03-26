import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, FrameStore, SessionStore } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

describe('Permission settings API', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-perms-test-'));

    // Create personal.mind (required by server startup)
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('test-project');
    frames.createIFrame(s1.gop_id, 'test content', 'normal');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /api/settings/permissions returns defaults', async () => {
    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/settings/permissions',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.yoloMode).toBe(false);
    expect(body.externalGates).toEqual([]);
    expect(body.workspaceOverrides).toEqual({});
  });

  it('PUT /api/settings/permissions persists changes', async () => {
    // Write new permissions
    const putRes = await injectWithAuth(server, {
      method: 'PUT',
      url: '/api/settings/permissions',
      payload: {
        yoloMode: true,
        externalGates: ['git push', 'rm -rf'],
        workspaceOverrides: { 'ws-1': ['deploy'] },
      },
    });
    expect(putRes.statusCode).toBe(200);
    const putBody = JSON.parse(putRes.body);
    expect(putBody.yoloMode).toBe(true);
    expect(putBody.externalGates).toEqual(['git push', 'rm -rf']);
    expect(putBody.workspaceOverrides).toEqual({ 'ws-1': ['deploy'] });

    // Read back to verify persistence
    const getRes = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/settings/permissions',
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.yoloMode).toBe(true);
    expect(getBody.externalGates).toEqual(['git push', 'rm -rf']);
    expect(getBody.workspaceOverrides).toEqual({ 'ws-1': ['deploy'] });
  });

  it('PUT /api/settings/permissions merges partial updates', async () => {
    // First, set known state
    await injectWithAuth(server, {
      method: 'PUT',
      url: '/api/settings/permissions',
      payload: {
        yoloMode: true,
        externalGates: ['git push'],
        workspaceOverrides: {},
      },
    });

    // Now update only externalGates
    const putRes = await injectWithAuth(server, {
      method: 'PUT',
      url: '/api/settings/permissions',
      payload: {
        externalGates: ['curl POST', 'deploy'],
      },
    });
    expect(putRes.statusCode).toBe(200);
    const body = JSON.parse(putRes.body);
    // yoloMode should be preserved from previous write
    expect(body.yoloMode).toBe(true);
    expect(body.externalGates).toEqual(['curl POST', 'deploy']);
  });

  it('permissions.json file is created on disk', async () => {
    const permPath = path.join(tmpDir, 'permissions.json');
    expect(fs.existsSync(permPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(permPath, 'utf-8'));
    expect(data).toHaveProperty('yoloMode');
    expect(data).toHaveProperty('externalGates');
    expect(data).toHaveProperty('workspaceOverrides');
  });
});
