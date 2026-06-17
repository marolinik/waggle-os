import { useCallback, useEffect, useState } from 'react';
import { adapter } from '@/lib/adapter';
import { useProviders } from './useProviders';

/**
 * useHasWorkingModel — the shared "≥1 working model" signal for the PR5 model
 * gate (Onboarding step 3's HARD gate AND the Settings→Models banner). A model
 * is "working" if either a cloud provider has a key configured OR a local model
 * is detected. This is a UX affordance, not a security boundary — the real
 * LLM-availability enforcement happens server-side at chat time — so it derives
 * from already-fetched data (no live key-probe required to compute readiness).
 *
 * Composing useProviders keeps a single source of truth (the same /api/providers
 * hasKey data the Settings Models tab reads), so the gate and the banner can
 * never disagree about what counts as ready.
 */
export interface WorkingModelState {
  /** cloudReady || localReady — the hard-gate predicate. */
  hasWorkingModel: boolean;
  /** ≥1 cloud provider has a key in the vault. */
  cloudReady: boolean;
  /** ≥1 local model detected (Ollama/vLLM). */
  localReady: boolean;
  loading: boolean;
  refresh: () => void;
}

export function useHasWorkingModel(): WorkingModelState {
  const { activeProviders, loading: providersLoading, refresh: refreshProviders } = useProviders();
  const [localModelCount, setLocalModelCount] = useState(0);
  const [localLoading, setLocalLoading] = useState(true);

  const refreshLocal = useCallback(async () => {
    setLocalLoading(true);
    try {
      const status = await adapter.getLocalInferenceStatus();
      setLocalModelCount(status?.totalLocalModels ?? 0);
    } catch {
      // Local-inference probe failed (Ollama not installed / unreachable) —
      // treat as "no local model"; a cloud key can still make the gate pass.
      setLocalModelCount(0);
    } finally {
      setLocalLoading(false);
    }
  }, []);

  useEffect(() => { void refreshLocal(); }, [refreshLocal]);

  const cloudReady = activeProviders.length > 0;
  const localReady = localModelCount > 0;

  return {
    hasWorkingModel: cloudReady || localReady,
    cloudReady,
    localReady,
    loading: providersLoading || localLoading,
    refresh: () => { refreshProviders(); void refreshLocal(); },
  };
}
