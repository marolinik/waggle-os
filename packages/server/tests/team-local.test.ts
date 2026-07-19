import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WaggleConfig } from '@waggle/core';
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
    // Set tier to TEAMS so team routes pass tier enforcement
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify({ tier: 'TEAMS' }));

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
      const previousAllowLocal = process.env.WAGGLE_ALLOW_LOCAL_FETCH;
      process.env.WAGGLE_ALLOW_LOCAL_FETCH = '1';
      try {
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
      } finally {
        if (previousAllowLocal === undefined) delete process.env.WAGGLE_ALLOW_LOCAL_FETCH;
        else process.env.WAGGLE_ALLOW_LOCAL_FETCH = previousAllowLocal;
      }
    });

    it('blocks cloud metadata targets before fetch or persistence', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      try {
        const response = await injectWithAuth(server, {
          method: 'POST',
          url: '/api/team/connect',
          payload: {
            serverUrl: 'https://169.254.169.254/latest/meta-data',
            token: 'metadata-token',
          },
        });

        expect(response.statusCode).toBe(502);
        expect(fetchMock).not.toHaveBeenCalled();
        const status = await injectWithAuth(server, { method: 'GET', url: '/api/team/status' });
        expect(JSON.parse(status.body).connected).toBe(false);
      } finally {
        vi.unstubAllGlobals();
        await injectWithAuth(server, { method: 'POST', url: '/api/team/disconnect' });
      }
    });

    it('rejects cleartext public Team URLs before sending the token', async () => {
      const previousAllowLocal = process.env.WAGGLE_ALLOW_LOCAL_FETCH;
      process.env.WAGGLE_ALLOW_LOCAL_FETCH = '1';
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      try {
        const response = await injectWithAuth(server, {
          method: 'POST',
          url: '/api/team/connect',
          payload: { serverUrl: 'http://93.184.216.34', token: 'public-http-token' },
        });

        expect(response.statusCode).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
        if (previousAllowLocal === undefined) delete process.env.WAGGLE_ALLOW_LOCAL_FETCH;
        else process.env.WAGGLE_ALLOW_LOCAL_FETCH = previousAllowLocal;
        await injectWithAuth(server, { method: 'POST', url: '/api/team/disconnect' });
      }
    });

    it('accepts a public HTTPS Team URL and stores its canonical base', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
        .mockResolvedValueOnce(new Response('[]', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      try {
        const response = await injectWithAuth(server, {
          method: 'POST',
          url: '/api/team/connect',
          payload: { serverUrl: 'https://93.184.216.34/team/', token: 'public-https-token' },
        });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).serverUrl).toBe('https://93.184.216.34/team');
        expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
          'https://93.184.216.34/team/health',
          'https://93.184.216.34/team/api/teams',
        ]);
        expect(fetchMock.mock.calls.every(([, init]) => init?.redirect === 'manual')).toBe(true);
      } finally {
        vi.unstubAllGlobals();
        await injectWithAuth(server, { method: 'POST', url: '/api/team/disconnect' });
      }
    });

    it('rejects Team URLs containing credentials before fetch or persistence', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      try {
        const response = await injectWithAuth(server, {
          method: 'POST',
          url: '/api/team/connect',
          payload: { serverUrl: 'https://user:pass@93.184.216.34', token: 'userinfo-token' },
        });

        expect(response.statusCode).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
        await injectWithAuth(server, { method: 'POST', url: '/api/team/disconnect' });
      }
    });

    it('does not forward a Team token across redirects', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
        status: 302,
        headers: { location: 'https://169.254.169.254/latest/meta-data' },
      }));
      vi.stubGlobal('fetch', fetchMock);
      try {
        const response = await injectWithAuth(server, {
          method: 'POST',
          url: '/api/team/connect',
          payload: { serverUrl: 'https://93.184.216.34', token: 'redirect-token' },
        });

        expect(response.statusCode).toBe(502);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][1]?.redirect).toBe('manual');
        const status = await injectWithAuth(server, { method: 'GET', url: '/api/team/status' });
        expect(JSON.parse(status.body).connected).toBe(false);
      } finally {
        vi.unstubAllGlobals();
        await injectWithAuth(server, { method: 'POST', url: '/api/team/disconnect' });
      }
    });

    it('rejects a legacy persisted cleartext public Team URL before sending its token', async () => {
      const config = new WaggleConfig(tmpDir);
      config.setTeamServer({
        url: 'http://93.184.216.34',
        token: 'legacy-cleartext-token',
        userId: 'legacy-user',
        displayName: 'Legacy User',
      });
      config.save();
      const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      try {
        const response = await injectWithAuth(server, {
          method: 'GET',
          url: '/api/team/teams',
        });

        expect(response.statusCode).toBe(502);
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
        await injectWithAuth(server, { method: 'POST', url: '/api/team/disconnect' });
      }
    });

    it('allows an explicitly enabled loopback Team server without following redirects', async () => {
      const previousAllowLocal = process.env.WAGGLE_ALLOW_LOCAL_FETCH;
      process.env.WAGGLE_ALLOW_LOCAL_FETCH = '1';
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
        .mockResolvedValueOnce(new Response('[]', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      try {
        const response = await injectWithAuth(server, {
          method: 'POST',
          url: '/api/team/connect',
          payload: { serverUrl: 'http://127.0.0.1:19999/', token: 'local-token' },
        });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body).serverUrl).toBe('http://127.0.0.1:19999');
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls.every(([, init]) => init?.redirect === 'manual')).toBe(true);
      } finally {
        vi.unstubAllGlobals();
        if (previousAllowLocal === undefined) delete process.env.WAGGLE_ALLOW_LOCAL_FETCH;
        else process.env.WAGGLE_ALLOW_LOCAL_FETCH = previousAllowLocal;
        await injectWithAuth(server, { method: 'POST', url: '/api/team/disconnect' });
      }
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
