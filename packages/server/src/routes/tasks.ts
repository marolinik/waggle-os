import type { FastifyInstance } from 'fastify';
import { TaskService } from '../services/task-service.js';
import { TeamService } from '../services/team-service.js';
import { createTaskSchema, updateTaskSchema } from '@waggle/shared';

export async function taskRoutes(fastify: FastifyInstance) {
  const taskService = new TaskService(fastify.db);
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

  // POST /api/teams/:slug/tasks — create task
  fastify.post('/api/teams/:slug/tasks', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const team = await resolveTeam(request, reply, slug);
    if (!team) return;

    const parsed = createTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const task = await taskService.create(team.id, request.userId, parsed.data);
    return reply.code(201).send(task);
  });

  // GET /api/teams/:slug/tasks — list tasks
  fastify.get('/api/teams/:slug/tasks', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const team = await resolveTeam(request, reply, slug);
    if (!team) return;

    const query = request.query as { status?: string; assignee?: string; priority?: string };
    const filters: { status?: string; assignee?: string; priority?: string } = {};
    if (query.status) filters.status = query.status;
    if (query.assignee) filters.assignee = query.assignee;
    if (query.priority) filters.priority = query.priority;

    const taskList = await taskService.list(team.id, filters);
    return taskList;
  });

  // GET /api/teams/:slug/tasks/:id — get task details
  fastify.get('/api/teams/:slug/tasks/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string };
    const team = await resolveTeam(request, reply, slug);
    if (!team) return;

    const task = await taskService.get(id);
    if (!task || task.teamId !== team.id) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    return task;
  });

  // PATCH /api/teams/:slug/tasks/:id — update task
  fastify.patch('/api/teams/:slug/tasks/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string };
    const team = await resolveTeam(request, reply, slug);
    if (!team) return;

    const parsed = updateTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const existing = await taskService.get(id);
    if (!existing || existing.teamId !== team.id) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    const updated = await taskService.update(id, parsed.data);
    return updated;
  });

  // POST /api/teams/:slug/tasks/:id/claim — claim task
  fastify.post('/api/teams/:slug/tasks/:id/claim', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { slug, id } = request.params as { slug: string; id: string };
    const team = await resolveTeam(request, reply, slug);
    if (!team) return;

    const existing = await taskService.get(id);
    if (!existing || existing.teamId !== team.id) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    const claimed = await taskService.claim(id, request.userId);
    return claimed;
  });
}
