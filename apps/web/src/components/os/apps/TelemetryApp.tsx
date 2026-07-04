import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Loader2, Zap, DollarSign, TrendingUp, Check, AlertTriangle } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { useToast } from '@/hooks/use-toast';
import { SurfaceRow } from './power/power-primitives';
import { formatModelLabel } from '@/lib/model-label';

interface CostEntry {
  workspaceId: string;
  workspaceName?: string;
  tokensUsed: number;
  costUsd: number;
  toolCalls: number;
}

interface ModelSpend {
  model: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
}

interface BudgetInfo {
  dailyBudget: number | null;
  todayCost: number;
  budgetStatus: 'ok' | 'warning' | 'exceeded';
  budgetPercent: number;
}

interface TelemetrySummary {
  totalTokens: number;
  totalCost: number;
  totalToolCalls: number;
  byWorkspace: CostEntry[];
  byModel: ModelSpend[];
  topTools: Array<{ name: string; count: number }>;
  budget: BudgetInfo;
}


const TelemetryApp = () => {
  const { toast } = useToast();
  const [data, setData] = useState<TelemetrySummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Daily-budget editor (F8 — writes to /api/settings dailyBudget).
  const [budgetInput, setBudgetInput] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);

  const load = useCallback(async () => {
    try {
      // /api/cost/summary is free for all tiers (P22) and carries byModel + budget.
      // /api/cost/by-workspace is TEAMS-gated; tolerate its absence (object OR []).
      const [summaryRes, costRes, statsRes] = await Promise.all([
        adapter.fetch('/api/cost/summary').then(r => r.json()).catch(() => null),
        adapter.fetch('/api/cost/by-workspace').then(r => r.json()).catch(() => null),
        adapter.fetch('/api/events/stats').then(r => r.json()).catch(() => ({})),
      ]);

      // by-workspace returns { workspaces, totalCost } (TEAMS) — older callers
      // expected a bare array; accept both, default to empty when gated off.
      const wsRows: Array<Record<string, unknown>> = Array.isArray(costRes)
        ? costRes
        : Array.isArray(costRes?.workspaces) ? costRes.workspaces : [];
      const byWorkspace: CostEntry[] = wsRows.map((w) => ({
        workspaceId: String(w.workspaceId ?? ''),
        workspaceName: w.workspaceName as string | undefined,
        tokensUsed: Number(w.inputTokens ?? 0) + Number(w.outputTokens ?? 0) || Number(w.tokensUsed ?? 0),
        costUsd: Number(w.estimatedCost ?? w.costUsd ?? 0),
        toolCalls: Number(w.turns ?? w.toolCalls ?? 0),
      }));

      const allTime = summaryRes?.allTime ?? {};
      const totalTokens = Number(allTime.inputTokens ?? 0) + Number(allTime.outputTokens ?? 0);
      const totalCost = Number(allTime.estimatedCost ?? 0);

      // byModel is a Record<model, { input, output, cost }> — flatten + sort by spend.
      const byModelRaw = (allTime.byModel ?? {}) as Record<string, { input: number; output: number; cost: number }>;
      const byModel: ModelSpend[] = Object.entries(byModelRaw)
        .map(([model, v]) => ({ model, cost: v.cost, inputTokens: v.input, outputTokens: v.output }))
        .sort((a, b) => b.cost - a.cost);

      // /api/events/stats returns byType as an OBJECT (event_type -> count) and
      // the per-tool breakdown as `topTools` ({ name, count }[]). The total
      // tool-call count is the 'tool_call' bucket of byType.
      const byTypeMap = (statsRes?.byType ?? {}) as Record<string, number>;
      const toolEvents = Number(byTypeMap.tool_call ?? 0);
      const topTools: Array<{ name: string; count: number }> = Array.isArray(statsRes?.topTools)
        ? statsRes.topTools.slice(0, 8)
        : [];
      const totalToolCalls = toolEvents || topTools.reduce((s, t) => s + t.count, 0);

      const budget: BudgetInfo = summaryRes?.budget ?? {
        dailyBudget: null, todayCost: 0, budgetStatus: 'ok', budgetPercent: 0,
      };

      setData({ totalTokens, totalCost, totalToolCalls, byWorkspace, byModel, topTools, budget });
      setBudgetInput(budget.dailyBudget != null ? String(budget.dailyBudget) : '');
    } catch { /* fallback */ }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveBudget = async () => {
    const trimmed = budgetInput.trim();
    // Empty clears the budget (null); otherwise a positive number.
    const value: number | null = trimmed === '' ? null : Number(trimmed);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      toast({ title: 'Enter a valid amount', description: 'Budget must be a positive dollar amount.', variant: 'destructive' });
      return;
    }
    setSavingBudget(true);
    try {
      const res = await adapter.fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyBudget: value }),
      });
      if (!res.ok) throw new Error('save failed');
      toast({ title: 'Daily budget saved', description: value === null ? 'Budget cleared.' : `Warn at 80% of $${value.toFixed(2)}/day.` });
      await load();
    } catch {
      toast({ title: 'Failed to save budget', description: 'Check server connection.', variant: 'destructive' });
    } finally {
      setSavingBudget(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--honey)]" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <BarChart3 className="w-8 h-8 text-[var(--text-dim)] mb-2" />
        <p className="text-sm text-[var(--text-muted)]">No telemetry data available.</p>
      </div>
    );
  }

  const { budget } = data;
  const budgetTone = budget.budgetStatus === 'exceeded' || budget.budgetStatus === 'warning' ? 'var(--risk)' : 'var(--healthy)';
  const maxModelCost = Math.max(...data.byModel.map(m => m.cost), 0.0001);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-4 py-3 border-b border-[var(--line-soft)]">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[var(--honey)]" />
          <h2 className="text-sm font-display font-semibold text-[var(--text)]">Usage &amp; cost</h2>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-5">
        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-[12px] bg-[var(--surface)] border border-[var(--line-soft)]">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="w-3.5 h-3.5 text-[var(--honey)]" />
              <span className="text-[10px] text-[var(--text-dim)] uppercase font-display tracking-wide">Total · est.</span>
            </div>
            <p className="text-lg font-display font-bold text-[var(--text)]">${data.totalCost.toFixed(2)}</p>
          </div>
          <div className="p-3 rounded-[12px] bg-[var(--surface)] border border-[var(--line-soft)]">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-[var(--intel)]" />
              <span className="text-[10px] text-[var(--text-dim)] uppercase font-display tracking-wide">Tokens</span>
            </div>
            <p className="text-lg font-display font-bold text-[var(--text)]">{data.totalTokens.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-[12px] bg-[var(--surface)] border border-[var(--line-soft)]">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="w-3.5 h-3.5 text-[var(--attention)]" />
              <span className="text-[10px] text-[var(--text-dim)] uppercase font-display tracking-wide">Tool Calls</span>
            </div>
            <p className="text-lg font-display font-bold text-[var(--text)]">{data.totalToolCalls.toLocaleString()}</p>
          </div>
        </div>

        {/* Daily budget (F8) — warns at 80% per the cost route's budgetStatus. */}
        <div className="rounded-[12px] border border-[var(--line-soft)] bg-[var(--surface)] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-display font-semibold text-[var(--text-dim)] uppercase tracking-wide">Daily budget</h3>
            {budget.dailyBudget != null && budget.dailyBudget > 0 && (
              <span className="text-[11px] font-medium" style={{ color: budgetTone }}>
                ${budget.todayCost.toFixed(2)} today · {budget.budgetPercent}% used
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[var(--text-muted)]">$</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={budgetInput}
              onChange={e => setBudgetInput(e.target.value)}
              aria-label="Daily spend budget in dollars"
              placeholder="No budget set"
              className="w-32 rounded-[8px] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[13px] text-[var(--text)] placeholder:text-[var(--text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--honey)]"
            />
            <span className="text-[12px] text-[var(--text-muted)]">/ day</span>
            <button
              onClick={saveBudget}
              disabled={savingBudget}
              className="ml-auto inline-flex items-center gap-1.5 rounded-[8px] bg-[var(--honey)] px-3 py-1.5 text-[12px] font-semibold text-[#1a1407] hover:bg-[var(--honey-bright)] disabled:opacity-50 transition-colors"
            >
              {savingBudget ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Set budget
            </button>
          </div>
          {budget.dailyBudget != null && budget.dailyBudget > 0 && (
            <>
              <div className="h-2 rounded-full bg-[var(--surface-3)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(budget.budgetPercent, 100)}%`, background: budgetTone }}
                />
              </div>
              {budget.budgetStatus !== 'ok' && (
                <p className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--risk)' }}>
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  {budget.budgetStatus === 'exceeded'
                    ? `Over budget — today's spend has passed your $${budget.dailyBudget.toFixed(2)} limit.`
                    : `Approaching budget — over 80% of your $${budget.dailyBudget.toFixed(2)} daily limit.`}
                </p>
              )}
            </>
          )}
        </div>

        {/* By model — per-model spend bars (from allTime.byModel). */}
        {data.byModel.length > 0 && (
          <div>
            <h3 className="text-[11px] font-display font-semibold text-[var(--text-dim)] uppercase tracking-wide mb-2">By model</h3>
            <div className="space-y-2">
              {data.byModel.map((m) => {
                const pct = (m.cost / maxModelCost) * 100;
                const isLocal = m.cost === 0;
                return (
                  <div key={m.model} className="grid grid-cols-[120px_1fr_64px] items-center gap-3">
                    <span className="truncate text-right text-[12.5px] font-medium text-[var(--text-2)]" title={m.model}>
                      {formatModelLabel(m.model)}
                    </span>
                    <div className="h-[22px] rounded-[6px] bg-[var(--surface-2)] border border-[var(--line-soft)] overflow-hidden">
                      <div
                        className="h-full"
                        style={{
                          width: `${Math.max(pct, isLocal ? 0 : 3)}%`,
                          background: isLocal ? 'var(--healthy)' : 'linear-gradient(90deg, var(--honey-deep), var(--honey))',
                        }}
                      />
                    </div>
                    <span className="text-right font-mono text-[12px] text-[var(--text-2)]">${m.cost.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* By workspace (TEAMS) */}
        {data.byWorkspace.length > 0 && (
          <div>
            <h3 className="text-[11px] font-display font-semibold text-[var(--text-dim)] uppercase tracking-wide mb-2">By workspace</h3>
            <div className="space-y-2">
              {data.byWorkspace.map((w, i) => {
                const pct = data.totalCost > 0 ? (w.costUsd / data.totalCost) * 100 : 0;
                return (
                  <div key={i} className="grid grid-cols-[120px_1fr_64px] items-center gap-3">
                    <span className="truncate text-right text-[12.5px] text-[var(--text)]">{w.workspaceName || w.workspaceId}</span>
                    <div className="h-[22px] rounded-[6px] bg-[var(--surface-2)] border border-[var(--line-soft)] overflow-hidden">
                      <div className="h-full" style={{ width: `${Math.max(pct, 2)}%`, background: 'var(--work)' }} />
                    </div>
                    <span className="text-right font-mono text-[12px] text-[var(--text-2)]">${w.costUsd.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top tools */}
        {data.topTools.length > 0 && (
          <div>
            <h3 className="text-[11px] font-display font-semibold text-[var(--text-dim)] uppercase tracking-wide mb-2">Tool usage</h3>
            <div className="grid grid-cols-2 gap-2">
              {data.topTools.map((t, i) => (
                <SurfaceRow
                  key={i}
                  className="px-3 py-2"
                  leading={<Zap className="w-3.5 h-3.5 text-[var(--honey)]" />}
                  title={<span className="font-mono text-[12px] font-normal">{t.name}</span>}
                  actions={<span className="font-mono text-[11px] text-[var(--text-muted)]">{t.count}×</span>}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TelemetryApp;
