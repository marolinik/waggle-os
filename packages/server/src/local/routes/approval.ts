import type { FastifyPluginAsync } from 'fastify';

export const approvalRoutes: FastifyPluginAsync = async (server) => {
  // POST /api/approval/:requestId — approve or deny a pending tool execution
  server.post<{
    Params: { requestId: string };
    Body: { approved: boolean; reason?: string };
  }>('/api/approval/:requestId', async (request, reply) => {
    const { requestId } = request.params;
    const { approved } = request.body ?? {};

    const pending = server.agentState.pendingApprovals.get(requestId);
    if (!pending) {
      return reply.status(404).send({ error: 'No pending approval with that ID' });
    }

    // Resolve the waiting hook
    pending.resolve(approved);
    server.agentState.pendingApprovals.delete(requestId);

    return reply.send({ ok: true, requestId, approved });
  });

  // GET /api/approval/pending — list pending approvals (for reconnection)
  server.get('/api/approval/pending', async () => {
    const pending: Array<{ requestId: string; toolName: string; input: Record<string, unknown>; timestamp: number }> = [];
    for (const [id, p] of server.agentState.pendingApprovals) {
      pending.push({ requestId: id, toolName: p.toolName, input: p.input, timestamp: p.timestamp });
    }
    return { pending, count: pending.length };
  });
};
