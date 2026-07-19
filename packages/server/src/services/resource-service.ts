import { eq, and } from 'drizzle-orm';
import { teamResources } from '../db/schema.js';
import type { Db } from '../db/connection.js';

export class ResourceService {
  constructor(private db: Db) {}

  async share(
    teamId: string,
    userId: string,
    data: {
      resourceType: string;
      name: string;
      description?: string;
      config: Record<string, unknown>;
    },
  ) {
    const [resource] = await this.db.insert(teamResources).values({
      teamId,
      resourceType: data.resourceType,
      name: data.name,
      description: data.description ?? null,
      config: data.config,
      sharedBy: userId,
      rating: 0,
      useCount: 0,
    }).returning();
    return resource;
  }

  async list(teamId: string, resourceType?: string) {
    const conditions = [eq(teamResources.teamId, teamId)];

    if (resourceType) {
      conditions.push(eq(teamResources.resourceType, resourceType));
    }

    return this.db
      .select()
      .from(teamResources)
      .where(and(...conditions));
  }

  async rate(teamId: string, resourceId: string, rating: number) {
    const [resource] = await this.db
      .select()
      .from(teamResources)
      .where(and(
        eq(teamResources.id, resourceId),
        eq(teamResources.teamId, teamId),
      ))
      .limit(1);
    if (!resource) return null;

    const newRating = resource.useCount > 0
      ? (resource.rating * resource.useCount + rating) / (resource.useCount + 1)
      : rating;

    const [updated] = await this.db.update(teamResources)
      .set({ rating: newRating })
      .where(and(
        eq(teamResources.id, resourceId),
        eq(teamResources.teamId, teamId),
      ))
      .returning();
    return updated;
  }

  async incrementUseCount(teamId: string, resourceId: string) {
    const [resource] = await this.db
      .select()
      .from(teamResources)
      .where(and(
        eq(teamResources.id, resourceId),
        eq(teamResources.teamId, teamId),
      ))
      .limit(1);
    if (!resource) return null;

    const [updated] = await this.db.update(teamResources)
      .set({ useCount: resource.useCount + 1 })
      .where(and(
        eq(teamResources.id, resourceId),
        eq(teamResources.teamId, teamId),
      ))
      .returning();
    return updated;
  }
}
