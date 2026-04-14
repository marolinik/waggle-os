/**
 * Evolution Routes — Phase 7 of the self-evolution loop.
 *
 * HTTP surface for the EvolutionOrchestrator + EvolutionRunStore. The
 * server owns the deploy callback (file write + cache invalidation);
 * callers only manipulate run state.
 *
 * Endpoints:
 *   GET  /api/evolution/runs                — list proposals (with filters)
 *   GET  /api/evolution/runs/:uuid          — single run detail
 *   POST /api/evolution/runs/:uuid/accept   — deploy + mark deployed
 *   POST /api/evolution/runs/:uuid/reject   — mark rejected
 *   GET  /api/evolution/status              — aggregate counts for dashboard
 */

import type { FastifyPluginAsync } from 'fastify';
import type { EvolutionRun, EvolutionRunStatus } from '@waggle/core';
import {
  EvolutionOrchestrator,
  deployPersonaOverride,
  deployBehavioralSpecOverride,
  type BehavioralSpecSection,
} from '@waggle/agent';
import { createLogger } from '../logger.js';

const log = createLogger('evolution');

// ── Deploy dispatcher ────────────────────────────────────────────

/**
 * Given an accepted run, write the evolved text to the right place on
 * disk. Returns a structured result for audit. Throws when the run's
 * target kind isn't one the deployer knows how to handle — the
 * orchestrator converts that throw into `failed` status.
 */
function deployFromRun(dataDir: string, run: EvolutionRun): { path: string } {
  switch (run.target_kind) {
    case 'persona-system-prompt': {
      if (!run.target_name) {
        throw new Error('persona-system-prompt deploy needs target_name (persona id)');
      }
      const result = deployPersonaOverride(dataDir, {
        personaId: run.target_name,
        systemPrompt: run.winner_text,
      });
      return { path: result.path };
    }
    case 'behavioral-spec-section': {
      if (!run.target_name) {
        throw new Error('behavioral-spec-section deploy needs target_name (section id)');
      }
      const result = deployBehavioralSpecOverride(dataDir, {
        section: run.target_name as BehavioralSpecSection,
        text: run.winner_text,
        runUuid: run.run_uuid,
      });
      return { path: result.path };
    }
    case 'tool-description':
    case 'skill-body':
    case 'generic':
    default:
      throw new Error(
        `Deploy for target_kind "${run.target_kind}" is not yet implemented`,
      );
  }
}

// ── Plugin ───────────────────────────────────────────────────────

