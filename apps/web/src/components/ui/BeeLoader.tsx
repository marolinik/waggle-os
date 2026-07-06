import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * BeeLoader — Wave T Lane F item 3: the ONE signature loader.
 *
 * A small waggle-dance loader — the bee mark tracing a figure-eight waggle path
 * (the literal honeybee "waggle dance") — honey on transparent, ~1.2s loop.
 * Pure SVG: the trail is a faint honey figure-eight; the bee is a tiny honey
 * mark that follows it via SMIL <animateMotion> (rotate="auto" so it banks into
 * the turns and reads as alive). A drop-in replacement for the generic arc
 * spinner (Loader2) on the agents surface's own loading states.
 *
 * prefers-reduced-motion: no motion element is rendered — the bee sits static at
 * the figure-eight crossing, so reduced-motion users get a calm honey mark, not
 * a frozen mid-flight pose.
 */

/** Figure-eight in the 44×28 viewBox, crossing at the centre (22,14): left loop
 *  counter-clockwise, then right loop — one continuous waggle path. */
const FIGURE_EIGHT =
  'M22 14 C16 6 4 6 4 14 C4 22 16 22 22 14 C28 6 40 6 40 14 C40 22 28 22 22 14 Z';

interface BeeLoaderProps {
  /** Width in px; height keeps the 44:28 aspect. Default 44. */
  size?: number;
  /** Visually-hidden status text for screen readers. */
  label?: string;
  /** Extra classes on the wrapper (layout only — e.g. `mx-auto`). */
  className?: string;
}

export function BeeLoader({ size = 44, label = 'Loading…', className }: BeeLoaderProps) {
  const reduce = useReducedMotion();
  const height = Math.round((size * 28) / 44);

  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="bee-loader"
      className={cn('inline-flex items-center justify-center', className)}
    >
      <svg width={size} height={height} viewBox="0 0 44 28" fill="none" aria-hidden>
        {/* The dance trail — a faint honey figure-eight guide. */}
        <path
          d={FIGURE_EIGHT}
          stroke="var(--honey)"
          strokeOpacity={0.18}
          strokeWidth={1.2}
          strokeLinecap="round"
        />
        {/* The bee, drawn around its local origin so it centres on the path. */}
        <g transform={reduce ? 'translate(22 14)' : undefined}>
          <ellipse cx={-0.7} cy={-2.4} rx={1.7} ry={1.1} fill="var(--honey)" opacity={0.45} />
          <ellipse cx={1.5} cy={-2.4} rx={1.7} ry={1.1} fill="var(--honey)" opacity={0.45} />
          <ellipse cx={0} cy={0} rx={3.1} ry={2.3} fill="var(--honey)" />
          <rect x={-0.6} y={-2.3} width={1.2} height={4.6} rx={0.5} fill="#1a1407" opacity={0.28} />
          {!reduce && (
            <animateMotion
              dur="1.2s"
              repeatCount="indefinite"
              rotate="auto"
              path={FIGURE_EIGHT}
            />
          )}
        </g>
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export default BeeLoader;
