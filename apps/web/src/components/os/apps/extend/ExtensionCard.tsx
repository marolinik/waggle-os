/**
 * ExtensionCard — one entry in the S21 Marketplace/Extend grid (UX-Refactor
 * Phase 4B). Lifecycle, scan/trust and source all render as TEXT (a11y rule —
 * never colour/icon alone). Federated entries get an honest provenance label
 * and an "Open in <app>" deep-link instead of a fake Install button (A5).
 */
import { Download, ExternalLink, Loader2, Package, Trash2 } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import type { Extension } from '@/lib/extension-catalog';

const SCAN_LABELS: Record<string, { tone: 'healthy' | 'attention' | 'risk'; label: string }> = {
  passed: { tone: 'healthy', label: 'Scan passed' },
  failed: { tone: 'risk', label: 'Scan failed' },
  not_scanned: { tone: 'attention', label: 'Not scanned' },
};

interface ExtensionCardProps {
  ext: Extension;
  installing?: boolean;
  onInstall?: (ext: Extension) => void;
  onUninstall?: (ext: Extension) => void;
  onOpenIn?: (appId: string) => void;
}

const ExtensionCard = ({ ext, installing, onInstall, onUninstall, onOpenIn }: ExtensionCardProps) => {
  const scan = ext.scanStatus ? SCAN_LABELS[ext.scanStatus] : null;
  return (
    <div
      data-testid="extension-card"
      className="flex items-start gap-3 p-3 rounded-xl border border-border/30 bg-secondary/20 hover:border-border/60 transition-colors"
    >
      <Package className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-display font-medium text-foreground truncate">{ext.name}</span>
          <StatusBadge
            tone={ext.installed ? 'healthy' : 'neutral'}
            label={ext.installed ? 'Installed' : 'Available'}
          />
          {scan && <StatusBadge tone={scan.tone} label={scan.label} />}
        </div>
        <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{ext.description}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{ext.type}</span>
          {ext.category && <span className="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{ext.category}</span>}
          {ext.trust && <span className="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground capitalize">{ext.trust}</span>}
          <span className="text-[11px] text-muted-foreground/60">{ext.source}</span>
        </div>
      </div>
      <div className="shrink-0">
        {ext.installable ? (
          ext.installed ? (
            ext.kind === 'package' && onUninstall ? (
              <button
                onClick={() => onUninstall(ext)}
                className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            ) : null
          ) : (
            <button
              onClick={() => onInstall?.(ext)}
              disabled={installing}
              data-testid={`extension-install-${ext.id}`}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
            >
              {installing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              Install
            </button>
          )
        ) : ext.openIn && onOpenIn ? (
          <button
            onClick={() => onOpenIn(ext.openIn!.appId)}
            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> {ext.openIn.label}
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default ExtensionCard;
