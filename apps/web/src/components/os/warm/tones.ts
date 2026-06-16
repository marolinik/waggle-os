/**
 * Warm-Hive status tone vocabulary (PR3 shared primitives). Superset of
 * `ui/status-badge.tsx`'s StatusTone, mapped to the DESATURATED warm semantic
 * tokens (recon primitives.md §1). Status-only — never decoration. Light mode
 * inherits because every value resolves from a `var(--token)`.
 */
export type WarmTone =
  | 'work'
  | 'intel'
  | 'healthy'
  | 'attention'
  | 'risk'
  | 'honey'
  | 'neutral';

/** Foreground / dot color for a tone. */
export const TONE_COLOR: Record<WarmTone, string> = {
  work: 'var(--work)',
  intel: 'var(--intel)',
  healthy: 'var(--healthy)',
  attention: 'var(--attention)',
  risk: 'var(--risk)',
  honey: 'var(--honey)',
  neutral: 'var(--text-muted)',
};

/** Tinted wash (background) for a tone. */
export const TONE_WASH: Record<WarmTone, string> = {
  work: 'var(--work-wash)',
  intel: 'var(--intel-wash)',
  healthy: 'var(--healthy-wash)',
  attention: 'var(--honey-wash)',
  risk: 'var(--risk-wash)',
  honey: 'var(--honey-wash)',
  neutral: 'var(--surface-3)',
};
