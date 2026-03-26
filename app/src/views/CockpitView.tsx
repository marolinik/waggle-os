/**
 * CockpitView — Control Cockpit dashboard.
 *
 * Composes 10 card sub-components in a responsive 2-column grid:
 *   Visible (5): SystemHealth, CostDashboard, CronSchedules, Connectors, MemoryStats
 *   Collapsed (5): ServiceHealth, VaultSummary, CapabilityOverview, AgentTopology, AuditTrail
 *
 * Progressive disclosure: first 5 cards always visible, remaining 5 behind toggle.
 * KVARK card shown only when enterprise config is present.
 *
 * F8: Skeleton loading state while data is fetching, error recovery with retry.
 */

import { useState, useEffect, useCallback } from 'react';
import { HiveIcon } from '@/components/HiveIcon';
import {
  SystemHealthCard,
  CronSchedulesCard,
  CapabilityOverviewCard,
  AgentTopologyCard,
  ConnectorsCard,
  AuditTrailCard,
  MemoryStatsCard,
  ServiceHealthCard,
  VaultSummaryCard,
  CostDashboardCard,
} from '@/components/cockpit';
import type {
  HealthData,
  CronSchedule,
  AuditEntry,
  CapabilitiesData,
  ConnectorData,
  CostSummaryData,
  WorkspaceCostData,
} from '@/components/cockpit';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

// ── Constants ────────────────────────────────────────────────────────────

import { getServerBaseUrl } from '@/lib/ipc';

const BASE_URL = getServerBaseUrl();
const REFRESH_INTERVAL = 30_000;

// ── F8: Skeleton loading cards ───────────────────────────────────────────

function CockpitSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fit,minmax(420px,1fr))] gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} size="sm">
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── F8: Error state with retry ───────────────────────────────────────────

function CockpitError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16">
      <div className="text-muted-foreground text-sm">
        Unable to load cockpit data. Check your connection and try again.
      </div>
      <button
        onClick={onRetry}
        className="px-4 py-2 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────

