import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { SPRING, DUR, EASE_OUT } from '@/lib/motion/tokens';
import { cn } from '@/lib/utils';

/**
 * WaggleSettle — the commissioned signature gesture (Phase-D Lane WS, brand
 * blocking #1). A recognizably waggle-derived micro-choreography: the honey
 * brand hex runs the bee's figure-eight waggle dance (a Gerono lemniscate — two
 * lobes crossing at the origin — with a fast body-wobble overlay) and SETTLES at
 * centre with a single-overshoot spring bloom (~400ms, DUR.settle +
 * SPRING.expressive). It must read as "the waggle," not a generic scale-pop, so
 * the translation path — not the scale — carries the identity.
 *
 * Prototype discipline: this is judged STANDALONE on /motion-spec first, and
 * wired to exactly ONE product moment (memory saved) behind the SIGNATURE.full
 * taxonomy gate (see waggle-settle-gate.ts). It is not propagated to any other
 * moment in this phase.
 *
 * Purely decorative (aria-hidden + pointer-events-none) — it reinforces a state
 * change the host has already announced, so it adds no second SR event. It
 * mounts only while `play` is true and calls `onDone` when the gesture finishes,
 * so the host clears state to re-arm.
 *
 * Reduced-motion (REDUCED.settle = 'instant-state-color-pulse'): the dancer is
 * static at its settled state (no path, no transform) and a single honey colour
 * pulse plays in place of the gesture — exactly the taxonomy's reduced mapping.
 */

/** Times for the 9-point figure-eight keyframe path (evenly spaced 0→1). */
export const WAGGLE_TIMES = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1] as const;

/**
 * Gerono lemniscate (∞) sampled at t = k·π/4, normalised to [-1, 1]. Two lobes
 * (left/right) crossing at the origin; starts and ends at 0 — the bee returns to
 * where it began. This is the "figure-eight dance DNA."
 */
export const WAGGLE_FIG8_X = [0, 0.707, 1, 0.707, 0, -0.707, -1, -0.707, 0] as const;
export const WAGGLE_FIG8_Y = [0, 1, 0, -1, 0, 1, 0, -1, 0] as const;

/** Decaying body-wobble (degrees) synced to the run — the literal "waggle." */
export const WAGGLE_WOBBLE_DEG = [0, -12, 10, -10, 8, -8, 6, -5, 0] as const;

export interface WaggleSettleProps {
  /** Fire the gesture while true. Set false again (via onDone) to re-arm. */
  play: boolean;
  /** Called once the gesture (or the reduced-motion pulse) has finished. */
  onDone?: () => void;
  /** Dancer size in px — drives the figure-eight reach. Default 40. */
  size?: number;
  /** Positioning/offset classes applied to the host anchor. */
  className?: string;
  /** Testid for the overlay root (default `waggle-settle`). */
  'data-testid'?: string;
}

export function WaggleSettle({
  play,
  onDone,
  size = 40,
  className,
  'data-testid': testId = 'waggle-settle',
}: WaggleSettleProps) {
  const reduce = !!useReducedMotion();

  // Keep onDone current without resetting the timer mid-gesture on every render.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!play) return;
    // gesture length + a short tail so the spring has visually settled.
    const ms = Math.round(DUR.settle * 1000) + 120;
    const timer = setTimeout(() => onDoneRef.current?.(), ms);
    return () => clearTimeout(timer);
  }, [play]);

  if (!play) return null;

  const dancer = Math.round(size * 0.55);
  const glow = Math.round(size * 1.5);
  const ampX = size * 0.5;
  const ampY = size * 0.3;
  const fig8x = WAGGLE_FIG8_X.map((v) => v * ampX);
  const fig8y = WAGGLE_FIG8_Y.map((v) => v * ampY);
  const times = [...WAGGLE_TIMES];

  return (
    <span
      aria-hidden
      data-testid={testId}
      data-reduced={reduce ? 'true' : 'false'}
      className={cn('pointer-events-none absolute inset-0 grid place-items-center', className)}
    >
      {/* Settle bloom / reduced-motion colour pulse — honey energy release. */}
      <motion.span
        data-testid="waggle-settle-glow"
        className="absolute rounded-full"
        style={{
          width: glow,
          height: glow,
          background: 'radial-gradient(circle, var(--honey-glow), transparent 70%)',
        }}
        initial={{ opacity: 0, scale: reduce ? 1 : 0.5 }}
        animate={reduce ? { opacity: [0, 0.8, 0] } : { opacity: [0, 0.85, 0], scale: [0.5, 1.5] }}
        transition={{ duration: DUR.settle, ease: EASE_OUT }}
      />
      {/* The dancer — the honey brand hex running the figure-eight waggle → settle. */}
      <motion.span
        data-testid="waggle-settle-dancer"
        className="hex block shadow-[var(--shadow-honey)]"
        style={{ width: dancer, height: dancer, backgroundColor: 'var(--honey)' }}
        initial={reduce ? { opacity: 0, scale: 1 } : { opacity: 0, scale: 0.7, x: 0, y: 0, rotate: 0 }}
        animate={
          reduce
            ? { opacity: 1 }
            : { opacity: 1, scale: 1, x: fig8x, y: fig8y, rotate: [...WAGGLE_WOBBLE_DEG] }
        }
        transition={
          reduce
            ? { duration: 0 }
            : {
                x: { duration: DUR.settle, times, ease: 'easeInOut' },
                y: { duration: DUR.settle, times, ease: 'easeInOut' },
                rotate: { duration: DUR.settle, times, ease: 'easeInOut' },
                opacity: { duration: DUR.fast },
                scale: SPRING.expressive,
              }
        }
      />
    </span>
  );
}
