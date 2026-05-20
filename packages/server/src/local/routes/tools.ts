import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  detectInstalledTools,
  launchTool,
  runHookCommand,
  type HookAction,
} from '@waggle/agent';
import { SUPPORTED_TOOLS, type ToolId } from '@waggle/shared';

/**
 * AI-OS — tool-detection + launcher + hook-management routes.
 *
 * Endpoints:
 *
 *   GET  /api/tools/detect
 *     Scan the user's machine for supported AI tools.
 *     (Phase 0)
 *
 *   POST /api/tools/launch
 *     Body: { id, installedPath, workspaceId?, cwd?, args? }
 *     Spawn the tool detached with workspace-context env injection.
 *     (Phase 2A)
 *
 *   POST /api/tools/hooks
 *     Body: { id, action: 'install' | 'verify' | 'uninstall', cliPath? }
 *     Run `npx @waggle/hive-mind-hooks-<id> <action>`.
 *     (Phase 2A)
 *
 * All routes are read-only by intent (detect) or surface only the
 * user's own machine (launch/hooks). The local sidecar is loopback-
 * bound; tool detection is not sensitive.
 */

const TOOL_ID_VALUES = SUPPORTED_TOOLS as readonly string[];

const launchBodySchema = z.object({
  id: z.string().refine((s): s is ToolId => TOOL_ID_VALUES.includes(s), {
    message: 'unknown tool id',
  }),
  installedPath: z.string().min(1).max(1024),
  workspaceId: z.string().min(1).max(200).optional(),
  cwd: z.string().min(1).max(1024).optional(),
  args: z.array(z.string()).max(50).optional(),
});

const hooksBodySchema = z.object({
  id: z.string().refine((s): s is ToolId => TOOL_ID_VALUES.includes(s), {
    message: 'unknown tool id',
  }),
  action: z.enum(['install', 'verify', 'uninstall']),
  cliPath: z.string().min(1).max(1024).optional(),
});

export const toolsRoutes: FastifyPluginAsync = async (server) => {
  // ── GET /api/tools/detect (Phase 0) ──────────────────────────────
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

  // ── POST /api/tools/launch (Phase 2A) ────────────────────────────
  server.post('/api/tools/launch', async (request, reply) => {
    const parsed = launchBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const body = parsed.data;
    const result = launchTool({
      id: body.id,
      installedPath: body.installedPath,
      workspaceId: body.workspaceId,
      cwd: body.cwd,
      args: body.args,
    });
    if (!result.ok) {
      return reply.code(400).send(result);
    }
    return reply.code(202).send(result);
  });

  // ── POST /api/tools/hooks (Phase 2A) ─────────────────────────────
  server.post('/api/tools/hooks', async (request, reply) => {
    const parsed = hooksBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const body = parsed.data;
    try {
      const result = await runHookCommand({
        id: body.id,
        action: body.action as HookAction,
        cliPath: body.cliPath,
      });
      if (!result.ok) {
        return reply.code(400).send(result);
      }
      return reply.code(200).send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      server.log.error({ err }, 'hook command failed');
      return reply
        .code(500)
        .send({ error: 'hook command failed', message });
    }
  });
};
