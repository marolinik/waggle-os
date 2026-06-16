import { useState } from 'react';
import { ShieldCheck, Info } from 'lucide-react';
import { SectionLabel } from '../warm';
import MemoryCenterTab from './memory/MemoryCenterTab';
import { cn } from '@/lib/utils';

/**
 * Memory Trust (screen 19, DESIGN_POV #1) — the warm-Hive PR3.5 front door for
 * the Memory surface. Two views behind a segmented control:
 *   - "Manage memory" (default): confidence/freshness + forget/correct/confirm.
 *   - "Why did you do that?": the goal→recall→checks→action trace.
 *
 * PR3.5 PHASING — this is **Phase A** (the shell): segmented control + per-view
 * editorial hero + trust-principle footer, wired as the new default Memory view.
 * The Manage body embeds the existing, functional `MemoryCenterTab` for now;
 * Phase B folds in the screen-19 stat bar + filter chips and Phase C replaces
 * the list with the native confidence-ring rows in a single editorial scroll.
 * Phase D builds the real "Why?" trace from `adapter.getMemoryTrace`. Until then
 * the Why view shows an honest empty state — never a synthesized reason.
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

/** Editorial eyebrow + honey-accented H1 + body, per the §2 design contract. */
function ManageHero() {
  return (
    <header className="mb-1">
      <p className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--honey)]">
        <span className="h-px w-5 bg-[var(--honey)]" aria-hidden="true" />
        Trust · the thing that makes you stay
      </p>
      <h1 className="text-[28px] font-[650] leading-tight tracking-[-0.02em] text-[var(--text)]">
        Memory you can <span className="text-[var(--honey)]">correct, age, and forget.</span>
      </h1>
      <p className="mt-3 max-w-[64ch] text-[15px] leading-[1.55] text-[var(--text-muted)]">
        A memory that only grows is a liability. Waggle shows you{' '}
        <b className="font-semibold text-[var(--text-2)]">how sure it is</b>,{' '}
        <b className="font-semibold text-[var(--text-2)]">how fresh it is</b>, and{' '}
        <b className="font-semibold text-[var(--text-2)]">where it came from</b> — and lets you fix or
        forget anything. You&rsquo;re always in control of what the hive believes.
      </p>
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

/** Phase D will render the real trace here. Until then: honest empty state. */
function WhyEmptyState() {
  return (
    <div className="rounded-[18px] border border-dashed border-[var(--line-soft)] bg-[var(--bg-2)] px-6 py-10 text-center">
      <Info className="mx-auto mb-3 h-6 w-6 text-[var(--intel)]" strokeWidth={1.8} />
      <p className="text-[14px] text-[var(--text-2)]">Open a memory&rsquo;s ⬡ trace to see why Waggle acted on it.</p>
      <p className="mx-auto mt-1.5 max-w-[52ch] text-[12.5px] leading-relaxed text-[var(--text-muted)]">
        The goal → recalled memories → checks → action chain is recorded with every agentic turn.
        Memories written by the agent link back to that trace; manually added or imported memories
        won&rsquo;t have one yet.
      </p>
    </div>
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

  return (
    <div className="flex h-full flex-col">
      {/* Sticky segmented control (§1) */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--line-soft)] bg-[var(--bg)]/80 px-5 py-3 backdrop-blur">
        <SectionLabel>Memory Trust · view</SectionLabel>
        <div role="tablist" aria-label="Memory Trust view" className="flex gap-0.5 rounded-[10px] border border-[var(--line-soft)] bg-[var(--surface-2)] p-[3px]">
          {SEGMENTS.map((s) => {
            const on = view === s.id;
            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={on}
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

      {/* Stage */}
      <div className="flex-1 min-h-0 flex flex-col">
        {view === 'manage' ? (
          <>
            <div className="mx-auto w-full max-w-[920px] shrink-0 px-8 pt-7">
              <ManageHero />
            </div>
            {/* Phase B/C replace this embed with the screen-19 stat bar + native
                confidence-ring rows in a single editorial scroll. */}
            <div className="mt-4 min-h-0 flex-1">
              <MemoryCenterTab mind={mind} workspaceId={workspaceId} />
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-auto">
            <div className="mx-auto w-full max-w-[920px] space-y-6 px-8 py-7">
              <WhyHero />
              <WhyEmptyState />
            </div>
          </div>
        )}
      </div>

      <TrustPrincipleFooter view={view} />
    </div>
  );
}
