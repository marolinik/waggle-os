/**
 * EvolutionTab — browse, review, and act on self-evolution proposals.
 *
 * Reads from GET /api/evolution/runs + /status, acts via
 * POST /api/evolution/runs/:uuid/accept|reject. The "New Run" button
 * opens a modal that POSTs to /api/evolution/run using baseline +
 * default schema pulled from /api/evolution/targets and /baseline.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sparkles, Loader2, RefreshCw, Check, X as XIcon,
  ChevronRight, FileDiff, TrendingUp, TrendingDown,
  AlertTriangle, Ban, CheckCircle2, Clock, Zap, Plus,
  Hexagon, ShieldCheck,
} from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { DATE_LOCALE } from '@/lib/date-locale';
import { HintTooltip } from '@/components/ui/hint-tooltip';

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

/** Matches the orchestrator's EvolutionProgress shape. */
interface EvolutionProgressEvent {
  phase: 'trigger-check' | 'dataset' | 'compose' | 'gates' | 'persist' | 'skipped' | 'done';
  message?: string;
  detail?: unknown;
}

// ── SSE helpers ───────────────────────────────────────────────────

interface SseConsumerCallbacks {
  onProgress: (ev: EvolutionProgressEvent) => void;
  onDone: (payload: { outcome: string; reason?: string; run?: { run_uuid: string } }) => void;
  onError: (message: string) => void;
}

/**
 * Read a `text/event-stream` ReadableStream and dispatch parsed events to
 * the supplied callbacks. Handles multi-line `data:` fields and arbitrary
 * chunk boundaries — the browser may deliver bytes in any-sized chunks.
 */
async function consumeEvolutionSse(
  body: ReadableStream<Uint8Array>,
  cb: SseConsumerCallbacks,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Process all complete events (blank-line-separated) in the buffer.
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      dispatchSseBlock(block, cb);
      boundary = buffer.indexOf('\n\n');
    }
  }

  // Flush any trailing event that didn't end with a blank line.
  if (buffer.trim()) {
    dispatchSseBlock(buffer, cb);
  }
}

function dispatchSseBlock(block: string, cb: SseConsumerCallbacks): void {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return;

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(dataLines.join('\n'));
  } catch {
    // Non-JSON payload — skip for safety.
    return;
  }

  switch (event) {
    case 'progress':
      cb.onProgress(parsed as EvolutionProgressEvent);
      break;
    case 'done':
      cb.onDone(parsed as Parameters<SseConsumerCallbacks['onDone']>[0]);
      break;
    case 'error':
      cb.onError((parsed as { error?: string })?.error ?? 'Evolution run failed');
      break;
    // 'open' and anything else are ignored — pure connectivity signals.
  }
}

// ── Presentation helpers ──────────────────────────────────────────

/**
 * Status pill colors — warm semantic tokens (D21 sweep). proposed=attention
 * (honey), accepted/in-progress=work (dusty blue), deployed=healthy (sage),
 * rejected=neutral, failed=risk (terracotta). Inline style on the consumer
 * because the warm tokens are CSS vars, not Tailwind palette colors.
 */
const STATUS_STYLE: Record<RunStatus, React.CSSProperties> = {
  proposed: { background: 'var(--honey-wash)', color: 'var(--honey)', borderColor: 'var(--honey-line)' },
  accepted: { background: 'var(--work-wash)', color: 'var(--work)', borderColor: 'var(--work)' },
  rejected: { background: 'transparent', color: 'var(--text-muted, hsl(var(--muted-foreground)))', borderColor: 'var(--line-soft)' },
  deployed: { background: 'var(--healthy-wash)', color: 'var(--healthy)', borderColor: 'var(--healthy)' },
  failed: { background: 'var(--risk-wash)', color: 'var(--risk)', borderColor: 'var(--risk)' },
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
  return d.toLocaleDateString(DATE_LOCALE);
}

// ── Skill aggregation (D12 version ladder) ────────────────────────
//
// The backend tracks individual runs; the design (§12·evolution.html) frames
// them as a skill card with a version ladder. We aggregate by
// (target_kind, target_name) — that pair *is* the evolving target — and render
// each group's runs as ascending versions. No backend change: this is a pure
// client-side reframe over the same /api/evolution/runs data.

