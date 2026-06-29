import { useState, useEffect, useCallback } from 'react';
import { Clock, Plus, Loader2, AlertTriangle, RefreshCw, Check, X, ShieldAlert } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { useService } from '@/providers/ServiceProvider';
import { useToast } from '@/hooks/use-toast';
import type { Automation } from '@waggle/shared';
import { LOOP_TEMPLATES, type LoopTemplate } from '@waggle/shared';
import type { AutomationLog, Workspace, EngineStatus, PendingApprovalItem } from '@/lib/types';
import { consumeDeepLink } from '@/lib/app-deeplink';
import { successRateFromLogs, formatRatePercent, describeTrigger, workspaceLabel, groupAutomationsByWorkspace } from '@/lib/automation-display';
import AutomationRow from './automations/AutomationRow';
import AutomationLogList, { type NamedLog } from './automations/AutomationLogList';
import AutomationBuilder, { type AutomationDraft } from './automations/AutomationBuilder';

/**
 * Automation Center (UX-Refactor Phase 3B, S11 — rename/extension of the
 * cron-backed ScheduledJobsApp; AppId 'scheduled-jobs' stays stable per B1).
 * PRD §12.10 acceptance: overnight work is visible, reviewable, stoppable.
 * Tabs: Overview / Running / Scheduled / Triggers / History / Logs.
 *  - C24: schedule-only triggers v1 (+ manual). C25: condition advisory.
 *  - C26: form "Check configuration" = validation-only preview.
 *  - C27: success-rate derives client-side from execution logs; no
 *    "hours saved" (no data source).
 * Journey 16: Home Cockpit failure items deep-link here via the
 * `waggle:open-app` event carrying `{ appId: 'scheduled-jobs', tab: 'logs' }`.
 */
type CenterTab = 'overview' | 'running' | 'scheduled' | 'triggers' | 'history' | 'logs';

const TABS: ReadonlyArray<{ id: CenterTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'running', label: 'Running' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'triggers', label: 'Triggers' },
  { id: 'history', label: 'History' },
  { id: 'logs', label: 'Logs' },
];

