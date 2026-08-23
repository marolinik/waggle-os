import { useCallback, useEffect, useRef, useState } from 'react';
import { adapter } from '@/lib/adapter';
import { useProviders } from './useProviders';

/**
 * Shared model-readiness signal for the onboarding hard gate and Models banner.
 * Cloud keys are live-probed; a detected local model is independently sufficient.
 */
export interface WorkingModelState {
  hasWorkingModel: boolean;
  cloudReady: boolean;
  localReady: boolean;
  loading: boolean;
  refresh: () => void;
}

export function useHasWorkingModel(): WorkingModelState {
  const { providers, activeProviders, loading: providersLoading, refresh: refreshProviders } = useProviders();
  const [localModelCount, setLocalModelCount] = useState(0);
  const [localLoading, setLocalLoading] = useState(true);
  const [cloud, setCloud] = useState({ ready: false, loading: true });
  const mounted = useRef(true);
  const localGeneration = useRef(0);
  const cloudGeneration = useRef(0);
  const explicitCloudRefresh = useRef<number | null>(null);
  const explicitProviders = useRef<unknown>(null);
  const activeProviderIds = useRef<string[]>([]);
  activeProviderIds.current = activeProviders.map((provider) => provider.id);

  const refreshLocal = useCallback(async () => {
    const generation = ++localGeneration.current;
    if (mounted.current) {
      setLocalModelCount(0);
      setLocalLoading(true);
    }
    try {
      const status = await adapter.getLocalInferenceStatus();
      if (mounted.current && generation === localGeneration.current) setLocalModelCount(status?.totalLocalModels ?? 0);
    } catch {
      if (mounted.current && generation === localGeneration.current) setLocalModelCount(0);
    } finally {
      if (mounted.current && generation === localGeneration.current) setLocalLoading(false);
    }
  }, []);

  const probeCloud = useCallback(async (providerIds: string[], generation: number) => {
    const setCloudForGeneration = (next: { ready: boolean; loading: boolean }) => {
      if (mounted.current && generation === cloudGeneration.current) setCloud(next);
    };
    if (!mounted.current || generation !== cloudGeneration.current) return;
    setCloudForGeneration({ ready: false, loading: true });

    if (providerIds.length === 0) {
      setCloudForGeneration({ ready: false, loading: false });
      return;
    }

    let defaultProbe: Awaited<ReturnType<typeof adapter.probeModel>> | null = null;
    try {
      defaultProbe = await adapter.probeModel();
    } catch {
      // An unavailable default-model probe falls back to the keyed providers.
    }
    if (!mounted.current || generation !== cloudGeneration.current) return;

    if (defaultProbe?.configured) {
      if (defaultProbe.verified) {
        setCloudForGeneration({ ready: true, loading: false });
        return;
      }
      if (defaultProbe.rejected) {
        setCloudForGeneration({ ready: false, loading: false });
        return;
      }
      setCloudForGeneration({ ready: true, loading: false });
      return;
    }

    const outcomes = await Promise.allSettled(providerIds.map((id) => adapter.probeProvider(id)));
    if (!mounted.current || generation !== cloudGeneration.current) return;
    const probes = outcomes.flatMap((outcome) => outcome.status === 'fulfilled' ? [outcome.value] : []);
    const verified = probes.some((probe) => probe.configured && probe.valid !== false && probe.verified);
    const rejected = probes.some((probe) => probe.configured && probe.valid === false);
    const transient = outcomes.some((outcome) => outcome.status === 'rejected')
      || probes.some((probe) => probe.configured && probe.valid !== false);
    setCloudForGeneration({ ready: verified || (!rejected && transient), loading: false });
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cloudGeneration.current += 1;
      localGeneration.current += 1;
    };
  }, []);

  useEffect(() => {
    if (providersLoading) return;
    if (explicitCloudRefresh.current === cloudGeneration.current) {
      if (explicitProviders.current === providers) {
        explicitCloudRefresh.current = null;
        explicitProviders.current = null;
        return;
      }
      explicitCloudRefresh.current = null;
      explicitProviders.current = null;
    }
    const generation = ++cloudGeneration.current;
    void probeCloud(activeProviderIds.current, generation);
  }, [probeCloud, providers, providersLoading]);

  useEffect(() => {
    void refreshLocal();
  }, [refreshLocal]);

  const refresh = useCallback(() => {
    const generation = ++cloudGeneration.current;
    explicitCloudRefresh.current = generation;
    if (mounted.current) setCloud({ ready: false, loading: true });
    void refreshLocal();
    void (async () => {
      const data = await refreshProviders();
      if (!mounted.current || generation !== cloudGeneration.current) return;
      const ids = data
        ? data.providers.filter((provider) => provider.hasKey && provider.requiresKey).map((provider) => provider.id)
        : activeProviderIds.current;
      explicitProviders.current = data?.providers ?? null;
      await probeCloud(ids, generation);
      if (mounted.current && generation === cloudGeneration.current && !data) explicitCloudRefresh.current = null;
    })();
  }, [probeCloud, refreshLocal, refreshProviders]);

  const cloudReady = cloud.ready;
  const localReady = localModelCount > 0;

  return {
    hasWorkingModel: cloudReady || localReady,
    cloudReady,
    localReady,
    loading: providersLoading || cloud.loading || localLoading,
    refresh,
  };
}
