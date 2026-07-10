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
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { RiskBadge, riskToneForTool } from './power/power-primitives';

interface PendingApproval {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  timestamp: number;
  /** 'held' = a durable L2 action (assist Loop) — no grant path, approve runs it now. */
  source?: 'live' | 'held';
  riskLevel?: string;
  summary?: string | null;
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
  // Show the most informative field for common gated tools — including the
  // send_email recipient, the highest-exfiltration-risk field a human must see.
  if (input.to ?? input.recipient) {
    const to = String(input.to ?? input.recipient);
    return `To: ${to}${input.subject ? ` — ${String(input.subject)}` : ''}`;
  }
  const path = input.path ?? input.file_path ?? input.target_workspace_id;
  if (path) return String(path);
  if (input.command) return String(input.command).slice(0, 80);
  if (input.query) return String(input.query).slice(0, 80);
  return '';
}

/**
 * A held `create_skill` (and any proposal carrying `{name, content}`) must NOT
 * approve blind: the approver sees the skill's name up front and can expand the
 * exact bytes `writeSkill` will persist before allowing it. `summarizeInput`
 * surfaces none of `{name, content}`, so without this the card showed only the
 * tool name — a review-before-apply gap for the self-evolution loop.
 */
function SkillPreview({ name, content }: { name: string; content: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-1 mb-2">
      <p className="text-[11px] font-display text-[var(--text)]">
        Skill: <span className="font-mono font-semibold text-honey">{name}</span>
      </p>
      <button
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        className="mt-1 inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-foreground transition-colors"
      >
        {expanded ? 'Hide' : 'View'} skill content ({content.length} chars)
      </button>
      {expanded && (
        <pre className="mt-1.5 max-h-48 overflow-auto rounded-md border border-border/30 bg-secondary/30 p-2 text-[10px] leading-relaxed text-[var(--text-muted)] font-mono whitespace-pre-wrap break-words">
          {content}
        </pre>
      )}
    </div>
  );
}

/** Error state for the trust surface — a failed load must never read as empty. */
const ApprovalsError = ({ message, onRetry, retrying }: { message: string; onRetry: () => void; retrying: boolean }) => (
  <div role="alert" className="flex flex-col items-center justify-center h-full py-12 text-center">
    <AlertTriangle className="w-10 h-10 text-destructive/60 mb-3" />
    <p className="text-sm font-display text-foreground">Couldn't load approvals</p>
    <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
      The approvals service is unreachable. This is a load error — not an empty inbox. {message}
    </p>
    <button
      onClick={onRetry}
      disabled={retrying}
      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/15 text-honey text-[11px] font-display hover:bg-primary/25 transition-colors disabled:opacity-50"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} /> Retry
    </button>
  </div>
);

