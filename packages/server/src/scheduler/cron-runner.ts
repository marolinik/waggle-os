import { lte, eq, and } from 'drizzle-orm';
import cronParser from 'cron-parser';
const { parseExpression } = cronParser;
import { cronSchedules } from '../db/schema.js';
import type { Db } from '../db/connection.js';
import type { JobService } from '../services/job-service.js';

export class CronRunner {
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(private db: Db, private jobService: JobService) {}

  start(intervalMs = 60_000) {
    this.interval = setInterval(() => this.tick(), intervalMs);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async tick() {
    const now = new Date();

    // Find all enabled schedules that are due
    const due = await this.db.select().from(cronSchedules)
      .where(and(
        eq(cronSchedules.enabled, true),
        lte(cronSchedules.nextRunAt, now),
      ));

    for (const schedule of due) {
      // Queue the job via JobService
      await this.jobService.createJob(
        schedule.teamId,
        schedule.createdBy,
        schedule.jobType,
        schedule.jobConfig as Record<string, unknown>,
      );

      // Compute next run time and update the schedule
      const nextRunAt = parseExpression(schedule.cronExpr).next().toDate();

      await this.db.update(cronSchedules)
        .set({ lastRunAt: now, nextRunAt })
        .where(eq(cronSchedules.id, schedule.id));
    }

    return due.length;
  }
}
