import { cn } from '@/lib/utils';

/**
 * Memory confidence pill (UX-Refactor Phase 2 DS, PRD §12.4/§19.1). Maps a 0-100
 * confidence into three bands with a Hive DS `--sem-*` colour AND a text label
 * ("87 · High") so the signal is never colour-only (a11y). Renders nothing when
 * confidence is undefined (a frame with no heuristic score yet).
 */
interface ConfidenceBadgeProps {
  value?: number;
  /** Hide the numeric score, show only the band label. */
  compact?: boolean;
  className?: string;
}

function band(value: number): { label: string; color: string } {
  if (value >= 75) return { label: 'High', color: 'var(--sem-healthy)' };
  if (value >= 40) return { label: 'Medium', color: 'var(--sem-attention)' };
  return { label: 'Low', color: 'var(--sem-risk)' };
}

export function ConfidenceBadge({ value, compact, className }: ConfidenceBadgeProps) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const { label, color } = band(v);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        className,
      )}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
      title={`Confidence ${v}/100 (${label})`}
    >
      <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {compact ? label : `${v} · ${label}`}
    </span>
  );
}