const AutomationCenterApp = () => {
  const { toast } = useToast();
  // Cold-load race guard (same fix as HomeCockpit): the adapter attaches the
  // session token during its initial connect(); firing authed calls from a
  // restored window before that 401s into a spurious error panel.
  const { connecting } = useService();
  const [tab, setTab] = useState<CenterTab>('overview');
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [logsMap, setLogsMap] = useState<Record<string, AutomationLog[]>>({});
  /** Automations whose log fetch failed — their badges/KPIs are incomplete. */
  const [logsFailedIds, setLogsFailedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [saving, setSaving] = useState(false);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [logsTarget, setLogsTarget] = useState<string | null>(null);
  // Multi-workspace grouping + the Loops-engine sovereignty pill.
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  /** Template currently being created (disables its button). */
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);
  /** Which workspace a template-created Loop should run in ('' = all / personal). */
  const [templateWorkspaceId, setTemplateWorkspaceId] = useState('');
  /** L2: held actions awaiting the user's approval (source:'held'). */
  const [pendingActions, setPendingActions] = useState<PendingApprovalItem[]>([]);
  /** Approve/reject in flight for a held action. */
  const [decidingId, setDecidingId] = useState<string | null>(null);
  /** Template create: assist mode (the Loop proposes actions for approval). */
  const [assistMode, setAssistMode] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await adapter.listAutomations();
      setAutomations(rows);
      // C27: success-rate + Failed badges derive from execution history —
      // fetch per-automation logs (cron lists are small; bounded limit each).
      // Failed fetches are TRACKED, not dropped: a missing log must read as
      // "history unavailable", never as a healthy automation.
      const results = await Promise.allSettled(rows.map(a => adapter.getAutomationLogs(a.id, 20)));
      const map: Record<string, AutomationLog[]> = {};
      const failed: string[] = [];
      rows.forEach((a, i) => {
        const r = results[i];
        if (r.status === 'fulfilled') map[a.id] = r.value;
        else failed.push(a.id);
      });
      setLogsMap(map);
      setLogsFailedIds(failed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load automations');
    } finally {
      setLoading(false);
    }
  }, []);

  // Defer until the adapter's initial connect attempt has settled (gates on
  // `connecting`, not `connected`, so a failed connect still reaches the
  // error/Retry UI instead of a permanent skeleton).
  useEffect(() => {
    if (connecting) return;
    void refresh();
  }, [refresh, connecting]);

  // Workspaces (for grouping) load once; the engine status polls so the
  // sovereignty pill reflects whether the local Loops engine is live right now.
  useEffect(() => {
    if (connecting) return;
    let active = true;
    adapter.getWorkspaces().then(ws => { if (active) setWorkspaces(ws); }).catch(() => {});
    const poll = () => {
      adapter.getEngineStatus()
        .then(s => { if (active) setEngine(s); })
        .catch(() => { if (active) setEngine(null); });
      // L2: held actions an assist-mode Loop drafted, awaiting approval.
      adapter.getPendingApprovals()
        .then(r => { if (active) setPendingActions(r.pending.filter(p => p.source === 'held')); })
        .catch(() => { if (active) setPendingActions([]); });
    };
    void poll();
    const timer = setInterval(() => void poll(), 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [connecting]);

  // Journey 16 / M-09: Home failure items open this app on a specific tab,
  // optionally preselecting the failing automation's log. Two paths:
  //  - cold open: the dispatch happened BEFORE this component mounted (its
  //    listener didn't exist yet) — Desktop stashed the intent, consumed once
  //    here on mount;
  //  - already mounted: the live event handler applies the detail directly
  //    (and drops the stashed copy so a later remount can't replay it).
  const applyDeepLink = useCallback((detail: { tab?: string; automationId?: string }) => {
    if (detail.tab && TABS.some(t => t.id === detail.tab)) setTab(detail.tab as CenterTab);
    if (detail.automationId) setLogsTarget(detail.automationId);
  }, []);

  useEffect(() => {
    const pending = consumeDeepLink('scheduled-jobs');
    if (pending) applyDeepLink(pending);
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { appId?: string; tab?: string; automationId?: string } | undefined;
      if (detail?.appId === 'scheduled-jobs') {
        consumeDeepLink('scheduled-jobs');
        applyDeepLink(detail);
      }
    };
    window.addEventListener('waggle:open-app', handler);
    return () => window.removeEventListener('waggle:open-app', handler);
  }, [applyDeepLink]);

  const runNow = async (a: Automation) => {
    setRunningIds(prev => new Set(prev).add(a.id));
    try {
      const result = await adapter.runAutomation(a.id);
      toast({
        title: 'Automation triggered',
        description: a.triggerType === 'manual'
          ? 'Ran now — stays manual, no schedule was enabled'
          : result.autoEnabled ? 'Running now — schedule re-enabled' : 'Running now',
      });
      await refresh();
    } catch {
      toast({ title: 'Failed to trigger automation', variant: 'destructive' });
    } finally {
      setRunningIds(prev => { const next = new Set(prev); next.delete(a.id); return next; });
    }
  };

  const toggle = async (a: Automation) => {
    try {
      if (a.status === 'active' || a.status === 'running') {
        await adapter.pauseAutomation(a.id);
      } else {
        await adapter.updateAutomation(a.id, { enabled: true });
      }
      await refresh();
    } catch {
      toast({ title: 'Failed to update automation', variant: 'destructive' });
    }
  };

  const remove = async (a: Automation) => {
    if (!window.confirm(`Delete automation "${a.name}"? Its run history goes with it.`)) return;
    try {
      await adapter.deleteCronJob(a.id);
      toast({ title: 'Automation deleted' });
      await refresh();
    } catch {
      toast({ title: 'Failed to delete automation', variant: 'destructive' });
    }
  };

  const submit = async (draft: AutomationDraft) => {
    setSaving(true);
    try {
      if (editing) {
        await adapter.updateAutomation(editing.id, {
          name: draft.name,
          trigger: draft.trigger,
          ...(draft.condition !== undefined ? { condition: draft.condition } : {}),
          // 3C: the Builder now edits the action config (prompt/output
          // channel) — the server merges this over the stored job_config blob.
          ...(draft.jobConfig !== undefined ? { jobConfig: draft.jobConfig } : {}),
          // A manual row is stored disabled; switching it back to a schedule
          // must go live — otherwise the saved schedule silently never fires
          // until a separate Enable toggle.
          ...(editing.triggerType === 'manual' && draft.trigger.type === 'schedule'
            ? { enabled: true }
            : {}),
        });
        setEditing(null);
        toast({ title: 'Automation updated', description: draft.name });
      } else {
        await adapter.createAutomation({ ...draft, enabled: true });
        setCreating(false);
        toast({ title: 'Automation created', description: draft.name });
      }
      await refresh();
    } catch (err) {
      toast({ title: editing ? 'Failed to update automation' : 'Failed to create automation', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // One-click create a report-only Loop from a knowledge-worker template. Loops
  // carry their own prompt, so they are created from templates (not the generic
  // Builder job-type dropdown) — the template is the safe, prefilled starting point.
  const createFromTemplate = async (t: LoopTemplate) => {
    setCreatingTemplateId(t.id);
    try {
      await adapter.createAutomation({
        name: assistMode ? `${t.name} (assist)` : t.name,
        trigger: { type: 'schedule', cron: t.defaultCron },
        jobType: 'loop',
        // assist mode lets the Loop propose ONE action per run for your approval
        // (still toolless — nothing runs until you approve).
        jobConfig: assistMode ? { ...t.jobConfig, mode: 'assist' } : t.jobConfig,
        // Bind to the chosen workspace so the Loop reads that workspace's memory
        // (and groups under it); '' runs on the cross-workspace personal mind.
        ...(templateWorkspaceId ? { workspaceId: templateWorkspaceId } : {}),
        enabled: true,
      });
      toast({
        title: 'Loop created',
        description: assistMode
          ? `${t.name} — proposes actions for your approval`
          : `${t.name} — report-only, runs on your machine`,
      });
      await refresh();
    } catch (err) {
      toast({ title: 'Failed to create loop', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setCreatingTemplateId(null);
    }
  };

  // L2: approve or reject a held action. Approve runs the real tool server-side
  // (idempotent + re-validated); reject marks it denied. Either way it leaves
  // the queue.
  const decideAction = async (id: string, approved: boolean) => {
    setDecidingId(id);
    try {
      await adapter.respondApproval(id, approved);
      setPendingActions(prev => prev.filter(p => p.requestId !== id));
      toast({ title: approved ? 'Action approved & run' : 'Action rejected' });
    } catch {
      toast({ title: 'Failed to update approval', variant: 'destructive' });
    } finally {
      setDecidingId(null);
    }
  };

  const openLogs = (a: Automation) => { setLogsTarget(a.id); setTab('logs'); };
  const startEdit = (a: Automation) => { setEditing(a); setCreating(false); };

  const lastLog = (id: string): AutomationLog | null => (logsMap[id]?.[0] ?? null);
  const enabledCount = automations.filter(a => a.status === 'active' || a.status === 'running').length;
  const failedAutomations = automations.filter(a => { const l = lastLog(a.id); return l !== null && !l.success; });
  const allLogs: NamedLog[] = automations
    .flatMap(a => (logsMap[a.id] ?? []).map(l => ({ ...l, automationName: a.name })))
    .sort((x, y) => Date.parse(y.executedAt) - Date.parse(x.executedAt))
    .slice(0, 50);
  const overallRate = successRateFromLogs(allLogs);
  const logsTargetAutomation = automations.find(a => a.id === logsTarget) ?? null;
  const runningList = automations.filter(a => runningIds.has(a.id));
  const engineLabel = engine?.running
    ? `Engine live · on ${engine.host}`
    : engine === null ? 'Checking engine…' : 'Engine offline';

  const renderRows = (rows: Automation[]) => (
    <ul className="space-y-2">
      {rows.map(a => (
        <AutomationRow
          key={a.id}
          automation={a}
          lastLog={lastLog(a.id)}
          runningNow={runningIds.has(a.id)}
          onToggle={(x) => void toggle(x)}
          onRunNow={(x) => void runNow(x)}
          onLogs={openLogs}
          onEdit={startEdit}
          onDelete={(x) => void remove(x)}
        />
      ))}
    </ul>
  );

  const labelFor = (id: string | undefined) => workspaceLabel(id, workspaces);

  // "Which workspaces": group rows by workspace with a per-group count + success
  // rate. With ≤1 group, render the flat list byte-identical to before so
  // single-workspace setups (and the existing tests) are unchanged.
  const renderGrouped = (rows: Automation[]) => {
    const groups = groupAutomationsByWorkspace(rows, labelFor);
    if (groups.length <= 1) return renderRows(rows);
    return (
      <div className="space-y-3" data-testid="automation-workspace-groups">
        {groups.map(g => {
          const groupLogs = g.automations.flatMap(a => logsMap[a.id] ?? []);
          return (
            <section key={g.key} role="group" aria-label={g.label}>
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">{g.label}</span>
                <span
                  className="text-[10px] text-muted-foreground tabular-nums"
                  aria-label={`${g.automations.length} automation${g.automations.length === 1 ? '' : 's'}, ${formatRatePercent(successRateFromLogs(groupLogs))} recent success rate`}
                >
                  {g.automations.length} · {formatRatePercent(successRateFromLogs(groupLogs))}
                </span>
              </div>
              {renderRows(g.automations)}
            </section>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <h2 className="text-sm font-display font-semibold text-foreground">Automation Center</h2>
          <span className="text-[11px] text-muted-foreground">{automations.length} automation{automations.length === 1 ? '' : 's'}</span>
          {/* Loops-engine sovereignty pill: automations only run while this
              machine (or your self-hosted server) is live — nothing leaves the
              perimeter to a cloud cron. */}
          <span
            data-testid="automation-engine-pill"
            role="status"
            aria-live="polite"
            aria-label={`${engineLabel}. Loops run locally on your machine — nothing leaves your device.`}
            title="Loops run locally on your machine — nothing leaves your device."
            className="flex items-center gap-1 rounded-full border border-border/40 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
          >
            <span
              aria-hidden="true"
              className={`w-1.5 h-1.5 rounded-full ${
                engine === null ? 'bg-muted-foreground/40' : engine.running ? 'bg-[var(--healthy)]' : 'bg-[var(--risk)]'
              }`}
            />
            {engineLabel}
          </span>
        </div>
        <button
          onClick={() => { setCreating(true); setEditing(null); }}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-display rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
        >
          <Plus className="w-3 h-3" /> New
        </button>
      </div>

      {/* §12.10 tab shell. All tabs stay in the Tab order (FilesAppTabs
          pattern) — a roving tabIndex without arrow-key handling makes every
          inactive tab keyboard-unreachable (WCAG 2.1.1). */}
      <div className="px-4 pt-2 flex flex-wrap gap-1" role="tablist" aria-label="Automation Center sections">
        {TABS.map(t => (
          <button
            key={t.id}
            id={`automation-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="automation-tab-panel"
            className={`px-2 py-0.5 rounded-full text-[11px] transition-colors border ${
              tab === t.id ? 'border-primary/40 bg-primary/15 text-primary' : 'border-transparent bg-muted/50 text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="automation-tab-panel" className="flex-1 overflow-auto p-3 space-y-2" role="tabpanel" aria-labelledby={`automation-tab-${tab}`}>
        {loading && automations.length === 0 ? (
          <div role="status" aria-live="polite" className="text-center py-8">
            <Loader2 className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2 animate-spin" />
            <p className="text-xs text-muted-foreground">Loading automations…</p>
          </div>
        ) : error && automations.length === 0 ? (
          <div role="alert" className="text-center py-8">
            <p className="text-xs text-destructive mb-2">{error}</p>
            <button onClick={() => refresh()} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        ) : (
          <>
            {/* A post-action reload failure must be visible even when a stale
                list is still on screen (success-toast-then-silent-rot trap). */}
            {error && automations.length > 0 && (
              <div role="alert" className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1.5">
                <span className="text-[11px] text-destructive">Refresh failed — this list may be stale. {error}</span>
                <button onClick={() => void refresh()} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline shrink-0">
                  <RefreshCw className="w-3 h-3" /> Retry
                </button>
              </div>
            )}
            {logsFailedIds.length > 0 && (
              <p role="status" className="rounded-lg border border-border/40 bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground" data-testid="automation-logs-unavailable">
                Run history unavailable for {logsFailedIds.length} automation{logsFailedIds.length === 1 ? '' : 's'} — status badges and the success rate may be incomplete.
              </p>
            )}

            {tab === 'overview' && (
              <>
                {pendingActions.length > 0 && (
                  <div data-testid="automation-pending-actions" className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/5 px-2.5 py-2 space-y-1.5">
                    <p className="text-[11px] font-medium text-foreground flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3 text-[var(--accent)]" /> {pendingActions.length} action{pendingActions.length === 1 ? '' : 's'} awaiting your approval
                    </p>
                    {pendingActions.map(p => (
                      <div key={p.requestId} className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-card/40 px-2 py-1.5">
                        <span className="min-w-0">
                          <span className="block text-[11px] text-foreground truncate">{p.summary || p.toolName}</span>
                          <span className="block text-[10px] text-muted-foreground">{p.toolName}{p.riskLevel ? ` · ${p.riskLevel} risk` : ''}</span>
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => void decideAction(p.requestId, true)}
                            disabled={decidingId === p.requestId}
                            aria-label={`Approve ${p.toolName}`}
                            className="inline-flex items-center gap-0.5 rounded-md bg-[var(--healthy)]/15 text-[var(--healthy)] px-1.5 py-0.5 text-[10px] hover:bg-[var(--healthy)]/25 disabled:opacity-50"
                          >
                            <Check className="w-3 h-3" /> Approve
                          </button>
                          <button
                            onClick={() => void decideAction(p.requestId, false)}
                            disabled={decidingId === p.requestId}
                            aria-label={`Reject ${p.toolName}`}
                            className="inline-flex items-center gap-0.5 rounded-md bg-[var(--risk)]/15 text-[var(--risk)] px-1.5 py-0.5 text-[10px] hover:bg-[var(--risk)]/25 disabled:opacity-50"
                          >
                            <X className="w-3 h-3" /> Reject
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2" data-testid="automation-overview-tiles">
                  <div className="rounded-lg bg-secondary/20 border border-border/30 px-2.5 py-2">
                    <div className="text-lg font-display font-semibold tabular-nums text-foreground">{enabledCount}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight">Active schedules</div>
                  </div>
                  <div className="rounded-lg bg-secondary/20 border border-border/30 px-2.5 py-2">
                    <div className="text-lg font-display font-semibold tabular-nums text-foreground">{automations.length - enabledCount}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight">Paused / manual</div>
                  </div>
                  <div className="rounded-lg bg-secondary/20 border border-border/30 px-2.5 py-2">
                    <div className="text-lg font-display font-semibold tabular-nums text-foreground" data-testid="automation-success-rate">{formatRatePercent(overallRate)}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight">Success rate (recent runs)</div>
                  </div>
                </div>
                {failedAutomations.length > 0 && (
                  <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2 space-y-1" data-testid="automation-attention">
                    <p className="text-[11px] font-medium text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Attention required — last run failed
                    </p>
                    {failedAutomations.map(a => (
                      <button key={a.id} onClick={() => openLogs(a)} className="block text-left text-[11px] text-foreground hover:text-primary">
                        {a.name} — {lastLog(a.id)?.error ?? 'failed'}
                      </button>
                    ))}
                  </div>
                )}
                {automations.length === 0 && (
                  <p role="status" className="text-xs text-muted-foreground text-center py-6">No automations yet — create one to put background work on a schedule.</p>
                )}
                {/* The Overview must answer "what runs next, how did the last
                    runs go" without a tab switch — three stat tiles over a
                    void was a judge-flagged dead end. */}
                {automations.length > 0 && (
                  <div className="grid sm:grid-cols-2 gap-2" data-testid="automation-overview-panels">
                    <div className="rounded-lg bg-secondary/20 border border-border/30 px-2.5 py-2">
                      <p className="text-[10px] font-display uppercase tracking-wide text-muted-foreground mb-1.5">Next up</p>
                      {(() => {
                        const upcoming = automations
                          .filter(a => a.nextRun && (a.status === 'active' || a.status === 'running') && Date.parse(a.nextRun) > Date.now())
                          .sort((a, b) => Date.parse(a.nextRun as string) - Date.parse(b.nextRun as string))
                          .slice(0, 3);
                        return upcoming.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">Nothing scheduled.</p>
                        ) : (
                          <ul className="space-y-1">
                            {upcoming.map(a => (
                              <li key={a.id} className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="text-foreground truncate">{a.name}</span>
                                <span className="text-muted-foreground shrink-0">{new Date(a.nextRun as string).toLocaleString()}</span>
                              </li>
                            ))}
                          </ul>
                        );
                      })()}
                    </div>
                    <div className="rounded-lg bg-secondary/20 border border-border/30 px-2.5 py-2">
                      <p className="text-[10px] font-display uppercase tracking-wide text-muted-foreground mb-1.5">Recent results</p>
                      {(() => {
                        const recent = automations
                          .map(a => ({ a, log: lastLog(a.id) }))
                          .filter((r): r is { a: typeof r.a; log: NonNullable<typeof r.log> } => r.log !== null)
                          .sort((x, y) => Date.parse(y.log.executedAt) - Date.parse(x.log.executedAt))
                          .slice(0, 3);
                        return recent.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">No runs yet.</p>
                        ) : (
                          <ul className="space-y-1">
                            {recent.map(({ a, log }) => (
                              <li key={a.id} className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="text-foreground truncate">{a.name}</span>
                                <span className={`shrink-0 ${log.success ? 'text-[var(--healthy)]' : 'text-[var(--risk)]'}`}>
                                  {log.success ? 'OK' : 'failed'} · {new Date(log.executedAt).toLocaleString()}
                                </span>
                              </li>
                            ))}
                          </ul>
                        );
                      })()}
                    </div>
                  </div>
                )}
                <div data-testid="automation-templates" className="rounded-lg border border-border/30 bg-secondary/10 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                    <p className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Start from a template</p>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        Runs in:
                        <select
                          value={templateWorkspaceId}
                          onChange={(e) => setTemplateWorkspaceId(e.target.value)}
                          aria-label="Workspace for the new Loop"
                          data-testid="automation-template-workspace"
                          className="bg-muted/40 text-[10px] py-0.5 px-1 rounded border border-border/40 text-foreground"
                        >
                          <option value="">All workspaces</option>
                          {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                      </label>
                      <label className="flex items-center gap-1 text-[10px] text-muted-foreground" title="The Loop drafts one action per run and holds it for your approval — nothing runs until you approve.">
                        <input
                          type="checkbox"
                          checked={assistMode}
                          onChange={(e) => setAssistMode(e.target.checked)}
                          data-testid="automation-template-assist"
                          className="accent-[var(--accent)]"
                        />
                        Propose actions for approval
                      </label>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-1.5">
                    {LOOP_TEMPLATES.map(t => (
                      <button
                        key={t.id}
                        onClick={() => void createFromTemplate(t)}
                        disabled={creatingTemplateId !== null}
                        aria-busy={creatingTemplateId === t.id}
                        data-testid={`automation-template-${t.id}`}
                        className="text-left rounded-lg border border-border/40 bg-card/40 px-2 py-1.5 hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-50"
                      >
                        <span className="block text-[11px] font-medium text-foreground">
                          {t.name}{creatingTemplateId === t.id ? ' · Creating…' : ''}
                        </span>
                        <span className="block text-[10px] text-muted-foreground leading-tight">{t.description}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    {assistMode
                      ? 'Assist Loops summarise from the selected workspace’s memory and may propose ONE action per run — held for your approval. Nothing runs until you approve.'
                      : 'Templates create report-only Loops — they summarise from the selected workspace’s memory and notify you; they never act on your behalf.'}
                  </p>
                </div>
              </>
            )}

            {tab === 'running' && (
              runningList.length > 0 ? renderGrouped(runningList) : (
                <div role="status" className="text-center py-8">
                  <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Nothing running right now.</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-1">Runs you trigger appear here while in flight; scheduled runs show up in History once they complete.</p>
                </div>
              )
            )}

            {tab === 'scheduled' && (
              automations.length === 0 ? (
                <div role="status" className="text-center py-8">
                  <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No automations yet</p>
                </div>
              ) : renderGrouped(automations)
            )}

            {tab === 'triggers' && (
              <>
                <p className="text-[11px] text-muted-foreground">Schedule-only in v1 — event triggers arrive in a later release.</p>
                {automations.length === 0 ? (
                  <p role="status" className="text-xs text-muted-foreground text-center py-6">No triggers configured.</p>
                ) : (
                  <ul className="space-y-1">
                    {automations.map(a => (
                      <li key={a.id} className="flex items-center gap-2.5 rounded-lg border border-border/40 bg-card/40 px-2.5 py-1.5">
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-medium text-foreground truncate">{a.name}</span>
                          <span className="block text-[10px] text-muted-foreground" title={a.triggerType === 'manual' ? undefined : (a.schedule ?? undefined)}>{describeTrigger(a)}</span>
                        </span>
                        {a.nextRun && (a.status === 'active' || a.status === 'running') && (
                          <span className="text-[10px] text-muted-foreground shrink-0">Next: {new Date(a.nextRun).toLocaleString()}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {tab === 'history' && (
              <AutomationLogList logs={allLogs} emptyText="No runs recorded yet — history appears after the first execution." />
            )}

            {tab === 'logs' && (
              <>
                <div className="flex flex-wrap gap-1">
                  {automations.map(a => (
                    <button
                      key={a.id}
                      onClick={() => setLogsTarget(a.id)}
                      aria-pressed={logsTarget === a.id}
                      className={`px-2 py-0.5 rounded-full text-[11px] transition-colors border ${
                        logsTarget === a.id ? 'border-primary/40 bg-primary/15 text-primary' : 'border-transparent bg-muted/50 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
                {logsTargetAutomation ? (
                  <>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-[11px] text-muted-foreground">
                        Success rate: <span className="text-foreground font-medium">{formatRatePercent(successRateFromLogs(logsMap[logsTargetAutomation.id] ?? []))}</span>
                      </p>
                      <button
                        onClick={() => void runNow(logsTargetAutomation)}
                        disabled={runningIds.has(logsTargetAutomation.id)}
                        className="text-[11px] text-primary hover:underline disabled:opacity-50"
                      >
                        Retry / run now
                      </button>
                    </div>
                    <AutomationLogList logs={logsMap[logsTargetAutomation.id] ?? []} emptyText="No runs recorded for this automation yet." />
                  </>
                ) : (
                  <p role="status" className="text-xs text-muted-foreground text-center py-6">
                    {automations.length === 0 ? 'No automations yet.' : 'Pick an automation to inspect its run log.'}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* S20 Automation Builder (Phase 3C) — body-portaled modal stepper for
          create AND edit (the 3B inline form merged into it). */}
      {(creating || editing) && (
        <AutomationBuilder
          key={editing?.id ?? 'create'}
          initial={editing ?? undefined}
          busy={saving}
          onSubmit={(d) => void submit(d)}
          onCancel={() => { setCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
};

export default AutomationCenterApp;
