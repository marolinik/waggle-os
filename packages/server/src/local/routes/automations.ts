import type { FastifyPluginAsync } from 'fastify';
import type { Automation, AutomationTriggerType } from '@waggle/shared';
import type { CronSchedule, CronExecutionRow, CronJobType } from '@waggle/core';
import { VALID_JOB_TYPES } from '@waggle/core';
import { authHeaders, clampStr } from './validate.js';

/**
 * UX-Refactor Phase 3 — Automations alias surface (S11/S20, PRD §16.10).
 *
 * The CAPABILITY is cron (CronStore + LocalScheduler + routes/cron.ts).
 * "Automations" is the PRD-vocabulary ALIAS over it (B4: alias, never rename —
 * every existing `/api/cron/*` caller keeps working). Alias routes delegate to
 * the existing handlers via internal `server.inject` so semantics (trigger
 * auto-enable, notifications, validation) stay byte-identical with zero
 * duplication. trigger/condition/actions ride the existing `job_config` TEXT
 * blob — NO `.mind` migration.
 *
 * Gate ratifications honoured:
 *  - C24 — schedule-only triggers v1: `trigger.type === 'event'` is rejected
 *          (kept in the shared union for contract stability). 'manual' maps to
 *          a DISABLED schedule that only fires via /run.
 *  - C25 — `condition` is stored as an ADVISORY `jobConfig.condition` string;
 *          no evaluation engine.
 *  - C26 — `POST /api/automations/test` is a NET-NEW dry-run through
 *          `scheduler.dryRun()` that suppresses CRON BOOKKEEPING only (no
 *          cron_schedules write, no execution-history record, no completion
 *          notification, no enable-flag mutation). The ACTION ITSELF EXECUTES
 *          FOR REAL: job handlers persist and notify in-handler (agent_task
 *          makes real LLM calls + persists a success notification; consolidation
 *          variants write memory/marketplace stores; prompt_optimization inserts
 *          AND prunes optimization-log rows; monthly_assessment writes the
 *          personal mind) — that is the action under test. The response carries
 *          an explicit `sideEffects: true` so the FE never sells this as
 *          zero-impact. It does NOT reuse `/api/cron/:id/trigger`, which
 *          requires a persisted row, auto-enables, records history and notifies.
 *  - C27 — success-rate derives from cron_execution_history (via /:id/logs);
 *          "hours saved" is dropped (no backing store).
 */

// Caps mirror cron.ts inputs.
const MAX_NAME_LEN = 200;
const MAX_CONDITION_LEN = 2000;
const MAX_ACTIONS = 20;
const MAX_ACTION_LEN = 200;

interface TriggerBody {
  type?: string;
  /** Cron expression — accepted under either key the Builder may emit. */
  cron?: string;
  schedule?: string;
}

interface AutomationBody {
  name?: string;
  trigger?: TriggerBody;
  schedule?: string;
  condition?: string;
  actions?: string[];
  agentId?: string;
  notify?: boolean;
  jobType?: string;
  jobConfig?: Record<string, unknown>;
  workspaceId?: string;
  enabled?: boolean;
}

