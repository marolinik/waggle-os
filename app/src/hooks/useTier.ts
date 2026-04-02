/**
 * useTier — hook for reading tier state from TierContext.
 * useHasCapability — programmatic tier capability check.
 *
 * Always reads from server-backed context, never localStorage.
 */

import { useContext } from 'react';
import { type TierCapabilities, hasCapability } from '@waggle/shared';
import { TierContext, type TierContextValue } from '@/context/TierContext';

/** Read the full tier context. Throws if used outside TierProvider. */
export function useTier(): TierContextValue {
  const ctx = useContext(TierContext);
  if (!ctx) {
    throw new Error('useTier must be used within a <TierProvider>');
  }
  return ctx;
}

/**
 * Check whether the current tier has a specific capability.
 * For use in components that need programmatic (not overlay) tier checking.
 *
 * @example
 *   const canSpawn = useHasCapability('spawnAgents');
 *   const hasEnoughWorkspaces = useHasCapability('workspaceLimit', 10);
 */
export function useHasCapability<K extends keyof TierCapabilities>(
  capability: K,
  minimumValue?: TierCapabilities[K],
): boolean {
  const { tier } = useTier();
  return hasCapability(tier, capability, minimumValue);
}
