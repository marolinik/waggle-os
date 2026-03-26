import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalScheduler, MAX_CONSECUTIVE_FAILURES } from '../../src/local/cron.js';
import type { CronSchedule, CronStore } from '@waggle/core';

/**
 * Create a minimal mock CronStore that returns the given schedules from getDue()
 */
function mockCronStore(dueSchedules: CronSchedule[]): CronStore {
  return {
    getDue: () => dueSchedules,
    markRun: vi.fn(),
  } as unknown as CronStore;
}

function makeSchedule(id: number): CronSchedule {
  return {
    id,
    name: `Test Job ${id}`,
    cron_expr: '* * * * *',
    job_type: 'agent_task',
    job_config: '{}',
    workspace_id: null,
    enabled: 1,
    last_run_at: null,
    next_run_at: new Date(Date.now() - 60_000).toISOString(),
    created_at: new Date().toISOString(),
  };
}

describe('LocalScheduler Error Handling (11B-9)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('MAX_CONSECUTIVE_FAILURES is 5', () => {
    expect(MAX_CONSECUTIVE_FAILURES).toBe(5);
  });

  it('logs error on job failure', async () => {
    const schedule = makeSchedule(1);
    const store = mockCronStore([schedule]);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const executor = vi.fn().mockRejectedValue(new Error('boom'));
    const scheduler = new LocalScheduler(store, executor);

    await scheduler.tick();

    expect(errorSpy).toHaveBeenCalledWith('[cron] Job failed:', 1, expect.any(Error));
    errorSpy.mockRestore();
  });

  it('tracks consecutive failure count', async () => {
    const schedule = makeSchedule(42);
    const store = mockCronStore([schedule]);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const executor = vi.fn().mockRejectedValue(new Error('fail'));
    const scheduler = new LocalScheduler(store, executor);

    await scheduler.tick();
    expect(scheduler.getFailCount(42)).toBe(1);

    await scheduler.tick();
    expect(scheduler.getFailCount(42)).toBe(2);

    await scheduler.tick();
    expect(scheduler.getFailCount(42)).toBe(3);

    vi.restoreAllMocks();
  });

  it('resets fail count on successful execution', async () => {
    const schedule = makeSchedule(10);
    const store = mockCronStore([schedule]);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    let callCount = 0;
    const executor = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount <= 3) throw new Error('fail');
      // 4th call succeeds
    });
    const scheduler = new LocalScheduler(store, executor);

    // 3 failures
    await scheduler.tick();
    await scheduler.tick();
    await scheduler.tick();
    expect(scheduler.getFailCount(10)).toBe(3);

    // 4th call succeeds — fail count should reset
    await scheduler.tick();
    expect(scheduler.getFailCount(10)).toBe(0);

    vi.restoreAllMocks();
  });

  it('disables job after 5 consecutive failures', async () => {
    const schedule = makeSchedule(99);
    const store = mockCronStore([schedule]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const executor = vi.fn().mockRejectedValue(new Error('always fails'));
    const scheduler = new LocalScheduler(store, executor);

    // Run 5 ticks — each should fail
    for (let i = 0; i < 5; i++) {
      await scheduler.tick();
    }

    expect(scheduler.getFailCount(99)).toBe(5);
    expect(scheduler.isDisabled(99)).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith('[cron] Job disabled after 5 failures:', 99);

    // 6th tick — executor should NOT be called (job is disabled)
    executor.mockClear();
    await scheduler.tick();
    expect(executor).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it('job that always throws stops being called after 5 failures', async () => {
    const schedule = makeSchedule(77);
    const store = mockCronStore([schedule]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const executor = vi.fn().mockRejectedValue(new Error('persistent error'));
    const scheduler = new LocalScheduler(store, executor);

    // Run 10 ticks
    for (let i = 0; i < 10; i++) {
      await scheduler.tick();
    }

    // Executor should have been called exactly 5 times (skipped after disable)
    expect(executor).toHaveBeenCalledTimes(5);
    expect(scheduler.isDisabled(77)).toBe(true);

    vi.restoreAllMocks();
  });

  it('resetFailure re-enables a disabled job', async () => {
    const schedule = makeSchedule(55);
    const store = mockCronStore([schedule]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const executor = vi.fn().mockRejectedValue(new Error('fail'));
    const scheduler = new LocalScheduler(store, executor);

    // Disable the job
    for (let i = 0; i < 5; i++) {
      await scheduler.tick();
    }
    expect(scheduler.isDisabled(55)).toBe(true);

    // Reset failure state
    scheduler.resetFailure(55);
    expect(scheduler.isDisabled(55)).toBe(false);
    expect(scheduler.getFailCount(55)).toBe(0);

    // Job should be called again on next tick
    executor.mockClear();
    await scheduler.tick();
    expect(executor).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
  });

  it('successful job returns correct executed count', async () => {
    const schedules = [makeSchedule(1), makeSchedule(2)];
    const store = mockCronStore(schedules);

    const executor = vi.fn().mockResolvedValue(undefined);
    const scheduler = new LocalScheduler(store, executor);

    const count = await scheduler.tick();
    expect(count).toBe(2);
  });

  it('only failing jobs are tracked — other jobs still execute', async () => {
    const goodSchedule = makeSchedule(1);
    const badSchedule = makeSchedule(2);
    const store = mockCronStore([goodSchedule, badSchedule]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const executor = vi.fn().mockImplementation(async (s: CronSchedule) => {
      if (s.id === 2) throw new Error('bad job');
    });
    const scheduler = new LocalScheduler(store, executor);

    // Run 6 ticks — bad job should be disabled after 5, good job always runs
    for (let i = 0; i < 6; i++) {
      await scheduler.tick();
    }

    // Good job: called 6 times (never disabled)
    // Bad job: called 5 times (disabled after 5th failure)
    // Total: 11 calls
    expect(executor).toHaveBeenCalledTimes(11);
    expect(scheduler.isDisabled(2)).toBe(true);
    expect(scheduler.isDisabled(1)).toBe(false);

    vi.restoreAllMocks();
  });
});
