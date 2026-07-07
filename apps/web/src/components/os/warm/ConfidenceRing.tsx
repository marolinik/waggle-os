import { cn } from '@/lib/utils';

interface ConfidenceRingProps {
  /**
   * 0–100 confidence. `undefined` means the substrate holds NO confidence for
   * this memory (it is a harvest-only signal) — the ring renders a neutral "—",
   * never a fabricated number (PR3 no-fabrication contract).
   */
  value?: number;
  className?: string;
}

/**
 * Band color for a confidence value (screen-19 §5a `confColor`):
 *   ≥85 → healthy (sage)  ·  ≥60 → attention (honey)  ·  <60 → risk (terracotta)
 */
export function confidenceColor(c: number): string {
  if (c >= 85) return 'var(--healthy)';
  if (c >= 60) return 'var(--attention)';
  return 'var(--risk)';
}

/**
 * 38px confidence ring (Memory-Trust screen-19 §5a). The "NN%" value AND the
 * 2px ring border are both colored by band. When `value` is undefined a quiet
 * "unscored" text badge renders instead — the honest "no confidence stored"
 * state (curated / agent / quick-capture frames carry no confidence; only
 * harvest does). Never defaults a number, never an empty dial (Wave F fix 3a).
 */
export function ConfidenceRing({ value, className }: ConfidenceRingProps) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return (
      <div className={cn('flex w-[42px] flex-none flex-col items-center', className)}>
        <span
          role="img"
          aria-label="Confidence not scored"
          className="w-full rounded-[7px] border border-[var(--line-soft)] bg-[var(--surface-2)] py-1 text-center font-mono text-[8.5px] text-[var(--text-dim)]"
        >
          unscored
        </span>
        <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-dim)]">
          conf
        </span>
      </div>
    );
  }
  const color = confidenceColor(value);
  return (
    <div className={cn('flex w-[42px] flex-none flex-col items-center', className)}>
      <div
        role="img"
        className="grid h-[38px] w-[38px] place-items-center rounded-full font-mono text-[10px] font-semibold"
        style={{ color, border: `2px solid ${color}` }}
        aria-label={`Confidence ${Math.round(value)} percent (${value >= 85 ? 'high' : value >= 60 ? 'medium' : 'low'})`}
      >
        {Math.round(value)}%
      </div>
      <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-dim)]">
        conf
      </span>
    </div>
  );
}
