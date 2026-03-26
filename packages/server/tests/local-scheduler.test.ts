import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MindDB, CronStore } from '@waggle/core';
import { LocalScheduler } from '../src/local/cron.js';

describe('LocalScheduler', () => {
  let tmpDir: string;
  let db: MindDB;
  let store: CronStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-sched-'));
    db = new MindDB(path.join(tmpDir, 'test.mind'));
    store = new CronStore(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('tick() executes due schedules and returns count', async () => {
    const schedule = store.create({
      name: 'Test Job',
      cronExpr: '*/5 * * * *',
      jobType: 'memory_consolidation',
    });

    // Force next_run_at into the past so it's due
    db.getDatabase().prepare(
      "UPDATE cron_schedules SET next_run_at = datetime('now', '-1 minute') WHERE id = ?",
    ).run(schedule.id);

    const executed: number[] = [];
    const executor = vi.fn(async (s: any) => {
      executed.push(s.id);
    });

    const scheduler = new LocalScheduler(store, executor);
    const count = await scheduler.tick();

    expect(count).toBe(1);
    expect(executor).toHaveBeenCalledOnce();
    expect(executed).toEqual([schedule.id]);

    // Verify next_run_at was updated to a future time
    const updated = store.getById(schedule.id)!;
    expect(updated.last_run_at).not.toBeNull();
    expect(new Date(updated.next_run_at!).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('tick() with no due schedules returns 0', async () => {
    // Create a schedule with future next_run_at (default behavior)
    store.create({
      name: 'Future Job',
      cronExpr: '0 3 * * *',
      jobType: 'workspace_health',
    });

    const executor = vi.fn();
    const scheduler = new LocalScheduler(store, executor);
    const count = await scheduler.tick();

    expect(count).toBe(0);
    expect(executor).not.toHaveBeenCalled();
  });

  it('tick() handles executor failure gracefully', async () => {
    const schedule = store.create({
      name: 'Failing Job',
      cronExpr: '*/5 * * * *',
      jobType: 'memory_consolidation',
    });

    // Force due
    db.getDatabase().prepare(
      "UPDATE cron_schedules SET next_run_at = datetime('now', '-1 minute') WHERE id = ?",
    ).run(schedule.id);

    const executor = vi.fn(async () => {
      throw new Error('Job exploded');
    });

    const scheduler = new LocalScheduler(store, executor);

    // tick() should not throw
    const count = await scheduler.tick();

    // Failed job should not count as executed
    expect(count).toBe(0);
    expect(executor).toHaveBeenCalledOnce();

    // Schedule should NOT have been marked as run (last_run_at still null)
    const after = store.getById(schedule.id)!;
    expect(after.last_run_at).toBeNull();
  });

  it('tick() concurrency guard prevents overlapping ticks', async () => {
    const schedule = store.create({
      name: 'Slow Job',
      cronExpr: '*/5 * * * *',
      jobType: 'memory_consolidation',
    });

    // Force due
    db.getDatabase().prepare(
      "UPDATE cron_schedules SET next_run_at = datetime('now', '-1 minute') WHERE id = ?",
    ).run(schedule.id);

    let callCount = 0;
    const executor = vi.fn(async () => {
      callCount++;
      // Simulate slow job
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    const scheduler = new LocalScheduler(store, executor);

    // Fire two ticks simultaneously
    const [count1, count2] = await Promise.all([
      scheduler.tick(),
      scheduler.tick(),
    ]);

    // Only one tick should have actually executed the job
    expect(count1 + count2).toBe(1);
    expect(callCount).toBe(1);
  });

  it('start/stop lifecycle works', () => {
    const executor = vi.fn();
    const scheduler = new LocalScheduler(store, executor);

    expect(scheduler.isRunning()).toBe(false);

    scheduler.start(60_000);
    expect(scheduler.isRunning()).toBe(true);

    // start again should be a no-op (no double timers)
    scheduler.start(60_000);
    expect(scheduler.isRunning()).toBe(true);

    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('isRunning() reflects state correctly', () => {
    const executor = vi.fn();
    const scheduler = new LocalScheduler(store, executor);

    expect(scheduler.isRunning()).toBe(false);

    scheduler.start(30_000);
    expect(scheduler.isRunning()).toBe(true);

    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);

    // Can restart
    scheduler.start(30_000);
    expect(scheduler.isRunning()).toBe(true);

    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });
});
