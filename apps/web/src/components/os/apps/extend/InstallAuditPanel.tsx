/**
 * InstallAuditPanel — the ONE shared install-audit feed (UX-Refactor Phase 4B,
 * C18). Reads `GET /api/extend/audit` via `adapter.getExtendAudit` and renders
 * the camelCased entries the server emits. Consumed by:
 *  - S07 Connector Hub (type='connector', optionally per-capability history)
 *  - S08 MCP Hub      (type='mcp')
 *  - S21 Marketplace  (no fixed type + the type filter select)
 *  - S06 Skills Hub   (Audit tab)
 */
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ShieldAlert, X } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { RISK_LABELS, RISK_TEXT_CLASSES, isKnownRiskLevel } from '@/lib/risk-display';

export type ExtendAuditType = 'skill' | 'plugin' | 'mcp' | 'connector' | 'marketplace' | 'native';

const AUDIT_TYPE_OPTIONS: Array<ExtendAuditType | 'all'> = [
  'all', 'skill', 'plugin', 'mcp', 'connector', 'marketplace', 'native',
];

export interface ExtendAuditEntry {
  id: number;
  timestamp: string;
  capabilityName: string;
  capabilityType: string;
  source: string;
  riskLevel: string;
  trustSource: string;
  approvalClass: string;
  action: string;
  initiator: string;
  detail?: string;
}

/** Defensive normalization — the adapter returns unknown[]. */
export function normalizeAuditEntry(raw: unknown): ExtendAuditEntry {
  const e = (raw ?? {}) as Record<string, unknown>;
  return {
    id: Number(e.id ?? 0),
    timestamp: String(e.timestamp ?? ''),
    capabilityName: String(e.capabilityName ?? e.name ?? 'unknown'),
    capabilityType: String(e.capabilityType ?? 'unknown'),
    source: String(e.source ?? 'unknown'),
    riskLevel: String(e.riskLevel ?? 'unknown'),
    trustSource: String(e.trustSource ?? 'unknown'),
    approvalClass: String(e.approvalClass ?? 'standard'),
    action: String(e.action ?? e.outcome ?? 'unknown'),
    initiator: String(e.initiator ?? 'user'),
    ...(e.detail != null ? { detail: String(e.detail) } : {}),
  };
}

const POSITIVE_ACTIONS = new Set(['installed', 'approved']);
const NEGATIVE_ACTIONS = new Set(['blocked', 'rejected', 'failed', 'uninstalled']);

interface InstallAuditPanelProps {
  /** Fixed capability-type filter; omit to show every type + a filter select. */
  type?: ExtendAuditType;
  /** Scope the feed to one capability name (per-connector/MCP history). */
  capability?: string;
  limit?: number;
  /** Show the type filter select (S21). Ignored when `type` is fixed. */
  showFilter?: boolean;
}

const InstallAuditPanel = ({ type, capability, limit = 20, showFilter = false }: InstallAuditPanelProps) => {
  const [entries, setEntries] = useState<ExtendAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<ExtendAuditType | 'all'>(type ?? 'all');

  const effectiveType = type ?? (typeFilter === 'all' ? undefined : typeFilter);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await adapter.getExtendAudit({
        ...(effectiveType ? { type: effectiveType } : {}),
        ...(capability ? { capability } : {}),
        limit,
      });
      setEntries(rows.map(normalizeAuditEntry));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit history');
    } finally {
      setLoading(false);
    }
  }, [effectiveType, capability, limit]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-6" role="status" aria-live="polite">
        <Loader2 className="w-4 h-4 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="text-center py-6">
        <p className="text-xs text-destructive mb-2">{error}</p>
        <button onClick={() => void load()} className="text-xs text-primary hover:underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5" data-testid="install-audit-panel">
      {!type && showFilter && (
        <div className="flex items-center gap-2 mb-2">
          <label htmlFor="audit-type-filter" className="text-[11px] text-muted-foreground">Type</label>
          <select
            id="audit-type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ExtendAuditType | 'all')}
            className="text-[11px] bg-muted/50 border border-border/40 rounded-md px-1.5 py-0.5 text-foreground"
          >
            {AUDIT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No install history yet.</p>
      ) : (
        entries.map(entry => {
          const positive = POSITIVE_ACTIONS.has(entry.action);
          const negative = NEGATIVE_ACTIONS.has(entry.action);
          return (
            <div key={`${entry.id}-${entry.timestamp}`} className="flex items-start gap-3 p-2 rounded-lg bg-secondary/30 border border-border/30">
              {positive
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                : negative
                  ? <X className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                  : <ShieldAlert className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-foreground font-display truncate">{entry.capabilityName}</span>
                  <span className="text-[10px] px-1 py-px rounded bg-muted/60 text-muted-foreground">{entry.capabilityType}</span>
                  <span className="text-[10px] text-muted-foreground">{entry.action}</span>
                  {/* P7/D15 A7 (#16): render the audit-feed risk with the same
                      label + colour the approval surfaces use when it's a known
                      level; pass an 'unknown' raw value through unstyled. */}
                  <span className="text-[10px] text-muted-foreground">
                    risk: {isKnownRiskLevel(entry.riskLevel)
                      ? <span className={RISK_TEXT_CLASSES[entry.riskLevel]}>{RISK_LABELS[entry.riskLevel]}</span>
                      : entry.riskLevel}
                  </span>
                </div>
                {entry.detail && <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{entry.detail}</p>}
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : ''}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
};

export default InstallAuditPanel;
