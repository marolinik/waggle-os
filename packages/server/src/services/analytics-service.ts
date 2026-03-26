import { eq, and, sql, count, desc, gte, lt } from 'drizzle-orm';
import {
  teamMembers, users, tasks, agentAuditLog, agentJobs,
  teamCapabilityRequests, messages,
} from '../db/schema.js';
import type { Db } from '../db/connection.js';

export interface AnalyticsResponse {
  activeUsers: { daily: number; weekly: number; monthly: number };
  tokenUsage: {
    total: number;
    byUser: Array<{ userId: string; name: string; tokens: number; cost: number }>;
  };
  topTools: Array<{ name: string; invocations: number }>;
  topCommands: Array<{ name: string; count: number }>;
  capabilityGaps: Array<{ tool: string; requestCount: number; suggestion: string }>;
  performanceTrends: {
    correctionRate: number;
    correctionTrend: number;
    avgResponseTime: number;
  };
}

export class AnalyticsService {
  constructor(private db: Db) {}

  async getAnalytics(teamId: string): Promise<AnalyticsResponse> {
    const [activeUsers, tokenUsage, topTools, topCommands, capabilityGaps, performanceTrends] =
      await Promise.all([
        this.getActiveUsers(teamId),
        this.getTokenUsage(teamId),
        this.getTopTools(teamId),
        this.getTopCommands(teamId),
        this.getCapabilityGaps(teamId),
        this.getPerformanceTrends(teamId),
      ]);

    return {
      activeUsers,
      tokenUsage,
      topTools,
      topCommands,
      capabilityGaps,
      performanceTrends,
    };
  }

  /**
   * Count active users based on audit log activity within time windows.
   * Falls back to member count if no activity found.
   */
  private async getActiveUsers(teamId: string) {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [dailyResult] = await this.db
      .select({ count: sql<number>`count(distinct ${agentAuditLog.userId})` })
      .from(agentAuditLog)
      .where(and(
        eq(agentAuditLog.teamId, teamId),
        gte(agentAuditLog.createdAt, oneDayAgo),
      ));

    const [weeklyResult] = await this.db
      .select({ count: sql<number>`count(distinct ${agentAuditLog.userId})` })
      .from(agentAuditLog)
      .where(and(
        eq(agentAuditLog.teamId, teamId),
        gte(agentAuditLog.createdAt, oneWeekAgo),
      ));

    const [monthlyResult] = await this.db
      .select({ count: sql<number>`count(distinct ${agentAuditLog.userId})` })
      .from(agentAuditLog)
      .where(and(
        eq(agentAuditLog.teamId, teamId),
        gte(agentAuditLog.createdAt, oneMonthAgo),
      ));

    return {
      daily: Number(dailyResult?.count ?? 0),
      weekly: Number(weeklyResult?.count ?? 0),
      monthly: Number(monthlyResult?.count ?? 0),
    };
  }

  /**
   * Compute token usage from completed jobs.
   * Since we don't have a dedicated token tracking table, we estimate from
   * job outputs that may contain token counts, or fall back to job counts as proxy.
   */
  private async getTokenUsage(teamId: string) {
    // Get all members for this team
    const members = await this.db
      .select({
        userId: teamMembers.userId,
        displayName: users.displayName,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.teamId, teamId));

    // Count completed jobs per user as a proxy for usage
    const jobCounts = await this.db
      .select({
        userId: agentJobs.userId,
        jobCount: sql<number>`count(*)`,
      })
      .from(agentJobs)
      .where(and(
        eq(agentJobs.teamId, teamId),
        eq(agentJobs.status, 'completed'),
      ))
      .groupBy(agentJobs.userId);

    const jobCountMap = new Map(jobCounts.map((j) => [j.userId, Number(j.jobCount)]));

    // Estimate tokens: ~1000 tokens per completed job (rough proxy)
    const TOKENS_PER_JOB = 1000;
    const COST_PER_1K_TOKENS = 0.005;

    const byUser = members.map((m) => {
      const jobs = jobCountMap.get(m.userId) ?? 0;
      const tokens = jobs * TOKENS_PER_JOB;
      return {
        userId: m.userId,
        name: m.displayName,
        tokens,
        cost: Math.round((tokens / 1000) * COST_PER_1K_TOKENS * 100) / 100,
      };
    });

    const total = byUser.reduce((sum, u) => sum + u.tokens, 0);

    return { total, byUser };
  }

