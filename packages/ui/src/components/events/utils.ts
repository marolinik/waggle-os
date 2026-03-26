/**
 * Utility functions for the event stream viewer.
 *
 * Maps step types to icons, statuses to colors,
 * and provides formatting and filtering helpers.
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface AgentStep {
  id: string;
  type: 'thinking' | 'tool' | 'search' | 'web' | 'writing' | 'error' | 'approval_requested' | 'approval_granted' | 'approval_denied';
  name: string;
  description?: string;
  timestamp: string;
  duration?: number; // milliseconds
  status: 'running' | 'success' | 'error' | 'pending' | 'skipped';
  input?: Record<string, unknown>;
  output?: unknown;
  tokens?: { input: number; output: number };
  cost?: number;
  expanded?: boolean;
}

export interface StepFilter {
  types?: string[];
  statuses?: string[];
}

// ── Constants ─────────────────────────────────────────────────────────

/** Maps step types to icon names. */
export const STEP_ICONS: Record<string, string> = {
  thinking: 'brain',
  tool: 'tool',
  search: 'magnifier',
  web: 'globe',
  writing: 'pen',
  error: 'alert',
  approval_requested: 'shield',
  approval_granted: 'check',
  approval_denied: 'block',
};

/** Maps statuses to CSS color values (using CSS custom properties with fallbacks). */
export const STEP_COLORS: Record<string, string> = {
  running: 'var(--step-running, #3b82f6)',    // blue
  success: 'var(--step-success, #22c55e)',    // green
  pending: 'var(--step-pending, #eab308)',    // yellow
  error: 'var(--step-error, #ef4444)',        // red
  skipped: 'var(--step-skipped, #6b7280)',    // gray
};

/** Maps step types to CSS color values for left border / icon tinting. */
export const STEP_TYPE_COLORS: Record<string, string> = {
  thinking: 'var(--step-thinking, #3b82f6)',  // blue
  search: 'var(--step-search, #8b5cf6)',      // purple
  web: 'var(--step-web, #06b6d4)',            // cyan
  tool: 'var(--step-tool, #22c55e)',          // green
  writing: 'var(--step-writing, #f59e0b)',    // amber
  error: 'var(--step-error, #ef4444)',        // red
  approval_requested: 'var(--step-approval-requested, #f59e0b)', // amber — pending approval
  approval_granted: 'var(--step-approval-granted, #22c55e)',     // green — approved
  approval_denied: 'var(--step-approval-denied, #ef4444)',       // red — denied
};

// ── Functions ─────────────────────────────────────────────────────────

/**
 * Get icon name for a step type.
 * Returns 'step' as the default for unknown types.
 */
export function getStepIcon(type: string): string {
  return STEP_ICONS[type] ?? 'step';
}

/**
 * Get CSS color value for a step status.
 * Returns gray as the default for unknown statuses.
 */
export function getStepColor(status: string): string {
  return STEP_COLORS[status] ?? 'var(--step-skipped, #6b7280)';
}

/**
 * Get CSS color value for a step type (used for left border / icon tinting).
 * Returns gray as the default for unknown types.
 */
export function getStepTypeColor(type: string): string {
  return STEP_TYPE_COLORS[type] ?? 'var(--step-skipped, #6b7280)';
}

/**
 * Format duration in milliseconds to a human-readable string.
 * - <1000ms: "250ms"
 * - 1000-59999ms: "1.2s"
 * - >=60000ms: "2m 30s"
 */
export function formatStepDuration(ms: number): string {
  const whole = Math.floor(ms);
  if (whole < 1000) return `${whole}ms`;
  if (whole < 60000) return `${(whole / 1000).toFixed(1)}s`;
  const minutes = Math.floor(whole / 60000);
  const seconds = Math.floor((whole % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format an ISO timestamp to HH:MM:SS (UTC).
 */
export function formatStepTimestamp(timestamp: string): string {
  const d = new Date(timestamp);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * Returns a human-readable category for a step.
 */
export function categorizeStep(step: AgentStep): string {
  const categories: Record<string, string> = {
    thinking: 'Reasoning',
    tool: 'Tool Use',
    search: 'Search',
    web: 'Web',
    writing: 'Writing',
    error: 'Error',
    approval_requested: 'Approval Requested',
    approval_granted: 'Approved',
    approval_denied: 'Denied',
  };
  return categories[step.type] ?? 'Other';
}

/**
 * Merge a new or updated step into an existing steps array.
 * If a step with the same id exists, it is replaced in-place (preserving order).
 * Otherwise the new step is appended.
 */
export function mergeStep(steps: AgentStep[], newStep: AgentStep): AgentStep[] {
  const idx = steps.findIndex((s) => s.id === newStep.id);
  if (idx >= 0) {
    const next = [...steps];
    next[idx] = newStep;
    return next;
  }
  return [...steps, newStep];
}

/**
 * Filter steps by type and/or status.
 * Empty or undefined arrays mean "no filter" (show all).
 */
export function filterSteps(steps: AgentStep[], filter: StepFilter): AgentStep[] {
  return steps.filter((step) => {
    if (filter.types && filter.types.length > 0) {
      if (!filter.types.includes(step.type)) return false;
    }
    if (filter.statuses && filter.statuses.length > 0) {
      if (!filter.statuses.includes(step.status)) return false;
    }
    return true;
  });
}
