/**
 * Motion vocabulary — THE single source of motion truth (Phase-0 items 1, 3, 7).
 *
 * Every animation on the judged surfaces resolves to a token here (springs for
 * framer-motion; DUR/EASE_OUT/STAGGER for CSS-driven motion via the `--mo-*`
 * custom props in index.css). The retrofit lanes (R1/R2/R3) migrate the shipped
 * duration/easing zoo onto these; the reviewable demo lives at /motion-spec.
 *
 * Design contract (path-to-9 §Phase-0):
 *  - One spring FAMILY, not one config: three named variants that share ONE
 *    physical character (same damping ratio band ≈ 0.74–0.77 → the same
 *    "material", a light single-overshoot settle). Tune amplitude/speed per
 *    tier, never the character. See `dampingRatio` + tokens.test.ts.
 *  - Reduced-motion mapping is defined for EVERY tier (not just ambient) and is
 *    CONSUMED, not just documented — /motion-spec switches behaviour off it.
 *  - Signature-moment frequency taxonomy caps full-amplitude flourishes to rare
 *    accrual milestones; high-frequency actions get the micro variant only.
 *
 * This file imports nothing (pure data) so the CI contrast/motion gate scripts
 * and non-React callers can read it too.
 */

/** framer-motion mass default is 1; damping ratio uses that. */
const SPRING_MASS = 1;

/**
 * The spring FAMILY. `type: 'spring'` + stiffness/damping are structurally the
 * framer-motion spring Transition shape, so `transition={SPRING.standard}` just
 * works without importing framer-motion here.
 *
 *  - micro:      chips, presses, selection — a ≤150ms-feel snap.
 *  - standard:   hovers, panel/route fades — the default working tier.
 *  - expressive: hero morphs, the settle gesture — more travel, same settle DNA.
 */
export const SPRING = {
  micro:      { type: 'spring', stiffness: 550, damping: 35 },
  standard:   { type: 'spring', stiffness: 380, damping: 30 },
  expressive: { type: 'spring', stiffness: 260, damping: 24 },
} as const;

/**
 * Durations (seconds) for non-spring / CSS-timed motion. Mirrored 1:1 into
 * index.css as `--mo-fast/--mo-base/--mo-slow/--mo-settle` (ms). Ascending by
 * contract (tokens.test.ts) so "slower = a longer token" always holds.
 */
export const DUR = { fast: 0.15, base: 0.2, slow: 0.32, settle: 0.4 } as const;

/** Standard-out cubic-bezier for non-spring CSS motion. Mirrors `--mo-ease`. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Per-item entrance stagger (seconds): list = Wave W's 40ms, brief = 80ms. */
export const STAGGER = { list: 0.04, brief: 0.08 } as const;

/**
 * Signature-moment frequency/intensity taxonomy (Phase-0.7).
 * FULL settle only on rare accrual milestones (per-session cooldown); MICRO for
 * high-frequency actions. `full.moments` and `micro.moments` are DISJOINT by
 * contract — a moment is either a flourish or routine, never both.
 */
export const SIGNATURE = {
  full: {
    moments: ['memory-saved-first-of-session', 'install-success', 'agent-spawned'],
    durS: DUR.settle,
    perSessionCooldownMs: 60_000,
  },
  micro: {
    moments: ['send-arm', 'selection'],
    durS: DUR.fast,
  },
} as const;

/**
 * Reduced-motion mapping per motion TIER (Phase-0.3). Consumers read this to
 * degrade gracefully under `prefers-reduced-motion: reduce`:
 *  - routeTransition → crossfade only (no shared-element travel)
 *  - hover           → keep colour + shadow, drop translate/scale
 *  - settle          → instant state + a colour pulse, no gesture
 *  - streamingCaret  → static (no blink/trail)
 *  - countUp         → set the final number instantly
 *  - ambient         → off (below-attention loops stop)
 */
export const REDUCED = {
  routeTransition: 'crossfade-only',
  hover: 'color-shadow-only-no-transform',
  settle: 'instant-state-color-pulse',
  streamingCaret: 'static',
  countUp: 'instant-set',
  ambient: 'off',
} as const;

/** A named spring-family variant. */
export type SpringVariant = keyof typeof SPRING;
/** A motion tier with a defined reduced-motion behaviour. */
export type MotionTier = keyof typeof REDUCED;

/**
 * Damping ratio ζ = c / (2·√(k·m)) — the mathematical expression of a spring's
 * "material". All three family variants must sit in one narrow band (see
 * tokens.test.ts) so the system reads as one physical character, not a zoo.
 * /motion-spec surfaces this number next to each variant.
 */
export function dampingRatio(spring: { stiffness: number; damping: number }): number {
  return spring.damping / (2 * Math.sqrt(spring.stiffness * SPRING_MASS));
}
