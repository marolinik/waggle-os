import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE_COLOR, TONE_WASH, type WarmTone } from './tones';

interface HexCheckTileProps {
  tone?: WarmTone;
  size?: number;
  className?: string;
}

/**
 * Small hex-clipped tile with a check glyph — the leading marker on Workspace
 * "What Waggle knows" fact rows.
 */
export function HexCheckTile({ tone = 'healthy', size = 26, className }: HexCheckTileProps) {
  const glyph = Math.round(size * 0.5);
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, backgroundColor: TONE_WASH[tone], color: TONE_COLOR[tone] }}
      className={cn('hex grid shrink-0 place-items-center', className)}
    >
      <Check style={{ width: glyph, height: glyph }} strokeWidth={2.4} />
    </span>
  );
}
