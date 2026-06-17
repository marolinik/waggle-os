/**
 * ExtensionCard — one entry in the Warm-Hive Marketplace grid (PR4 Variation
 * A). Type-aware one-click verbs driven by the shared install store:
 *   package  → Add     (Adding…)    → Installed
 *   connector→ Connect (Signing in…)→ Connected   (token-paste / OAuth→Hub, D3)
 *   mcp      → Enable  (Enabling…)  → Enabled
 * Lifecycle, scan/trust and source all render as TEXT (a11y — never colour
 * alone). The destructive Remove direction is delegated to the parent so it
 * keeps its consequence dialog; install/connect/enable are one-click (§09).
 */
import { useState } from 'react';
import { Download, ExternalLink, Loader2, Package, Plug, Trash2, Zap } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Input } from '@/components/ui/input';
import type { Extension } from '@/lib/extension-catalog';
import { isTogglable } from '@/lib/install-store';
import { useInstallStore } from '@/providers/InstallProvider';

const SCAN_LABELS: Record<string, { tone: 'healthy' | 'attention' | 'risk'; label: string }> = {
  passed: { tone: 'healthy', label: 'Scan passed' },
  failed: { tone: 'risk', label: 'Scan failed' },
  not_scanned: { tone: 'attention', label: 'Not scanned' },
};

/** Which one-click verb a togglable extension shows, by kind/type. */
type ActionKey = 'package' | 'connector' | 'mcp';
const VERBS: Record<ActionKey, { idle: string; busy: string; installed: string; Icon: typeof Download }> = {
  package: { idle: 'Add', busy: 'Adding…', installed: 'Installed', Icon: Download },
  connector: { idle: 'Connect', busy: 'Signing in…', installed: 'Connected', Icon: Plug },
  mcp: { idle: 'Enable', busy: 'Enabling…', installed: 'Enabled', Icon: Zap },
};

function actionKey(ext: Extension): ActionKey | null {
  if (ext.kind === 'package') return 'package';
  if (ext.type === 'connector') return 'connector';
  if (ext.type === 'mcp') return 'mcp';
  return null;
}

interface ExtensionCardProps {
  ext: Extension;
  /** Destructive uninstall — opens the parent's consequence dialog. */
  onRemove?: (ext: Extension) => void;
  /** Deep-link to a managing app (Hub) for OAuth connect + installed management. */
  onOpenIn?: (appId: string) => void;
}

const ExtensionCard = ({ ext, onRemove, onOpenIn }: ExtensionCardProps) => {
  const { isInstalled, isInstalling, install } = useInstallStore();
  const [showToken, setShowToken] = useState(false);
  const [token, setToken] = useState('');

  const scan = ext.scanStatus ? SCAN_LABELS[ext.scanStatus] : null;
  const key = actionKey(ext);
  // The store is authoritative for togglable kinds (so an install done in any
  // view reflects here); packs fall back to their loaded row.
  const installed = isTogglable(ext) ? isInstalled(ext.id) : ext.installed;
  const busy = isInstalling(ext.id);
  const verb = key ? VERBS[key] : null;
  const isOAuthConnector = ext.type === 'connector' && ext.authType === 'oauth2';

  const runPrimary = async () => {
    if (ext.type === 'connector') {
      if (isOAuthConnector) { onOpenIn?.(ext.openIn?.appId ?? 'connectors'); return; }
      setShowToken(true);
      return;
    }
    await install(ext); // package (Add) / catalog mcp (Enable) — one-click
  };

  const submitToken = async () => {
    const outcome = await install(ext, { token: token.trim() });
    if (outcome.ok) { setShowToken(false); setToken(''); }
  };

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
            tone={installed ? 'healthy' : 'neutral'}
            label={installed ? (verb?.installed ?? 'Installed') : 'Available'}
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

        {/* In-place connector token-paste (bearer/api_key/basic). OAuth never
            reaches here — it deep-links to the Hub above. */}
        {showToken && (
          <div className="flex items-center gap-1.5 mt-2">
            <Input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Paste API token — stored in your vault"
              data-testid="connector-token-input"
              className="flex-1 h-7 text-[11px]"
              autoFocus
            />
            <button
              onClick={() => void submitToken()}
              disabled={busy || token.trim() === ''}
              data-testid="connector-token-submit"
              className="px-2 py-1 text-[11px] rounded-lg text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Connect'}
            </button>
            <button
              onClick={() => { setShowToken(false); setToken(''); }}
              data-testid="connector-token-cancel"
              className="px-2 py-1 text-[11px] rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="shrink-0">
        {!verb ? (
          // Browse-only (pack) — no install path exists; nothing to act on.
          null
        ) : installed ? (
          ext.kind === 'package' && onRemove ? (
            <button
              onClick={() => onRemove(ext)}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Remove
            </button>
          ) : ext.openIn && onOpenIn ? (
            // Installed connector/mcp — manage (incl. disconnect/disable) in the Hub.
            <button
              onClick={() => onOpenIn(ext.openIn!.appId)}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> {ext.openIn.label}
            </button>
          ) : null
        ) : (
          // Not installed — the type-aware one-click verb.
          <button
            onClick={() => void runPrimary()}
            disabled={busy || showToken}
            data-testid={`extension-install-${ext.id}`}
            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <verb.Icon className="w-3 h-3" />}
            {busy ? verb.busy : verb.idle}
          </button>
        )}
      </div>
    </div>
  );
};

export default ExtensionCard;
