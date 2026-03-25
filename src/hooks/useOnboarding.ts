import { useState, useCallback } from 'react';

export const useOnboarding = () => {
  const [completed, setCompleted] = useState(() => {
    return localStorage.getItem('waggle_onboarding_complete') === 'true';
  });

  const completeOnboarding = useCallback(() => {
    localStorage.setItem('waggle_onboarding_complete', 'true');
    setCompleted(true);
  }, []);

  const resetOnboarding = useCallback(() => {
    localStorage.removeItem('waggle_onboarding_complete');
    setCompleted(false);
  }, []);

  return { completed, completeOnboarding, resetOnboarding };
};
