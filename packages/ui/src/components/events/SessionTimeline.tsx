/**
 * SessionTimeline — clickable vertical timeline of tool events from a session.
 *
 * Shows every tool call with timestamp, tool name, status dot, and duration.
 * Click to expand and see full input/output as formatted JSON.
 * Sub-agent calls (spawn_agent) render as nested child events.
 */

import { useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────

export interface TimelineEvent {
  id: string;
  timestamp: string;
  toolName: string;
  status: 'success' | 'error';
  durationMs: number | null;
  inputPreview: string;
  outputPreview: string;
  fullInput: Record<string, unknown>;
  fullOutput: Record<string, unknown>;
  children?: TimelineEvent[];
}

export interface SessionTimelineProps {
  events: TimelineEvent[];
  loading?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  // Search / web
  web_search: 'magnifier',
  web_fetch: 'globe',
  tavily_search: 'magnifier',
  brave_search: 'magnifier',

  // Memory / knowledge
  search_memory: 'brain',
  save_memory: 'brain',
  query_knowledge: 'brain',
  correct_knowledge: 'brain',
  add_task: 'brain',

  // File system
  bash: 'terminal',
  read_file: 'file',
  write_file: 'file',
  edit_file: 'pen',
  multi_edit: 'files',
  search_files: 'magnifier',
  search_content: 'magnifier',

  // Git
  git_status: 'git',
  git_diff: 'git',
  git_log: 'git',
  git_commit: 'git',

  // Planning
  create_plan: 'plan',
  add_plan_step: 'plan',
  execute_step: 'plan',
  show_plan: 'plan',

  // Workflows
  compose_workflow: 'workflow',
  orchestrate_workflow: 'workflow',

  // Sub-agents
  spawn_agent: 'agent',
  list_agents: 'agent',
  get_agent_result: 'agent',

  // Scheduling
  create_schedule: 'clock',
  list_schedules: 'clock',
  delete_schedule: 'clock',
  trigger_schedule: 'clock',

  // Skills / capabilities
  list_skills: 'package',
  create_skill: 'package',
  delete_skill: 'package',
  search_skills: 'package',
  suggest_skill: 'package',
  acquire_capability: 'package',
  install_capability: 'package',

  // Documents
  generate_docx: 'doc',

  // CLI
  cli_discover: 'terminal',
  cli_execute: 'terminal',

  // Browser automation
  browser_navigate: 'globe',
  browser_screenshot: 'globe',
  browser_click: 'globe',
  browser_fill: 'globe',
  browser_evaluate: 'globe',
  browser_snapshot: 'globe',

  // Audit
  query_audit: 'shield',
};

export function getToolIcon(toolName: string): string {
  // Direct match
  if (TOOL_ICONS[toolName]) return TOOL_ICONS[toolName];

  // Prefix-based fallback for tool families
  if (toolName.startsWith('connector_')) return 'plug';
  if (toolName.startsWith('kvark_')) return 'building';
  if (toolName.startsWith('git_')) return 'git';
  // Team tools: check_hive, share_to_team, etc.
  if (toolName.includes('team') || toolName.includes('hive') || toolName === 'share_to_team' || toolName === 'check_hive') return 'team';

  return 'tool';
}

/**
 * Format duration in milliseconds to a human-readable string.
 * - null: empty string
 * - <1000ms: "250ms"
 * - 1000-59999ms: "1.2s"
 * - >=60000ms: "2m 30s"
 */
export function formatTimelineDuration(ms: number | null): string {
  if (ms === null) return '';
  const whole = Math.floor(ms);
  if (whole < 1000) return `${whole}ms`;
  if (whole < 60000) return `${(whole / 1000).toFixed(1)}s`;
  const minutes = Math.floor(whole / 60000);
  const seconds = Math.floor((whole % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format an ISO timestamp to a relative time string.
 */
export function formatTimelineTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// ── Single Event Row ──────────────────────────────────────────────────

function TimelineEventRow({
  event,
  expanded,
  onToggle,
  nested = false,
}: {
  event: TimelineEvent;
  expanded: boolean;
  onToggle: () => void;
  nested?: boolean;
}) {
  return (
    <div
      className={`session-timeline__event ${nested ? 'ml-7 mb-0.5' : 'mb-0.5'}`}
    >
      {/* Clickable header row */}
      <button
        className="session-timeline__event-header flex items-center gap-2 w-full px-2.5 py-1.5 bg-transparent border border-transparent rounded-md cursor-pointer text-xs text-left text-foreground transition-colors hover:bg-muted/50 hover:border-primary/20"
        onClick={onToggle}
        type="button"
      >
        {/* Status dot */}
        <span
          className={`session-timeline__status-dot w-2 h-2 rounded-full shrink-0 ${
            event.status === 'success' ? 'bg-green-500' : 'bg-destructive'
          }`}
          title={event.status}
        />

        {/* Timestamp */}
        <span className="text-[10px] text-muted-foreground/70 font-mono shrink-0">
          {formatTimelineTimestamp(event.timestamp)}
        </span>

        {/* Tool icon + name */}
        <span className="text-[10px] shrink-0">
          {getToolIcon(event.toolName)}
        </span>
        <span className="font-semibold text-foreground shrink-0">
          {event.toolName}
        </span>

        {/* Input preview */}
        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground text-[11px]">
          {event.inputPreview}
        </span>

        {/* Duration */}
        {event.durationMs !== null && (
          <span className="text-[10px] text-muted-foreground/70 font-mono shrink-0">
            {formatTimelineDuration(event.durationMs)}
          </span>
        )}

        {/* Expand indicator */}
        <span className="text-[10px] text-muted-foreground/70 shrink-0">
          {expanded ? '\u25BC' : '\u25B6'}
        </span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="session-timeline__details ml-[18px] mt-1 mb-2 p-3 bg-muted/50 rounded-md border border-primary/15">
          {/* Full Input */}
          <div className="mb-2">
            <div className="text-[10px] font-semibold text-muted-foreground/70 mb-1 uppercase tracking-wide">
              Input
            </div>
            <pre className="session-timeline__json m-0 p-2 bg-background/80 rounded text-[11px] font-mono text-muted-foreground overflow-auto max-h-[200px] whitespace-pre-wrap break-words">
              {JSON.stringify(event.fullInput, null, 2)}
            </pre>
          </div>

          {/* Full Output */}
          <div>
            <div className="text-[10px] font-semibold text-muted-foreground/70 mb-1 uppercase tracking-wide">
              Output
            </div>
            <pre className={`session-timeline__json m-0 p-2 bg-background/80 rounded text-[11px] font-mono overflow-auto max-h-[200px] whitespace-pre-wrap break-words ${
              event.status === 'error' ? 'text-red-300' : 'text-muted-foreground'
            }`}>
              {JSON.stringify(event.fullOutput, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────

export function SessionTimeline({ events, loading }: SessionTimelineProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [collapsedSubAgents, setCollapsedSubAgents] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSubAgent = (id: string) => {
    setCollapsedSubAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="session-timeline p-4 text-muted-foreground/70 text-xs">
        Loading timeline...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="session-timeline session-timeline--empty p-6 text-center text-muted-foreground/70 text-xs">
        No events
      </div>
    );
  }

  return (
    <div className="session-timeline relative pl-3">
      {/* Vertical timeline line */}
      <div className="session-timeline__line absolute left-[15px] top-2 bottom-2 w-0.5 bg-border rounded-sm" />

      {events.map((event) => {
        const hasChildren = event.children && event.children.length > 0;
        const isSubAgentCollapsed = collapsedSubAgents.has(event.id);

        return (
          <div key={event.id} className="session-timeline__group">
            <TimelineEventRow
              event={event}
              expanded={expandedIds.has(event.id)}
              onToggle={() => toggleExpand(event.id)}
            />

            {/* Sub-agent children */}
            {hasChildren && (
              <div className="session-timeline__subagent ml-1">
                <button
                  type="button"
                  onClick={() => toggleSubAgent(event.id)}
                  className="flex items-center gap-1 py-0.5 pr-2 pl-7 bg-transparent border-none cursor-pointer text-[10px] text-primary"
                >
                  {isSubAgentCollapsed ? '\u25B6' : '\u25BC'}{' '}
                  {event.children!.length} sub-agent event{event.children!.length !== 1 ? 's' : ''}
                </button>

                {!isSubAgentCollapsed &&
                  event.children!.map((child) => (
                    <TimelineEventRow
                      key={child.id}
                      event={child}
                      expanded={expandedIds.has(child.id)}
                      onToggle={() => toggleExpand(child.id)}
                      nested
                    />
                  ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
