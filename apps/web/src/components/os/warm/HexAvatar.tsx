import { cn } from '@/lib/utils';

interface HexAvatarProps {
  /** Text to derive the single-initial glyph from (e.g. a workspace name). */
  label: string;
  /** Box size in px (the hex clip fits inside). Default 28. */
  size?: number;
  /** Honey gradient fill (default); false → flat surface tile. */
  gradient?: boolean;
  className?: string;
}

function firstInitial(label: string): string {
  const ch = label.trim()[0];
  return ch ? ch.toUpperCase() : 'W';
}

/**
 * Hex-clipped avatar with the honey gradient + #1a1407 ink — the brand motif
 * for workspaces / agents (extracted from the inline pattern in Sidebar.tsx).
 * Decorative shape; the adjacent name carries the accessible identity, so the
 * tile is aria-hidden.
 */
export function HexAvatar({ label, size = 28, gradient = true, className }: HexAvatarProps) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.42)) }}
      className={cn(
        'hex grid shrink-0 place-items-center font-extrabold leading-none',
        gradient
          ? 'bg-[linear-gradient(150deg,var(--honey-bright),var(--honey-deep))] text-[#1a1407]'
          : 'border border-[var(--line)] bg-[var(--surface-3)] text-[var(--text-2)]',
        className,
      )}
    >
      {firstInitial(label)}
    </span>
  );
}
