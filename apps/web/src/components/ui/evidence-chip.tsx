import { cn } from '@/lib/utils';

/**
 * Provenance / evidence chip (UX-Refactor Phase 2 DS) — promotes the inline
 * provenance pill from MemoryApp into a reusable primitive. Shows a small
 * source/evidence token; optionally clickable (e.g. to open the source) when an
 * `onClick` is supplied.
 */
interface EvidenceChipProps {
  label: string;
  title?: string;
  onClick?: () => void;
  className?: string;
}

export function EvidenceChip({ label, title, onClick, className }: EvidenceChipProps) {
  const base =
    'inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground max-w-[16rem] truncate';
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title ?? label} className={cn(base, 'hover:bg-muted hover:text-foreground transition-colors', className)}>
        {label}
      </button>
    );
  }
  return (
    <span title={title ?? label} className={cn(base, className)}>
      {label}
    </span>
  );
}
