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
  LLMJudge,
  deployPersonaOverride,
  deployBehavioralSpecOverride,
  createAnthropicEvolutionLLM,
  buildJudgeLLMCall,
  buildGEPAMutateFn,
  buildSchemaExecuteFn,
  makeRunningJudge,
  type BehavioralSpecSection,
  type EvolutionLLM,
  type Schema,
  type SchemaBaselineInput,
  type EvolutionTarget,
  type GateOptions,
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
   * POST /api/evolution/run
   *
   * Trigger a real evolution run synchronously. Uses the Anthropic key from
   * the vault to build Haiku-backed judge / mutate / execute functions and
   * invokes `EvolutionOrchestrator.runOnce`. The resulting proposal (if
   * any) is persisted to the evolution store and surfaced in the response
   * so the caller can immediately show it to the user.
   *
   * Body:
   *   {
   *     targetKind: 'persona-system-prompt' | 'behavioral-spec-section' | ...
   *     targetName: string
   *     baseline: string                 // current instruction text
   *     schemaBaseline: Schema           // current structural baseline (DSPy signature)
   *     minDelta?: number                // default 0.02
   *     gepa?: { populationSize?, generations?, miniEvalSize?, anchorEvalSize?, seed? }
   *     schema?: { populationSize?, generations?, evalSize?, anchorEvalSize?, seed? }
   *     gateOptions?: GateOptions
   *   }
   *
   * Status codes:
   *   200 — orchestrator ran (see body.outcome for proposed / skipped-*)
   *   400 — validation error (missing/invalid body fields)
   *   422 — no Anthropic API key configured in the vault
   *   503 — @ax-llm/ax unavailable or LLM init failed
   */
  server.post<{
    Body: {
      targetKind?: EvolutionTarget;
      targetName?: string;
      baseline?: string;
      schemaBaseline?: Schema;
      minDelta?: number;
      gepa?: {
        populationSize?: number;
        generations?: number;
        miniEvalSize?: number;
        anchorEvalSize?: number;
        seed?: number;
      };
      schema?: {
        populationSize?: number;
        generations?: number;
        evalSize?: number;
        anchorEvalSize?: number;
        seed?: number;
      };
      gateOptions?: GateOptions;
    };
  }>('/api/evolution/run', async (request, reply) => {
    const body = request.body ?? {};
    const validation = validateRunBody(body);
    if (!validation.ok) {
      return reply.status(400).send({ error: validation.error });
    }
    const { targetKind, targetName, baseline, schemaBaseline } = validation;

    // Resolve the Anthropic key from the vault. Evolution is opt-in — if
    // the user has not added their key we stop here with an actionable
    // message rather than burning CPU on stub LLMs.
    const apiKey = server.vault?.get('anthropic')?.value;
    if (!apiKey) {
      return reply.status(422).send({
        error: 'No Anthropic API key configured. Add one in Settings → Vault.',
      });
    }

    const llm = await buildEvolutionLLM(apiKey);
    if (!llm) {
      return reply.status(503).send({
        error: '@ax-llm/ax is not available — cannot initialize the evolution LLM.',
      });
    }

    // Compose adapters — shared judge for both stages, wrapped with a
    // running judge for GEPA so prompts are executed against real LLM
    // output before scoring. The ES stage has its own executor and uses
    // the base judge directly.
    const baseJudge = new LLMJudge(buildJudgeLLMCall(llm));
    const runningJudge = makeRunningJudge(baseJudge, llm);
    const schemaExecute = buildSchemaExecuteFn(llm);
    const mutate = buildGEPAMutateFn(llm);

    const orchestrator = new EvolutionOrchestrator({
      traceStore: server.traceStore,
      runStore: server.evolutionStore,
      // No deploy callback — accept endpoint handles that separately.
    });

    try {
      const result = await orchestrator.runOnce({
        targetKind,
        targetName,
        baseline,
        schemaBaseline: schemaBaseline as SchemaBaselineInput['baseline'],
        minDelta: body.minDelta,
        gateOptions: body.gateOptions,
        compose: {
          schema: {
            execute: schemaExecute,
            judge: baseJudge,
            // Orchestrator mines examples from the trace store when empty;
            // the field is present for type-completeness only.
            examples: [],
            ...(body.schema ?? {}),
          },
          instructions: {
            judge: runningJudge,
            mutate,
            targetKind,
            examples: [],
            ...(body.gepa ?? {}),
          },
        },
      });

      log.info(
        `Evolution run: ${targetKind}/${targetName ?? '?'} → ${result.outcome}` +
        (result.run ? ` (run ${result.run.run_uuid})` : ''),
      );

      return reply.status(200).send({
        outcome: result.outcome,
        reason: result.reason,
        run: result.run,
        gateResults: result.gateResults,
        // Compose result can be large; only include the deltas + winner id.
        composeSummary: result.compose
          ? {
            combinedDelta: result.compose.combinedDelta,
            fullyImproved: result.compose.fullyImproved,
            schemaImproved: result.compose.schema.improved,
            schemaDelta: result.compose.schema.deltaAccuracy,
            instructionImproved: result.compose.instructions.improved,
            instructionDelta: result.compose.instructions.delta,
            winnerId: result.compose.instructions.winner.id,
          }
          : null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn(`Evolution run failed: ${msg}`);
      return reply.status(500).send({ error: `Evolution run failed: ${msg}` });
    }
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

// ── /run helpers ────────────────────────────────────────────────

const VALID_TARGET_KINDS: EvolutionTarget[] = [
  'persona-system-prompt',
  'behavioral-spec-section',
  'tool-description',
  'skill-body',
  'generic',
];

type ValidationOk = {
  ok: true;
  targetKind: EvolutionTarget;
  targetName: string;
  baseline: string;
  schemaBaseline: Schema;
};
type ValidationErr = { ok: false; error: string };

/**
 * Validate the POST /api/evolution/run body. Returns a discriminated union
 * so the handler can early-return with a 400 on any shape error.
 */
function validateRunBody(body: unknown): ValidationOk | ValidationErr {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Body must be a JSON object.' };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.targetKind !== 'string' || !VALID_TARGET_KINDS.includes(b.targetKind as EvolutionTarget)) {
    return {
      ok: false,
      error: `targetKind must be one of: ${VALID_TARGET_KINDS.join(', ')}`,
    };
  }
  if (typeof b.targetName !== 'string' || b.targetName.trim().length === 0) {
    return { ok: false, error: 'targetName must be a non-empty string.' };
  }
  if (typeof b.baseline !== 'string' || b.baseline.trim().length === 0) {
    return { ok: false, error: 'baseline must be a non-empty string.' };
  }
  const sb = b.schemaBaseline;
  if (!sb || typeof sb !== 'object') {
    return { ok: false, error: 'schemaBaseline must be an object with {name, fields, version}.' };
  }
  const schemaObj = sb as Record<string, unknown>;
  if (typeof schemaObj.name !== 'string' || !Array.isArray(schemaObj.fields)) {
    return { ok: false, error: 'schemaBaseline requires string "name" and array "fields".' };
  }

  return {
    ok: true,
    targetKind: b.targetKind as EvolutionTarget,
    targetName: b.targetName,
    baseline: b.baseline,
    schemaBaseline: sb as Schema,
  };
}

/**
 * Hook point for tests: override the LLM factory by setting
 * `(globalThis as any).__wagglEvolutionLlmFactory` to an `(apiKey) => EvolutionLLM`.
 * Production code flows through `createAnthropicEvolutionLLM`.
 */
async function buildEvolutionLLM(apiKey: string): Promise<EvolutionLLM | null> {
  const override = (globalThis as unknown as {
    __waggleEvolutionLlmFactory?: (apiKey: string) => EvolutionLLM | Promise<EvolutionLLM>;
  }).__waggleEvolutionLlmFactory;
  if (override) {
    return await override(apiKey);
  }
  return createAnthropicEvolutionLLM(apiKey);
}
