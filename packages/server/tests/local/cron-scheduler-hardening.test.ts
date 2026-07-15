import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CronStore, MindDB, type CronSchedule } from '@waggle/core';
import { LocalScheduler } from '../../src/local/cron.js';
import { cronRoutes } from '../../src/local/routes/cron.js';

const NOW_MS = Date.UTC(2026, 6, 15, 10, 0, 0);

describe('LocalScheduler P0-A hardening', () => {
  let db: MindDB;
  let tmpDir: string;
  let store: CronStore;
  let schedule: CronSchedule;
  let scheduler: LocalScheduler | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-cron-hardening-'));
    db = new MindDB(path.join(tmpDir, 'cron.mind'));
    store = new CronStore(db);
    schedule = store.create({
      name: 'Daily briefing',
      cronExpr: '0 8 * * *',
      jobType: 'workspace_health',
      jobConfig: { keep: 'this' },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    scheduler?.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
    db.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* EBUSY on Windows */ }
  });

  it('schedules a one-shot rate-limit resume without incrementing failures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
    vi.spyOn(store, 'getDue').mockReturnValue([schedule]);
    const executor = vi.fn()
      .mockRejectedValueOnce(new Error('HTTP 429 Retry-After: 60'))
      .mockResolvedValue(undefined);
    const onComplete = vi.fn();
    scheduler = new LocalScheduler(store, executor, onComplete);
    scheduler.start(24 * 60 * 60 * 1000);

    expect(await scheduler.tick()).toBe(0);
    expect(scheduler.getFailCount(schedule.id)).toBe(0);
    expect(scheduler.getPendingResumes()).toEqual([
      { scheduleId: schedule.id, fireAtMs: NOW_MS + 90_000 },
    ]);
    expect(scheduler.getStatus().pendingResumes).toEqual(scheduler.getPendingResumes());
    expect(onComplete).toHaveBeenLastCalledWith(schedule, {
      success: false,
      error: '[rate-limited, resume scheduled] HTTP 429 Retry-After: 60',
    });

    // A normal tick cannot bypass the pending one-shot timer.
    await scheduler.tick();
    expect(executor).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(90_000);
    expect(executor).toHaveBeenCalledTimes(2);
    expect(scheduler.getPendingResumes()).toEqual([]);
  });

  it('replaces an older rate-limit timer and guards against a disabled schedule at fire time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
    vi.spyOn(store, 'getDue').mockReturnValue([schedule]);
    const executor = vi.fn()
      .mockRejectedValueOnce(new Error('Rate limit reached; try again in 10m'))
      .mockRejectedValueOnce(new Error('Rate limit reached; try again in 20m'));
    scheduler = new LocalScheduler(store, executor);
    scheduler.start(24 * 60 * 60 * 1000);

    await scheduler.tick();
    const firstFireAt = scheduler.getPendingResumes()[0].fireAtMs;
    await expect(scheduler.executeJob(schedule)).rejects.toThrow('try again in 20m');
    const secondFireAt = scheduler.getPendingResumes()[0].fireAtMs;
    expect(secondFireAt).toBeGreaterThan(firstFireAt);

    store.update(schedule.id, { enabled: false });
    await vi.advanceTimersByTimeAsync(secondFireAt - NOW_MS);
    expect(executor).toHaveBeenCalledTimes(2);
    expect(scheduler.getPendingResumes()).toEqual([]);
  });

  it('durably auto-disables a non-rate-limited job after five failures', async () => {
    vi.spyOn(store, 'getDue').mockReturnValue([schedule]);
    const notify = vi.fn();
    scheduler = new LocalScheduler(
      store,
      vi.fn().mockRejectedValue(new Error('executor broke')),
      undefined,
      notify,
    );

    for (let i = 0; i < 5; i++) await scheduler.tick();

    expect(scheduler.getFailCount(schedule.id)).toBe(5);
    expect(scheduler.isDisabled(schedule.id)).toBe(true);
    const persisted = store.getById(schedule.id)!;
    expect(persisted.enabled).toBe(0);
    expect(JSON.parse(persisted.job_config)).toMatchObject({
      keep: 'this',
      auto_disabled: {
        at: expect.any(String),
        reason: '5 consecutive failures',
      },
    });
    expect(notify).toHaveBeenCalledWith({
      title: 'Daily briefing auto-disabled',
      body: 'Scheduled task disabled after 5 consecutive failures.',
    });
  });

  it('releases the durable run lease when execution throws', async () => {
    const acquire = vi.spyOn(store, 'acquireRunLease');
    const release = vi.spyOn(store, 'releaseRunLease');
    scheduler = new LocalScheduler(
      store,
      vi.fn().mockRejectedValue(new Error('executor broke')),
    );

    await expect(scheduler.executeJob(schedule)).rejects.toThrow('executor broke');
    expect(acquire).toHaveBeenCalledWith(schedule.id, schedule.name, process.pid);
    expect(release).toHaveBeenCalledWith(expect.any(Number));
    expect(store.listStaleRunLeases()).toEqual([]);
  });

  it('recomputes the trailing failure count from history on boot', () => {
    for (let i = 0; i < 4; i++) {
      store.recordExecution(schedule.id, schedule.name, {
        success: false,
        error: `failure ${i}`,
      });
    }
    scheduler = new LocalScheduler(store, vi.fn());

    scheduler.start(60_000);

    expect(scheduler.getFailCount(schedule.id)).toBe(4);
    expect(scheduler.isDisabled(schedule.id)).toBe(false);
  });

  it('persists auto-disable when boot history already reached the failure cap', () => {
    for (let i = 0; i < 5; i++) {
      store.recordExecution(schedule.id, schedule.name, {
        success: false,
        error: `failure ${i}`,
      });
    }
    const notify = vi.fn();
    scheduler = new LocalScheduler(store, vi.fn(), undefined, notify);

    scheduler.start(60_000);

    expect(scheduler.getFailCount(schedule.id)).toBe(5);
    expect(scheduler.isDisabled(schedule.id)).toBe(true);
    expect(store.getById(schedule.id)?.enabled).toBe(0);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('sweeps stale leases into interrupted history before boot failure recompute', () => {
    const startedAt = '2026-07-15T09:59:00.000Z';
    const leaseId = store.acquireRunLease(schedule.id, schedule.name, 1234);
    const raw = db.getDatabase();
    raw.prepare('UPDATE cron_run_leases SET started_at = ? WHERE id = ?')
      .run(startedAt, leaseId);
    const notify = vi.fn();
    scheduler = new LocalScheduler(store, vi.fn(), undefined, notify);

    scheduler.start(60_000);

    expect(store.listStaleRunLeases()).toEqual([]);
    expect(store.getRecentExecutions(schedule.id, 1)[0]).toMatchObject({
      executed_at: startedAt,
      duration_ms: 0,
      success: 0,
      error: 'failed_interrupted: process exited mid-run',
    });
    expect(scheduler.getFailCount(schedule.id)).toBe(1);
    expect(notify).toHaveBeenCalledWith({
      title: 'Scheduled runs interrupted',
      body: '1 scheduled runs interrupted by restart',
    });
  });
});

