import { cn } from '@/lib/utils';
import { TONE_COLOR, type WarmTone } from './tones';

interface DotLiveProps {
  tone?: WarmTone;
  /** Breathing pulse for a live/active state (default). Off → static dot. */
  live?: boolean;
  size?: number;
  className?: string;
}

/**
 * A small status dot, optionally breathing (`.dot-live`) for live state.
 * Color resolves from a warm semantic token; the pulse honors
 * `prefers-reduced-motion` via `motion-reduce:animate-none`.
 */
export function DotLive({ tone = 'healthy', live = true, size = 8, className }: DotLiveProps) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, backgroundColor: TONE_COLOR[tone] }}
      className={cn(
        'inline-block shrink-0 rounded-full',
        live && 'dot-live motion-reduce:animate-none',
        className,
      )}
    />
  );
}
