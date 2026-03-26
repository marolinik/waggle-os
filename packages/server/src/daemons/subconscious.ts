import { eq, desc, and, sql } from 'drizzle-orm';
import { agentJobs, agentAuditLog } from '../db/schema.js';
import type { Db } from '../db/connection.js';
import { SUBCONSCIOUS_INTERACTION_THRESHOLD } from '@waggle/shared';

export class SubconsciousAgent {
  constructor(private db: Db) {}

  async shouldReflect(userId: string): Promise<boolean> {
    // Count completed jobs since last reflection
    const lastReflection = await this.db.select().from(agentAuditLog)
      .where(and(
        eq(agentAuditLog.userId, userId),
        eq(agentAuditLog.actionType, 'subconscious_reflection'),
      ))
      .orderBy(desc(agentAuditLog.createdAt))
      .limit(1);

    const since = lastReflection[0]?.createdAt ?? new Date(0);
    const sinceIso = since.toISOString();

    const recentJobs = await this.db.select().from(agentJobs)
      .where(and(
        eq(agentJobs.userId, userId),
        eq(agentJobs.status, 'completed'),
        sql`${agentJobs.completedAt} > ${sinceIso}::timestamptz`,
      ));

    return recentJobs.length >= SUBCONSCIOUS_INTERACTION_THRESHOLD;
  }

  async reflect(userId: string): Promise<{ auditEntry: any; insights: Insight[] }> {
    // Get recent completed jobs
    const recentJobs = await this.db.select().from(agentJobs)
      .where(and(
        eq(agentJobs.userId, userId),
        eq(agentJobs.status, 'completed'),
      ))
      .orderBy(desc(agentJobs.completedAt))
      .limit(20);

    // Analyze patterns
    const insights = this.analyzePatterns(recentJobs);

    // Log the reflection
    const [auditEntry] = await this.db.insert(agentAuditLog).values({
      userId,
      agentName: 'subconscious',
      actionType: 'subconscious_reflection',
      description: `Reflected on ${recentJobs.length} recent jobs. Found ${insights.length} insights.`,
      afterState: { insights },
      requiresApproval: insights.some(i => i.type === 'prompt_change'),
    }).returning();

    return { auditEntry, insights };
  }

  private analyzePatterns(jobs: any[]): Insight[] {
    const insights: Insight[] = [];

    // Pattern: repeated job types
    const typeCounts = new Map<string, number>();
    for (const job of jobs) {
      typeCounts.set(job.jobType, (typeCounts.get(job.jobType) ?? 0) + 1);
    }
    for (const [type, count] of typeCounts) {
      if (count >= 5) {
        insights.push({
          type: 'prompt_change',
          description: `Job type "${type}" executed ${count} times recently`,
          recommendation: `Consider optimizing the system prompt for ${type} tasks`,
        });
      }
    }

    // Pattern: failed jobs
    const failedCount = jobs.filter(j => j.status === 'failed').length;
    if (failedCount >= 3) {
      insights.push({
        type: 'tool_issue',
        description: `${failedCount} jobs failed recently`,
        recommendation: 'Review tool configurations and consider adding error handling',
      });
    }

    return insights;
  }
}

interface Insight {
  type: string;
  description: string;
  recommendation: string;
}
