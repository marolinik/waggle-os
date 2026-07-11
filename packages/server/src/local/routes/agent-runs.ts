import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  COLLABORATION_RUN_CONTROLS,
  COLLABORATION_RUN_SOURCES,
  COLLABORATION_RUN_STATUSES,
  type CollaborationRunControl,
  type CollaborationRunSource,
  type CollaborationRunStatus,
} from '@waggle/shared';

const querySchema = z.object({
  workspaceId: z.string().min(1).max(200).optional(),
  roomId: z.string().min(1).max(200).optional(),
  status: z.enum(COLLABORATION_RUN_STATUSES).optional(),
  source: z.enum(COLLABORATION_RUN_SOURCES).optional(),
  limit: z.coerce.number().int().positive().max(1_000).optional(),
});

const eventsQuerySchema = querySchema.extend({
  since: z.coerce.number().int().nonnegative().default(0),
});

const createRoomSchema = z.object({
  workspaceIds: z.array(z.string().min(1).max(200)).min(1).max(50),
  source: z.enum(COLLABORATION_RUN_SOURCES),
  title: z.string().min(1).max(200),
  task: z.string().min(1).max(20_000),
});

const controlSchema = z.object({
  action: z.enum(COLLABORATION_RUN_CONTROLS),
  message: z.string().min(1).max(20_000).optional(),
});

/** Durable Room/run snapshot, replay, lookup, creation, and control surface. */
export const agentRunsRoutes: FastifyPluginAsync = async (server) => {
  server.post('/api/rooms', async (request, reply) => {
    const parsed = createRoomSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const body = parsed.data;
    const unknownWorkspace = body.workspaceIds.find((id) => !server.workspaceManager?.get(id));
    if (unknownWorkspace) {
      return reply.code(404).send({
        error: 'workspace_not_found',
        message: `Workspace ${unknownWorkspace} does not exist`,
      });
    }
    const run = server.agentRunRegistry.createRoom({
      workspaceIds: body.workspaceIds,
      source: body.source as CollaborationRunSource,
      title: body.title,
      task: body.task,
      capabilities: { cancel: true, message: true },
    });
    return reply.code(201).send({ run });
  });

  server.get('/api/agent-runs/snapshot', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query', details: parsed.error.flatten() });
    }
    return server.agentRunRegistry.snapshot({
      ...parsed.data,
      status: parsed.data.status as CollaborationRunStatus | undefined,
      source: parsed.data.source as CollaborationRunSource | undefined,
    });
  });

  server.get('/api/agent-runs/events', async (request, reply) => {
    const parsed = eventsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query', details: parsed.error.flatten() });
    }
    const { since, ...query } = parsed.data;
    return server.agentRunRegistry.eventsSince(since, {
      ...query,
      status: query.status as CollaborationRunStatus | undefined,
      source: query.source as CollaborationRunSource | undefined,
    });
  });

  server.get<{ Params: { id: string } }>('/api/agent-runs/:id', async (request, reply) => {
    const run = server.agentRunRegistry.get(request.params.id);
    if (!run) return reply.code(404).send({ error: 'Run not found' });
    return { run };
  });

  server.post<{ Params: { id: string } }>('/api/agent-runs/:id/control', async (request, reply) => {
    const parsed = controlSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    if (parsed.data.action === 'message' && !parsed.data.message) {
      return reply.code(400).send({ error: 'message is required for the message action' });
    }
    if (!server.agentRunRegistry.get(request.params.id)) {
      return reply.code(404).send({ error: 'Run not found' });
    }
    try {
      const run = await server.agentRunRegistry.control(
        request.params.id,
        parsed.data.action as CollaborationRunControl,
        parsed.data.message,
      );
      return { run };
    } catch (err) {
      return reply.code(409).send({
        error: 'control_unavailable',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });
};
