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
import { classifyRateLimitError, planRateLimitResume } from '@waggle/agent';
import type { CronStore, CronSchedule } from '@waggle/core';
import { createLogger } from './logger.js';

const log = createLogger('cron');

/** Function that executes a cron job. Injected to keep the scheduler generic and testable. */
export type JobExecutor = (schedule: CronSchedule) => Promise<void>;

/** Q16:C — Optional callback fired after each cron job execution (success or failure). */
export type JobCompleteCallback = (schedule: CronSchedule, result: { success: boolean; error?: string }) => void;

export interface SchedulerNotification {
  title: string;
  body: string;
}

/** Optional bridge to the server's persisted + live notification emitter. */
export type SchedulerNotificationCallback = (notification: SchedulerNotification) => void;

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
const MAX_RESUME_DELAY_MS = 12 * 60 * 60 * 1000;
const RATE_LIMIT_HISTORY_PREFIX = '[rate-limited, resume scheduled]';
const INTERRUPTED_RUN_ERROR = 'failed_interrupted: process exited mid-run';

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
  /** Rate-limited jobs waiting for their one-shot resume. */
  pendingResumes: Array<{ scheduleId: number; fireAtMs: number }>;
}

interface PendingResume {
  fireAtMs: number;
  timer: NodeJS.Timeout;
}

export class LocalScheduler {
  private store: CronStore;
  private executor: JobExecutor;
  private onJobComplete?: JobCompleteCallback;
  private onNotification?: SchedulerNotificationCallback;
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  /** Track consecutive failure count per schedule ID */
  private failCounts = new Map<number, number>();
  /** Set of schedule IDs that have been disabled due to repeated failures */
  private disabledJobs = new Set<number>();
  /** One pending rate-limit resume per schedule. */
  private pendingResumes = new Map<number, PendingResume>();
  /** Liveness tracking (epoch ms) — feeds getStatus()/the engine pill. */
  private lastTickAt: number | null = null;
  private startedAt: number | null = null;
  private intervalMs: number | null = null;

