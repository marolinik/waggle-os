import { lte, eq, and } from 'drizzle-orm';
import cronParser from 'cron-parser';
const { parseExpression } = cronParser;
import { cronSchedules } from '../db/schema.js';
import type { Db } from '../db/connection.js';
import type { JobService } from '../services/job-service.js';
import { scheduledJobTypeSchema } from '@waggle/shared';

export class CronRunner {
  private interval: ReturnType<typeof setInterval> | null = null;
  private tickInFlight: Promise<number> | null = null;

  constructor(
    private db: Db,
    private jobService: JobService,
    private onError: (error: unknown) => void = () => undefined,
  ) {}

  start(intervalMs = 60_000) {
    if (this.interval) return;
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new Error('Cron interval must be a positive number');
    }

    const runTick = () => {
      if (this.tickInFlight) return;
      const tick = this.tick()
        .catch(error => {
          this.onError(error);
          return 0;
        })
        .finally(() => {
          if (this.tickInFlight === tick) this.tickInFlight = null;
        });
      this.tickInFlight = tick;
    };

    runTick();
    this.interval = setInterval(runTick, intervalMs);
    this.interval.unref?.();
  }

  async stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    await this.tickInFlight;
  }

  async tick() {
    const now = new Date();

    // Find all enabled schedules that are due
    const due = await this.db.select().from(cronSchedules)
      .where(and(
        eq(cronSchedules.enabled, true),
        lte(cronSchedules.nextRunAt, now),
      ));

    let queuedCount = 0;
    for (const schedule of due) {
      const jobType = scheduledJobTypeSchema.safeParse(schedule.jobType);
      if (!jobType.success) continue;

      try {
        // Validate legacy rows before queueing so a poison cron expression
        // cannot create a duplicate job on every scheduler pass.
        const nextRunAt = parseExpression(schedule.cronExpr).next().toDate();

        await this.jobService.createJob(
          schedule.teamId,
          schedule.createdBy,
          jobType.data,
          schedule.jobConfig as Record<string, unknown>,
        );

        await this.db.update(cronSchedules)
          .set({ lastRunAt: now, nextRunAt })
          .where(eq(cronSchedules.id, schedule.id));
        queuedCount++;
      } catch (error) {
        // One malformed or temporarily failing schedule must not starve the
        // remaining due work. The lifecycle runner supplies the server logger.
        this.onError(error);
      }
    }

    return queuedCount;
  }
}
