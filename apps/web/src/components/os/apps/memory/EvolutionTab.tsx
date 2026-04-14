/**
 * EvolutionTab — browse, review, and act on self-evolution proposals.
 *
 * Reads from GET /api/evolution/runs + /status, acts via
 * POST /api/evolution/runs/:uuid/accept|reject. The /run trigger is
 * surfaced but requires a baseline and schema — for now we only show
 * it enabled when there are zero proposals and offer a preset for
 * common sections (persona + behavioral-spec).
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, Loader2, RefreshCw, Check, X as XIcon,
  ChevronRight, FileDiff, TrendingUp, TrendingDown,
  AlertTriangle, Ban, CheckCircle2, Clock, Zap,
} from 'lucide-react';
import { adapter } from '@/lib/adapter';

// ── Types ─────────────────────────────────────────────────────────

type RunStatus = 'proposed' | 'accepted' | 'rejected' | 'deployed' | 'failed';

interface EvolutionRun {
  id: number;
  run_uuid: string;
  target_kind: string;
  target_name: string | null;
  baseline_text: string;
  winner_text: string;
  winner_schema_json?: string | null;
  delta_accuracy: number;
  gate_verdict: 'pass' | 'fail' | 'warn';
  gate_reasons_json: string;
  artifacts_json?: string | null;
  status: RunStatus;
  user_note?: string | null;
  failure_reason?: string | null;
  created_at: string;
  resolved_at?: string | null;
}

interface RunDetail extends EvolutionRun {
  winnerSchema: unknown;
  artifacts: unknown;
  gateReasons: { gate: string; verdict: string; reason?: string }[];
}

interface StatusCounts {
  counts: Record<RunStatus, number>;
  pendingCount: number;
}

// ── Presentation helpers ──────────────────────────────────────────

const STATUS_COLORS: Record<RunStatus, string> = {
  proposed: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  accepted: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  rejected: 'bg-muted/40 text-muted-foreground border-border/50',
  deployed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  failed: 'bg-destructive/20 text-destructive border-destructive/30',
};

const STATUS_ICONS: Record<RunStatus, React.ReactNode> = {
  proposed: <Clock className="w-3 h-3" />,
  accepted: <Check className="w-3 h-3" />,
  rejected: <Ban className="w-3 h-3" />,
  deployed: <CheckCircle2 className="w-3 h-3" />,
  failed: <AlertTriangle className="w-3 h-3" />,
};

const STATUS_ORDER: RunStatus[] = ['proposed', 'accepted', 'deployed', 'rejected', 'failed'];

function formatDelta(delta: number): string {
  const sign = delta > 0 ? '+' : '';
  return `${sign}${(delta * 100).toFixed(1)}pp`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

// ── Main component ───────────────────────────────────────────────

export default function EvolutionTab() {
  const [runs, setRuns] = useState<EvolutionRun[]>([]);
  const [status, setStatus] = useState<StatusCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RunStatus | 'all'>('proposed');
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionInFlight, setActionInFlight] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // ── Data loaders ───────────────────────────────────────────────

  const loadRuns = useCallback(async () => {
    try {
      const url = filter === 'all'
        ? '/api/evolution/runs?limit=100'
        : `/api/evolution/runs?status=${filter}&limit=100`;
      const res = await adapter.fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setRuns(body.runs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load runs');
    }
  }, [filter]);

  const loadStatus = useCallback(async () => {
    try {
      const res = await adapter.fetch('/api/evolution/status');
      if (res.ok) setStatus(await res.json());
    } catch { /* non-fatal */ }
  }, []);

  const loadDetail = useCallback(async (uuid: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const res = await adapter.fetch(`/api/evolution/runs/${uuid}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDetail(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load detail');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadRuns(), loadStatus()]).finally(() => setLoading(false));
  }, [loadRuns, loadStatus]);

  // Refresh when a run is selected to pick up status changes from elsewhere.
  useEffect(() => {
    if (selectedUuid) loadDetail(selectedUuid);
    else setDetail(null);
  }, [selectedUuid, loadDetail]);

  // Poll every 30s in the background so the list stays current.
  useEffect(() => {
    const t = setInterval(() => {
      loadRuns();
      loadStatus();
    }, 30_000);
    return () => clearInterval(t);
  }, [loadRuns, loadStatus]);

  // ── Actions ────────────────────────────────────────────────────

  const handleAccept = async () => {
    if (!selectedUuid || actionInFlight) return;
    setActionInFlight(true);
    setError(null);
    try {
      const res = await adapter.fetch(`/api/evolution/runs/${selectedUuid}/accept`, {
        method: 'POST',
        body: JSON.stringify({ note: noteText || undefined }),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error ?? `Accept failed (HTTP ${res.status})`);
      }
      setNoteText('');
      await Promise.all([loadDetail(selectedUuid), loadRuns(), loadStatus()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Accept failed');
    } finally {
      setActionInFlight(false);
    }
  };

  const handleReject = async () => {
    if (!selectedUuid || actionInFlight) return;
    setActionInFlight(true);
    setError(null);
    try {
      const res = await adapter.fetch(`/api/evolution/runs/${selectedUuid}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: noteText || undefined }),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.error ?? `Reject failed (HTTP ${res.status})`);
      }
      setNoteText('');
      await Promise.all([loadDetail(selectedUuid), loadRuns(), loadStatus()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setActionInFlight(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([loadRuns(), loadStatus()]);
    if (selectedUuid) await loadDetail(selectedUuid);
    setLoading(false);
  };

  // ── Render ─────────────────────────────────────────────────────

  const pendingCount = status?.pendingCount ?? 0;

  return (
    <div className="flex h-full">
      {/* Left: filter + list */}
      <div className="w-64 border-r border-border/50 flex flex-col shrink-0">
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-border/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <h3 className="text-xs font-display font-semibold text-foreground">Evolution</h3>
            </div>
            <button
              onClick={handleRefresh}
              className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh"
              disabled={loading}
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {pendingCount > 0 && (
            <div className="mb-2 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20">
              <p className="text-[11px] text-amber-400 font-display">
                {pendingCount} proposal{pendingCount !== 1 ? 's' : ''} awaiting review
              </p>
            </div>
          )}

          {/* Filter chips */}
          <div className="flex flex-wrap gap-1">
            <FilterChip
              label="all"
              active={filter === 'all'}
              count={status ? Object.values(status.counts).reduce((a, b) => a + b, 0) : undefined}
              onClick={() => setFilter('all')}
            />
            {STATUS_ORDER.map(s => (
              <FilterChip
                key={s}
                label={s}
                active={filter === s}
                count={status?.counts[s]}
                onClick={() => setFilter(s)}
              />
            ))}
          </div>
        </div>

        {/* Run list */}
        <div className="flex-1 overflow-auto p-1.5 space-y-1">
          {loading && runs.length === 0 ? (
            <div className="text-center py-8">
              <Loader2 className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2 animate-spin" />
              <p className="text-xs text-muted-foreground">Loading runs…</p>
            </div>
          ) : runs.length === 0 ? (
            <div className="text-center py-8">
              <Sparkles className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No runs {filter === 'all' ? 'yet' : `in ${filter}`}</p>
              {filter === 'all' && (
                <p className="text-[11px] text-muted-foreground/60 mt-2 px-2">
                  Proposals appear here as Waggle evolves its own prompts from your traces.
                </p>
              )}
            </div>
          ) : (
            runs.map(run => (
              <RunRow
                key={run.run_uuid}
                run={run}
                selected={selectedUuid === run.run_uuid}
                onSelect={() => setSelectedUuid(run.run_uuid)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 overflow-auto">
        {detailLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : detail ? (
          <RunDetailView
            detail={detail}
            actionInFlight={actionInFlight}
            error={error}
            noteText={noteText}
            onNoteChange={setNoteText}
            onAccept={handleAccept}
            onReject={handleReject}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Sparkles className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">Select a run to review</p>
            <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
              Each run shows the baseline vs winner, which gates fired, and lets you accept or reject the proposal.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Filter chip ───────────────────────────────────────────────────

interface FilterChipProps {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}

function FilterChip({ label, active, count, onClick }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={`px-1.5 py-0.5 rounded text-[10px] font-display transition-colors ${
        active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
      {typeof count === 'number' && count > 0 && (
        <span className="ml-1 opacity-70">{count}</span>
      )}
    </button>
  );
}

// ── Run row ───────────────────────────────────────────────────────

interface RunRowProps {
  run: EvolutionRun;
  selected: boolean;
  onSelect: () => void;
}

function RunRow({ run, selected, onSelect }: RunRowProps) {
  const deltaPositive = run.delta_accuracy > 0;
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-2 rounded-lg transition-colors ${
        selected ? 'bg-primary/20 border border-primary/30' : 'hover:bg-muted/50 border border-transparent'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] ${STATUS_COLORS[run.status]}`}>
          {STATUS_ICONS[run.status]} {run.status}
        </span>
        <span className={`ml-auto text-[11px] font-mono ${deltaPositive ? 'text-emerald-400' : 'text-muted-foreground'}`}>
          {deltaPositive ? <TrendingUp className="w-2.5 h-2.5 inline mr-0.5" /> : <TrendingDown className="w-2.5 h-2.5 inline mr-0.5" />}
          {formatDelta(run.delta_accuracy)}
        </span>
      </div>
      <p className="text-xs text-foreground font-display truncate">
        {run.target_name ?? '(no target)'}
      </p>
      <div className="flex items-center justify-between mt-0.5 text-[11px] text-muted-foreground">
        <span className="truncate">{run.target_kind}</span>
        <span className="shrink-0">{formatDate(run.created_at)}</span>
      </div>
    </button>
  );
}

// ── Run detail view ───────────────────────────────────────────────

interface RunDetailViewProps {
  detail: RunDetail;
  actionInFlight: boolean;
  error: string | null;
  noteText: string;
  onNoteChange: (v: string) => void;
  onAccept: () => void;
  onReject: () => void;
}

function RunDetailView({
  detail, actionInFlight, error, noteText, onNoteChange, onAccept, onReject,
}: RunDetailViewProps) {
  const canAct = detail.status === 'proposed';

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] ${STATUS_COLORS[detail.status]}`}>
            {STATUS_ICONS[detail.status]} {detail.status}
          </span>
          <span className="text-[11px] font-mono text-muted-foreground">
            {formatDelta(detail.delta_accuracy)} delta
          </span>
          <span className="ml-auto text-[11px] text-muted-foreground">{formatDate(detail.created_at)}</span>
        </div>
        <h2 className="text-sm font-display font-semibold text-foreground">
          {detail.target_name ?? '(no target)'}
        </h2>
        <p className="text-[11px] text-muted-foreground font-mono">{detail.target_kind}</p>
        {detail.failure_reason && (
          <p className="text-[11px] text-destructive mt-1 font-mono">
            {detail.failure_reason}
          </p>
        )}
        {detail.user_note && (
          <p className="text-[11px] text-muted-foreground mt-1 italic">Note: “{detail.user_note}”</p>
        )}
      </div>

      {/* Diff */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <FileDiff className="w-3 h-3 text-primary" />
          <p className="text-[11px] font-display font-medium text-foreground">Baseline vs Winner</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <TextPane title="Baseline" text={detail.baseline_text} tone="muted" />
          <TextPane title="Winner" text={detail.winner_text} tone="primary" />
        </div>
      </div>

      {/* Gates */}
      <div>
        <p className="text-[11px] font-display font-medium text-foreground mb-1.5">
          Gates <span className="ml-1 font-mono opacity-60">{detail.gate_verdict}</span>
        </p>
        <div className="rounded-lg border border-border/30 divide-y divide-border/20">
          {detail.gateReasons.length === 0 ? (
            <p className="text-[11px] text-muted-foreground p-2">No gates recorded.</p>
          ) : (
            detail.gateReasons.map((g, i) => (
              <GateRow key={i} gate={g} />
            ))
          )}
        </div>
      </div>

      {/* Artifacts */}
      {detail.artifacts ? (
        <div>
          <p className="text-[11px] font-display font-medium text-foreground mb-1.5">Artifacts</p>
          <pre className="text-[11px] text-muted-foreground bg-muted/20 rounded-lg p-2 overflow-x-auto">
            {JSON.stringify(detail.artifacts, null, 2)}
          </pre>
        </div>
      ) : null}

      {/* Action bar */}
      {canAct && (
        <div className="pt-3 border-t border-border/30">
          <label className="block text-[11px] text-muted-foreground mb-1 font-display">
            Note (optional)
          </label>
          <textarea
            value={noteText}
            onChange={e => onNoteChange(e.target.value)}
            rows={2}
            placeholder="Why are you accepting / rejecting this?"
            className="w-full bg-muted/30 border border-border/40 rounded-md px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={actionInFlight}
          />
          {error && (
            <p className="text-[11px] text-destructive mt-1 font-mono">{error}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={onAccept}
              disabled={actionInFlight}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50 font-display"
            >
              {actionInFlight ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Accept & Deploy
            </button>
            <button
              onClick={onReject}
              disabled={actionInFlight}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50 font-display"
            >
              <XIcon className="w-3 h-3" />
              Reject
            </button>
            <span className="ml-auto text-[10px] text-muted-foreground font-mono flex items-center gap-1">
              <Zap className="w-2.5 h-2.5" />
              Accepting writes an override file and hot-reloads the spec
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────

interface TextPaneProps {
  title: string;
  text: string;
  tone: 'muted' | 'primary';
}

function TextPane({ title, text, tone }: TextPaneProps) {
  const border = tone === 'primary' ? 'border-primary/30' : 'border-border/30';
  return (
    <div className={`rounded-lg border ${border} bg-muted/20 p-2`}>
      <p className="text-[10px] uppercase tracking-wider font-display text-muted-foreground mb-1">
        {title}
      </p>
      <pre className="text-[11px] text-foreground whitespace-pre-wrap font-mono max-h-60 overflow-auto">
        {text}
      </pre>
    </div>
  );
}

interface GateRowProps {
  gate: { gate: string; verdict: string; reason?: string };
}

function GateRow({ gate }: GateRowProps) {
  const verdictColors: Record<string, string> = {
    pass: 'text-emerald-400',
    warn: 'text-amber-400',
    fail: 'text-destructive',
  };
  return (
    <div className="flex items-start gap-2 p-2 text-[11px]">
      <ChevronRight className={`w-3 h-3 mt-0.5 shrink-0 ${verdictColors[gate.verdict] ?? 'text-muted-foreground'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-foreground font-mono">
          {gate.gate}
          <span className={`ml-1.5 uppercase tracking-wide ${verdictColors[gate.verdict] ?? 'text-muted-foreground'}`}>
            {gate.verdict}
          </span>
        </p>
        {gate.reason && (
          <p className="text-muted-foreground mt-0.5 break-words">{gate.reason}</p>
        )}
      </div>
    </div>
  );
}
