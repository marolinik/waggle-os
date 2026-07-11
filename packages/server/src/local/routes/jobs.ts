import type { FastifyPluginAsync } from 'fastify';

/** Local equivalents of the cloud job status/cancel endpoints. */
export const localJobRoutes: FastifyPluginAsync = async (server) => {
  server.get<{ Params: { id: string } }>('/api/jobs/:id', async (request, reply) => {
    const job = server.localJobStore.get(request.params.id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    return job;
  });

  server.post<{ Params: { id: string } }>('/api/jobs/:id/cancel', async (request, reply) => {
    const job = server.localJobStore.get(request.params.id);
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    if (job.status !== 'queued' && job.status !== 'running') {
      return reply.code(409).send({ error: `Cannot cancel job with status "${job.status}"` });
    }
    server.localJobStore.cancel(request.params.id);
    return { cancelled: true, jobId: request.params.id };
  });
};