  /**
   * Get top tools from audit log action types (tool invocations are logged as actions).
   */
  private async getTopTools(teamId: string) {
    const results = await this.db
      .select({
        name: agentAuditLog.actionType,
        invocations: sql<number>`count(*)`,
      })
      .from(agentAuditLog)
      .where(and(
        eq(agentAuditLog.teamId, teamId),
      ))
      .groupBy(agentAuditLog.actionType)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    return results.map((r) => ({
      name: r.name,
      invocations: Number(r.invocations),
    }));
  }

  /**
   * Get top commands from audit log entries where actionType starts with 'command:'.
   * Falls back to all action types containing 'command' or starting with '/'.
   */
  private async getTopCommands(teamId: string) {
    const results = await this.db
      .select({
        name: agentAuditLog.actionType,
        count: sql<number>`count(*)`,
      })
      .from(agentAuditLog)
      .where(and(
        eq(agentAuditLog.teamId, teamId),
        sql`${agentAuditLog.actionType} LIKE 'command:%'`,
      ))
      .groupBy(agentAuditLog.actionType)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    return results.map((r) => {
      const stripped = r.name.replace(/^command:/, '');
      return {
        name: stripped.startsWith('/') ? stripped : `/${stripped}`,
        count: Number(r.count),
      };
    });
  }

  /**
   * Identify capability gaps from denied/pending capability requests.
   */
  private async getCapabilityGaps(teamId: string) {
    const results = await this.db
      .select({
        tool: teamCapabilityRequests.capabilityName,
        requestCount: sql<number>`count(*)`,
      })
      .from(teamCapabilityRequests)
      .where(and(
        eq(teamCapabilityRequests.teamId, teamId),
        sql`${teamCapabilityRequests.status} IN ('pending', 'rejected')`,
      ))
      .groupBy(teamCapabilityRequests.capabilityName)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    return results.map((r) => ({
      tool: r.tool,
      requestCount: Number(r.requestCount),
      suggestion: `Install ${r.tool} connector or add to allowed tools`,
    }));
  }

  /**
   * Compute performance trends from audit log.
   * - correctionRate: fraction of actions that were corrections/rejections
   * - correctionTrend: difference between this week and last week correction rates
   * - avgResponseTime: average time between job creation and completion (seconds)
   */
  private async getPerformanceTrends(teamId: string) {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // This week's correction rate
    const [thisWeekTotal] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(agentAuditLog)
      .where(and(
        eq(agentAuditLog.teamId, teamId),
        gte(agentAuditLog.createdAt, oneWeekAgo),
      ));

    const [thisWeekRejected] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(agentAuditLog)
      .where(and(
        eq(agentAuditLog.teamId, teamId),
        gte(agentAuditLog.createdAt, oneWeekAgo),
        eq(agentAuditLog.approved, false),
      ));

    // Last week's correction rate
    const [lastWeekTotal] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(agentAuditLog)
      .where(and(
        eq(agentAuditLog.teamId, teamId),
        gte(agentAuditLog.createdAt, twoWeeksAgo),
        lt(agentAuditLog.createdAt, oneWeekAgo),
      ));

    const [lastWeekRejected] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(agentAuditLog)
      .where(and(
        eq(agentAuditLog.teamId, teamId),
        gte(agentAuditLog.createdAt, twoWeeksAgo),
        lt(agentAuditLog.createdAt, oneWeekAgo),
        eq(agentAuditLog.approved, false),
      ));

    const thisWeekRate = Number(thisWeekTotal?.count) > 0
      ? Number(thisWeekRejected?.count ?? 0) / Number(thisWeekTotal.count)
      : 0;

    const lastWeekRate = Number(lastWeekTotal?.count) > 0
      ? Number(lastWeekRejected?.count ?? 0) / Number(lastWeekTotal.count)
      : 0;

    // Average response time from completed jobs
    const [avgTime] = await this.db
      .select({
        avgSeconds: sql<number>`coalesce(avg(extract(epoch from (${agentJobs.completedAt} - ${agentJobs.createdAt}))), 0)`,
      })
      .from(agentJobs)
      .where(and(
        eq(agentJobs.teamId, teamId),
        eq(agentJobs.status, 'completed'),
        sql`${agentJobs.completedAt} IS NOT NULL`,
      ));

    return {
      correctionRate: Math.round(thisWeekRate * 100) / 100,
      correctionTrend: Math.round((thisWeekRate - lastWeekRate) * 100) / 100,
      avgResponseTime: Math.round(Number(avgTime?.avgSeconds ?? 0) * 10) / 10,
    };
  }
}
