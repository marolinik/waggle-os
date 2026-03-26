import type { FastifyInstance } from 'fastify';
import { ProactiveService } from '../services/proactive-service.js';

export async function suggestionRoutes(fastify: FastifyInstance) {
  const proactiveService = new ProactiveService(fastify.db);

  // GET /api/suggestions — list pending suggestions for the authenticated user
  fastify.get('/api/suggestions', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    return proactiveService.listPending(request.userId);
  });

  // PATCH /api/suggestions/:id — accept, dismiss, or snooze a suggestion
  fastify.patch('/api/suggestions/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { status?: string };

    if (!body.status || !['accepted', 'dismissed', 'snoozed'].includes(body.status)) {
      return reply.code(400).send({ error: 'status must be one of: accepted, dismissed, snoozed' });
    }

    const updated = await proactiveService.updateStatus(id, body.status as 'accepted' | 'dismissed' | 'snoozed');
    if (!updated) {
      return reply.code(404).send({ error: 'Suggestion not found' });
    }

    return updated;
  });
}
