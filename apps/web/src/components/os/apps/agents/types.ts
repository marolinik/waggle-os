/** Shared types for the Agents app */

export interface BackendPersona {
  id: string;
  name: string;
  description: string;
  icon?: string;
  workspaceAffinity?: string[];
  suggestedCommands?: string[];
  tools?: string[];
  systemPrompt?: string;
  custom?: boolean;
}

export interface AgentGroup {
  id: string;
  name: string;
  description?: string;
  strategy: 'parallel' | 'sequential' | 'coordinator';
  members: AgentGroupMember[];
}

export interface AgentGroupMember {
  agentId: string;
  roleInGroup: 'lead' | 'worker';
  executionOrder: number;
}

export interface ToolDef {
  name: string;
  description?: string;
}

export type MemberExecStatus = 'pending' | 'running' | 'done' | 'failed';

export interface MemberExecState {
  agentId: string;
  status: MemberExecStatus;
  startedAt?: number;
  completedAt?: number;
  result?: string;
  error?: string;
}

export interface GroupExecState {
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  task: string;
  startedAt: number;
  completedAt?: number;
  members: MemberExecState[];
  output?: Record<string, unknown>;
}

export const STRATEGY_CONFIG: Record<string, { label: string; description: string; color: string }> = {
  parallel: { label: 'Parallel', description: 'All agents work simultaneously', color: 'bg-emerald-500/20 text-emerald-400' },
  sequential: { label: 'Sequential', description: 'Agents work one after another', color: 'bg-sky-500/20 text-sky-400' },
  coordinator: { label: 'Coordinator', description: 'Lead agent delegates to workers', color: 'bg-amber-500/20 text-amber-400' },
};
