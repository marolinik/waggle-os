/**
 * Lane SR — home day-story scroll-reveal (Path-to-9 Pillar 1.1 entrance).
 *
 * Each day-story section (Start here → memory-review → While you slept →
 * pick-up → suggests → up next) rises 8px + fades in as it scrolls into view,
 * reusing the shipped `card-enter` keyframe (8px rise + fade, --mo-ease) — so
 * the scripted Home scroll reads as one designed entrance, not a static page.
 *
 * Contract (spec Lane SR):
 *  - Once per section per visit: the IntersectionObserver disconnects on the
 *    first intersection and `revealed` never resets, so scrolling back up never
 *    replays the entrance. A visit = a mount; a new route entry replays it.
 *  - Reduced motion (REDUCED: rise/fade off): sections are visible from the
 *    first paint with no hidden pre-state and no animation.
 *  - No IntersectionObserver (jsdom / very old engines): the same visible-always
 *    fallback — content is never gated behind an observer that can't fire.
 */
import {
  useEffect, useRef, useState, type ReactNode, type CSSProperties, type RefObject,
} from 'react';
import { useReducedMotion } from 'framer-motion';

interface ScrollReveal<T extends HTMLElement> {
  ref: RefObject<T | null>;
  /** Whether the entrance has fired (true from first paint when not animating). */
  revealed: boolean;
  /** True only when we should play the rise/fade (motion allowed + observable). */
  animate: boolean;
}

function useScrollReveal<T extends HTMLElement>(): ScrollReveal<T> {
  const reduce = useReducedMotion();
  const ref = useRef<T | null>(null);
  const canObserve = typeof IntersectionObserver !== 'undefined';
  // Visible from the first paint under reduced motion or without an observer;
  // otherwise start hidden and let the observer reveal it on entry.
  const [revealed, setRevealed] = useState(() => !canObserve);

  useEffect(() => {
    if (reduce || !canObserve) {
      setRevealed(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRevealed(true);
          io.disconnect(); // once per section per visit — no scroll-up replay
        }
      },
      { root: null, rootMargin: '0px 0px -8% 0px', threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce, canObserve]);

  return { ref, revealed, animate: !reduce && canObserve };
}

interface RevealSectionProps {
  children: ReactNode;
  /** Optional class on the reveal wrapper (kept minimal — section spacing stays
   *  on the child so its margins collapse through this transparent wrapper). */
  className?: string;
}

/**
 * Wraps ONE day-story section. Pending → invisible; on scroll-in → the shared
 * `card-enter` rise/fade (backwards fill, so no transform lingers to shift a
 * portaled menu after settle). Under reduced motion / no observer it is a plain
 * always-visible passthrough.
 */
export function RevealSection({ children, className }: RevealSectionProps): ReactNode {
  const { ref, revealed, animate } = useScrollReveal<HTMLDivElement>();
  const style: CSSProperties | undefined = animate
    ? revealed
      ? { animation: 'card-enter var(--mo-slow) var(--mo-ease) backwards' }
      : { opacity: 0 }
    : undefined;
  return (
    <div
      ref={ref}
      className={className}
      style={style}
      data-reveal={animate ? (revealed ? 'in' : 'pending') : undefined}
    >
      {children}
    </div>
  );
}
