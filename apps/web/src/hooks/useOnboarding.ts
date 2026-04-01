import { useState, useCallback, useEffect } from 'react';
import type { UserTier } from '@/lib/dock-tiers';

export interface OnboardingState {
  completed: boolean;
  step: number;
  tier?: UserTier;
  workspaceId?: string;
  apiKeySet?: boolean;
  templateId?: string;
  personaId?: string;
  tooltipsDismissed?: boolean;
}

const STORAGE_KEY = 'waggle:onboarding';

const defaultState: OnboardingState = {
  completed: false,
  step: 0,
};

function loadState(): OnboardingState {
  try {
    // Migrate from old key
    if (localStorage.getItem('waggle_onboarding_complete') === 'true') {
      localStorage.removeItem('waggle_onboarding_complete');
      const done: OnboardingState = { ...defaultState, completed: true, step: 7 };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(done));
      return done;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const state = { ...defaultState, ...parsed };
      // Existing completed users without a tier default to 'simple'
      if (parsed.completed && !parsed.tier) {
        state.tier = 'simple';
      }
      return state;
    }
  } catch { /* ignore */ }
  return defaultState;
}

function saveState(state: OnboardingState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  // Notify other hook instances in the same tab via custom event
  window.dispatchEvent(new CustomEvent('waggle:onboarding-sync'));
}

export const useOnboarding = () => {
  const [state, setState] = useState<OnboardingState>(loadState);

  // Re-sync when another hook instance writes to localStorage
  useEffect(() => {
    const handler = () => setState(loadState());
    window.addEventListener('waggle:onboarding-sync', handler);
    return () => window.removeEventListener('waggle:onboarding-sync', handler);
  }, []);

  const update = useCallback((updates: Partial<OnboardingState>) => {
    setState(prev => {
      const next = { ...prev, ...updates };
      saveState(next);
      return next;
    });
  }, []);

  const complete = useCallback(() => {
    update({ completed: true, step: 7 });
  }, [update]);

  const reset = useCallback(() => {
    const fresh = { ...defaultState };
    saveState(fresh);
    setState(fresh);
  }, []);

  return { state, update, complete, reset };
};