describe('cron manual re-enable', () => {
  let db: MindDB;
  let tmpDir: string;
  let store: CronStore;
  let scheduler: LocalScheduler;
  let server: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-cron-route-'));
    db = new MindDB(path.join(tmpDir, 'cron.mind'));
    store = new CronStore(db);
    scheduler = new LocalScheduler(store, vi.fn());
    server = Fastify({ logger: false });
    server.decorate('localConfig', { dataDir: '' });
    server.decorate('cronStore', store);
    server.decorate('scheduler', scheduler);
    server.decorate('eventBus', new EventEmitter());
    await server.register(cronRoutes);
  });

  afterEach(async () => {
    await server.close();
    db.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* EBUSY on Windows */ }
    vi.restoreAllMocks();
  });

  it('clears auto_disabled and resets failure state when PATCH enables a job', async () => {
    const row = store.create({
      name: 'Recover me',
      cronExpr: '0 8 * * *',
      jobType: 'workspace_health',
      enabled: false,
      jobConfig: {
        keep: 'this',
        auto_disabled: { at: '2026-07-15T09:00:00.000Z', reason: '5 consecutive failures' },
      },
    });
    const reset = vi.spyOn(scheduler, 'resetFailure');

    const response = await server.inject({
      method: 'PATCH',
      url: `/api/cron/${row.id}`,
      payload: { enabled: true },
    });

    expect(response.statusCode).toBe(200);
    expect(store.getById(row.id)?.enabled).toBe(1);
    expect(JSON.parse(store.getById(row.id)!.job_config)).toEqual({ keep: 'this' });
    expect(reset).toHaveBeenCalledWith(row.id);
  });
});
