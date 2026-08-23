import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { MindDB } from '@waggle/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildLocalServer } from '../../src/local/index.js';
import {
  BROWSER_COMPANION_CREDENTIAL_VAULT_KEY,
  hashBrowserCompanionCredential,
} from '../../src/local/browser-companion-pairing.js';
import { injectWithAuth } from '../test-utils.js';

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const ENV_NAMES = [
  'WAGGLE_TRUST_LOCALHOST',
  'WAGGLE_BROWSER_EXT_IDS',
  'WAGGLE_HOST',
  'WAGGLE_DEV_ALLOW_ANY_EXTENSION',
] as const;

describe('Browser Companion pairing lifecycle', () => {
  const originalEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const name of ENV_NAMES) originalEnv.set(name, process.env[name]);
    process.env.WAGGLE_TRUST_LOCALHOST = '0';
    process.env.WAGGLE_BROWSER_EXT_IDS = EXTENSION_ID;
    delete process.env.WAGGLE_HOST;
    delete process.env.WAGGLE_DEV_ALLOW_ANY_EXTENSION;
  });

  afterEach(() => {
    for (const [name, value] of originalEnv) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    originalEnv.clear();
  });

  it('persists only paired credential hash and persists revocation across restarts', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-browser-pairing-'));
    let server1: FastifyInstance | undefined;
    let server2: FastifyInstance | undefined;
    let server3: FastifyInstance | undefined;

    try {
      fs.mkdirSync(path.join(dataDir, 'skills'), { recursive: true });
      fs.writeFileSync(path.join(dataDir, 'skills', '.starter-installed'), 'test');
      new MindDB(path.join(dataDir, 'personal.mind')).close();

      server1 = await buildLocalServer({ dataDir });
      const firstGlobalToken = server1.agentState.wsSessionToken;
      const firstCode = await injectWithAuth(server1, {
        method: 'POST',
        url: '/api/browser-ext/pairing-code',
      });
      const firstPair = await server1.inject({
        method: 'POST',
        url: '/api/browser-ext/pair',
        headers: {
          'x-waggle-extension-id': EXTENSION_ID,
          'sec-fetch-site': 'none',
        },
        payload: { code: firstCode.json().code },
      });
      expect(firstPair.statusCode).toBe(200);
      const firstCredential = firstPair.json().token as string;
      const stored = server1.vault?.get(BROWSER_COMPANION_CREDENTIAL_VAULT_KEY);
      expect(stored?.value).toBe(hashBrowserCompanionCredential(firstCredential));
      expect(stored?.value).not.toContain(firstCredential);
      const pendingAcrossRestart = await injectWithAuth(server1, {
        method: 'POST',
        url: '/api/browser-ext/pairing-code',
      });

      await server1.close();
      server1 = undefined;
      server2 = await buildLocalServer({ dataDir });

      expect(server2.agentState.wsSessionToken).not.toBe(firstGlobalToken);
      const staleGlobal = await server2.inject({
        method: 'GET',
        url: '/api/browser-ext/pairing',
        headers: { authorization: `Bearer ${firstGlobalToken}` },
      });
      expect(staleGlobal.statusCode).toBe(401);
      const persistedHealth = await server2.inject({
        method: 'GET',
        url: '/api/browser-ext/health',
        headers: { authorization: `Bearer ${firstCredential}` },
      });
      expect(persistedHealth.statusCode).toBe(200);
      const persistedStatus = await injectWithAuth(server2, {
        method: 'GET',
        url: '/api/browser-ext/pairing',
      });
      expect(persistedStatus.json()).toMatchObject({ paired: true, extensionId: EXTENSION_ID });

      const staleCode = await server2.inject({
        method: 'POST',
        url: '/api/browser-ext/pair',
        headers: {
          'x-waggle-extension-id': EXTENSION_ID,
          'sec-fetch-site': 'none',
        },
        payload: { code: pendingAcrossRestart.json().code },
      });
      expect(staleCode.statusCode).toBe(403);
      expect(staleCode.json().code).toBe('PAIRING_CODE_INVALID');

      const replacementCode = await injectWithAuth(server2, {
        method: 'POST',
        url: '/api/browser-ext/pairing-code',
      });
      const replacementPair = await server2.inject({
        method: 'POST',
        url: '/api/browser-ext/pair',
        headers: {
          'x-waggle-extension-id': EXTENSION_ID,
          'sec-fetch-site': 'none',
        },
        payload: { code: replacementCode.json().code },
      });
      expect(replacementPair.statusCode).toBe(200);
      const replacementCredential = replacementPair.json().token as string;
      const rotatedHealth = await server2.inject({
        method: 'GET',
        url: '/api/browser-ext/health',
        headers: { authorization: `Bearer ${firstCredential}` },
      });
      expect(rotatedHealth.statusCode).toBe(401);

      const revoke = await injectWithAuth(server2, {
        method: 'DELETE',
        url: '/api/browser-ext/pairing',
      });
      expect(revoke.statusCode).toBe(200);
      await server2.close();
      server2 = undefined;
      server3 = await buildLocalServer({ dataDir });

      const revokedStatus = await injectWithAuth(server3, {
        method: 'GET',
        url: '/api/browser-ext/pairing',
      });
      expect(revokedStatus.json()).toMatchObject({ paired: false, extensionId: null });
      const revokedHealth = await server3.inject({
        method: 'GET',
        url: '/api/browser-ext/health',
        headers: { authorization: `Bearer ${replacementCredential}` },
      });
      expect(revokedHealth.statusCode).toBe(401);
    } finally {
      if (server1) await server1.close();
      if (server2) await server2.close();
      if (server3) await server3.close();
      await new Promise((resolve) => setTimeout(resolve, 100));
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, 30_000);
});
