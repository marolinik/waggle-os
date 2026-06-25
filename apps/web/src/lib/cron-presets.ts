/**
 * Cron schedule presets + human-readable summary helper (M-44 / P26).
 *
 * The /api/cron create endpoint requires both a `cronExpr` and a
 * `jobType` from the CronJobType union. Raw cron syntax is intimidating
 * and historically the client shipped neither correctly (schedule field
 * + no jobType), so this module provides:
 *   - Named cron-expression presets covering the most-common cadences.
 *   - A jobType catalog with human-facing labels and descriptions.
 *   - A cheap cron→English summariser for the preset expressions; when
 *     the user types a custom expression, the summariser returns
 *     "Custom schedule" so we don't mislead.
 */

export type CronJobType =
  | 'agent_task'
  | 'memory_consolidation'
  | 'workspace_health'
  | 'proactive'
  | 'prompt_optimization'
  | 'monthly_assessment';

export interface CronSchedulePreset {
  id: string;
  label: string;
  cronExpr: string;
  /** What the preset means in plain English (for the form hint + summary). */
  summary: string;
}

export interface CronJobTypeOption {
  id: CronJobType;
  label: string;
  description: string;
}

/** Cron preset list, keyed by human-recognisable cadence. */
export const CRON_SCHEDULE_PRESETS: readonly CronSchedulePreset[] = [
  { id: 'daily-9am', label: 'Daily at 9:00 AM', cronExpr: '0 9 * * *', summary: 'Every day at 9:00 AM' },
  { id: 'daily-6pm', label: 'Daily at 6:00 PM', cronExpr: '0 18 * * *', summary: 'Every day at 6:00 PM' },
  { id: 'weekday-9am', label: 'Weekdays at 9:00 AM', cronExpr: '0 9 * * 1-5', summary: 'Mon–Fri at 9:00 AM' },
  { id: 'weekly-mon-9am', label: 'Mondays at 9:00 AM', cronExpr: '0 9 * * 1', summary: 'Every Monday at 9:00 AM' },
  { id: 'monthly-1st-9am', label: 'Monthly (1st at 9:00 AM)', cronExpr: '0 9 1 * *', summary: 'First of the month at 9:00 AM' },
  { id: 'hourly', label: 'Every hour', cronExpr: '0 * * * *', summary: 'Every hour on the hour' },
] as const;

/** Job type catalog with user-facing copy. */
export const CRON_JOB_TYPES: readonly CronJobTypeOption[] = [
  {
    id: 'memory_consolidation',
    label: 'Consolidate memory',
    description: 'Summarise new frames + prune duplicates. Recommended daily.',
  },
  {
    id: 'workspace_health',
    label: 'Workspace health check',
    description: 'Surface stale sessions, broken connectors, or quota warnings.',
  },
  {
    id: 'agent_task',
    label: 'Run an agent task',
    description: 'Kick off a sub-agent with a saved prompt at this schedule.',
  },
  {
    id: 'proactive',
    label: 'Proactive briefing',
    description: 'Generate a short "what changed" digest to nudge attention.',
  },
  {
    id: 'prompt_optimization',
    label: 'Optimise agent prompts',
    description: 'Run the evolution loop over recent traces; deploy any wins.',
  },
  {
    id: 'monthly_assessment',
    label: 'Monthly assessment',
    description: 'Longer-form review: memory growth, entity coverage, goal progress.',
  },
] as const;

export const DEFAULT_CRON_PRESET_ID = 'daily-9am';
export const DEFAULT_CRON_JOB_TYPE: CronJobType = 'memory_consolidation';

/** Map a preset id back to its preset row. */
export function getCronPreset(id: string): CronSchedulePreset | undefined {
  return CRON_SCHEDULE_PRESETS.find(p => p.id === id);
}

/** Map a cronExpr back to a preset row if one matches exactly. */
export function presetForExpr(cronExpr: string): CronSchedulePreset | undefined {
  const trimmed = cronExpr.trim().replace(/\s+/g, ' ');
  return CRON_SCHEDULE_PRESETS.find(p => p.cronExpr === trimmed);
}

/**
 * Short English summary for the preview text under the schedule input.
 * Returns the matching preset's summary when the expression hits one
 * exactly, or a generic "Custom schedule: <expr>" when it doesn't. The
 * summary is advisory only — server-side evaluation remains the source
 * of truth for what actually runs.
 */
export function describeCronExpr(cronExpr: string): string {
  const preset = presetForExpr(cronExpr);
  if (preset) return preset.summary;
  const trimmed = cronExpr.trim();
  if (!trimmed) return 'No schedule set';
  if (!isPlausibleCronExpr(trimmed)) return `Not a valid cron expression (expected 5 fields)`;
  return humanizeCron(trimmed) ?? `Custom schedule: ${trimmed}`;
}

const CRON_DOW = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

function formatCronTime(min: string, hour: string): string | null {
  if (!/^\d+$/.test(min) || !/^\d+$/.test(hour)) return null;
  const h = Number(hour);
  const m = Number(min);
  if (h > 23 || m > 59) return null;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function ordinal(d: number): string {
  if (d % 10 === 1 && d !== 11) return `${d}st`;
  if (d % 10 === 2 && d !== 12) return `${d}nd`;
  if (d % 10 === 3 && d !== 13) return `${d}rd`;
  return `${d}th`;
}

/**
 * Humanise common cron expressions to plain English ("Mondays at 10:00 AM",
 * "Every day at 5:00 AM", "Every 15 minutes"). No external dependency — covers
 * the cases the scheduler actually produces; returns null for anything it can't
 * describe confidently, so describeCronExpr falls back to "Custom schedule".
 */
export function humanizeCron(cronExpr: string): string | null {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, mon, dow] = parts;
  const allDate = dom === '*' && mon === '*' && dow === '*';

  // Every N minutes
  const everyMin = min.match(/^\*\/(\d+)$/);
  if (everyMin && hour === '*' && allDate) return `Every ${everyMin[1]} minutes`;
  // Every hour at :MM
  if (/^\d+$/.test(min) && hour === '*' && allDate) {
    return `Every hour at :${String(Number(min)).padStart(2, '0')}`;
  }

  const time = formatCronTime(min, hour);
  if (!time) return null;

  // Daily
  if (allDate) return `Every day at ${time}`;
  // Weekly (one or more days of week), any month
  if (dom === '*' && mon === '*' && /^[0-6](,[0-6])*$/.test(dow)) {
    const days = dow.split(',').map((d) => CRON_DOW[Number(d)]);
    const phrase =
      days.length === 1 ? days[0]
      : days.length === 2 ? `${days[0]} and ${days[1]}`
      : `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`;
    return `${phrase} at ${time}`;
  }
  // Monthly on a fixed day-of-month, any month
  if (/^\d+$/.test(dom) && Number(dom) >= 1 && Number(dom) <= 31 && mon === '*' && dow === '*') {
    return `On the ${ordinal(Number(dom))} of every month at ${time}`;
  }
  return null;
}

/**
 * Very-surface-level plausibility check — 5 whitespace-separated
 * non-empty fields. The server's validator is authoritative; this
 * only exists to label the UI preview honestly when the user is
 * mid-edit and the expression can't yet match a preset.
 */
export function isPlausibleCronExpr(cronExpr: string): boolean {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  return parts.every(p => p.length > 0);
}