const ApprovalsApp = () => {
  const { toast } = useToast();
  const [tab, setTab] = useState<'pending' | 'grants'>('pending');
  const [pending, setPending] = useState<PendingApproval[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    // allSettled (not Promise.all + per-source .catch): a fetch FAILURE must
    // surface as an error on this trust surface, never be coerced into an empty
    // inbox. Partial success still renders (a grants failure doesn't hide pending).
    const [pendingRes, grantsRes] = await Promise.allSettled([
      adapter.getPendingApprovals(),
      adapter.getApprovalGrants(),
    ]);
    if (pendingRes.status === 'fulfilled') setPending(pendingRes.value.pending ?? []);
    if (grantsRes.status === 'fulfilled') setGrants(grantsRes.value.grants ?? []);
    const failure = pendingRes.status === 'rejected' ? pendingRes.reason
      : grantsRes.status === 'rejected' ? grantsRes.reason : null;
    setError(failure ? (failure instanceof Error ? failure.message : 'Failed to load approvals') : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    // Poll for pending approvals every 5s so the inbox stays live.
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const respond = async (req: PendingApproval, approved: boolean, always: boolean) => {
    const isHeld = req.source === 'held';
    try {
      const r = await adapter.respondApproval(req.requestId, approved, { always });
      setPending(prev => prev.filter(p => p.requestId !== req.requestId));
      if (!approved) {
        toast({ title: 'Denied', description: `${req.toolName} will not run.` });
      } else if (r?.ok === false) {
        // A held action approved but refused/failed at execute (200 {ok:false}).
        toast({ title: 'Action could not run', description: r.error, variant: 'destructive' });
      } else if (always && !isHeld) {
        toast({ title: 'Always allowed', description: `${req.toolName} is now allowed without prompting for this target.` });
        refresh();
      } else {
        toast({ title: 'Approved', description: `${req.toolName} ${isHeld ? 'has run' : 'will run'}.` });
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
          <Shield className="w-4 h-4 text-honey" />
          <h3 className="text-sm font-display font-semibold text-foreground">Approvals</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setTab('pending')}
            className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${
              tab === 'pending'
                ? 'bg-primary/15 text-honey'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            Pending {pending.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[var(--honey-wash)] text-[var(--attention)] text-[10px] font-semibold">{pending.length}</span>}
          </button>
          <button
            onClick={() => setTab('grants')}
            className={`px-2.5 py-1 rounded-md text-[11px] transition-colors ${
              tab === 'grants'
                ? 'bg-primary/15 text-honey'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            Grants {grants.length > 0 && <span className="ml-1 text-[10px] text-muted-foreground">({grants.length})</span>}
          </button>
          <HintTooltip content="Refresh">
            <button
              onClick={refresh}
              disabled={loading}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </HintTooltip>
        </div>
      </div>

      {/* Pending tab */}
      {tab === 'pending' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {error && <ApprovalsError message={error} onRetry={refresh} retrying={loading} />}
          {!error && pending.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <ShieldCheck className="w-10 h-10 text-[var(--healthy)] opacity-50 mb-3" />
              <p className="text-sm font-display text-foreground">No pending approvals</p>
              <p className="text-[11px] text-muted-foreground mt-1 max-w-xs">
                When an agent tries to run a gated tool, the request will land here for your decision.
              </p>
            </div>
          )}
          {pending.map(req => {
            const inputSummary = summarizeInput(req.input);
            // A held create_skill's args are {name, content} — surfaced via
            // SkillPreview so approval is never blind to the skill's bytes.
            const skillName = typeof req.input.name === 'string' ? req.input.name : null;
            const skillContent = typeof req.input.content === 'string' ? req.input.content : null;
            // Held (L2) actions have no "always allow" grant path — approve runs
            // them now. Risk is derived from the real tool name (trustworthy).
            const isHeld = req.source === 'held';
            const risk = riskToneForTool(req.toolName, req.input);
            const isElevated = risk !== 'low';
            return (
              <div
                key={req.requestId}
                className={`p-3 rounded-[14px] border ${
                  isElevated
                    ? 'bg-[var(--honey-wash)] border-[var(--honey-line)]'
                    : 'bg-[var(--surface)] border-[var(--line-soft)]'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className={`w-4 h-4 shrink-0 ${isElevated ? 'text-[var(--attention)]' : 'text-[var(--text-muted)]'}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <RiskBadge level={risk} />
                        <p className="text-xs font-display font-semibold text-[var(--text)] truncate">{req.toolName}</p>
                      </div>
                      {inputSummary && (
                        <p className="mt-1 text-[11px] text-[var(--text-muted)] font-mono truncate">{inputSummary}</p>
                      )}
                      {isHeld && req.summary && (
                        <p className="mt-0.5 text-[10px] text-[var(--text-dim)] truncate">Automation: {req.summary}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-[var(--text-dim)] flex items-center gap-1 shrink-0">
                    <Clock className="w-2.5 h-2.5" /> {formatRelative(req.timestamp)}
                  </span>
                </div>
                {skillName !== null && skillContent !== null && (
                  <SkillPreview name={skillName} content={skillContent} />
                )}
                <div className="flex items-center gap-1.5">
                  {isHeld ? (
                    // Held (L2): no "always allow" grant path — approve runs it now.
                    <>
                      <button
                        onClick={() => respond(req, true, false)}
                        className="flex-1 px-2 py-1 rounded-md bg-[var(--healthy-wash)] text-[var(--healthy)] text-[11px] font-display font-semibold hover:brightness-110 transition-[filter]"
                      >
                        Approve &amp; run
                      </button>
                      <button
                        onClick={() => respond(req, false, false)}
                        className="flex-1 px-2 py-1 rounded-md bg-[var(--risk-wash)] text-[var(--risk)] text-[11px] font-display hover:brightness-110 transition-[filter]"
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => respond(req, true, false)}
                        className="flex-1 px-2 py-1 rounded-md bg-[var(--honey)] text-[#1a1407] text-[11px] font-display font-semibold hover:bg-[var(--honey-bright)] transition-colors"
                      >
                        Allow once
                      </button>
                      <button
                        onClick={() => respond(req, true, true)}
                        className="flex-1 px-2 py-1 rounded-md bg-[var(--healthy-wash)] text-[var(--healthy)] text-[11px] font-display hover:brightness-110 transition-[filter]"
                      >
                        Always allow
                      </button>
                      <button
                        onClick={() => respond(req, false, false)}
                        className="flex-1 px-2 py-1 rounded-md bg-[var(--risk-wash)] text-[var(--risk)] text-[11px] font-display hover:brightness-110 transition-[filter]"
                      >
                        Deny
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Grants tab */}
      {tab === 'grants' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {error && <ApprovalsError message={error} onRetry={refresh} retrying={loading} />}
          {!error && grants.length === 0 && (
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
              <CheckCircle2 className="w-4 h-4 text-[var(--healthy)] shrink-0 mt-0.5" />
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
              <HintTooltip content="Revoke this grant">
                <button
                  onClick={() => revokeGrant(grant)}
                  className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </HintTooltip>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ApprovalsApp;
