/**
 * ComplianceDashboard — AI Act compliance status card for CockpitApp.
 *
 * Shows real-time compliance status per EU AI Act article,
 * workspace risk badges, and audit report export button.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Shield, CheckCircle2, AlertTriangle, XCircle, Download,
  Loader2, Activity, Eye, Clock, Database, RefreshCw, HardDrive,
} from 'lucide-react';
import { adapter } from '@/lib/adapter';

interface ArticleStatus {
  status: 'compliant' | 'warning' | 'non-compliant';
  detail: string;
}

interface ComplianceStatus {
  overall: 'compliant' | 'warning' | 'non-compliant';
  art12Logging: ArticleStatus & { totalInteractions: number };
  art14Oversight: ArticleStatus & { humanActions: number; approvalRate: number };
  art19Retention: ArticleStatus & { oldestLogDate: string | null; retentionDays: number };
  art26Monitoring: ArticleStatus & { activeMonitors: string[] };
  art50Transparency: ArticleStatus & { modelsDisclosed: boolean };
}

interface HarvestSourceSummary {
  id: number;
  source: string;
  displayName: string;
  lastSyncedAt: string | null;
  itemsImported: number;
  framesCreated: number;
}

const STATUS_ICONS = {
  compliant: <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
  warning: <AlertTriangle className="w-3 h-3 text-amber-400" />,
  'non-compliant': <XCircle className="w-3 h-3 text-destructive" />,
};

const STATUS_COLORS = {
  compliant: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  warning: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  'non-compliant': 'text-destructive bg-destructive/10 border-destructive/20',
};

function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'unknown';
  const diffMs = Date.now() - then;
  if (diffMs < 0) return 'just now';
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

const ComplianceDashboard = () => {
  const [status, setStatus] = useState<ComplianceStatus | null>(null);
  const [harvestSources, setHarvestSources] = useState<HarvestSourceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const fetchStatus = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setRefreshing(true);
    setError(null);
    try {
      const [statusData, harvestData] = await Promise.all([
        adapter.getComplianceStatus(),
        adapter.getHarvestSources().catch(() => ({ sources: [] })),
      ]);
      setStatus(statusData);
      setHarvestSources(
        Array.isArray(harvestData?.sources) ? harvestData.sources as HarvestSourceSummary[] : [],
      );
      setLastRefreshed(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load compliance status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus({ silent: true });
  }, [fetchStatus]);

  const handleExport = async () => {
    setExporting(true);
    setExportNotice(null);
    try {
      const now = new Date();
      const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      const report = await adapter.exportComplianceReport({
        from: sixMonthsAgo.toISOString().split('T')[0],
        to: now.toISOString().split('T')[0],
        format: 'json',
        include: {
          interactions: true,
          oversight: true,
          models: true,
          provenance: true,
          riskAssessment: true,
          fria: false,
        },
      });

      // Download as JSON file
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `waggle-compliance-report-${now.toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportNotice('Report downloaded');
    } catch (err) {
      setExportNotice(err instanceof Error ? `Export failed: ${err.message}` : 'Export failed');
    } finally {
      setExporting(false);
      // Clear the toast after 4s so the surface stays clean
      setTimeout(() => setExportNotice(null), 4000);
    }
  };

  if (loading) {
    return (
      <div className="p-4 rounded-xl bg-secondary/30 border border-border/30">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-xs font-display font-semibold text-foreground">EU AI Act Compliance</h4>
        </div>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="p-4 rounded-xl bg-secondary/30 border border-border/30">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-xs font-display font-semibold text-foreground">EU AI Act Compliance</h4>
        </div>
        {error ? (
          <p className="text-[11px] text-destructive mt-2">{error}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground mt-2">Compliance monitoring initializing...</p>
        )}
        <button
          onClick={() => fetchStatus()}
          disabled={refreshing}
          className="mt-2 text-[11px] text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
        >
          {refreshing ? 'Retrying…' : 'Retry'}
        </button>
      </div>
    );
  }

  // When no interactions have been logged yet, per-article numeric metrics
  // are meaningless — show an em-dash so the user doesn't read "0 oversight
  // actions" as a compliance issue. Article status badges still reflect
  // the real state.
  const hasInteractions = status.art12Logging.totalInteractions > 0;
  const articles = [
    {
      key: 'art12',
      label: 'Art. 12 Logging',
      data: status.art12Logging,
      icon: <Activity className="w-3 h-3" />,
      metric: hasInteractions ? status.art12Logging.totalInteractions.toLocaleString() : '—',
      hint: hasInteractions ? 'interactions logged' : 'no interactions yet',
    },
    {
      key: 'art14',
      label: 'Art. 14 Oversight',
      data: status.art14Oversight,
      icon: <Eye className="w-3 h-3" />,
      metric: hasInteractions ? `${status.art14Oversight.humanActions}` : '—',
      hint: hasInteractions ? 'human actions' : 'awaiting activity',
    },
    {
      key: 'art19',
      label: 'Art. 19 Retention',
      data: status.art19Retention,
      icon: <Clock className="w-3 h-3" />,
      metric: status.art19Retention.retentionDays > 0 ? `${status.art19Retention.retentionDays}d` : '∞',
      hint: status.art19Retention.retentionDays > 0 ? 'days retained' : 'permanent',
    },
    {
      key: 'art26',
      label: 'Art. 26 Monitor',
      data: status.art26Monitoring,
      icon: <Database className="w-3 h-3" />,
      metric: `${status.art26Monitoring.activeMonitors.length}`,
      hint: 'active monitors',
    },
  ];

  const totalFramesHarvested = harvestSources.reduce((acc, s) => acc + (s.framesCreated ?? 0), 0);
  const mostRecentSync = harvestSources
    .map(s => s.lastSyncedAt)
    .filter((v): v is string => Boolean(v))
    .sort()
    .pop() ?? null;

  return (
    <div className="p-4 rounded-xl bg-secondary/30 border border-border/30">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-4 h-4 text-primary shrink-0" />
          <h4 className="text-xs font-display font-semibold text-foreground">EU AI Act Compliance</h4>
          {lastRefreshed && (
            <span className="text-[11px] text-muted-foreground truncate">
              · updated {formatRelative(lastRefreshed)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-display font-semibold border ${STATUS_COLORS[status.overall]}`}
            title={
              status.overall === 'warning'
                ? 'One or more articles need attention — hover each card for details. Most commonly: no interactions logged yet (Article 12).'
                : status.overall === 'non-compliant'
                  ? 'Critical gap — at least one article requirement is unmet. See per-article cards below.'
                  : 'All monitored articles meet their requirements.'
            }
          >
            {status.overall.toUpperCase()}
          </span>
          <button
            onClick={() => fetchStatus()}
            disabled={refreshing}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
            title="Refresh compliance status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
            title="Export audit report (last 180 days)"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Stale-data + export notice strip */}
      {(error || exportNotice) && (
        <div className={`mb-2 px-2 py-1 rounded text-[11px] ${
          error ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-400'
        }`}>
          {error ?? exportNotice}
        </div>
      )}

      {/* Article status grid */}
      <div className="grid grid-cols-2 gap-2">
        {articles.map(art => (
          <div
            key={art.key}
            className="p-2 rounded-lg bg-background/50 border border-border/20"
            title={art.data.detail}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1 text-muted-foreground">
                {art.icon}
                <span className="text-[11px]">{art.label}</span>
              </div>
              {STATUS_ICONS[art.data.status]}
            </div>
            <p className="text-sm font-display font-semibold text-foreground">{art.metric}</p>
            <p className="text-[10px] text-muted-foreground/70 truncate">{art.hint}</p>
          </div>
        ))}
      </div>

      {/* Art. 50 - model transparency */}
      <div className="flex items-center justify-between mt-2 px-1">
        <span className="text-[11px] text-muted-foreground">Art. 50 Model Transparency</span>
        {STATUS_ICONS[status.art50Transparency.status]}
      </div>

      {/* Harvest provenance — shows the actual imported memory surface so
          the dashboard is not a wall of zeros when no chat interactions
          have been logged yet. */}
      {harvestSources.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border/20">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <HardDrive className="w-3 h-3" />
              <span className="text-[11px] font-display font-medium">Data Provenance</span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {harvestSources.length} source{harvestSources.length === 1 ? '' : 's'}
              {' · '}{totalFramesHarvested.toLocaleString()} frames
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground/80">
            Last sync {formatRelative(mostRecentSync)}
            {harvestSources.length > 0 && (
              <> · {harvestSources.slice(0, 3).map(s => s.displayName).join(', ')}</>
            )}
            {harvestSources.length > 3 && <> +{harvestSources.length - 3}</>}
          </p>
        </div>
      )}
    </div>
  );
};

export default ComplianceDashboard;
