/**
 * Knowledge-worker Loop templates — preset, report-only (L1) automations that
 * ride the `job_type:'loop'` executor (packages/server/src/local/loop-executor.ts).
 *
 * Each template is a ready-to-POST automation: a sensible default cadence plus
 * a `jobConfig` matching the executor's LoopSpec ({ prompt, query?, rubric? }).
 * They translate the recurring rhythms of knowledge work — the morning brief,
 * the weekly digest, the "who have I gone quiet on" sweep — into scheduled,
 * memory-grounded reports. All are report-only: a Loop tick generates a report
 * grounded in the workspace's memory and notifies; it never sends, writes, or
 * acts on an external system.
 *
 * Cadences are daily/weekly by design — a Loop is several LLM round-trips, so
 * tight crons are wasteful (the executor also enforces a per-loop cost floor).
 */

export interface LoopTemplate {
  /** Stable id (used as the picker key). */
  id: string;
  /** User-facing title — becomes the automation name. */
  name: string;
  /** One-line description shown in the picker. */
  description: string;
  /** lucide-react icon name for the UI to resolve (falls back gracefully). */
  icon: string;
  /** The knowledge-worker role this rhythm belongs to (picker grouping hint). */
  role: string;
  /** Default cron expression (5-field). Daily/weekly by design. */
  defaultCron: string;
  /** Ready-to-persist loop config — shape matches the executor's LoopSpec. */
  jobConfig: {
    prompt: string;
    query?: string;
    rubric?: string;
  };
}

export const LOOP_TEMPLATES: LoopTemplate[] = [
  {
    id: 'daily-desk-brief',
    name: 'Daily Desk Brief',
    description: 'Each morning, a short brief of what needs your attention today, grounded in this workspace.',
    icon: 'Sunrise',
    role: 'Executive assistant',
    defaultCron: '0 8 * * *',
    jobConfig: {
      prompt:
        'Brief me on what needs my attention today in this workspace. Pull from recent memory: ' +
        'open tasks, commitments I made, threads awaiting a reply, and anything time-sensitive. ' +
        'Lead with the 3 most important items. Be concise.',
      query: 'open tasks commitments awaiting reply deadlines today',
    },
  },
  {
    id: 'weekly-wins',
    name: 'Weekly Wins Digest',
    description: 'A Friday digest of what shipped, closed, or moved this week — ready to share or paste into a status update.',
    icon: 'Trophy',
    role: 'Project manager',
    defaultCron: '0 16 * * 5',
    jobConfig: {
      prompt:
        'Summarise what shipped, closed, or moved forward in this workspace over the past week. ' +
        'Group by theme. Write it as a short status update I could share with my team or manager.',
      query: 'shipped completed closed progress this week milestones',
    },
  },
  {
    id: 'relationship-decay',
    name: 'Relationship Decay Sweep',
    description: 'Weekly: contacts and deals you have gone quiet on, ranked by importance, so nothing slips.',
    icon: 'HeartHandshake',
    role: 'Sales / Account management',
    defaultCron: '0 9 * * 1',
    jobConfig: {
      prompt:
        'From this workspace\'s memory, identify the contacts, accounts, or deals I have gone quiet on. ' +
        'Rank them by importance and how long since the last touch. For each, suggest a one-line reason to reconnect. ' +
        'Report only — do not draft or send anything.',
      query: 'contacts accounts deals last contact follow up gone quiet',
      rubric: 'Reward concrete, specific contacts grounded in memory with a clear last-touch rationale. ' +
        'Penalise vague or invented names.',
    },
  },
  {
    id: 'inbound-triage',
    name: 'Inbound Triage Report',
    description: 'Weekday mornings: classify and summarise new inbound items (requests, leads, tickets) — propose-only.',
    icon: 'Inbox',
    role: 'Support / Operations',
    defaultCron: '0 7 * * 1-5',
    jobConfig: {
      prompt:
        'Triage the new inbound items captured in this workspace since the last run. ' +
        'Classify each (e.g. request, lead, question, FYI), flag anything urgent, and suggest who or what should handle it. ' +
        'This is a report and proposal only — take no action.',
      query: 'new inbound requests tickets leads questions to triage',
    },
  },
  {
    id: 'renewal-radar',
    name: 'Renewal & Expiry Radar',
    description: 'Weekly scan for contracts, licenses, or subscriptions coming up for renewal or expiry.',
    icon: 'CalendarClock',
    role: 'Operations / Legal / Finance',
    defaultCron: '0 9 * * 1',
    jobConfig: {
      prompt:
        'Scan this workspace\'s memory for contracts, licenses, subscriptions, or commitments with an upcoming ' +
        'renewal, expiry, or review date. List them soonest-first with the date and what action they need. ' +
        'If you cannot determine a date, say so rather than guessing.',
      query: 'contract license subscription renewal expiry review date deadline',
    },
  },
  {
    id: 'commitment-tracker',
    name: 'Commitment Tracker',
    description: 'End of each weekday: surface the promises you made ("I\'ll send X by Friday") so none are dropped.',
    icon: 'CheckSquare',
    role: 'Executive assistant',
    defaultCron: '0 17 * * 1-5',
    jobConfig: {
      prompt:
        'Review this workspace\'s recent memory for commitments I made — things I said I would do, send, or follow up on. ' +
        'List each with who it is owed to and any deadline. Flag any that look overdue. Report only.',
      query: 'I will send follow up by promised commitment owe deadline',
    },
  },
  {
    id: 'competitor-watch',
    name: 'Competitor Watch Digest',
    description: 'Weekly: what changed about the competitors and market signals tracked in this workspace.',
    icon: 'Telescope',
    role: 'Marketing / Product',
    defaultCron: '0 9 * * 1',
    jobConfig: {
      prompt:
        'Summarise what is new or changed about the competitors and market signals tracked in this workspace ' +
        'since the previous run. Emphasise concrete, sourced developments. If nothing materially changed, say so.',
      query: 'competitor market signal launch pricing announcement change',
      rubric: 'Reward concrete, novel, sourced items grounded in memory. Penalise speculation or repetition of prior reports.',
    },
  },
];
