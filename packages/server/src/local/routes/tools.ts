import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import {
  detectInstalledTools,
  launchTool,
  runHookCommand,
  ToolProcessTracker,
  ToolOutputBuffer,
  getToolRegistry,
  type HookAction,
} from '@waggle/agent';
import { SUPPORTED_TOOLS, applyPromptArgTemplate, type ToolId, type ToolManifest } from '@waggle/shared';

/**
 * AI-OS #5 — resolve the CLI args for a launch. Explicit `args` (the built-in
 * web path computes them) win. Otherwise, if the tool is a third-party adapter
 * with a declarative promptArgTemplate and a prompt was given, apply the
 * template server-side. Built-ins carry no template, so they are unaffected.
 */
export function resolveLaunchArgs(
  manifest: ToolManifest | undefined,
  body: { args?: string[]; prompt?: string },
): string[] | undefined {
  if (body.args) return body.args;
  if (body.prompt && manifest?.promptArgTemplate) {
    return applyPromptArgTemplate(manifest.promptArgTemplate, body.prompt);
  }
  return undefined;
}

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
    /** AI-OS #4 — bounded per-pid output buffer for observed (piped) launches. */
    toolOutputBuffer?: ToolOutputBuffer;
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
  // AI-OS #4 — opt-in observed (piped-stdio) launch for live output.
  observe: z.boolean().optional(),
  // AI-OS #5 — raw prompt; for a third-party adapter with a promptArgTemplate
  // (and no explicit args) the server turns it into CLI args.
  prompt: z.string().max(8000).optional(),
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

  // AI-OS #4 — in-memory output buffer for observed launches. Shared across
  // /launch (attach) and /stream (read) via the same fastify decoration.
  if (!server.toolOutputBuffer) {
    server.decorate('toolOutputBuffer', new ToolOutputBuffer());
  }
  const outputBuffer = server.toolOutputBuffer!;

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
      args: resolveLaunchArgs(getToolRegistry().find((m) => m.id === body.id), body),
      signalEmit: true,
      sidecarUrl: loopbackSidecarUrl(request.headers.host),
      observe: body.observe,
    });
    if (!result.ok) {
      return reply.code(400).send(result);
    }
    // AI-OS Phase 4 polish — register the spawned pid for the
    // 'Running' badge surface (GET /api/tools/processes). Observed launches
    // are tagged so they stay in-memory only (excluded from the pidfile) and
    // their live output is wired into the buffer the /stream route reads.
    if (result.pid != null) {
      tracker.register(result.pid, body.id, body.workspaceId, {
        observed: body.observe === true,
      });
      if (body.observe && result.output) {
        outputBuffer.attach(result.pid, result.output);
      }
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

  // ── GET /api/tools/stream?pid= (AI-OS #4) ────────────────────────
  // Live stdout/stderr for an OBSERVED launch. Validated against the output
  // buffer (the only place observed pids land — so a non-observed pid 404s
  // here), then mirrors the chat.ts hijack-SSE pattern: `subscribe` replays
  // the buffered tail and live-tails, ending on a terminal `exit` event.
  // Loopback-only; EventSource auth via ?token= (see SSE_QUERY_TOKEN_PATHS).
  server.get('/api/tools/stream', async (request, reply) => {
    const rawPid = (request.query as { pid?: string } | undefined)?.pid;
    const pid = Number(rawPid);
    if (!Number.isInteger(pid) || pid <= 0) {
      return reply.code(400).send({ error: 'pid query param required' });
    }
    if (!outputBuffer.has(pid)) {
      return reply.code(404).send({ error: 'no observed output for pid' });
    }
    await reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      // hijack bypasses Fastify plugins; echo the loopback origin for CORS.
      'Access-Control-Allow-Origin': request.headers.origin ?? '*',
    });
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const unsubscribe = outputBuffer.subscribe(
      pid,
      (line) => send('line', { line }),
      (code) => {
        send('exit', { code });
        res.end();
      },
    );
    res.on('close', () => unsubscribe());
    return reply;
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
