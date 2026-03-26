import type { AgentMemberConfig, AgentResult, ExecutionDeps } from './parallel.js';

/**
 * Sequential execution strategy: agents run one after another,
 * each receiving the previous agent's output as context.
 * Best for pipeline-style workflows (research -> draft -> review).
 */
export async function executeSequential(
  members: AgentMemberConfig[],
  taskInput: Record<string, unknown>,
  deps?: ExecutionDeps,
): Promise<Record<string, unknown>> {
  const task = (taskInput.task as string) ?? JSON.stringify(taskInput);
  const results: AgentResult[] = [];
  let previousOutput: string | null = null;

  for (const { agent, member } of members) {
    if (!deps) {
      // Stub mode (backward compat)
      const output: AgentResult = {
        agentId: agent.id,
        agentName: agent.name,
        role: member.roleInGroup,
        model: agent.model,
        output: `[Stub] ${agent.name} processed with input from previous step`,
      };
      // Preserve inputFrom for backward compat with existing tests
      (output as any).inputFrom = previousOutput === null ? 'taskInput' : (results[results.length - 1]?.agentName);
      results.push(output);
      previousOutput = output.output;
      continue;
    }

    try {
      const tools = deps.resolveTools(agent.tools);
      const basePrompt = agent.systemPrompt ?? `You are ${agent.name}. Complete the assigned task.`;

      // Chain: inject previous agent's output as context
      const systemPrompt = previousOutput
        ? `${basePrompt}\n\n## Previous Agent's Output\n${previousOutput}`
        : basePrompt;

      const result = await deps.runAgent({
        model: agent.model,
        systemPrompt,
        tools,
        messages: [{ role: 'user', content: task }],
      });

      const agentResult: AgentResult = {
        agentId: agent.id,
        agentName: agent.name,
        role: member.roleInGroup,
        model: agent.model,
        output: result.content,
        toolsUsed: result.toolsUsed,
        usage: result.usage,
      };
      results.push(agentResult);
      previousOutput = result.content;
    } catch (err: unknown) {
      // Error in chain stops execution — subsequent agents depend on this output
      results.push({
        agentId: agent.id,
        agentName: agent.name,
        role: member.roleInGroup,
        model: agent.model,
        output: '',
        error: err instanceof Error ? err.message : String(err),
      });
      break; // Stop chain on failure
    }
  }

  return {
    strategy: 'sequential',
    agentCount: results.length,
    results,
    finalOutput: results.filter(r => !r.error).at(-1)?.output ?? null,
    chainBroken: results.some(r => r.error),
  };
}
