import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useHasWorkingModel } from '@/hooks/useHasWorkingModel';

interface NoModelBannerProps {
  /** Open Settings → Models so the user can add a key or a local model. */
  onSetup: () => void;
}

/**
 * PR5 D2 — the safety net for the onboarding model gate's "I'll do this later"
 * escape (and for any install that reaches Home without a model). Renders nothing
 * once ≥1 working model exists, and nothing while readiness is still loading (so it
 * never flashes on a cold load). A zero-model session errors on the first task —
 * this nudges back to the gate instead of dead-ending.
 */
export function NoModelBanner({ onSetup }: NoModelBannerProps) {
  const { hasWorkingModel, loading } = useHasWorkingModel();
  if (loading || hasWorkingModel) return null;
  return (
    <div
      role="status"
      className="mx-auto mb-3 flex max-w-[920px] items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3"
    >
      <AlertTriangle className="size-4 shrink-0 text-primary" aria-hidden />
      <div className="flex-1 text-sm text-foreground">
        <span className="font-medium">No model yet.</span>{' '}
        <span className="text-muted-foreground">
          Add a provider key or a local model so your agent can actually run.
        </span>
      </div>
      <button
        type="button"
        onClick={onSetup}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Set up a model <ArrowRight className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
