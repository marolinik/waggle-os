import { eq, and } from 'drizzle-orm';
import { agents, agentGroups, agentGroupMembers, agentJobs } from '../db/schema.js';
import type { Db } from '../db/connection.js';

export class AgentService {
  constructor(private db: Db) {}

  async create(userId: string, data: {
    name: string;
    role?: string;
    systemPrompt?: string;
    model?: string;
    tools?: string[];
    config?: Record<string, unknown>;
    teamId?: string;
  }) {
    const [agent] = await this.db.insert(agents).values({
      userId,
      name: data.name,
      role: data.role,
      systemPrompt: data.systemPrompt,
      model: data.model ?? 'claude-haiku-4-5',
      tools: data.tools ?? [],
      config: data.config ?? {},
      teamId: data.teamId,
    }).returning();
    return agent;
  }

  async list(userId: string) {
    return this.db
      .select()
      .from(agents)
      .where(eq(agents.userId, userId));
  }

  async getById(id: string) {
    const [agent] = await this.db
      .select()
      .from(agents)
      .where(eq(agents.id, id))
      .limit(1);
    return agent ?? null;
  }

  async update(id: string, userId: string, data: {
    name?: string;
    role?: string;
    systemPrompt?: string;
    model?: string;
    tools?: string[];
    config?: Record<string, unknown>;
  }) {
    const setData: Record<string, unknown> = {};
    if (data.name !== undefined) setData.name = data.name;
    if (data.role !== undefined) setData.role = data.role;
    if (data.systemPrompt !== undefined) setData.systemPrompt = data.systemPrompt;
    if (data.model !== undefined) setData.model = data.model;
    if (data.tools !== undefined) setData.tools = data.tools;
    if (data.config !== undefined) setData.config = data.config;

    if (Object.keys(setData).length === 0) return null;

    const [updated] = await this.db
      .update(agents)
      .set(setData)
      .where(and(eq(agents.id, id), eq(agents.userId, userId)))
      .returning();
    return updated ?? null;
  }

  async delete(id: string, userId: string) {
    // First remove agent from any groups
    await this.db
      .delete(agentGroupMembers)
      .where(eq(agentGroupMembers.agentId, id));

    const result = await this.db
      .delete(agents)
      .where(and(eq(agents.id, id), eq(agents.userId, userId)))
      .returning();
    return result.length > 0;
  }

  async createGroup(userId: string, data: {
    name: string;
    description?: string;
    strategy: string;
    members: Array<{ agentId: string; roleInGroup?: string; executionOrder?: number }>;
  }) {
    return this.db.transaction(async (tx) => {
      const [group] = await tx.insert(agentGroups).values({
        userId,
        name: data.name,
        description: data.description,
        strategy: data.strategy,
      }).returning();

      if (data.members.length > 0) {
        await tx.insert(agentGroupMembers).values(
          data.members.map((m) => ({
            groupId: group.id,
            agentId: m.agentId,
            roleInGroup: m.roleInGroup ?? 'worker',
            executionOrder: m.executionOrder ?? 0,
          })),
        );
      }

      const members = await tx
        .select()
        .from(agentGroupMembers)
        .where(eq(agentGroupMembers.groupId, group.id));

      return { ...group, members };
    });
  }

  async listGroups(userId: string) {
    return this.db
      .select()
      .from(agentGroups)
      .where(eq(agentGroups.userId, userId));
  }

  async getGroup(groupId: string, userId: string) {
    const [group] = await this.db
      .select()
      .from(agentGroups)
      .where(and(eq(agentGroups.id, groupId), eq(agentGroups.userId, userId)))
      .limit(1);

    if (!group) return null;

    const members = await this.db
      .select()
      .from(agentGroupMembers)
      .where(eq(agentGroupMembers.groupId, groupId));

    return { ...group, members };
  }

  async createJob(userId: string, data: {
    teamId: string;
    jobType: string;
    input: Record<string, unknown>;
  }) {
    const [job] = await this.db.insert(agentJobs).values({
      userId,
      teamId: data.teamId,
      jobType: data.jobType,
      status: 'queued',
      input: data.input,
    }).returning();
    return job;
  }
}
