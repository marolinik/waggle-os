import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { agentJobs, teamResources, tasks, messages, teamMembers } from '../db/schema.js';
import type { Db } from '../db/connection.js';

export class HiveMindAgent {
  constructor(private db: Db) {}

  async generateWeeklyDigest(teamId: string): Promise<{ digest: WeeklyDigest; messageId: string }> {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Aggregate metrics
    const jobsCompleted = await this.db.select().from(agentJobs)
      .where(and(
        eq(agentJobs.teamId, teamId),
        eq(agentJobs.status, 'completed'),
        gte(agentJobs.completedAt, oneWeekAgo),
      ));

    const tasksCompleted = await this.db.select().from(tasks)
      .where(and(
        eq(tasks.teamId, teamId),
        eq(tasks.status, 'done'),
      ));

    const resourcesShared = await this.db.select().from(teamResources)
      .where(and(
        eq(teamResources.teamId, teamId),
        gte(teamResources.createdAt, oneWeekAgo),
      ));

    const waggleMessages = await this.db.select().from(messages)
      .where(and(
        eq(messages.teamId, teamId),
        gte(messages.createdAt, oneWeekAgo),
      ));

    // Detect duplicate work (similar task titles by different users)
    const duplicates = this.detectDuplicateWork(tasksCompleted);

    // Find high-rated resources as best practices
    const bestPractices = await this.db.select().from(teamResources)
      .where(and(
        eq(teamResources.teamId, teamId),
        gte(teamResources.rating, sql`3.0`),
      ))
      .orderBy(desc(teamResources.rating))
      .limit(5);

    const digest: WeeklyDigest = {
      period: { from: oneWeekAgo, to: new Date() },
      metrics: {
        jobsCompleted: jobsCompleted.length,
        tasksCompleted: tasksCompleted.length,
        resourcesShared: resourcesShared.length,
        waggleMessages: waggleMessages.length,
      },
      duplicateWork: duplicates,
      bestPractices: bestPractices.map(r => ({ name: r.name, type: r.resourceType, rating: r.rating })),
      recommendations: this.generateRecommendations(jobsCompleted, duplicates, bestPractices),
    };

    // Get a team member to attribute the broadcast to
    const [firstMember] = await this.db.select().from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
      .limit(1);

    const senderId = firstMember?.userId ?? '';

    // Broadcast digest as Waggle Dance message
    const [msg] = await this.db.insert(messages).values({
      teamId,
      senderId,
      type: 'broadcast',
      subtype: 'discovery',
      content: { type: 'weekly_digest', digest },
    }).returning();

    return { digest, messageId: msg.id };
  }

  private detectDuplicateWork(tasksList: any[]): DuplicateWork[] {
    // Group by similar titles (case-insensitive first 20 chars)
    const groups = new Map<string, { titles: string[]; users: Set<string> }>();
    for (const task of tasksList) {
      const key = task.title.toLowerCase().substring(0, 20);
      if (!groups.has(key)) groups.set(key, { titles: [], users: new Set() });
      groups.get(key)!.titles.push(task.title);
      groups.get(key)!.users.add(task.createdBy);
    }
    return Array.from(groups.values())
      .filter(g => g.users.size > 1)
      .map(g => ({ titles: g.titles, users: Array.from(g.users) }));
  }

  private generateRecommendations(jobs: any[], duplicates: DuplicateWork[], bestPractices: any[]): string[] {
    const recommendations: string[] = [];
    if (duplicates.length > 0) {
      recommendations.push(`${duplicates.length} potential duplicate work detected. Consider checking the hive before starting tasks.`);
    }
    if (bestPractices.length > 0) {
      recommendations.push(`${bestPractices.length} highly-rated resources available. Share them team-wide.`);
    }
    if (jobs.length > 50) {
      recommendations.push('High job volume this week. Consider automating recurring tasks with cron schedules.');
    }
    return recommendations;
  }
}

interface DuplicateWork {
  titles: string[];
  users: string[];
}

interface WeeklyDigest {
  period: { from: Date; to: Date };
  metrics: {
    jobsCompleted: number;
    tasksCompleted: number;
    resourcesShared: number;
    waggleMessages: number;
  };
  duplicateWork: DuplicateWork[];
  bestPractices: Array<{ name: string; type: string; rating: number }>;
  recommendations: string[];
}
