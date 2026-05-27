/**
 * Browser Companion (FR-1) — /api/browser-ext
 *
 * Endpoint surface for the `apps/browser-ext` Chrome MV3 extension. Today
 * only exposes a health check so the extension's status indicator can
 * confirm the Waggle desktop is reachable; ingest + ask flows reuse the
 * existing `/api/memory/frames` and `/api/chat` endpoints rather than
 * duplicating them.
 *
 *   GET  /api/browser-ext/health  →  { ok: true, version, workspace }
 */

import type { FastifyInstance } from 'fastify';

export async function browserExtRoutes(server: FastifyInstance) {
  server.get('/api/browser-ext/health', async () => {
    return {
      ok: true,
      version: '0.1.0',
      // The desktop's "active" workspace name, for the extension to show
      // "saving to: <workspace>". Falls back to the personal mind.
      activeWorkspace: server.agentState.activeWorkspaceId ?? null,
    };
  });
}
