import type { AgentMemberConfig, AgentResult, ExecutionDeps } from './parallel.js';

/**
 * Coordinator execution strategy: a lead agent plans and delegates,
 * worker agents execute subtasks, then the lead synthesizes results.
 * Best for complex tasks requiring decomposition and integration.
 */
export async function executeCoordinator(
  members: AgentMemberConfig[],
  taskInput: Record<string, unknown>,
  deps?: ExecutionDeps,
): Promise<Record<string, unknown>> {
  const lead = members.find(m => m.member.roleInGroup === 'lead');
  const workers = members.filter(m => m.member.roleInGroup === 'worker');

  if (!lead) {
    throw new Error('Coordinator strategy requires a lead agent');
  }

  const task = (taskInput.task as string) ?? JSON.stringify(taskInput);

  // ── Stub mode (backward compat) ──────────────────────────────────
  if (!deps) {
    const plan = {
      agentId: lead.agent.id,
      agentName: lead.agent.name,
      phase: 'planning',
      output: `[Stub] ${lead.agent.name} delegated to ${workers.length} workers`,
      subtasks: workers.map(w => ({
        assignedTo: w.agent.name,
        description: `[Stub] Subtask for ${w.agent.name}`,
      })),
    };

    const workerResults = await Promise.all(
      workers.map(async ({ agent }) => ({
        agentId: agent.id,
        agentName: agent.name,
        phase: 'execution',
        model: agent.model,
        output: `[Stub] ${agent.name} completed delegated work`,
      })),
    );

    const synthesis = {
      agentId: lead.agent.id,
      agentName: lead.agent.name,
      phase: 'synthesis',
      output: `[Stub] ${lead.agent.name} synthesized ${workerResults.length} worker outputs`,
    };

    return {
      strategy: 'coordinator',
      leadAgent: lead.agent.name,
      workerCount: workers.length,
      plan,
      workerResults,
      synthesis,
      finalOutput: synthesis.output,
    };
  }

  // ── Real execution: 3-phase pattern ──────────────────────────────

  // Phase 1: Lead agent creates plan
  const leadPrompt = lead.agent.systemPrompt ?? `You are ${lead.agent.name}, a lead coordinator.`;
  const planResult = await deps.runAgent({
    model: lead.agent.model,
    systemPrompt: `${leadPrompt}\n\nYou are the lead coordinator. Analyze the task and create a clear plan for ${workers.length} worker agent(s). Output a structured plan with one subtask per worker.`,
    tools: deps.resolveTools(lead.agent.tools),
    messages: [{ role: 'user', content: task }],
  });

  const plan = {
    agentId: lead.agent.id,
    agentName: lead.agent.name,
    phase: 'planning',
    output: planResult.content,
    usage: planResult.usage,
  };

  // Phase 2: Workers execute in parallel, receiving the plan as context
  const workerResults: AgentResult[] = await Promise.all(
    workers.map(async ({ agent, member }) => {
      try {
        const workerPrompt = agent.systemPrompt ?? `You are ${agent.name}. Execute your assigned subtask.`;
        const result = await deps.runAgent({
          model: agent.model,
          systemPrompt: `${workerPrompt}\n\n## Coordinator's Plan\n${planResult.content}`,
          tools: deps.resolveTools(agent.tools),
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

  // Phase 3: Lead synthesizes worker results (include failure notices)
  const successOutputs = workerResults
    .filter(r => !r.error)
    .map(r => `## ${r.agentName}\n${r.output}`);
  const failureNotices = workerResults
    .filter(r => r.error)
    .map(r => `## ${r.agentName} (FAILED)\nError: ${r.error}`);
  const workerOutputs = [...successOutputs, ...failureNotices].join('\n\n');

  const synthesisResult = await deps.runAgent({
    model: lead.agent.model,
    systemPrompt: `${leadPrompt}\n\nSynthesize the following worker outputs into a comprehensive final result.`,
    tools: deps.resolveTools(lead.agent.tools),
    messages: [{ role: 'user', content: workerOutputs || 'No worker outputs available.' }],
  });

  const synthesis = {
    agentId: lead.agent.id,
    agentName: lead.agent.name,
    phase: 'synthesis',
    output: synthesisResult.content,
    usage: synthesisResult.usage,
  };

  return {
    strategy: 'coordinator',
    leadAgent: lead.agent.name,
    workerCount: workers.length,
    plan,
    workerResults,
    synthesis,
    finalOutput: synthesis.output,
    errors: workerResults.filter(r => r.error).map(r => ({ agent: r.agentName, error: r.error })),
  };
}
