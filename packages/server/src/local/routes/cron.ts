/**
 * Cron REST API Routes — CRUD + manual trigger for Solo cron schedules.
 *
 * Endpoints:
 *   POST   /api/cron            — create schedule
 *   GET    /api/cron             — list all schedules
 *   GET    /api/cron/:id         — get one schedule
 *   PATCH  /api/cron/:id         — update schedule
 *   DELETE /api/cron/:id         — delete schedule
 *   POST   /api/cron/:id/trigger — manually trigger a schedule
 *
 * Part of Wave 1.1 — Solo Cron Service.
 */

import type { FastifyPluginAsync } from 'fastify';
import type { CronSchedule, CronJobType } from '@waggle/core';
import { emitNotification } from './notifications.js';

/** Convert DB snake_case CronSchedule to API camelCase response. */
function toResponse(s: CronSchedule) {
  return {
    id: s.id,
    name: s.name,
    cronExpr: s.cron_expr,
    jobType: s.job_type,
    jobConfig: JSON.parse(s.job_config),
    workspaceId: s.workspace_id,
    enabled: s.enabled === 1,
    lastRunAt: s.last_run_at,
    nextRunAt: s.next_run_at,
    createdAt: s.created_at,
  };
}

export const cronRoutes: FastifyPluginAsync = async (server) => {
  // POST /api/cron — create a new schedule
  server.post<{
    Body: {
      name: string;
      cronExpr: string;
      jobType: CronJobType;
      jobConfig?: Record<string, unknown>;
      workspaceId?: string;
      enabled?: boolean;
    };
  }>('/api/cron', async (request, reply) => {
    const { name, cronExpr, jobType, jobConfig, workspaceId, enabled } = request.body ?? {};
    if (!name || !cronExpr || !jobType) {
      return reply.status(400).send({ error: 'name, cronExpr, and jobType are required' });
    }

    // F30: Normalize "global" to "*" for cross-workspace cron jobs
    const normalizedWorkspaceId = workspaceId === 'global' ? '*' : workspaceId;

    try {
      const schedule = server.cronStore.create({
        name,
        cronExpr,
        jobType,
        jobConfig,
        workspaceId: normalizedWorkspaceId,
        enabled,
      });
      return toResponse(schedule);
    } catch (err) {
      return reply.status(400).send({
        error: err instanceof Error ? err.message : 'Failed to create schedule',
      });
    }
  });

  // GET /api/cron — list all schedules
  server.get('/api/cron', async () => {
    const schedules = server.cronStore.list();
    return { schedules: schedules.map(toResponse), count: schedules.length };
  });

  // GET /api/cron/:id — get one schedule
  server.get<{
    Params: { id: string };
  }>('/api/cron/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid ID' });
    }
    const schedule = server.cronStore.getById(id);
    if (!schedule) {
      return reply.status(404).send({ error: 'Schedule not found' });
    }
    return toResponse(schedule);
  });

  // PATCH /api/cron/:id — update a schedule
  server.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      cronExpr?: string;
      jobConfig?: Record<string, unknown>;
      workspaceId?: string;
      enabled?: boolean;
    };
  }>('/api/cron/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid ID' });
    }

    const existing = server.cronStore.getById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Schedule not found' });
    }

    try {
      server.cronStore.update(id, request.body ?? {});
      const updated = server.cronStore.getById(id)!;
      return toResponse(updated);
    } catch (err) {
      return reply.status(400).send({
        error: err instanceof Error ? err.message : 'Failed to update schedule',
      });
    }
  });

  // DELETE /api/cron/:id — delete a schedule
  server.delete<{
    Params: { id: string };
  }>('/api/cron/:id', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid ID' });
    }

    const existing = server.cronStore.getById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Schedule not found' });
    }

    server.cronStore.delete(id);
    return { ok: true, id };
  });

  // POST /api/cron/:id/trigger — manually trigger a schedule
  server.post<{
    Params: { id: string };
  }>('/api/cron/:id/trigger', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) {
      return reply.status(400).send({ error: 'Invalid ID' });
    }

    const schedule = server.cronStore.getById(id);
    if (!schedule) {
      return reply.status(404).send({ error: 'Schedule not found' });
    }

    try {
      // W5.11: Actually execute the job handler (not just mark as run)
      await server.scheduler.executeJob(schedule);
      const updated = server.cronStore.getById(id);
      emitNotification(server, {
        title: 'Routine complete',
        body: `${schedule.name || 'Scheduled task'} finished`,
        category: 'cron',
        actionUrl: '/cockpit',
      });
      return { triggered: true, id, nextRunAt: updated?.next_run_at };
    } catch (err) {
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'Trigger failed',
      });
    }
  });
};
