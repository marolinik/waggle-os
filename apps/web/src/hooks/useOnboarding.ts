import { useState, useCallback } from 'react';
import type { UserTier } from '@/lib/dock-tiers';

export interface OnboardingState {
  completed: boolean;
  step: number;
  tier?: UserTier;
  workspaceId?: string;
  apiKeySet?: boolean;
  templateId?: string;
  personaId?: string;
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
}

export const useOnboarding = () => {
  const [state, setState] = useState<OnboardingState>(loadState);

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
