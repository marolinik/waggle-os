import { Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EvidenceChip } from './evidence-chip';

/**
 * Evidence / provenance panel (UX-Refactor Phase 2 DS, PRD §12.4 "evidence").
 * Renders a memory's source provenance + supporting evidence snippets as chips.
 * Used in the Memory detail drawer. Renders nothing when there's no provenance
 * and no evidence to show.
 */
interface EvidencePanelProps {
  source?: string;
  sourceId?: string | null;
  sourceUrl?: string | null;
  evidence?: string[];
  /** #7 "View original source": when supplied (and a linked archive exists, i.e.
   *  hasOriginalSource), renders an Eye button that opens the verbatim source view
   *  in the detail drawer. */
  onViewOriginalSource?: () => void;
  /** Whether a verbatim raw_archive row is actually linked. Gates the Eye button so
   *  a sourceId-only frame (e.g. an auto-synced summary) never shows a View-original
   *  affordance that would 404 — see Memory.hasOriginalSource. */
  hasOriginalSource?: boolean;
  /** Whether the source view is currently open (drives aria-expanded). */
  expanded?: boolean;
  /** Whether the source fetch is in flight (drives aria-busy + disables the button). */
  busy?: boolean;
  className?: string;
}

export function EvidencePanel({ source, sourceId, sourceUrl, evidence, onViewOriginalSource, hasOriginalSource, expanded, busy, className }: EvidencePanelProps) {
  const hasEvidence = Array.isArray(evidence) && evidence.length > 0;
  if (!source && !sourceId && !sourceUrl && !hasEvidence) return null;

  const openSource = sourceUrl ? () => window.open(sourceUrl, '_blank', 'noopener,noreferrer') : undefined;

  return (
    <div className={cn('space-y-2', className)}>
      <h4 className="text-[11px] font-display font-semibold uppercase tracking-wide text-muted-foreground">
        Provenance &amp; evidence
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {source && <EvidenceChip label={`source: ${source}`} />}
        {sourceId && <EvidenceChip label={`id: ${sourceId}`} />}
        {hasOriginalSource && onViewOriginalSource && (
          <button
            type="button"
            onClick={onViewOriginalSource}
            aria-label={expanded ? 'Hide original source' : 'View original source'}
            aria-expanded={!!expanded}
            aria-busy={busy || undefined}
            disabled={busy}
            title="View original source"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Eye className="w-3 h-3" /> View original
          </button>
        )}
        {sourceUrl && <EvidenceChip label={sourceUrl} title={sourceUrl} onClick={openSource} />}
      </div>
      {hasEvidence && (
        <ul className="space-y-1">
          {evidence!.map((e, i) => (
            <li key={i} className="text-xs text-muted-foreground border-l-2 border-border pl-2 leading-snug">
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
