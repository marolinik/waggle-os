/**
 * ComplianceDashboard — AI Act compliance status card for CockpitApp.
 *
 * Shows real-time compliance status per EU AI Act article,
 * workspace risk badges, and audit report export button.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Shield, CheckCircle2, AlertTriangle, XCircle, Download,
  Loader2, Activity, Eye, Clock, Database,
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

const ComplianceDashboard = () => {
  const [status, setStatus] = useState<ComplianceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await adapter.getComplianceStatus();
      setStatus(data);
    } catch { /* compliance not available */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleExport = async () => {
    setExporting(true);
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
    } catch { /* export failed */ }
    setExporting(false);
  };

  if (loading) {
    return (
      <div className="p-4 rounded-xl bg-secondary/30 border border-border/30">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-xs font-display font-semibold text-foreground">AI Act Compliance</h4>
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
          <h4 className="text-xs font-display font-semibold text-foreground">AI Act Compliance</h4>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">Compliance monitoring initializing...</p>
      </div>
    );
  }

  const articles = [
    { key: 'art12', label: 'Art. 12 Logging', data: status.art12Logging, icon: <Activity className="w-3 h-3" />, metric: `${status.art12Logging.totalInteractions}` },
    { key: 'art14', label: 'Art. 14 Oversight', data: status.art14Oversight, icon: <Eye className="w-3 h-3" />, metric: `${status.art14Oversight.humanActions}` },
    { key: 'art19', label: 'Art. 19 Retention', data: status.art19Retention, icon: <Clock className="w-3 h-3" />, metric: `${status.art19Retention.retentionDays}d` },
    { key: 'art26', label: 'Art. 26 Monitor', data: status.art26Monitoring, icon: <Database className="w-3 h-3" />, metric: `${status.art26Monitoring.activeMonitors.length}` },
  ];

  return (
    <div className="p-4 rounded-xl bg-secondary/30 border border-border/30">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <h4 className="text-xs font-display font-semibold text-foreground">AI Act Compliance</h4>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-display font-semibold border ${STATUS_COLORS[status.overall]}`}>
            {status.overall.toUpperCase()}
          </span>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title="Export audit report"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

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
          </div>
        ))}
      </div>

      {/* Art. 50 - model transparency */}
      <div className="flex items-center justify-between mt-2 px-1">
        <span className="text-[11px] text-muted-foreground">Art. 50 Model Transparency</span>
        {STATUS_ICONS[status.art50Transparency.status]}
      </div>
    </div>
  );
};

export default ComplianceDashboard;
