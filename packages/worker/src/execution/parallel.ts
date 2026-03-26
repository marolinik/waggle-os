import type { ToolDefinition } from '@waggle/agent';

export interface AgentMemberConfig {
  member: { roleInGroup: string; executionOrder: number };
  agent: { id: string; name: string; model: string; systemPrompt: string | null; tools: string[] };
}

/** Dependencies injected for real execution (omit for stub mode) */
export interface ExecutionDeps {
  runAgent: (config: {
    model: string;
    systemPrompt: string;
    tools: ToolDefinition[];
    messages: Array<{ role: string; content: string }>;
    maxTurns?: number;
  }) => Promise<{ content: string; toolsUsed: string[]; usage: { inputTokens: number; outputTokens: number } }>;
  /** Resolve tool names to ToolDefinition[] from available tools */
  resolveTools: (toolNames: string[]) => ToolDefinition[];
}

export interface AgentResult {
  agentId: string;
  agentName: string;
  role: string;
  model: string;
  output: string;
  toolsUsed?: string[];
  usage?: { inputTokens: number; outputTokens: number };
  error?: string;
}

/**
 * Parallel execution strategy: all agents run concurrently, results are merged.
 * Best for independent subtasks that don't depend on each other.
 */
export async function executeParallel(
  members: AgentMemberConfig[],
  taskInput: Record<string, unknown>,
  deps?: ExecutionDeps,
): Promise<Record<string, unknown>> {
  const task = (taskInput.task as string) ?? JSON.stringify(taskInput);

  const results: AgentResult[] = await Promise.all(
    members.map(async ({ agent, member }) => {
      if (!deps) {
        // Stub mode (backward compat for existing tests without deps)
        return {
          agentId: agent.id,
          agentName: agent.name,
          role: member.roleInGroup,
          model: agent.model,
          output: `[Stub] ${agent.name} processed task with model ${agent.model}`,
        };
      }

      try {
        const tools = deps.resolveTools(agent.tools);
        const systemPrompt = agent.systemPrompt ?? `You are ${agent.name}. Complete the assigned task thoroughly.`;

        const result = await deps.runAgent({
          model: agent.model,
          systemPrompt,
          tools,
          messages: [{ role: 'user', content: task }],
        });

        return {
          agentId: agent.id,
          agentName: agent.name,
          role: member.roleInGroup,
          model: agent.model,
          output: result.content,
          toolsUsed: result.toolsUsed,
          usage: result.usage,
        };
      } catch (err: unknown) {
        return {
          agentId: agent.id,
          agentName: agent.name,
          role: member.roleInGroup,
          model: agent.model,
          output: '',
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  return {
    strategy: 'parallel',
    agentCount: results.length,
    results,
    mergedOutput: results
      .filter(r => !r.error)
      .map(r => r.output)
      .join('\n\n---\n\n'),
    errors: results.filter(r => r.error).map(r => ({ agent: r.agentName, error: r.error })),
  };
}
