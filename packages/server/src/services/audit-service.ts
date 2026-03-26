import { eq, and, desc, isNull } from 'drizzle-orm';
import { agentAuditLog } from '../db/schema.js';
import type { Db } from '../db/connection.js';

export class AuditService {
  constructor(private db: Db) {}

  async log(entry: {
    userId: string;
    teamId?: string;
    agentName: string;
    actionType: string;
    description: string;
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
    requiresApproval?: boolean;
  }) {
    const [created] = await this.db.insert(agentAuditLog).values({
      userId: entry.userId,
      teamId: entry.teamId ?? null,
      agentName: entry.agentName,
      actionType: entry.actionType,
      description: entry.description,
      beforeState: entry.beforeState ?? null,
      afterState: entry.afterState ?? null,
      requiresApproval: entry.requiresApproval ?? false,
    }).returning();
    return created;
  }

  async list(teamId: string, filters?: { actionType?: string; agentName?: string }) {
    const conditions = [eq(agentAuditLog.teamId, teamId)];
    if (filters?.actionType) conditions.push(eq(agentAuditLog.actionType, filters.actionType));
    if (filters?.agentName) conditions.push(eq(agentAuditLog.agentName, filters.agentName));

    return this.db.select().from(agentAuditLog)
      .where(and(...conditions))
      .orderBy(desc(agentAuditLog.createdAt))
      .limit(100);
  }

  async getById(id: string) {
    const [entry] = await this.db.select().from(agentAuditLog)
      .where(eq(agentAuditLog.id, id))
      .limit(1);
    return entry ?? null;
  }

  async approve(entryId: string, approvedBy: string) {
    const [updated] = await this.db.update(agentAuditLog)
      .set({ approved: true, approvedBy })
      .where(eq(agentAuditLog.id, entryId))
      .returning();
    return updated ?? null;
  }

  async reject(entryId: string, approvedBy: string) {
    const [updated] = await this.db.update(agentAuditLog)
      .set({ approved: false, approvedBy })
      .where(eq(agentAuditLog.id, entryId))
      .returning();
    return updated ?? null;
  }

  async getPendingApprovals(teamId: string) {
    return this.db.select().from(agentAuditLog)
      .where(and(
        eq(agentAuditLog.teamId, teamId),
        eq(agentAuditLog.requiresApproval, true),
        isNull(agentAuditLog.approved),
      ))
      .orderBy(desc(agentAuditLog.createdAt));
  }
}
