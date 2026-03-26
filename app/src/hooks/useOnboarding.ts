/**
 * useOnboarding — state management for the first-run onboarding wizard.
 * Tracks progress in localStorage and server config.
 */

import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'waggle:onboarding';

export interface OnboardingState {
  completed: boolean;
  step: number;
  workspaceId?: string;
  apiKeySet?: boolean;
  templateId?: string;
  personaId?: string;
}

const DEFAULT_STATE: OnboardingState = {
  completed: false,
  step: 0,
};

function loadState(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return DEFAULT_STATE;
}

function saveState(state: OnboardingState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(loadState);
  const [showWizard, setShowWizard] = useState(false);

  // Show wizard if not completed
  useEffect(() => {
    const s = loadState();
    if (!s.completed) {
      setShowWizard(true);
    }
  }, []);

  const updateState = useCallback((updates: Partial<OnboardingState>) => {
    setState(prev => {
      const next = { ...prev, ...updates };
      saveState(next);
      return next;
    });
  }, []);

  const nextStep = useCallback(() => {
    setState(prev => {
      const next = { ...prev, step: prev.step + 1 };
      saveState(next);
      return next;
    });
  }, []);

  const complete = useCallback((serverBaseUrl: string) => {
    const next = { ...state, completed: true };
    saveState(next);
    setState(next);
    setShowWizard(false);
    // Persist to server (non-blocking)
    fetch(`${serverBaseUrl}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboardingCompleted: true }),
    }).catch(() => {});
  }, [state]);

  const restart = useCallback(() => {
    const fresh = { ...DEFAULT_STATE };
    saveState(fresh);
    setState(fresh);
    setShowWizard(true);
  }, []);

  const dismiss = useCallback(() => {
    setShowWizard(false);
    const next = { ...state, completed: true };
    saveState(next);
    setState(next);
  }, [state]);

  return {
    state,
    showWizard,
    updateState,
    nextStep,
    complete,
    restart,
    dismiss,
  };
}
