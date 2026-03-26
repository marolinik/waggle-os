/**
 * Waggle handler — routes Waggle Dance protocol messages through the dispatcher,
 * with fallback to hive query for legacy topic-based calls.
 */

import type { Job } from 'bullmq';
import type { JobData } from '../job-processor.js';
import type { Db } from '../../../server/src/db/connection.js';
import { teamEntities, tasks } from '../../../server/src/db/schema.js';
import { sql } from 'drizzle-orm';
import { WaggleDanceDispatcher } from '@waggle/waggle-dance';

export async function waggleHandler(job: Job<JobData>, db: Db): Promise<Record<string, unknown>> {
  const { teamId, input } = job.data;
  const inputObj = input as Record<string, unknown>;

  // ── Protocol message routing (type + subtype present) ────────────
  if (inputObj.type && inputObj.subtype) {
    const dispatcher = new WaggleDanceDispatcher({
      searchMemory: async (query: string) => {
        const searchTerm = `%${query}%`;
        const entities = await db.select().from(teamEntities)
          .where(sql`${teamEntities.teamId} = ${teamId} AND ${teamEntities.name} ILIKE ${searchTerm}`)
          .limit(10);
        return entities.map((e: typeof entities[number]) => `[${e.entityType}] ${e.name}`).join('\n') || 'No matching knowledge found.';
      },
      resolveCapability: (query: string) => {
        // Stub for now — full capability router wiring needs agent package context
        // In production, this would use CapabilityRouter.resolve(query)
        return [{ source: 'native', name: query, description: `Capability: ${query}`, available: true }];
      },
      spawnWorker: async (task: string, role: string, context?: string) => {
        // Enqueue a new job for the task
        // In production: job.queue.add('task', { teamId, userId: job.data.userId, ... })
        return `Worker spawned for: ${task} (role: ${role})${context ? ` with context` : ''}`;
      },
    });

    const result = await dispatcher.dispatch(inputObj as any);
    return {
      dispatched: true,
      type: inputObj.type,
      subtype: inputObj.subtype,
      ...result,
    };
  }

  // ── Legacy fallback: topic-based hive query ──────────────────────
  const topic = (inputObj.topic as string) ?? '';
  const searchTerm = `%${topic}%`;

  // Query existing team knowledge
  const entities = await db.select().from(teamEntities)
    .where(sql`${teamEntities.teamId} = ${teamId} AND ${teamEntities.name} ILIKE ${searchTerm}`)
    .limit(5);

  // Query related tasks
  const relatedTasks = await db.select().from(tasks)
    .where(sql`${tasks.teamId} = ${teamId} AND ${tasks.title} ILIKE ${searchTerm}`)
    .limit(5);

  return {
    topic,
    existingKnowledge: entities.length,
    entities: entities.map((e: typeof entities[number]) => ({ id: e.id, name: e.name, type: e.entityType })),
    relatedTasks: relatedTasks.length,
    tasks: relatedTasks.map((t: typeof relatedTasks[number]) => ({ id: t.id, title: t.title, status: t.status })),
    gaps: ['[Stub] Full analysis would identify specific knowledge gaps'],
    recommendation: `[Agent stub] Found ${entities.length} entities and ${relatedTasks.length} related tasks for "${topic}"`,
  };
}