interface SkillGroup {
  /** Stable key = `${target_kind}::${target_name ?? ''}`. */
  key: string;
  targetKind: string;
  targetName: string | null;
  /** Runs oldest→newest (v1 is the first proposal). */
  versions: EvolutionRun[];
  /** The run that actually shipped (status === 'deployed'), if any. */
  deployed: EvolutionRun | null;
  /** Largest delta_accuracy in the group — drives the score-bar scale. */
  maxDelta: number;
}

function aggregateBySkill(runs: EvolutionRun[]): SkillGroup[] {
  const byKey = new Map<string, EvolutionRun[]>();
  for (const run of runs) {
    const key = `${run.target_kind}::${run.target_name ?? ''}`;
    const list = byKey.get(key);
    if (list) list.push(run);
    else byKey.set(key, [run]);
  }

  const groups: SkillGroup[] = [];
  for (const [key, list] of byKey) {
    // Ascending by created_at so v1 is the earliest proposal.
    const versions = [...list].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const deployed = versions.find(r => r.status === 'deployed') ?? null;
    const maxDelta = versions.reduce((m, r) => Math.max(m, r.delta_accuracy), 0);
    groups.push({
      key,
      targetKind: versions[0].target_kind,
      targetName: versions[0].target_name,
      versions,
      deployed,
      maxDelta,
    });
  }

  // Most-recently-active skills first.
  groups.sort((a, b) => {
    const at = Math.max(...a.versions.map(r => new Date(r.created_at).getTime()));
    const bt = Math.max(...b.versions.map(r => new Date(r.created_at).getTime()));
    return bt - at;
  });
  return groups;
}

/**
 * D13 — honest provenance derivation. The backend does NOT store the
 * "GEPA optimized · judged by 3 models" string, so we never fabricate it.
 * The only verifiable provenance in a run's `gate_reasons` is whether the
 * regression gate (the one that compares candidate-vs-baseline scores) fired
 * and passed — that is the honest, recorded analogue. Returns null when no
 * such gate is present, in which case the badge is omitted entirely.
 */
function deriveProvenance(run: EvolutionRun): string | null {
  if (run.status !== 'deployed') return null;
  let reasons: { gate?: string; verdict?: string }[] = [];
  try {
    const parsed = JSON.parse(run.gate_reasons_json);
    if (Array.isArray(parsed)) reasons = parsed;
  } catch { /* unparseable — treat as no recorded gates */ }
  const regression = reasons.find(r => r.gate === 'regression' && r.verdict === 'pass');
  return regression ? 'regression gate · score-verified' : null;
}

// ── Main component ───────────────────────────────────────────────

type ViewMode = 'skill' | 'run';

