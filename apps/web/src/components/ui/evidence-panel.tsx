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
  className?: string;
}

export function EvidencePanel({ source, sourceId, sourceUrl, evidence, className }: EvidencePanelProps) {
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
