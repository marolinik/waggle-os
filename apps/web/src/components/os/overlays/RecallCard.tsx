/**
 * RecallCard — the shared "I remember …" recall card (Lane H item 4).
 *
 * ONE card component consumed by BOTH the home hero recall strip and the
 * ≥7-day "Catching you up" modal, so the product's signature memory moment
 * looks and reads identically wherever it lands. Presentational only — each
 * surface wraps it in its own motion entrance (STAGGER.brief), so the card is
 * shared without coupling the two entrance choreographies.
 */
import { Sparkles } from 'lucide-react';
import type { MemoryHighlight } from '@/lib/briefing-source';

interface RecallCardProps {
  highlight: MemoryHighlight;
  /** Relative-time label (e.g. "yesterday") — the surface owns the formatter. */
  timeLabel?: string;
}

export function RecallCard({ highlight, timeLabel }: RecallCardProps) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-[var(--honey-line)] bg-[var(--honey-wash)] px-3 py-1.5">
      <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-honey/60" aria-hidden />
      <div className="min-w-0">
        <p className="text-[12px] leading-relaxed text-foreground">{highlight.content}</p>
        {/* R21 (a11y/design): the 10px timestamp on the honey-wash card read
            borderline on cream — --text-tertiary is the quiet-but-AA tier
            (~4.7:1 light / 5.0:1 dark on the tinted surface). */}
        {(highlight.workspace || timeLabel) && (
          <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">
            {highlight.workspace && <span>{highlight.workspace} · </span>}
            {timeLabel}
          </p>
        )}
      </div>
    </div>
  );
}
