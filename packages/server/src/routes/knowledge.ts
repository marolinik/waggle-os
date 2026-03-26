import type { FastifyInstance } from 'fastify';
import { KnowledgeService } from '../services/knowledge-service.js';
import { TeamService } from '../services/team-service.js';
import { createEntitySchema, createRelationSchema } from '@waggle/shared';

export async function knowledgeRoutes(fastify: FastifyInstance) {
  const knowledgeService = new KnowledgeService(fastify.db);
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

  // POST /api/teams/:slug/entities — share entity to team graph
  fastify.post('/api/teams/:slug/entities', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const team = await resolveTeam(request, reply, slug);
    if (!team) return;

    const parsed = createEntitySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const entity = await knowledgeService.createEntity(team.id, request.userId, parsed.data);
    return reply.code(201).send(entity);
  });

  // GET /api/teams/:slug/entities — list/search entities
  fastify.get('/api/teams/:slug/entities', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const team = await resolveTeam(request, reply, slug);
    if (!team) return;

    const query = request.query as { type?: string; search?: string };
    const filters: { entityType?: string; search?: string } = {};
    if (query.type) filters.entityType = query.type;
    if (query.search) filters.search = query.search;

    const entities = await knowledgeService.listEntities(team.id, filters);
    return entities;
  });

  // POST /api/teams/:slug/relations — create relation
  fastify.post('/api/teams/:slug/relations', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const team = await resolveTeam(request, reply, slug);
    if (!team) return;

    const parsed = createRelationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const relation = await knowledgeService.createRelation(team.id, parsed.data);
    return reply.code(201).send(relation);
  });

  // GET /api/teams/:slug/graph — query graph traversal
  fastify.get('/api/teams/:slug/graph', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const team = await resolveTeam(request, reply, slug);
    if (!team) return;

    const query = request.query as { startId?: string; depth?: string; relationTypes?: string };
    if (!query.startId) {
      return reply.code(400).send({ error: 'startId query parameter is required' });
    }

    const depth = query.depth ? parseInt(query.depth, 10) : 2;
    if (isNaN(depth) || depth < 1 || depth > 10) {
      return reply.code(400).send({ error: 'depth must be between 1 and 10' });
    }

    const relationTypes = query.relationTypes
      ? query.relationTypes.split(',').map((s) => s.trim())
      : undefined;

    const result = await knowledgeService.queryGraph(team.id, query.startId, depth, relationTypes);
    return result;
  });
}
