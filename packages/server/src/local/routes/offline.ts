/**
 * Offline mode routes — PM-6
 *
 * GET  /api/offline/status — current offline state
 * POST /api/offline/queue  — queue a message for when connection restores
 * GET  /api/offline/queue  — list queued messages
 * DELETE /api/offline/queue/:id — remove a specific queued message
 * DELETE /api/offline/queue — clear all queued messages
 */

import type { FastifyInstance } from 'fastify';

export async function offlineRoutes(fastify: FastifyInstance) {
  // GET /api/offline/status — returns current offline state
  fastify.get('/api/offline/status', async () => {
    const mgr = (fastify as any).offlineManager;
    if (!mgr) {
      return {
        offline: false,
        since: null,
        queuedMessages: 0,
        lastCheck: new Date().toISOString(),
      };
    }
    return {
      ...mgr.state,
      lastCheck: mgr.lastCheck,
    };
  });

  // POST /api/offline/queue — queue a user message
  fastify.post('/api/offline/queue', async (request, reply) => {
    const mgr = (fastify as any).offlineManager;
    if (!mgr) {
      return reply.status(503).send({ error: 'Offline manager not available' });
    }

    const body = request.body as { workspaceId?: string; workspace?: string; message?: string } | undefined;
    if (!body?.message) {
      return reply.status(400).send({ error: 'message is required' });
    }

    // P0-4: Accept both 'workspaceId' and 'workspace'
    const workspaceId = body.workspaceId ?? body.workspace ?? 'default';
    const queued = mgr.queueMessage(workspaceId, body.message);
    return { queued };
  });

  // GET /api/offline/queue — list queued messages
  fastify.get('/api/offline/queue', async () => {
    const mgr = (fastify as any).offlineManager;
    if (!mgr) {
      return { messages: [] };
    }
    return { messages: mgr.getQueue() };
  });

  // DELETE /api/offline/queue/:id — remove a specific queued message
  fastify.delete('/api/offline/queue/:id', async (request, reply) => {
    const mgr = (fastify as any).offlineManager;
    if (!mgr) {
      return reply.status(503).send({ error: 'Offline manager not available' });
    }

    const { id } = request.params as { id: string };
    const removed = mgr.dequeue(id);
    if (!removed) {
      return reply.status(404).send({ error: 'Message not found' });
    }
    return { removed: true };
  });

  // DELETE /api/offline/queue — clear all queued messages
  fastify.delete('/api/offline/queue', async () => {
    const mgr = (fastify as any).offlineManager;
    if (!mgr) {
      return { cleared: 0 };
    }
    const cleared = mgr.clearQueue();
    return { cleared };
  });
}
