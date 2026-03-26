import type { FastifyInstance } from 'fastify';
import { AuditService } from '../services/audit-service.js';
import { TeamService } from '../services/team-service.js';

const ROLE_HIERARCHY: Record<string, number> = { member: 1, admin: 2, owner: 3 };

export async function auditRoutes(fastify: FastifyInstance) {
  const auditService = new AuditService(fastify.db);
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

  // GET /api/admin/teams/:slug/audit -- list audit entries
  fastify.get('/api/admin/teams/:slug/audit', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const team = await requireAdmin(request, reply, slug);
    if (!team) return;

    const query = request.query as { actionType?: string; agentName?: string };
    const entries = await auditService.list(team.id, {
      actionType: query.actionType,
      agentName: query.agentName,
    });
    return entries;
  });

  // GET /api/admin/teams/:slug/audit/pending -- list pending approvals
  fastify.get('/api/admin/teams/:slug/audit/pending', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const team = await requireAdmin(request, reply, slug);
    if (!team) return;

    return auditService.getPendingApprovals(team.id);
  });

  // POST /api/admin/teams/:slug/audit/:id/approve -- approve pending action
  fastify.post('/api/admin/teams/:slug/audit/:id/approve', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string };
    const team = await requireAdmin(request, reply, slug);
    if (!team) return;

    const entry = await auditService.getById(id);
    if (!entry) {
      return reply.code(404).send({ error: 'Audit entry not found' });
    }
    if (entry.teamId !== team.id) {
      return reply.code(404).send({ error: 'Audit entry not found' });
    }

    const updated = await auditService.approve(id, request.userId);
    return updated;
  });

  // POST /api/admin/teams/:slug/audit/:id/reject -- reject pending action
  fastify.post('/api/admin/teams/:slug/audit/:id/reject', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string };
    const team = await requireAdmin(request, reply, slug);
    if (!team) return;

    const entry = await auditService.getById(id);
    if (!entry) {
      return reply.code(404).send({ error: 'Audit entry not found' });
    }
    if (entry.teamId !== team.id) {
      return reply.code(404).send({ error: 'Audit entry not found' });
    }

    const updated = await auditService.reject(id, request.userId);
    return updated;
  });
}
