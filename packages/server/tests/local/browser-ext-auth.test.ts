import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { securityMiddleware } from '../../src/local/security-middleware.js';
import { browserExtRoutes } from '../../src/local/routes/browser-ext.js';

const TEST_TOKEN = 'browser-ext-session-token';
const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`;
const OTHER_EXTENSION_ORIGIN = 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba';

async function createBrowserExtServer() {
  const server = Fastify({ logger: false });
  server.decorate('agentState', {
    wsSessionToken: TEST_TOKEN,
    activeWorkspaceId: 'workspace-1',
  });
  await server.register(securityMiddleware, { sessionToken: TEST_TOKEN });
  server.get('/api/memory/frames', async () => ({ ok: true }));
  await server.register(browserExtRoutes);
  await server.ready();
  return server;
}

describe('Browser Companion auth bootstrap', () => {
  const originalExtIds = process.env.WAGGLE_BROWSER_EXT_IDS;
  const originalTrustLocalhost = process.env.WAGGLE_TRUST_LOCALHOST;
  const originalDevAllow = process.env.WAGGLE_DEV_ALLOW_ANY_EXTENSION;

  beforeEach(() => {
    process.env.WAGGLE_TRUST_LOCALHOST = '0';
    process.env.WAGGLE_BROWSER_EXT_IDS = EXTENSION_ID;
    delete process.env.WAGGLE_DEV_ALLOW_ANY_EXTENSION;
  });

  afterEach(() => {
    if (originalExtIds === undefined) delete process.env.WAGGLE_BROWSER_EXT_IDS;
    else process.env.WAGGLE_BROWSER_EXT_IDS = originalExtIds;
    if (originalTrustLocalhost === undefined) delete process.env.WAGGLE_TRUST_LOCALHOST;
    else process.env.WAGGLE_TRUST_LOCALHOST = originalTrustLocalhost;
    if (originalDevAllow === undefined) delete process.env.WAGGLE_DEV_ALLOW_ANY_EXTENSION;
    else process.env.WAGGLE_DEV_ALLOW_ANY_EXTENSION = originalDevAllow;
  });

  it('returns the session token to an explicitly allowlisted extension origin without an existing bearer', async () => {
    const server = await createBrowserExtServer();
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/api/browser-ext/session-token',
        headers: { origin: EXTENSION_ORIGIN },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ token: TEST_TOKEN });
    } finally {
      await server.close();
    }
  });

  it('returns the session token to an allowlisted MV3 service-worker request without an Origin header', async () => {
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
      expect(res.json()).toEqual({ token: TEST_TOKEN });
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
        headers: { authorization: `Bearer ${TEST_TOKEN}` },
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
});
