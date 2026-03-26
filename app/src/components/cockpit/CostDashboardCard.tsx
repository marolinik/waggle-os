/**
 * CostDashboardCard — Real-time cost tracking card for the Cockpit.
 *
 * Shows: today's token usage + estimated cost, 7-day trend bar chart,
 * per-workspace breakdown, and budget alert.
 *
 * Part of PM-4 — Agent Cost Dashboard.
 */

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { CostSummaryData, WorkspaceCostData } from './types';

interface CostDashboardCardProps {
  costSummary: CostSummaryData | null;
  workspaceCosts: WorkspaceCostData | null;
}

/** Format a token count as a human-readable string (e.g. 1.2K, 3.4M). */
function formatTokens(n: number): string {
  if (n === 0) return '0';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

/** Format cost as dollars with appropriate precision. */
function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function BudgetBadge({ status, percent }: { status: string; percent: number }) {
  if (status === 'ok') return null;
  const color = status === 'exceeded'
    ? 'bg-red-500/15 text-red-400 border-red-500/30'
    : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
  const label = status === 'exceeded' ? 'Over budget' : `${percent}% of budget`;
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold', color)}>
      {label}
    </span>
  );
}

export function CostDashboardCard({ costSummary, workspaceCosts }: CostDashboardCardProps) {
  if (!costSummary) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm font-semibold tracking-wide">Cost Estimates</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground py-2">Loading cost data...</p>
        </CardContent>
      </Card>
    );
  }

  const { today, allTime, daily, budget } = costSummary;

  // Calculate max daily cost for bar chart scaling
  const maxDailyCost = Math.max(...daily.map(d => d.cost), 0.0001);

  // Workspace breakdown (top 5)
  const topWorkspaces = workspaceCosts?.workspaces?.slice(0, 5) ?? [];

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-semibold tracking-wide">
          Cost Estimates
          {budget.budgetStatus !== 'ok' && (
            <span className="ml-2">
              <BudgetBadge status={budget.budgetStatus} percent={budget.budgetPercent} />
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {/* ── Today summary ──────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-border bg-muted/10 px-3 py-2.5 text-center">
              <div className="text-lg font-bold font-mono text-primary leading-none">
                {formatTokens(today.inputTokens)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Input</div>
            </div>
            <div className="rounded-md border border-border bg-muted/10 px-3 py-2.5 text-center">
              <div className="text-lg font-bold font-mono text-primary leading-none">
                {formatTokens(today.outputTokens)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Output</div>
            </div>
            <div className="rounded-md border border-border bg-muted/10 px-3 py-2.5 text-center">
              <div className={cn(
                'text-lg font-bold font-mono leading-none',
                budget.budgetStatus === 'exceeded' ? 'text-red-400' :
                budget.budgetStatus === 'warning' ? 'text-yellow-400' :
                'text-green-400',
              )}>
                {formatCost(today.estimatedCost)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">Today</div>
            </div>
          </div>

          {/* ── Budget alert bar ─────────────────────────────── */}
          {budget.dailyBudget !== null && budget.dailyBudget > 0 && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Daily budget: {formatCost(budget.dailyBudget)}</span>
                <span>{budget.budgetPercent}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    budget.budgetStatus === 'exceeded' ? 'bg-red-500' :
                    budget.budgetStatus === 'warning' ? 'bg-yellow-500' :
                    'bg-green-500',
                  )}
                  style={{ width: `${Math.min(budget.budgetPercent, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* ── 7-day trend bar chart ───────────────────────── */}
          <div>
            <div className="text-[11px] text-muted-foreground mb-1.5 font-medium">Last 7 days</div>
            {daily.length === 0 ? (
              <div className="flex items-center justify-center h-10 text-[10px] text-muted-foreground/40">
                No usage data yet — send messages to start tracking
              </div>
            ) : (
              <>
                <div className="flex items-end gap-[3px] h-12">
                  {daily.slice(-7).map((d) => {
                    // IMP-6: Use pixel height for reliable rendering instead of percentage
                    const maxH = 48; // h-12 = 48px
                    const barH = maxDailyCost > 0 ? Math.max(Math.round((d.cost / maxDailyCost) * maxH), 4) : 4;
                    const isToday = d.date === daily[daily.length - 1]?.date;
                    return (
                      <div
                        key={d.date}
                        className="flex-1 flex flex-col items-center justify-end"
                        title={`${d.date}: ${formatCost(d.cost)} (${formatTokens(d.inputTokens + d.outputTokens)} tokens)`}
                      >
                        <div className="text-[8px] text-muted-foreground/40 mb-0.5">
                          {d.cost > 0 ? formatCost(d.cost) : ''}
                        </div>
                        <div
                          className={cn(
                            'w-full rounded-t-sm transition-all',
                            isToday ? 'bg-primary' : 'bg-primary/40',
                          )}
                          style={{ height: `${barH}px` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
                  {daily.slice(-7).map((d, i) => (
                    <span key={d.date} className="flex-1 text-center">
                      {i === 0 || i === daily.slice(-7).length - 1 ? d.date.slice(5) : ''}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Per-workspace breakdown ──────────────────────── */}
          {topWorkspaces.length > 0 && (
            <div>
              <div className="text-[11px] text-muted-foreground mb-1 font-medium">By workspace</div>
              <div className="flex flex-col gap-1">
                {topWorkspaces.map((ws) => (
                  <div key={ws.workspaceId} className="flex items-center gap-2 text-[11px]">
                    <span className="truncate flex-1 text-foreground/80">{ws.workspaceName}</span>
                    <span className="font-mono text-muted-foreground shrink-0">
                      {formatTokens(ws.inputTokens + ws.outputTokens)}
                    </span>
                    <span className="font-mono text-primary shrink-0 w-14 text-right">
                      {formatCost(ws.estimatedCost)}
                    </span>
                    <span className="text-muted-foreground shrink-0 w-8 text-right">
                      {ws.percentOfTotal}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── All-time totals ──────────────────────────────── */}
          <div className="text-[11px] text-muted-foreground pt-1 border-t border-border flex justify-between">
            <span>
              All-time: {formatTokens(allTime.inputTokens)} in / {formatTokens(allTime.outputTokens)} out
              {' '}({allTime.turns} turns)
            </span>
            <span className="font-mono">{formatCost(allTime.estimatedCost)}</span>
          </div>

          {/* ── Estimate disclaimer ──────────────────────────── */}
          <div className="text-[9px] text-muted-foreground/60 italic">
            Costs are estimates based on published model pricing. Resets on server restart.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
