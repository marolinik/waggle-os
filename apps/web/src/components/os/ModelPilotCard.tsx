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
  color: string;       // border + accent color
  bgColor: string;     // lane background
  dotColor: string;     // status dot color
  description: string;
}

const LANES: LaneConfig[] = [
  {
    key: 'primary',
    label: 'Primary',
    icon: Zap,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/5 border-emerald-500/20',
    dotColor: 'bg-emerald-400',
    description: 'Your default model for all tasks',
  },
  {
    key: 'fallback',
    label: 'Fallback',
    icon: Shield,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/5 border-amber-500/20',
    dotColor: 'bg-amber-400',
    description: 'Used when primary is down or rate-limited',
  },
  {
    key: 'budget',
    label: 'Budget Saver',
    icon: Coins,
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/5 border-sky-500/20',
    dotColor: 'bg-sky-400',
    description: 'Activates when daily spend exceeds threshold',
  },
];

const COST_TOOLTIPS: Record<string, string> = {
  '$': '~$0.001/msg',
  '$$': '~$0.01/msg',
  '$$$': '~$0.05/msg',
};

const COST_COLORS: Record<string, string> = {
  '$': 'text-emerald-400',
  '$$': 'text-amber-400',
  '$$$': 'text-rose-400',
};

/** Dropdown for picking a model, grouped by provider */
const LaneDropdown = ({
  providers,
  value,
  onChange,
  onClose,
}: {
  providers: Provider[];
  value: string | null;
  onChange: (modelId: string | null) => void;
  onClose: () => void;
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
              <span className="flex items-center gap-0.5 text-[11px] text-amber-400">
                <Key className="w-2.5 h-2.5" /> No key
              </span>
            )}
            {provider.hasKey && (
              <span className="text-[11px] text-emerald-400">&#10003;</span>
            )}
          </div>
          {provider.models.map(m => {
            const isFree = m.id.includes(':free');
            const disabled = !provider.hasKey && provider.requiresKey;
            return (
              <button
                key={m.id}
                onClick={() => { onChange(m.id); onClose(); }}
                disabled={disabled}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between ${
                  value === m.id
                    ? 'bg-primary/10 text-primary'
                    : disabled
                      ? 'text-muted-foreground/40 cursor-not-allowed'
                      : 'text-foreground hover:bg-muted/50'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {m.name}
                  {isFree && (
                    <span className="px-1 py-0.5 rounded text-[11px] font-display font-bold bg-emerald-500/20 text-emerald-400 leading-none">
                      FREE
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 text-[11px]">
                  {disabled ? (
                    <span className="text-muted-foreground/40">Add key in Vault</span>
                  ) : (
                    <HintTooltip content={COST_TOOLTIPS[m.cost] ?? ''}>
                      <span
                        className={COST_COLORS[m.cost] ?? ''}
                        tabIndex={0}
                      >
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

/** Resolve display name for a model id */
const resolveModelName = (modelId: string | null, providers: Provider[]): string => {
  if (!modelId) return 'Not set';
  for (const p of providers) {
    const found = p.models.find(m => m.id === modelId);
    if (found) return found.name;
  }
  // Fallback: show the raw id in a readable form
  return modelId;
};

/** Resolve cost tier for a model id */
const resolveModelCost = (modelId: string | null, providers: Provider[]): string | null => {
  if (!modelId) return null;
  for (const p of providers) {
    const found = p.models.find(m => m.id === modelId);
    if (found) return found.cost;
  }
  return null;
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

  return (
    <div className="rounded-xl bg-secondary/30 border border-border/30 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
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
              <ToggleRight className="w-4 h-4 text-primary" />
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
            <div key={lane.key} className={`relative rounded-lg border p-2.5 ${lane.bgColor}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${lane.dotColor}`} />
                  <lane.icon className={`w-3.5 h-3.5 shrink-0 ${lane.color}`} />
                  <div className="min-w-0">
                    <p className={`text-[11px] font-display font-semibold ${lane.color}`}>
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
                        <HintTooltip content={COST_TOOLTIPS[cost] ?? ''}>
                          <span
                            className={`text-[11px] ${COST_COLORS[cost] ?? ''}`}
                            tabIndex={0}
                          >
                            {cost}
                          </span>
                        </HintTooltip>
                      )}
                      {isFree && (
                        <span className="px-1 rounded text-[11px] font-display font-bold bg-emerald-500/20 text-emerald-400 leading-none">
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
                />
              )}
            </div>
          );
        })}
      </div>

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
            className="w-full h-1.5 rounded-full appearance-none bg-muted/50 accent-sky-400 cursor-pointer"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground mt-0.5">
            <span>10%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>
      )}

      {/* Cost legend */}
      <div className="flex items-center gap-3 pt-1 text-[11px] text-muted-foreground">
        {Object.entries(COST_TOOLTIPS).map(([tier, tooltip]) => (
          <span key={tier} className="flex items-center gap-0.5">
            <span className={COST_COLORS[tier]}>{tier}</span> {tooltip}
          </span>
        ))}
      </div>
    </div>
  );
};

export default ModelPilotCard;
