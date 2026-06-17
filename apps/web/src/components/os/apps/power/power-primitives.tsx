/**
 * Power-surfaces shared primitives (Warm-Hive PR6b · B3 · screen 08).
 *
 * The §08 design intent is "ONE reusable row/card/toggle/badge set" used across
 * the long-tail power apps (Tools · Automations · Approvals · Vault · Usage).
 * Per D8 we do NOT consolidate the routes — instead the consistency comes from
 * these shared primitives, restyled to the warm semantic tokens (D21).
 *
 * All status colours resolve from `var(--token)` so light mode inherits for
 * free (see warm/tones.ts). The only raw hex is the on-honey ink (#1a1407),
 * the design's canonical dark-on-honey foreground (matches InlineApprovalCard).
 *
 * No fabricated data: `RiskBadge`/`riskToneForTool` only classify a REAL tool
 * name — they never invent a risk the backend didn't imply.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TONE_COLOR, TONE_WASH, type WarmTone } from '@/components/os/warm/tones';

// ── SurfaceRow ─────────────────────────────────────────────────────────────
// The canonical power-surface list row: leading glyph, title + subtitle, and a
// trailing actions slot. Mirrors surfaces.html `.rc`.

interface SurfaceRowProps {
  /** Leading glyph — a mono initials chip, an icon, or any node. */
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Trailing actions / badges / toggle. */
  actions?: ReactNode;
  className?: string;
}

export function SurfaceRow({ leading, title, subtitle, actions, className }: SurfaceRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3.5 rounded-[12px] border border-[var(--line-soft)] bg-[var(--surface)] px-4 py-3.5 transition-colors hover:border-[var(--line-strong)]',
        className,
      )}
    >
      {leading != null && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-[var(--line)] bg-[var(--surface-2)] font-mono text-[11px] font-bold text-[var(--text-2)]">
          {leading}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold text-[var(--text)]">{title}</div>
        {subtitle != null && (
          <div className="mt-0.5 truncate text-[12.5px] text-[var(--text-muted)]">{subtitle}</div>
        )}
      </div>
      {actions != null && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── SurfaceToggle ──────────────────────────────────────────────────────────
// Accessible enable/pause switch. Mirrors surfaces.html `.sw`; honey when on.

interface SurfaceToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible label — required (the switch has no visible text). */
  label: string;
  disabled?: boolean;
  className?: string;
}

export function SurfaceToggle({ checked, onChange, label, disabled, className }: SurfaceToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[22px] w-[38px] shrink-0 rounded-full border transition-colors disabled:opacity-50',
        checked
          ? 'border-[var(--honey)] bg-[var(--honey)]'
          : 'border-[var(--line-strong)] bg-[var(--surface-3)]',
        className,
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] h-4 w-4 rounded-full transition-all',
          checked ? 'left-[18px] bg-[#1a1407]' : 'left-[2px] bg-[var(--text-muted)]',
        )}
      />
    </button>
  );
}

// ── RiskBadge ──────────────────────────────────────────────────────────────
// Color-stratified risk chip. Mirrors surfaces.html `.bdg.ok/.warn/.risk/.off`.
// Keyed on the canonical RiskLevel so it speaks the same vocabulary as the
// shared risk-display.tsx — but mapped to WARM tokens (D21), not raw amber/emerald.

export type RiskTone = 'low' | 'medium' | 'high' | 'critical';

const RISK_TONE: Record<RiskTone, WarmTone> = {
  low: 'healthy',
  medium: 'attention',
  high: 'risk',
  critical: 'risk',
};

const RISK_LABEL: Record<RiskTone, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

interface RiskBadgeProps {
  level: RiskTone;
  /** Append the word "risk" (matches the design "Medium risk"). */
  withSuffix?: boolean;
  className?: string;
}

export function RiskBadge({ level, withSuffix = true, className }: RiskBadgeProps) {
  const tone = RISK_TONE[level];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        level === 'critical' && 'uppercase tracking-wide',
        className,
      )}
      style={{ color: TONE_COLOR[tone], background: TONE_WASH[tone] }}
    >
      {RISK_LABEL[level]}
      {withSuffix ? ' risk' : ''}
    </span>
  );
}

// ── StatusBadge (ok / paused / failed) ───────────────────────────────────────
// Generic warm status pill for the non-risk surfaces (Connected / Active /
// Paused / Failed). Mirrors surfaces.html `.bdg.ok/.off/.risk`.

interface StatusBadgeProps {
  tone: WarmTone;
  /** Show a leading dot (design uses ● for connected/active). */
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

export function StatusBadge({ tone, dot, children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        className,
      )}
      style={{ color: TONE_COLOR[tone], background: TONE_WASH[tone] }}
    >
      {dot && <span aria-hidden className="text-[8px] leading-none">●</span>}
      {children}
    </span>
  );
}

// ── riskToneForTool ──────────────────────────────────────────────────────────
// HONEST classifier (NOT fabrication): the pending-approval backend payload
// carries only `toolName`/`input` — no risk field. Rather than invent a level,
// we deterministically classify the REAL tool name, mirroring the canonical
// `actionRisk`/`classifyInstallRisk` helpers in risk-display.tsx:
//   - tools that write to / send beyond this machine → Medium (recoverable
//     external state change)
//   - everything else (local reads/writes confined to the workspace) → Low
// This is a transparent classification of real data, not a fabricated risk.

const EXTERNAL_WRITE_HINTS = [
  'send', 'post', 'write', 'create', 'update', 'delete', 'push', 'deploy',
  'export', 'upload', 'publish', 'commit', 'email', 'sync', 'connector',
  'salesforce', 'slack', 'github', 'jira', 'notion', 'hubspot',
];

/** Classify a real gated-tool name into a risk level. No invented data. */
export function riskToneForTool(toolName: string, input?: Record<string, unknown>): RiskTone {
  const name = toolName.toLowerCase();
  // A target_workspace_id in the input means a cross-workspace reach — medium.
  if (input && typeof input.target_workspace_id === 'string') return 'medium';
  if (EXTERNAL_WRITE_HINTS.some((h) => name.includes(h))) return 'medium';
  return 'low';
}
