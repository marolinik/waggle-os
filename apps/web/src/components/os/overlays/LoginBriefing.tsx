/**
 * LoginBriefing — shown on desktop load after boot screen.
 * Displays memory highlights ("I remember...") and cross-workspace summary
 * with links to each workspace. Feels like a colleague catching you up.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion, type MotionProps } from 'framer-motion';
import { STAGGER, DUR, EASE_OUT } from '@/lib/motion/tokens';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import {
  Brain, Clock, MessageSquare, Sparkles, ChevronRight,
  Loader2, X, AlertTriangle, Lightbulb,
} from 'lucide-react';
import beeMascot from '@/assets/personas/general-purpose.png';
import { DATE_LOCALE } from '@/lib/date-locale';
import { useService } from '@/providers/ServiceProvider';
import { useRevalidateOnError } from '@/hooks/useRevalidateOnError';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import {
  formatBragLine,
  timeAgo as bragTimeAgo,
  type BragSummary,
} from '@/lib/login-briefing-brag';
// Lane H item 3 — the ONE briefing truth: fetch/shape/count live in
// briefing-source; the home hero recall strip and this modal both consume it,
// so their catch-up numbers can never drift.
import {
  takeBriefingData,
  isCannedWorkspaceSummary,
  type WorkspaceSummary,
  type MemoryHighlight,
} from '@/lib/briefing-source';
import { RecallCard } from './RecallCard';

interface LoginBriefingProps {
  /**
   * Called when the user closes the briefing. `permanent=true` signals
   * that the user picked "Don't show again" and the caller should set
   * the persistent dismiss flag; `permanent=false` (default) hides for
   * this session only and the briefing will reappear on next launch.
   */
  onDismiss: (permanent?: boolean) => void;
  onOpenWorkspace: (workspaceId: string) => void;
}

// timeAgo lives in @/lib/login-briefing-brag (shared with the brag summary so
// the header and per-frame labels use one formatter). Keep a local alias so
// callsites below read naturally.
const timeAgo = bragTimeAgo;

