import { Play, Trash2, Loader2, ToggleLeft, ToggleRight, ScrollText, Pencil } from 'lucide-react';
import type { Automation } from '@waggle/shared';
import type { AutomationLog } from '@/lib/types';
import { StatusBadge } from '@/components/ui/status-badge';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { AUTOMATION_STATE_META, deriveAutomationStatus, describeTrigger } from '@/lib/automation-display';
import { DATE_LOCALE } from '@/lib/date-locale';

/**
 * Automation list row (UX-Refactor Phase 3B, S11 — the "AutomationRunRow" DS
 * variant). PRD §12.10 fields: name, trigger, condition (C25 advisory),
 * schedule, status (§14.6 badge) + the Center actions: run now, pause/enable,
 * edit, view logs, delete.
 */
interface AutomationRowProps {
  automation: Automation;
  /** Latest execution log when loaded — drives the Failed state (§14.6). */
  lastLog?: AutomationLog | null;
  runningNow?: boolean;
  busy?: boolean;
  onToggle: (a: Automation) => void;
  onRunNow: (a: Automation) => void;
  onLogs: (a: Automation) => void;
  onEdit: (a: Automation) => void;
  onDelete: (a: Automation) => void;
}

const AutomationRow = ({ automation: a, lastLog, runningNow, busy, onToggle, onRunNow, onLogs, onEdit, onDelete }: AutomationRowProps) => {
  const enabled = a.status === 'active' || a.status === 'running';
  const status = deriveAutomationStatus(a, lastLog, runningNow);
  const meta = AUTOMATION_STATE_META[status];
  const manual = a.triggerType === 'manual';

  return (
    <li className="flex items-center gap-3 p-3 rounded-xl border border-border/30 bg-secondary/20" data-testid="automation-row">
      <HintTooltip content={manual ? 'Manual automations stay off — they only run via "Run now"' : (enabled ? 'Pause' : 'Enable')}>
        <button onClick={() => onToggle(a)} disabled={busy || manual} className="shrink-0 disabled:opacity-40" aria-label={enabled ? `Pause ${a.name}` : `Enable ${a.name}`}>
          {enabled
            ? <ToggleRight className="w-5 h-5 text-emerald-400" />
            : <ToggleLeft className="w-5 h-5 text-muted-foreground" />
          }
        </button>
      </HintTooltip>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={`text-sm font-display truncate ${enabled || manual ? 'text-foreground' : 'text-muted-foreground'}`}>{a.name}</p>
          {manual && <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted/50 text-muted-foreground shrink-0">Manual</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[11px] text-muted-foreground">{describeTrigger(a)}</span>
          {a.lastRun && <span className="text-[11px] text-muted-foreground/60">Last: {new Date(a.lastRun).toLocaleDateString(DATE_LOCALE)}</span>}
          {a.nextRun && enabled && <span className="text-[11px] text-muted-foreground/60">Next: {new Date(a.nextRun).toLocaleString(DATE_LOCALE)}</span>}
        </div>
        {a.condition && (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate" title={a.condition}>
            Condition (advisory): {a.condition}
          </p>
        )}
      </div>
      <StatusBadge tone={meta.tone} label={meta.label} />
      <HintTooltip content="Run now">
        <button
          onClick={() => onRunNow(a)}
          disabled={busy || runningNow}
          aria-label={`Run ${a.name} now`}
          className="p-1.5 rounded-lg text-honey hover:bg-primary/10 transition-colors disabled:opacity-50"
        >
          {runningNow ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
        </button>
      </HintTooltip>
      <HintTooltip content="View logs">
        <button onClick={() => onLogs(a)} aria-label={`View logs for ${a.name}`} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
          <ScrollText className="w-3.5 h-3.5" />
        </button>
      </HintTooltip>
      <HintTooltip content="Edit">
        <button onClick={() => onEdit(a)} aria-label={`Edit ${a.name}`} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </HintTooltip>
      <HintTooltip content="Delete">
        <button onClick={() => onDelete(a)} aria-label={`Delete ${a.name}`} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </HintTooltip>
    </li>
  );
};

export default AutomationRow;
