import { cn } from '@/lib/utils';
import { DotLive } from './DotLive';
import type { WarmTone } from './tones';

export interface RunChipProps {
  label: string;
  tone?: WarmTone;
  className?: string;
}

/**
 * A result chip (static status dot + label) for the overnight hero —
 * e.g. "14 memories consolidated" (intel), "1 export failed" (risk).
 */
export function RunChip({ label, tone = 'healthy', className }: RunChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-[var(--line-soft)] bg-[var(--surface)]/60 px-3 py-1 text-[12.5px] text-[var(--text-2)]',
        className,
      )}
    >
      <DotLive tone={tone} live={false} size={7} />
      {label}
    </span>
  );
}
