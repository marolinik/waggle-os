import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import {
  detectInstalledTools,
  launchTool,
  runHookCommand,
  ToolProcessTracker,
  type HookAction,
} from '@waggle/agent';
import { SUPPORTED_TOOLS, type ToolId } from '@waggle/shared';

/**
 * Loopback host:port → sidecar base URL; anything else → undefined.
 * IPv6 loopback must be bracketed (`[::1]`) — a bare `::1` would yield
 * a malformed `http://::1` URL and a conformant Host header always
 * brackets IPv6 anyway, so we only accept the bracketed form.
 */
const LOOPBACK_HOST = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i;

/**
 * Derive the sidecar base URL to hand a launched tool's hook, from the
 * loopback address the UI itself reached. Returns undefined for any
 * missing / non-loopback host so a launched hook is never pointed at an
 * arbitrary external origin — the emitter then falls back to its own
 * `127.0.0.1:3333` default. Exported for unit testing.
 */
export function loopbackSidecarUrl(host: string | undefined): string | undefined {
  if (!host || !LOOPBACK_HOST.test(host)) return undefined;
  return `http://${host}`;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** AI-OS Phase 4 — in-memory tracker of processes spawned via /api/tools/launch. */
    toolProcessTracker?: ToolProcessTracker;
  }
}

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

const killBodySchema = z.object({
  pid: z.number().int().positive(),
});

const toolsRoutesImpl: FastifyPluginAsync = async (server) => {
  // Lazy-init the tracker on first registration. fastify-plugin
  // wrapping (below) propagates the decoration to the parent
  // FastifyInstance so other plugins + tests can access it.
  //
  // Persisted to a pidfile under the data dir so launched tools that
  // outlive a sidecar restart keep their 'Running' badge / kill
  // affordance (the tracker reconciles liveness on construction). Falls
  // back to pure in-memory if the data dir isn't decorated yet.
  if (!server.toolProcessTracker) {
    const dataDir = server.localConfig?.dataDir;
    server.decorate(
      'toolProcessTracker',
      new ToolProcessTracker(
        dataDir ? { persistPath: path.join(dataDir, 'launched-processes.json') } : {},
      ),
    );
  }
  const tracker = server.toolProcessTracker!;

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
    // Self-enabling launch: turn on signal emission and tell the hook
    // which loopback sidecar to post to, so a dock launch lights the
    // SignalBus instead of staying dark.
    const result = launchTool({
      id: body.id,
      installedPath: body.installedPath,
      workspaceId: body.workspaceId,
      cwd: body.cwd,
      args: body.args,
      signalEmit: true,
      sidecarUrl: loopbackSidecarUrl(request.headers.host),
    });
    if (!result.ok) {
      return reply.code(400).send(result);
    }
    // AI-OS Phase 4 polish — register the spawned pid for the
    // 'Running' badge surface (GET /api/tools/processes).
    if (result.pid != null) {
      tracker.register(result.pid, body.id, body.workspaceId);
    }
    return reply.code(202).send(result);
  });

  // ── GET /api/tools/processes (Phase 4 polish) ────────────────────
  server.get('/api/tools/processes', async (_request, reply) => {
    const processes = tracker.list();
    return reply.code(200).send({ processes, total: processes.length });
  });

  // ── POST /api/tools/kill (E-1) ───────────────────────────────────
  // Only kills processes we've previously tracked via /launch — guards
  // against the UI accidentally sending an arbitrary OS pid and nuking
  // the user's editor. SIGTERM first (graceful), SIGKILL escalation
  // after a 3-second grace period.
  server.post('/api/tools/kill', async (request, reply) => {
    const parsed = killBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const result = await tracker.kill(parsed.data.pid);
    if (!result.ok) {
      // not-tracked is a 404, sigterm-failed-sigkill-failed is a 500.
      const status = result.reason === 'not-tracked' ? 404 : 500;
      return reply.code(status).send(result);
    }
    return reply.code(200).send(result);
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

/**
 * Plugin wrapped with fastify-plugin so the `toolProcessTracker`
 * decoration propagates to the parent FastifyInstance — without it,
 * decoration is scoped to this plugin and tests can't read it.
 * Mirrors the pattern in waggle-dance routes (Phase 1B).
 */
export const toolsRoutes: FastifyPluginAsync = fp(toolsRoutesImpl, {
  name: 'tools-routes',
});
