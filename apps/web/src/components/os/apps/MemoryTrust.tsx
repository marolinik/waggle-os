import { useState, useRef, useCallback, useEffect } from 'react';
import { ShieldCheck, Info } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { SectionLabel } from '../warm';
import MemoryTrustManage from './memory/MemoryTrustManage';
import MemoryTrustWhy from './memory/MemoryTrustWhy';
import { cn } from '@/lib/utils';

/**
 * Memory Trust (screen 19, DESIGN_POV #1) — the warm-Hive PR3.5 front door for
 * the Memory surface. Two views behind a segmented control:
 *   - "Manage memory" (default): confidence/freshness + forget/correct/confirm.
 *   - "Why did you do that?": the goal→recall→checks→action trace.
 *
 * PR3.5 PHASING — Phase A shipped the shell; **Phase B+C** built the native
 * Manage body (`MemoryTrustManage`: stat bar + filter chips + confidence-ring
 * rows with the 3-segment ⬡ provenance and forget/correct/confirm) in a single
 * editorial scroll. Phase D builds the real "Why?" trace from
 * `adapter.getMemoryTrace`. Until then the Why view shows an honest empty state
 * — never a synthesized reason.
 *
 * Theme toggle (the mock's ☾/☀) is intentionally omitted — PR1's global
 * ThemeProvider already owns theme; a screen-local toggle would be redundant.
 */

type TrustView = 'manage' | 'why';

interface MemoryTrustProps {
  /** Which mind this surface reads/writes (D2 two-mind split). */
  mind: 'personal' | 'workspace';
  /** Required when mind='workspace' — the workspace whose mind to show. */
  workspaceId?: string;
}

const SEGMENTS: { id: TrustView; label: string }[] = [
  { id: 'manage', label: 'Manage memory' },
  { id: 'why', label: 'Why did you do that?' },
];

/** localStorage flag — full editorial hero on the FIRST visit only; compact after. */
const HERO_SEEN_KEY = 'waggle:memory-hero-seen';

/** Editorial eyebrow + honey-accented H1 + body, per the §2 design contract.
 *  UX gold-standard H1: the full manifesto renders once; repeat visits get the
 *  compact form (eyebrow + smaller H1, paragraph hidden) so the stat block leads. */
function ManageHero({ compact }: { compact: boolean }) {
  return (
    <header className="mb-1" data-testid="memory-trust-hero" data-compact={compact ? 'true' : 'false'}>
      <p className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--honey)]">
        <span className="h-px w-5 bg-[var(--honey)]" aria-hidden="true" />
        Trust · inspect · correct · forget
      </p>
      <h1 className={cn(
        'font-[650] leading-tight tracking-[-0.02em] text-[var(--text)]',
        compact ? 'text-[20px]' : 'text-[28px]',
      )}>
        Memory you can <span className="text-[var(--honey)]">correct, age, and forget.</span>
      </h1>
      {!compact && (
        <p className="mt-3 max-w-[64ch] text-[15px] leading-[1.55] text-[var(--text-muted)]">
          A memory that only grows is a liability. Waggle shows you{' '}
          <b className="font-semibold text-[var(--text-2)]">how sure it is</b>,{' '}
          <b className="font-semibold text-[var(--text-2)]">how fresh it is</b>, and{' '}
          <b className="font-semibold text-[var(--text-2)]">where it came from</b> — and lets you fix or
          forget anything. You&rsquo;re always in control of what the hive believes.
        </p>
      )}
    </header>
  );
}

function WhyHero() {
  return (
    <header className="mb-1">
      <p className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--honey)]">
        <span className="h-px w-5 bg-[var(--honey)]" aria-hidden="true" />
        Provenance · accountability
      </p>
      <h1 className="text-[28px] font-[650] leading-tight tracking-[-0.02em] text-[var(--text)]">
        Ask the agent <span className="text-[var(--honey)]">&ldquo;why did you do that?&rdquo;</span>
      </h1>
      <p className="mt-3 max-w-[64ch] text-[15px] leading-[1.55] text-[var(--text-muted)]">
        Any action an agent takes can be traced back to the exact memories and sources behind it —
        so a wrong move is <b className="font-semibold text-[var(--text-2)]">diagnosable, not
        mysterious</b>. If a bad memory caused it, fix the memory right from the trace.
      </p>
    </header>
  );
}

