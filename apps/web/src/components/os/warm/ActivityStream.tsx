import { useState, type ReactNode } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DotLive } from './DotLive';
import { ProvenanceLine } from './ProvenanceLine';
import type { WarmTone } from './tones';

export interface ActivityStep {
  tone?: WarmTone;
  text: ReactNode;
  /** Provenance for the step — rendered only when real source data exists. */
  provenance?: { source: string; when?: string; onClick?: () => void };
}

interface ActivityStreamProps {
  /** e.g. "Worked across memory, web & files". */
  summary: string;
  durationMs?: number;
  steps: ActivityStep[];
  /** Default-open on the active turn; collapsed on prior turns. */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * The Chat "activity stream" — a collapsible card that reveals the agent's
 * steps (each with a tone dot and optional provenance pill). The header shows a
 * summary + step count + duration. Violet spark = intelligence/memory work.
 */
export function ActivityStream({
  summary,
  durationMs,
  steps,
  defaultOpen = false,
  className,
}: ActivityStreamProps) {
  const [open, setOpen] = useState(defaultOpen);
  const seconds = durationMs != null ? `${Math.max(1, Math.round(durationMs / 1000))}s` : null;
  const meta = [`${steps.length} step${steps.length === 1 ? '' : 's'}`, seconds].filter(Boolean).join(' · ');
  return (
    <div className={cn('rounded-[14px] border border-[var(--line-soft)] bg-[var(--bg-2)]', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-[var(--intel)]" strokeWidth={1.8} />
        <span className="flex-1 text-[13px] text-[var(--text-2)]">
          {summary}
          {meta && <span className="text-[var(--text-dim)]"> · {meta}</span>}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-[var(--text-dim)] transition-transform motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <ul className="space-y-2 border-t border-[var(--line-soft)] px-3.5 py-3">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[13px] text-[var(--text-2)]">
              <DotLive tone={s.tone ?? 'intel'} live={false} size={7} className="mt-1.5" />
              <span className="min-w-0 flex-1">
                {s.text}
                {s.provenance && (
                  <span className="mt-1 block">
                    <ProvenanceLine {...s.provenance} />
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
