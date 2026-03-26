import type { FastifyInstance } from 'fastify';
import { MessageService } from '../services/message-service.js';
import { TeamService } from '../services/team-service.js';
import { sendMessageSchema } from '@waggle/shared';
import { validateMessageTypeCombo } from '@waggle/waggle-dance';
import type { MessageType, MessageSubtype } from '@waggle/shared';
import { z } from 'zod';

const hiveCheckSchema = z.object({
  topic: z.string().min(1).max(500),
  scope: z.string().max(200).optional(),
});

export async function messageRoutes(fastify: FastifyInstance) {
  const messageService = new MessageService(fastify.db);
  const teamService = new TeamService(fastify.db);

  async function resolveTeam(request: any, reply: any, slug: string) {
    const team = await teamService.getBySlug(slug);
    if (!team) {
      reply.code(404).send({ error: 'Team not found' });
      return null;
    }

    const membership = await teamService.getMembership(team.id, request.userId);
    if (!membership) {
      reply.code(403).send({ error: 'Not a member of this team' });
      return null;
    }

    return team;
  }

  // POST /api/teams/:slug/messages — send Waggle Dance message
  fastify.post('/api/teams/:slug/messages', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const team = await resolveTeam(request, reply, slug);
    if (!team) return;

    const parsed = sendMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    // Validate type-subtype combination using waggle-dance protocol
    if (!validateMessageTypeCombo(parsed.data.type as MessageType, parsed.data.subtype as MessageSubtype)) {
      return reply.code(400).send({
        error: `Invalid type-subtype combination: ${parsed.data.type}/${parsed.data.subtype}`,
      });
    }

    const message = await messageService.send(
      team.id,
      request.userId,
      parsed.data,
      fastify.redis,
    );
    return reply.code(201).send(message);
  });

  // GET /api/teams/:slug/messages — list messages
  fastify.get('/api/teams/:slug/messages', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const team = await resolveTeam(request, reply, slug);
    if (!team) return;

    const query = request.query as { type?: string; subtype?: string };
    const filters: { type?: string; subtype?: string } = {};
    if (query.type) filters.type = query.type;
    if (query.subtype) filters.subtype = query.subtype;

    const messageList = await messageService.list(team.id, filters);
    return messageList;
  });

  // POST /api/teams/:slug/messages/hive-check — check the hive
  fastify.post('/api/teams/:slug/messages/hive-check', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const team = await resolveTeam(request, reply, slug);
    if (!team) return;

    const parsed = hiveCheckSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const result = await messageService.checkHive(team.id, parsed.data);
    return result;
  });
}
