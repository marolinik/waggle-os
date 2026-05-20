import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  validateMessageTypeCombo,
  WaggleDanceDispatcher,
  type DispatchDeps,
} from '@waggle/waggle-dance';
import type { WaggleMessage, MessageType, MessageSubtype } from '@waggle/shared';
import { SignalBus } from '../signal-bus.js';

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

    const senderId = body.senderId ?? 'local';
    const teamId = body.teamId ?? `personal::${senderId}`;

    const message: WaggleMessage = {
      id: randomUUID(),
      teamId,
      senderId,
      type: body.type as MessageType,
      subtype: body.subtype as MessageSubtype,
      content: body.content,
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
      teamId: q.teamId,
      limit: q.limit,
      since: q.since,
    });
    return reply.code(200).send({ signals, total: signals.length });
  });
};

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
