import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { useHasWorkingModel } from '@/hooks/useHasWorkingModel';
import { formatModelLabel } from '@/lib/model-label';

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
  const {
    hasWorkingModel,
    loading,
    availability,
    selectedModelId,
    refresh,
  } = useHasWorkingModel();
  if (hasWorkingModel || availability === 'checking') return null;

  const unavailable = availability === 'unavailable';
  const unknown = availability === 'unknown';
  const modelLabel = formatModelLabel(selectedModelId) || 'Saved model';
  const buttonClass = 'inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="mx-auto mb-3 flex max-w-[920px] flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3"
    >
      <AlertTriangle className="size-4 shrink-0 text-honey" aria-hidden />
      <div className="min-w-0 flex-1 text-sm text-foreground">
        <span className="font-medium">
          {unavailable
            ? `${modelLabel} isn’t responding.`
            : unknown
              ? 'Couldn’t check your model.'
              : 'No model yet.'}
        </span>{' '}
        <span className="text-muted-foreground">
          {unavailable
            ? 'It stays selected. Retry the connection, or review model settings.'
            : unknown
              ? 'Retry the check, or review model settings.'
              : 'Add a provider key or a local model so your agent can actually run.'}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {unavailable || unknown ? (
          <button
            type="button"
            onClick={() => refresh()}
            disabled={loading}
            className={`${buttonClass} bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            {loading ? 'Checking…' : 'Retry'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onSetup}
          className={`${buttonClass} ${unavailable || unknown
            ? 'border border-border bg-background text-foreground hover:bg-accent'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
        >
          {unavailable || unknown ? 'Review Model Settings' : 'Set Up a Model'}
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
