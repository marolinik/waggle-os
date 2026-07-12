/**
 * ConnectorCard — one connector row in the Connector Hub (UX-Refactor Phase 4B,
 * S07; design-system-delta net-build #14). Extracted from the inline row JSX of
 * the old ConnectorsApp. Renders the §14.7 per-row states via StatusBadge
 * (connected · disconnected · expired token · error · syncing), the C16
 * lastSyncAt stamp, and the action set: Connect / Sync now / Disconnect /
 * Revoke / History.
 *
 * Per-row async state (sync, lazy health, audit history) lives HERE; the
 * shared credential inputs + the revoke confirm stay in the parent so the
 * R4-007 credential-isolation guarantee (one shared input pair, reset on
 * target change) is preserved.
 */
import { useState } from 'react';
import {
  ChevronDown, ChevronRight, CheckCircle2, ExternalLink, History,
  Loader2, Plug, RefreshCw, ShieldOff, Trash2, Zap,
} from 'lucide-react';
import type { ConnectorDefinition, ConnectorHealth } from '@waggle/shared';
import { Input } from '@/components/ui/input';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { adapter } from '@/lib/adapter';
import { DATE_LOCALE } from '@/lib/date-locale';
import { cn } from '@/lib/utils';
import BrandTile from './BrandTile';
import { getBrandIdentity } from './brand-identity';
import InstallAuditPanel from '../extend/InstallAuditPanel';

/** §14.7 per-row status → badge tone + text label (never colour alone). */
export function connectorStatusBadge(status: string, syncing: boolean): { tone: StatusTone; label: string } {
  if (syncing) return { tone: 'info', label: 'Syncing…' };
  switch (status) {
    case 'connected': return { tone: 'healthy', label: 'Connected' };
    case 'expired': return { tone: 'attention', label: 'Token expired' };
    case 'error': return { tone: 'risk', label: 'Error' };
    default: return { tone: 'neutral', label: 'Not connected' };
  }
}

const CONTROL_FOCUS_CLASS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-background';

export interface ConnectorSetupHint {
  url?: string;
  placeholder?: string;
  steps?: string[];
}

interface ConnectorCardProps {
  conn: ConnectorDefinition;
  categoryLabel: string;
  hint?: ConnectorSetupHint;
  expanded: boolean;
  onToggle: () => void;
  /** Shared credential inputs (single pair, parent-owned — R4-007). */
  tokenInput: string;
  emailInput: string;
  onTokenChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  connecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  /** Opens the parent's revoke confirm (scope-and-consequence modal). */
  onRevoke: () => void;
  /** Called after a sync attempt so the parent can refresh lastSyncAt. */
  onSynced: (result: { ok: boolean; status?: string }) => void;
}

