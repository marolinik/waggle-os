import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { securityMiddleware } from '../../src/local/security-middleware.js';
import { browserExtRoutes } from '../../src/local/routes/browser-ext.js';

const TEST_TOKEN = 'global-session-token';
const TEST_BROWSER_TOKEN = 'browser-companion-scoped-token';
const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`;
const OTHER_EXTENSION_ORIGIN = 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba';

async function createBrowserExtServer(browserToken = TEST_BROWSER_TOKEN) {
  const server = Fastify({ logger: false });
  server.decorate('agentState', {
    wsSessionToken: TEST_TOKEN,
    browserCompanionToken: browserToken,
    activeWorkspaceId: 'workspace-1',
  });
  await server.register(securityMiddleware, {
    sessionToken: TEST_TOKEN,
    browserCompanionToken: browserToken,
  });
  server.get('/api/memory/frames', async () => ({ ok: true }));
  server.post('/api/memory/frames', async (request) => ({ ok: true, body: request.body }));
  server.get('/api/private', async () => ({ ok: true }));
  server.post('/api/chat', async () => ({ ok: true }));
  server.post('/api/agents/test/run', async () => ({ ok: true }));
  server.post('/api/tools/launch', async () => ({ ok: true }));
  server.post('/api/vault/test/reveal', async () => ({ ok: true }));
  server.post('/v1/chat/completions', async () => ({ ok: true }));
  await server.register(browserExtRoutes);
  await server.ready();
  return server;
}

describe('Browser Companion auth bootstrap', () => {
  const originalExtIds = process.env.WAGGLE_BROWSER_EXT_IDS;
  const originalTrustLocalhost = process.env.WAGGLE_TRUST_LOCALHOST;
  const originalDevAllow = process.env.WAGGLE_DEV_ALLOW_ANY_EXTENSION;
  const originalHost = process.env.WAGGLE_HOST;

  beforeEach(() => {
    process.env.WAGGLE_TRUST_LOCALHOST = '0';
    process.env.WAGGLE_BROWSER_EXT_IDS = EXTENSION_ID;
    delete process.env.WAGGLE_HOST;
    delete process.env.WAGGLE_DEV_ALLOW_ANY_EXTENSION;
  });

  afterEach(() => {
    if (originalExtIds === undefined) delete process.env.WAGGLE_BROWSER_EXT_IDS;
    else process.env.WAGGLE_BROWSER_EXT_IDS = originalExtIds;
    if (originalTrustLocalhost === undefined) delete process.env.WAGGLE_TRUST_LOCALHOST;
    else process.env.WAGGLE_TRUST_LOCALHOST = originalTrustLocalhost;
    if (originalDevAllow === undefined) delete process.env.WAGGLE_DEV_ALLOW_ANY_EXTENSION;
    else process.env.WAGGLE_DEV_ALLOW_ANY_EXTENSION = originalDevAllow;
    if (originalHost === undefined) delete process.env.WAGGLE_HOST;
    else process.env.WAGGLE_HOST = originalHost;
  });

  it('returns a scoped token, never the process bearer, to an allowlisted extension origin', async () => {
    const server = await createBrowserExtServer();
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/api/browser-ext/session-token',
        headers: { origin: EXTENSION_ORIGIN },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.json()).toEqual({ token: TEST_BROWSER_TOKEN });
      expect(res.json().token).not.toBe(TEST_TOKEN);
    } finally {
      await server.close();
    }
  });

  it('does not expose the process bearer to extension headers on a non-loopback bind', async () => {
    process.env.WAGGLE_HOST = '0.0.0.0';
    const server = await createBrowserExtServer();
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/api/browser-ext/session-token',
        headers: {
          'x-waggle-extension-id': EXTENSION_ID,
          'sec-fetch-site': 'none',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('SESSION_BOOTSTRAP_LOOPBACK_ONLY');
    } finally {
      await server.close();
    }
  });

  it('returns the scoped token to an allowlisted MV3 service-worker request without an Origin header', async () => {
    const server = await createBrowserExtServer();
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/api/browser-ext/session-token',
        headers: {
          'x-waggle-extension-id': EXTENSION_ID,
          'sec-fetch-site': 'none',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ token: TEST_BROWSER_TOKEN });
    } finally {
      await server.close();
    }
  });

  it('rejects the token bootstrap for unallowlisted extension origins', async () => {
    const server = await createBrowserExtServer();
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/api/browser-ext/session-token',
        headers: { origin: OTHER_EXTENSION_ORIGIN },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('EXTENSION_NOT_ALLOWLISTED');
    } finally {
      await server.close();
    }
  });

  it('rejects MV3 service-worker token bootstrap when the extension id header is missing', async () => {
    const server = await createBrowserExtServer();
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/api/browser-ext/session-token',
        headers: { 'sec-fetch-site': 'none' },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('EXTENSION_NOT_ALLOWLISTED');
    } finally {
      await server.close();
    }
  });

  it('rejects MV3 service-worker token bootstrap with an unallowlisted extension id header', async () => {
    const server = await createBrowserExtServer();
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/api/browser-ext/session-token',
        headers: {
          'x-waggle-extension-id': 'ponmlkjihgfedcbaponmlkjihgfedcba',
          'sec-fetch-site': 'none',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('EXTENSION_NOT_ALLOWLISTED');
    } finally {
      await server.close();
    }
  });

  it('does not let an allowlisted extension skip bearer auth on normal API routes', async () => {
    const server = await createBrowserExtServer();
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/api/memory/frames',
        headers: { origin: EXTENSION_ORIGIN },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('MISSING_TOKEN');
    } finally {
      await server.close();
    }
  });

  it('labels the health workspace value as an id while preserving the legacy field', async () => {
    const server = await createBrowserExtServer();
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/api/browser-ext/health',
        headers: { authorization: `Bearer ${TEST_BROWSER_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        ok: true,
        activeWorkspaceId: 'workspace-1',
        activeWorkspace: 'workspace-1',
      });
    } finally {
      await server.close();
    }
  });

  it('accepts the scoped token for personal imported-memory ingestion', async () => {
    const server = await createBrowserExtServer();
    try {
      const res = await server.inject({
        method: 'POST',
        url: '/api/memory/frames',
        headers: { authorization: `Bearer ${TEST_BROWSER_TOKEN}` },
        payload: { content: 'Captured page note', source: 'import', importance: 'normal' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true });
    } finally {
      await server.close();
    }
  });

  it('accepts low-importance full-page capture with the scoped token', async () => {
    const server = await createBrowserExtServer();
    try {
      const res = await server.inject({
        method: 'POST',
        url: '/api/memory/frames',
        headers: { authorization: `Bearer ${TEST_BROWSER_TOKEN}` },
        payload: { content: 'Captured full page', source: 'import', importance: 'low' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true });
    } finally {
      await server.close();
    }
  });

  it('does not narrow the process bearer used by trusted sidecar clients', async () => {
    const server = await createBrowserExtServer();
    try {
      const privateRes = await server.inject({
        method: 'GET',
        url: '/api/private',
        headers: { authorization: `Bearer ${TEST_TOKEN}` },
      });
      const memoryRes = await server.inject({
        method: 'POST',
        url: '/api/memory/frames',
        headers: { authorization: `Bearer ${TEST_TOKEN}` },
        payload: {
          content: 'Trusted workspace note',
          workspaceId: 'workspace-1',
          source: 'user_stated',
          importance: 'critical',
        },
      });

      expect(privateRes.statusCode).toBe(200);
      expect(memoryRes.statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });

  it.each([
    ['workspace target', { content: 'note', source: 'import', workspace: 'workspace-1' }],
    ['empty workspace target', { content: 'note', source: 'import', workspace: '' }],
    ['null workspace target', { content: 'note', source: 'import', workspace: null }],
    ['workspaceId target', { content: 'note', source: 'import', workspaceId: 'workspace-1' }],
    ['empty workspaceId target', { content: 'note', source: 'import', workspaceId: '' }],
    ['null workspaceId target', { content: 'note', source: 'import', workspaceId: null }],
    ['non-import source', { content: 'note', source: 'user_stated' }],
    ['elevated importance', { content: 'note', source: 'import', importance: 'critical' }],
    ['non-object body', ['note']],
  ])('rejects scoped-token memory escalation through %s', async (_label, payload) => {
    const server = await createBrowserExtServer();
    try {
      const res = await server.inject({
        method: 'POST',
        url: '/api/memory/frames',
        headers: { authorization: `Bearer ${TEST_BROWSER_TOKEN}` },
        payload,
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('BROWSER_COMPANION_SCOPE_VIOLATION');
    } finally {
      await server.close();
    }
  });

  it.each([
    ['GET', '/api/memory/frames'],
    ['GET', '/api/private'],
    ['HEAD', '/api/browser-ext/health'],
    ['PUT', '/api/memory/frames'],
    ['PATCH', '/api/memory/frames'],
    ['DELETE', '/api/memory/frames'],
    ['POST', '/api/memory/frames/'],
    ['POST', '/api/chat'],
    ['POST', '/api/agents/test/run'],
    ['POST', '/api/tools/launch'],
    ['POST', '/api/vault/test/reveal'],
    ['POST', '/v1/chat/completions'],
  ])('rejects the scoped token on %s %s outside its route scope', async (method, url) => {
    const server = await createBrowserExtServer();
    try {
      const res = await server.inject({
        method,
        url,
        headers: { authorization: `Bearer ${TEST_BROWSER_TOKEN}` },
      });

      expect(res.statusCode).toBe(401);
      if (method !== 'HEAD') {
        expect(res.json().code).toBe('INVALID_TOKEN');
      }
    } finally {
      await server.close();
    }
  });

  it('rejects a stale scoped token after the sidecar token rotates', async () => {
    const oldServer = await createBrowserExtServer('old-browser-token');
    await oldServer.close();
    const restartedServer = await createBrowserExtServer('new-browser-token');
    try {
      const res = await restartedServer.inject({
        method: 'GET',
        url: '/api/browser-ext/health',
        headers: { authorization: 'Bearer old-browser-token' },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('INVALID_TOKEN');
    } finally {
      await restartedServer.close();
    }
  });
});
