import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionLabelProps {
  children: ReactNode;
  /** Append a trailing hairline rule filling the remaining width. */
  rule?: boolean;
  className?: string;
}

/**
 * 11px mono, uppercase, wide-tracked section header in `--text-dim` (README §6.2).
 * Used to head every screen section.
 */
export function SectionLabel({ children, rule = false, className }: SectionLabelProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-dim)]">
        {children}
      </span>
      {rule && <span aria-hidden className="h-px flex-1 bg-[var(--line-soft)]" />}
    </div>
  );
}
