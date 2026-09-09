import { useState, useEffect, useCallback, useRef } from 'react';
import { adapter } from '@/lib/adapter';

export interface ProviderModel {
  id: string;
  name: string;
  cost: string;
  speed: string;
}

export interface Provider {
  id: string;
  name: string;
  hasKey: boolean;
  badge: string | null;
  keyUrl: string | null;
  requiresKey: boolean;
  baseUrl?: string;
  models: ProviderModel[];
  modelsSource?: 'provider-api' | 'stale-provider-api' | 'unavailable' | 'requires-key' | 'requires-endpoint' | 'local-runtime';
  modelsUpdatedAt?: string;
  modelsError?: string;
}

export interface SearchProvider {
  id: string;
  name: string;
  hasKey: boolean;
  priority: number;
}

function hasUsableCompatibleEndpoint(provider: Provider): boolean {
  return provider.id === 'openai-compatible'
    && Boolean(provider.baseUrl?.trim())
    && provider.models.length > 0
    && provider.modelsSource === 'provider-api';
}

/** Providers whose remote/default model should participate in live readiness probes. */
export function isRoutableCloudProvider(provider: Provider): boolean {
  return (provider.requiresKey && provider.hasKey) || hasUsableCompatibleEndpoint(provider);
}

function hasAvailableModels(provider: Provider): boolean {
  if (provider.id === 'ollama') return provider.hasKey;
  return isRoutableCloudProvider(provider);
}

/**
 * Hook to fetch providers, models, and key status from /api/providers.
 * Single source of truth — use this everywhere a model needs to be selected.
 */
export const useProviders = () => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [search, setSearch] = useState<SearchProvider[]>([]);
  const [activeSearch, setActiveSearch] = useState('duckduckgo');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    try {
      const data = await adapter.getProviders();
      if (generation !== refreshGeneration.current) return null;
      setProviders(data.providers);
      setSearch(data.search);
      setActiveSearch(data.activeSearch);
      setError(null);
      return data;
    } catch (err) {
      if (generation !== refreshGeneration.current) return null;
      console.error('[useProviders] fetch failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load');
      return null;
    } finally {
      if (generation === refreshGeneration.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const refreshOnFocus = () => { void refresh(); };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshOnFocus);
    return () => {
      refreshGeneration.current += 1;
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, [refresh]);

  /** All models across all providers, flat list */
  const allModels = providers.flatMap(p =>
    p.models.map(m => ({
      ...m,
      providerId: p.id,
      providerName: p.name,
      hasKey: p.hasKey,
    }))
  );

  /** Remote providers that are configured. Keyless local runtimes are handled separately. */
  const activeProviders = providers.filter(isRoutableCloudProvider);

  /** Models from routable cloud/custom providers and reachable local runtimes. */
  const availableProviderIds = new Set(providers.filter(hasAvailableModels).map(provider => provider.id));
  const availableModels = allModels.filter(model => availableProviderIds.has(model.providerId));

  return {
    providers,
    search,
    activeSearch,
    allModels,
    activeProviders,
    availableModels,
    loading,
    error,
    refresh,
  };
};
