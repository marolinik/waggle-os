/**
 * TierContext — single source of truth for the user's subscription tier.
 *
 * Fetches from GET /api/tier on mount and on window focus.
 * Never reads from localStorage — always from the server.
 * Defaults to SOLO while loading (safest assumption).
 */

import { createContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { type Tier, type TierCapabilities, getCapabilities } from '@waggle/shared';

export interface TierContextValue {
  tier: Tier;
  capabilities: TierCapabilities;
  workspaceCount: number;
  isLoading: boolean;
  /** Force re-fetch from API (e.g. after Stripe success redirect) */
  refresh: () => Promise<void>;
}

const DEFAULT_VALUE: TierContextValue = {
  tier: 'SOLO',
  capabilities: getCapabilities('SOLO'),
  workspaceCount: 0,
  isLoading: true,
  refresh: async () => {},
};

export const TierContext = createContext<TierContextValue>(DEFAULT_VALUE);

interface TierProviderProps {
  serverBaseUrl: string;
  children: ReactNode;
}

export function TierProvider({ serverBaseUrl, children }: TierProviderProps) {
  const [tier, setTier] = useState<Tier>('SOLO');
  const [workspaceCount, setWorkspaceCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTier = useCallback(async () => {
    try {
      const res = await fetch(`${serverBaseUrl}/api/tier`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.tier) setTier(data.tier);
      if (data.usage?.workspaceCount != null) setWorkspaceCount(data.usage.workspaceCount);
    } catch {
      // Server unreachable — keep current tier (SOLO default is safe)
    } finally {
      setIsLoading(false);
    }
  }, [serverBaseUrl]);

  // Fetch on mount
  useEffect(() => {
    fetchTier();
  }, [fetchTier]);

  // Re-fetch on window focus (user may have upgraded in browser)
  useEffect(() => {
    const handleFocus = () => { fetchTier(); };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchTier]);

  // Listen for Tauri deep link: waggle://payment-success
  useEffect(() => {
    const handleDeepLink = (e: Event) => {
      const url = (e as CustomEvent).detail?.url ?? '';
      if (typeof url === 'string' && url.includes('payment-success')) {
        fetchTier();
      }
    };
    window.addEventListener('waggle-deep-link', handleDeepLink);
    return () => window.removeEventListener('waggle-deep-link', handleDeepLink);
  }, [fetchTier]);

  const value: TierContextValue = {
    tier,
    capabilities: getCapabilities(tier),
    workspaceCount,
    isLoading,
    refresh: fetchTier,
  };

  return (
    <TierContext.Provider value={value}>
      {children}
    </TierContext.Provider>
  );
}
