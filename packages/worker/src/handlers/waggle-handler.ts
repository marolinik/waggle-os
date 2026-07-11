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
import type { WaggleMessage } from '@waggle/shared';
import { CapabilityRouter, createSystemTools } from '@waggle/agent';

export interface WaggleHandlerDeps {
  enqueueWorker?: (input: {
    teamId: string;
    userId: string;
    task: string;
    role: string;
    context?: string;
  }) => Promise<string>;
}

export function createWaggleHandler(deps: WaggleHandlerDeps = {}) {
  const capabilityRouter = new CapabilityRouter({
    toolNames: createSystemTools(process.cwd()).map(tool => tool.name),
    skills: [],
    plugins: [],
    mcpServers: [],
    subAgentRoles: ['researcher', 'writer', 'coder', 'analyst', 'reviewer', 'planner'],
    connectors: [],
  });

  return async function waggleHandler(job: Job<JobData>, db: Db): Promise<Record<string, unknown>> {
    const { teamId, userId, input } = job.data;
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
        return capabilityRouter.resolve(query).map(route => ({
          source: route.source,
          name: route.name,
          description: route.description,
          available: route.available,
        }));
      },
      spawnWorker: async (task: string, role: string, context?: string) => {
        if (!deps.enqueueWorker) {
          throw new Error('Worker delegation is unavailable in this runtime');
        }

        const childJobId = await deps.enqueueWorker({ teamId, userId, task, role, ...(context ? { context } : {}) });
        return `Worker job ${childJobId} queued for: ${task} (${role})`;
      },
    });

      // `inputObj` is untrusted job-data; the dispatcher revalidates the
      // type/subtype combo at runtime before acting on it.
      const result = await dispatcher.dispatch(inputObj as unknown as WaggleMessage);
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

    const gaps = [
      ...(entities.length === 0 ? [`No team knowledge matched "${topic}".`] : []),
      ...(relatedTasks.length === 0 ? [`No team tasks matched "${topic}".`] : []),
    ];

    return {
      topic,
      existingKnowledge: entities.length,
      entities: entities.map((e: typeof entities[number]) => ({ id: e.id, name: e.name, type: e.entityType })),
      relatedTasks: relatedTasks.length,
      tasks: relatedTasks.map((t: typeof relatedTasks[number]) => ({ id: t.id, title: t.title, status: t.status })),
      gaps,
      recommendation: entities.length === 0 && relatedTasks.length === 0
        ? `Create a knowledge entry or task for "${topic}" so the team can build a shared record.`
        : `Review the ${entities.length} matching knowledge entr${entities.length === 1 ? 'y' : 'ies'} and ${relatedTasks.length} matching task${relatedTasks.length === 1 ? '' : 's'} for "${topic}".`,
    };
  };
}

export const waggleHandler = createWaggleHandler();
