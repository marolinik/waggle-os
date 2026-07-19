import { lte, eq, and } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import cronParser from 'cron-parser';
const { parseExpression } = cronParser;
import { cronSchedules } from '../db/schema.js';
import type { Db } from '../db/connection.js';
import type { JobService } from '../services/job-service.js';
import { scheduledJobTypeSchema } from '@waggle/shared';

function occurrenceJobId(scheduleId: string, scheduledFor: Date): string {
  const bytes = createHash('sha256')
    .update(scheduleId)
    .update('\0')
    .update(scheduledFor.toISOString())
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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
      if (!jobType.success || !schedule.nextRunAt) continue;

      try {
        // Validate legacy rows before queueing so a poison cron expression
        // cannot create a duplicate job on every scheduler pass.
        const nextRunAt = parseExpression(schedule.cronExpr).next().toDate();

        await this.jobService.createJob(
          schedule.teamId,
          schedule.createdBy,
          jobType.data,
          schedule.jobConfig as Record<string, unknown>,
          occurrenceJobId(schedule.id, schedule.nextRunAt),
        );

        const [advanced] = await this.db.update(cronSchedules)
          .set({ lastRunAt: now, nextRunAt })
          .where(and(
            eq(cronSchedules.id, schedule.id),
            eq(cronSchedules.nextRunAt, schedule.nextRunAt),
          ))
          .returning({ id: cronSchedules.id });
        if (advanced) queuedCount++;
      } catch (error) {
        // One malformed or temporarily failing schedule must not starve the
        // remaining due work. The lifecycle runner supplies the server logger.
        this.onError(error);
      }
    }

    return queuedCount;
  }
}
