import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AmbientHiveGlowProps {
  /**
   * Home-only gate (Pillar 3.4): the whole ambient is behind this prop so it can
   * never leak onto another surface. Renders nothing when false.
   */
  active?: boolean;
  className?: string;
}

/**
 * AmbientHiveGlow — a slow honey "breath" behind the Home hero zone (Pillar 3.4,
 * brand HIGH). A very-low-amplitude honey radial that swells and settles on a ~6s
 * cycle so the surface feels alive WITHOUT competing with content — the brand's
 * "respectful, no gratuitous movement" WIN must survive, so the amplitude stays
 * below the attention threshold (a faint --honey-glow radial, opacity breath only,
 * no travel, no color shift).
 *
 * Purely decorative: aria-hidden + pointer-events-none, painted behind everything
 * via -z-10. Reduced-motion (REDUCED.ambient = 'off'): the loop stops — a single
 * static faint radial remains (no movement). The breath keyframe is ALSO stilled
 * in index.css's prefers-reduced-motion block as a backstop.
 */
export function AmbientHiveGlow({ active = true, className }: AmbientHiveGlowProps) {
  const reduce = useReducedMotion();
  if (!active) return null;
  return (
    <div
      aria-hidden
      data-testid="ambient-hive-glow"
      data-reduced={reduce ? 'true' : 'false'}
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 -z-10 h-[440px] overflow-hidden',
        className,
      )}
    >
      <div
        className={cn(
          'absolute left-1/2 top-[-160px] h-[560px] w-[860px] -translate-x-1/2 rounded-full',
          'bg-[radial-gradient(ellipse_at_center,var(--honey-glow),transparent_66%)]',
          reduce ? 'opacity-50' : 'hive-ambient-breath',
        )}
      />
    </div>
  );
}
