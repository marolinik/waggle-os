import { useCallback } from 'react';
import { useOnboarding } from './useOnboarding';
import { dockTierToPlanTier, isFeatureEnabled, getGate, type PlanTier, type FeatureGate } from '@/lib/feature-gates';

export function useFeatureGate() {
  const { state } = useOnboarding();
  const planTier: PlanTier = dockTierToPlanTier(state.tier || 'simple');

  const isEnabled = useCallback((feature: string): boolean => {
    return isFeatureEnabled(feature, planTier);
  }, [planTier]);

  const gate = useCallback((feature: string): FeatureGate | undefined => {
    if (isFeatureEnabled(feature, planTier)) return undefined;
    return getGate(feature);
  }, [planTier]);

  return { planTier, isEnabled, gate };
}
