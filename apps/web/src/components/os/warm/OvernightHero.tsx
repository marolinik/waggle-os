import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DotLive } from './DotLive';
import { RunChip, type RunChipProps } from './RunChip';

interface OvernightHeroProps {
  eyebrow?: string;
  /** The "While you slept …" statement; embed honey spans for key numbers. */
  statement: ReactNode;
  runs?: RunChipProps[];
  /** Quiet line shown when nothing ran overnight (degrade, never crash). */
  emptyText?: string;
  className?: string;
}

/**
 * Home overnight "hero moment" — a gradient `--r-xl` card with a soft honey
 * radial glow. Renders gracefully with no runs (the data is often empty / null;
 * see PR3-BUILD-PLAN §5).
 */
export function OvernightHero({
  eyebrow = 'While you slept',
  statement,
  runs = [],
  emptyText = 'Nothing ran overnight — a calm night for the hive.',
  className,
}: OvernightHeroProps) {
  const hasRuns = runs.length > 0;
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-[26px] border border-[var(--line-soft)] bg-[linear-gradient(150deg,var(--surface),var(--surface-2))] p-7 shadow-[var(--shadow)]',
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[radial-gradient(circle,var(--honey-glow),transparent_70%)]"
      />
      <div className="relative">
        <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-dim)]">
          <DotLive tone="intel" size={7} />
          {eyebrow}
        </div>
        <p className="max-w-[60ch] text-[clamp(19px,2.4vw,26px)] font-semibold leading-[1.4] text-[var(--text)]">
          {hasRuns ? statement : emptyText}
        </p>
        {hasRuns && (
          <div className="mt-5 flex flex-wrap gap-2">
            {runs.map((r, i) => (
              <RunChip key={i} {...r} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
