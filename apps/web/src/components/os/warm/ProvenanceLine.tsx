import { cn } from '@/lib/utils';
import { EvidenceChip } from '@/components/ui/evidence-chip';

interface ProvenanceLineProps {
  /** Provenance source, e.g. "web · mem0.ai" or "Claude Code". */
  source: string;
  /** Optional relative time, e.g. "2h ago". */
  when?: string;
  /** PR3.5 trace hook — makes the pill clickable into the memory detail. */
  onClick?: () => void;
  className?: string;
}

/**
 * "⬡ source · when" provenance pill in mono / `--intel` — the core trust
 * pattern (README §6.6). Thin wrapper over `EvidenceChip` recolored to the
 * intel (violet) semantic. Clickable when `onClick` is supplied.
 */
export function ProvenanceLine({ source, when, onClick, className }: ProvenanceLineProps) {
  const label = `⬡ ${source}${when ? ` · ${when}` : ''}`;
  return (
    <EvidenceChip
      label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'font-mono text-[var(--intel)] border-[var(--intel-wash)] bg-transparent',
        className,
      )}
    />
  );
}
