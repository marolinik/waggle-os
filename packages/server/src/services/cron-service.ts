import { eq, and } from 'drizzle-orm';
import cronParser from 'cron-parser';
const { parseExpression } = cronParser;
import { cronSchedules } from '../db/schema.js';
import type { Db } from '../db/connection.js';

export function getNextRunAt(cronExpr: string): Date {
  const interval = parseExpression(cronExpr);
  return interval.next().toDate();
}

export class CronService {
  constructor(private db: Db) {}

  async create(
    teamId: string,
    userId: string,
    data: { name: string; cronExpr: string; jobType: string; jobConfig?: Record<string, unknown> },
  ) {
    // Validate cron expression by parsing it
    const nextRunAt = getNextRunAt(data.cronExpr);

    const [schedule] = await this.db.insert(cronSchedules).values({
      teamId,
      createdBy: userId,
      name: data.name,
      cronExpr: data.cronExpr,
      jobType: data.jobType,
      jobConfig: data.jobConfig ?? {},
      enabled: true,
      nextRunAt,
    }).returning();

    return schedule;
  }

  async list(teamId: string) {
    return this.db.select().from(cronSchedules)
      .where(eq(cronSchedules.teamId, teamId));
  }

  async getById(id: string) {
    const [schedule] = await this.db.select().from(cronSchedules)
      .where(eq(cronSchedules.id, id));
    return schedule ?? null;
  }

  async update(id: string, data: { name?: string; cronExpr?: string; enabled?: boolean; jobConfig?: Record<string, unknown> }) {
    const updates: Record<string, unknown> = {};

    if (data.name !== undefined) updates.name = data.name;
    if (data.enabled !== undefined) updates.enabled = data.enabled;
    if (data.jobConfig !== undefined) updates.jobConfig = data.jobConfig;

    if (data.cronExpr !== undefined) {
      updates.cronExpr = data.cronExpr;
      updates.nextRunAt = getNextRunAt(data.cronExpr);
    }

    if (Object.keys(updates).length === 0) return null;

    const [updated] = await this.db.update(cronSchedules)
      .set(updates)
      .where(eq(cronSchedules.id, id))
      .returning();
    return updated ?? null;
  }

  async markRun(id: string) {
    const schedule = await this.getById(id);
    if (!schedule) return null;

    const now = new Date();
    const nextRunAt = getNextRunAt(schedule.cronExpr);

    const [updated] = await this.db.update(cronSchedules)
      .set({ lastRunAt: now, nextRunAt })
      .where(eq(cronSchedules.id, id))
      .returning();
    return updated ?? null;
  }
}
