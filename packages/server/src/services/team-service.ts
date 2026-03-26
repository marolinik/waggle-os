import { eq, and, sql } from 'drizzle-orm';
import { teams, teamMembers, users } from '../db/schema.js';
import type { Db } from '../db/connection.js';
import { TeamCapabilityGovernance } from './team-capability-governance.js';

export class TeamService {
  constructor(private db: Db) {}

  async create(ownerId: string, data: { name: string; slug: string }) {
    return this.db.transaction(async (tx) => {
      const [team] = await tx.insert(teams).values({
        name: data.name,
        slug: data.slug,
        ownerId,
      }).returning();

      await tx.insert(teamMembers).values({
        teamId: team.id,
        userId: ownerId,
        role: 'owner',
      });

      // Seed default capability policies
      const governance = new TeamCapabilityGovernance(tx as any);
      await governance.seedDefaultPolicies(team.id, ownerId);

      return team;
    });
  }

  async getBySlug(slug: string) {
    const [team] = await this.db.select().from(teams).where(eq(teams.slug, slug)).limit(1);
    return team ?? null;
  }

  async listForUser(userId: string) {
    const rows = await this.db
      .select({
        id: teams.id,
        name: teams.name,
        slug: teams.slug,
        ownerId: teams.ownerId,
        createdAt: teams.createdAt,
        role: teamMembers.role,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teamMembers.userId, userId));

    return rows;
  }

  async update(teamId: string, data: { name: string }) {
    const [updated] = await this.db
      .update(teams)
      .set({ name: data.name })
      .where(eq(teams.id, teamId))
      .returning();
    return updated ?? null;
  }

  async addMember(teamId: string, userId: string, role: 'admin' | 'member') {
    const [member] = await this.db.insert(teamMembers).values({
      teamId,
      userId,
      role,
    }).returning();
    return member;
  }

  async removeMember(teamId: string, userId: string) {
    // Prevent removing the owner
    const membership = await this.getMembership(teamId, userId);
    if (!membership) return false;
    if (membership.role === 'owner') {
      throw new Error('Cannot remove the team owner');
    }

    await this.db
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
    return true;
  }

  async updateMember(
    teamId: string,
    userId: string,
    data: { role?: 'admin' | 'member'; roleDescription?: string; interests?: string[] },
  ) {
    const setData: Record<string, unknown> = {};
    if (data.role !== undefined) setData.role = data.role;
    if (data.roleDescription !== undefined) setData.roleDescription = data.roleDescription;
    if (data.interests !== undefined) setData.interests = data.interests;

    if (Object.keys(setData).length === 0) return null;

    const [updated] = await this.db
      .update(teamMembers)
      .set(setData)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .returning();
    return updated ?? null;
  }

  async getMembership(teamId: string, userId: string) {
    const [membership] = await this.db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .limit(1);
    return membership ?? null;
  }

  async getMembers(teamId: string) {
    const rows = await this.db
      .select({
        userId: teamMembers.userId,
        role: teamMembers.role,
        roleDescription: teamMembers.roleDescription,
        interests: teamMembers.interests,
        joinedAt: teamMembers.joinedAt,
        displayName: users.displayName,
        email: users.email,
        avatarUrl: users.avatarUrl,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.teamId, teamId));
    return rows;
  }
}
