import type { FastifyInstance } from 'fastify';
import { ScoutAgent } from '../daemons/scout.js';

export async function scoutRoutes(fastify: FastifyInstance) {
  const scout = new ScoutAgent(fastify.db);

  // GET /api/scout/findings — list findings for the authenticated user
  fastify.get('/api/scout/findings', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    return scout.listFindings(request.userId);
  });

  // PATCH /api/scout/findings/:id — adopt or dismiss a finding
  fastify.patch('/api/scout/findings/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { status?: string };

    if (!body.status || !['adopted', 'dismissed'].includes(body.status)) {
      return reply.code(400).send({ error: 'status must be one of: adopted, dismissed' });
    }

    const action = body.status === 'adopted' ? scout.adopt(id) : scout.dismiss(id);
    const updated = await action;
    if (!updated) {
      return reply.code(404).send({ error: 'Finding not found' });
    }

    return updated;
  });
}
