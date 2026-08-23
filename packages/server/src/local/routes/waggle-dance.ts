import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { evaluateExternalMemoryIngress, FrameStore, SessionStore } from '@waggle/core';
import {
  validateMessageTypeCombo,
  WaggleDanceDispatcher,
  type DispatchDeps,
} from '@waggle/waggle-dance';
import type {
  CollaborationWorkerRun,
  WaggleMessage,
  MessageType,
  MessageSubtype,
} from '@waggle/shared';
import { SignalBus } from '../signal-bus.js';
import { installWaggleDanceBridge } from '../waggle-dance-bridge.js';

/**
 * AI-OS Phase 1B — local-sidecar surface for the WaggleDance v2
 * cross-tool activity bus.
 *
 * Endpoints:
 *
 *   POST /api/waggle-dance/signal
 *     Body: { type, subtype, content, senderId?, teamId?,
 *             referenceId?, routing? }
 *     Returns: { dispatched, message }
 *
 *     Normalizes the incoming payload into a full WaggleMessage
 *     (auto-fills id, createdAt, sensible defaults), validates the
 *     type/subtype combo, then dispatches through WaggleDanceDispatcher
 *     with real v2 deps (emit→bus, response→bus).
 *
 *   GET /api/waggle-dance/signals
 *     Query: { subtype?, tool?, teamId?, limit?, since? }
 *     Returns: WaggleMessage[]
 *
 *     Returns the in-memory ring buffer snapshot, newest first,
 *     filtered by the optional query params.
 *
 * Design notes:
 *
 *   - The signal bus is created once per server instance and exposed
 *     via `server.signalBus`. Tests can replace it via decoration.
 *   - The dispatcher's emitSignal pushes into the bus AND records the
 *     message (so GET /signals returns it). recordResponse does the
 *     same — responses are also visible in the activity feed.
 *   - Personal-tier eligibility: when teamId is absent, defaults to
 *     `personal::<senderId>` so a user's own bus does not require
 *     a real Teams subscription. This is the moat.
 *   - Model recommendation: stubbed to null in this route (real
 *     wiring lives in Phase 3); dispatcher returns a friendly
 *     "no recommender configured" string.
 */

// Local request schema — relaxed from the cloud sendMessageSchema
// because hook senders don't have user-UUID identities. We accept
// any non-empty senderId string ('claude-code-hook', 'cursor-hook')
// or auto-default to 'local'.
const signalRequestSchema = z.object({
  type: z.enum(['broadcast', 'request', 'response']),
  subtype: z.enum([
    'knowledge_check', 'task_delegation', 'skill_request', 'model_recommendation',
    'knowledge_match', 'task_claim', 'discovery', 'routed_share',
    'skill_share', 'model_recipe',
  ]),
  content: z.record(z.unknown()),
  senderId: z.string().min(1).max(200).optional(),
  teamId: z.string().min(1).max(200).optional(),
  referenceId: z.string().min(1).max(200).nullable().optional(),
  routing: z
    .array(z.object({ userId: z.string(), reason: z.string() }))
    .nullable()
    .optional(),
});

const signalsQuerySchema = z.object({
  subtype: z.string().optional(),
  tool: z.string().optional(),
  teamId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
  since: z.string().optional(),
});

const QUARANTINED_AGENT_SIGNAL = '[Quarantined agent signal]';

declare module 'fastify' {
  interface FastifyInstance {
    /** AI-OS Phase 1B signal bus — shared across waggle-dance routes. */
    signalBus?: SignalBus;
  }
}

