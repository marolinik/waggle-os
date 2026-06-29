/**
 * LocalScheduler — lightweight cron tick loop for Solo mode.
 *
 * Polls CronStore for due schedules and executes them via an injected
 * executor function. Includes a concurrency guard to prevent overlapping
 * ticks when jobs run longer than the tick interval.
 *
 * Part of Wave 1.1 — Solo Cron Service.
 */

import os from 'node:os';
import type { CronStore, CronSchedule } from '@waggle/core';
import { createLogger } from './logger.js';

const log = createLogger('cron');

/** Function that executes a cron job. Injected to keep the scheduler generic and testable. */
export type JobExecutor = (schedule: CronSchedule) => Promise<void>;

/** Q16:C — Optional callback fired after each cron job execution (success or failure). */
export type JobCompleteCallback = (schedule: CronSchedule, result: { success: boolean; error?: string }) => void;

/**
 * UX-Refactor Phase 3 (Journey 16): the history-persistence half of the
 * production onJobComplete wiring (local/index.ts). Exported as a named
 * factory so tests install the SAME closure the server runs instead of a
 * hand-copied mirror that can silently drift from the real wire.
 */
export function makeRecordExecutionCallback(
  store: Pick<CronStore, 'recordExecution'>,
): JobCompleteCallback {
  return (schedule, result) => {
    try {
      store.recordExecution(schedule.id, schedule.name, {
        success: result.success,
        ...(result.error ? { error: result.error } : {}),
      });
    } catch { /* history is best-effort */ }
  };
}

/** Maximum consecutive failures before a job is auto-disabled */
const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Liveness snapshot of the scheduler. Drives the "Loops engine" sovereignty
 * pill: scheduled automations only fire while THIS process is running on the
 * user's own machine (or their self-hosted server) — nothing leaves the
 * perimeter to a cloud cron. `host` is a local syscall (os.hostname), no network.
 */
export interface SchedulerStatus {
  /** Whether the tick timer is currently armed. */
  running: boolean;
  /** ISO timestamp of the last tick that actually ran (null if never). */
  lastTickAt: string | null;
  /** ISO timestamp the next tick is expected (null when not running). */
  nextTickDueAt: string | null;
  /** Tick interval in ms (null until start()). */
  intervalMs: number | null;
  /** The machine running the engine (os.hostname). */
  host: string;
  /** How many jobs are currently auto-disabled after repeated failures. */
  disabledJobCount: number;
  /** Consecutive-failure threshold that auto-disables a job. */
  consecutiveFailureCap: number;
}

export class LocalScheduler {
  private store: CronStore;
  private executor: JobExecutor;
  private onJobComplete?: JobCompleteCallback;
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  /** Track consecutive failure count per schedule ID */
  private failCounts = new Map<number, number>();
  /** Set of schedule IDs that have been disabled due to repeated failures */
  private disabledJobs = new Set<number>();
  /** Liveness tracking (epoch ms) — feeds getStatus()/the engine pill. */
  private lastTickAt: number | null = null;
  private startedAt: number | null = null;
  private intervalMs: number | null = null;

  constructor(store: CronStore, executor: JobExecutor, onJobComplete?: JobCompleteCallback) {
    this.store = store;
    this.executor = executor;
    this.onJobComplete = onJobComplete;
  }

  /** Get the current fail count for a schedule (for testing). */
  getFailCount(scheduleId: number): number {
    return this.failCounts.get(scheduleId) ?? 0;
  }

  /** Check if a job has been disabled due to failures (for testing). */
  isDisabled(scheduleId: number): boolean {
    return this.disabledJobs.has(scheduleId);
  }

  /** Reset the failure state for a schedule (e.g., after manual re-enable). */
  resetFailure(scheduleId: number): void {
    this.failCounts.delete(scheduleId);
    this.disabledJobs.delete(scheduleId);
  }

  /** Start the tick loop. Default interval is 60 seconds. */
  start(intervalMs: number = 60_000): void {
    if (this.timer) return;
    // Record liveness BEFORE arming the timer so getStatus() is accurate the
    // instant start() returns (prod calls start() with no arg → 60_000 default
    // must be captured, else getStatus().intervalMs would read null).
    this.intervalMs = intervalMs;
    this.startedAt = Date.now();
    this.timer = setInterval(() => {
      this.tick().catch(() => {});
    }, intervalMs);
  }

  /** Stop the tick loop. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Whether the scheduler timer is currently running. */
  isRunning(): boolean {
    return this.timer !== null;
  }

  /**
   * Liveness snapshot for the "Loops engine" sovereignty surface. Pure — safe to
   * call from a route handler on every poll. nextTickDueAt is derived from the
   * last real tick (or startedAt if none yet) plus the interval.
   */
  getStatus(): SchedulerStatus {
    const running = this.timer !== null;
    const base = this.lastTickAt ?? this.startedAt;
    const nextTickDueAt = running && base !== null && this.intervalMs !== null
      ? new Date(base + this.intervalMs).toISOString()
      : null;
    return {
      running,
      lastTickAt: this.lastTickAt !== null ? new Date(this.lastTickAt).toISOString() : null,
      nextTickDueAt,
      intervalMs: this.intervalMs,
      host: os.hostname(),
      disabledJobCount: this.disabledJobs.size,
      consecutiveFailureCap: MAX_CONSECUTIVE_FAILURES,
    };
  }

  /**
   * W5.11: Execute a specific schedule's job immediately (for manual
   * trigger via API). Mirrors tick()'s callback semantics so manual
   * runs notify + route to output channels the same way auto-runs do
   * (otherwise the Telegram digest hook never fires on a "Run now"
   * click, which broke testability and surprised users).
   */
  async executeJob(schedule: CronSchedule): Promise<void> {
    try {
      await this.executor(schedule);
      this.store.markRun(schedule.id);
      this.failCounts.delete(schedule.id);
      this.onJobComplete?.(schedule, { success: true });
    } catch (err) {
      this.onJobComplete?.(schedule, {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * Execute one tick: find all due schedules and run them.
   * Returns the count of successfully executed jobs.
   *
   * Concurrency guard: if a previous tick is still running, returns 0 immediately.
   */
  async tick(): Promise<number> {
    if (this.ticking) return 0;
    this.ticking = true;
    // Stamp liveness AFTER the single-flight guard so a skipped overlapping tick
    // doesn't advance it — a stuck tick is then visible as a stale lastTickAt.
    this.lastTickAt = Date.now();
    let executed = 0;
    try {
      const due = this.store.getDue();
      for (const schedule of due) {
        // Skip jobs that have been disabled due to repeated failures
        if (this.disabledJobs.has(schedule.id)) {
          continue;
        }

        try {
          await this.executor(schedule);
          this.store.markRun(schedule.id);
          // Reset fail count on success
          this.failCounts.delete(schedule.id);
          executed++;
          // Q16:C — notify on success
          this.onJobComplete?.(schedule, { success: true });
        } catch (err) {
          const count = (this.failCounts.get(schedule.id) ?? 0) + 1;
          this.failCounts.set(schedule.id, count);
          log.error(`Job failed: ${schedule.id}`, err);

          // Q16:C — notify on failure
          this.onJobComplete?.(schedule, {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });

          if (count >= MAX_CONSECUTIVE_FAILURES) {
            this.disabledJobs.add(schedule.id);
            log.warn(`Job disabled after 5 failures: ${schedule.id}`);
          }
        }
      }
    } finally {
      this.ticking = false;
    }
    return executed;
  }
}

export { MAX_CONSECUTIVE_FAILURES };
