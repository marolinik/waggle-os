import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Loader2, Check } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

/**
 * BuilderStepper — shared modal stepper shell for the Phase-3C builders
 * (S18 Agent / S19 Skill / S20 Automation; design-system-delta net-build #5).
 *
 * Body-portaled (AppWindow's CSS transform confines inline `fixed` overlays
 * to the window box) with useFocusTrap for Escape / Tab cycle / focus
 * restore — the house overlay idiom from the 3B dialogs.
 *
 * Navigation contract:
 *  - every step button stays in the Tab order (FilesAppTabs pattern — gated
 *    steps use aria-disabled, not disabled, so keyboard/SR users can still
 *    discover them);
 *  - the active step carries `aria-current="step"`;
 *  - jumping BACK is always allowed; jumping FORWARD requires every step in
 *    between (including the current one) to be valid — same gate as Next;
 *  - Finish only enables once EVERY step is valid;
 *  - the completed check renders only on steps the user has actually reached;
 *  - cancel (X / footer Cancel / Escape) is ignored while `busy` so closing
 *    mid-submit can't orphan an in-flight request;
 *  - backdrop clicks do NOT close: the builders carry multi-step drafts and
 *    one stray click outside the panel must not discard them (close stays
 *    explicit — Cancel, X, or Escape).
 */
export interface BuilderStep {
  readonly id: string;
  readonly label: string;
  /** Required fields satisfied — gates Next / forward jumps / Finish. */
  readonly valid: boolean;
}

interface BuilderStepperProps {
  title: string;
  subtitle?: string;
  steps: ReadonlyArray<BuilderStep>;
  current: number;
  onNavigate: (index: number) => void;
  onCancel: () => void;
  onFinish: () => void;
  finishLabel: string;
  busy?: boolean;
  /** Extra footer control rendered before Back/Next (e.g. a review-step check). */
  footerExtra?: ReactNode;
  /** Prefix for data-testids: `{testId}`, `{testId}-step-{id}`, `-back`, `-next`, `-finish`. */
  testId: string;
  children: ReactNode;
}

export const BuilderStepper = ({
  title, subtitle, steps, current, onNavigate, onCancel, onFinish,
  finishLabel, busy, footerExtra, testId, children,
}: BuilderStepperProps) => {
  // Standard modal-submit lock: while busy, every close affordance is inert
  // (a cancelled-looking close would leave the in-flight request running).
  const guardedCancel = () => { if (!busy) onCancel(); };
  const dialogRef = useFocusTrap<HTMLDivElement>(true, guardedCancel);
  const isLast = current === steps.length - 1;
  const allValid = steps.every((s) => s.valid);
  const reachable = (target: number) =>
    target <= current || steps.slice(current, target).every((s) => s.valid);
  // Furthest step the user has actually reached — the completed check must
  // not render on never-visited steps whose `valid` defaults to true.
  const [maxVisited, setMaxVisited] = useState(current);
  useEffect(() => { setMaxVisited((m) => Math.max(m, current)); }, [current]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
      data-testid={`${testId}-backdrop`}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-xl max-h-[85vh] flex flex-col bg-card border border-border rounded-2xl shadow-xl"
        data-testid={testId}
      >
        <div className="px-5 pt-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-display font-semibold text-foreground">{title}</h3>
            {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={guardedCancel}
            aria-disabled={busy || undefined}
            aria-label={`Close ${title}`}
            className={`p-1 rounded hover:bg-muted/50 text-muted-foreground ${busy ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <ol aria-label={`${title} steps`} className="flex flex-wrap gap-1 px-5 pt-3 list-none">
          {steps.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => { if (reachable(i)) onNavigate(i); }}
                aria-disabled={!reachable(i) || undefined}
                aria-current={i === current ? 'step' : undefined}
                data-testid={`${testId}-step-${s.id}`}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                  i === current
                    ? 'border-primary/40 bg-primary/15 text-primary'
                    : reachable(i)
                      ? 'border-transparent bg-muted/50 text-muted-foreground hover:text-foreground'
                      : 'border-transparent bg-muted/30 text-muted-foreground/50'
                }`}
              >
                <span className="tabular-nums">{i + 1}.</span> {s.label}
                {s.valid && i !== current && i <= maxVisited && <Check className="w-2.5 h-2.5 text-emerald-400" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ol>
        <p className="px-5 pt-1 text-[10px] text-muted-foreground" aria-live="polite">
          Step {current + 1} of {steps.length} — {steps[current]?.label}
        </p>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-3">{children}</div>

        <div className="px-5 py-3 border-t border-border/30 flex items-center gap-2">
          <button
            onClick={guardedCancel}
            aria-disabled={busy || undefined}
            className={`px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:text-foreground ${busy ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Cancel
          </button>
          <div className="ml-auto flex items-center gap-2">
            {footerExtra}
            <button
              onClick={() => onNavigate(current - 1)}
              disabled={current === 0}
              data-testid={`${testId}-back`}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-secondary/50 text-foreground hover:bg-secondary/70 disabled:opacity-50"
            >
              <ChevronLeft className="w-3 h-3" /> Back
            </button>
            {isLast ? (
              <button
                onClick={onFinish}
                disabled={busy || !allValid}
                data-testid={`${testId}-finish`}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {busy && <Loader2 className="w-3 h-3 animate-spin" />} {finishLabel}
              </button>
            ) : (
              <button
                onClick={() => onNavigate(current + 1)}
                disabled={!steps[current]?.valid}
                data-testid={`${testId}-next`}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Next <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
