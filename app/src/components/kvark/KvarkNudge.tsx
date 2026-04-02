/**
 * KvarkNudge — centralized KVARK enterprise CTA component.
 *
 * Replaces all ad-hoc KVARK copy scattered across views.
 * Only renders for TEAMS or ENTERPRISE tier users.
 *
 * Canonical copy:
 *   "Your data. Your infrastructure. Your rules."
 *   "Everything Waggle does — on your servers, connected to your
 *    internal systems. Full audit trail, governance, zero data leaving
 *    your perimeter."
 */

import { useTier } from '@/hooks/useTier';
import { tierSatisfies } from '@waggle/shared';

export type KvarkTrigger =
  | 'capabilities_page'
  | 'cockpit_enterprise'
  | 'settings_server'
  | 'manual';

interface KvarkNudgeProps {
  trigger: KvarkTrigger;
  variant: 'banner' | 'card' | 'inline';
  className?: string;
}

const KVARK_MAILTO = 'mailto:marko@egzakta.rs?subject=Waggle%20Enterprise%20%2F%20KVARK';
const KVARK_URL = 'https://www.kvark.ai';

export function KvarkNudge({ trigger: _trigger, variant, className }: KvarkNudgeProps) {
  const { tier } = useTier();

  // Only visible to TEAMS and ENTERPRISE users
  if (!tierSatisfies(tier, 'TEAMS')) return null;

  if (variant === 'banner') {
    return (
      <div
        className={`rounded-lg p-4 ${className ?? ''}`}
        style={{
          backgroundColor: 'var(--hive-900)',
          borderLeft: '3px solid var(--honey-500)',
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-sm font-semibold" style={{ color: 'var(--hive-50)' }}>
                Your data. Your infrastructure. Your rules.
              </span>
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest"
                style={{ backgroundColor: 'var(--honey-500)', color: 'var(--hive-950)' }}
              >
                KVARK
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--hive-300)' }}>
              Everything Waggle does — on your servers, connected to your internal systems.
              Full audit trail, governance, zero data leaving your perimeter.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <a
              href={KVARK_MAILTO}
              className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
              style={{ backgroundColor: 'var(--honey-500)', color: 'var(--hive-950)' }}
            >
              Talk to us
            </a>
            <button
              onClick={() => window.open(KVARK_URL, '_blank')}
              className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
              style={{ color: 'var(--hive-300)', border: '1px solid var(--hive-600)' }}
            >
              Learn more
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div
        className={`rounded-lg border p-4 ${className ?? ''}`}
        style={{ backgroundColor: 'var(--hive-900)', borderColor: 'var(--hive-700)' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[13px] font-semibold" style={{ color: 'var(--hive-50)' }}>Enterprise</span>
          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-widest"
            style={{ backgroundColor: 'var(--honey-500)', color: 'var(--hive-950)' }}
          >
            KVARK
          </span>
        </div>
        <p className="text-xs mb-2 leading-relaxed" style={{ color: 'var(--hive-300)' }}>
          Your data. Your infrastructure. Your rules. Everything Waggle does — on your servers,
          connected to your internal systems. Full audit trail, governance, zero data leaving your perimeter.
        </p>
        <div className="flex gap-2 mt-3">
          <a
            href={KVARK_MAILTO}
            className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
            style={{ backgroundColor: 'var(--honey-500)', color: 'var(--hive-950)' }}
          >
            Talk to us
          </a>
          <button
            onClick={() => window.open(KVARK_URL, '_blank')}
            className="text-xs px-3 py-1.5 rounded-md transition-colors"
            style={{ color: 'var(--hive-400)', border: '1px solid var(--hive-700)' }}
          >
            Learn more
          </button>
        </div>
      </div>
    );
  }

  // inline variant
  return (
    <div className={`text-xs ${className ?? ''}`} style={{ color: 'var(--hive-300)' }}>
      <span className="font-medium" style={{ color: 'var(--hive-50)' }}>KVARK Enterprise</span>
      {' — '}
      Your data, your infrastructure, your rules.
      {' '}
      <a href={KVARK_MAILTO} className="underline underline-offset-2" style={{ color: 'var(--honey-500)' }}>
        Talk to us
      </a>
      {' · '}
      <button onClick={() => window.open(KVARK_URL, '_blank')} className="underline underline-offset-2" style={{ color: 'var(--hive-400)' }}>
        Learn more
      </button>
    </div>
  );
}