  constructor(
    store: CronStore,
    executor: JobExecutor,
    onJobComplete?: JobCompleteCallback,
    onNotification?: SchedulerNotificationCallback,
  ) {
    this.store = store;
    this.executor = executor;
    this.onJobComplete = onJobComplete;
    this.onNotification = onNotification;
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

  /** Get rate-limited jobs currently waiting for a one-shot resume. */
  getPendingResumes(): Array<{ scheduleId: number; fireAtMs: number }> {
    return [...this.pendingResumes.entries()]
      .map(([scheduleId, pending]) => ({ scheduleId, fireAtMs: pending.fireAtMs }))
      .sort((a, b) => a.scheduleId - b.scheduleId);
  }

  /** Start the tick loop. Default interval is 60 seconds. */
  start(intervalMs: number = 60_000): void {
    if (this.timer) return;
    this.sweepInterruptedRuns();
    this.recomputeFailureState();
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
    for (const pending of this.pendingResumes.values()) {
      clearTimeout(pending.timer);
    }
    this.pendingResumes.clear();
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
      pendingResumes: this.getPendingResumes(),
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
    const result = await this.runSchedule(schedule);
    if (!result.success) throw result.error;
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
        // Pending resumes own their one-shot retry; normal ticks must not race them.
        if (this.disabledJobs.has(schedule.id) || this.pendingResumes.has(schedule.id)) {
          continue;
        }

        const result = await this.runSchedule(schedule);
        if (result.success) executed++;
      }
    } finally {
      this.ticking = false;
    }
    return executed;
  }

  private async runSchedule(
    schedule: CronSchedule,
  ): Promise<{ success: true } | { success: false; error: unknown }> {
    let leaseId: number | null = null;
    let failed = false;
    let executionError: unknown;

    try {
      if (typeof this.store.acquireRunLease === 'function') {
        leaseId = this.store.acquireRunLease(schedule.id, schedule.name, process.pid);
      }
      await this.executor(schedule);
    } catch (err) {
      failed = true;
      executionError = err;
    } finally {
      if (leaseId !== null) {
        try {
          this.store.releaseRunLease(leaseId);
        } catch (err) {
          if (!failed) {
            failed = true;
            executionError = err;
          } else {
            log.error(`Failed to release run lease: ${schedule.id}`, err);
          }
        }
      }
    }

    if (!failed) {
      this.store.markRun(schedule.id);
      this.failCounts.delete(schedule.id);
      this.clearPendingResume(schedule.id);
      this.onJobComplete?.(schedule, { success: true });
      return { success: true };
    }

    const errorMessage = executionError instanceof Error
      ? executionError.message
      : String(executionError);
    const nowMs = Date.now();
    const assessment = classifyRateLimitError(errorMessage, nowMs);

    if (assessment.isRateLimit) {
      const plan = planRateLimitResume(assessment, nowMs);
      if (plan.kind === 'scheduled') {
        this.scheduleResume(schedule.id, plan.fireAtMs);
      }
      this.onJobComplete?.(schedule, {
        success: false,
        error: `${RATE_LIMIT_HISTORY_PREFIX} ${errorMessage}`,
      });
      log.warn(`Job rate-limited; resume scheduled: ${schedule.id}`);
      return { success: false, error: executionError };
    }

    const count = (this.failCounts.get(schedule.id) ?? 0) + 1;
    this.failCounts.set(schedule.id, count);
    log.error(`Job failed: ${schedule.id}`, executionError);
    this.onJobComplete?.(schedule, { success: false, error: errorMessage });

    if (count >= MAX_CONSECUTIVE_FAILURES && !this.disabledJobs.has(schedule.id)) {
      this.disabledJobs.add(schedule.id);
      this.persistAutoDisable(schedule, count);
      log.warn(`Job disabled after 5 failures: ${schedule.id}`);
    }

    return { success: false, error: executionError };
  }

  private scheduleResume(scheduleId: number, requestedFireAtMs: number): void {
    this.clearPendingResume(scheduleId);
    const nowMs = Date.now();
    const delay = Math.min(MAX_RESUME_DELAY_MS, Math.max(0, requestedFireAtMs - nowMs));
    const fireAtMs = nowMs + delay;
    const timer = setTimeout(() => {
      const pending = this.pendingResumes.get(scheduleId);
      if (!pending || pending.timer !== timer) return;

      if (!this.isRunning() || this.disabledJobs.has(scheduleId)) {
        this.pendingResumes.delete(scheduleId);
        return;
      }
      const current = this.store.getById(scheduleId);
      if (!current || current.enabled !== 1) {
        this.pendingResumes.delete(scheduleId);
        return;
      }
      this.executeJob(current)
        .catch(() => {})
        .finally(() => {
          const active = this.pendingResumes.get(scheduleId);
          if (active?.timer === timer) this.pendingResumes.delete(scheduleId);
        });
    }, delay);
    timer.unref();
    this.pendingResumes.set(scheduleId, { fireAtMs, timer });
  }

  private clearPendingResume(scheduleId: number): void {
    const pending = this.pendingResumes.get(scheduleId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingResumes.delete(scheduleId);
  }

  private sweepInterruptedRuns(): void {
    // Keep lightweight test doubles and older embedders source-compatible.
    if (typeof this.store.listStaleRunLeases !== 'function') return;
    const staleLeases = this.store.listStaleRunLeases();
    if (staleLeases.length === 0) return;

    for (const lease of staleLeases) {
      this.store.recordExecution(
        lease.schedule_id,
        lease.schedule_name ?? `Schedule ${lease.schedule_id}`,
        {
          executedAt: lease.started_at,
          durationMs: 0,
          success: false,
          error: INTERRUPTED_RUN_ERROR,
        },
      );
    }
    this.store.clearRunLeases();
    this.emitSchedulerNotification({
      title: 'Scheduled runs interrupted',
      body: `${staleLeases.length} scheduled runs interrupted by restart`,
    });
  }

  private recomputeFailureState(): void {
    if (typeof this.store.getRecentExecutions !== 'function') return;
    for (const schedule of this.store.list()) {
      if (schedule.enabled !== 1) {
        // Persisted auto-disables (enabled=0 + job_config.auto_disabled marker)
        // must survive restarts in getStatus().disabledJobCount.
        if (this.hasAutoDisableMarker(schedule)) this.disabledJobs.add(schedule.id);
        continue;
      }
      const recent = this.store.getRecentExecutions(schedule.id, MAX_CONSECUTIVE_FAILURES);
      let count = 0;
      for (const execution of recent) {
        if (execution.success === 1) break;
        // Rate limits do not increment the live counter, so their history rows
        // must likewise be neutral when reconstructing state after a restart.
        if (execution.error?.startsWith(RATE_LIMIT_HISTORY_PREFIX)) continue;
        count++;
      }
      if (count > 0) this.failCounts.set(schedule.id, count);
      else this.failCounts.delete(schedule.id);

      if (count >= MAX_CONSECUTIVE_FAILURES) {
        this.disabledJobs.add(schedule.id);
        this.persistAutoDisable(schedule, count);
      }
    }
  }

  private hasAutoDisableMarker(schedule: CronSchedule): boolean {
    try {
      const parsed = JSON.parse(schedule.job_config) as unknown;
      return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        && 'auto_disabled' in (parsed as Record<string, unknown>);
    } catch {
      return false;
    }
  }

  private persistAutoDisable(schedule: CronSchedule, count: number): void {
    const reason = `${count} consecutive failures`;
    if (typeof this.store.getById !== 'function' || typeof this.store.update !== 'function') {
      this.emitAutoDisableNotification(schedule, reason);
      return;
    }

    const current = this.store.getById(schedule.id) ?? schedule;
    let jobConfig: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(current.job_config) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        jobConfig = parsed as Record<string, unknown>;
      }
    } catch { /* preserve scheduler liveness if a legacy config is corrupt */ }

    this.store.update(schedule.id, {
      enabled: false,
      jobConfig: {
        ...jobConfig,
        auto_disabled: { at: new Date().toISOString(), reason },
      },
    });
    this.emitAutoDisableNotification(schedule, reason);
  }

  private emitAutoDisableNotification(schedule: CronSchedule, reason: string): void {
    this.emitSchedulerNotification({
      title: `${schedule.name || 'Scheduled task'} auto-disabled`,
      body: `Scheduled task disabled after ${reason}.`,
    });
  }

  private emitSchedulerNotification(notification: SchedulerNotification): void {
    try {
      this.onNotification?.(notification);
    } catch (err) {
      log.error('Failed to emit scheduler notification', err);
    }
  }
}

export { MAX_CONSECUTIVE_FAILURES };