const waggleDanceRoutesImpl: FastifyPluginAsync = async (server) => {
  // Lazily create the bus on first plugin registration. The decorator
  // makes it available to other plugins (Phase 1C SSE adapter, tests).
  // Wrapped with fastify-plugin below so the decoration is visible
  // on the parent FastifyInstance, not just inside this plugin.
  if (!server.signalBus) {
    server.decorate('signalBus', new SignalBus());
    // Bridge the v2 bus into the legacy /api/waggle/signals stream so
    // the existing UI surfaces cross-tool activity with zero frontend
    // changes. Phase 1C wiring.
    installWaggleDanceBridge(server.signalBus!);
  }
  const bus = server.signalBus!;

  // ── POST /api/waggle-dance/signal ─────────────────────────────────
  server.post('/api/waggle-dance/signal', async (request, reply) => {
    const parsed = signalRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const body = parsed.data;
    const runAuth = authenticateRunRequest(server, request);
    if (runAuth === null) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'INVALID_RUN_TOKEN' });
    }

    // Validate type/subtype combo via the protocol module.
    if (
      !validateMessageTypeCombo(
        body.type as MessageType,
        body.subtype as MessageSubtype,
      )
    ) {
      return reply.code(400).send({
        error: `Invalid type-subtype combination: ${body.type}/${body.subtype}`,
      });
    }

    if (runAuth) {
      const violation = validateRunEnvelope(runAuth, body);
      if (violation) return reply.code(403).send({ error: 'Forbidden', code: 'RUN_SCOPE_VIOLATION', message: violation });
    }
    const senderId = runAuth ? `run::${runAuth.id}` : (body.senderId ?? 'local');
    const teamId = runAuth ? `room::${runAuth.roomId}` : (body.teamId ?? `personal::${senderId}`);
    const signalContent = runAuth && isDurableAuthenticatedSignal(
      body.type as MessageType,
      body.subtype as MessageSubtype,
    )
      ? guardAuthenticatedSignalSummary(body.content)
      : body.content;

    const message: WaggleMessage = {
      id: randomUUID(),
      teamId,
      senderId,
      type: body.type as MessageType,
      subtype: body.subtype as MessageSubtype,
      content: runAuth ? {
        ...signalContent,
        roomId: runAuth.roomId,
        runId: runAuth.id,
        workspaceId: runAuth.workspaceId,
      } : signalContent,
      referenceId: body.referenceId ?? null,
      routing: body.routing ?? null,
      createdAt: new Date(),
    };

    // Real v2 deps: emit→bus, response→bus, recommendModel→null stub.
    // v1 deps are stubbed locally (the cross-tool bus does not run
    // the team-internal task_delegation / knowledge_check paths
    // through this route — those go through the team workspace).
    const deps: DispatchDeps = {
      searchMemory: async () => 'memory search not available on local bus',
      resolveCapability: () => [],
      spawnWorker: async (task: string, role: string) =>
        `local bus does not spawn workers (task=${task}, role=${role})`,
      emitSignal: async (msg) => {
        bus.record(msg);
      },
      recordResponse: async (msg) => {
        bus.record(msg);
      },
      recommendModel: async () => null,
    };

    const dispatcher = new WaggleDanceDispatcher(deps);
    const dispatchResult = await dispatcher.dispatch(message);

    if (!dispatchResult.handled) {
      return reply
        .code(400)
        .send({ error: dispatchResult.error, message });
    }

    // Request handlers execute their local behavior but do not persist the
    // envelope. Record successful requests once so Room peers can receive and
    // answer them; broadcasts and responses are recorded by their callbacks.
    if (message.type === 'request') {
      bus.record(message);
    }
    if (runAuth) recordAuthenticatedRunSignal(server, runAuth, message);

    return reply.code(201).send({
      dispatched: true,
      response: dispatchResult.response,
      message,
    });
  });

  // ── GET /api/waggle-dance/signals ─────────────────────────────────
  server.get('/api/waggle-dance/signals', async (request, reply) => {
    const parsed = signalsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: 'Invalid query', details: parsed.error.flatten() });
    }
    const q = parsed.data;
    const runAuth = authenticateRunRequest(server, request);
    if (runAuth === null) {
      return reply.code(401).send({ error: 'Unauthorized', code: 'INVALID_RUN_TOKEN' });
    }
    const runTeamId = runAuth ? `room::${runAuth.roomId}` : undefined;
    if (runTeamId && q.teamId && q.teamId !== runTeamId) {
      return reply.code(403).send({ error: 'Forbidden', code: 'RUN_SCOPE_VIOLATION' });
    }

    // Validate subtype against the protocol enum if provided.
    const allowedSubtypes: MessageSubtype[] = [
      'knowledge_check', 'task_delegation', 'skill_request', 'model_recommendation',
      'knowledge_match', 'task_claim', 'discovery', 'routed_share',
      'skill_share', 'model_recipe',
    ];
    if (q.subtype && !allowedSubtypes.includes(q.subtype as MessageSubtype)) {
      return reply.code(400).send({ error: `Unknown subtype: ${q.subtype}` });
    }

    const signals = bus.query({
      subtype: q.subtype as MessageSubtype | undefined,
      tool: q.tool,
      teamId: runTeamId ?? q.teamId,
      limit: q.limit,
      since: q.since,
    });
    return reply.code(200).send({ signals, total: signals.length });
  });
};

