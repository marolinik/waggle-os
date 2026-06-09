import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Semantic status pill (UX-Refactor Phase 2 DS). Unlike the generic `Badge`,
 * this ALWAYS carries a text label (not colour alone) — closing the biggest a11y
 * gap vs ui/badge.tsx (design-system-delta §b). Colour comes from the Hive DS
 * `--sem-*` tokens via inline style (matching HomeCockpit's Phase-1 pattern); a
 * small dot is decorative (aria-hidden) so the meaning never depends on hue.
 *
 * Reusable across Memory / Artifact / Agent / Connector statuses — the caller
 * maps its domain status onto a `tone` + `label`.
 */
export type StatusTone = 'healthy' | 'attention' | 'risk' | 'info' | 'neutral';

const TONE_VAR: Record<Exclude<StatusTone, 'neutral'>, string> = {
  healthy: 'var(--sem-healthy)',
  attention: 'var(--sem-attention)',
  risk: 'var(--sem-risk)',
  info: 'var(--sem-intelligence)',
};

interface StatusBadgeProps {
  tone: StatusTone;
  label: string;
  /** Optional leading icon; replaces the default colour dot. */
  icon?: ReactNode;
  className?: string;
}

export function StatusBadge({ tone, label, icon, className }: StatusBadgeProps) {
  const base = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap';

  if (tone === 'neutral') {
    return (
      <span className={cn(base, 'border-border bg-muted/40 text-muted-foreground', className)}>
        {icon ?? <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full bg-current opacity-60" />}
        {label}
      </span>
    );
  }

  const color = TONE_VAR[tone];
  return (
    <span
      className={cn(base, className)}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      {icon ?? <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />}
      {label}
    </span>
  );
}