export default function EvolutionTab() {
  const [runs, setRuns] = useState<EvolutionRun[]>([]);
  const [status, setStatus] = useState<StatusCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('skill');
  const [filter, setFilter] = useState<RunStatus | 'all'>('all');
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionInFlight, setActionInFlight] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [runModalOpen, setRunModalOpen] = useState(false);

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
    setError(null);
    await Promise.all([loadRuns(), loadStatus()]);
    if (selectedUuid) await loadDetail(selectedUuid);
    setLoading(false);
  };

  // ── Render ─────────────────────────────────────────────────────

  const pendingCount = status?.pendingCount ?? 0;
  const skillGroups = useMemo(() => aggregateBySkill(runs), [runs]);

  return (
    <div className="flex h-full">
      {/* Left: filter + list */}
      <div className="w-64 border-r border-border/50 flex flex-col shrink-0">
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-border/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--honey)' }} />
              <h3 className="text-xs font-display font-semibold text-foreground">Evolution</h3>
            </div>
            <div className="flex items-center gap-0.5">
              <HintTooltip content="New Run">
                <button
                  aria-label="New evolution run"
                  onClick={() => setRunModalOpen(true)}
                  className="p-1 rounded hover:bg-primary/10 transition-colors"
                  style={{ color: 'var(--honey)' }}
                >
                  <Plus className="w-3 h-3" />
                </button>
              </HintTooltip>
              <HintTooltip content="Refresh">
                <button
                  aria-label="Refresh runs"
                  onClick={handleRefresh}
                  className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                  disabled={loading}
                >
                  <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </HintTooltip>
            </div>
          </div>

          {/* View toggle — skill-card framing (D12) vs the raw run list */}
          <div
            role="tablist"
            aria-label="Evolution view"
            className="flex gap-0.5 p-0.5 rounded-md mb-2"
            style={{ background: 'var(--surface-2, hsl(var(--secondary)))', border: '1px solid var(--line-soft)' }}
          >
            {(['skill', 'run'] as ViewMode[]).map(v => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className="flex-1 text-[10px] font-display font-semibold py-1 rounded transition-colors"
                style={view === v
                  ? { background: 'var(--honey)', color: '#1a1407' }
                  : { color: 'var(--text-muted, hsl(var(--muted-foreground)))' }}
              >
                {v === 'skill' ? 'By skill' : 'By run'}
              </button>
            ))}
          </div>

          {pendingCount > 0 && (
            <div
              className="mb-2 px-2 py-1 rounded-md"
              style={{ background: 'var(--honey-wash)', border: '1px solid var(--honey-line)' }}
            >
              <p className="text-[11px] font-display" style={{ color: 'var(--honey)' }}>
                {pendingCount} proposal{pendingCount !== 1 ? 's' : ''} awaiting review
              </p>
            </div>
          )}

          {/* Filter chips — apply to the raw run list only */}
          {view === 'run' && (
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
          )}
        </div>

        {/* List body — skill cards or the raw run list */}
        <div className="flex-1 overflow-auto p-1.5 space-y-1">
          {loading && runs.length === 0 ? (
            <div className="text-center py-8">
              <Loader2 className="w-5 h-5 text-muted-foreground/40 mx-auto mb-2 animate-spin" />
              <p className="text-xs text-muted-foreground">Loading runs…</p>
            </div>
          ) : error && runs.length === 0 ? (
            <div role="alert" className="text-center py-8">
              <AlertTriangle className="w-5 h-5 text-destructive/70 mx-auto mb-2" />
              <p className="text-xs text-destructive mb-2 px-2">{error}</p>
              <button type="button" onClick={handleRefresh} className="text-xs text-primary hover:underline px-2 py-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--honey-500)]">Retry</button>
            </div>
          ) : runs.length === 0 ? (
            <div className="text-center py-8">
              <Sparkles className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
              {filter === 'all' || view === 'skill' ? (
                <>
                  <p className="text-xs text-foreground font-display font-medium px-2">
                    Your skills get better on their own
                  </p>
                  <p className="text-[11px] text-muted-foreground/60 mt-2 px-2">
                    When Waggle finds a better way to do something it does for you, it proposes
                    an upgrade. You review each proposal and accept or reject it — nothing
                    changes without you.
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">No runs in {filter}</p>
              )}
            </div>
          ) : view === 'skill' ? (
            skillGroups.map(group => (
              <SkillCard
                key={group.key}
                group={group}
                selectedUuid={selectedUuid}
                onSelectRun={uuid => setSelectedUuid(uuid)}
              />
            ))
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
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <Sparkles className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">Select a run to review</p>
            <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
              Each run shows the baseline vs winner, which gates fired, and lets you accept or reject the proposal.
            </p>
            <button
              onClick={() => setRunModalOpen(true)}
              className="mt-4 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors font-display"
            >
              <Plus className="w-3 h-3" />
              New Run
            </button>
          </div>
        )}
      </div>

      {runModalOpen && (
        <NewRunModal
          onClose={() => setRunModalOpen(false)}
          onSuccess={async () => {
            setRunModalOpen(false);
            await Promise.all([loadRuns(), loadStatus()]);
          }}
        />
      )}
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
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px]"
          style={STATUS_STYLE[run.status]}
        >
          {STATUS_ICONS[run.status]} {run.status}
        </span>
        <span
          className="ml-auto text-[11px] font-mono"
          style={{ color: deltaPositive ? 'var(--healthy)' : 'var(--text-muted, hsl(var(--muted-foreground)))' }}
        >
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
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px]"
            style={STATUS_STYLE[detail.status]}
          >
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors hover:opacity-80 disabled:opacity-50 font-display"
              style={{ background: 'var(--healthy-wash)', color: 'var(--healthy)' }}
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

const GATE_VERDICT_COLOR: Record<string, string> = {
  pass: 'var(--healthy)',
  warn: 'var(--attention)',
  fail: 'var(--risk)',
};

