/**
 * ApprovalsApp — Phase B.3 approvals inbox.
 *
 * Two tabs:
 *   1. Pending — live list of approval requests awaiting user decision.
 *      Approving/denying here routes through the same backend endpoint
 *      as inline chat approvals.
 *   2. Grants — persistent "always allow" decisions. Revoke individually
 *      or clear the whole list.
 *
 * This is the trust control surface for enterprise buyers. Every decision
 * the user has made about agent autonomy lives here, visible and
 * reversible.
 */

import { useState, useEffect, useCallback } from 'react';
import { Shield, ShieldCheck, Clock, X as XIcon, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { useToast } from '@/hooks/use-toast';

interface PendingApproval {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  timestamp: number;
}

interface Grant {
  id: string;
  toolName: string;
  targetKey: string;
  sourceWorkspaceId: string | null;
  description: string;
  grantedAt: string;
  expiresAt: string | null;
}

function formatRelative(iso: string | number): string {
  const t = typeof iso === 'number' ? iso : new Date(iso).getTime();
  if (!Number.isFinite(t)) return 'unknown';
  const diffMs = Date.now() - t;
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

function summarizeInput(input: Record<string, unknown>): string {
  // Show the most informative field for common gated tools
  const path = input.path ?? input.file_path ?? input.target_workspace_id;
  if (path) return String(path);
  if (input.command) return String(input.command).slice(0, 80);
  if (input.query) return String(input.query).slice(0, 80);
  return '';
}

const ApprovalsApp = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState<'pending' | 'grants'>('pending');
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [pendingRes, grantsRes] = await Promise.all([
        adapter.getPendingApprovals().catch(() => ({ pending: [], count: 0 })),
        adapter.getApprovalGrants().catch(() => ({ grants: [], count: 0 })),
      ]);
      setPending(pendingRes.pending ?? []);
      setGrants(grantsRes.grants ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Poll for pending approvals every 5s so the inbox stays live.
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const respond = async (req: PendingApproval, approved: boolean, always: boolean) => {
    try {
      await adapter.respondApproval(req.requestId, approved, { always });
      setPending(prev => prev.filter(p => p.requestId !== req.requestId));
      if (always && approved) {
        toast({
          title: 'Always allowed',
          description: `${req.toolName} is now allowed without prompting for this target.`,
        });
        refresh();
      } else {
        toast({
          title: approved ? 'Approved' : 'Denied',
          description: `${req.toolName} ${approved ? 'will run' : 'will not run'}.`,
        });
      }
    } catch {
      toast({ title: 'Failed to send response', variant: 'destructive' });
    }
  };

  const revokeGrant = async (grant: Grant) => {
    try {
      await adapter.revokeApprovalGrant(grant.id);
      setGrants(prev => prev.filter(g => g.id !== grant.id));
      toast({ title: 'Grant revoked', description: grant.description });
    } catch {
      toast({ title: 'Failed to revoke grant', variant: 'destructive' });
    }
  };

  const clearAllGrants = async () => {
    if (!confirm('Revoke ALL saved approval grants? This cannot be undone.')) return;
    try {
      await adapter.clearApprovalGrants();
      setGrants([]);
      toast({ title: 'All grants revoked', description: `${grants.length} grants cleared.` });
    } catch {
      toast({ title: 'Failed to clear grants', variant: 'destructive' });
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 shrink-0">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-display font-semibold text-foreground">Approvals</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setTab('pending')}
            className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${
              tab === 'pending'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            Pending {pending.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-semibold">{pending.length}</span>}
          </button>
          <button
            onClick={() => setTab('grants')}
            className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${
              tab === 'grants'
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            Grants {grants.length > 0 && <span className="ml-1 text-[10px] text-muted-foreground">({grants.length})</span>}
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Pending tab */}
      {tab === 'pending' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {pending.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <ShieldCheck className="w-10 h-10 text-emerald-500/40 mb-3" />
              <p className="text-sm font-display text-foreground">No pending approvals</p>
              <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
                When an agent tries to run a gated tool, the request will land here for your decision.
              </p>
            </div>
          )}
          {pending.map(req => {
            const inputSummary = summarizeInput(req.input);
            return (
              <div key={req.requestId} className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-display font-semibold text-foreground">{req.toolName}</p>
                      {inputSummary && (
                        <p className="text-[11px] text-muted-foreground font-mono truncate">{inputSummary}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
                    <Clock className="w-2.5 h-2.5" /> {formatRelative(req.timestamp)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => respond(req, true, false)}
                    className="flex-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-[11px] font-display hover:bg-primary/90 transition-colors"
                  >
                    Allow once
                  </button>
                  <button
                    onClick={() => respond(req, true, true)}
                    className="flex-1 px-2 py-1 rounded-md bg-emerald-500/20 text-emerald-400 text-[11px] font-display hover:bg-emerald-500/30 transition-colors"
                  >
                    Always allow
                  </button>
                  <button
                    onClick={() => respond(req, false, false)}
                    className="flex-1 px-2 py-1 rounded-md bg-destructive/20 text-destructive text-[11px] font-display hover:bg-destructive/30 transition-colors"
                  >
                    Deny
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Grants tab */}
      {tab === 'grants' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {grants.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <ShieldCheck className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-display text-foreground">No saved grants</p>
              <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
                When you click "Always allow" on an approval, the decision lands here. You can revoke any time.
              </p>
            </div>
          )}
          {grants.length > 0 && (
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-muted-foreground">
                {grants.length} active grant{grants.length === 1 ? '' : 's'}
              </p>
              <button
                onClick={clearAllGrants}
                className="text-[11px] text-destructive hover:text-destructive/80 transition-colors"
              >
                Revoke all
              </button>
            </div>
          )}
          {grants.map(grant => (
            <div key={grant.id} className="p-3 rounded-xl bg-secondary/30 border border-border/30 flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-display font-medium text-foreground">{grant.description}</p>
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                  tool: {grant.toolName}
                  {grant.sourceWorkspaceId && <> · from: {grant.sourceWorkspaceId}</>}
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                  granted {formatRelative(grant.grantedAt)}
                  {grant.expiresAt && <> · expires {formatRelative(grant.expiresAt)}</>}
                </p>
              </div>
              <button
                onClick={() => revokeGrant(grant)}
                className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                title="Revoke this grant"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ApprovalsApp;
