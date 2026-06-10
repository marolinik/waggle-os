/**
 * Automation Center display vocabulary (UX-Refactor Phase 3B, S11).
 *
 * Pure functions only — tested in lib/automation-display.test.ts.
 *  - PRD §14.6: the FULL automation state vocabulary maps to a StatusBadge
 *    tone + label (exhaustive Record). At runtime only the states derivable
 *    from the cron surface appear (see deriveAutomationStatus); the others
 *    ('draft', 'awaiting_approval', …) are reachable from the Builder/test
 *    flows and stay in the map so every state renders consistently.
 *  - C27: success-rate derives from cron_execution_history log rows,
 *    client-side. No "hours saved" (no data source).
 *  - C24/C25: trigger description is schedule-only v1 + manual; condition
 *    is advisory text.
 */
import type { Automation } from '@waggle/shared';
import type { AutomationLog } from '@/lib/types';
import type { StatusTone } from '@/components/ui/status-badge';
import { describeCronExpr } from '@/lib/cron-presets';

/** PRD §14.6 vocabulary (FE-derived — never stored). */
export type AutomationViewStatus =
  | 'draft' | 'scheduled' | 'running' | 'success' | 'failed'
  | 'paused' | 'awaiting_approval' | 'disabled';

export const AUTOMATION_STATE_META: Record<AutomationViewStatus, { label: string; tone: StatusTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  running: { label: 'Running', tone: 'info' },
  success: { label: 'Success', tone: 'healthy' },
  failed: { label: 'Failed', tone: 'risk' },
  paused: { label: 'Paused', tone: 'attention' },
  awaiting_approval: { label: 'Awaiting approval', tone: 'attention' },
  disabled: { label: 'Disabled', tone: 'neutral' },
};

/**
 * Derive the §14.6 badge state from what the cron surface exposes: the row's
 * server status + the latest execution log when loaded + a local in-flight
 * "Run now" flag. Precedence: local in-flight run > failing latest log >
 * server-marked 'failed'/'running' (kept even when the log fetch failed) >
 * enabled ('active') → 'scheduled' > everything else → 'paused'.
 * Manual-trigger automations are stored disabled, so they read 'paused' —
 * callers pair that with the 'Manual' trigger chip.
 */
export function deriveAutomationStatus(
  a: Pick<Automation, 'status'>,
  lastLog?: AutomationLog | null,
  runningNow?: boolean,
): AutomationViewStatus {
  if (runningNow) return 'running';
  if (lastLog && !lastLog.success) return 'failed';
  if (a.status === 'failed') return 'failed';
  if (a.status === 'running') return 'running';
  if (a.status === 'active') return 'scheduled';
  return 'paused';
}

/** C27 math: fraction of successful runs over the loaded log rows. */
export function successRateFromLogs(logs: AutomationLog[]): number | null {
  if (logs.length === 0) return null;
  return logs.filter((l) => l.success).length / logs.length;
}

export function formatRatePercent(rate: number | null): string {
  if (rate === null) return '—';
  return `${Math.round(rate * 100)}%`;
}

/** C24 trigger vocabulary: schedule (cron, humanised) or manual. */
export function describeTrigger(a: Pick<Automation, 'triggerType' | 'schedule'>): string {
  if (a.triggerType === 'manual') return 'Manual — runs only via "Run now"';
  return describeCronExpr(a.schedule ?? '');
}
