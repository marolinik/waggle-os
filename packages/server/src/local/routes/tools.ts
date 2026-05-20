import type { FastifyPluginAsync } from 'fastify';
import { detectInstalledTools } from '@waggle/agent';

/**
 * AI-OS Phase 0 — tool-detection routes.
 *
 * GET /api/tools/detect
 *   Scans the user's machine for supported AI tools and reports
 *   {platform, detectedAt, tools: [{id, displayName, installed,
 *   installedPath, version, hooksInstalled, hookPointerPath,
 *   diagnostic?}]}.
 *
 * Read-only. No side effects. Safe to call at any time; the launcher
 * dock polls this on mount and after any tool-install action.
 */
export const toolsRoutes: FastifyPluginAsync = async (server) => {
  server.get('/api/tools/detect', async (_request, reply) => {
    try {
      const result = await detectInstalledTools();
      return reply.code(200).send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      server.log.error({ err }, 'tool-detection failed');
      return reply
        .code(500)
        .send({ error: 'tool-detection failed', message });
    }
  });
};
