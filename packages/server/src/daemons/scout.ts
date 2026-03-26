import { eq, and, desc } from 'drizzle-orm';
import { scoutFindings, agents, teamMembers, teamResources } from '../db/schema.js';
import type { Db } from '../db/connection.js';

interface Finding {
  source: string;
  category: string;
  title: string;
  summary: string;
  relevanceScore: number;
  url: string | null;
}

export class ScoutAgent {
  constructor(private db: Db) {}

  async scan(userId: string, teamId: string): Promise<any[]> {
    const findings: Finding[] = [];

    // Source 1: Check team resources for newly shared items
    findings.push(...await this.checkTeamResources(teamId));

    // Source 2: Mock marketplace check (would check npm/MCP registry in production)
    findings.push(...await this.checkMarketplace(userId));

    // Score relevance based on user's agent configs and role
    const scored = await this.scoreRelevance(findings, userId, teamId);

    // Filter out findings with titles already dismissed by this user
    const existingDismissed = await this.db.select().from(scoutFindings)
      .where(and(
        eq(scoutFindings.userId, userId),
        eq(scoutFindings.status, 'dismissed'),
      ));
    const dismissedTitles = new Set(existingDismissed.map(f => f.title));
    const filtered = scored.filter(f => !dismissedTitles.has(f.title));

    // Store findings
    const stored = [];
    for (const finding of filtered) {
      const [entry] = await this.db.insert(scoutFindings).values({
        userId,
        teamId,
        source: finding.source,
        category: finding.category,
        title: finding.title,
        summary: finding.summary,
        relevanceScore: finding.relevanceScore,
        url: finding.url,
        status: 'new',
      }).returning();
      stored.push(entry);
    }

    return stored;
  }

  private async checkTeamResources(teamId: string): Promise<Finding[]> {
    const recent = await this.db.select().from(teamResources)
      .where(eq(teamResources.teamId, teamId))
      .orderBy(desc(teamResources.createdAt))
      .limit(5);

    return recent.map(r => ({
      source: 'team' as const,
      category: r.resourceType === 'skill' ? 'skill' : 'practice',
      title: `New team resource: ${r.name}`,
      summary: r.description ?? `A ${r.resourceType} shared by a team member`,
      relevanceScore: 0.5,
      url: null,
    }));
  }

  private async checkMarketplace(_userId: string): Promise<Finding[]> {
    // Mock: In production, would check npm registry for MCP packages, skill marketplace, etc.
    return [];
  }

  private async scoreRelevance(findings: Finding[], userId: string, teamId: string): Promise<Finding[]> {
    // Load user's agent configs for interest matching
    const userAgents = await this.db.select().from(agents)
      .where(eq(agents.userId, userId));

    // Load member interests
    const [membership] = await this.db.select().from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));

    const interests = (membership?.interests as string[]) ?? [];
    const agentTools = userAgents.flatMap(a => (a.tools as string[]) ?? []);

    return findings.map(f => {
      let score = f.relevanceScore;
      // Boost if matches user interests
      if (interests.some(i => f.title.toLowerCase().includes(i.toLowerCase()))) score += 0.3;
      // Boost if matches agent tool names
      if (agentTools.some(t => f.title.toLowerCase().includes(t.toLowerCase()))) score += 0.2;
      return { ...f, relevanceScore: Math.min(score, 1.0) };
    });
  }

  async adopt(findingId: string) {
    const [updated] = await this.db.update(scoutFindings)
      .set({ status: 'adopted' })
      .where(eq(scoutFindings.id, findingId))
      .returning();
    return updated ?? null;
  }

  async dismiss(findingId: string) {
    const [updated] = await this.db.update(scoutFindings)
      .set({ status: 'dismissed' })
      .where(eq(scoutFindings.id, findingId))
      .returning();
    return updated ?? null;
  }

  async listFindings(userId: string) {
    return this.db.select().from(scoutFindings)
      .where(eq(scoutFindings.userId, userId));
  }
}
