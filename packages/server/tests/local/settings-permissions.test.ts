import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
    expect(body.defaultAutonomy).toBe('normal');
    expect(body.externalGates).toEqual([]);
    expect(body.workspaceOverrides).toEqual({});
    // P4: dead yoloMode field is gone from responses
    expect(body.yoloMode).toBeUndefined();
  });

  it('PUT /api/settings/permissions persists defaultAutonomy change', async () => {
    const putRes = await injectWithAuth(server, {
      method: 'PUT',
      url: '/api/settings/permissions',
      payload: {
        defaultAutonomy: 'trusted',
        externalGates: ['git push', 'rm -rf'],
        workspaceOverrides: { 'ws-1': ['deploy'] },
      },
    });
    expect(putRes.statusCode).toBe(200);
    const putBody = JSON.parse(putRes.body);
    expect(putBody.defaultAutonomy).toBe('trusted');
    expect(putBody.externalGates).toEqual(['git push', 'rm -rf']);
    expect(putBody.workspaceOverrides).toEqual({ 'ws-1': ['deploy'] });

    // Read back to verify persistence
    const getRes = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/settings/permissions',
    });
    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.body);
    expect(getBody.defaultAutonomy).toBe('trusted');
  });

  it('PUT /api/settings/permissions merges partial updates', async () => {
    // First, set known state
    await injectWithAuth(server, {
      method: 'PUT',
      url: '/api/settings/permissions',
      payload: {
        defaultAutonomy: 'yolo',
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
    // defaultAutonomy should be preserved from previous write
    expect(body.defaultAutonomy).toBe('yolo');
    expect(body.externalGates).toEqual(['curl POST', 'deploy']);
  });

  it('permissions.json file is created on disk with new schema', async () => {
    const permPath = path.join(tmpDir, 'permissions.json');
    expect(fs.existsSync(permPath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(permPath, 'utf-8'));
    expect(data).toHaveProperty('defaultAutonomy');
    expect(data).toHaveProperty('externalGates');
    expect(data).toHaveProperty('workspaceOverrides');
    expect(data.yoloMode).toBeUndefined();
  });

  // ── P4: legacy migration & validation ───────────────────────────────

  it('PUT accepts legacy yoloMode=true body and migrates to defaultAutonomy="yolo"', async () => {
    const res = await injectWithAuth(server, {
      method: 'PUT',
      url: '/api/settings/permissions',
      payload: { yoloMode: true },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).defaultAutonomy).toBe('yolo');
  });

  it('PUT accepts legacy yoloMode=false and migrates to defaultAutonomy="normal"', async () => {
    const res = await injectWithAuth(server, {
      method: 'PUT',
      url: '/api/settings/permissions',
      payload: { yoloMode: false },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).defaultAutonomy).toBe('normal');
  });

  it('PUT with both fields prefers the explicit defaultAutonomy over legacy yoloMode', async () => {
    const res = await injectWithAuth(server, {
      method: 'PUT',
      url: '/api/settings/permissions',
      payload: { defaultAutonomy: 'trusted', yoloMode: true },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).defaultAutonomy).toBe('trusted');
  });

  it('PUT rejects invalid defaultAutonomy values with 400', async () => {
    const res = await injectWithAuth(server, {
      method: 'PUT',
      url: '/api/settings/permissions',
      payload: { defaultAutonomy: 'wild' as unknown as 'normal' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBeTruthy();
  });

  it.each([
    { externalGates: ['git push', 7] },
    { workspaceOverrides: { 'ws-1': ['deploy'], 'ws-2': 'delete' } },
    { yoloMode: 'yes' },
    { unexpectedPermission: true },
  ])('PUT rejects malformed or unknown permission updates without changing stored policy: %j', async (payload) => {
    const permPath = path.join(tmpDir, 'permissions.json');
    const before = fs.readFileSync(permPath, 'utf-8');
    const res = await injectWithAuth(server, {
      method: 'PUT',
      url: '/api/settings/permissions',
      payload,
    });

    expect(res.statusCode).toBe(400);
    expect(fs.readFileSync(permPath, 'utf-8')).toBe(before);
    const healthy = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/settings/permissions',
    });
    expect(healthy.statusCode).toBe(200);
  });

  it('commits permission updates with a same-directory atomic rename', async () => {
    const permPath = path.join(tmpDir, 'permissions.json');
    const realRename = fs.renameSync.bind(fs);
    let renameAttempts = 0;
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      renameAttempts += 1;
      if (renameAttempts === 1) {
        const error = new Error('temporarily locked') as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      }
      return realRename(source, destination);
    });
    try {
      const res = await injectWithAuth(server, {
        method: 'PUT',
        url: '/api/settings/permissions',
        payload: { defaultAutonomy: 'trusted' },
      });

      expect(res.statusCode).toBe(200);
      expect(rename).toHaveBeenCalledTimes(2);
      expect(rename).toHaveBeenCalledWith(
        expect.stringMatching(/permissions\.json\..+\.tmp$/),
        permPath,
      );
      expect(path.dirname(String(rename.mock.calls[0]?.[0]))).toBe(path.dirname(permPath));
      expect(JSON.parse(fs.readFileSync(permPath, 'utf-8')).defaultAutonomy).toBe('trusted');
      expect(fs.readdirSync(tmpDir).filter((name) => name.startsWith('permissions.json.'))).toEqual([]);
    } finally {
      rename.mockRestore();
    }
  });

  it('fails closed on a corrupt policy and preserves it during partial updates', async () => {
    const permPath = path.join(tmpDir, 'permissions.json');
    const before = fs.readFileSync(permPath, 'utf-8');
    const corrupt = '{"defaultAutonomy":"yolo","externalGates":[';
    fs.writeFileSync(permPath, corrupt, 'utf-8');
    try {
      const getRes = await injectWithAuth(server, {
        method: 'GET',
        url: '/api/settings/permissions',
      });
      expect(getRes.statusCode).toBe(503);
      expect(JSON.parse(getRes.body).error).toMatch(/could not be read/i);

      const putRes = await injectWithAuth(server, {
        method: 'PUT',
        url: '/api/settings/permissions',
        payload: { defaultAutonomy: 'normal' },
      });
      expect(putRes.statusCode).toBe(409);
      expect(fs.readFileSync(permPath, 'utf-8')).toBe(corrupt);
    } finally {
      fs.writeFileSync(permPath, before, 'utf-8');
    }
  });

  it.each([
    JSON.stringify({
      defaultAutonomy: 'trusted',
      externalGates: ['git push', 7],
      workspaceOverrides: {},
    }),
    JSON.stringify({
      defaultAutonomy: 'trusted',
      externalGates: [],
      workspaceOverrides: {},
      futurePolicyField: true,
    }),
  ])('fails closed when persisted JSON has an invalid permission shape: %s', async (invalid) => {
    const permPath = path.join(tmpDir, 'permissions.json');
    const before = fs.readFileSync(permPath, 'utf-8');
    fs.writeFileSync(permPath, invalid, 'utf-8');
    try {
      const getRes = await injectWithAuth(server, {
        method: 'GET',
        url: '/api/settings/permissions',
      });
      expect(getRes.statusCode).toBe(503);

      const putRes = await injectWithAuth(server, {
        method: 'PUT',
        url: '/api/settings/permissions',
        payload: { defaultAutonomy: 'normal' },
      });
      expect(putRes.statusCode).toBe(409);
      expect(fs.readFileSync(permPath, 'utf-8')).toBe(invalid);
    } finally {
      fs.writeFileSync(permPath, before, 'utf-8');
    }
  });

  it('does not mistake an unreadable existing policy path for a missing file', async () => {
    const permPath = path.join(tmpDir, 'permissions.json');
    const before = fs.readFileSync(permPath, 'utf-8');
    fs.rmSync(permPath);
    fs.mkdirSync(permPath);
    try {
      const getRes = await injectWithAuth(server, {
        method: 'GET',
        url: '/api/settings/permissions',
      });
      expect(getRes.statusCode).toBe(503);

      const putRes = await injectWithAuth(server, {
        method: 'PUT',
        url: '/api/settings/permissions',
        payload: { defaultAutonomy: 'normal' },
      });
      expect(putRes.statusCode).toBe(409);
      expect(fs.statSync(permPath).isDirectory()).toBe(true);
    } finally {
      fs.rmSync(permPath, { recursive: true, force: true });
      fs.writeFileSync(permPath, before, 'utf-8');
    }
  });

  it('preserves the existing policy and removes temp files when atomic publication fails', async () => {
    const permPath = path.join(tmpDir, 'permissions.json');
    const before = fs.readFileSync(permPath, 'utf-8');
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      const error = new Error('file locked') as NodeJS.ErrnoException;
      error.code = 'EPERM';
      throw error;
    });
    try {
      const res = await injectWithAuth(server, {
        method: 'PUT',
        url: '/api/settings/permissions',
        payload: { defaultAutonomy: 'normal' },
      });

      expect(res.statusCode).toBe(503);
      expect(fs.readFileSync(permPath, 'utf-8')).toBe(before);
      expect(fs.readdirSync(tmpDir).filter((name) => name.startsWith('permissions.json.'))).toEqual([]);
    } finally {
      rename.mockRestore();
    }
  });

  it('GET migrates legacy permissions.json with yoloMode=true to defaultAutonomy="yolo"', async () => {
    // Simulate a file that predates P4 by writing raw yoloMode=true
    const permPath = path.join(tmpDir, 'permissions.json');
    fs.writeFileSync(
      permPath,
      JSON.stringify({ yoloMode: true, externalGates: ['x'], workspaceOverrides: {} }, null, 2),
      'utf-8',
    );

    const res = await injectWithAuth(server, {
      method: 'GET',
      url: '/api/settings/permissions',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.defaultAutonomy).toBe('yolo');
    expect(body.externalGates).toEqual(['x']);
    // Response should NOT carry the stale field forward
    expect(body.yoloMode).toBeUndefined();
  });
});
