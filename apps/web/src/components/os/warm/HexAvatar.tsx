import { cn } from '@/lib/utils';

interface HexAvatarProps {
  /** Text to derive the single-initial glyph from (e.g. a workspace name). */
  label: string;
  /** Box size in px (the hex clip fits inside). Default 28. */
  size?: number;
  /** Warm gradient fill (default); false → flat surface tile. */
  gradient?: boolean;
  className?: string;
}

/**
 * H2 fix 3: 5 warm gradient tones (honey · amber · clay · moss · sand), picked
 * deterministically from the label so one workspace keeps its hue on every
 * surface. Honey stays the brand anchor (tone 0 uses the theme tokens); the
 * dark #1a1407 ink reads on every tone. Decorative only (aria-hidden).
 */
const WARM_TONES: ReadonlyArray<readonly [string, string]> = [
  ['var(--honey-bright)', 'var(--honey-deep)'], // honey (brand default)
  ['#e8a765', '#c26d2c'],                        // amber
  ['#e09a7e', '#b25e40'],                        // clay
  ['#b8c48e', '#7d8f52'],                        // moss
  ['#e3c896', '#b3915c'],                        // sand
];

function toneFor(label: string): readonly [string, string] {
  const key = label.trim();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return WARM_TONES[h % WARM_TONES.length];
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
export function HexAvatar({ label, size = 28, gradient = true, className }: HexAvatarProps) {
  const [bright, deep] = toneFor(label);
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.42)),
        ...(gradient ? { background: `linear-gradient(150deg, ${bright}, ${deep})` } : {}),
      }}
      className={cn(
        'hex grid shrink-0 place-items-center font-extrabold leading-none',
        gradient
          ? 'text-[#1a1407]'
          : 'border border-[var(--line)] bg-[var(--surface-3)] text-[var(--text-2)]',
        className,
      )}
    >
      {firstInitial(label)}
    </span>
  );
}
