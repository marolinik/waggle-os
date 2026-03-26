/**
 * SubAgentProgress — collapsible panel showing active sub-agents.
 *
 * Sits above the chat input in ChatArea. Renders nothing when agents list is empty.
 * Shows status dots, agent name/role, current tool or status text, and elapsed time.
 */

import { useState, useMemo } from 'react';

export interface SubAgentInfo {
  id: string;
  name: string;
  role: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  task: string;
  toolsUsed: string[];
  startedAt?: number;
  completedAt?: number;
}

export interface SubAgentProgressProps {
  agents: SubAgentInfo[];
  collapsed?: boolean;
  onToggle?: () => void;
}

/** Status dot CSS class by agent status */
const STATUS_DOT_CLASS: Record<SubAgentInfo['status'], string> = {
  pending: 'bg-yellow-500',
  running: 'bg-primary animate-pulse',
  done: 'bg-green-500',
  failed: 'bg-destructive',
};

/** Human-readable status label */
const STATUS_LABEL: Record<SubAgentInfo['status'], string> = {
  pending: 'Pending',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
};

/** Format elapsed or total time from timestamps */
export function formatElapsed(startedAt?: number, completedAt?: number): string {
  if (!startedAt) return '';
  const end = completedAt ?? Date.now();
  const ms = end - startedAt;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export function SubAgentProgress({ agents, collapsed: controlledCollapsed, onToggle }: SubAgentProgressProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false);

  // Support both controlled and uncontrolled collapse
  const isControlled = controlledCollapsed !== undefined;
  const collapsed = isControlled ? controlledCollapsed : internalCollapsed;

  const handleToggle = () => {
    if (onToggle) onToggle();
    if (!isControlled) setInternalCollapsed((prev) => !prev);
  };

  const activeCount = useMemo(
    () => agents.filter((a) => a.status === 'running' || a.status === 'pending').length,
    [agents],
  );

  // Render nothing when no agents
  if (agents.length === 0) return null;

  return (
    <div className="bg-card border-t border-border" data-testid="subagent-progress">
      {/* Header bar */}
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent/50 transition-colors"
        onClick={handleToggle}
        aria-expanded={!collapsed}
        data-testid="subagent-progress-toggle"
      >
        <span>
          Active Agents ({activeCount})
        </span>
        <svg
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Agent rows — shown when expanded */}
      {!collapsed && (
        <div className="px-3 pb-2 space-y-1" data-testid="subagent-progress-list">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center gap-2 py-1 text-xs"
              data-testid={`subagent-row-${agent.id}`}
            >
              {/* Status dot */}
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASS[agent.status]}`}
                data-testid={`subagent-dot-${agent.id}`}
                data-status={agent.status}
              />

              {/* Name + role */}
              <span className="font-medium text-foreground truncate">
                {agent.name}
              </span>
              <span className="text-muted-foreground truncate">
                ({agent.role})
              </span>

              {/* Status text or current tool */}
              <span className="ml-auto shrink-0 text-muted-foreground">
                {agent.status === 'running' && agent.toolsUsed.length > 0
                  ? agent.toolsUsed[agent.toolsUsed.length - 1]
                  : STATUS_LABEL[agent.status]}
              </span>

              {/* Elapsed time */}
              {agent.startedAt && (
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatElapsed(agent.startedAt, agent.completedAt)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
