import { useEffect, useState } from 'react';
import {
  Route, Loader2, CheckCircle2, XCircle, X, ChevronDown, ShieldAlert, ExternalLink,
} from 'lucide-react';
import { adapter } from '@/lib/adapter';
import type {
  RouteProposalPayload,
  RouteProposalConfirmBody,
  RouteProposalConfirmResponse,
} from '@/lib/route-proposals';

interface RouteProposalCardProps {
  proposal: RouteProposalPayload;
  /** Fired once the confirm dispatch lands — ChatApp consumes the composer text. */
  onDispatched?: (result: RouteProposalConfirmResponse) => void;
  /** Re-run propose after a revalidation_failed confirm (409). */
  onRePropose?: (preferredExecutorId?: string) => void;
}

type Phase = 'proposed' | 'dispatching' | 'dispatched' | 'rejected' | 'error';

/** Narrow a thrown adapter error to the A4 confirm 409 revalidation body. */
function revalidationReason(err: unknown): string | null {
  const body = (err as { body?: { error?: unknown; reason?: unknown } } | null)?.body;
  if (body && body.error === 'revalidation_failed') {
    return typeof body.reason === 'string' && body.reason
      ? body.reason
      : 'The chosen executor is no longer available.';
  }
  return null;
}

/**
 * Router arc P1-B (B2) — "Where should this run?" proposal card. Injected
 * client-side by the composer's Best fit action (ChatApp) and rendered as a
 * `route_proposal` content block (BlockRenderer). Matches the
 * CapabilityRequestCard tone: inline, quiet, act-without-leaving-the-thread.
 */
