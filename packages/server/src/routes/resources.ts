import type { FastifyInstance } from 'fastify';
import { ResourceService } from '../services/resource-service.js';
import { TeamService } from '../services/team-service.js';
import { createResourceSchema } from '@waggle/shared';

export async function resourceRoutes(fastify: FastifyInstance) {
  const resourceService = new ResourceService(fastify.db);
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

  // POST /api/teams/:slug/resources — share a resource
  fastify.post('/api/teams/:slug/resources', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const team = await resolveTeam(request, reply, slug);
    if (!team) return;

    const parsed = createResourceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const resource = await resourceService.share(team.id, request.userId, parsed.data);
    return reply.code(201).send(resource);
  });

  // GET /api/teams/:slug/resources — list resources
  fastify.get('/api/teams/:slug/resources', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const team = await resolveTeam(request, reply, slug);
    if (!team) return;

    const query = request.query as { type?: string };
    const resources = await resourceService.list(team.id, query.type);
    return resources;
  });

  // PATCH /api/teams/:slug/resources/:id — rate a resource (also increments useCount)
  fastify.patch('/api/teams/:slug/resources/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string };
    const team = await resolveTeam(request, reply, slug);
    if (!team) return;

    const body = request.body as { rating?: number };
    if (body.rating === undefined || typeof body.rating !== 'number' || body.rating < 0 || body.rating > 5) {
      return reply.code(400).send({ error: 'rating must be a number between 0 and 5' });
    }

    // Rate (uses running average) then increment use count
    const rated = await resourceService.rate(id, body.rating);
    if (!rated) {
      return reply.code(404).send({ error: 'Resource not found' });
    }

    const updated = await resourceService.incrementUseCount(id);
    return updated;
  });
}
