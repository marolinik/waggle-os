/**
 * ApiKeySection — provider API key management.
 *
 * Shows a list of supported providers with masked key inputs,
 * show/hide toggle, and "Test Connection" button.
 */

import React, { useState } from 'react';
import type { WaggleConfig } from '../../services/types.js';
import { SUPPORTED_PROVIDERS, validateProviderConfig } from './utils.js';

export interface ApiKeySectionProps {
  config: WaggleConfig;
  onConfigUpdate: (config: Partial<WaggleConfig>) => void;
  onTestApiKey?: (provider: string, key: string) => Promise<{ valid: boolean; error?: string }>;
}

interface ProviderStatus {
  testing: boolean;
  valid?: boolean;
  error?: string;
}

export function ApiKeySection({ config, onConfigUpdate, onTestApiKey }: ApiKeySectionProps) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>({});

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
    }
  };

  return (
    <div className="api-key-section space-y-6">
      <h2 className="text-lg font-semibold">API Keys</h2>
      <p className="text-sm text-muted-foreground">
        Configure API keys for your LLM providers. Keys are stored locally and never sent to Waggle servers.
      </p>

      {SUPPORTED_PROVIDERS.map((provider) => {
        const key = config.providers[provider.id]?.apiKey ?? '';
        const isRevealed = revealed[provider.id] ?? false;
        const status = statuses[provider.id];

        return (
          <div key={provider.id} className="api-key-section__provider rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">{provider.name}</label>
              {status && !status.testing && (
                <span className={`text-sm ${status.valid ? 'text-green-400' : 'text-red-400'}`}>
                  {status.valid ? '\u2713 Connected' : `\u2717 ${status.error ?? 'Failed'}`}
                </span>
              )}
              {status?.testing && (
                <span className="text-sm text-yellow-400">Testing...</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type={isRevealed ? 'text' : 'password'}
                value={key}
                onChange={(e) => handleKeyChange(provider.id, e.target.value)}
                placeholder={`Enter ${provider.name} API key`}
                className="flex-1 rounded bg-card px-3 py-2 text-sm text-foreground border border-border focus:border-primary focus:outline-none"
              />
              <button
                onClick={() => toggleReveal(provider.id)}
                className="rounded bg-secondary px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                {isRevealed ? 'Hide' : 'Show'}
              </button>
              <button
                onClick={() => handleTest(provider.id)}
                disabled={!key || status?.testing}
                className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Test
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
