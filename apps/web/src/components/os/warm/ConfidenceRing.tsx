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
 * 38px confidence ring (Memory-Trust screen-19 §5a). The number AND the 2px
 * ring border are both colored by band. When `value` is undefined the ring
 * shows a neutral "—" in `--text-dim` — the honest "no confidence stored" state
 * (curated / agent / quick-capture frames carry no confidence; only harvest
 * does). Never defaults a number.
 */
export function ConfidenceRing({ value, className }: ConfidenceRingProps) {
  const known = typeof value === 'number' && Number.isFinite(value);
  const color = known ? confidenceColor(value) : 'var(--text-dim)';
  return (
    <div className={cn('flex w-[42px] flex-none flex-col items-center', className)}>
      <div
        className="grid h-[38px] w-[38px] place-items-center rounded-full font-mono text-[11px] font-semibold"
        style={{ color, border: `2px solid ${color}` }}
        aria-label={known ? `Confidence ${Math.round(value)} percent` : 'Confidence unknown'}
      >
        {known ? Math.round(value) : '—'}
      </div>
      <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-dim)]">
        conf
      </span>
    </div>
  );
}
