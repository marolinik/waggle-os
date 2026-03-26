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
    const values: Record<string, unknown> = {
      teamId,
      entityType: data.entityType,
      name: data.name,
      properties: data.properties ?? {},
      sharedBy: userId,
    };
    if (data.validFrom) values.validFrom = new Date(data.validFrom);
    if (data.validTo) values.validTo = new Date(data.validTo);

    const [entity] = await this.db.insert(teamEntities).values(values as any).returning();
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
    const visited = new Set<string>([startEntityId]);
    const resultEntities: any[] = [];
    const resultRelations: any[] = [];

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

    // Fetch the start entity
    const [startEntity] = await this.db
      .select()
      .from(teamEntities)
      .where(eq(teamEntities.id, startEntityId));

    return {
      entities: [startEntity, ...resultEntities].filter(Boolean),
      relations: resultRelations,
    };
  }
}
