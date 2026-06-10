/**
 * Agent Center display vocabulary (UX-Refactor Phase 3B, S09).
 *
 * Pure functions only — tested in lib/agent-center-display.test.ts.
 *  - PRD §14.5: ALL eight AgentRunState values map to a StatusBadge tone +
 *    human label (exhaustive Record — adding a state without a badge entry
 *    is a compile error).
 *  - C22: category tabs = All / Personal / Workspace / Team / Autonomous /
 *    Archive (Templates is a side affordance, NOT a tab).
 *  - C27: KPI row keeps the success-rate tile and total/running counts;
 *    "hours saved" is deliberately absent (no data source).
 */
import type { AgentRunState, AgentType } from '@waggle/shared';
import type { Agent } from '@/lib/types';
import type { StatusTone } from '@/components/ui/status-badge';

export const AGENT_STATE_META: Record<AgentRunState, { label: string; tone: StatusTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  idle: { label: 'Idle', tone: 'neutral' },
  running: { label: 'Running', tone: 'info' },
  paused: { label: 'Paused', tone: 'attention' },
  failed: { label: 'Failed', tone: 'risk' },
  waiting_for_approval: { label: 'Waiting for approval', tone: 'attention' },
  completed: { label: 'Completed', tone: 'healthy' },
  archived: { label: 'Archived', tone: 'neutral' },
};

/** C22 tab vocabulary: 'all' + the four AgentType categories + 'archive'. */
export type AgentCenterTab = 'all' | AgentType | 'archive';

export const AGENT_CENTER_TABS: ReadonlyArray<{ id: AgentCenterTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'personal', label: 'Personal' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'team', label: 'Team' },
  { id: 'autonomous', label: 'Autonomous' },
  { id: 'archive', label: 'Archive' },
];

/**
 * C22 filtering: Archive shows ONLY archived agents; every other tab hides
 * them ('all' = every live agent; type tabs = live agents of that type).
 */
export function filterAgentsByTab(agents: Agent[], tab: AgentCenterTab): Agent[] {
  if (tab === 'archive') return agents.filter((a) => a.status === 'archived');
  const live = agents.filter((a) => a.status !== 'archived');
  if (tab === 'all') return live;
  return live.filter((a) => a.type === tab);
}

/** 0-1 derived rate → display percent; '—' when there are no finalized runs. */
export function formatSuccessRate(rate?: number): string {
  if (typeof rate !== 'number' || Number.isNaN(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}

/** Compact relative time for lastRunAt ('never' when absent). */
export function formatRelativeTime(iso?: string, now: number = Date.now()): string {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'never';
  const diff = now - t;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(t).toLocaleDateString();
}

/** KPI row inputs (C27: success-rate yes, hours-saved no). Archived agents
 *  are excluded — they are not part of the working fleet. */
export function agentKpis(agents: Agent[]): {
  total: number;
  running: number;
  /** Mean of the agents that HAVE a derived rate; null when none do. */
  avgSuccessRate: number | null;
} {
  const live = agents.filter((a) => a.status !== 'archived');
  const rated = live.filter((a) => typeof a.successRate === 'number');
  return {
    total: live.length,
    running: live.filter((a) => a.status === 'running').length,
    avgSuccessRate: rated.length > 0
      ? rated.reduce((s, a) => s + (a.successRate ?? 0), 0) / rated.length
      : null,
  };
}

/** C23: shape of the runAgent ambiguity error the FE branches on. */
export function workspaceAmbiguityIds(err: unknown): string[] | null {
  const e = err as { status?: number; body?: { error?: string; workspaceIds?: unknown } } | null;
  if (!e || e.status !== 400) return null;
  if (e.body?.error !== 'workspace_ambiguous') return null;
  const ids = e.body.workspaceIds;
  return Array.isArray(ids) ? ids.map(String) : [];
}
