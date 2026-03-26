import type { FastifyInstance } from 'fastify';
import { AnalyticsService } from '../services/analytics-service.js';
import { TeamService } from '../services/team-service.js';

const ROLE_HIERARCHY: Record<string, number> = { member: 1, admin: 2, owner: 3 };

export async function analyticsRoutes(fastify: FastifyInstance) {
  const analyticsService = new AnalyticsService(fastify.db);
  const teamService = new TeamService(fastify.db);

  async function requireAdmin(request: any, reply: any, slug: string) {
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

    const userLevel = ROLE_HIERARCHY[membership.role] ?? 0;
    if (userLevel < ROLE_HIERARCHY['admin']) {
      reply.code(403).send({ error: 'Admin access required' });
      return null;
    }

    return team;
  }

  // GET /api/admin/teams/:slug/analytics — team usage analytics dashboard
  fastify.get('/api/admin/teams/:slug/analytics', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const team = await requireAdmin(request, reply, slug);
    if (!team) return;

    const analytics = await analyticsService.getAnalytics(team.id);
    return analytics;
  });
}
