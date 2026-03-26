/**
 * SubAgentPanel — animated panel showing sub-agent status during multi-agent operations.
 *
 * Displays above chat messages when agents are active.
 * Auto-collapses when all agents complete.
 * Style: hive-900 bg, honey accents, compact layout.
 */

import { useState, useEffect, useMemo } from 'react';

export interface SubAgentPanelProps {
  agents: Array<{
    id: string;
    role: string;
    status: 'pending' | 'running' | 'complete' | 'error';
    name?: string;
  }>;
}

/** SVG role icons keyed by common role names */
function RoleIcon({ role }: { role: string }) {
  const r = role.toLowerCase();
  // Researcher
  if (r.includes('research')) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    );
  }
  // Writer / drafter
  if (r.includes('writ') || r.includes('draft')) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    );
  }
  // Reviewer / critic
  if (r.includes('review') || r.includes('critic')) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  // Coder / developer
  if (r.includes('cod') || r.includes('dev')) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    );
  }
  // Planner
  if (r.includes('plan')) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="9" y1="21" x2="9" y2="9" />
      </svg>
    );
  }
  // Analyst
  if (r.includes('analy')) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    );
  }
  // Default — agent/user icon
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

/** Status indicator element */
function StatusIndicator({ status }: { status: SubAgentPanelProps['agents'][number]['status'] }) {
  switch (status) {
    case 'pending':
      return (
        <span
          className="inline-block h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: 'var(--hive-500, #6b7280)' }}
          title="Pending"
        />
      );
    case 'running':
      return (
        <span
          className="inline-block h-2 w-2 rounded-full shrink-0 animate-pulse"
          style={{ backgroundColor: 'var(--honey-500, #f59e0b)' }}
          title="Running"
        />
      );
    case 'complete':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--status-healthy, #22c55e)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case 'error':
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--status-error, #ef4444)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );
  }
}

export function SubAgentPanel({ agents }: SubAgentPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [autoCollapsed, setAutoCollapsed] = useState(false);

  const activeCount = useMemo(
    () => agents.filter((a) => a.status === 'running' || a.status === 'pending').length,
    [agents],
  );

  const allDone = useMemo(
    () => agents.length > 0 && agents.every((a) => a.status === 'complete' || a.status === 'error'),
    [agents],
  );

  // Auto-collapse when all agents complete
  useEffect(() => {
    if (allDone && !autoCollapsed) {
      const timer = setTimeout(() => {
        setCollapsed(true);
        setAutoCollapsed(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
    // Reset auto-collapse flag when new agents appear
    if (!allDone && autoCollapsed) {
      setAutoCollapsed(false);
      setCollapsed(false);
    }
  }, [allDone, autoCollapsed]);

  // Render nothing when no agents
  if (agents.length === 0) return null;

  const headerText = allDone
    ? `${agents.length} specialist${agents.length !== 1 ? 's' : ''} finished`
    : `${activeCount} specialist${activeCount !== 1 ? 's' : ''} working`;

  return (
    <div
      className="border-b transition-all duration-300"
      style={{
        backgroundColor: 'var(--hive-900, #1a1a2e)',
        borderColor: 'var(--hive-700, #2d2d44)',
      }}
      data-testid="subagent-panel"
    >
      {/* Header */}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-2 text-xs font-medium transition-colors"
        style={{ color: 'var(--honey-400, #fbbf24)' }}
        onClick={() => setCollapsed((prev) => !prev)}
        aria-expanded={!collapsed}
        data-testid="subagent-panel-toggle"
      >
        {/* Pulsing hive icon when active */}
        {!allDone && (
          <span className="animate-pulse" style={{ color: 'var(--honey-500, #f59e0b)' }}>
            {'\u2B21'}
          </span>
        )}
        {allDone && (
          <span style={{ color: 'var(--status-healthy, #22c55e)' }}>
            {'\u2B22'}
          </span>
        )}

        <span>{headerText}</span>
        <span className="flex-1" />
        <svg
          className={`h-3 w-3 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
          style={{ color: 'var(--hive-400, #9ca3af)' }}
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

      {/* Agent rows */}
      {!collapsed && (
        <div className="px-4 pb-2 space-y-0.5" data-testid="subagent-panel-list">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="flex items-center gap-2 py-1 text-xs rounded px-2 transition-colors"
              style={{ color: 'var(--hive-200, #e5e7eb)' }}
              data-testid={`subagent-panel-row-${agent.id}`}
            >
              {/* Role icon */}
              <span className="shrink-0" style={{ color: 'var(--honey-500, #f59e0b)' }}>
                <RoleIcon role={agent.role} />
              </span>

              {/* Name / role */}
              <span className="font-medium truncate">
                {agent.name || agent.role}
              </span>
              {agent.name && (
                <span className="truncate" style={{ color: 'var(--hive-400, #9ca3af)' }}>
                  ({agent.role})
                </span>
              )}

              {/* Spacer */}
              <span className="flex-1" />

              {/* Status indicator */}
              <StatusIndicator status={agent.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