function GateRow({ gate }: GateRowProps) {
  const color = GATE_VERDICT_COLOR[gate.verdict] ?? 'var(--text-muted, hsl(var(--muted-foreground)))';
  return (
    <div className="flex items-start gap-2 p-2 text-[11px]">
      <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" style={{ color }} />
      <div className="flex-1 min-w-0">
        <p className="text-foreground font-mono">
          {gate.gate}
          <span className="ml-1.5 uppercase tracking-wide" style={{ color }}>
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

// ── Skill card + version ladder (D12) ─────────────────────────────

interface SkillCardProps {
  group: SkillGroup;
  selectedUuid: string | null;
  onSelectRun: (uuid: string) => void;
}

/**
 * One evolving target rendered as a skill card with a version ladder. The
 * "current quality" stat shows the best *delta* in the group (the honest stat
 * we have — the backend stores relative deltas, not absolute quality scores,
 * so we never print a fabricated "91%"). Each version is selectable and routes
 * to the existing right-pane detail view via onSelectRun.
 */
function SkillCard({ group, selectedUuid, onSelectRun }: SkillCardProps) {
  const { versions, deployed, maxDelta, targetName, targetKind } = group;
  const headline = deployed ?? versions[versions.length - 1];
  // Score-bar scale: relative to the largest delta in this group (or the
  // headline's own delta if all are ≤0), so the ladder reads as a progression.
  const scaleBase = Math.max(maxDelta, Math.abs(headline.delta_accuracy), 0.0001);

  return (
    <div
      className="rounded-lg overflow-hidden mb-1.5"
      style={{ border: '1px solid var(--line)', background: 'var(--surface-card, hsl(var(--card)))' }}
    >
      {/* Skill header */}
      <div
        className="flex items-center gap-2.5 px-2.5 py-2"
        style={{ borderBottom: '1px solid var(--line-soft)' }}
      >
        <div
          className="w-7 h-7 shrink-0 grid place-items-center rounded"
          style={{ background: 'linear-gradient(150deg, var(--honey-bright), var(--honey-deep))' }}
        >
          <Hexagon className="w-3.5 h-3.5" style={{ color: '#1a1407' }} fill="#1a1407" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-display font-semibold text-foreground truncate">
            {targetName ?? '(no target)'}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {targetKind} · {versions.length} version{versions.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-display font-bold leading-none" style={{ color: 'var(--honey)' }}>
            {formatDelta(headline.delta_accuracy)}
          </p>
          <p className="text-[9px] text-muted-foreground font-mono mt-0.5">
            {deployed ? 'deployed lift' : 'best so far'}
          </p>
        </div>
      </div>

      {/* Version ladder */}
      <div className="px-2.5 py-1.5 space-y-0.5">
        {versions.map((run, i) => (
          <VersionRow
            key={run.run_uuid}
            run={run}
            index={i}
            isBest={deployed ? run.run_uuid === deployed.run_uuid : i === versions.length - 1}
            scaleBase={scaleBase}
            selected={selectedUuid === run.run_uuid}
            onSelect={() => onSelectRun(run.run_uuid)}
          />
        ))}
      </div>
    </div>
  );
}

interface VersionRowProps {
  run: EvolutionRun;
  index: number;
  isBest: boolean;
  scaleBase: number;
  selected: boolean;
  onSelect: () => void;
}

function VersionRow({ run, index, isBest, scaleBase, selected, onSelect }: VersionRowProps) {
  // Bar width: positive deltas only fill the track; non-positive read as a stub.
  const ratio = run.delta_accuracy > 0 ? Math.min(run.delta_accuracy / scaleBase, 1) : 0;
  const widthPct = Math.max(ratio * 100, run.delta_accuracy > 0 ? 8 : 3);
  const provenance = deriveProvenance(run);

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left grid grid-cols-[28px_1fr] gap-2 py-1.5 px-1 rounded transition-colors ${
        selected ? 'bg-primary/10' : 'hover:bg-muted/40'
      }`}
    >
      <span
        className="text-[11px] font-mono font-semibold pt-0.5"
        style={{ color: isBest ? 'var(--honey)' : 'var(--text-2, hsl(var(--foreground)))' }}
      >
        v{index + 1}
      </span>
      <div className="min-w-0">
        {/* Improve-note: the human's note when present (honest — the backend
            stores no optimizer-authored description; we don't invent one). */}
        {run.user_note ? (
          <p className="text-[11px] text-foreground/90 leading-snug mb-1 break-words">
            {run.user_note}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground/70 leading-snug mb-1 italic">
            {run.status === 'proposed' ? 'awaiting review' : run.status}
          </p>
        )}
        {/* Score bar — relative to the group's best delta. */}
        <div className="flex items-center gap-2">
          <div
            className="flex-1 h-1.5 rounded-full overflow-hidden"
            style={{ background: 'var(--surface-2, hsl(var(--secondary)))', border: '1px solid var(--line-soft)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${widthPct}%`,
                background: isBest
                  ? 'linear-gradient(90deg, var(--honey-deep), var(--honey-bright))'
                  : 'var(--line-strong)',
              }}
            />
          </div>
          <span
            className="text-[10px] font-mono font-semibold shrink-0"
            style={{ color: isBest ? 'var(--honey)' : 'var(--text-2, hsl(var(--foreground)))' }}
          >
            {formatDelta(run.delta_accuracy)}
          </span>
        </div>
        {/* D13 provenance — only when verifiably recorded; otherwise omitted. */}
        {provenance && (
          <div
            className="mt-1 inline-flex items-center gap-1 text-[9.5px] font-mono"
            style={{ color: 'var(--intel)' }}
          >
            <ShieldCheck className="w-2.5 h-2.5" />
            {provenance}
          </div>
        )}
      </div>
    </button>
  );
}

