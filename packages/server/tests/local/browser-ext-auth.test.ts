import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { InjectOptions } from 'fastify';
import type { VaultStore } from '@waggle/core';
import type { AgentState } from '../../src/local/index.js';
import { securityMiddleware } from '../../src/local/security-middleware.js';
import { browserExtRoutes } from '../../src/local/routes/browser-ext.js';
import {
  BROWSER_COMPANION_CREDENTIAL_VAULT_KEY,
  hashBrowserCompanionCredential,
} from '../../src/local/browser-companion-pairing.js';

const TEST_TOKEN = 'global-session-token';
const TEST_BROWSER_TOKEN = 'browser-companion-scoped-token';
const FABRICATED_LEGACY_TOKEN = 'fabricated-legacy-browser-token';
const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`;

async function createBrowserExtServer() {
  const server = Fastify({ logger: false });
  const vaultEntries = new Map<string, { value: string; metadata?: Record<string, unknown> }>();
  server.decorate('vault', {
    get: (name: string) => vaultEntries.get(name) ?? null,
    set: (name: string, value: string, metadata?: Record<string, unknown>) => {
      vaultEntries.set(name, { value, metadata });
    },
    delete: (name: string) => vaultEntries.delete(name),
    // Deliberate partial double: the routes read only get/set/delete and `value`.
  } as unknown as VaultStore);
  server.decorate('agentState', {
    wsSessionToken: TEST_TOKEN,
    browserCompanionCredentialHash: hashBrowserCompanionCredential(TEST_BROWSER_TOKEN),
    activeWorkspaceId: 'workspace-1',
    // Deliberate partial double: the auth path reads only these fields.
  } as unknown as AgentState);
  await server.register(securityMiddleware, {
    sessionToken: TEST_TOKEN,
    authenticateBrowserCompanionToken: (token) => (
      server.agentState.browserCompanionCredentialHash === hashBrowserCompanionCredential(token)
    ),
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

  it('returns upgrade guidance without a credential from the retired bootstrap endpoint', async () => {
    const server = await createBrowserExtServer();
    try {
      const publicRequest = await server.inject({
        method: 'GET',
        url: '/api/browser-ext/session-token',
        headers: {
          'x-waggle-extension-id': EXTENSION_ID,
          'sec-fetch-site': 'none',
        },
      });
      const authenticatedRequest = await server.inject({
        method: 'GET',
        url: '/api/browser-ext/session-token',
        headers: { authorization: `Bearer ${TEST_TOKEN}` },
      });

      expect(publicRequest.statusCode).toBe(410);
      expect(publicRequest.headers['cache-control']).toBe('no-store');
      expect(publicRequest.json().code).toBe('BROWSER_COMPANION_UPDATE_REQUIRED');
      expect(publicRequest.json()).not.toHaveProperty('token');
      expect(authenticatedRequest.statusCode).toBe(410);
      expect(authenticatedRequest.json().code).toBe('BROWSER_COMPANION_UPDATE_REQUIRED');
      expect(authenticatedRequest.json()).not.toHaveProperty('token');
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

  it('requires a desktop-minted one-time code instead of automatic extension-id bootstrap', async () => {
    const server = await createBrowserExtServer();
    try {
      const codeRes = await server.inject({
        method: 'POST',
        url: '/api/browser-ext/pairing-code',
        headers: { authorization: `Bearer ${TEST_TOKEN}` },
      });

      expect(codeRes.statusCode).toBe(200);
      expect(codeRes.headers['cache-control']).toBe('no-store');
      expect(codeRes.json().code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

      const pairRes = await server.inject({
        method: 'POST',
        url: '/api/browser-ext/pair',
        headers: {
          'x-waggle-extension-id': EXTENSION_ID,
          'sec-fetch-site': 'none',
        },
        payload: { code: codeRes.json().code },
      });
      const pairedToken = pairRes.json().token as string;

      expect(pairRes.statusCode).toBe(200);
      expect(pairRes.headers['cache-control']).toBe('no-store');
      expect(pairedToken).not.toBe(TEST_TOKEN);
      expect(pairedToken).not.toBe(TEST_BROWSER_TOKEN);
      const storedCredential = server.vault?.get(BROWSER_COMPANION_CREDENTIAL_VAULT_KEY);
      expect(storedCredential?.value).toBe(hashBrowserCompanionCredential(pairedToken));
      expect(storedCredential?.value).not.toContain(pairedToken);

      const healthRes = await server.inject({
        method: 'GET',
        url: '/api/browser-ext/health',
        headers: { authorization: `Bearer ${pairedToken}` },
      });
      expect(healthRes.statusCode).toBe(200);

      const replayRes = await server.inject({
        method: 'POST',
        url: '/api/browser-ext/pair',
        headers: {
          'x-waggle-extension-id': EXTENSION_ID,
          'sec-fetch-site': 'none',
        },
        payload: { code: codeRes.json().code },
      });
      expect(replayRes.statusCode).toBe(403);
      expect(replayRes.json().code).toBe('PAIRING_CODE_INVALID');

      const statusRes = await server.inject({
        method: 'GET',
        url: '/api/browser-ext/pairing',
        headers: { authorization: `Bearer ${TEST_TOKEN}` },
      });
      expect(statusRes.json()).toMatchObject({ paired: true, extensionId: EXTENSION_ID });

      const revokeRes = await server.inject({
        method: 'DELETE',
        url: '/api/browser-ext/pairing',
        headers: { authorization: `Bearer ${TEST_TOKEN}` },
      });
      expect(revokeRes.statusCode).toBe(200);
      expect(server.vault?.get(BROWSER_COMPANION_CREDENTIAL_VAULT_KEY)).toBeNull();

      const revokedHealth = await server.inject({
        method: 'GET',
        url: '/api/browser-ext/health',
        headers: { authorization: `Bearer ${pairedToken}` },
      });
      expect(revokedHealth.statusCode).toBe(401);
      expect(revokedHealth.json().code).toBe('INVALID_TOKEN');
    } finally {
      await server.close();
    }
  });

  it('does not let a distinct extension replay the public id without a pairing code', async () => {
    const server = await createBrowserExtServer();
    try {
      const res = await server.inject({
        method: 'POST',
        url: '/api/browser-ext/pair',
        headers: {
          'x-waggle-extension-id': EXTENSION_ID,
          'sec-fetch-site': 'none',
        },
        payload: { code: 'BADCODE2' },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('PAIRING_CODE_INVALID');
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

  it.each<[NonNullable<InjectOptions['method']>, string]>([
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

  it('rejects a fabricated legacy per-process credential', async () => {
    const restartedServer = await createBrowserExtServer();
    try {
      const res = await restartedServer.inject({
        method: 'GET',
        url: '/api/browser-ext/health',
        headers: { authorization: `Bearer ${FABRICATED_LEGACY_TOKEN}` },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('INVALID_TOKEN');
    } finally {
      await restartedServer.close();
    }
  });
});
