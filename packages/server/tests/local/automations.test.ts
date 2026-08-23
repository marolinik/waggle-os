/**
 * Automations alias REST API Route Tests (UX-Refactor Phase 3, S11/S20 / B4).
 *
 * Covers the 7 routes in routes/automations.ts, asserting alias delegation onto
 * the REAL cron handlers (cronRoutes + the history route from the REAL
 * notificationRoutes are registered on the test server, backed by a real
 * CronStore + a real LocalScheduler with a recording fake executor):
 *   GET    /api/automations            alias GET /api/cron, reshaped
 *   POST   /api/automations            alias POST /api/cron (C24/C25 in job_config)
 *   PATCH  /api/automations/:id        alias PATCH /api/cron/:id (jobConfig merge,
 *                                      stored trigger type preserved)
 *   POST   /api/automations/:id/run    alias /api/cron/:id/trigger (auto-enable
 *                                      kept for schedules; manual rows re-disable)
 *   POST   /api/automations/:id/pause  NET-NEW thin (enabled=0 + failure reset)
 *   GET    /api/automations/:id/logs   alias /api/cron/:id/history, camelCased
 *   POST   /api/automations/test       C26 VALIDATION-ONLY preview (no execution)
 *
 * The onJobComplete callback IS the prod wiring: makeRecordExecutionCallback
 * (cron.ts) — the same closure local/index.ts installs — so the logs alias is
 * tested against the real persistence path, not a hand-copied mirror.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import Fastify from 'fastify';
import { EventEmitter } from 'node:events';
import { MindDB, CronStore, type CronSchedule } from '@waggle/core';
import { LocalScheduler, makeRecordExecutionCallback } from '../../src/local/cron.js';
import { cronRoutes } from '../../src/local/routes/cron.js';
import { notificationRoutes } from '../../src/local/routes/notifications.js';
import { automationRoutes } from '../../src/local/routes/automations.js';
import { securityMiddleware } from '../../src/local/security-middleware.js';

describe('Automations alias routes (Phase 3)', () => {
  let db: MindDB;
  let cronStore: CronStore;
  let scheduler: LocalScheduler;
  let executed: CronSchedule[];
  let failNext: boolean;
  let server: ReturnType<typeof Fastify>;
  let includeViewerWorkspace: boolean;
  let literalGlobalIsViewer: boolean;
  let viewerOptimizationEnabled: boolean;

  beforeEach(async () => {
    db = new MindDB(':memory:');
    cronStore = new CronStore(db);
    executed = [];
    failNext = false;
    includeViewerWorkspace = false;
    literalGlobalIsViewer = false;
    viewerOptimizationEnabled = 1 as unknown as boolean;
    scheduler = new LocalScheduler(
      cronStore,
      async (schedule) => {
        executed.push(schedule);
        if (failNext) throw new Error('boom: executor failed');
      },
      // F2: the REAL prod history-persistence closure (also installed by
      // local/index.ts) — not a hand-copied mirror.
      makeRecordExecutionCallback(cronStore),
    );

    server = Fastify({ logger: false });
    server.decorate('localConfig', { dataDir: '' });
    server.decorate('cronStore', cronStore);
    server.decorate('scheduler', scheduler);
    server.decorate('eventBus', new EventEmitter());
    // Minimal workspace index for the /test workspaceId validation: 'ws-test'
    // is the only known workspace.
    server.decorate('workspaceManager', {
      get: (id: string) => {
        if (id === 'ws-test') {
          return { id, name: 'Test WS', teamId: 'team-1', teamRole: 'member' };
        }
        if (id === 'viewer-workspace') {
          return {
            id,
            name: 'Viewer WS',
            teamId: 'team-1',
            teamRole: 'viewer',
            optimizationEnabled: viewerOptimizationEnabled,
          };
        }
        if (id === 'global' && literalGlobalIsViewer) {
          return { id, name: 'Global WS', teamId: 'team-1', teamRole: 'viewer' };
        }
        return undefined;
      },
      getDefault: () => 'ws-test',
      list: () => [
        { id: 'ws-test', name: 'Test WS', teamId: 'team-1', teamRole: 'member' },
        ...(includeViewerWorkspace
          ? [{
              id: 'viewer-workspace',
              name: 'Viewer WS',
              teamId: 'team-1',
              teamRole: 'viewer',
              optimizationEnabled: viewerOptimizationEnabled,
            }]
          : []),
      ],
    });
    await server.register(securityMiddleware);
    await server.register(cronRoutes);
    // F4: the real /api/cron/:id/history route (notifications.ts) — its only
    // decoration needs are cronStore + eventBus, both provided above.
    await server.register(notificationRoutes);
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

  it('GET /api/automations/engine returns liveness + sovereignty identity', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/automations/engine' });
    expect(res.statusCode).toBe(200);
    const { engine } = res.json();
    expect(engine.host).toBe(os.hostname());
    expect(engine.sovereign).toBe(true);
    expect(engine.device).toBe('this device');
    expect(engine.consecutiveFailureCap).toBe(5);
    expect(engine.running).toBe(false); // scheduler decorated but not started
  });

  it('engine reports running once the scheduler starts', async () => {
    scheduler.start(60_000);
    const res = await server.inject({ method: 'GET', url: '/api/automations/engine' });
    expect(res.json().engine.running).toBe(true);
    scheduler.stop();
  });

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

  it('agent_task create accepts the "*" fan-out workspace sentinel (Builder "All workspaces")', async () => {
    // The store REQUIRES a workspaceId for agent_task; '*' is the executor's
    // fan-out-to-all sentinel the Builder sends (2026-06-10 live-smoke fix).
    const automation = await createAutomation({
      name: 'Smoke parity', trigger: { type: 'manual' },
      jobType: 'agent_task', jobConfig: { prompt: 'do the thing' }, workspaceId: '*',
    });
    expect(cronStore.getById(parseInt(automation.id, 10))!.workspace_id).toBe('*');
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

  it('PATCH without trigger keeps a manual automation manual + disabled (no clobber)', async () => {
    const automation = await createAutomation({ name: 'Manual job', trigger: { type: 'manual' }, actions: ['workspace_health'] });
    // An unrelated PATCH (condition only) used to flip trigger → 'schedule'.
    const res = await server.inject({
      method: 'PATCH', url: `/api/automations/${automation.id}`,
      payload: { condition: 'only weekdays' },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json().automation;
    expect(updated.triggerType).toBe('manual');
    expect(updated.status).toBe('paused');
    expect(updated.condition).toBe('only weekdays');
    expect(cronStore.getById(parseInt(automation.id, 10))!.enabled).toBe(0);
  });

  it('PATCH trigger to manual on an enabled schedule disables it (mirrors the POST rule)', async () => {
    const automation = await createAutomation(SCHEDULE_BODY);
    expect(automation.status).toBe('active');
    const res = await server.inject({
      method: 'PATCH', url: `/api/automations/${automation.id}`,
      payload: { trigger: { type: 'manual' } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().automation.triggerType).toBe('manual');
    expect(res.json().automation.status).toBe('paused');
    expect(cronStore.getById(parseInt(automation.id, 10))!.enabled).toBe(0);
  });

  it('run aliases the trigger (executes + auto-enables a disabled SCHEDULE job, by design)', async () => {
    const automation = await createAutomation({ ...SCHEDULE_BODY, enabled: false });
    const res = await server.inject({ method: 'POST', url: `/api/automations/${automation.id}/run` });
    expect(res.statusCode).toBe(200);
    expect(res.json().triggered).toBe(true);
    expect(res.json().runId).toBe(automation.id);
    expect(res.json().autoEnabled).toBe(true);
    expect(executed).toHaveLength(1);
    expect(cronStore.getById(parseInt(automation.id, 10))!.enabled).toBe(1);
  });

  it('run on a MANUAL automation executes but re-disables it (placeholder cron never goes live)', async () => {
    const automation = await createAutomation({ name: 'On demand', trigger: { type: 'manual' }, actions: ['workspace_health'] });
    const res = await server.inject({ method: 'POST', url: `/api/automations/${automation.id}/run` });
    expect(res.statusCode).toBe(200);
    expect(res.json().triggered).toBe(true);
    expect(res.json().autoEnabled).toBe(false); // never reported as enabled
    expect(executed).toHaveLength(1);           // the run DID execute

    // The row stays disabled — its '0 0 1 1 *' placeholder must not become a
    // live yearly Jan-1 schedule after "Run now" (the M-43 auto-enable is
    // reverted for manual rows).
    expect(cronStore.getById(parseInt(automation.id, 10))!.enabled).toBe(0);
    const list = (await server.inject({ method: 'GET', url: '/api/automations' })).json();
    const row = list.automations.find((a: { id: string }) => a.id === automation.id);
    expect(row.status).toBe('paused');
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

  it.each([
    {
      label: 'cron PATCH',
      request: (id: number) => ({
        method: 'PATCH' as const,
        url: `/api/cron/${id}`,
        payload: { name: 'blocked', workspaceId: 'ws-test' },
      }),
    },
    {
      label: 'cron DELETE',
      request: (id: number) => ({ method: 'DELETE' as const, url: `/api/cron/${id}` }),
    },
    {
      label: 'cron trigger',
      request: (id: number) => ({ method: 'POST' as const, url: `/api/cron/${id}/trigger` }),
    },
    {
      label: 'automation PATCH',
      request: (id: number) => ({
        method: 'PATCH' as const,
        url: `/api/automations/${id}`,
        payload: { name: 'blocked', workspaceId: 'ws-test' },
      }),
    },
    {
      label: 'automation run',
      request: (id: number) => ({ method: 'POST' as const, url: `/api/automations/${id}/run` }),
    },
    {
      label: 'automation pause',
      request: (id: number) => ({ method: 'POST' as const, url: `/api/automations/${id}/pause` }),
    },
    {
      label: 'cron DELETE with parseInt-compatible suffix',
      request: (id: number) => ({ method: 'DELETE' as const, url: `/api/cron/${id}suffix` }),
    },
    {
      label: 'automation pause with parseInt-compatible suffix',
      request: (id: number) => ({ method: 'POST' as const, url: `/api/automations/${id}suffix/pause` }),
    },
  ])('viewer-owned stored row blocks $label before state changes', async ({ request }) => {
    const row = cronStore.create({
      name: 'Viewer schedule',
      cronExpr: '0 2 * * *',
      jobType: 'workspace_health',
      workspaceId: 'viewer-workspace',
      enabled: false,
    });
    const before = cronStore.getById(row.id);

    const res = await server.inject(request(row.id));

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'VIEWER_READ_ONLY' });
    expect(cronStore.getById(row.id)).toEqual(before);
    expect(executed).toHaveLength(0);
  });

  it('stored literal global workspace ID remains guarded outside create-time normalization', async () => {
    literalGlobalIsViewer = true;
    const row = cronStore.create({
      name: 'Global workspace loop',
      cronExpr: '0 2 * * *',
      jobType: 'loop',
      workspaceId: 'global',
      enabled: false,
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/cron/${row.id}/trigger`,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'VIEWER_READ_ONLY' });
    expect(executed).toHaveLength(0);
  });

  it.each([
    {
      label: 'cron',
      expectedStatus: 200,
      request: {
        method: 'POST' as const,
        url: '/api/cron',
        payload: {
          name: 'Personal global loop',
          cronExpr: '0 2 * * *',
          jobType: 'loop',
          workspaceId: 'global',
        },
      },
    },
    {
      label: 'automation alias',
      expectedStatus: 201,
      request: {
        method: 'POST' as const,
        url: '/api/automations',
        payload: {
          name: 'Personal global loop',
          schedule: '0 2 * * *',
          jobType: 'loop',
          workspaceId: 'global',
        },
      },
    },
  ])('create-time global normalization does not treat a $label loop as the literal global workspace', async ({
    expectedStatus,
    request,
  }) => {
    literalGlobalIsViewer = true;

    const res = await server.inject(request);

    expect(res.statusCode).toBe(expectedStatus);
    expect(cronStore.list()).toHaveLength(1);
    expect(cronStore.list()[0]?.workspace_id).toBe('*');
  });

  it('raw create jobConfig string is not interpreted before CronStore serializes it', async () => {
    includeViewerWorkspace = true;
    const rawJobConfig = JSON.stringify({ action: 'memory_compact' });

    const res = await server.inject({
      method: 'POST',
      url: '/api/cron',
      payload: {
        name: 'Opaque string config',
        cronExpr: '0 2 * * *',
        jobType: 'memory_consolidation',
        jobConfig: rawJobConfig,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(cronStore.list()[0]!.job_config)).toBe(rawJobConfig);
  });

  it('raw PATCH jobConfig string is not interpreted before CronStore serializes it', async () => {
    includeViewerWorkspace = true;
    const rawJobConfig = JSON.stringify({ action: 'memory_compact' });
    const row = cronStore.create({
      name: 'Personal memory sync',
      cronExpr: '0 2 * * *',
      jobType: 'memory_consolidation',
      jobConfig: { action: 'marketplace_sync' },
      enabled: false,
    });

    const res = await server.inject({
      method: 'PATCH',
      url: `/api/cron/${row.id}`,
      payload: { jobConfig: rawJobConfig },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(cronStore.getById(row.id)!.job_config)).toBe(rawJobConfig);
  });

  it.each([
    {
      label: 'workspace health through cron trigger',
      jobType: 'workspace_health' as const,
      jobConfig: {},
      workspaceId: undefined,
      request: (id: number) => ({ method: 'POST' as const, url: `/api/cron/${id}/trigger` }),
    },
    {
      label: 'prompt optimization through automation run',
      jobType: 'prompt_optimization' as const,
      jobConfig: {},
      workspaceId: undefined,
      request: (id: number) => ({ method: 'POST' as const, url: `/api/automations/${id}/run` }),
    },
    {
      label: 'memory compaction through cron trigger',
      jobType: 'memory_consolidation' as const,
      jobConfig: { action: 'memory_compact' },
      workspaceId: 'ws-test',
      request: (id: number) => ({ method: 'POST' as const, url: `/api/cron/${id}/trigger` }),
    },
    {
      label: 'index reconciliation through cron trigger',
      jobType: 'memory_consolidation' as const,
      jobConfig: { action: 'index_reconcile' },
      workspaceId: undefined,
      request: (id: number) => ({ method: 'POST' as const, url: `/api/cron/${id}/trigger` }),
    },
  ])('fan-out schedule blocks $label when a viewer workspace is in scope', async ({
    jobType,
    jobConfig,
    workspaceId,
    request,
  }) => {
    includeViewerWorkspace = true;
    const row = cronStore.create({
      name: 'Global maintenance',
      cronExpr: '0 2 * * *',
      jobType,
      jobConfig,
      workspaceId,
      enabled: false,
    });
    const before = cronStore.getById(row.id);

    const res = await server.inject(request(row.id));

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'VIEWER_READ_ONLY' });
    expect(cronStore.getById(row.id)).toEqual(before);
    expect(executed).toHaveLength(0);
  });

  it('prompt optimization ignores a listed viewer workspace without optimization opt-in', async () => {
    includeViewerWorkspace = true;
    viewerOptimizationEnabled = false;
    const row = cronStore.create({
      name: 'Prompt optimization',
      cronExpr: '0 2 * * *',
      jobType: 'prompt_optimization',
      enabled: false,
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/cron/${row.id}/trigger`,
    });

    expect(res.statusCode).toBe(200);
    expect(executed).toHaveLength(1);
  });

  it.each([
    {
      label: 'cron',
      request: () => ({
        method: 'POST' as const,
        url: '/api/cron',
        payload: {
          name: 'Global health',
          cronExpr: '0 2 * * *',
          jobType: 'workspace_health',
        },
      }),
    },
    {
      label: 'automation alias',
      request: () => ({
        method: 'POST' as const,
        url: '/api/automations',
        payload: {
          name: 'Global memory lanes',
          schedule: '0 2 * * *',
          actions: ['memory_consolidation'],
          jobConfig: { action: 'memory_lane_extract' },
          workspaceId: 'ws-test',
        },
      }),
    },
  ])('viewer cannot create a null-owned fan-out schedule through $label', async ({ request }) => {
    includeViewerWorkspace = true;
    const before = cronStore.list();

    const res = await server.inject(request());

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'VIEWER_READ_ONLY' });
    expect(cronStore.list()).toEqual(before);
    expect(executed).toHaveLength(0);
  });

  it.each([
    {
      label: 'personal to fan-out',
      beforeAction: 'marketplace_sync',
      afterAction: 'memory_compact',
    },
    {
      label: 'fan-out to personal',
      beforeAction: 'memory_lane_extract',
      afterAction: 'harvest_sync',
    },
  ])('viewer cannot re-scope memory maintenance from $label', async ({
    beforeAction,
    afterAction,
  }) => {
    includeViewerWorkspace = true;
    const row = cronStore.create({
      name: 'Memory maintenance',
      cronExpr: '0 2 * * *',
      jobType: 'memory_consolidation',
      jobConfig: { action: beforeAction },
      enabled: false,
    });
    const before = cronStore.getById(row.id);

    const res = await server.inject({
      method: 'PATCH',
      url: `/api/cron/${row.id}`,
      payload: { jobConfig: { action: afterAction } },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'VIEWER_READ_ONLY' });
    expect(cronStore.getById(row.id)).toEqual(before);
  });

  it.each([
    {
      label: 'connector fetch',
      jobType: 'connector_fetch' as const,
      jobConfig: {},
      workspaceId: undefined,
    },
    {
      label: 'personal memory sync',
      jobType: 'memory_consolidation' as const,
      jobConfig: { action: 'marketplace_sync' },
      workspaceId: undefined,
    },
    {
      label: 'personal wildcard loop',
      jobType: 'loop' as const,
      jobConfig: {},
      workspaceId: '*',
    },
    {
      label: 'global proactive briefing',
      jobType: 'proactive' as const,
      jobConfig: { action: 'morning_briefing' },
      workspaceId: undefined,
    },
    {
      label: 'personal monthly assessment',
      jobType: 'monthly_assessment' as const,
      jobConfig: {},
      workspaceId: undefined,
    },
    {
      label: 'non-matching spaced memory action',
      jobType: 'memory_consolidation' as const,
      jobConfig: { action: ' memory_compact ' },
      workspaceId: undefined,
    },
    {
      label: 'non-matching spaced agent-task wildcard',
      jobType: 'agent_task' as const,
      jobConfig: { prompt: 'Summarize' },
      workspaceId: ' * ',
    },
    {
      label: 'stored agent task for absent literal global workspace',
      jobType: 'agent_task' as const,
      jobConfig: { prompt: 'Summarize' },
      workspaceId: 'global',
    },
  ])('$label is not blocked by an unrelated viewer workspace', async ({
    jobType,
    jobConfig,
    workspaceId,
  }) => {
    includeViewerWorkspace = true;
    const row = cronStore.create({
      name: 'Personal schedule',
      cronExpr: '0 2 * * *',
      jobType,
      jobConfig,
      workspaceId,
      enabled: false,
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/cron/${row.id}/trigger`,
    });

    expect(res.statusCode).toBe(200);
    expect(executed).toHaveLength(1);
  });

  it.each([
    {
      label: 'cron PATCH',
      request: (id: number) => ({
        method: 'PATCH' as const,
        url: `/api/cron/${id}`,
        payload: { name: 'blocked' },
      }),
    },
    {
      label: 'cron trigger',
      request: (id: number) => ({ method: 'POST' as const, url: `/api/cron/${id}/trigger` }),
    },
    {
      label: 'automation pause',
      request: (id: number) => ({ method: 'POST' as const, url: `/api/automations/${id}/pause` }),
    },
  ])('stored wildcard row blocks $label when fan-out includes a viewer workspace', async ({ request }) => {
    includeViewerWorkspace = true;
    const row = cronStore.create({
      name: 'All workspaces',
      cronExpr: '0 2 * * *',
      jobType: 'agent_task',
      jobConfig: { prompt: 'Summarize' },
      workspaceId: '*',
      enabled: true,
    });
    const before = cronStore.getById(row.id);

    const res = await server.inject(request(row.id));

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'VIEWER_READ_ONLY' });
    expect(cronStore.getById(row.id)).toEqual(before);
    expect(executed).toHaveLength(0);
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

  it('C26: test is a VALIDATION-ONLY preview — ok draft, zero execution, zero persistence', async () => {
    // A pre-existing disabled job proves the enable flag is untouched too.
    const disabled = cronStore.create({ name: 'sleepy', cronExpr: '0 4 * * *', jobType: 'workspace_health', enabled: false });

    const res = await server.inject({
      method: 'POST', url: '/api/automations/test',
      payload: {
        name: 'Draft automation',
        trigger: { type: 'schedule', cron: '0 5 * * *' },
        actions: ['workspace_health'],
        condition: 'advisory only',
        workspaceId: 'ws-test',
      },
    });
    expect(res.statusCode).toBe(200);
    const { previewResult } = res.json();
    expect(previewResult).toMatchObject({
      ok: true,
      jobType: 'workspace_health',
      triggerType: 'schedule',
      issues: [],
      executed: false,
      condition: 'advisory only', // echoed as advisory (C25), never evaluated
    });
    expect(previewResult.wouldRun).toContain('workspace_health');
    expect(previewResult.wouldRun).toContain('0 5 * * *');

    // NOTHING ran or persisted: executor untouched, no schedule row, no
    // history row, no notification row, no enable-flag mutation.
    expect(executed).toHaveLength(0);
    expect(cronStore.list()).toHaveLength(1); // only the pre-existing disabled job
    expect(cronStore.getExecutionHistory(disabled.id)).toHaveLength(0);
    expect(cronStore.getNotifications()).toHaveLength(0);
    expect(cronStore.getById(disabled.id)!.enabled).toBe(0);
  });

  it('C26: bad cron / missing agent_task prompt / unknown workspace surface as issues (ok:false)', async () => {
    const badCron = await server.inject({
      method: 'POST', url: '/api/automations/test',
      payload: { trigger: { type: 'schedule', cron: 'not-cron' }, actions: ['workspace_health'] },
    });
    expect(badCron.statusCode).toBe(200);
    expect(badCron.json().previewResult.ok).toBe(false);
    expect(badCron.json().previewResult.issues.join(' ')).toMatch(/cron/i);

    // agent_task with no jobConfig.prompt — the executor would skip the run.
    const noPrompt = await server.inject({
      method: 'POST', url: '/api/automations/test',
      payload: { trigger: { type: 'schedule', cron: '0 5 * * *' }, jobType: 'agent_task' },
    });
    expect(noPrompt.json().previewResult.ok).toBe(false);
    expect(noPrompt.json().previewResult.issues.join(' ')).toMatch(/prompt/);
    // agent_task with a prompt but NO workspaceId — CronStore.create would
    // throw ('agent_task jobs require a workspace ID'), so the preview must
    // flag it instead of saying "valid" (2026-06-10 live-smoke regression).
    const noWs = await server.inject({
      method: 'POST', url: '/api/automations/test',
      payload: { trigger: { type: 'schedule', cron: '0 5 * * *' }, jobType: 'agent_task', jobConfig: { prompt: 'Summarize the day' } },
    });
    expect(noWs.json().previewResult.ok).toBe(false);
    expect(noWs.json().previewResult.issues.join(' ')).toMatch(/workspaceId/);
    // ...and WITH a prompt + the '*' fan-out sentinel the draft previews clean.
    const withPrompt = await server.inject({
      method: 'POST', url: '/api/automations/test',
      payload: { trigger: { type: 'schedule', cron: '0 5 * * *' }, jobType: 'agent_task', jobConfig: { prompt: 'Summarize the day' }, workspaceId: '*' },
    });
    expect(withPrompt.json().previewResult.ok).toBe(true);

    const badWs = await server.inject({
      method: 'POST', url: '/api/automations/test',
      payload: { trigger: { type: 'schedule', cron: '0 5 * * *' }, actions: ['workspace_health'], workspaceId: 'ws-nope' },
    });
    expect(badWs.json().previewResult.ok).toBe(false);
    expect(badWs.json().previewResult.issues.join(' ')).toMatch(/workspaceId/);

    // An empty draft resolves to agent_task with no prompt → issues, not a 400.
    const empty = await server.inject({ method: 'POST', url: '/api/automations/test', payload: {} });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().previewResult.ok).toBe(false);

    // A 'loop' draft with no jobConfig.prompt — the loop executor would skip it,
    // so the preview must flag it (parity with the agent_task prompt check).
    const loopNoPrompt = await server.inject({
      method: 'POST', url: '/api/automations/test',
      payload: { trigger: { type: 'schedule', cron: '0 8 * * *' }, jobType: 'loop' },
    });
    expect(loopNoPrompt.json().previewResult.ok).toBe(false);
    expect(loopNoPrompt.json().previewResult.issues.join(' ')).toMatch(/prompt/);
    // ...and a loop WITH a prompt previews clean (no workspaceId required).
    const loopOk = await server.inject({
      method: 'POST', url: '/api/automations/test',
      payload: { trigger: { type: 'schedule', cron: '0 8 * * *' }, jobType: 'loop', jobConfig: { prompt: 'Brief me' } },
    });
    expect(loopOk.json().previewResult.ok).toBe(true);

    // Across ALL previews: nothing executed, nothing persisted.
    expect(executed).toHaveLength(0);
    expect(cronStore.list()).toHaveLength(0);
  });

  it('C26 (edit mode): a draft carrying the stored row id is judged against the REAL job, not the agent_task fallback', async () => {
    // A stored agent_task WITH a prompt: the bare edit-mode draft (no jobType/
    // jobConfig) used to phantom-flag "agent_task requires jobConfig.prompt".
    const agentTask = await createAutomation({
      name: 'Daily summary',
      trigger: { type: 'schedule', cron: '0 6 * * *' },
      jobType: 'agent_task',
      jobConfig: { prompt: 'Summarize the day' },
      workspaceId: 'ws-test', // agent_task creates require a workspace
    });
    const res = await server.inject({
      method: 'POST', url: '/api/automations/test',
      payload: { id: agentTask.id, name: 'Daily summary', trigger: { type: 'schedule', cron: '0 7 * * *' } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().previewResult.ok).toBe(true);
    expect(res.json().previewResult.jobType).toBe('agent_task');

    // Stored non-agent_task rows resolve their real jobType (correct wouldRun).
    const consolidation = await createAutomation({
      name: 'Nightly consolidation',
      trigger: { type: 'schedule', cron: '0 3 * * *' },
      jobType: 'memory_consolidation',
    });
    const res2 = await server.inject({
      method: 'POST', url: '/api/automations/test',
      payload: { id: consolidation.id, name: 'Nightly consolidation', trigger: { type: 'schedule', cron: '0 3 * * *' } },
    });
    expect(res2.json().previewResult.ok).toBe(true);
    expect(res2.json().previewResult.jobType).toBe('memory_consolidation');

    // An unknown id degrades to the plain draft preview (agent_task fallback).
    const res3 = await server.inject({
      method: 'POST', url: '/api/automations/test',
      payload: { id: '99999', name: 'ghost', trigger: { type: 'manual' } },
    });
    expect(res3.statusCode).toBe(200);
    expect(res3.json().previewResult.ok).toBe(false);

    // Still validation-only: nothing executed.
    expect(executed).toHaveLength(0);
  });

  it('C24: test rejects event triggers (contract-level 400)', async () => {
    expect((await server.inject({
      method: 'POST', url: '/api/automations/test',
      payload: { trigger: { type: 'event' }, actions: ['workspace_health'] },
    })).statusCode).toBe(400);
  });
});
