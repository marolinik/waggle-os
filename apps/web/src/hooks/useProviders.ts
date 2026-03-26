import { useState, useEffect, useCallback } from 'react';
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
  models: ProviderModel[];
}

export interface SearchProvider {
  id: string;
  name: string;
  hasKey: boolean;
  priority: number;
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

  const refresh = useCallback(async () => {
    try {
      const data = await adapter.getProviders();
      setProviders(data.providers);
      setSearch(data.search);
      setActiveSearch(data.activeSearch);
    } catch {
      // Fallback: empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  /** All models across all providers, flat list */
  const allModels = providers.flatMap(p =>
    p.models.map(m => ({
      ...m,
      providerId: p.id,
      providerName: p.name,
      hasKey: p.hasKey,
    }))
  );

  /** Providers that have a key configured */
  const activeProviders = providers.filter(p => p.hasKey);

  /** Models from providers with keys (available for use) */
  const availableModels = allModels.filter(m => m.hasKey);

  return {
    providers,
    search,
    activeSearch,
    allModels,
    activeProviders,
    availableModels,
    loading,
    refresh,
  };
};