// ── New Run modal ─────────────────────────────────────────────────

type RunTargetKind = 'persona-system-prompt' | 'behavioral-spec-section';

interface Targets {
  personas: { id: string; name: string; description?: string }[];
  sections: string[];
  defaultSchema: unknown;
}

interface NewRunModalProps {
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}

function NewRunModal({ onClose, onSuccess }: NewRunModalProps) {
  const [targets, setTargets] = useState<Targets | null>(null);
  const [kind, setKind] = useState<RunTargetKind>('behavioral-spec-section');
  const [name, setName] = useState<string>('');
  const [baseline, setBaseline] = useState<string>('');
  const [schemaJson, setSchemaJson] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loadingTargets, setLoadingTargets] = useState(true);
  const [loadingBaseline, setLoadingBaseline] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{ outcome: string; reason?: string; run?: { run_uuid: string } } | null>(null);
  const [progress, setProgress] = useState<EvolutionProgressEvent | null>(null);

  // Load the list of targets once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await adapter.fetch('/api/evolution/targets');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as Targets;
        if (cancelled) return;
        setTargets(body);
        // Pre-select the first available section.
        if (body.sections.length > 0) setName(body.sections[0]);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load targets');
      } finally {
        if (!cancelled) setLoadingTargets(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // When kind or name changes, reload the baseline.
  useEffect(() => {
    if (!name || !kind) return;
    let cancelled = false;
    setLoadingBaseline(true);
    setErr(null);
    (async () => {
      try {
        const url = `/api/evolution/baseline?kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(name)}`;
        const res = await adapter.fetch(url);
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const body = await res.json();
        if (cancelled) return;
        setBaseline(body.baseline ?? '');
        setSchemaJson(JSON.stringify(body.schemaBaseline ?? {}, null, 2));
      } catch (e) {
        if (!cancelled) {
          setBaseline('');
          setSchemaJson('');
          setErr(e instanceof Error ? e.message : 'Failed to load baseline');
        }
      } finally {
        if (!cancelled) setLoadingBaseline(false);
      }
    })();
    return () => { cancelled = true; };
  }, [kind, name]);

  // When the user changes kind, reset name to the first valid option.
  const onChangeKind = (nextKind: RunTargetKind) => {
    setKind(nextKind);
    if (!targets) return;
    if (nextKind === 'persona-system-prompt' && targets.personas.length > 0) {
      setName(targets.personas[0].id);
    } else if (nextKind === 'behavioral-spec-section' && targets.sections.length > 0) {
      setName(targets.sections[0]);
    }
  };

  const onSubmit = async () => {
    if (submitting) return;
    setErr(null);
    setRunResult(null);
    setProgress(null);

    let schemaBaseline: unknown;
    try {
      schemaBaseline = JSON.parse(schemaJson);
    } catch {
      setErr('schemaBaseline is not valid JSON.');
      return;
    }
    if (!baseline.trim()) {
      setErr('baseline must not be empty.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await adapter.fetch('/api/evolution/run', {
        method: 'POST',
        body: JSON.stringify({
          targetKind: kind,
          targetName: name,
          baseline,
          schemaBaseline,
        }),
        // Opt into SSE streaming so the user sees per-phase progress
        // instead of a silent 30–60s wait.
        headers: { Accept: 'text/event-stream' },
      });

      if (!res.ok) {
        // Non-stream error path — server chose to return a JSON error
        // (e.g. 422 missing key, 503 LLM init, 400 validation).
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('text/event-stream') && res.body) {
        // Stream path — consume SSE events.
        await consumeEvolutionSse(res.body, {
          onProgress: (ev) => setProgress(ev),
          onDone: (payload) => setRunResult(payload),
          onError: (err) => setErr(err),
        });
      } else {
        // Backwards-compat: server returned JSON even though we asked for SSE.
        const body = await res.json().catch(() => null);
        if (body) setRunResult(body);
      }

      // Small delay so the user can read the outcome before the list refresh.
      setTimeout(() => { onSuccess(); }, 800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Run failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-auto bg-background border border-border/60 rounded-lg shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-display font-semibold text-foreground">New Evolution Run</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-muted-foreground hover:text-foreground"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {loadingTargets ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : !targets ? (
            <p className="text-[11px] text-destructive">Could not load targets.</p>
          ) : (
            <>
              {/* Target pickers */}
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col">
                  <span className="text-[11px] text-muted-foreground font-display mb-1">Target Kind</span>
                  <select
                    value={kind}
                    onChange={e => onChangeKind(e.target.value as RunTargetKind)}
                    disabled={submitting}
                    className="bg-muted/30 border border-border/40 rounded px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="behavioral-spec-section">behavioral-spec-section</option>
                    <option value="persona-system-prompt">persona-system-prompt</option>
                  </select>
                </label>
                <label className="flex flex-col">
                  <span className="text-[11px] text-muted-foreground font-display mb-1">Target Name</span>
                  <select
                    value={name}
                    onChange={e => setName(e.target.value)}
                    disabled={submitting}
                    className="bg-muted/30 border border-border/40 rounded px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {kind === 'persona-system-prompt'
                      ? targets.personas.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                      ))
                      : targets.sections.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                  </select>
                </label>
              </div>

              {/* Baseline */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted-foreground font-display">
                    Baseline {loadingBaseline && <Loader2 className="w-2.5 h-2.5 animate-spin inline ml-1" />}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 font-mono">
                    {baseline.length} chars
                  </span>
                </div>
                <textarea
                  value={baseline}
                  onChange={e => setBaseline(e.target.value)}
                  disabled={submitting || loadingBaseline}
                  rows={10}
                  className="w-full bg-muted/20 border border-border/40 rounded px-2 py-1.5 text-[11px] text-foreground font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="(loading baseline…)"
                />
              </div>

              {/* Advanced: schema */}
              <div>
                <button
                  onClick={() => setShowAdvanced(v => !v)}
                  className="text-[11px] text-muted-foreground hover:text-foreground font-display flex items-center gap-1"
                >
                  <ChevronRight className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
                  Advanced (schema baseline)
                </button>
                {showAdvanced && (
                  <textarea
                    value={schemaJson}
                    onChange={e => setSchemaJson(e.target.value)}
                    disabled={submitting || loadingBaseline}
                    rows={8}
                    className="mt-1 w-full bg-muted/20 border border-border/40 rounded px-2 py-1.5 text-[11px] text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                )}
              </div>

              {/* Progress / error / result */}
              {submitting && progress && !runResult && !err && (
                <div className="text-[11px] text-primary bg-primary/5 border border-primary/20 rounded px-2 py-1.5 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  <span className="font-mono">Phase: {progress.phase}</span>
                  {progress.message && (
                    <span className="text-muted-foreground truncate"> — {progress.message}</span>
                  )}
                </div>
              )}
              {err && (
                <div className="text-[11px] text-destructive font-mono bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5">
                  {err}
                </div>
              )}
              {runResult && (
                <div
                  className="text-[11px] rounded px-2 py-1.5"
                  style={{ color: 'var(--healthy)', background: 'var(--healthy-wash)', border: '1px solid var(--healthy)' }}
                >
                  Run complete: <span className="font-mono">{runResult.outcome}</span>
                  {runResult.reason && <span className="text-muted-foreground"> — {runResult.reason}</span>}
                  {runResult.run && <span className="block text-[10px] text-muted-foreground font-mono mt-0.5">uuid: {runResult.run.run_uuid}</span>}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border/40 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground font-mono">
            Real Haiku run — costs a few cents, can take 30-60s.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 font-display"
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={submitting || loadingTargets || loadingBaseline || !baseline || !name}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50 font-display"
            >
              {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {submitting ? 'Running…' : 'Run'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
