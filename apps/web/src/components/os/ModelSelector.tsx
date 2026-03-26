/**
 * ModelSelector — reusable model picker used everywhere:
 * Settings, Onboarding, Workspace creation, Spawn dialog, Agent config.
 *
 * Fetches from /api/providers (via useProviders hook).
 * Shows models grouped by provider with key status indicators.
 */

import { useState } from 'react';
import { ChevronDown, Key, AlertTriangle } from 'lucide-react';
import type { Provider, ProviderModel } from '@/hooks/useProviders';

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
  providers: Provider[];
  /** Show as compact dropdown (default) or expanded card grid */
  variant?: 'dropdown' | 'cards';
  /** Filter to only show providers with keys */
  onlyAvailable?: boolean;
  /** Optional class name */
  className?: string;
}

const COST_COLORS: Record<string, string> = {
  '$': 'text-emerald-400',
  '$$': 'text-amber-400',
  '$$$': 'text-rose-400',
};

const SPEED_LABELS: Record<string, string> = {
  fast: '⚡',
  medium: '⏱',
  slow: '🐢',
};

const ModelSelector = ({ value, onChange, providers, variant = 'dropdown', onlyAvailable = false, className = '' }: ModelSelectorProps) => {
  const [open, setOpen] = useState(false);

  const filtered = onlyAvailable ? providers.filter(p => p.hasKey) : providers;

  if (variant === 'cards') {
    return (
      <div className={`space-y-3 ${className}`}>
        {filtered.map(provider => (
          <div key={provider.id}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider">{provider.name}</span>
              {!provider.hasKey && provider.requiresKey && (
                <span className="flex items-center gap-0.5 text-[9px] text-amber-400">
                  <AlertTriangle className="w-2.5 h-2.5" /> No key
                </span>
              )}
              {provider.badge && <span className="text-[9px] text-primary/70">({provider.badge})</span>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {provider.models.map(m => (
                <button key={m.id} onClick={() => onChange(m.id)}
                  disabled={!provider.hasKey && provider.requiresKey}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-display transition-colors ${
                    value === m.id
                      ? 'bg-primary text-primary-foreground'
                      : provider.hasKey || !provider.requiresKey
                        ? 'bg-secondary/50 text-foreground hover:bg-secondary'
                        : 'bg-secondary/20 text-muted-foreground/50 cursor-not-allowed'
                  }`}>
                  {m.name}
                  <span className={`ml-1 ${COST_COLORS[m.cost] ?? ''}`}>{m.cost}</span>
                  <span className="ml-0.5">{SPEED_LABELS[m.speed] ?? ''}</span>
                </button>
              ))}
              {provider.models.length === 0 && !provider.requiresKey && (
                <span className="text-[10px] text-muted-foreground">Configure in Ollama</span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Dropdown variant
  return (
    <div className={`relative ${className}`}>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-muted/50 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground hover:border-primary/50 transition-colors">
        <span className="truncate">
          {value || 'Select model...'}
          {value && (() => {
            const p = filtered.find(prov => prov.models.some(m => m.id === value));
            if (p && !p.hasKey && p.requiresKey) return <AlertTriangle className="w-3 h-3 text-amber-400 inline ml-1.5" />;
            return null;
          })()}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-lg max-h-72 overflow-auto">
          {filtered.map(provider => (
            <div key={provider.id}>
              <div className="px-3 py-1.5 bg-muted/30 flex items-center gap-1.5">
                <span className="text-[9px] font-display font-semibold text-muted-foreground uppercase tracking-wider">{provider.name}</span>
                {!provider.hasKey && provider.requiresKey && (
                  <span className="flex items-center gap-0.5 text-[9px] text-amber-400">
                    <Key className="w-2.5 h-2.5" /> No key
                  </span>
                )}
                {provider.hasKey && <span className="text-[9px] text-emerald-400">✓</span>}
                {provider.badge && <span className="text-[9px] text-primary/60">{provider.badge}</span>}
              </div>
              {provider.models.map(m => (
                <button key={m.id}
                  onClick={() => { onChange(m.id); setOpen(false); }}
                  disabled={!provider.hasKey && provider.requiresKey}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between ${
                    value === m.id
                      ? 'bg-primary/10 text-primary'
                      : provider.hasKey || !provider.requiresKey
                        ? 'text-foreground hover:bg-muted/50'
                        : 'text-muted-foreground/40 cursor-not-allowed'
                  }`}>
                  <span>{m.name}</span>
                  <span className="flex items-center gap-1.5 text-[10px]">
                    <span className={COST_COLORS[m.cost] ?? ''}>{m.cost}</span>
                    <span>{SPEED_LABELS[m.speed] ?? ''}</span>
                  </span>
                </button>
              ))}
              {provider.models.length === 0 && (
                <div className="px-3 py-1.5 text-[10px] text-muted-foreground">No models — configure locally</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ModelSelector;
