import { useCallback, useEffect, useRef, useState } from 'react';
import { adapter } from '@/lib/adapter';
import { isRoutableCloudProvider, useProviders, type Provider } from './useProviders';

/**
 * Shared model-readiness signal for the onboarding hard gate and Models banner.
 * Cloud keys are live-probed; a detected local model is independently sufficient.
 */
export interface WorkingModelState {
  hasWorkingModel: boolean;
  cloudReady: boolean;
  localReady: boolean;
  loading: boolean;
  availability: 'checking' | 'ready' | 'unconfigured' | 'unavailable' | 'unknown';
  selectedModelId: string | null;
  refresh: (receipt?: ModelReadinessReceipt) => void;
}

export interface ModelReadinessReceipt {
  modelId?: string;
  verified: boolean;
}

export function useHasWorkingModel(): WorkingModelState {
  const {
    providers,
    activeProviders,
    loading: providersLoading,
    error: providersError,
    refresh: refreshProviders,
  } = useProviders();
  const [localModelCount, setLocalModelCount] = useState(0);
  const [localLoading, setLocalLoading] = useState(true);
  const [localFailed, setLocalFailed] = useState(false);
  const [cloud, setCloud] = useState<{
    ready: boolean;
    loading: boolean;
    checked: boolean;
    selectedModelId: string | null;
    probeFailed: boolean;
  }>({ ready: false, loading: true, checked: false, selectedModelId: null, probeFailed: false });
  const mounted = useRef(true);
  const localGeneration = useRef(0);
  const cloudGeneration = useRef(0);
  const explicitCloudRefresh = useRef<number | null>(null);
  const explicitProviders = useRef<unknown>(null);
  const activeProviderRows = useRef<Provider[]>([]);
  activeProviderRows.current = activeProviders;

  const refreshLocal = useCallback(async () => {
    const generation = ++localGeneration.current;
    if (mounted.current) {
      setLocalModelCount(0);
      setLocalLoading(true);
    }
    try {
      const status = await adapter.getLocalInferenceStatus();
      if (mounted.current && generation === localGeneration.current) {
        setLocalModelCount(status?.totalLocalModels ?? 0);
        setLocalFailed(false);
      }
    } catch {
      if (mounted.current && generation === localGeneration.current) {
        setLocalModelCount(0);
        setLocalFailed(true);
      }
    } finally {
      if (mounted.current && generation === localGeneration.current) setLocalLoading(false);
    }
  }, []);

  const probeCloud = useCallback(async (providerRows: Provider[], generation: number) => {
    const setCloudForGeneration = (next: {
      ready: boolean;
      loading: boolean;
      checked: boolean;
      selectedModelId: string | null;
      probeFailed: boolean;
    }) => {
      if (mounted.current && generation === cloudGeneration.current) setCloud(next);
    };
    if (!mounted.current || generation !== cloudGeneration.current) return;
    setCloud(current => ({ ...current, ready: false, loading: true }));

    let defaultProbe: Awaited<ReturnType<typeof adapter.probeModel>> | null = null;
    let defaultProbeFailed = false;
    try {
      defaultProbe = await adapter.probeModel();
    } catch {
      // An unavailable default-model probe falls back to the keyed providers.
      defaultProbeFailed = true;
    }
    if (!mounted.current || generation !== cloudGeneration.current) return;

    if (defaultProbe?.configured) {
      if (defaultProbe.verified) {
        setCloudForGeneration({
          ready: true,
          loading: false,
          checked: true,
          selectedModelId: defaultProbe.model,
          probeFailed: false,
        });
        return;
      }
      if (defaultProbe.rejected) {
        setCloudForGeneration({
          ready: false,
          loading: false,
          checked: true,
          selectedModelId: defaultProbe.model,
          probeFailed: false,
        });
        return;
      }
      // A custom endpoint is user-supplied and may point at a transient or
      // stale service. Unlike a previously accepted keyed cloud provider, it
      // must answer the exact-model probe before onboarding can continue.
      if (defaultProbe.model?.startsWith('openai-compatible/')) {
        setCloudForGeneration({
          ready: false,
          loading: false,
          checked: true,
          selectedModelId: defaultProbe.model,
          probeFailed: false,
        });
        return;
      }
      setCloudForGeneration({
        ready: true,
        loading: false,
        checked: true,
        selectedModelId: defaultProbe.model,
        probeFailed: false,
      });
      return;
    }

    if (providerRows.length === 0) {
      setCloudForGeneration({
        ready: false,
        loading: false,
        checked: true,
        selectedModelId: defaultProbe?.model ?? null,
        probeFailed: defaultProbeFailed,
      });
      return;
    }

    const compatibleProvider = providerRows.find((provider) => (
      provider.id === 'openai-compatible' && Boolean(provider.models[0]?.id)
    ));
    const compatibleModel = compatibleProvider?.models[0]?.id;
    const providerProbeCandidates = providerRows.filter((provider) => (
      provider.id !== 'openai-compatible' || !compatibleModel
    ));
    const [compatibleOutcome, outcomes] = await Promise.all([
      compatibleModel
        ? adapter.probeModel(compatibleModel).catch(() => null)
        : Promise.resolve(null),
      Promise.allSettled(providerProbeCandidates.map((provider) => adapter.probeProvider(provider.id))),
    ]);
    if (!mounted.current || generation !== cloudGeneration.current) return;
    const probes = outcomes.flatMap((outcome) => outcome.status === 'fulfilled' ? [outcome.value] : []);
    const compatibleVerified = Boolean(compatibleOutcome?.configured && compatibleOutcome.verified);
    const compatibleBlocked = Boolean(compatibleModel) && !compatibleVerified;
    const verified = compatibleVerified
      || probes.some((probe) => probe.configured && probe.valid !== false && probe.verified);
    const rejected = compatibleBlocked
      || probes.some((probe) => probe.configured && probe.valid === false);
    const transient = outcomes.some((outcome) => outcome.status === 'rejected')
      || probes.some((probe) => probe.configured && probe.valid !== false);
    setCloudForGeneration({
      ready: verified || (!rejected && transient),
      loading: false,
      checked: true,
      selectedModelId: compatibleOutcome?.model ?? defaultProbe?.model ?? null,
      probeFailed: false,
    });
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
    void probeCloud(activeProviderRows.current, generation);
  }, [probeCloud, providers, providersLoading]);

  useEffect(() => {
    void refreshLocal();
  }, [refreshLocal]);

  const refresh = useCallback((receipt?: ModelReadinessReceipt) => {
    const generation = ++cloudGeneration.current;
    if (receipt?.verified && receipt.modelId) {
      explicitCloudRefresh.current = null;
      explicitProviders.current = null;
      if (mounted.current) {
        setCloud({
          ready: true,
          loading: false,
          checked: true,
          selectedModelId: receipt.modelId,
          probeFailed: false,
        });
      }
      return;
    }
    explicitCloudRefresh.current = generation;
    if (mounted.current) {
      setCloud(current => ({ ...current, ready: false, loading: true }));
    }
    void refreshLocal();
    void (async () => {
      const data = await refreshProviders();
      if (!mounted.current || generation !== cloudGeneration.current) return;
      const rows = data
        ? data.providers.filter(isRoutableCloudProvider)
        : activeProviderRows.current;
      explicitProviders.current = data?.providers ?? null;
      await probeCloud(rows, generation);
      if (mounted.current && generation === cloudGeneration.current && !data) explicitCloudRefresh.current = null;
    })();
  }, [probeCloud, refreshLocal, refreshProviders]);

  const cloudReady = cloud.ready;
  const localReady = localModelCount > 0;
  const hasWorkingModel = cloudReady || localReady;
  const loading = providersLoading || cloud.loading || localLoading;
  const hasConfiguredProvider = providers.some((provider) => (
    (provider.requiresKey && provider.hasKey)
    || (provider.id === 'openai-compatible' && Boolean(provider.baseUrl?.trim()))
  ));
  const availability: WorkingModelState['availability'] = hasWorkingModel
    ? 'ready'
    : loading && !cloud.checked
      ? 'checking'
      : cloud.selectedModelId || hasConfiguredProvider
        ? 'unavailable'
        : providersError || localFailed || cloud.probeFailed
          ? 'unknown'
          : loading
            ? 'checking'
            : 'unconfigured';

  return {
    hasWorkingModel,
    cloudReady,
    localReady,
    loading,
    availability,
    selectedModelId: cloud.selectedModelId,
    refresh,
  };
}
