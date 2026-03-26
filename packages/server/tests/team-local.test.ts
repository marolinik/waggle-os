import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildLocalServer } from '../src/local/index.js';
import { injectWithAuth } from './test-utils.js';

describe('Team local routes', () => {
  let server: Awaited<ReturnType<typeof buildLocalServer>>;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-team-test-'));
    // Create minimal directory structure
    fs.mkdirSync(path.join(tmpDir, 'workspaces'), { recursive: true });
    // Create a personal.mind file (empty SQLite — MindDB inits schema)
    fs.writeFileSync(path.join(tmpDir, 'personal.mind'), '');

    server = await buildLocalServer({
      dataDir: tmpDir,
      port: 0, // random port
      host: '127.0.0.1',
    });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('GET /api/team/status', () => {
    it('returns disconnected when no team configured', async () => {
      const response = await injectWithAuth(server, {
        method: 'GET',
        url: '/api/team/status',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.connected).toBe(false);
    });
  });

  describe('POST /api/team/connect', () => {
    it('returns 400 when serverUrl or token missing', async () => {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/team/connect',
        payload: { serverUrl: 'https://example.com' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 502 when team server is unreachable', async () => {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/team/connect',
        payload: {
          serverUrl: 'http://localhost:19999',
          token: 'test-token',
        },
      });

      // Should get 502 (bad gateway) or 504 (timeout)
      expect([502, 504]).toContain(response.statusCode);
    });
  });

  describe('GET /api/team/teams', () => {
    it('returns 401 when not connected to a team server', async () => {
      const response = await injectWithAuth(server, {
        method: 'GET',
        url: '/api/team/teams',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Not connected');
    });
  });

  describe('GET /api/team/presence', () => {
    it('returns empty members when not connected to a team server', async () => {
      const response = await injectWithAuth(server, {
        method: 'GET',
        url: '/api/team/presence?workspaceId=test-ws',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.members).toBeDefined();
      expect(body.members).toEqual([]);
    });
  });

  describe('GET /api/team/activity', () => {
    it('returns empty items when not connected to a team server', async () => {
      const response = await injectWithAuth(server, {
        method: 'GET',
        url: '/api/team/activity?workspaceId=test-ws',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items).toBeDefined();
      expect(body.items).toEqual([]);
    });
  });

  describe('POST /api/team/disconnect', () => {
    it('clears team config and returns success', async () => {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url: '/api/team/disconnect',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.disconnected).toBe(true);

      // Verify status is disconnected
      const statusRes = await injectWithAuth(server, {
        method: 'GET',
        url: '/api/team/status',
      });
      expect(JSON.parse(statusRes.body).connected).toBe(false);
    });
  });
});
