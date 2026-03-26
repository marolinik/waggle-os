import type { Job } from 'bullmq';
import type { JobData } from '../job-processor.js';
import type { Db } from '../../../server/src/db/connection.js';
import { agentGroups, agentGroupMembers, agents } from '../../../server/src/db/schema.js';
import { eq } from 'drizzle-orm';
import { executeParallel, type ExecutionDeps } from '../execution/parallel.js';
import { executeSequential } from '../execution/sequential.js';
import { executeCoordinator } from '../execution/coordinator.js';
import { runAgentLoop, createSystemTools } from '@waggle/agent';

const LITELLM_URL = process.env.LITELLM_URL ?? 'http://localhost:4000/v1';
const LITELLM_API_KEY = process.env.LITELLM_API_KEY ?? process.env.LITELLM_MASTER_KEY ?? 'sk-waggle-dev';

export async function groupHandler(job: Job<JobData>, db: Db): Promise<Record<string, unknown>> {
  const { input } = job.data;
  const groupId = (input as Record<string, unknown>).groupId as string;
  const taskInput = (input as Record<string, unknown>).taskInput as Record<string, unknown> ?? {};

  if (!groupId) {
    throw new Error('groupHandler requires input.groupId');
  }

  // Load group config
  const [group] = await db.select().from(agentGroups)
    .where(eq(agentGroups.id, groupId));

  if (!group) {
    throw new Error(`Agent group not found: ${groupId}`);
  }

  // Load members with their agent configs
  const members = await db.select({
    member: agentGroupMembers,
    agent: agents,
  })
    .from(agentGroupMembers)
    .innerJoin(agents, eq(agentGroupMembers.agentId, agents.id))
    .where(eq(agentGroupMembers.groupId, groupId));

  if (members.length === 0) {
    throw new Error(`Agent group ${groupId} has no members`);
  }

  // Sort by execution order
  members.sort((a: typeof members[number], b: typeof members[number]) => a.member.executionOrder - b.member.executionOrder);

  // Build execution deps — wires strategies to real runAgentLoop
  const workspaceDir = (taskInput.workspaceDir as string) ?? process.cwd();
  const allTools = createSystemTools(workspaceDir);

  const deps: ExecutionDeps = {
    runAgent: async (config) => runAgentLoop({
      litellmUrl: LITELLM_URL,
      litellmApiKey: LITELLM_API_KEY,
      model: config.model,
      systemPrompt: config.systemPrompt,
      tools: config.tools,
      messages: config.messages,
      maxTurns: config.maxTurns ?? 10,
    }),
    resolveTools: (toolNames) => {
      if (toolNames.length === 0) return allTools; // No filter = all tools
      return allTools.filter(t => toolNames.includes(t.name));
    },
  };

  // Dispatch to strategy with real execution deps
  switch (group.strategy) {
    case 'parallel':
      return executeParallel(members, taskInput, deps);
    case 'sequential':
      return executeSequential(members, taskInput, deps);
    case 'coordinator':
      return executeCoordinator(members, taskInput, deps);
    default:
      throw new Error(`Unknown execution strategy: ${group.strategy}`);
  }
}