export const evolutionRoutes: FastifyPluginAsync = async (server) => {
  /**
   * GET /api/evolution/runs — list runs (newest first).
   *
   * Query:
   *   ?status=proposed|accepted|rejected|deployed|failed  (repeat for multiple)
   *   ?targetKind=persona-system-prompt|...
   *   ?targetName=coder
   *   ?since=2026-04-01T00:00:00Z
   *   ?limit=50
   */
  server.get<{
    Querystring: {
      status?: string | string[];
      targetKind?: string;
      targetName?: string;
      since?: string;
      limit?: string;
    };
  }>('/api/evolution/runs', async (request) => {
    const q = request.query;
    const statusFilter = Array.isArray(q.status)
      ? q.status as EvolutionRunStatus[]
      : q.status
        ? [q.status as EvolutionRunStatus]
        : undefined;

    const rows = server.evolutionStore.list({
      status: statusFilter,
      targetKind: q.targetKind as EvolutionRun['target_kind'] | undefined,
      targetName: q.targetName,
      since: q.since,
      limit: q.limit ? Math.max(1, Math.min(500, parseInt(q.limit, 10) || 50)) : 50,
    });

    return { runs: rows, count: rows.length };
  });

  /**
   * GET /api/evolution/runs/:uuid — single run with parsed JSON blobs.
   */
  server.get<{ Params: { uuid: string } }>(
    '/api/evolution/runs/:uuid',
    async (request, reply) => {
      const run = server.evolutionStore.getByUuid(request.params.uuid);
      if (!run) return reply.status(404).send({ error: 'Run not found' });

      let winnerSchema: unknown = null;
      if (run.winner_schema_json) {
        try { winnerSchema = JSON.parse(run.winner_schema_json); } catch { /* keep null */ }
      }
      let artifacts: unknown = null;
      if (run.artifacts_json) {
        try { artifacts = JSON.parse(run.artifacts_json); } catch { /* keep null */ }
      }
      let gateReasons: unknown = [];
      try { gateReasons = JSON.parse(run.gate_reasons_json); } catch { /* keep [] */ }

      return { ...run, winnerSchema, artifacts, gateReasons };
    },
  );

  /**
   * POST /api/evolution/runs/:uuid/accept
   *
   * Body: { note?: string }
   *
   * Marks the run accepted, invokes the deploy dispatcher, then moves
   * to deployed (on success) or failed (on throw). Emits a
   * 'persona:reloaded' or 'behavioral-spec:reloaded' event on the
   * server event bus so other subsystems (chat route's
   * systemPromptCache) can invalidate their caches.
   */
  server.post<{
    Params: { uuid: string };
    Body: { note?: string };
  }>('/api/evolution/runs/:uuid/accept', async (request, reply) => {
    const { uuid } = request.params;
    const note = (request.body ?? {}).note;

    const run = server.evolutionStore.getByUuid(uuid);
    if (!run) return reply.status(404).send({ error: 'Run not found' });
    if (run.status !== 'proposed') {
      return reply.status(409).send({
        error: `Run is in status "${run.status}" — only proposed runs can be accepted`,
      });
    }

    const orchestrator = new EvolutionOrchestrator({
      traceStore: server.traceStore,
      runStore: server.evolutionStore,
      deploy: async (acceptedRun) => {
        const result = deployFromRun(server.localConfig.dataDir, acceptedRun);
        log.info(
          `Evolution deployed: ${acceptedRun.target_kind}/${acceptedRun.target_name ?? '?'} → ${result.path}`,
        );
        // Signal subsystems that the persona / spec source changed so
        // they can drop any cached derivations.
        if (acceptedRun.target_kind === 'persona-system-prompt') {
          server.eventBus.emit('persona:reloaded', { personaId: acceptedRun.target_name });
        } else if (acceptedRun.target_kind === 'behavioral-spec-section') {
          server.eventBus.emit('behavioral-spec:reloaded', { section: acceptedRun.target_name });
        }
      },
    });

    const updated = await orchestrator.accept(uuid, note);
    if (!updated) return reply.status(500).send({ error: 'Accept returned no record' });

    return reply.status(200).send(updated);
  });

  /**
   * POST /api/evolution/runs/:uuid/reject
   *
   * Body: { reason?: string }
   */
  server.post<{
    Params: { uuid: string };
    Body: { reason?: string };
  }>('/api/evolution/runs/:uuid/reject', async (request, reply) => {
    const { uuid } = request.params;
    const reason = (request.body ?? {}).reason;

    const run = server.evolutionStore.getByUuid(uuid);
    if (!run) return reply.status(404).send({ error: 'Run not found' });
    if (run.status !== 'proposed') {
      return reply.status(409).send({
        error: `Run is in status "${run.status}" — only proposed runs can be rejected`,
      });
    }

    const updated = server.evolutionStore.reject(uuid, reason);
    return reply.status(200).send(updated);
  });

  /**
   * GET /api/evolution/status — aggregate counts for the dashboard.
   */
  server.get<{
    Querystring: {
      targetKind?: string;
      targetName?: string;
      since?: string;
    };
  }>('/api/evolution/status', async (request) => {
    const q = request.query;
    const counts = server.evolutionStore.statusCounts({
      targetKind: q.targetKind as EvolutionRun['target_kind'] | undefined,
      targetName: q.targetName,
      since: q.since,
    });
    const pendingCount = counts.proposed;
    return { counts, pendingCount };
  });
};
