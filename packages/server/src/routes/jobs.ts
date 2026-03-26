import type { FastifyInstance } from 'fastify';
import { queueJobSchema } from '@waggle/shared';
import { TeamService } from '../services/team-service.js';

export async function jobRoutes(fastify: FastifyInstance) {
  const teamService = new TeamService(fastify.db);

  // GET /api/jobs?teamSlug=... - list jobs for a team
  fastify.get('/api/jobs', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { teamSlug, limit } = request.query as { teamSlug?: string; limit?: string };
    if (!teamSlug) {
      return reply.code(400).send({ error: 'teamSlug query parameter is required' });
    }

    const team = await teamService.getBySlug(teamSlug);
    if (!team) return reply.code(404).send({ error: 'Team not found' });

    const membership = await teamService.getMembership(team.id, request.userId);
    if (!membership) return reply.code(403).send({ error: 'Not a member of this team' });

    const jobs = await fastify.jobService.listByTeam(team.id, limit ? parseInt(limit, 10) : 50);
    return jobs;
  });

  // POST /api/jobs - queue a new job
  fastify.post('/api/jobs', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const parsed = queueJobSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const job = await fastify.jobService.createJob(
      parsed.data.teamId ?? '',
      request.userId,
      parsed.data.jobType,
      parsed.data.input,
    );
    return reply.code(202).send({ jobId: job.id, status: job.status });
  });

  // POST /api/jobs/:id/cancel - cancel a running or queued job
  fastify.post('/api/jobs/:id/cancel', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await fastify.jobService.getJob(id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });

    if (job.status !== 'queued' && job.status !== 'running') {
      return reply.code(409).send({ error: `Cannot cancel job with status "${job.status}"` });
    }

    const updated = await fastify.jobService.cancelJob(id);
    return { cancelled: true, jobId: updated?.id ?? id };
  });

  // GET /api/jobs/:id - get job status
  fastify.get('/api/jobs/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await fastify.jobService.getJob(id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    return job;
  });
}