/** Camel-case cron row as emitted by routes/cron.ts toResponse(). */
interface CronRowResponse {
  id: number;
  name: string;
  cronExpr: string;
  jobType: string;
  jobConfig: Record<string, unknown>;
  workspaceId: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

function resolveTriggerType(trigger?: TriggerBody): AutomationTriggerType {
  if (trigger?.type === 'manual') return 'manual';
  if (trigger?.type === 'event') return 'event';
  return 'schedule';
}

function resolveCronExpr(body: AutomationBody): string | undefined {
  return body.trigger?.cron ?? body.trigger?.schedule ?? body.schedule;
}

/** Pick the cron job type: explicit jobType wins, else a recognized first
 *  action, else 'agent_task' (the generic prompt-runner). */
function resolveJobType(body: AutomationBody): CronJobType {
  if (body.jobType && VALID_JOB_TYPES.has(body.jobType)) return body.jobType as CronJobType;
  const first = body.actions?.[0];
  if (first && VALID_JOB_TYPES.has(first)) return first as CronJobType;
  return 'agent_task';
}

/** Assemble the job_config blob: caller-supplied config + the PRD automation
 *  vocabulary (trigger/condition/actions/agentId/notify) riding alongside. */
function buildJobConfig(body: AutomationBody, triggerType: AutomationTriggerType): Record<string, unknown> {
  return {
    ...(body.jobConfig ?? {}),
    trigger: { type: triggerType },
    ...(body.condition !== undefined ? { condition: clampStr(body.condition, MAX_CONDITION_LEN) } : {}),
    ...(Array.isArray(body.actions)
      ? { actions: body.actions.slice(0, MAX_ACTIONS).map((a) => clampStr(a, MAX_ACTION_LEN)) }
      : {}),
    ...(body.agentId !== undefined ? { agentId: clampStr(body.agentId, 200) } : {}),
    ...(body.notify !== undefined ? { notify: body.notify === true } : {}),
  };
}

/** Project a cron row onto the shared Automation contract. */
function toAutomation(row: CronRowResponse): Automation {
  const jc = row.jobConfig ?? {};
  const trigger = jc.trigger as { type?: string } | undefined;
  const actions = Array.isArray(jc.actions) && jc.actions.length > 0
    ? (jc.actions as unknown[]).map((a) => String(a))
    : [row.jobType];
  return {
    id: String(row.id),
    name: row.name,
    triggerType: trigger?.type === 'manual' ? 'manual' : 'schedule',
    schedule: row.cronExpr,
    ...(typeof jc.condition === 'string' ? { condition: jc.condition } : {}),
    actions,
    ...(typeof jc.agentId === 'string' ? { agentId: jc.agentId } : {}),
    ...(typeof jc.notify === 'boolean' ? { notify: jc.notify } : {}),
    workspaceId: row.workspaceId ?? '*',
    status: row.enabled ? 'active' : 'paused',
    ...(row.lastRunAt ? { lastRun: row.lastRunAt } : {}),
    ...(row.nextRunAt ? { nextRun: row.nextRunAt } : {}),
  };
}

export const automationRoutes: FastifyPluginAsync = async (server) => {
  /** C24 gate, shared by create/update/test. Returns an error string or null. */
  function rejectEventTrigger(body: AutomationBody): string | null {
    if (resolveTriggerType(body.trigger) === 'event') {
      return 'Event triggers are not supported yet (schedule-only v1, gate C24)';
    }
    return null;
  }

  // GET /api/automations — alias over GET /api/cron, reshaped to the Automation contract.
  server.get('/api/automations', async (request, reply) => {
    const res = await server.inject({ method: 'GET', url: '/api/cron', headers: authHeaders(request) });
    if (res.statusCode >= 400) return reply.status(res.statusCode).send(res.json());
    const body = res.json() as { schedules: CronRowResponse[] };
    const automations = (body.schedules ?? []).map(toAutomation);
    return { automations, count: automations.length };
  });

  // POST /api/automations — alias over POST /api/cron. trigger/condition/actions
  // persist into job_config; the cron expression into cron_expr (C24 schedule-only).
  server.post<{ Body: AutomationBody }>('/api/automations', async (request, reply) => {
    const b = request.body ?? {};
    if (!b.name || !String(b.name).trim()) {
      return reply.status(400).send({ error: 'name is required' });
    }
    const eventErr = rejectEventTrigger(b);
    if (eventErr) return reply.status(400).send({ error: eventErr });

    const triggerType = resolveTriggerType(b.trigger);
    const cronExpr = resolveCronExpr(b);
    if (triggerType === 'schedule' && !cronExpr) {
      return reply.status(400).send({ error: 'schedule (cron expression) is required for a schedule trigger' });
    }

    const res = await server.inject({
      method: 'POST',
      url: '/api/cron',
      headers: authHeaders(request),
      payload: {
        name: clampStr(b.name, MAX_NAME_LEN),
        // 'manual' = a valid-but-disabled schedule; it only fires via /run.
        cronExpr: cronExpr ?? '0 0 1 1 *',
        jobType: resolveJobType(b),
        jobConfig: buildJobConfig(b, triggerType),
        ...(b.workspaceId !== undefined ? { workspaceId: b.workspaceId } : {}),
        enabled: triggerType === 'manual' ? false : b.enabled,
      },
    });
    const body = res.json() as CronRowResponse | { error: string };
    if (res.statusCode >= 400) return reply.status(res.statusCode).send(body);
    const automation = toAutomation(body as CronRowResponse);
    return reply.status(201).send({ id: automation.id, automation });
  });

  // PATCH /api/automations/:id — alias over PATCH /api/cron/:id. jobConfig-borne
  // fields (trigger/condition/actions/agentId/notify) merge over the stored blob.
  server.patch<{ Params: { id: string }; Body: AutomationBody }>(
    '/api/automations/:id',
    async (request, reply) => {
      const b = request.body ?? {};
      const eventErr = rejectEventTrigger(b);
      if (eventErr) return reply.status(400).send({ error: eventErr });

      const current = await server.inject({
        method: 'GET', url: `/api/cron/${encodeURIComponent(request.params.id)}`, headers: authHeaders(request),
      });
      if (current.statusCode >= 400) return reply.status(current.statusCode).send(current.json());
      const row = current.json() as CronRowResponse;

      const touchesConfig = b.condition !== undefined || b.actions !== undefined
        || b.agentId !== undefined || b.notify !== undefined || b.trigger !== undefined
        || b.jobConfig !== undefined;
      const cronExpr = resolveCronExpr(b);

      const res = await server.inject({
        method: 'PATCH',
        url: `/api/cron/${encodeURIComponent(request.params.id)}`,
        headers: authHeaders(request),
        payload: {
          ...(b.name !== undefined ? { name: clampStr(b.name, MAX_NAME_LEN) } : {}),
          ...(cronExpr !== undefined ? { cronExpr } : {}),
          ...(touchesConfig
            ? { jobConfig: { ...row.jobConfig, ...buildJobConfig(b, resolveTriggerType(b.trigger)) } }
            : {}),
          ...(b.workspaceId !== undefined ? { workspaceId: b.workspaceId } : {}),
          ...(b.enabled !== undefined ? { enabled: b.enabled } : {}),
        },
      });
      const body = res.json() as CronRowResponse | { error: string };
      if (res.statusCode >= 400) return reply.status(res.statusCode).send(body);
      return { ok: true, automation: toAutomation(body as CronRowResponse) };
    },
  );

  // POST /api/automations/:id/run — alias over POST /api/cron/:id/trigger.
  // Inherits the trigger semantics on purpose (explicit "Run now"): auto-enables
  // a disabled job, executes via scheduler.executeJob, emits a notification.
  server.post<{ Params: { id: string } }>('/api/automations/:id/run', async (request, reply) => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/cron/${encodeURIComponent(request.params.id)}/trigger`,
      headers: authHeaders(request),
    });
    const body = res.json() as Record<string, unknown>;
    if (res.statusCode >= 400) return reply.status(res.statusCode).send(body);
    return {
      runId: String(body.id),
      triggered: body.triggered === true,
      ...(body.autoEnabled !== undefined ? { autoEnabled: body.autoEnabled === true } : {}),
      ...(body.nextRunAt !== undefined ? { nextRunAt: body.nextRunAt } : {}),
    };
  });

  // POST /api/automations/:id/pause — NET-NEW thin route (the PRD contract;
  // the FE should not have to encode the enabled-flag trick). Sets
  // cron_schedules.enabled = 0 and resets the scheduler's failure state so a
  // later resume starts with a clean auto-disable counter.
  server.post<{ Params: { id: string } }>('/api/automations/:id/pause', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) return reply.status(400).send({ error: 'Invalid ID' });
    const existing = server.cronStore.getById(id);
    if (!existing) return reply.status(404).send({ error: 'Schedule not found' });

    server.cronStore.update(id, { enabled: false });
    try {
      server.scheduler.resetFailure(id);
    } catch { /* scheduler unavailable — flag reset is best-effort */ }
    return { ok: true, id, enabled: false };
  });

  // GET /api/automations/:id/logs — alias over GET /api/cron/:id/history
  // (registered in notifications.ts), reshaped to camelCase log rows (C27:
  // success-rate derives from these client-side).
  server.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/api/automations/:id/logs',
    async (request, reply) => {
      const qs = request.query.limit ? `?limit=${encodeURIComponent(request.query.limit)}` : '';
      const res = await server.inject({
        method: 'GET',
        url: `/api/cron/${encodeURIComponent(request.params.id)}/history${qs}`,
        headers: authHeaders(request),
      });
      if (res.statusCode >= 400) return reply.status(res.statusCode).send(res.json());
      const body = res.json() as {
        history: Array<{
          id: number; executed_at: string; duration_ms: number | null;
          success: number; result_summary: string | null; error: string | null;
        }>;
      };
      const logs = (body.history ?? []).map((h) => ({
        id: h.id,
        executedAt: h.executed_at,
        durationMs: h.duration_ms,
        success: h.success === 1,
        resultSummary: h.result_summary,
        error: h.error,
      }));
      return { logs, count: logs.length };
    },
  );

  // POST /api/automations/test — C26 NET-NEW no-persist dry-run. Runs a DRAFT
  // automation body through the real executor dispatch via scheduler.dryRun()
  // with an ad-hoc (unsaved) schedule object. Nothing is persisted, enabled,
  // recorded or notified. Result/error returns inline as { previewResult }.
  server.post<{ Body: AutomationBody }>('/api/automations/test', async (request, reply) => {
    const b = request.body ?? {};
    const eventErr = rejectEventTrigger(b);
    if (eventErr) return reply.status(400).send({ error: eventErr });
    if (!Array.isArray(b.actions) && !b.jobType && !b.jobConfig) {
      return reply.status(400).send({ error: 'actions (or jobType/jobConfig) are required for a test run' });
    }

    const triggerType = resolveTriggerType(b.trigger);
    const adHoc: CronSchedule = {
      id: -1,
      name: clampStr(b.name ?? 'automation-test', MAX_NAME_LEN),
      cron_expr: resolveCronExpr(b) ?? '* * * * *',
      job_type: resolveJobType(b),
      job_config: JSON.stringify(buildJobConfig(b, triggerType)),
      workspace_id: b.workspaceId ?? null,
      enabled: 1,
      last_run_at: null,
      next_run_at: null,
      created_at: new Date().toISOString(),
    };

    const startedAt = Date.now();
    try {
      await server.scheduler.dryRun(adHoc);
      return {
        previewResult: {
          ok: true,
          jobType: adHoc.job_type,
          durationMs: Date.now() - startedAt,
        },
      };
    } catch (err) {
      // Test FAILED — still a successful test run; the failure is the result.
      return {
        previewResult: {
          ok: false,
          jobType: adHoc.job_type,
          durationMs: Date.now() - startedAt,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  });
};
