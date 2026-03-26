import { eq, and, desc, sql } from 'drizzle-orm';
import { messages, teamEntities, tasks } from '../db/schema.js';
import type { Db } from '../db/connection.js';
import type { HiveQuery, HiveQueryResult } from '@waggle/waggle-dance';
import type Redis from 'ioredis';

export interface MessageFilters {
  type?: string;
  subtype?: string;
}

export class MessageService {
  constructor(private db: Db) {}

  async send(
    teamId: string,
    senderId: string,
    data: {
      type: string;
      subtype: string;
      content: Record<string, unknown>;
      referenceId?: string;
      routing?: Array<{ userId: string; reason: string }>;
    },
    redis?: Redis,
  ) {
    const [message] = await this.db.insert(messages).values({
      teamId,
      senderId,
      type: data.type,
      subtype: data.subtype,
      content: data.content,
      referenceId: data.referenceId ?? null,
      routing: data.routing ?? null,
    }).returning();

    // Publish to Redis for real-time delivery
    if (redis) {
      await redis.publish(`team:${teamId}:waggle`, JSON.stringify(message));
    }

    return message;
  }

  async list(teamId: string, filters?: MessageFilters) {
    const conditions = [eq(messages.teamId, teamId)];

    if (filters?.type) {
      conditions.push(eq(messages.type, filters.type));
    }
    if (filters?.subtype) {
      conditions.push(eq(messages.subtype, filters.subtype));
    }

    return this.db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt));
  }

  async checkHive(teamId: string, query: HiveQuery): Promise<HiveQueryResult> {
    const searchTerm = `%${query.topic}%`;

    // Search team_entities by name or entityType matching the topic
    const entities = await this.db
      .select({
        id: teamEntities.id,
        name: teamEntities.name,
        entityType: teamEntities.entityType,
        properties: teamEntities.properties,
      })
      .from(teamEntities)
      .where(
        and(
          eq(teamEntities.teamId, teamId),
          sql`(${teamEntities.name} ILIKE ${searchTerm} OR ${teamEntities.entityType} ILIKE ${searchTerm})`,
        ),
      )
      .limit(10);

    // Search tasks by title or description matching the topic
    const relatedTasks = await this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        createdBy: tasks.createdBy,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.teamId, teamId),
          sql`(${tasks.title} ILIKE ${searchTerm} OR ${tasks.description} ILIKE ${searchTerm})`,
        ),
      )
      .limit(10);

    // Search recent broadcast messages
    const relatedMessages = await this.db
      .select({
        id: messages.id,
        type: messages.type,
        subtype: messages.subtype,
        content: messages.content,
      })
      .from(messages)
      .where(
        and(
          eq(messages.teamId, teamId),
          eq(messages.type, 'broadcast'),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(10);

    return { entities, relatedTasks, relatedMessages };
  }
}