const ConnectorCard = ({
  conn, categoryLabel, hint, expanded, onToggle,
  tokenInput, emailInput, onTokenChange, onEmailChange,
  connecting, onConnect, onDisconnect, onRevoke, onSynced,
}: ConnectorCardProps) => {
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [health, setHealth] = useState<ConnectorHealth | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const isConnected = conn.status === 'connected';
  const isExpired = conn.status === 'expired';
  const needsEmail = conn.id === 'jira';
  const identity = getBrandIdentity(conn.id, conn.name, categoryLabel);
  const badge = connectorStatusBadge(conn.status, syncing);

  /** C16: sync-now is a HEALTH PROBE + lastSyncAt stamp — not a data re-pull. */
  const handleSync = async () => {
    setSyncing(true);
    setSyncNotice(null);
    try {
      const res = await adapter.syncConnector(conn.id);
      if (res.ok) {
        setSyncNotice('Connection verified — last-sync stamped. (Sync checks health; it does not re-pull data.)');
      } else {
        setSyncNotice(`Sync failed — health status: ${res.status ?? 'unknown'}. No last-sync stamp written.`);
      }
      onSynced(res);
    } catch (err) {
      setSyncNotice(`Sync failed — ${err instanceof Error ? err.message : 'server unreachable'}`);
      onSynced({ ok: false });
    } finally {
      setSyncing(false);
    }
  };

  const handleExpand = () => {
    onToggle();
    // Lazy health probe on expand of a connected row (the dead-until-now
    // adapter.getConnectorHealth gets its first consumer here).
    if (!expanded && (isConnected || isExpired) && !health) {
      adapter.getConnectorHealth(conn.id).then(setHealth).catch(() => { /* non-blocking */ });
    }
  };

  return (
    <div className="group rounded-xl border border-border/30 overflow-hidden transition-colors hover:border-primary/30 hover:bg-secondary/10">
      <button onClick={handleExpand} aria-expanded={expanded}
        className={cn('w-full flex items-center justify-between gap-3 p-2.5 transition-colors', CONTROL_FOCUS_CLASS)}>
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <BrandTile identity={identity} size={36} connected={isConnected} />
          <div className="text-left min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-display font-semibold text-foreground truncate">{conn.name}</span>
              <StatusBadge tone={badge.tone} label={badge.label} />
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {conn.description && <p className="text-[11px] text-muted-foreground line-clamp-1">{conn.description}</p>}
              {conn.lastSyncAt && (
                <span className="text-[10px] text-muted-foreground/80 shrink-0">
                  Last sync {new Date(conn.lastSyncAt).toLocaleString(DATE_LOCALE)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isConnected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-border/20 pt-2 space-y-2">
          {/* What this connector unlocks */}
          {conn.capabilities && conn.capabilities.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {conn.capabilities.map(cap => (
                <span key={cap} className="px-1.5 py-0.5 text-[11px] rounded bg-primary/10 text-honey">{cap}</span>
              ))}
            </div>
          )}

          {/* Lazy health detail (token expiry + last check) */}
          {health && (
            <p className="text-[11px] text-muted-foreground">
              Health: {health.status}
              {health.tokenExpiresAt && <> · token expires {new Date(health.tokenExpiresAt).toLocaleString(DATE_LOCALE)}</>}
              {health.lastChecked && <> · checked {new Date(health.lastChecked).toLocaleString(DATE_LOCALE)}</>}
            </p>
          )}

          {/* Setup guide */}
          {hint && !isConnected && (
            <div className="space-y-1">
              {hint.steps?.map((step, i) => (
                <p key={i} className="text-[11px] text-muted-foreground"><span className="text-honey font-medium">{i + 1}.</span> {step}</p>
              ))}
              {hint.url && (
                <a href={hint.url} target="_blank" rel="noopener noreferrer"
                  className={cn('inline-flex items-center gap-1 rounded-sm text-[11px] text-honey hover:text-honey/80', CONTROL_FOCUS_CLASS)}>
                  <ExternalLink className="w-3 h-3" /> Open {conn.name}
                </a>
              )}
            </div>
          )}
          {!hint && !isConnected && conn.setupGuide && (
            <p className="text-[11px] text-muted-foreground">{conn.setupGuide}</p>
          )}

          {syncNotice && (
            <p role="status" className="text-[11px] text-muted-foreground bg-muted/40 rounded-md px-2 py-1">{syncNotice}</p>
          )}

          {isConnected || isExpired ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              {isConnected && (
                <span className="text-[11px] text-emerald-400 flex items-center gap-1"><Zap className="w-3 h-3" /> Agent can use {conn.name} tools</span>
              )}
              {isExpired && (
                <span className="text-[11px] text-amber-400">Token expired — reconnect below or paste a fresh token</span>
              )}
              <div className="ml-auto flex items-center gap-1">
                <HintTooltip content="Re-checks the connection and stamps the last-sync time. Does not re-pull data (C16).">
                  <button onClick={() => void handleSync()} disabled={syncing}
                    className={cn('flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-honey hover:bg-primary/10 disabled:opacity-50 transition-colors', CONTROL_FOCUS_CLASS)}>
                    {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Sync now
                  </button>
                </HintTooltip>
                <button onClick={() => setShowHistory(h => !h)}
                  className={cn('flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-muted-foreground hover:bg-muted/40 transition-colors', CONTROL_FOCUS_CLASS)}>
                  <History className="w-3 h-3" /> History
                </button>
                <HintTooltip content="Removes the stored credential but keeps OAuth tokens — reconnect restores access.">
                  <button onClick={onDisconnect}
                    className={cn('flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-muted-foreground hover:bg-muted/40 transition-colors', CONTROL_FOCUS_CLASS)}>
                    <Trash2 className="w-3 h-3" /> Disconnect
                  </button>
                </HintTooltip>
                <HintTooltip content="The strong path: purges every stored credential AND provider OAuth tokens, with an audit entry.">
                  <button onClick={onRevoke}
                    className={cn('flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-destructive hover:bg-destructive/10 transition-colors', CONTROL_FOCUS_CLASS)}>
                    <ShieldOff className="w-3 h-3" /> Revoke
                  </button>
                </HintTooltip>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {/* Placeholders are not accessible names (they vanish on input
                  and AT exposure is inconsistent) — every credential input
                  needs an explicit aria-label. */}
              {needsEmail && (
                <Input type="email" name="connectorEmail" autoComplete="email" inputMode="email" spellCheck={false}
                  value={emailInput} onChange={e => onEmailChange(e.target.value)} placeholder="Your Atlassian email"
                  aria-label="Atlassian account email"
                  className="w-full bg-muted/50 text-xs h-auto py-1" />
              )}
              <div className="flex gap-2">
                <Input type="password" name="connectorToken" autoComplete="off" spellCheck={false}
                  value={tokenInput} onChange={e => onTokenChange(e.target.value)}
                  placeholder={hint?.placeholder ?? 'Paste token or API key'}
                  aria-label={`${conn.name} API token`}
                  className="flex-1 bg-muted/50 text-xs h-auto py-1 font-mono" />
                <button onClick={onConnect} disabled={!tokenInput.trim() || connecting}
                  className={cn('flex items-center gap-1 px-3 py-1 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors', CONTROL_FOCUS_CLASS)}>
                  {connecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plug className="w-3 h-3" />} Connect
                </button>
              </div>
              <div className="flex justify-end">
                <button onClick={() => setShowHistory(h => !h)}
                  className={cn('flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-muted-foreground hover:bg-muted/40 transition-colors', CONTROL_FOCUS_CLASS)}>
                  <History className="w-3 h-3" /> History
                </button>
              </div>
            </div>
          )}

          {/* Per-connector audit drawer (C18 shared feed, scoped) */}
          {showHistory && (
            <div className="pt-1 border-t border-border/20" data-testid={`connector-history-${conn.id}`}>
              <InstallAuditPanel type="connector" capability={conn.id} limit={10} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ConnectorCard;
