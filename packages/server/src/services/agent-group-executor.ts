/**
 * Agent Group Executor — converts agent group definitions into
 * SubagentOrchestrator workflow templates and executes them.
 *
 * Strategies:
 *   - sequential: Execute members in executionOrder, each waits for previous
 *   - parallel: Execute all members simultaneously
 *   - coordinator: First member coordinates, others are workers
 */

import type { WorkflowTemplate, WorkflowStep } from '@waggle/agent';

interface AgentGroupMember {
  agentId: string;
  roleInGroup: string;
  executionOrder: number;
  // Joined from agents table:
  name?: string;
  role?: string;
  systemPrompt?: string;
  model?: string;
  tools?: string[];
}

interface AgentGroupData {
  id: string;
  name: string;
  description?: string;
  strategy: string;
  members: AgentGroupMember[];
}

/**
 * Convert an agent group with its members into a WorkflowTemplate
 * that the SubagentOrchestrator can execute.
 */
export function buildWorkflowFromGroup(group: AgentGroupData, task: string): WorkflowTemplate {
  const strategy = group.strategy || 'sequential';

  const steps: WorkflowStep[] = group.members
    .sort((a, b) => (a.executionOrder ?? 0) - (b.executionOrder ?? 0))
    .map((member, index, arr) => {
      const step: WorkflowStep = {
        name: member.name ?? `agent-${member.agentId}`,
        role: member.roleInGroup ?? member.role ?? 'worker',
        task,
        tools: member.tools,
        maxTurns: 10,
      };

      switch (strategy) {
        case 'sequential':
          // Each step depends on the previous one
          if (index > 0) {
            const prevName = arr[index - 1].name ?? `agent-${arr[index - 1].agentId}`;
            step.dependsOn = [prevName];
            step.contextFrom = [prevName];
          }
          break;

        case 'parallel':
          // No dependencies — all run simultaneously
          break;

        case 'coordinator':
          // First member is coordinator, others depend on coordinator's output
          if (index === 0) {
            step.role = 'coordinator';
            step.task = `You are the coordinator. Break down this task and delegate to your team:\n\n${task}`;
          } else {
            const coordinatorName = arr[0].name ?? `agent-${arr[0].agentId}`;
            step.dependsOn = [coordinatorName];
            step.contextFrom = [coordinatorName];
          }
          break;
      }

      return step;
    });

  // Choose aggregation based on strategy
  const aggregation: WorkflowTemplate['aggregation'] =
    strategy === 'coordinator' ? 'synthesize' :
    strategy === 'parallel' ? 'concatenate' :
    'last';

  return {
    name: group.name,
    description: group.description ?? `Agent group: ${group.name}`,
    steps,
    aggregation,
  };
}