/** §7 trust-principle footnote — rendered as a persistent footer in both views. */
function TrustPrincipleFooter({ view }: { view: TrustView }) {
  const Icon = view === 'manage' ? ShieldCheck : Info;
  return (
    <div className="shrink-0 border-t border-[var(--line-soft)] bg-[var(--bg-2)] px-6 py-3.5">
      <div className="mx-auto flex max-w-[920px] items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--healthy)]" strokeWidth={1.8} />
        <p className="text-[13px] leading-[1.6] text-[var(--text-muted)]">
          {view === 'manage' ? (
            <>
              <b className="text-[var(--text)]">Nothing is remembered behind your back.</b> Every memory
              is inspectable, editable, and forgettable — and forgetting is real: it&rsquo;s removed from
              recall and from anything Waggle says next. Confidence and freshness are shown so the agent
              (and you) can discount what&rsquo;s old or shaky instead of acting on it blindly.
            </>
          ) : (
            <>
              <b className="text-[var(--text)]">Every agent action keeps its trace.</b> The chain from
              goal → recalled memories → checks → action is stored with the result, so &ldquo;why did you
              do that?&rdquo; always has an answer — and the fix (correct or forget the offending memory)
              is one click from the explanation.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export default function MemoryTrust({ mind, workspaceId }: MemoryTrustProps) {
  const [view, setView] = useState<TrustView>('manage');
  // Hero demote: full manifesto only on the first-ever visit (flag read+set
  // once per mount, in the initializer, so it can't flip mid-session).
  const [heroCompact] = useState<boolean>(() => {
    try {
      const seen = localStorage.getItem(HERO_SEEN_KEY) === 'true';
      if (!seen) localStorage.setItem(HERO_SEEN_KEY, 'true');
      return seen;
    } catch {
      return false; // storage unavailable → keep the full hero (harmless)
    }
  });
  const [toast, setToast] = useState<string | null>(null);
  // Cross-view accountability loop: Manage row → "Why?" sets the trace target +
  // switches to Why; the Why view's "correct it" hands an id back to Manage's editor.
  const [traceMemoryId, setTraceMemoryId] = useState<string | null>(null);
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wsParam = mind === 'workspace' ? workspaceId : undefined;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);
  // Clear a pending toast timer on unmount (e.g. leaving the Trust tab) so it
  // can't fire setState after unmount (review L).
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const clearPendingOpen = useCallback(() => setPendingOpenId(null), []);
  const goToTrace = useCallback((id: string) => { setTraceMemoryId(id); setView('why'); }, []);
  const correctFromTrace = useCallback((id: string) => { setPendingOpenId(id); setView('manage'); }, []);
  const forgetFromTrace = useCallback(async (id: string) => {
    try {
      await adapter.deleteMemoryById(id, wsParam, mind);
      showToast(`Forgotten M-${id} — removed from recall`);
      setTraceMemoryId(null);
      setView('manage');
    } catch {
      showToast('Could not forget that memory');
    }
  }, [wsParam, mind, showToast]);

  return (
    <div className="relative flex h-full flex-col">
      {/* Sticky segmented control (§1) */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--line-soft)] bg-[var(--bg)]/80 px-5 py-3 backdrop-blur">
        <SectionLabel>Memory Trust · view</SectionLabel>
        {/* Plain toggle buttons (aria-pressed), NOT a role=tablist: it's nested
            inside the MemoryCenterApp tab bar and has no arrow-key tablist
            semantics — toggle buttons are natively keyboard-operable (review HIGH). */}
        <div role="group" aria-label="Memory Trust view" className="flex gap-0.5 rounded-[10px] border border-[var(--line-soft)] bg-[var(--surface-2)] p-[3px]">
          {SEGMENTS.map((s) => {
            const on = view === s.id;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                onClick={() => setView(s.id)}
                className={cn(
                  'rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                  on ? 'bg-[var(--honey)] text-[#1a1407]' : 'text-[var(--text-muted)] hover:text-[var(--text)]',
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        <span className="text-[12px] text-[var(--text-muted)]">
          {view === 'manage' ? (
            <><b className="font-semibold text-[var(--text-2)]">Manage</b> — forget, correct, confirm; see confidence &amp; freshness</>
          ) : (
            <><b className="font-semibold text-[var(--text-2)]">Why-trace</b> — every action explains itself</>
          )}
        </span>
      </div>

      {/* Stage — single editorial scroll per view (§ screen-19 layout) */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[920px] space-y-6 px-8 py-7">
          {view === 'manage' ? (
            <>
              <ManageHero compact={heroCompact} />
              <MemoryTrustManage
                mind={mind}
                workspaceId={workspaceId}
                onToast={showToast}
                onWhy={goToTrace}
                openMemoryId={pendingOpenId}
                onOpenConsumed={clearPendingOpen}
              />
            </>
          ) : (
            <>
              <WhyHero />
              <MemoryTrustWhy
                mind={mind}
                workspaceId={workspaceId}
                memoryId={traceMemoryId}
                onToast={showToast}
                onCorrect={correctFromTrace}
                onForget={forgetFromTrace}
              />
            </>
          )}
        </div>
      </div>

      <TrustPrincipleFooter view={view} />

      {/* Shared toast (§7) — green slide-up confirmation for forget/correct/confirm.
          Sits above the persistent principle footer (review L). */}
      {toast && (
        <div className="pointer-events-none absolute bottom-20 left-1/2 z-50 -translate-x-1/2" role="status" aria-live="polite">
          <div className="flex items-center gap-2 rounded-full border border-[var(--healthy)] bg-[var(--surface)] px-4 py-2 text-[13px] text-[var(--text)] shadow-lg">
            <span className="h-2 w-2 rounded-full bg-[var(--healthy)]" aria-hidden="true" />
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
