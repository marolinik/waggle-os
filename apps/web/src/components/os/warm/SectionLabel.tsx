import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionLabelProps {
  children: ReactNode;
  /** Append a trailing hairline rule filling the remaining width. */
  rule?: boolean;
  className?: string;
}

/**
 * 11px mono, uppercase section header. Used to head every screen section.
 * Wave X Lane C: was `--text-dim` at 0.14em tracking — a video judge read the
 * eyebrows ("WHILE YOU SLEPT", "TRUST · INSPECT · CORRECT · FORGET") as garbled
 * noise. `--text-dim` also fails 4.5:1 on the light canvas (#736958 on cream ≈
 * 4.47:1). Raised to `--text-muted` (≈6.3:1 dark / 4.77:1 light — AA in both)
 * and eased tracking to 0.10em so tiny uppercase stays legible.
 */
export function SectionLabel({ children, rule = false, className }: SectionLabelProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {children}
      </span>
      {rule && <span aria-hidden className="h-px flex-1 bg-[var(--line-soft)]" />}
    </div>
  );
}
