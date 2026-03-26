/**
 * Waggle Dance Signals — local stub for swarm communication.
 * The full implementation lives in @waggle/waggle-dance for team mode.
 * This stub ensures the frontend doesn't crash on 404.
 */
import type { FastifyPluginAsync } from 'fastify';

export const waggleSignalRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/waggle/signals — list signals (empty in local mode)
  fastify.get('/api/waggle/signals', async () => {
    return { signals: [] };
  });

  // POST /api/waggle/signals — publish signal (no-op in local mode)
  fastify.post('/api/waggle/signals', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    return reply.code(201).send({
      id: `sig-${Date.now()}`,
      ...body,
      timestamp: new Date().toISOString(),
    });
  });

  // PATCH /api/waggle/signals/:id/ack — acknowledge signal
  fastify.patch('/api/waggle/signals/:id/ack', async (request) => {
    const { id } = request.params as { id: string };
    return { acknowledged: true, id };
  });

  // GET /api/waggle/stream — SSE stub (immediate close)
  fastify.get('/api/waggle/stream', async (_request, reply) => {
    reply.header('Content-Type', 'text/event-stream');
    reply.header('Cache-Control', 'no-cache');
    reply.header('Connection', 'keep-alive');
    return reply.send('event: connected\ndata: {}\n\n');
  });
};
