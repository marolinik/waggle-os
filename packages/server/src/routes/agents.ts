import type { FastifyInstance } from 'fastify';
import { AgentService } from '../services/agent-service.js';
import { createAgentSchema, createAgentGroupSchema } from '@waggle/shared';

export async function agentRoutes(fastify: FastifyInstance) {
  const agentService = new AgentService(fastify.db);

  // POST /api/agents — create sub-agent definition
  fastify.post('/api/agents', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const parsed = createAgentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const agent = await agentService.create(request.userId, parsed.data);
    return reply.code(201).send(agent);
  });

  // GET /api/agents — list user's agents
  fastify.get('/api/agents', { preHandler: [fastify.authenticate] }, async (request) => {
    return agentService.list(request.userId);
  });

  // PATCH /api/agents/:id — update agent config
  fastify.patch('/api/agents/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Verify ownership by attempting update scoped to userId
    const existing = await agentService.getById(id);
    if (!existing) {
      return reply.code(404).send({ error: 'Agent not found' });
    }
    if (existing.userId !== request.userId) {
      return reply.code(403).send({ error: 'Not authorized to update this agent' });
    }

    const body = request.body as Record<string, unknown>;
    const updated = await agentService.update(id, request.userId, body);
    if (!updated) {
      return reply.code(400).send({ error: 'No valid fields to update' });
    }
    return updated;
  });

  // DELETE /api/agents/:id — delete agent
  fastify.delete('/api/agents/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await agentService.getById(id);
    if (!existing) {
      return reply.code(404).send({ error: 'Agent not found' });
    }
    if (existing.userId !== request.userId) {
      return reply.code(403).send({ error: 'Not authorized to delete this agent' });
    }

    await agentService.delete(id, request.userId);
    return reply.code(204).send();
  });

  // POST /api/agent-groups — create agent group with members
  fastify.post('/api/agent-groups', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const parsed = createAgentGroupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const group = await agentService.createGroup(request.userId, parsed.data);
    return reply.code(201).send(group);
  });

  // GET /api/agent-groups — list user's groups
  fastify.get('/api/agent-groups', { preHandler: [fastify.authenticate] }, async (request) => {
    return agentService.listGroups(request.userId);
  });

  // GET /api/agent-groups/:id — get group with members
  fastify.get('/api/agent-groups/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const group = await agentService.getGroup(id, request.userId);
    if (!group) {
      return reply.code(404).send({ error: 'Agent group not found' });
    }
    return group;
  });

  // POST /api/agent-groups/:id/run — execute group on a task (queues job)
  fastify.post('/api/agent-groups/:id/run', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Verify group ownership
    const group = await agentService.getGroup(id, request.userId);
    if (!group) {
      return reply.code(404).send({ error: 'Agent group not found' });
    }

    const body = request.body as { task?: string; teamId?: string } | undefined;

    // teamId is required for the job record
    if (!body?.teamId) {
      return reply.code(400).send({ error: 'teamId is required' });
    }

    const job = await agentService.createJob(request.userId, {
      teamId: body.teamId,
      jobType: 'task',
      input: {
        groupId: id,
        task: body?.task ?? '',
        strategy: group.strategy,
        members: group.members,
      },
    });

    return reply.code(202).send({ jobId: job.id });
  });
}