export default function RouteProposalCard({ proposal, onDispatched, onRePropose }: RouteProposalCardProps) {
  const [phase, setPhase] = useState<Phase>('proposed');
  const [egressOpen, setEgressOpen] = useState(false);
  const [removedFrameIds, setRemovedFrameIds] = useState<string[]>([]);
  const [executorId, setExecutorId] = useState<string>(proposal.selected?.id ?? '');
  const [dispatchResult, setDispatchResult] = useState<RouteProposalConfirmResponse | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);

  // A replaced proposal (re-propose keeps the same blockId/React key) must not
  // inherit the previous card's phase or stale executor selection.
  useEffect(() => {
    setPhase('proposed');
    setEgressOpen(false);
    setRemovedFrameIds([]);
    setExecutorId(proposal.selected?.id ?? '');
    setDispatchResult(null);
    setErrorReason(null);
  }, [proposal.routeDecisionId, proposal.selected?.id]);

  const blocked = proposal.egress === null && proposal.briefBlocked === true;
  const egressItems = proposal.egress?.items ?? [];
  const remainingItems = egressItems.filter(i => !removedFrameIds.includes(i.frameId));

  const removeFrame = (frameId: string) => {
    setRemovedFrameIds(prev => (prev.includes(frameId) ? prev : [...prev, frameId]));
  };

  const removeAllFrames = () => {
    setRemovedFrameIds(egressItems.map(i => i.frameId));
  };

  const confirm = async (opts?: { withoutMemory?: boolean }) => {
    setPhase('dispatching');
    setErrorReason(null);
    const removeIds = opts?.withoutMemory ? egressItems.map(i => i.frameId) : removedFrameIds;
    const body: RouteProposalConfirmBody = {
      ...(executorId && executorId !== proposal.selected?.id ? { executorId } : {}),
      ...(removeIds.length > 0 ? { removeFrameIds: removeIds } : {}),
    };
    try {
      const result = await adapter.routeProposals.confirm(proposal.routeDecisionId, body);
      setDispatchResult(result);
      setPhase('dispatched');
      onDispatched?.(result);
    } catch (err) {
      setPhase('error');
      const reason = revalidationReason(err);
      setErrorReason(reason ?? (err instanceof Error && err.message ? err.message : 'Dispatch failed'));
    }
  };

  const cancel = async () => {
    // The card collapses on the user's intent even if the reject POST fails.
    setPhase('rejected');
    try {
      await adapter.routeProposals.reject(proposal.routeDecisionId);
    } catch { /* best-effort — rejection is a learning signal, not a gate */ }
  };

  if (phase === 'rejected') {
    return (
      <div data-testid="route-proposal-card" className="my-2 px-3 py-1.5 text-xs text-muted-foreground italic">
        Routing cancelled
      </div>
    );
  }

  return (
    <div
      data-testid="route-proposal-card"
      className="my-2 rounded-xl border border-primary/40 bg-primary/5 p-3"
    >
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-lg bg-primary/15 shrink-0 mt-0.5">
          <Route className="w-4 h-4 text-honey" />
        </div>
        <div className="flex-1 min-w-0">
          {/* Header: question + selected executor + reason line */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-display font-semibold text-foreground">
              Where should this run?
            </span>
            {proposal.selected && (
              <span className="text-sm font-display text-honey truncate" data-testid="route-proposal-selected">
                {proposal.selected.displayName}
              </span>
            )}
          </div>
          {proposal.selected ? (
            <p className="text-xs text-muted-foreground mt-1" data-testid="route-proposal-reason">
              {proposal.selected.reason}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">
              No eligible executor is available right now.
            </p>
          )}

          {/* Blocked brief — B1 injection gate: run-without-memory only */}
          {blocked && phase !== 'dispatched' && (
            <div
              className="flex items-start gap-1.5 mt-2 text-[11px] text-amber-400"
              data-testid="route-proposal-blocked"
            >
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>
                Memory context was blocked by the safety scan
                {proposal.briefBlockedReason ? ` — ${proposal.briefBlockedReason}` : ''}. This task can
                only run without memory.
              </span>
            </div>
          )}

          {/* Egress disclosure — only when a brief accompanies the dispatch */}
          {!blocked && proposal.egress && phase !== 'dispatched' && (
            <div className="mt-2" data-testid="route-proposal-egress">
              <button
                type="button"
                onClick={() => setEgressOpen(o => !o)}
                aria-expanded={egressOpen}
                data-testid="route-proposal-egress-toggle"
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronDown className={`w-3 h-3 transition-transform ${egressOpen ? 'rotate-180' : ''}`} />
                Will send {remainingItems.length} workspace {remainingItems.length === 1 ? 'memory' : 'memories'} to{' '}
                <span className="text-foreground">{proposal.egress.destination}</span>
              </button>
              {egressOpen && (
                <ul className="mt-1.5 space-y-1">
                  {remainingItems.map(item => (
                    <li
                      key={item.frameId}
                      data-testid="route-proposal-egress-item"
                      className="flex items-start gap-1.5 rounded-lg bg-[var(--surface-2)] px-2 py-1 text-[11px]"
                    >
                      <span className="text-muted-foreground shrink-0">{item.date} · {item.source}</span>
                      <span className="text-foreground truncate flex-1">{item.preview}</span>
                      <button
                        type="button"
                        onClick={() => removeFrame(item.frameId)}
                        aria-label={`Remove memory ${item.frameId}`}
                        data-testid={`route-proposal-remove-${item.frameId}`}
                        className="shrink-0 text-muted-foreground/60 hover:text-destructive transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {remainingItems.length > 0 && (
                <button
                  type="button"
                  onClick={removeAllFrames}
                  data-testid="route-proposal-run-without-memory"
                  className="mt-1 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                >
                  Run without memory
                </button>
              )}
            </div>
          )}

          {/* Alternatives override — rejected greyed with reason tooltip */}
          {!blocked && phase === 'proposed' && proposal.selected
            && (proposal.alternatives.length > 0 || proposal.rejected.length > 0) && (
            <div className="mt-2">
              <label htmlFor={`route-executor-${proposal.routeDecisionId}`} className="sr-only">
                Override executor
              </label>
              <select
                id={`route-executor-${proposal.routeDecisionId}`}
                value={executorId}
                onChange={e => setExecutorId(e.target.value)}
                data-testid="route-proposal-executor-select"
                className="h-7 max-w-full rounded-lg border border-[var(--line-soft)] bg-[var(--surface-2)] px-2 text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                <option value={proposal.selected.id}>{proposal.selected.displayName} (suggested)</option>
                {proposal.alternatives.map(alt => (
                  <option key={alt.id} value={alt.id}>{alt.displayName}</option>
                ))}
                {proposal.rejected.map(rej => (
                  <option key={rej.id} value={rej.id} disabled title={rej.reason} className="text-muted-foreground/50">
                    {rej.id} — unavailable
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Cost line — verbatim from the API */}
          {proposal.costLine !== null && (
            <p className="text-[11px] text-muted-foreground mt-2" data-testid="route-proposal-cost-line">
              {proposal.costLine}
            </p>
          )}

          {/* Actions / terminal states */}
          <div className="flex items-center gap-2 mt-2.5">
            {phase === 'proposed' && (
              <>
                {blocked ? (
                  <button
                    type="button"
                    onClick={() => void confirm({ withoutMemory: true })}
                    disabled={!proposal.selected}
                    data-testid="route-proposal-run-without-memory"
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 font-display transition-colors disabled:opacity-50"
                  >
                    Run without memory
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void confirm()}
                    disabled={!proposal.selected}
                    data-testid="route-proposal-confirm"
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 font-display transition-colors disabled:opacity-50"
                  >
                    Confirm
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void cancel()}
                  data-testid="route-proposal-cancel"
                  className="px-2.5 py-1 text-xs rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 font-display transition-colors"
                >
                  Cancel
                </button>
              </>
            )}
            {phase === 'dispatching' && (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Dispatching…
              </span>
            )}
            {phase === 'dispatched' && dispatchResult && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-display" data-testid="route-proposal-dispatched">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {dispatchResult.mode === 'external' && dispatchResult.roomId ? (
                  <a
                    href={`/room?room=${encodeURIComponent(dispatchResult.roomId)}${dispatchResult.runId ? `&run=${encodeURIComponent(dispatchResult.runId)}` : ''}`}
                    data-testid="route-proposal-run-link"
                    className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-emerald-300 transition-colors"
                  >
                    Dispatched — view the run
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span>{dispatchResult.resultText ? 'Completed in this chat' : 'Running in this chat'}</span>
                )}
              </span>
            )}
            {phase === 'dispatched' && dispatchResult?.resultText && (
              <p
                className="w-full text-xs text-foreground/90 whitespace-pre-wrap mt-1.5 border-l-2 border-emerald-500/40 pl-2"
                data-testid="route-proposal-result-text"
              >
                {dispatchResult.resultText}
              </p>
            )}
            {phase === 'error' && (
              <>
                <span className="flex items-center gap-1.5 text-xs text-destructive" data-testid="route-proposal-error">
                  <XCircle className="w-3.5 h-3.5 shrink-0" /> {errorReason ?? 'Dispatch failed'}
                </span>
                {onRePropose && (
                  <button
                    type="button"
                    onClick={() => onRePropose(executorId || undefined)}
                    data-testid="route-proposal-re-propose"
                    className="px-2.5 py-1 text-xs rounded-lg border border-[var(--line-soft)] text-foreground hover:bg-muted/40 font-display transition-colors"
                  >
                    Re-propose
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
