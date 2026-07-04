import type { Memory, MemoryStatus } from '@/lib/types';
import { memoryKindLabel } from '@/lib/harvest-kind-map';
import { ConfidenceBadge } from '@/components/ui/confidence-badge';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

/**
 * Memory Center card (UX-Refactor Phase 2, S04). Shows a memory's title +
 * content preview + kind / confidence / status + tags. Active (the default
 * state) gets no status badge — only states that warrant attention surface one,
 * so the list isn't a wall of green pills.
 */

/** Map a memory lifecycle status to a badge tone + label; null = no badge. */
function statusMeta(status: MemoryStatus): { tone: StatusTone; label: string } | null {
  switch (status) {
    case 'active': return null;
    case 'unreviewed': return { tone: 'attention', label: 'Needs review' };
    case 'low_confidence': return { tone: 'attention', label: 'Low confidence' };
    case 'conflict': return { tone: 'risk', label: 'Conflict' };
    case 'deprecated': return { tone: 'neutral', label: 'Deprecated' };
    case 'archived': return { tone: 'neutral', label: 'Archived' };
    default: return null;
  }
}

interface MemoryCardProps {
  memory: Memory;
  onClick?: () => void;
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
  className?: string;
  /**
   * Count of near-identical memories this card represents (display-layer dedup,
   * F22). When > 1, an "×N" badge is shown. Purely informational — the other
   * copies remain in the store, nothing was merged or deleted.
   */
  duplicateCount?: number;
}

export function MemoryCard({ memory, onClick, selected, onSelect, className, duplicateCount }: MemoryCardProps) {
  const status = statusMeta(memory.status);
  const showTitle = memory.title && memory.title !== memory.content;

  return (
    <div
      className={cn(
        'group relative rounded-xl border border-border bg-card/60 p-3 transition-colors hover:border-primary/40',
        selected && 'border-primary/60 ring-1 ring-primary/30',
        onClick && 'cursor-pointer',
        className,
      )}
      onClick={onClick}
      // No role="button": the card contains a focusable select-checkbox, and
      // ARIA forbids focusable descendants inside a button. Keep it keyboard-
      // operable (tabIndex + Enter/Space) with an explicit aria-label so AT
      // announces a clean name, not the concatenated card text (S04 review MED).
      aria-label={onClick ? (memory.title || memory.content.slice(0, 80)) : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      {onSelect && (
        <input
          type="checkbox"
          checked={!!selected}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onSelect(e.target.checked)}
          className="absolute right-2.5 top-2.5 h-3.5 w-3.5 accent-primary"
          aria-label="Select memory"
        />
      )}

      {showTitle && (
        <h3 className="text-sm font-display font-semibold text-foreground mb-0.5 pr-6 truncate">{memory.title}</h3>
      )}
      <p className="text-xs text-muted-foreground line-clamp-2 leading-snug">{memory.content}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          {memoryKindLabel(memory.kind)}
        </span>
        <ConfidenceBadge value={memory.confidence} compact />
        {status && <StatusBadge tone={status.tone} label={status.label} />}
        {duplicateCount != null && duplicateCount > 1 && (
          <span
            className="inline-flex items-center rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            title={`${duplicateCount} near-identical memories collapsed here — display only, nothing was merged or deleted.`}
          >
            ×{duplicateCount}
          </span>
        )}
        {memory.tags?.slice(0, 3).map((t) => (
          <span key={t} className="text-[10px] text-muted-foreground/80">#{t}</span>
        ))}
      </div>
    </div>
  );
}
