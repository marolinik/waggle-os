import type { FastifyPluginAsync } from 'fastify';
import { executeHeldAction } from '../held-action-executor.js';

/** Parse a held action's args JSON defensively (never throw into the route). */
function safeParseArgs(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json) as unknown;
    return v && typeof v === 'object' ? v as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/** SQLite datetime('now') is 'YYYY-MM-DD HH:MM:SS' (UTC, no TZ); V8 parses the
 *  space form as LOCAL time, skewing it against live UTC epochs. Normalize. */
function toEpoch(ts: string): number {
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts) ? `${ts.replace(' ', 'T')}Z` : ts;
  return Date.parse(iso);
}

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
    if (pending) {
      // ── Live (interactive) approval path — unchanged ──
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

      server.agentState.pendingApprovals.delete(requestId);
      pending.resolve(approved);

      return reply.send({ ok: true, requestId, approved, always: !!always });
    }

    // ── Durable held-action path (L2) ──
    // Not a live request → look for a held action with this id. Approve runs the
    // real tool via the deferred executor (idempotent + re-validated); deny
    // atomically claims it as 'denied'.
    const held = server.cronStore.getPendingAction(requestId);
    if (!held) {
      return reply.status(404).send({ error: 'No pending approval with that ID' });
    }
    if (held.status !== 'held') {
      return reply.status(409).send({ error: 'already_decided', status: held.status });
    }
    if (approved) {
      const result = await executeHeldAction(server, held);
      if (result.error === 'already decided') {
        const current = server.cronStore.getPendingAction(requestId);
        return reply.status(409).send({ error: 'already_decided', status: current?.status ?? result.status });
      }
      return reply.send({ ok: result.ok, requestId, approved: true, status: result.status, ...(result.error ? { error: result.error } : {}) });
    }
    const claimed = server.cronStore.claimPendingAction(requestId, 'denied', new Date().toISOString());
    if (!claimed) {
      const current = server.cronStore.getPendingAction(requestId);
      return reply.status(409).send({ error: 'already_decided', status: current?.status ?? held.status });
    }
    return reply.send({ ok: true, requestId, approved: false, status: 'denied' });
  });

  // GET /api/approval/pending — list pending approvals (for reconnection).
  // Union of (a) live interactive approvals waiting on an open request, and
  // (b) durable held actions (L2) drafted by headless runs and awaiting a
  // human's one-click approval. Held rows carry source/risk/summary so the UI
  // can badge them; the wire shape stays a superset (additive, optional fields).
  server.get('/api/approval/pending', async () => {
    const pending: Array<{
      requestId: string; toolName: string; input: Record<string, unknown>; timestamp: number;
      source?: 'live' | 'held'; riskLevel?: string; approvalClass?: string; summary?: string | null;
    }> = [];
    for (const [id, p] of server.agentState.pendingApprovals) {
      pending.push({ requestId: id, toolName: p.toolName, input: p.input, timestamp: p.timestamp, source: 'live' });
    }
    for (const a of server.cronStore.listPendingActions('held')) {
      pending.push({
        requestId: a.id,
        toolName: a.tool_name,
        input: safeParseArgs(a.args_json),
        timestamp: toEpoch(a.created_at),
        source: 'held',
        riskLevel: a.risk_level,
        approvalClass: a.approval_class,
        summary: a.summary,
      });
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
