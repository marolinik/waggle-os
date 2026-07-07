import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SPRING } from '@/lib/motion/tokens';

interface HexAvatarProps {
  /** Text to derive the single-initial glyph from (e.g. a workspace name). */
  label: string;
  /** Box size in px (the hex clip fits inside). Default 28. */
  size?: number;
  /** Warm gradient fill (default); false → flat surface tile. */
  gradient?: boolean;
  className?: string;
  /**
   * Hero shared-element morph (Lane HM). When set, the hex renders as a
   * `motion.span` carrying this `layoutId`, so it animates position + size
   * between a source (a workspace card) and a destination (the workspace
   * header) that use the SAME id — the avatar grows into the surface. Omitted
   * → a plain `<span>`, byte-identical to before, so every existing caller is
   * untouched. Reduced-motion callers pass `undefined` (no shared-element
   * travel — REDUCED.routeTransition = crossfade-only).
   */
  layoutId?: string;
}

/**
 * Round-6 fix 1a: 5 SATURATED warm brand-adjacent gradient tones (honey ·
 * bright honey · deep honey · warm copper · terracotta), picked
 * deterministically from the label so one workspace keeps its hue on every
 * surface. The old moss/sand/clay trio read as murky off-ramp olives — every
 * tone now stays on the honey→terracotta band so monograms read intentional
 * on both themes. Honey stays the brand anchor (tone 0 uses the theme
 * tokens); the dark #1a1407 ink reads on every tone. Decorative only
 * (aria-hidden).
 */
const WARM_TONES: ReadonlyArray<readonly [string, string]> = [
  ['var(--honey-bright)', 'var(--honey-deep)'], // honey (brand default)
  ['#f6c45a', '#e9a52c'],                        // bright honey
  ['#e9a52c', '#c07e16'],                        // deep honey
  ['#d98a3d', '#b06a24'],                        // warm copper
  ['#db8068', '#c05f43'],                        // terracotta
];

function toneFor(label: string): readonly [string, string] {
  const key = label.trim();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return WARM_TONES[h % WARM_TONES.length];
}

/**
 * Wave S (Lane B): the deterministic accent for a label — the bright stop of its
 * warm tone, picked by the SAME hash the avatar uses. Reused for the workspace
 * card's 2px top band so a card's live signal shares one source of truth with
 * its monogram hue (no drift, no fabrication).
 */
export function accentFor(label: string): string {
  return toneFor(label)[0];
}

function firstInitial(label: string): string {
  const ch = label.trim()[0];
  return ch ? ch.toUpperCase() : 'W';
}

/**
 * Hex-clipped avatar with a warm gradient + #1a1407 ink — the brand motif
 * for workspaces / agents (extracted from the inline pattern in Sidebar.tsx).
 * Decorative shape; the adjacent name carries the accessible identity, so the
 * tile is aria-hidden.
 */
export function HexAvatar({ label, size = 28, gradient = true, className, layoutId }: HexAvatarProps) {
  const [bright, deep] = toneFor(label);
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(10, Math.round(size * 0.42)),
    ...(gradient ? { background: `linear-gradient(150deg, ${bright}, ${deep})` } : {}),
  };
  const classes = cn(
    'hex grid shrink-0 place-items-center font-extrabold leading-none',
    gradient
      ? 'text-[#1a1407]'
      : 'border border-[var(--line)] bg-[var(--surface-3)] text-[var(--text-2)]',
    className,
  );
  const glyph = firstInitial(label);

  // Hero morph path (Lane HM): opt-in only. The hex itself is the layout
  // element, so the same clip-path shape scales/translates cleanly between the
  // card and the header (expressive tier — more travel, same settle DNA).
  if (layoutId) {
    return (
      <motion.span aria-hidden layoutId={layoutId} transition={SPRING.expressive} style={style} className={classes}>
        {glyph}
      </motion.span>
    );
  }

  return (
    <span aria-hidden style={style} className={classes}>
      {glyph}
    </span>
  );
}
