import type { FastifyInstance } from 'fastify';
import { CronService } from '../services/cron-service.js';
import { TeamService } from '../services/team-service.js';
import { createCronSchema } from '@waggle/shared';

export async function cronRoutes(fastify: FastifyInstance) {
  const cronService = new CronService(fastify.db);
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

  // POST /api/teams/:slug/cron — create a cron schedule
  fastify.post('/api/teams/:slug/cron', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const team = await resolveTeam(request, reply, slug);
    if (!team) return;

    const parsed = createCronSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    try {
      const schedule = await cronService.create(team.id, request.userId, parsed.data);
      return reply.code(201).send(schedule);
    } catch (err: any) {
      return reply.code(400).send({ error: 'Invalid cron expression', message: err.message });
    }
  });

  // GET /api/teams/:slug/cron — list schedules for team
  fastify.get('/api/teams/:slug/cron', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const team = await resolveTeam(request, reply, slug);
    if (!team) return;

    const schedules = await cronService.list(team.id);
    return schedules;
  });

  // PATCH /api/teams/:slug/cron/:id — update a cron schedule
  fastify.patch('/api/teams/:slug/cron/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string };
    const team = await resolveTeam(request, reply, slug);
    if (!team) return;

    const body = request.body as {
      name?: string;
      cronExpr?: string;
      enabled?: boolean;
      jobConfig?: Record<string, unknown>;
    };

    try {
      const updated = await cronService.update(id, body);
      if (!updated) {
        return reply.code(404).send({ error: 'Schedule not found' });
      }
      return updated;
    } catch (err: any) {
      return reply.code(400).send({ error: 'Invalid cron expression', message: err.message });
    }
  });
}
