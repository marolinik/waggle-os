/**
 * Browser Companion (FR-1) - explicit one-time pairing and health endpoints.
 * Imported-memory capture reuses the existing `/api/memory/frames` route.
 */

import type { FastifyInstance } from 'fastify';
import {
  BROWSER_COMPANION_CREDENTIAL_VAULT_KEY,
  BrowserCompanionPairing,
} from '../browser-companion-pairing.js';
import { browserExtensionIdAllowed, browserExtensionOriginAllowed } from '../cors-config.js';
import { isLoopbackBind } from '../net-config.js';

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function browserExtRoutes(server: FastifyInstance) {
  const pairing = new BrowserCompanionPairing();

  server.get('/api/browser-ext/session-token', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return reply.code(410).send({
      error: 'This Browser Companion version is no longer supported. Update the extension and pair it from Waggle Settings.',
      code: 'BROWSER_COMPANION_UPDATE_REQUIRED',
    });
  });

  server.post('/api/browser-ext/pairing-code', async (_request, reply) => {
    const code = pairing.generateCode();
    reply.header('Cache-Control', 'no-store');
    return code;
  });

  server.post<{ Body: { code?: string } }>('/api/browser-ext/pair', async (request, reply) => {
    if (!isLoopbackBind()) {
      return reply.code(403).send({
        error: 'Browser Companion pairing is available only on a loopback-bound sidecar.',
        code: 'SESSION_BOOTSTRAP_LOOPBACK_ONLY',
      });
    }
    const origin = headerValue(request.headers.origin);
    const extensionId = headerValue(request.headers['x-waggle-extension-id']);
    const secFetchSite = headerValue(request.headers['sec-fetch-site']);
    const isOriginAllowlisted = typeof extensionId === 'string'
      && origin === `chrome-extension://${extensionId}`
      && browserExtensionOriginAllowed(origin);
    const isOriginlessMv3Request = !origin
      && secFetchSite === 'none'
      && browserExtensionIdAllowed(extensionId);
    if (!isOriginAllowlisted && !isOriginlessMv3Request) {
      return reply.code(403).send({
        error: 'Browser Companion extension origin is not allowlisted.',
        code: 'EXTENSION_NOT_ALLOWLISTED',
      });
    }

    const rawCode = request.body?.code;
    if (typeof rawCode !== 'string' || !/^[A-HJ-NP-Z2-9]{8}$/i.test(rawCode.trim())) {
      return reply.code(403).send({
        error: 'The Browser Companion pairing code is invalid or expired.',
        code: 'PAIRING_CODE_INVALID',
      });
    }
    if (!server.vault) {
      return reply.code(503).send({
        error: 'Secure credential storage is unavailable.',
        code: 'PAIRING_STORAGE_UNAVAILABLE',
      });
    }
    const redeemed = pairing.redeem(rawCode);
    if (!redeemed) {
      return reply.code(403).send({
        error: 'The Browser Companion pairing code is invalid or expired.',
        code: 'PAIRING_CODE_INVALID',
      });
    }
    try {
      server.vault.set(BROWSER_COMPANION_CREDENTIAL_VAULT_KEY, redeemed.credentialHash, {
        credentialType: 'bearer_hash',
        extensionId,
        pairedAt: new Date().toISOString(),
      });
      server.agentState.browserCompanionCredentialHash = redeemed.credentialHash;
    } catch {
      return reply.code(503).send({
        error: 'Browser Companion pairing could not be stored securely.',
        code: 'PAIRING_STORAGE_UNAVAILABLE',
      });
    }

    reply.header('Cache-Control', 'no-store');
    return { token: redeemed.credential };
  });

  server.get('/api/browser-ext/pairing', async () => {
    const entry = server.vault?.get(BROWSER_COMPANION_CREDENTIAL_VAULT_KEY);
    return {
      paired: Boolean(server.agentState.browserCompanionCredentialHash),
      extensionId: typeof entry?.metadata?.extensionId === 'string'
        ? entry.metadata.extensionId
        : null,
      pairedAt: typeof entry?.metadata?.pairedAt === 'string'
        ? entry.metadata.pairedAt
        : null,
    };
  });

  server.delete('/api/browser-ext/pairing', async (_request, reply) => {
    pairing.clear();
    try {
      server.vault?.delete(BROWSER_COMPANION_CREDENTIAL_VAULT_KEY);
      server.agentState.browserCompanionCredentialHash = null;
      return { ok: true };
    } catch {
      return reply.code(503).send({
        error: 'Browser Companion pairing could not be revoked.',
        code: 'PAIRING_STORAGE_UNAVAILABLE',
      });
    }
  });

  server.get('/api/browser-ext/health', async () => {
    const activeWorkspaceId = server.agentState.activeWorkspaceId ?? null;
    return {
      ok: true,
      version: '0.1.0',
      activeWorkspaceId,
      activeWorkspace: activeWorkspaceId,
    };
  });
}
