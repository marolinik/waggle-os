/**
 * ModelSection — default model selection and model cards.
 *
 * Shows a default model dropdown and model cards with name, provider, cost tier, and speed indicator.
 */

import type { WaggleConfig } from '../../services/types.js';
import { SUPPORTED_PROVIDERS, getCostTier, getSpeedTier } from './utils.js';

export interface ModelSectionProps {
  config: WaggleConfig;
  onConfigUpdate: (config: Partial<WaggleConfig>) => void;
  workspaceModel?: string;
  onWorkspaceModelChange?: (model: string) => void;
}

export function ModelSection({
  config,
  onConfigUpdate,
  workspaceModel,
  onWorkspaceModelChange,
}: ModelSectionProps) {
  // Collect all available models from configured providers
  const allModels = SUPPORTED_PROVIDERS.flatMap((provider) =>
    provider.models.map((model) => ({
      name: model.id,
      displayName: model.displayName,
      provider: provider.id,
      providerName: provider.name,
      cost: getCostTier(model.id),
      speed: getSpeedTier(model.id),
    })),
  );

  return (
    <div className="model-section space-y-6">
      <h2 className="text-lg font-semibold">Models</h2>

      {/* Default model selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">Default Model</label>
        <select
          value={config.defaultModel}
          onChange={(e) => onConfigUpdate({ defaultModel: e.target.value })}
          className="w-full rounded bg-card px-3 py-2 text-sm text-foreground border border-border focus:border-primary focus:outline-none"
        >
          {allModels.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name} ({m.providerName})
            </option>
          ))}
        </select>
      </div>

      {/* Per-workspace override */}
      {onWorkspaceModelChange && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Workspace Override</label>
          <select
            value={workspaceModel ?? ''}
            onChange={(e) => onWorkspaceModelChange(e.target.value)}
            className="w-full rounded bg-card px-3 py-2 text-sm text-foreground border border-border focus:border-primary focus:outline-none"
          >
            <option value="">Use default ({config.defaultModel})</option>
            {allModels.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name} ({m.providerName})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Model cards */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">Available Models</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {allModels.map((model) => (
            <div
              key={model.name}
              className={`model-section__card rounded-lg border p-3 cursor-pointer transition-colors ${
                config.defaultModel === model.name
                  ? 'border-primary bg-card'
                  : 'border-border bg-card hover:border-border'
              }`}
              onClick={() => onConfigUpdate({ defaultModel: model.name })}
            >
              <div className="text-sm font-medium text-foreground">{model.name}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{model.providerName}</span>
                <span className="text-yellow-400">{model.cost}</span>
                <span
                  className={
                    model.speed === 'fast'
                      ? 'text-green-400'
                      : model.speed === 'slow'
                        ? 'text-red-400'
                        : 'text-yellow-400'
                  }
                >
                  {model.speed}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