function recordAuthenticatedRunSignal(
  server: FastifyInstance,
  run: CollaborationWorkerRun,
  message: WaggleMessage,
): void {
  if (!isDurableAuthenticatedSignal(message.type, message.subtype)) return;
  const summary = signalSummary(message.content);
  if (!summary) return;
  const durableSummary = summary.slice(0, 4_000);
  const safeSummary = evaluateExternalMemoryIngress({ content: durableSummary }).action === 'allow'
    ? durableSummary
    : QUARANTINED_AGENT_SIGNAL;
  const current = server.agentRunRegistry.get(run.id);
  if (!current || current.kind !== 'worker') return;

  const personalFrameIds = [...(current.memoryRefs.personalFrameIds ?? [])];
  const workspaceFrameIds = { ...(current.memoryRefs.workspaceFrameIds ?? {}) };
  let personalStored = false;
  try {
    new SessionStore(server.multiMind.personal).ensure(
      'agent-signals', 'agent-signals', 'Agent collaboration signals',
    );
    const frames = new FrameStore(server.multiMind.personal);
    const frame = frames.createIFrame(
      'agent-signals',
      `[Agent collaboration signal]\nRoom: ${run.roomId}\nRun: ${run.id}\nWorkspace: ${run.workspaceId}\nTool: ${run.executor.toolId ?? 'agent'}\nSubtype: ${message.subtype}\nSummary: ${safeSummary.slice(0, 1_000)}`,
      'normal',
      'agent_inferred',
    );
    frames.setMetadata(frame.id, JSON.stringify({
      messageId: message.id,
      roomId: run.roomId,
      runId: run.id,
      workspaceId: run.workspaceId,
      toolId: run.executor.toolId ?? null,
      subtype: message.subtype,
    }));
    if (!personalFrameIds.includes(frame.id)) personalFrameIds.push(frame.id);
    personalStored = true;
  } catch (err) {
    server.log.warn({ err, runId: run.id }, 'failed to index authenticated agent signal');
  }

  const rawFrameId = message.content.frameId;
  const frameId = typeof rawFrameId === 'number'
    ? rawFrameId
    : typeof rawFrameId === 'string' && /^\d+$/.test(rawFrameId) ? Number(rawFrameId) : undefined;
  const workspaceStored = frameId !== undefined
    && message.content.memoryWorkspace === run.workspaceId;
  if (workspaceStored) {
    workspaceFrameIds[run.workspaceId] = [
      ...new Set([...(workspaceFrameIds[run.workspaceId] ?? []), frameId]),
    ];
  }

  server.agentRunRegistry.update(run.id, {
    ...(['queued', 'starting'].includes(current.status) ? { status: 'running' } : {}),
    progress: { phase: message.subtype, message: safeSummary.slice(0, 500) },
    result: { summary: safeSummary },
    memoryRefs: {
      status: personalStored && workspaceStored ? 'complete' : current.memoryRefs.status,
      personalFrameIds,
      workspaceFrameIds,
    },
  });
}

function isDurableAuthenticatedSignal(type: MessageType, subtype: MessageSubtype): boolean {
  return type !== 'request' && subtype !== 'task_claim';
}

function guardAuthenticatedSignalSummary(content: Record<string, unknown>): Record<string, unknown> {
  for (const key of ['summary', 'result', 'text', 'topic', 'message']) {
    const value = content[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    const reflectedSummary = value.trim();
    const durableSummary = reflectedSummary.slice(0, 4_000);
    const durableDecision = evaluateExternalMemoryIngress({ content: durableSummary });
    const reflectedDecision = reflectedSummary === durableSummary
      ? durableDecision
      : evaluateExternalMemoryIngress({ content: reflectedSummary });
    return durableDecision.action === 'allow' && reflectedDecision.action === 'allow'
      ? content
      : { ...content, [key]: QUARANTINED_AGENT_SIGNAL };
  }
  return content;
}

function signalSummary(content: Record<string, unknown>): string | undefined {
  for (const key of ['summary', 'result', 'text', 'topic', 'message']) {
    const value = content[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function authenticateRunRequest(
  server: FastifyInstance,
  request: FastifyRequest,
): CollaborationWorkerRun | undefined | null {
  const raw = request.headers['x-waggle-run-token'];
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') return null;
  return server.agentRunRegistry?.authenticateCredential(raw) ?? null;
}

function validateRunEnvelope(
  run: CollaborationWorkerRun,
  body: {
    senderId?: string;
    teamId?: string;
    content: Record<string, unknown>;
  },
): string | undefined {
  if (body.senderId && body.senderId !== `run::${run.id}`) return 'senderId is outside the credential scope';
  if (body.teamId && body.teamId !== `room::${run.roomId}`) return 'teamId is outside the credential scope';
  const reserved: Array<[string, string]> = [
    ['roomId', run.roomId], ['runId', run.id], ['workspaceId', run.workspaceId],
  ];
  for (const [key, expected] of reserved) {
    const value = body.content[key];
    if (value !== undefined && value !== expected) return `${key} is outside the credential scope`;
  }
  return undefined;
}

/**
 * Plugin wrapped with fastify-plugin so the `signalBus` decoration
 * propagates to the parent FastifyInstance. Without this wrapper,
 * Fastify's default encapsulation would scope the decoration to
 * this plugin only, and tests / other plugins (Phase 1C SSE adapter)
 * could not access the shared bus.
 */
export const waggleDanceRoutes: FastifyPluginAsync = fp(waggleDanceRoutesImpl, {
  name: 'waggle-dance-routes',
});
