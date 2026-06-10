/**
 * Automations alias REST API Route Tests (UX-Refactor Phase 3, S11/S20 / B4).
 *
 * Covers the 7 routes in routes/automations.ts, asserting alias delegation onto
 * the REAL cron handlers (cronRoutes + the history route from notifications.ts
 * are registered on the test server, backed by a real CronStore + a real
 * LocalScheduler with a recording fake executor):
 *   GET    /api/automations            alias GET /api/cron, reshaped
 *   POST   /api/automations            alias POST /api/cron (C24/C25 in job_config)
 *   PATCH  /api/automations/:id        alias PATCH /api/cron/:id (jobConfig merge)
 *   POST   /api/automations/:id/run    alias /api/cron/:id/trigger (auto-enable kept)
 *   POST   /api/automations/:id/pause  NET-NEW thin (enabled=0 + failure reset)
 *   GET    /api/automations/:id/logs   alias /api/cron/:id/history, camelCased
 *   POST   /api/automations/test       C26 no-persist dry-run via scheduler.dryRun
 *
 * The onJobComplete callback mirrors the prod wiring in local/index.ts
 * (recordExecution into cron_execution_history) so the logs alias is tested
 * end-to-end — and so the dry-run test can prove it does NOT write history.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { EventEmitter } from 'node:events';
import { MindDB, CronStore, type CronSchedule } from '@waggle/core';
import { LocalScheduler } from '../../src/local/cron.js';
import { cronRoutes } from '../../src/local/routes/cron.js';
import { automationRoutes } from '../../src/local/routes/automations.js';

describe('Automations alias routes (Phase 3)', () => {
  let db: MindDB;
  let cronStore: CronStore;
  let scheduler: LocalScheduler;
  let executed: CronSchedule[];
  let failNext: boolean;
  let server: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    db = new MindDB(':memory:');
    cronStore = new CronStore(db);
    executed = [];
    failNext = false;
    scheduler = new LocalScheduler(
      cronStore,
      async (schedule) => {
        executed.push(schedule);
        if (failNext) throw new Error('boom: executor failed');
      },
      // Mirrors the prod onJobComplete wiring (local/index.ts): persist outcome.
      (schedule, result) => {
        cronStore.recordExecution(schedule.id, schedule.name, {
          success: result.success,
          ...(result.error ? { error: result.error } : {}),
        });
      },
    );

    server = Fastify({ logger: false });
    server.decorate('localConfig', { dataDir: '' });
    server.decorate('cronStore', cronStore);
    server.decorate('scheduler', scheduler);
    server.decorate('eventBus', new EventEmitter());
    // The history route lives in notifications.ts in prod; a same-shape stub
    // keeps this harness narrow (the alias only needs the route to exist).
    server.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
      '/api/cron/:id/history',
      async (request, reply) => {
        const id = parseInt(request.params.id, 10);
        if (isNaN(id)) return reply.status(400).send({ error: 'Invalid ID' });
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 20;
        const history = cronStore.getExecutionHistory(id, limit);
        return { history, count: history.length };
      },
    );
    await server.register(cronRoutes);
    await server.register(automationRoutes);
  });

  afterEach(async () => {
    await server.close();
    db.close();
  });

  async function createAutomation(body: Record<string, unknown>) {
    const res = await server.inject({ method: 'POST', url: '/api/automations', payload: body });
    expect(res.statusCode).toBe(201);
    return res.json().automation;
  }

  const SCHEDULE_BODY = {
    name: 'Nightly digest',
    trigger: { type: 'schedule', cron: '0 2 * * *' },
    condition: 'only if new memories exist',
    actions: ['workspace_health'],
    workspaceId: 'ws-test',
  };

  it('POST creates a cron row carrying trigger/condition/actions in job_config (C25 advisory)', async () => {
    const automation = await createAutomation(SCHEDULE_BODY);
    expect(automation.triggerType).toBe('schedule');
    expect(automation.schedule).toBe('0 2 * * *');
    expect(automation.condition).toBe('only if new memories exist');
    expect(automation.actions).toEqual(['workspace_health']);
    expect(automation.status).toBe('active');

    // The substrate row is a plain cron schedule — alias, not a new store (B4).
    const row = cronStore.getById(parseInt(automation.id, 10))!;
    expect(row.job_type).toBe('workspace_health'); // recognized action → job type
    const jc = JSON.parse(row.job_config);
    expect(jc.trigger).toEqual({ type: 'schedule' });
    expect(jc.condition).toBe('only if new memories exist');
    expect(jc.actions).toEqual(['workspace_health']);
  });

  it('C24: rejects event triggers (schedule-only v1)', async () => {
    const res = await server.inject({
      method: 'POST', url: '/api/automations',
      payload: { ...SCHEDULE_BODY, trigger: { type: 'event' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/schedule-only/i);
  });

  it('POST validation: name required; schedule trigger requires a cron expression', async () => {
    expect((await server.inject({ method: 'POST', url: '/api/automations', payload: { trigger: { type: 'schedule', cron: '* * * * *' } } })).statusCode).toBe(400);
    expect((await server.inject({ method: 'POST', url: '/api/automations', payload: { name: 'X', trigger: { type: 'schedule' } } })).statusCode).toBe(400);
    // Invalid cron expression → the existing cron handler's 400 passes through.
    expect((await server.inject({ method: 'POST', url: '/api/automations', payload: { ...SCHEDULE_BODY, trigger: { type: 'schedule', cron: 'not-cron' } } })).statusCode).toBe(400);
  });

  it('manual trigger maps to a DISABLED schedule that only fires via /run', async () => {
    const automation = await createAutomation({ name: 'On demand', trigger: { type: 'manual' }, actions: ['workspace_health'] });
    expect(automation.triggerType).toBe('manual');
    expect(automation.status).toBe('paused');
    expect(cronStore.getById(parseInt(automation.id, 10))!.enabled).toBe(0);
  });

  it('GET reshapes existing cron rows onto the Automation contract', async () => {
    await createAutomation(SCHEDULE_BODY);
    // A pre-existing plain cron job (no automation vocabulary) still projects.
    cronStore.create({ name: 'legacy', cronExpr: '0 3 * * *', jobType: 'memory_consolidation' });
    const res = await server.inject({ method: 'GET', url: '/api/automations' });
    expect(res.statusCode).toBe(200);
    const { automations, count } = res.json();
    expect(count).toBe(2);
    const legacy = automations.find((a: { name: string }) => a.name === 'legacy');
    expect(legacy.triggerType).toBe('schedule');
    expect(legacy.actions).toEqual(['memory_consolidation']); // falls back to jobType
  });

  it('PATCH merges jobConfig-borne fields over the stored blob', async () => {
    const automation = await createAutomation(SCHEDULE_BODY);
    const res = await server.inject({
      method: 'PATCH', url: `/api/automations/${automation.id}`,
      payload: { name: 'Renamed', condition: 'new condition', enabled: false },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json().automation;
    expect(updated.name).toBe('Renamed');
    expect(updated.condition).toBe('new condition');
    expect(updated.status).toBe('paused');
    // actions persisted earlier survive the merge.
    expect(updated.actions).toEqual(['workspace_health']);
    expect((await server.inject({ method: 'PATCH', url: '/api/automations/9999', payload: { name: 'X' } })).statusCode).toBe(404);
  });

  it('run aliases the trigger (executes + auto-enables a disabled job, by design)', async () => {
    const automation = await createAutomation({ ...SCHEDULE_BODY, enabled: false });
    const res = await server.inject({ method: 'POST', url: `/api/automations/${automation.id}/run` });
    expect(res.statusCode).toBe(200);
    expect(res.json().triggered).toBe(true);
    expect(res.json().runId).toBe(automation.id);
    expect(res.json().autoEnabled).toBe(true);
    expect(executed).toHaveLength(1);
    expect(cronStore.getById(parseInt(automation.id, 10))!.enabled).toBe(1);
  });

  it('pause disables the schedule without the enabled-flag trick', async () => {
    const automation = await createAutomation(SCHEDULE_BODY);
    const res = await server.inject({ method: 'POST', url: `/api/automations/${automation.id}/pause` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, id: parseInt(automation.id, 10), enabled: false });
    expect(cronStore.getById(parseInt(automation.id, 10))!.enabled).toBe(0);
    expect((await server.inject({ method: 'POST', url: '/api/automations/9999/pause' })).statusCode).toBe(404);
    expect((await server.inject({ method: 'POST', url: '/api/automations/abc/pause' })).statusCode).toBe(400);
  });

  it('logs alias the execution history, camelCased (C27 substrate)', async () => {
    const automation = await createAutomation(SCHEDULE_BODY);
    await server.inject({ method: 'POST', url: `/api/automations/${automation.id}/run` });
    failNext = true;
    await server.inject({ method: 'POST', url: `/api/automations/${automation.id}/run` });
    failNext = false;

    const res = await server.inject({ method: 'GET', url: `/api/automations/${automation.id}/logs` });
    expect(res.statusCode).toBe(200);
    const { logs, count } = res.json();
    expect(count).toBe(2);
    const ok = logs.filter((l: { success: boolean }) => l.success);
    const failed = logs.filter((l: { success: boolean }) => !l.success);
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toMatch(/boom/);
    expect(typeof logs[0].executedAt).toBe('string');
  });

  it('C26: test dry-runs a DRAFT through the executor with ZERO persistence', async () => {
    // A pre-existing disabled job proves the enable flag is untouched too.
    const disabled = cronStore.create({ name: 'sleepy', cronExpr: '0 4 * * *', jobType: 'workspace_health', enabled: false });

    const res = await server.inject({
      method: 'POST', url: '/api/automations/test',
      payload: {
        name: 'Draft automation',
        trigger: { type: 'schedule', cron: '0 5 * * *' },
        actions: ['workspace_health'],
        condition: 'advisory only',
      },
    });
    expect(res.statusCode).toBe(200);
    const { previewResult } = res.json();
    expect(previewResult.ok).toBe(true);
    expect(previewResult.jobType).toBe('workspace_health');
    expect(typeof previewResult.durationMs).toBe('number');

    // The executor really ran, against an AD-HOC (unsaved) schedule object.
    expect(executed).toHaveLength(1);
    expect(executed[0].id).toBe(-1);
    const jc = JSON.parse(executed[0].job_config);
    expect(jc.actions).toEqual(['workspace_health']);
    expect(jc.condition).toBe('advisory only');

    // NO persistence: no schedule row, no history row, no enable-flag mutation.
    expect(cronStore.list()).toHaveLength(1); // only the pre-existing disabled job
    expect(cronStore.getExecutionHistory(-1)).toHaveLength(0);
    expect(cronStore.getById(disabled.id)!.enabled).toBe(0);
  });

  it('C26: a failing dry-run returns the error inline (test-fail, still 200) with zero persistence', async () => {
    failNext = true;
    const res = await server.inject({
      method: 'POST', url: '/api/automations/test',
      payload: { name: 'Bad draft', trigger: { type: 'schedule', cron: '0 5 * * *' }, actions: ['workspace_health'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().previewResult.ok).toBe(false);
    expect(res.json().previewResult.error).toMatch(/boom/);
    expect(cronStore.list()).toHaveLength(0);
  });

  it('C24: test rejects event triggers; empty drafts 400', async () => {
    expect((await server.inject({
      method: 'POST', url: '/api/automations/test',
      payload: { trigger: { type: 'event' }, actions: ['workspace_health'] },
    })).statusCode).toBe(400);
    expect((await server.inject({ method: 'POST', url: '/api/automations/test', payload: {} })).statusCode).toBe(400);
  });
});
