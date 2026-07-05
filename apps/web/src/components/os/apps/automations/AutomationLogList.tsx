import { Loader2 } from 'lucide-react';
import type { AutomationLog } from '@/lib/types';
import { StatusBadge } from '@/components/ui/status-badge';
import { DATE_LOCALE } from '@/lib/date-locale';

/**
 * Execution-history rows (UX-Refactor Phase 3B, S11 — History/Logs tabs).
 * Data = cron_execution_history via GET /api/automations/:id/logs: executedAt,
 * durationMs, success, resultSummary/error. C27: the caller derives
 * success-rate from these rows.
 */
export interface NamedLog extends AutomationLog {
  /** Owning automation's name — shown on the merged History tab. */
  automationName?: string;
}

interface AutomationLogListProps {
  logs: NamedLog[];
  loading?: boolean;
  error?: string | null;
  emptyText?: string;
}

const AutomationLogList = ({ logs, loading, error, emptyText }: AutomationLogListProps) => {
  if (loading) {
    return (
      <div role="status" aria-live="polite" className="text-center py-8">
        <Loader2 className="w-5 h-5 text-muted-foreground/40 mx-auto animate-spin" />
        <p className="text-xs text-muted-foreground mt-2">Loading run history…</p>
      </div>
    );
  }
  if (error) {
    return <p role="alert" className="text-xs text-destructive text-center py-8">{error}</p>;
  }
  if (logs.length === 0) {
    return <p role="status" className="text-xs text-muted-foreground text-center py-8">{emptyText ?? 'No runs recorded yet.'}</p>;
  }
  return (
    <ul className="space-y-1">
      {logs.map((l) => (
        <li key={`${l.automationName ?? ''}-${l.id}`} className="flex items-center gap-2.5 rounded-lg border border-border/40 bg-card/40 px-2.5 py-1.5" data-testid="automation-log-row">
          <StatusBadge tone={l.success ? 'healthy' : 'risk'} label={l.success ? 'Success' : 'Failed'} />
          <span className="flex-1 min-w-0">
            <span className="block text-[11px] text-foreground truncate">
              {l.automationName ? `${l.automationName} — ` : ''}{l.success ? (l.resultSummary ?? 'Completed') : (l.error ?? 'Failed')}
            </span>
            <span className="block text-[10px] text-muted-foreground">
              {new Date(l.executedAt).toLocaleString(DATE_LOCALE)}
              {typeof l.durationMs === 'number' ? ` · ${(l.durationMs / 1000).toFixed(1)}s` : ''}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
};

export default AutomationLogList;
