/**
 * Browser Companion (FR-1) — /api/browser-ext
 *
 * Endpoint surface for the `apps/browser-ext` Chrome MV3 extension. Today
 * exposes a narrow token bootstrap plus health check so the extension can
 * pair with the local desktop; ingest + ask flows reuse the
 * existing `/api/memory/frames` and `/api/chat` endpoints rather than
 * duplicating them.
 *
 *   GET  /api/browser-ext/health  ->  { ok: true, version, activeWorkspaceId }
 *   GET  /api/browser-ext/session-token  ->  { token }
 */

import type { FastifyInstance } from 'fastify';
import { browserExtensionIdAllowed, browserExtensionOriginAllowed } from '../cors-config.js';

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function browserExtRoutes(server: FastifyInstance) {
  server.get('/api/browser-ext/session-token', async (request, reply) => {
    const origin = headerValue(request.headers.origin);
    const extensionId = headerValue(request.headers['x-waggle-extension-id']);
    const secFetchSite = headerValue(request.headers['sec-fetch-site']);
    const isOriginAllowlisted = browserExtensionOriginAllowed(origin);
    const isOriginlessMv3Request = !origin &&
      secFetchSite === 'none' &&
      browserExtensionIdAllowed(extensionId);
    if (!isOriginAllowlisted && !isOriginlessMv3Request) {
      return reply.code(403).send({
        error: 'Browser Companion extension origin is not allowlisted.',
        code: 'EXTENSION_NOT_ALLOWLISTED',
      });
    }

    return { token: server.agentState.wsSessionToken };
  });

  server.get('/api/browser-ext/health', async () => {
    const activeWorkspaceId = server.agentState.activeWorkspaceId ?? null;
    return {
      ok: true,
      version: '0.1.0',
      // The local sidecar currently owns only the active workspace id here.
      // The popup labels this honestly instead of presenting it as a name.
      activeWorkspaceId,
      // Kept for older extension builds that read activeWorkspace.
      activeWorkspace: activeWorkspaceId,
    };
  });
}