const LoginBriefing = ({ onDismiss, onOpenWorkspace }: LoginBriefingProps) => {
  const [summaries, setSummaries] = useState<WorkspaceSummary[]>([]);
  const [highlights, setHighlights] = useState<MemoryHighlight[]>([]);
  const [brag, setBrag] = useState<BragSummary | null>(null);
  const [loading, setLoading] = useState(true);
  // Wave W Lane B (item 1): bumped on every successful (re)load so the animated
  // recall cards + workspace rows re-key and replay their entrance stagger on
  // EVERY modal open (and post-error recovery) — not just the first paint, which
  // is all a prefetched-warm open would otherwise show.
  const [revealKey, setRevealKey] = useState(0);
  const reduceMotion = useReducedMotion();
  // P1b D3: a failed briefing load must NOT render the Day-0 empty-hook —
  // backend failure was indistinguishable from a brand-new user (and the
  // brag header sat on 'Loading…' forever).
  const [errored, setErrored] = useState(false);
  // P1b D3: defer the batch until the connect attempt settles (the 0609
  // HomeCockpit gate pattern) — gates on connecting-SETTLED, not connected,
  // so a failed connect still reaches the errored UI instead of a skeleton.
  const { connecting } = useService();
  // W2G: Escape/Tab-trap/focus-restore via the shared modal hook (the bespoke
  // overlay previously closed only on a backdrop click). Escape routes through
  // onDismiss — same session-only dismissal as the backdrop. Wave Q Lane A: the
  // errored state is NOT a blocking modal (it degrades to a slim row below), so
  // the trap only arms while the modal itself renders.
  const dialogRef = useFocusTrap<HTMLDivElement>(!errored, () => onDismiss());

  useEffect(() => {
    if (connecting) return;
    // W2G: the modal no longer computes its own greeting — that duplicated the
    // server-personalized Home greeting rendered directly behind it. Static
    // title now; identity is unused here.
    loadBriefing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connecting]);

  // D3 plus-clause: an errored briefing revalidates on focus/online/connect-settled.
  useRevalidateOnError(errored, () => { void loadBriefing(); });

  // Review fix: a connect settlement fires BOTH the [connecting] effect and
  // the revalidation bus listener — single-flight the (5+ fetch) batch.
  const loadInFlight = useRef(false);
  const loadBriefing = async () => {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    try {
      // Wave T Lane A (item 2): consume the BootScreen-warmed cache when present
      // (content is already there → no spinner), else fetch fresh. The shaping
      // lives in fetchBriefingData; this just lands it in React state.
      const data = await takeBriefingData();
      setHighlights(data.highlights);
      setSummaries(data.summaries);
      setBrag(data.brag);
      setErrored(false);
      // Fresh content landed → re-key the entrance so the stagger plays now.
      setRevealKey(k => k + 1);
    } catch {
      // P1b D3: surface the failure — do not let it fall through to the
      // Day-0 empty-hook render path.
      setErrored(true);
    }
    finally { setLoading(false); loadInFlight.current = false; }
  };

  const bragLine = brag ? formatBragLine(brag) : null;
  const totalPending = brag?.pendingCount ?? 0;

  // Wave S Lane E (honesty): omit rows that carry no information — a canned
  // brochure summary AND zero memories. Guarded on memoryCount so a workspace
  // with real memory content is NEVER hidden (its brochure text is suppressed
  // below instead). Brag header counts are untouched (they read memory stats,
  // not this list), so the digest and header stay consistent.
  const visibleSummaries = summaries.filter(
    (ws) => !(isCannedWorkspaceSummary(ws.summary) && ws.memoryCount === 0),
  );

  // Cap to 2 on first paint so the briefing greets rather than walls (the full
  // memory list lives in the Memory app). Hoisted so the entrance stagger can
  // continue its index from the recall cards into the workspace rows below.
  const shownHighlights = highlights.slice(0, 2);

  // Wave W Lane B (item 1): the product's hero moment deserves an entrance beat
  // that survives 2fps. Recall cards then workspace rows rise 8px + fade,
  // STAGGER.brief (80ms) apart, after a short base delay so the beat reads AFTER
  // the modal itself arrives. Duration/easing/stagger now resolve to the motion
  // vocabulary (DUR.base / EASE_OUT / STAGGER.brief) — one source of truth.
  // Reduced motion → instant (no rise/fade), honoring the header rule.
  const ENTER_BASE = 0.12;
  const entranceProps = (index: number): MotionProps =>
    reduceMotion
      ? { initial: false, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 8 },
          animate: { opacity: 1, y: 0 },
          transition: { delay: ENTER_BASE + index * STAGGER.brief, duration: DUR.base, ease: EASE_OUT },
        };

  // Wave Q Lane A (item 1): a failed briefing must never boot a blocking modal
  // stacked over the NoModelBanner + Home's own error state. When the fetch
  // errors we collapse to ONE slim, non-blocking, dismissible row — a calm
  // branded moment (honey glyph, quiet secondary Retry), not a red-triangle
  // alarm. Auto-recovers via useRevalidateOnError; the Retry is the manual
  // escape hatch. (When the sidecar is unreachable the whole briefing is
  // suppressed a level up in AppShell so the connection problem speaks once.)
  if (errored) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        // Bottom-RIGHT, not bottom-center: a centered toast sits in the content
        // column and collided with home's overnight headline (R12 judge catch).
        className="fixed bottom-6 right-6 z-[90] flex justify-end pointer-events-none"
      >
        <div
          role="status"
          data-testid="login-briefing-error"
          className="pointer-events-auto flex items-center gap-3 rounded-[12px] border border-[var(--line-soft)] bg-[var(--surface)] px-4 py-2.5 shadow-[var(--shadow-elevated)]"
        >
          <Brain className="h-4 w-4 shrink-0 text-[var(--honey-text)]" aria-hidden />
          <span className="text-[13px] text-[var(--text-2)]">Briefing unavailable</span>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--honey-text)]" aria-label="Retrying" />
          ) : (
            <button
              onClick={() => { setLoading(true); void loadBriefing(); }}
              data-testid="login-briefing-retry"
              className="rounded-[10px] border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[12.5px] font-medium text-[var(--text-2)] transition-colors hover:border-[var(--honey-line)] hover:text-[var(--text)]"
            >
              Retry
            </button>
          )}
          <button
            onClick={() => onDismiss()}
            aria-label="Dismiss briefing"
            className="rounded-lg p-1 text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-[3px] flex items-center justify-center p-8"
        onClick={() => onDismiss()}
      >
        <motion.div
          ref={dialogRef}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-briefing-title"
          tabIndex={-1}
          // Wave Q Lane A (item 3): a real elevated surface token instead of the
          // translucent `glass` — in light mode `glass` let the dark backdrop
          // bleed through as a muddy warm-gray; the opaque ivory `--surface`
          // reads as a genuine elevated card in both themes.
          className="w-full max-w-lg rounded-2xl border border-[var(--line-soft)] bg-[var(--surface)] p-6 shadow-[var(--shadow-elevated)] focus:outline-none"
          onClick={e => e.stopPropagation()}
        >
          {/* Header — X on the header baseline (items-start), not centered
              against the two-line title (Wave Q Lane A item 3). */}
          <div className="flex items-start justify-between mb-4">
            <div className="min-w-0">
              {/* Wave R Lane E — brand moment: a small hex-bee mascot beside the
                  title so the briefing greets like a colleague catching you up.
                  Decorative (alt=""); the title carries the accessible name. */}
              <div className="flex items-center gap-2">
                <img src={beeMascot} alt="" aria-hidden className="w-7 h-7 shrink-0" />
                <h2 id="login-briefing-title" className="text-lg font-display font-bold text-foreground">Catching you up</h2>
              </div>
              <p className="text-xs text-muted-foreground flex items-center flex-wrap gap-x-1 gap-y-0.5" data-testid="login-briefing-brag-line">
                <Brain className="w-3 h-3 inline mr-0.5 shrink-0" />
                <span>{bragLine ?? 'Loading…'}</span>
                {totalPending > 0 && (
                  <span
                    className="text-amber-400 inline-flex items-center gap-0.5"
                    title="Tasks or approvals waiting for you inside the workspaces below."
                  >
                    <AlertTriangle className="w-3 h-3" />
                    {totalPending} awaiting your OK
                  </span>
                )}
              </p>
            </div>
            <button onClick={() => onDismiss()} aria-label="Close briefing" className="p-1 rounded-lg hover:bg-muted/50 transition-colors shrink-0">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {loading ? (
            // Wave T Lane A (item 2): a progressive reveal, not a spinner in an
            // empty box — two honey-wash highlight placeholders + two neutral
            // workspace-row placeholders at the real heights, so the shape is
            // already right when the (usually prefetched) content lands.
            // aria-hidden: the header's aria-live region already speaks for load.
            <div className="space-y-4" data-testid="login-briefing-skeleton" aria-hidden>
              <div className="space-y-1.5">
                {[0, 1].map(i => (
                  <div key={i} className="h-[42px] rounded-lg border border-[var(--honey-line)] bg-[var(--honey-wash)] animate-pulse" />
                ))}
              </div>
              <div className="space-y-2">
                {[0, 1].map(i => (
                  <div key={i} className="h-[76px] rounded-xl border border-border/30 bg-secondary/30 animate-pulse" />
                ))}
              </div>
            </div>
          ) : highlights.length === 0 && summaries.length === 0 ? (
            // Day-0 user — no workspaces AND no memory yet. The bare
            // "no workspaces" line failed dim 3 (first-session hook in
            // <60s) in the 2026-05-28 addictiveness audit. Three demo
            // "what I'll remember for you" bubbles teach the value prop
            // concretely. Examples are explicitly labelled so this isn't
            // deceptive copy.
            // (FR-5's sample-workspace-load buttons were reverted 2026-05-28
            // as a redundant parallel of the existing workspace-templates
            // starterMemory system — see REDUNDANCY-AUDIT.md. The non-
            // redundant consolidation is to wire these to POST
            // /api/workspaces?templateId, tracked in FEATURE-REQUESTS.md.)
            <div className="py-2 space-y-3" data-testid="login-briefing-empty-hook">
              <div className="space-y-1.5">
                <p className="text-[11px] font-display font-semibold text-honey/80 uppercase tracking-wider flex items-center gap-1.5">
                  <Lightbulb className="w-3 h-3" /> Here's what I'll remember for you
                </p>
                {[
                  '"Last week we decided to prioritise compliance over speed for the launch."',
                  '"Sarah\'s feedback on the deck — slide 4 needs the regional breakdown."',
                  '"Voice for the Wednesday newsletter — punchy, contrarian, second-person."',
                ].map((demo, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.12 }}
                    className="flex items-start gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10 border-dashed"
                  >
                    <Sparkles className="w-3 h-3 text-honey/60 mt-0.5 shrink-0" />
                    <p className="text-[12px] text-foreground/70 italic leading-relaxed">{demo}</p>
                  </motion.div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground italic px-1">
                Examples. Your real memory populates as you chat — or import an existing ChatGPT/Claude export from the Memory app.
              </p>
            </div>
          ) : (
            <>
              {/* Memory highlights — "I remember..." */}
              {highlights.length > 0 && (
                <div className="mb-4 space-y-1.5">
                  <p className="text-[11px] font-display font-semibold text-honey/80 uppercase tracking-wider flex items-center gap-1.5">
                    <Lightbulb className="w-3 h-3" /> I remember
                  </p>
                  {/* Cap to 2 on first paint (shownHighlights) so the briefing
                      greets rather than walls — the full memory list lives in
                      the Memory app. */}
                  {/* Lane H item 4: the SAME RecallCard the home hero renders —
                      one recall-card grammar wherever the memory moment lands.
                      This modal owns only the STAGGER.brief entrance wrapper. */}
                  {shownHighlights.map((h, i) => (
                    <motion.div key={`${revealKey}-h-${i}`} {...entranceProps(i)}>
                      <RecallCard highlight={h} timeLabel={h.timestamp ? timeAgo(h.timestamp) : undefined} />
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Workspace list */}
              {visibleSummaries.length === 0 ? (
                <div className="text-center py-6">
                  <Sparkles className="w-8 h-8 text-honey/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No active workspaces yet. Create one to get started!</p>
                </div>
              ) : (
                // Wave R Lane E: a bottom edge-fade signals "more below" when
                // the list overflows its cap (>3 rows overflow max-h-60).
                <div className="relative">
                  <div className="space-y-2 max-h-60 overflow-auto">
                  {visibleSummaries.map((ws, j) => (
                    <motion.button
                      key={`${revealKey}-${ws.id}`}
                      {...entranceProps(shownHighlights.length + j)}
                      onClick={() => { onOpenWorkspace(ws.id); onDismiss(); }}
                      className="w-full text-left p-3 rounded-xl bg-secondary/30 border border-border/30 hover:bg-secondary/50 hover:border-primary/30 transition-all group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-display font-medium text-foreground">{ws.name}</span>
                          {/* FR #27: tooltip clarifies what the Personal/Team
                              tag means. Personal workspaces are private to the
                              account; Team workspaces (Pro/Teams tiers) are
                              shared. Without this hint the colored chip reads
                              as decorative metadata. */}
                          <HintTooltip
                            content={
                              ws.group === 'Personal'
                                ? 'Personal workspaces are visible only to you.'
                                : 'Team workspaces (Pro/Enterprise) are shared across the organisation.'
                            }
                          >
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground cursor-help">{ws.group}</span>
                          </HintTooltip>
                        </div>
                        <ChevronRight className="w-3 h-3 text-muted-foreground group-hover:text-honey transition-colors" />
                      </div>

                      {/* An empty workspace gets an honest nudge, not the
                          brochure line the server emits as its summary. Wave S
                          Lane E: a canned brochure summary on a kept row (real
                          memories but no generated summary yet) is suppressed —
                          template copy never renders as the user's data. */}
                      {ws.memoryCount === 0 && ws.sessionCount === 0 ? (
                        <p className="text-[11px] text-muted-foreground mb-1.5 italic">Nothing here yet — start a chat and I'll remember it.</p>
                      ) : ws.summary && !isCannedWorkspaceSummary(ws.summary) ? (
                        <p className="text-[11px] text-muted-foreground mb-1.5 line-clamp-2">{ws.summary}</p>
                      ) : null}

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        {/* Wave R Lane E: the bare glyph+number pairs were an
                            unlabelled ⬡/💬 count — name them for screen readers
                            and on hover (a11y). Icons are decorative. */}
                        <span
                          title={`${ws.memoryCount} ${ws.memoryCount === 1 ? 'memory' : 'memories'}`}
                          aria-label={`${ws.memoryCount} ${ws.memoryCount === 1 ? 'memory' : 'memories'}`}
                        >
                          <Brain className="w-2.5 h-2.5 inline mr-0.5" aria-hidden />{ws.memoryCount}
                        </span>
                        <span
                          title={`${ws.sessionCount} ${ws.sessionCount === 1 ? 'session' : 'sessions'}`}
                          aria-label={`${ws.sessionCount} ${ws.sessionCount === 1 ? 'session' : 'sessions'}`}
                        >
                          <MessageSquare className="w-2.5 h-2.5 inline mr-0.5" aria-hidden />{ws.sessionCount}
                        </span>
                        {/* FR #24/#26: only render the lastActive chip when the
                            workspace has actual activity. For a brand-new
                            workspace `lastActive` reflects creation time, not
                            work, so "Last active 5/1/2026" reads as if the user
                            already worked there when they haven't. */}
                        {ws.lastActive && (ws.memoryCount > 0 || ws.sessionCount > 0) && (
                          <span><Clock className="w-2.5 h-2.5 inline mr-0.5" />{new Date(ws.lastActive).toLocaleDateString(DATE_LOCALE)}</span>
                        )}
                        {ws.pendingTasks && ws.pendingTasks.length > 0 && (
                          <span className="text-amber-400"><AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />{ws.pendingTasks.length} pending</span>
                        )}
                      </div>
                    </motion.button>
                  ))}
                  </div>
                  {visibleSummaries.length > 3 && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-6 rounded-b-xl bg-gradient-to-t from-[var(--surface)] to-transparent"
                    />
                  )}
                </div>
              )}
            </>
          )}

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border/30 flex justify-between items-center gap-3">
            <HintTooltip content="Hide the briefing permanently. Re-enable in Settings → Advanced.">
              <button
                onClick={() => onDismiss(true)}
                data-testid="login-briefing-dont-show-again"
                className="text-[11px] text-[var(--text-tertiary)] hover:text-foreground transition-colors font-display"
              >
                Don't show again
              </button>
            </HintTooltip>
            <button
              onClick={() => onDismiss(false)}
              disabled={loading}
              data-testid="login-briefing-dismiss"
              className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-colors font-display disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start Working
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default LoginBriefing;
