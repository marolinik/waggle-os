import { eq, and, or, ilike, inArray } from 'drizzle-orm';
import { teamEntities, teamRelations } from '../db/schema.js';
import type { Db } from '../db/connection.js';

export interface EntityFilters {
  entityType?: string;
  search?: string;
}

export class KnowledgeService {
  constructor(private db: Db) {}

  async createEntity(
    teamId: string,
    userId: string,
    data: {
      entityType: string;
      name: string;
      properties?: Record<string, unknown>;
      validFrom?: string;
      validTo?: string;
    },
  ) {
    const values: typeof teamEntities.$inferInsert = {
      teamId,
      entityType: data.entityType,
      name: data.name,
      properties: data.properties ?? {},
      sharedBy: userId,
    };
    if (data.validFrom) values.validFrom = new Date(data.validFrom);
    if (data.validTo) values.validTo = new Date(data.validTo);

    const [entity] = await this.db.insert(teamEntities).values(values).returning();
    return entity;
  }

  async listEntities(teamId: string, filters?: EntityFilters) {
    const conditions = [eq(teamEntities.teamId, teamId)];

    if (filters?.entityType) {
      conditions.push(eq(teamEntities.entityType, filters.entityType));
    }
    if (filters?.search) {
      conditions.push(ilike(teamEntities.name, `%${filters.search}%`));
    }

    return this.db
      .select()
      .from(teamEntities)
      .where(and(...conditions));
  }

  async getEntity(entityId: string) {
    const [entity] = await this.db
      .select()
      .from(teamEntities)
      .where(eq(teamEntities.id, entityId))
      .limit(1);
    return entity ?? null;
  }

  async createRelation(
    teamId: string,
    data: {
      sourceId: string;
      targetId: string;
      relationType: string;
      confidence?: number;
      properties?: Record<string, unknown>;
    },
  ) {
    const endpointIds = [...new Set([data.sourceId, data.targetId])];
    const ownedEndpoints = await this.db
      .select({ id: teamEntities.id })
      .from(teamEntities)
      .where(and(
        eq(teamEntities.teamId, teamId),
        inArray(teamEntities.id, endpointIds),
      ));
    if (ownedEndpoints.length !== endpointIds.length) return null;

    const [relation] = await this.db.insert(teamRelations).values({
      teamId,
      sourceId: data.sourceId,
      targetId: data.targetId,
      relationType: data.relationType,
      confidence: data.confidence ?? 1.0,
      properties: data.properties ?? {},
    }).returning();
    return relation;
  }

  async queryGraph(
    teamId: string,
    startEntityId: string,
    depth: number = 2,
    relationTypes?: string[],
  ) {
    const [startEntity] = await this.db
      .select()
      .from(teamEntities)
      .where(and(
        eq(teamEntities.id, startEntityId),
        eq(teamEntities.teamId, teamId),
      ))
      .limit(1);
    if (!startEntity) return null;

    const visited = new Set<string>([startEntityId]);
    const resultEntities: Array<typeof teamEntities.$inferSelect> = [startEntity];
    const resultRelations: Array<typeof teamRelations.$inferSelect> = [];

    let frontier = [startEntityId];

    for (let d = 0; d < depth && frontier.length > 0; d++) {
      // Find relations connected to frontier entities
      const rels = await this.db
        .select()
        .from(teamRelations)
        .where(
          and(
            eq(teamRelations.teamId, teamId),
            or(
              inArray(teamRelations.sourceId, frontier),
              inArray(teamRelations.targetId, frontier),
            ),
          ),
        );

      // Apply relationTypes filter if provided
      const filteredRels = relationTypes
        ? rels.filter((r) => relationTypes.includes(r.relationType))
        : rels;

      const nextFrontier: string[] = [];
      for (const rel of filteredRels) {
        resultRelations.push(rel);
        for (const id of [rel.sourceId, rel.targetId]) {
          if (!visited.has(id)) {
            visited.add(id);
            nextFrontier.push(id);
          }
        }
      }

      if (nextFrontier.length > 0) {
        const entities = await this.db
          .select()
          .from(teamEntities)
          .where(
            and(
              eq(teamEntities.teamId, teamId),
              inArray(teamEntities.id, nextFrontier),
            ),
          );
        resultEntities.push(...entities);
      }

      frontier = nextFrontier;
    }

    return {
      entities: resultEntities,
      relations: resultRelations,
    };
  }
}
