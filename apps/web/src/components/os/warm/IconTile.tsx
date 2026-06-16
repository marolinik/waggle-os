import type { ElementType } from 'react';
import { cn } from '@/lib/utils';
import { TONE_COLOR, TONE_WASH, type WarmTone } from './tones';

interface IconTileProps {
  icon: ElementType;
  tone?: WarmTone;
  size?: number;
  className?: string;
}

/**
 * Tinted rounded-square icon tile (`*-wash` bg + tone-colored glyph) — the
 * leading affordance on "Waggle suggests" rows and recent-work artifact rows.
 */
export function IconTile({ icon: Icon, tone = 'honey', size = 38, className }: IconTileProps) {
  const glyph = Math.round(size * 0.45);
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, backgroundColor: TONE_WASH[tone], color: TONE_COLOR[tone] }}
      className={cn('grid shrink-0 place-items-center rounded-[12px]', className)}
    >
      <Icon style={{ width: glyph, height: glyph }} strokeWidth={1.8} />
    </span>
  );
}
