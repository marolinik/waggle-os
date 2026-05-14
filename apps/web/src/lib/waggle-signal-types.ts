import type { ElementType } from 'react';
import { Eye, ArrowRightLeft, Lightbulb, AlertTriangle, Radio, Zap } from 'lucide-react';

export type TypeConfigEntry = { icon: ElementType; color: string; label: string };

/**
 * Mapping from the narrow WaggleSignal type union to display config.
 * Server can emit a wider set of type strings (e.g. agent:started, tool:called)
 * that aren't in the union — getTypeConfig handles those via FALLBACK_TYPE_CONFIG
 * so the component never crashes on an unknown value (FR #2).
 */
export const WAGGLE_TYPE_CONFIG: Record<string, TypeConfigEntry> = {
  discovery:   { icon: Eye,            color: 'text-amber-400',         label: 'Discovery'    },
  handoff:     { icon: ArrowRightLeft, color: 'text-sky-400',           label: 'Handoff'      },
  insight:     { icon: Lightbulb,      color: 'text-emerald-400',       label: 'Insight'      },
  alert:       { icon: AlertTriangle,  color: 'text-rose-400',          label: 'Alert'        },
  coordination:{ icon: Radio,          color: 'text-violet-400',        label: 'Coordination' },
};

export const FALLBACK_TYPE_CONFIG: TypeConfigEntry = {
  icon: Zap,
  color: 'text-muted-foreground',
  label: 'Activity',
};

/**
 * Resolve display config for a signal type string.
 * Unknown types (e.g. agent:started, tool:called emitted by fleet.ts) fall
 * back to FALLBACK_TYPE_CONFIG with the raw type string as the label so the
 * app renders something meaningful instead of crashing.
 */
export function getTypeConfig(type: string): TypeConfigEntry {
  return WAGGLE_TYPE_CONFIG[type] ?? { ...FALLBACK_TYPE_CONFIG, label: type };
}
