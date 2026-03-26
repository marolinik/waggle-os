/**
 * ModelsSection — model selection + API key management + custom model support.
 *
 * Shows available models from configured providers, fetches live model lists
 * when an API key is configured, and allows adding custom/local models.
 */

import { useState, useEffect, useCallback } from 'react';
import type { WaggleConfig } from '../../services/types.js';
import { SUPPORTED_PROVIDERS, getCostTier, getSpeedTier, validateProviderConfig } from './utils.js';

export interface ModelsSectionProps {
  config: WaggleConfig;
  onConfigUpdate: (config: Partial<WaggleConfig>) => void;
  onTestApiKey?: (provider: string, key: string) => Promise<{ valid: boolean; error?: string }>;
  /** Server base URL for fetching live model lists */
  serverUrl?: string;
}

interface ProviderStatus {
  testing: boolean;
  valid?: boolean;
  error?: string;
}

interface ModelEntry {
  name: string;         // API model ID
  displayName: string;  // Human-friendly name shown in UI
  provider: string;
  providerName: string;
  cost: '$' | '$$' | '$$$';
  speed: 'fast' | 'medium' | 'slow';
  isCustom?: boolean;
}

export function ModelsSection({ config, onConfigUpdate, onTestApiKey, serverUrl }: ModelsSectionProps) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>({});
  const [liveModels, setLiveModels] = useState<string[]>([]);
  const [showAddModel, setShowAddModel] = useState(false);
  const [customModelName, setCustomModelName] = useState('');
  const [customModelUrl, setCustomModelUrl] = useState('');

  // Fetch live model list from the server (LiteLLM or Anthropic proxy)
  const fetchModels = useCallback(async () => {
    const base = serverUrl ?? '';
    try {
      const res = await fetch(`${base}/api/litellm/models`);
      if (res.ok) {
        const data = await res.json();
        const models = Array.isArray(data) ? data : data.models ?? data.data?.map((m: { id: string }) => m.id) ?? [];
        setLiveModels(models.filter((m: unknown) => typeof m === 'string'));
      }
    } catch {
      // Server not reachable or no models endpoint
    }
  }, [serverUrl]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Build unified model list: static defaults + live models + custom models
  const staticModels: ModelEntry[] = SUPPORTED_PROVIDERS.flatMap((provider) =>
    provider.models.map((model) => ({
      name: model.id,
      displayName: model.displayName,
      provider: provider.id,
      providerName: provider.name,
      cost: getCostTier(model.id),
      speed: getSpeedTier(model.id),
    })),
  );

  // Add live models not in static list
  const staticNames = new Set(staticModels.map(m => m.name));
  const extraLive: ModelEntry[] = liveModels
    .filter(m => !staticNames.has(m))
    .map(m => ({
      name: m,
      displayName: m,
      provider: 'live',
      providerName: 'LiteLLM',
      cost: getCostTier(m),
      speed: getSpeedTier(m),
    }));

  // Add user-defined custom models from config
  const customModels: ModelEntry[] = (config.customModels ?? []).map((m: { name: string; baseUrl?: string }) => ({
    name: m.name,
    displayName: m.name,
    provider: 'custom',
    providerName: m.baseUrl ? 'Custom' : 'Local',
    cost: getCostTier(m.name),
    speed: getSpeedTier(m.name),
    isCustom: true,
  }));

  const allModels = [...staticModels, ...extraLive, ...customModels];

  const toggleReveal = (providerId: string) => {
    setRevealed((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  const handleKeyChange = (providerId: string, apiKey: string) => {
    const providers = { ...config.providers };
    providers[providerId] = {
      ...providers[providerId],
      apiKey,
      models: providers[providerId]?.models ?? [],
    };
    onConfigUpdate({ providers });
  };

  const handleTest = async (providerId: string) => {
    const key = config.providers[providerId]?.apiKey ?? '';
    const clientValidation = validateProviderConfig(providerId, key);
    if (!clientValidation.valid) {
      setStatuses((prev) => ({
        ...prev,
        [providerId]: { testing: false, valid: false, error: clientValidation.error },
      }));
      return;
    }
    setStatuses((prev) => ({ ...prev, [providerId]: { testing: true } }));
    if (onTestApiKey) {
      const result = await onTestApiKey(providerId, key);
      setStatuses((prev) => ({
        ...prev,
        [providerId]: { testing: false, valid: result.valid, error: result.error },
      }));
      // Refresh model list after successful connection
      if (result.valid) fetchModels();
    }
  };

  const handleAddCustomModel = () => {
    if (!customModelName.trim()) return;
    const existing = config.customModels ?? [];
    const entry = { name: customModelName.trim(), baseUrl: customModelUrl.trim() || undefined };
    onConfigUpdate({ customModels: [...existing, entry] } as Partial<WaggleConfig>);
    setCustomModelName('');
    setCustomModelUrl('');
    setShowAddModel(false);
  };

  const handleRemoveCustomModel = (name: string) => {
    const existing = config.customModels ?? [];
    onConfigUpdate({ customModels: existing.filter((m: { name: string }) => m.name !== name) } as Partial<WaggleConfig>);
  };

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-base font-semibold text-foreground">Models & Providers</h2>

      {/* Default model selector */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Default Model</label>
        <select
          value={config.defaultModel}
          onChange={(e) => onConfigUpdate({ defaultModel: e.target.value })}
          className="w-full px-3 py-2 text-[13px] bg-card text-foreground border border-border rounded-md outline-none"
        >
          {allModels.map((m) => (
            <option key={m.name} value={m.name}>
              {m.displayName} ({m.providerName})
            </option>
          ))}
        </select>
      </div>

      {/* Model cards grid */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <h3 className="text-[13px] font-medium text-muted-foreground">
            Available Models ({allModels.length})
          </h3>
          {liveModels.length > 0 && (
            <span className="text-[11px] text-green-500">
              {liveModels.length} live from LiteLLM
            </span>
          )}
        </div>
        <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
          {allModels.map((model) => (
            <div
              key={model.name}
              onClick={() => onConfigUpdate({ defaultModel: model.name })}
              className={`px-3.5 py-2.5 rounded-lg cursor-pointer transition-colors ${
                config.defaultModel === model.name
                  ? 'bg-[hsl(var(--primary)/0.08)] border border-primary'
                  : 'bg-card border border-border hover:border-primary/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-foreground">{model.displayName}</span>
                {config.defaultModel === model.name && (
                  <span className="text-[9px] font-semibold text-primary bg-primary/15 px-1.5 py-0.5 rounded">DEFAULT</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px]">
                <span className="text-muted-foreground">{model.providerName}</span>
                <span className="text-yellow-500">{model.cost}</span>
                <span className={
                  model.speed === 'fast' ? 'text-green-500' : model.speed === 'slow' ? 'text-destructive' : 'text-yellow-500'
                }>
                  {model.speed}
                </span>
                {model.isCustom && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveCustomModel(model.name); }}
                    className="text-destructive text-[10px] cursor-pointer bg-transparent border-none p-0"
                    title="Remove custom model"
                  >
                    remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Custom Model */}
      <div className="flex flex-col gap-2">
        {!showAddModel ? (
          <button
            onClick={() => setShowAddModel(true)}
            className="px-4 py-2 text-xs font-medium bg-card text-primary border border-dashed border-primary rounded-md cursor-pointer self-start"
          >
            + Add Custom Model
          </button>
        ) : (
          <div className="p-4 rounded-lg bg-card border border-border">
            <h4 className="text-[13px] font-medium mb-3 text-foreground">
              Add Custom Model
            </h4>
            <p className="text-[11px] text-muted-foreground mb-3">
              Add any model: Ollama (llama3, codellama), LM Studio, Nano Banana, Veo, or any OpenAI-compatible endpoint.
            </p>
            <div className="flex flex-col gap-2">
              <input
                value={customModelName}
                onChange={(e) => setCustomModelName(e.target.value)}
                placeholder="Model name (e.g., llama3:70b, nano-banana-v2, veo-3)"
                className="px-3 py-2 text-[13px] bg-background text-foreground border border-border rounded-md outline-none"
              />
              <input
                value={customModelUrl}
                onChange={(e) => setCustomModelUrl(e.target.value)}
                placeholder="Base URL (optional — e.g., http://localhost:11434 for Ollama)"
                className="px-3 py-2 text-[13px] bg-background text-foreground border border-border rounded-md outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddCustomModel}
                  disabled={!customModelName.trim()}
                  className={`px-4 py-1.5 text-xs font-medium border-none rounded-md ${
                    customModelName.trim()
                      ? 'bg-primary text-primary-foreground cursor-pointer'
                      : 'bg-secondary text-muted-foreground/40 cursor-not-allowed'
                  }`}
                >
                  Add Model
                </button>
                <button
                  onClick={() => setShowAddModel(false)}
                  className="px-4 py-1.5 text-xs bg-transparent text-muted-foreground border border-border rounded-md cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* API Keys per provider */}
      <div className="flex flex-col gap-3">
        <h3 className="text-[13px] font-medium text-muted-foreground">API Keys</h3>
        <p className="text-[11px] text-muted-foreground/40">
          Keys are encrypted in your local vault. Never sent to Waggle servers.
        </p>

        {SUPPORTED_PROVIDERS.filter(p => p.id !== 'custom').map((provider) => {
          const key = config.providers[provider.id]?.apiKey ?? '';
          const isRevealed = revealed[provider.id] ?? false;
          const status = statuses[provider.id];

          return (
            <div key={provider.id} className="px-4 py-3 rounded-lg bg-card border border-border">
              <div className="flex justify-between items-center mb-2">
                <label className="text-[13px] font-medium text-foreground">{provider.name}</label>
                {status && !status.testing && (
                  <span className={`text-xs ${status.valid ? 'text-green-500' : 'text-destructive'}`}>
                    {status.valid ? '\u2713 Connected' : `\u2717 ${status.error ?? 'Failed'}`}
                  </span>
                )}
                {status?.testing && (
                  <span className="text-xs text-yellow-500">Testing...</span>
                )}
              </div>
              <div className="flex gap-1.5">
                <input
                  type={isRevealed ? 'text' : 'password'}
                  value={key}
                  onChange={(e) => handleKeyChange(provider.id, e.target.value)}
                  placeholder={provider.keyPrefix ? `${provider.keyPrefix}...` : `Enter ${provider.name} API key`}
                  className="flex-1 px-2.5 py-1.5 text-xs font-mono bg-background text-foreground border border-border rounded outline-none"
                />
                <button
                  onClick={() => toggleReveal(provider.id)}
                  className="px-2.5 py-1.5 text-[11px] bg-secondary text-muted-foreground border border-border rounded cursor-pointer"
                >
                  {isRevealed ? 'Hide' : 'Show'}
                </button>
                <button
                  onClick={() => handleTest(provider.id)}
                  disabled={!key || status?.testing}
                  className={`px-3 py-1.5 text-[11px] font-medium border-none rounded ${
                    key && !status?.testing
                      ? 'bg-primary text-primary-foreground cursor-pointer'
                      : 'bg-secondary text-muted-foreground/40 cursor-not-allowed'
                  }`}
                >
                  Test
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
