import type { FastifyPluginAsync } from 'fastify';

export const approvalRoutes: FastifyPluginAsync = async (server) => {
  // POST /api/approval/:requestId — approve or deny a pending tool execution.
  // Phase B.3: `always` persists the approval to the grant store so subsequent
  // identical requests (same tool + target) resolve silently.
  server.post<{
    Params: { requestId: string };
    Body: { approved: boolean; always?: boolean; reason?: string; sourceWorkspaceId?: string | null };
  }>('/api/approval/:requestId', async (request, reply) => {
    const { requestId } = request.params;
    const { approved, always, sourceWorkspaceId } = request.body ?? {};

    const pending = server.agentState.pendingApprovals.get(requestId);
    if (!pending) {
      return reply.status(404).send({ error: 'No pending approval with that ID' });
    }

    // If user chose "Always allow", persist the grant BEFORE resolving so a
    // subsequent identical request in the same tick would also see the grant.
    if (approved && always) {
      try {
        server.agentState.approvalGrantStore.grant(
          pending.toolName,
          pending.input,
          sourceWorkspaceId ?? null,
        );
      } catch { /* non-fatal: in-memory grant still works */ }
    }

    pending.resolve(approved);
    server.agentState.pendingApprovals.delete(requestId);

    return reply.send({ ok: true, requestId, approved, always: !!always });
  });

  // GET /api/approval/pending — list pending approvals (for reconnection)
  server.get('/api/approval/pending', async () => {
    const pending: Array<{ requestId: string; toolName: string; input: Record<string, unknown>; timestamp: number }> = [];
    for (const [id, p] of server.agentState.pendingApprovals) {
      pending.push({ requestId: id, toolName: p.toolName, input: p.input, timestamp: p.timestamp });
    }
    return { pending, count: pending.length };
  });

  // GET /api/approval/grants — list all persistent grants
  server.get('/api/approval/grants', async () => {
    const grants = server.agentState.approvalGrantStore.list();
    return { grants, count: grants.length };
  });

  // DELETE /api/approval/grants/:id — revoke a single grant
  server.delete<{ Params: { id: string } }>('/api/approval/grants/:id', async (request, reply) => {
    const { id } = request.params;
    const removed = server.agentState.approvalGrantStore.revoke(id);
    if (!removed) {
      return reply.status(404).send({ error: 'Grant not found' });
    }
    return reply.send({ ok: true, id });
  });

  // POST /api/approval/grants/clear — wipe every grant (reset permissions)
  server.post('/api/approval/grants/clear', async () => {
    server.agentState.approvalGrantStore.clear();
    return { ok: true };
  });
};
