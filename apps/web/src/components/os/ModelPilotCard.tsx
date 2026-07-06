/**
 * ModelPilotCard — 3-lane model selector (Primary / Fallback / Budget Saver).
 *
 * Displays a visual model fallback chain so users can see how their models
 * cascade: Primary → Fallback → Budget Saver (when daily spend is high).
 *
 * Does NOT save — the parent SettingsApp handles persistence.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Zap, Shield, Coins, ChevronDown, Info, ToggleLeft, ToggleRight, Key,
} from 'lucide-react';
import type { Provider } from '@/hooks/useProviders';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { formatModelLabel } from '@/lib/model-label';

interface ModelPilotCardProps {
  defaultModel: string;
  fallbackModel: string | null;
  budgetModel: string | null;
  budgetThreshold: number;
  dailyBudget: number | null;
  providers: Provider[];
  onUpdate: (fields: {
    defaultModel?: string;
    fallbackModel?: string | null;
    budgetModel?: string | null;
    budgetThreshold?: number;
  }) => void;
}

interface LaneConfig {
  key: 'primary' | 'fallback' | 'budget';
  label: string;
  icon: React.ElementType;
  /** Role accent (warm palette token) — drives the left rail + label text only;
   *  the row surface itself stays neutral (H2 fix: no full-row tints). */
  rail: string;
  description: string;
}

const LANES: LaneConfig[] = [
  {
    key: 'primary',
    label: 'Primary',
    icon: Zap,
    // Wave U Lane E (item 2): --honey-text (not raw --honey) so the 11px label
    // clears AA in light — raw --honey #c07f00 probes ~3.3:1 on the ivory card,
    // --honey-text #9a6408 is ~4.9:1. No-op in dark (both resolve to #e9a52c).
    rail: 'var(--honey-text)',
    description: 'Your default model for all tasks',
  },
  {
    key: 'fallback',
    label: 'Fallback',
    icon: Shield,
    // Warm copper — role identity deliberately OFF the semantic palette
    // (round-4: the --risk rail read as "this lane is failing"). Mixed from
    // the theme tokens so it tracks both themes; the Shield icon carries the
    // role, and red/green stay reserved for real states. Wave U Lane E (item 2):
    // the honey half uses --honey-text so the copper label clears AA in light
    // (~3.8:1 → ~4.7:1); no-op in dark where --honey-text == --honey.
    rail: 'color-mix(in srgb, var(--honey-text) 55%, var(--risk) 45%)',
    description: 'Used when primary is down or rate-limited',
  },
  {
    key: 'budget',
    label: 'Budget Saver',
    icon: Coins,
    // Warm sand/stone — NOT --healthy (green read as "success", not a role).
    rail: 'var(--text-muted)',
    description: 'Activates when daily spend exceeds threshold',
  },
];

const COST_TOOLTIPS: Record<string, string> = {
  '$': '~$0.001/msg',
  '$$': '~$0.01/msg',
  '$$$': '~$0.05/msg',
};