export default function CockpitView() {
  // ── State ──────────────────────────────────────────────────────────────
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [schedules, setSchedules] = useState<CronSchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [capabilities, setCapabilities] = useState<CapabilitiesData | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [triggeringId, setTriggeringId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [connectors, setConnectors] = useState<ConnectorData[]>([]);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectToken, setConnectToken] = useState('');
  const [costSummary, setCostSummary] = useState<CostSummaryData | null>(null);
  const [workspaceCosts, setWorkspaceCosts] = useState<WorkspaceCostData | null>(null);
  const [expanded, setExpanded] = useState(false);

  // ── Fetchers ───────────────────────────────────────────────────────────

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) {
        setHealth(await res.json());
        setHealthError(false);
        setFetchError(false);
      } else {
        setHealthError(true);
      }
    } catch {
      setHealthError(true);
      setHealth(null);
    }
  }, []);

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/cron`);
      if (res.ok) {
        const data = await res.json();
        setSchedules(data.schedules ?? []);
      }
    } catch {
      /* silent */
    } finally {
      setSchedulesLoading(false);
    }
  }, []);

  const fetchAudit = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/audit/installs?limit=10`);
      if (res.ok) {
        const data = await res.json();
        setAuditEntries(data.entries ?? []);
      }
    } catch {
      /* silent */
    }
  }, []);

  const fetchCapabilities = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/capabilities/status`);
      if (res.ok) {
        setCapabilities(await res.json());
      }
    } catch {
      /* silent */
    }
  }, []);

  const fetchConnectors = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/connectors`);
      if (res.ok) {
        const data = await res.json();
        setConnectors(data.connectors ?? []);
      }
    } catch {
      /* silent */
    }
  }, []);

  const fetchCostSummary = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/cost/summary`);
      if (res.ok) {
        setCostSummary(await res.json());
      }
    } catch {
      /* silent */
    }
  }, []);

  const fetchWorkspaceCosts = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/cost/by-workspace`);
      if (res.ok) {
        setWorkspaceCosts(await res.json());
      }
    } catch {
      /* silent */
    }
  }, []);

  // ── F8: Fetch all data with error tracking ─────────────────────────────

  const fetchAll = useCallback(async () => {
    setInitialLoading(true);
    setFetchError(false);
    try {
      await Promise.all([
        fetchHealth(),
        fetchSchedules(),
        fetchCapabilities(),
        fetchAudit(),
        fetchConnectors(),
        fetchCostSummary(),
        fetchWorkspaceCosts(),
      ]);
    } catch {
      setFetchError(true);
    } finally {
      setInitialLoading(false);
    }
  }, [fetchHealth, fetchSchedules, fetchCapabilities, fetchAudit, fetchConnectors, fetchCostSummary, fetchWorkspaceCosts]);

  // ── Effects ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchAll();

    const interval = setInterval(fetchHealth, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAll, fetchHealth]);

  // ── Actions ────────────────────────────────────────────────────────────

  const toggleSchedule = useCallback(
    async (id: number, currentEnabled: boolean) => {
      setTogglingId(id);
      try {
        const res = await fetch(`${BASE_URL}/api/cron/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: !currentEnabled }),
        });
        if (res.ok) {
          await fetchSchedules();
        }
      } catch {
        /* silent */
      } finally {
        setTogglingId(null);
      }
    },
    [fetchSchedules],
  );

  const triggerSchedule = useCallback(
    async (id: number) => {
      setTriggeringId(id);
      try {
        const res = await fetch(`${BASE_URL}/api/cron/${id}/trigger`, { method: 'POST' });
        if (res.ok) {
          await fetchSchedules();
        }
      } catch {
        /* silent */
      } finally {
        setTriggeringId(null);
      }
    },
    [fetchSchedules],
  );

  const connectConnector = useCallback(
    async (id: string, token: string) => {
      setConnectingId(id);
      try {
        const res = await fetch(`${BASE_URL}/api/connectors/${id}/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (res.ok) {
          setConnectToken('');
          await fetchConnectors();
        }
      } catch {
        /* silent */
      } finally {
        setConnectingId(null);
      }
    },
    [fetchConnectors],
  );

  const disconnectConnector = useCallback(
    async (id: string) => {
      setConnectingId(id);
      try {
        await fetch(`${BASE_URL}/api/connectors/${id}/disconnect`, { method: 'POST' });
        await fetchConnectors();
      } catch {
        /* silent */
      } finally {
        setConnectingId(null);
      }
    },
    [fetchConnectors],
  );

  // ── Enterprise check for KVARK card ────────────────────────────────────
  const hasEnterpriseConfig = health && typeof (health as Record<string, unknown>).kvark === 'object' && (health as Record<string, unknown>).kvark !== null;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="px-6 py-6 max-w-[960px] mx-auto h-full overflow-y-auto honeycomb-bg">
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-lg font-semibold" style={{ color: 'var(--hive-50)' }}>Cockpit</h1>
        <span className="w-2 h-2 rounded-full heartbeat" style={{ backgroundColor: 'var(--status-healthy)' }} />
      </div>
      <p className="text-xs mb-6" style={{ color: 'var(--hive-400)' }}>
        Health, costs, schedules, runtime status, memory, services, and audit trail.
      </p>

      {/* Hero metric row */}
      {health && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="rounded-xl p-4 text-center waggle-card-lift" style={{ backgroundColor: 'var(--hive-850)', border: '1px solid var(--hive-700)', boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.05em] font-medium mb-1" style={{ color: 'var(--hive-500)' }}><HiveIcon name="frames" size={16} /> FRAMES</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--hive-50)' }}>{health.memoryStats?.frameCount ?? 0}</div>
          </div>
          <div className="rounded-xl p-4 text-center waggle-card-lift" style={{ backgroundColor: 'var(--hive-850)', border: '1px solid var(--hive-700)', boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.05em] font-medium mb-1" style={{ color: 'var(--hive-500)' }}><HiveIcon name="tokens" size={16} /> TOKENS</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--hive-50)' }}>{costSummary ? `${((costSummary.allTime.inputTokens + costSummary.allTime.outputTokens) / 1_000_000).toFixed(1)}M` : '0'}</div>
          </div>
          <div className="rounded-xl p-4 text-center waggle-card-lift" style={{ backgroundColor: 'var(--hive-850)', border: '1px solid var(--hive-700)', boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.05em] font-medium mb-1" style={{ color: 'var(--hive-500)' }}><HiveIcon name="cost" size={16} /> COST</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--hive-50)' }}>{costSummary ? `$${costSummary.today.estimatedCost.toFixed(2)}` : '$0'}</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--hive-400)' }}>today</div>
          </div>
          <div className="rounded-xl p-4 text-center waggle-card-lift" style={{ backgroundColor: 'var(--hive-850)', border: '1px solid var(--hive-700)', boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.05em] font-medium mb-1" style={{ color: 'var(--hive-500)' }}><HiveIcon name="health" size={16} /> HEALTH</div>
            <div className="text-2xl font-bold flex items-center justify-center gap-2" style={{ color: 'var(--hive-50)' }}>
              {health.status === 'ok' ? 'OK' : 'WARN'}
              <span className="w-2.5 h-2.5 rounded-full heartbeat" style={{ backgroundColor: health.status === 'ok' ? 'var(--status-healthy)' : 'var(--status-warning)' }} />
            </div>
          </div>
        </div>
      )}

      {/* F8: Show skeleton while initial load is in progress */}
      {initialLoading && !health && <CockpitSkeleton />}

      {/* F8: Show error state with retry when all fetches fail */}
      {!initialLoading && fetchError && healthError && !health && (
        <CockpitError onRetry={fetchAll} />
      )}

      {/* Main content — shown once data starts arriving */}
      {(!initialLoading || health) && !(fetchError && healthError && !health) && (
        <>
          {/* Always-visible cards (primary group — actionable cards first) */}
          <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fit,minmax(420px,1fr))] gap-4">
            <SystemHealthCard health={health} healthError={healthError} />
            <CostDashboardCard costSummary={costSummary} workspaceCosts={workspaceCosts} />
            <CronSchedulesCard
              schedules={schedules}
              schedulesLoading={schedulesLoading}
              togglingId={togglingId}
              triggeringId={triggeringId}
              onToggle={toggleSchedule}
              onTrigger={triggerSchedule}
              onCreated={fetchSchedules}
            />
            <ConnectorsCard
              connectors={connectors}
              connectingId={connectingId}
              connectToken={connectToken}
              onConnectTokenChange={setConnectToken}
              onConnect={connectConnector}
              onDisconnect={disconnectConnector}
            />
            <MemoryStatsCard health={health} />
          </div>

          {/* Show more / Show less toggle */}
          <div className="flex justify-center my-4">
            <button
              onClick={() => setExpanded((prev) => !prev)}
              className="flex items-center gap-1.5 text-xs font-medium px-4 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-expanded={expanded}
            >
              {expanded ? (
                <>
                  Show less
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 7.5L6 4.5L9 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              ) : (
                <>
                  Show more
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
          </div>

          {/* Collapsible cards (secondary group — passive/reference cards) */}
          {expanded && (
            <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fit,minmax(420px,1fr))] gap-4">
              <ServiceHealthCard health={health} />
              <VaultSummaryCard connectors={connectors} />
              <CapabilityOverviewCard capabilities={capabilities} />
              <AgentTopologyCard health={health} capabilities={capabilities} />
              <AuditTrailCard auditEntries={auditEntries} />

              {/* W5.6: Agent Learning — workflow capture visibility */}
              <Card>
                <CardHeader className="pb-2">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--honey-500)' }}>
                      <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
                      <line x1="9" y1="21" x2="15" y2="21" />
                      <line x1="10" y1="24" x2="14" y2="24" />
                    </svg>
                    Agent Learning
                  </h3>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-3">
                  <p className="leading-relaxed">
                    Your agent detects repeating patterns and suggests saving them as skills.
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--honey-500)' }} />
                      <span>Monitors tool sequences across sessions</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--honey-500)' }} />
                      <span>Triggers after 3+ repetitions of the same workflow</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--honey-500)' }} />
                      <span>Suggests saving patterns as reusable skills</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                    Captured patterns appear as skill suggestions in your chat. Install them from Skills &amp; Apps to automate recurring workflows.
                  </p>
                </CardContent>
              </Card>

              {/* W5.2: KVARK Enterprise health indicator — only shown when enterprise config present */}
              {hasEnterpriseConfig && (
                <Card>
                  <CardHeader className="pb-2">
                    <h3 className="text-sm font-semibold text-foreground">KVARK Enterprise</h3>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                      <span>Not configured</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                      KVARK enables enterprise knowledge access with data sovereignty, audit trails, and governed actions.
                      Configure in Settings &gt; Team.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