/** Dropdown for picking a model, grouped by provider */
const LaneDropdown = ({
  providers,
  value,
  onChange,
  onClose,
  sameAsPrimaryId,
}: {
  providers: Provider[];
  value: string | null;
  onChange: (modelId: string | null) => void;
  onClose: () => void;
  /** W2C: model id equal to Primary — disabled here (a fallback == primary can never fire). */
  sameAsPrimaryId?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 right-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-lg max-h-56 overflow-auto"
    >
      {providers.map(provider => (
        <div key={provider.id}>
          <div className="px-3 py-1 bg-muted/30 flex items-center gap-1.5 sticky top-0">
            <span className="text-[11px] font-display font-semibold text-muted-foreground uppercase tracking-wider">
              {provider.name}
            </span>
            {!provider.hasKey && provider.requiresKey && (
              <span className="flex items-center gap-0.5 text-[11px] text-[var(--status-warning)]">
                <Key className="w-2.5 h-2.5" /> No key
              </span>
            )}
            {/* ✓ = key configured (presence only — no probe status is in reach
                here), so it stays muted-neutral rather than a success green. */}
            {provider.hasKey && (
              <span className="text-[11px] text-muted-foreground">&#10003;</span>
            )}
          </div>
          {provider.models.map(m => {
            const isFree = m.id.includes(':free');
            const isSameAsPrimary = m.id === sameAsPrimaryId;
            const disabled = (!provider.hasKey && provider.requiresKey) || isSameAsPrimary;
            return (
              <button
                key={m.id}
                onClick={() => { onChange(m.id); onClose(); }}
                disabled={disabled}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between ${
                  value === m.id
                    ? 'bg-primary/10 text-honey'
                    : disabled
                      ? 'text-muted-foreground/40 cursor-not-allowed'
                      : 'text-foreground hover:bg-muted/50'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {m.name}
                  {isFree && (
                    <span className="px-1 py-0.5 rounded text-[11px] font-display font-bold bg-[var(--healthy-wash)] text-[var(--healthy)] leading-none">
                      FREE
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 text-[11px]">
                  {isSameAsPrimary ? (
                    <span className="text-muted-foreground/60">Same as Primary</span>
                  ) : disabled ? (
                    <span className="text-muted-foreground/40">Add key in Vault</span>
                  ) : (
                    <HintTooltip content={COST_TOOLTIPS[m.cost] ?? ''}>
                      {/* The $ count already encodes cost — neutral text, no traffic-light colors. */}
                      <span className="text-muted-foreground" tabIndex={0}>
                        {m.cost}
                      </span>
                    </HintTooltip>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** Resolve display name for a model id (W2C: via the shared formatter). */
const resolveModelName = (modelId: string | null, providers: Provider[]): string =>
  modelId ? formatModelLabel(modelId, providers) : 'Not set';

/** Resolve cost tier for a model id */
const resolveModelCost = (modelId: string | null, providers: Provider[]): string | null => {
  if (!modelId) return null;
  for (const p of providers) {
    const found = p.models.find(m => m.id === modelId);
    if (found) return found.cost;
  }
  return null;
};

/** Cost rank for a model — lower is cheaper. FREE=0, $=1, $$=2, $$$=3; an
 *  unknown/unpriced cost returns null (excluded from cheaper-than comparisons). */
const costRank = (model: { id: string; cost: string }): number | null => {
  if (model.id.includes(':free')) return 0;
  switch (model.cost) {
    case '$': return 1;
    case '$$': return 2;
    case '$$$': return 3;
    default: return null;
  }
};

/** Find a strictly-cheaper, USABLE model than the primary from the live catalog
 *  (real data only — the owning provider must have a key so the fallback can
 *  actually fire, and it must not equal the primary). Returns the cheapest such
 *  model, or null when none exists (no invention — the button then hides). */
const findCheaperFallback = (
  defaultModel: string,
  providers: Provider[],
): { id: string; name: string } | null => {
  let primaryRank: number | null = null;
  for (const p of providers) {
    const m = p.models.find(mm => mm.id === defaultModel);
    if (m) { primaryRank = costRank(m); break; }
  }
  if (primaryRank == null) return null;
  let best: { id: string; name: string; rank: number } | null = null;
  for (const p of providers) {
    if (p.requiresKey && !p.hasKey) continue; // must be usable
    for (const m of p.models) {
      if (m.id === defaultModel) continue;
      const rank = costRank(m);
      if (rank == null || rank >= primaryRank) continue;
      if (!best || rank < best.rank) best = { id: m.id, name: m.name, rank };
    }
  }
  return best ? { id: best.id, name: best.name } : null;
};

const ModelPilotCard = ({
  defaultModel,
  fallbackModel,
  budgetModel,
  budgetThreshold,
  dailyBudget,
  providers,
  onUpdate,
}: ModelPilotCardProps) => {
  const [singleMode, setSingleMode] = useState(false);
  const [openLane, setOpenLane] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const handleClose = useCallback(() => setOpenLane(null), []);

  const getModelForLane = (lane: LaneConfig['key']): string | null => {
    switch (lane) {
      case 'primary': return defaultModel || null;
      case 'fallback': return fallbackModel;
      case 'budget': return budgetModel;
    }
  };

  const handleLaneChange = (lane: LaneConfig['key'], modelId: string | null) => {
    switch (lane) {
      case 'primary':
        onUpdate({ defaultModel: modelId ?? '' });
        break;
      case 'fallback':
        onUpdate({ fallbackModel: modelId });
        break;
      case 'budget':
        onUpdate({ budgetModel: modelId });
        break;
    }
  };

  const toggleSingleMode = () => {
    const next = !singleMode;
    setSingleMode(next);
    if (next) {
      // Clear fallback & budget when going to single mode
      onUpdate({ fallbackModel: null, budgetModel: null });
    }
  };

  const visibleLanes = singleMode ? LANES.slice(0, 1) : LANES;

  // kw (Wave S): when the fallback can never fire (== primary), offer a
  // one-click switch to a strictly-cheaper usable model — only if one really
  // exists in the catalog. Null hides the suggestion (no invented models).
  const cheaperFallback =
    !singleMode && fallbackModel && fallbackModel === defaultModel
      ? findCheaperFallback(defaultModel, providers)
      : null;

  return (
    <div className="rounded-xl bg-secondary/30 border border-border/30 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-honey" />
          <h3 className="text-sm font-display font-semibold text-foreground">Model Pilot</h3>
          <HintTooltip content="What is Model Pilot?">
            <button
              onClick={() => setShowInfo(!showInfo)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </HintTooltip>
        </div>
        <HintTooltip content={singleMode ? 'Enable fallback chain' : 'Use single model only'}>
          <button
            onClick={toggleSingleMode}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {singleMode ? (
              <ToggleLeft className="w-4 h-4" />
            ) : (
              <ToggleRight className="w-4 h-4 text-honey" />
            )}
            {singleMode ? 'Single model' : 'Fallback chain'}
          </button>
        </HintTooltip>
      </div>

      {/* Info tooltip */}
      {showInfo && (
        <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/10 text-[11px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Model Pilot</strong> automatically routes your requests through a fallback chain.
          If your primary model is unavailable (rate limit, outage), it falls back to your secondary.
          The budget saver activates when your daily spend crosses the threshold, switching to a cheaper model
          to keep costs predictable.
        </div>
      )}

      {/* Lanes */}
      <div className="space-y-2">
        {visibleLanes.map(lane => {
          const modelId = getModelForLane(lane.key);
          const modelName = resolveModelName(modelId, providers);
          const cost = resolveModelCost(modelId, providers);
          const isFree = modelId?.includes(':free') ?? false;
          const isOpen = openLane === lane.key;

          return (
            <div key={lane.key} className="relative rounded-lg border border-[var(--line-soft)] bg-card p-2.5 pl-3.5 shadow-[var(--shadow-sm)]">
              {/* Single role accent: inset 3px rail + colored label (no overflow-hidden —
                  the LaneDropdown below overhangs the row). */}
              <span
                aria-hidden
                className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full"
                style={{ background: lane.rail }}
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <lane.icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-display font-semibold" style={{ color: lane.rail }}>
                      {lane.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{lane.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Current model display */}
                  <div className="text-right">
                    <p className="text-xs text-foreground font-display truncate max-w-[140px]">
                      {modelName}
                    </p>
                    <div className="flex items-center justify-end gap-1">
                      {cost && (
                        // R10: the bare `$$$` glyph read as cryptic — surface the
                        // explicit per-message cost inline (+ aria-label) so the
                        // tier is legible without a hover or a foot-of-card legend.
                        <span
                          className="text-[11px] text-muted-foreground"
                          aria-label={`Cost tier ${cost}${COST_TOOLTIPS[cost] ? ` — ${COST_TOOLTIPS[cost]}` : ''}`}
                        >
                          {cost}{COST_TOOLTIPS[cost] ? ` · ${COST_TOOLTIPS[cost]}` : ''}
                        </span>
                      )}
                      {isFree && (
                        <span className="px-1 rounded text-[11px] font-display font-bold bg-[var(--healthy-wash)] text-[var(--healthy)] leading-none">
                          FREE
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Change button */}
                  <button
                    onClick={() => setOpenLane(isOpen ? null : lane.key)}
                    className="flex items-center gap-0.5 px-2 py-1 rounded-md text-[11px] font-display bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    Change
                    <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Dropdown */}
              {isOpen && (
                <LaneDropdown
                  providers={providers}
                  value={modelId}
                  onChange={(id) => handleLaneChange(lane.key, id)}
                  onClose={handleClose}
                  sameAsPrimaryId={lane.key === 'fallback' ? (defaultModel || undefined) : undefined}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* W2C: a persisted fallback equal to the primary can never fire
          (chat.ts guards resolvedModel !== fallbackModel). Warn + one-click clear.
          H2: quiet neutral styling — the ModelGate key-health banner above owns
          the amber on this screen; two amber banners at once read as an incident. */}
      {!singleMode && fallbackModel && fallbackModel === defaultModel && (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-[var(--line-soft)] bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground"
          data-testid="model-pilot-fallback-equals-primary"
        >
          <Shield className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 min-w-[10rem]">Fallback equals Primary — failover will never trigger.</span>
          {cheaperFallback && (
            <button
              onClick={() => onUpdate({ fallbackModel: cheaperFallback.id })}
              title={`Switch fallback to ${cheaperFallback.name}`}
              data-testid="model-pilot-use-cheaper-fallback"
              className="shrink-0 font-display font-semibold text-honey transition-opacity hover:opacity-80"
            >
              Use a cheaper fallback
            </button>
          )}
          <button
            onClick={() => onUpdate({ fallbackModel: null })}
            className="shrink-0 font-display font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      {/* Budget threshold slider — only when budget lane visible & daily budget is set */}
      {!singleMode && dailyBudget != null && dailyBudget > 0 && (
        <div className="pt-2 border-t border-border/20">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] text-muted-foreground">
              Budget saver activates at <strong className="text-foreground">{Math.round(budgetThreshold * 100)}%</strong> of daily budget
            </p>
            <p className="text-[11px] text-muted-foreground font-mono">
              ${(dailyBudget * budgetThreshold).toFixed(2)} / ${dailyBudget.toFixed(2)}
            </p>
          </div>
          <input
            type="range"
            min={0.1}
            max={1.0}
            step={0.05}
            value={budgetThreshold}
            onChange={(e) => onUpdate({ budgetThreshold: parseFloat(e.target.value) })}
            className="w-full h-1.5 rounded-full appearance-none bg-muted/50 accent-[var(--honey)] cursor-pointer"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground mt-0.5">
            <span>10%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>
      )}
      {/* Cost legend removed (R10): each lane row now carries the explicit
          per-message cost inline, so a foot-of-card key is redundant. */}
    </div>
  );
};

export default ModelPilotCard;
