/**
 * ModelGate — the shared "get a working model" spine for PR5.
 *
 * Mounted in TWO places with identical mechanics:
 *   1. Onboarding step 3 — the HARD gate (parent disables "Continue" until a model exists).
 *   2. Settings → Models — the lead, above the failover-chain (`ModelPilotCard`).
 *
 * Two ways to a working model:
 *   • Cloud: pick a provider → paste a key → live-validate (D3) → write to the Vault.
 *   • Local: detect / pull an Ollama model.
 *
 * Readiness is "≥1 cloud provider keyed OR ≥1 local model" — the same predicate as the
 * shared `useHasWorkingModel` hook (which parents read for their banner / gate). ModelGate
 * computes it inline from the provider/local data it already holds, and calls `onModelReady`
 * after any change so the parent re-reads the shared signal. The real LLM-availability
 * enforcement is server-side at chat time; this is a UX affordance, not a security boundary.
 *
 * Honesty contract: "verified" appears ONLY when the live probe confirmed the key. A
 * format-only pass says "looks valid" — never a confident "verified" on an unchecked key.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, AlertTriangle, Loader2, KeyRound, Cpu, ExternalLink, RefreshCw } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { useProviders, type Provider, type ProviderModel } from '@/hooks/useProviders';
import { Input } from '@/components/ui/input';
import BeeLoader from '@/components/ui/BeeLoader';
import BrandTile from '@/components/os/apps/connectors/BrandTile';
import { getBrandIdentity } from '@/components/os/apps/connectors/brand-identity';

interface ModelGateProps {
  /** Fires after a model becomes available (key saved or local pull ok), so a parent
   *  (onboarding gate / Settings banner) can re-read `useHasWorkingModel`. */
  onModelReady?: (modelId?: string) => void;
  /** Styling only — 'onboarding' is full-bleed; 'settings' is an embedded card. */
  variant?: 'onboarding' | 'settings';
  /** Let a parent-owned ready state replace this component's duplicate banner. */
  suppressReadinessBanner?: boolean;
}

interface LocalStatus {
  servers: Array<Record<string, unknown>>;
  ollamaInstalled: boolean;
  ollamaRunning?: boolean;
  totalLocalModels: number;
  dockerRequired?: false;
  managedRuntime?: {
    supported: boolean;
    installed: boolean;
    running: boolean;
    targetVersion: string | null;
    version: string | null;
    artifactSizeBytes: number | null;
    downloadRequired: boolean;
    dockerRequired: false;
    reason?: string;
  };
}

interface LocalModelRecommendation {
  name: string;
  fitLevel?: string;
  estimatedTps?: number;
  runMode?: string;
}

function formatDownloadSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
}

type ValidateState =
  | { status: 'idle' }
  | { status: 'testing' }
  | {
      status: 'saved';
      verified: boolean;
      defaultModel?: string;
      defaultModelSaveFailed?: boolean;
      routerWarning?: string;
    }
  | { status: 'error'; message: string };

export function ModelGate({
  onModelReady,
  variant = 'settings',
  suppressReadinessBanner = false,
}: ModelGateProps) {
  const {
    providers,
    activeProviders,
    loading: providersLoading,
    error: providersError,
    refresh: refreshProviders,
  } = useProviders();
  const [tab, setTab] = useState<'cloud' | 'local'>('cloud');
  const [retryingProviders, setRetryingProviders] = useState(false);
  const [retryingRouter, setRetryingRouter] = useState(false);

  // Cloud key entry
  const [selected, setSelected] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState('');
  const [validate, setValidate] = useState<ValidateState>({ status: 'idle' });
  const [endpointValue, setEndpointValue] = useState('');
  const [compatibleModels, setCompatibleModels] = useState<ProviderModel[]>([]);
  const [compatibleModel, setCompatibleModel] = useState('');
  const [compatibleStatus, setCompatibleStatus] = useState<
    'idle' | 'discovering' | 'discovered' | 'verifying' | 'saving' | 'saved' | 'error'
  >('idle');
  const [compatibleError, setCompatibleError] = useState<string | null>(null);
  const compatibleRequestGeneration = useRef(0);
  const readinessProbeGeneration = useRef(0);
  const [readinessProbeRevision, setReadinessProbeRevision] = useState(0);
  const explicitCompatibleOperationRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      compatibleRequestGeneration.current += 1;
      readinessProbeGeneration.current += 1;
      explicitCompatibleOperationRef.current = null;
    };
  }, []);

  const selectProvider = (id: string, focusField = true) => {
    if (compatibleStatus === 'saving') return;
    if (explicitCompatibleOperationRef.current !== null) cancelCompatibleVerification();
    compatibleRequestGeneration.current += 1;
    const provider = providers.find((candidate) => candidate.id === id);
    const isCompatible = id === 'openai-compatible';
    setSelected(id);
    setKeyValue('');
    setValidate({ status: 'idle' });
    setCompatibleStatus('idle');
    setCompatibleError(null);
    if (isCompatible) {
      const models = provider?.models ?? [];
      setEndpointValue(provider?.baseUrl ?? '');
      setCompatibleModels(models);
      setCompatibleModel(models[0]?.id ?? '');
    } else {
      setEndpointValue('');
      setCompatibleModels([]);
      setCompatibleModel('');
    }
    if (focusField) {
      window.setTimeout(() => {
        const el = document.getElementById(isCompatible ? 'model-gate-endpoint' : 'model-gate-key');
        if (el instanceof HTMLInputElement) {
          el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
          el.focus();
        }
      }, 60);
    }
  };

  const cancelCompatibleVerification = () => {
    if (compatibleStatus === 'saving') return;
    const hadExplicitOwner = explicitCompatibleOperationRef.current !== null;
    explicitCompatibleOperationRef.current = null;
    compatibleRequestGeneration.current += 1;
    if (hadExplicitOwner) setReadinessProbeRevision((current) => current + 1);
  };

  // F3: live probe of the STORED cloud key(s) so the banner stops claiming
  // readiness from mere key PRESENCE. 'unverified' = network-degrade / no cheap
  // probe / timeout (honest neutral, not the scary "failed").
  const [probe, setProbe] = useState<{
    status: 'idle' | 'probing' | 'verified' | 'failed' | 'unverified';
    failedProvider?: string;
    // The provider-fallback probe verifies a PROVIDER KEY, not the model the
    // chat will use — the banner names which provider confirmed so the copy
    // stays honest.
    verifiedProvider?: string;
    // MODEL-GATE: when we probe the workspace's actual default model, the banner
    // can name the model itself rather than just the provider.
    verifiedModel?: string;
    // Wave V (Lane B): start in 'probing' so the resolution phase owns the banner
    // from the first frame. 'idle' is now STRICTLY the terminal "no cloud provider
    // to probe" state (rely on localReady) — never the pre-probe initial — so no
    // premature key-presence verdict paints before the mount probe settles.
  }>({ status: 'probing' });

  // Local models
  const [local, setLocal] = useState<LocalStatus | null>(null);
  const [recommendedLocal, setRecommendedLocal] = useState<LocalModelRecommendation | null>(null);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [runtimeMsg, setRuntimeMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pullName, setPullName] = useState('');
  const [pulling, setPulling] = useState(false);
  const [pullMsg, setPullMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const refreshLocal = useCallback(async () => {
    try {
      setLocal(await adapter.getLocalInferenceStatus());
    } catch {
      setLocal({ servers: [], ollamaInstalled: false, totalLocalModels: 0 });
    }
    try {
      const result = await adapter.getLocalInferenceModels('general');
      const candidate = result.models.find((model) => (
        typeof model.name === 'string'
        && model.fitLevel !== 'too_tight'
        && model.runMode !== 'no_fit'
      ));
      const recommendation: LocalModelRecommendation | null = candidate && typeof candidate.name === 'string'
        ? {
            name: candidate.name,
            ...(typeof candidate.fitLevel === 'string' ? { fitLevel: candidate.fitLevel } : {}),
            ...(typeof candidate.estimatedTps === 'number' ? { estimatedTps: candidate.estimatedTps } : {}),
            ...(typeof candidate.runMode === 'string' ? { runMode: candidate.runMode } : {}),
          }
        : null;
      setRecommendedLocal(recommendation ?? null);
      if (recommendation?.name) setPullName((current) => current || recommendation.name);
    } catch {
      setRecommendedLocal(null);
    }
  }, []);
  useEffect(() => { void refreshLocal(); }, [refreshLocal]);

  // Same readiness predicate as useHasWorkingModel — computed inline from data we hold.
  const cloudReady = activeProviders.length > 0;
  const localReady = (local?.totalLocalModels ?? 0) > 0;
  const routerBlocked = validate.status === 'saved' && Boolean(validate.routerWarning);
  const ready = (cloudReady && !routerBlocked) || localReady;

  // MODEL-GATE: on mount, first live-probe the workspace's ACTUAL default model
  // (not just a provider key). Only when no default model is configured do we
  // fall back to the F3 per-provider stored-key probes. If only local models
  // exist and no default model, skip — totalLocalModels is already a live query.
  const activeProviderIds = activeProviders.map((p) => p.id).join(',');
  useEffect(() => {
    if (providersLoading || explicitCompatibleOperationRef.current !== null) return;
    let cancelled = false;
    const generation = ++readinessProbeGeneration.current;
    const isStale = () => (
      cancelled
      || generation !== readinessProbeGeneration.current
      || explicitCompatibleOperationRef.current !== null
    );
    const ids = activeProviders.map((p) => p.id);
    if (ids.length === 0) {
      setProbe({ status: 'idle' });
      return;
    }
    setProbe({ status: 'probing' });

    const run = (async (): Promise<void> => {
      // 1) Probe the actual default model.
      const modelRes = await adapter.probeModel().catch(() => null);
      if (isStale()) return;
      if (modelRes?.configured) {
        if (modelRes.verified) { setProbe({ status: 'verified', verifiedModel: modelRes.model ?? undefined }); return; }
        if (modelRes.rejected) {
          // Round-6 fix 3b: derive WHICH provider owns the rejected default
          // model (trivially available from the provider→models catalog) so
          // that provider's chip can carry the warning glyph. No match →
          // banner-only, never a guessed chip.
          const owner = modelRes.model
            ? activeProviders.find((p) => p.models.some((m) => m.id === modelRes.model))?.id
            : undefined;
          setProbe({ status: 'failed', failedProvider: owner });
          // Open the provider grid/key input so the user can fix the key now.
          if (explicitCompatibleOperationRef.current === null) {
            setTab('cloud');
            const open = owner ?? ids[0];
            if (open) selectProvider(open, false);
          }
          return;
        }
        setProbe({ status: 'unverified' });
        return;
      }

      // 2) No default model → F3 per-provider stored-key fallback.
      const outcome = await Promise.allSettled(ids.map((id) => adapter.probeProvider(id)));
      if (isStale()) return;
      // outcome[i] ↔ ids[i] ↔ activeProviders[i], so the display name lines up.
      let verifiedProvider: string | undefined;
      let failedProvider: string | undefined;
      outcome.forEach((r, i) => {
        if (r.status !== 'fulfilled') return;
        const v = r.value;
        if (v.configured && v.valid && v.verified) { if (!verifiedProvider) verifiedProvider = activeProviders[i]?.name; }
        else if (v.configured && !v.valid && !failedProvider) failedProvider = ids[i];
      });
      if (verifiedProvider) setProbe({ status: 'verified', verifiedProvider });
      else if (failedProvider) {
        setProbe({ status: 'failed', failedProvider });
        // Open the provider grid + key input on the offending provider.
        if (explicitCompatibleOperationRef.current === null) {
          setTab('cloud');
          selectProvider(failedProvider, false);
        }
      } else {
        setProbe({ status: 'unverified' });
      }
    })();

    // Client-side guard on top of the server's 5s AbortSignal so a hung sidecar
    // can't strand the banner on 'probing'.
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 6000));
    void Promise.race([run, timeout]).then((outcome) => {
      if (isStale()) return;
      if (outcome === 'timeout') setProbe({ status: 'unverified' });
    });
    return () => { cancelled = true; };
    // probe.status must NOT be a dep: setting 'probing' inside would re-run the
    // effect and its cleanup would cancel every outcome (banner stuck probing).
    // Re-probing on provider-list changes is correct; the server caches 60s.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providersLoading, activeProviderIds, readinessProbeRevision]);

  // Wave V (Lane B) — single-truth resolution phase. The banner must paint EXACTLY
  // ONE verdict. While ANY probe is in flight we're "resolving" (providersLoading
  // OR the mount probe still running); the neutral "Checking your models…" banner
  // is revealed only after a 300ms grace, so a fast happy path (probes settle
  // <300ms) skips it and the verdict paints once, immediately — no
  // "No working model" → "you're ready" → "provider error" flip within ~1s.
  const resolving = providersLoading || probe.status === 'probing';
  const [showChecking, setShowChecking] = useState(false);
  useEffect(() => {
    if (!resolving) { setShowChecking(false); return; }
    const t = window.setTimeout(() => setShowChecking(true), 300);
    return () => window.clearTimeout(t);
  }, [resolving]);

  const cloudProviders = useMemo(
    () => providers.filter((p) => p.id !== 'ollama' && (p.requiresKey || p.id === 'openai-compatible')),
    [providers],
  );
  const catalogNeedsRefresh = useMemo(
    () => providers.some((p) => (
      (p.hasKey || (p.id === 'openai-compatible' && Boolean(p.baseUrl?.trim())))
      && (p.modelsSource === 'stale-provider-api' || p.modelsSource === 'unavailable')
    )),
    [providers],
  );
  const selectedProvider = cloudProviders.find((p) => p.id === selected) ?? null;

  const handleSelect = (id: string) => {
    selectProvider(id);
  };

  // "Fix it now" (failed banner): jump straight to the offending provider's key
  // input and focus it, so the recovery action lives IN the banner, not in prose.
  const focusFailingKey = () => {
    if (explicitCompatibleOperationRef.current !== null) return;
    setTab('cloud');
    const failedProvider = probe.status === 'failed' ? probe.failedProvider : undefined;
    const recoveryProvider = failedProvider ?? activeProviders[0]?.id;
    if (recoveryProvider) selectProvider(recoveryProvider);
  };

  const handleRetryProviders = async () => {
    setRetryingProviders(true);
    try {
      await refreshProviders();
    } finally {
      setRetryingProviders(false);
    }
  };

  const handleValidateAndSave = async () => {
    const key = keyValue.trim();
    if (!selectedProvider || !key) return;
    setValidate({ status: 'testing' });
    try {
      const res = await adapter.testApiKey(selectedProvider.id, key, { live: true });
      if (!res.valid) {
        setValidate({ status: 'error', message: res.error || 'That key was rejected.' });
        return;
      }
      const shouldSelectFirstCloudModel = activeProviders.length === 0 && (res.verified === true || !localReady);
      const saved = await adapter.setProviderKey(selectedProvider.id, key);
      const refreshed = await refreshProviders();
      const firstCloudModel = shouldSelectFirstCloudModel
        ? refreshed?.providers.find((p) => p.id === selectedProvider.id)?.models[0]?.id
        : undefined;
      let defaultModelSaveFailed = false;
      if (firstCloudModel) {
        try {
          await adapter.saveSettings({ defaultModel: firstCloudModel });
        } catch {
          // The key is already safely stored; keep that success distinct from
          // a secondary default-model preference write that can be retried in Settings.
          defaultModelSaveFailed = true;
        }
      }
      setValidate({
        status: 'saved',
        verified: res.verified === true,
        defaultModel: firstCloudModel,
        defaultModelSaveFailed,
        ...((saved.router && !saved.router.ready) ? {
          routerWarning: saved.router.error ?? 'The model router did not become ready.',
        } : {}),
      });
      // F3: a freshly verified key upgrades the banner immediately, without
      // waiting out the 60s probe cache.
      if (saved.router?.ready === false && !localReady) {
        setProbe({ status: 'idle' });
      } else if (res.verified === true) {
        setProbe({ status: 'verified', verifiedProvider: selectedProvider.name });
      }
      setKeyValue('');
      if (saved.router?.ready !== false || localReady) onModelReady?.(firstCloudModel);
    } catch {
      setValidate({ status: 'error', message: 'Could not save the key — check your connection and try again.' });
    }
  };

  const handleDiscoverCompatible = async () => {
    const endpoint = endpointValue.trim();
    if (!endpoint) {
      setCompatibleStatus('error');
      setCompatibleError('Enter an endpoint URL first.');
      return;
    }
    setCompatibleStatus('discovering');
    setCompatibleError(null);
    setCompatibleModels([]);
    setCompatibleModel('');
    const apiKey = keyValue.trim() || undefined;
    const generation = ++compatibleRequestGeneration.current;
    try {
      const result = await adapter.testCompatibleProvider(endpoint, apiKey);
      if (generation !== compatibleRequestGeneration.current) return;
      if (!result.valid || result.models.length === 0) {
        setCompatibleStatus('error');
        setCompatibleError(result.error || 'No models were found at that endpoint.');
        return;
      }
      setEndpointValue(result.baseUrl);
      setCompatibleModels(result.models);
      setCompatibleModel(result.models[0]?.id ?? '');
      setCompatibleStatus('discovered');
    } catch (error) {
      if (generation !== compatibleRequestGeneration.current) return;
      setCompatibleStatus('error');
      setCompatibleError(error instanceof Error ? error.message : 'Could not reach that endpoint.');
    }
  };

  const handleSaveCompatible = async () => {
    const endpoint = endpointValue.trim();
    const model = compatibleModel;
    const apiKey = keyValue.trim() || undefined;
    if (!endpoint || !model) return;
    if (
      selectedProvider?.hasKey
      && !apiKey
      && endpoint !== (selectedProvider.baseUrl ?? '').trim()
    ) {
      setCompatibleStatus('error');
      setCompatibleError('The stored key is tied to the current endpoint. Enter the key to use before saving a different endpoint.');
      return;
    }
    const generation = ++compatibleRequestGeneration.current;
    explicitCompatibleOperationRef.current = generation;
    readinessProbeGeneration.current += 1;
    setCompatibleStatus('verifying');
    setCompatibleError(null);
    let saved = false;
    try {
      const result = await adapter.testCompatibleProvider(
        endpoint,
        apiKey,
        model,
      );
      if (generation !== compatibleRequestGeneration.current) return;
      if (
        !result.valid
        || !result.verified
        || !result.models.some((candidate) => candidate.id === model)
      ) {
        setCompatibleStatus('error');
        setCompatibleError(result.error || 'The selected model did not return a usable response.');
        return;
      }
      setCompatibleStatus('saving');
      const models = result.models.map((model) => model.id);
      await adapter.setProviderConfig('openai-compatible', {
        ...(apiKey ? { apiKey } : {}),
        baseUrl: result.baseUrl,
        models,
        defaultModel: model,
      });
      if (generation !== compatibleRequestGeneration.current) return;
      await refreshProviders();
      if (generation !== compatibleRequestGeneration.current) return;
      setEndpointValue(result.baseUrl);
      setCompatibleModels(result.models);
      setCompatibleStatus('saved');
      setProbe({ status: 'verified', verifiedModel: model });
      setKeyValue('');
      onModelReady?.(model);
      saved = true;
    } catch (error) {
      if (generation !== compatibleRequestGeneration.current) return;
      setCompatibleStatus('error');
      setCompatibleError(error instanceof Error ? error.message : 'Could not save that endpoint.');
    } finally {
      if (explicitCompatibleOperationRef.current === generation) {
        explicitCompatibleOperationRef.current = null;
        if (!saved && mountedRef.current) {
          setReadinessProbeRevision((current) => current + 1);
        }
      }
    }
  };

  const handleRetryRouter = async () => {
    if (validate.status !== 'saved') return;
    setRetryingRouter(true);
    try {
      const result = await adapter.restartModelRouter();
      if (!result.running) {
        setValidate((current) => current.status === 'saved'
          ? { ...current, routerWarning: result.error ?? 'The model router did not become ready.' }
          : current);
        return;
      }
      await refreshProviders();
      setValidate((current) => current.status === 'saved'
        ? { ...current, routerWarning: undefined }
        : current);
      if (validate.verified) {
        setProbe({ status: 'verified', verifiedProvider: selectedProvider?.name });
      }
      onModelReady?.(validate.defaultModel);
    } catch {
      setValidate((current) => current.status === 'saved'
        ? { ...current, routerWarning: 'Could not restart the model router.' }
        : current);
    } finally {
      setRetryingRouter(false);
    }
  };

  const handlePull = async () => {
    const name = pullName.trim();
    if (!name) return;
    setPulling(true);
    setPullMsg(null);
    try {
      const res = await adapter.pullLocalModel(name);
      if (res?.ok && res.verifiedGeneration) {
        let selectedAsDefault = true;
        try {
          await adapter.saveSettings({ defaultModel: `ollama/${res.model}` });
        } catch {
          selectedAsDefault = false;
        }
        setPullMsg({
          kind: selectedAsDefault ? 'ok' : 'err',
          text: selectedAsDefault
            ? `Installed and verified "${res.model}". It is now your default local model.`
            : `Installed and verified "${res.model}", but Waggle could not select it as the default.`,
        });
        setPullName('');
        await refreshLocal();
        if (selectedAsDefault) onModelReady?.(`ollama/${res.model}`);
      } else {
        setPullMsg({ kind: 'err', text: `Could not install and verify "${name}".` });
      }
    } catch (error) {
      setPullMsg({
        kind: 'err',
        text: error instanceof Error ? error.message : `Could not install and verify "${name}".`,
      });
    } finally {
      setPulling(false);
    }
  };

  const handleBootstrap = async () => {
    setBootstrapping(true);
    setRuntimeMsg(null);
    try {
      await adapter.bootstrapLocalRuntime();
      await refreshLocal();
      setRuntimeMsg({
        kind: 'ok',
        text: 'Private runtime ready. Download the recommended model to finish local setup.',
      });
    } catch (error) {
      setRuntimeMsg({
        kind: 'err',
        text: error instanceof Error ? error.message : 'Could not install the private runtime.',
      });
    } finally {
      setBootstrapping(false);
    }
  };

  // Round-P provider selector: a real filled-tile grid (not a pill row). The
  // fill/glyph encode key state at a glance; failing = the live probe rejected
  // the stored key (same `probe.failedProvider` signal the old chip carried).
  const isConfiguredProvider = (provider: Provider) => provider.hasKey || (
    provider.id === 'openai-compatible'
    && Boolean(provider.baseUrl?.trim())
  );
  const configuredProviders = cloudProviders.filter(isConfiguredProvider);
  const unconfiguredProviders = cloudProviders.filter((provider) => !isConfiguredProvider(provider));
  const compatibleLocked = compatibleStatus === 'saving';

  const renderProviderTile = (p: Provider) => {
    const failing = probe.status === 'failed' && probe.failedProvider === p.id;
    const isSelected = selected === p.id;
    const configured = isConfiguredProvider(p);
    const compatible = p.id === 'openai-compatible';
    const stateWord = failing
      ? 'not responding'
      : compatible
        ? configured
          ? p.modelsSource === 'provider-api' ? 'Endpoint ready' : 'Endpoint saved'
          : 'No endpoint yet'
        : p.hasKey ? 'Key in Vault' : 'No key yet';
    const catalogWord = configured && p.modelsSource === 'unavailable'
      ? 'Catalog unavailable'
      : configured && p.modelsSource === 'stale-provider-api'
        ? 'Last known catalog'
        : null;
    // R9: amber is reserved for the SELECTED tile and red for the erroring one —
    // keyed tiles rest NEUTRAL (surface + soft line) so a dozen of them stop
    // reading as honey wallpaper. The keyed signal is the honey Check + "Key in
    // Vault" meta only.
    const fill = failing
      ? 'bg-[var(--risk-wash)] border-[var(--risk)]/40'
      : isSelected
        ? 'bg-card border-[var(--honey-line)]'
        : configured
          ? 'bg-card border-[var(--line-soft)]'
          : 'bg-transparent border-[var(--line-soft)]';
    // Ring echoes the same one-truth-one-tone rule: risk on the erroring tile,
    // honey only on a non-failing selected tile. Both ring colors are EXPLICIT
    // tokens — an arbitrary `/opacity` modifier on the ring color silently fell
    // back to Tailwind's default blue ring (5/5 judges flagged it), so risk uses
    // a color-mix tint (matching the memory-trust risk grammar) and never bare
    // `var/opacity`. An error tile that is also selected shows the risk ring only.
    const ring = failing
      ? 'ring-2 ring-[color-mix(in_srgb,var(--risk)_35%,transparent)]'
      : isSelected
        ? 'ring-2 ring-[var(--honey-line)] shadow-[var(--shadow-card)]'
        : '';
    return (
      <button
        key={p.id}
        type="button"
        disabled={compatibleLocked}
        aria-pressed={isSelected}
        onClick={() => handleSelect(p.id)}
        className={`flex items-start gap-2.5 rounded-[12px] border p-2.5 text-left transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--honey-line)] disabled:cursor-not-allowed disabled:opacity-60 ${fill} ${ring}`}
      >
        {/* Brand logomark — reuses the marketplace BrandTile technique (real
            simple-icons mark when known, monogram-hex fallback otherwise). */}
        <BrandTile identity={getBrandIdentity(p.id, p.name, '')} size={28} className="mt-0.5" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className={`truncate text-[13px] font-semibold ${configured || failing ? 'text-foreground' : 'text-[var(--text-2)]'}`}>
              {p.name}
            </span>
            {/* A keyed-but-failing provider shows the risk glyph — the honey check
                must never contradict the "not responding" state. */}
            {failing ? (
              <AlertTriangle className="size-3.5 shrink-0 text-[var(--risk)]" aria-label="key not responding" />
            ) : configured ? (
              <Check className="size-3.5 shrink-0 text-honey" aria-label={compatible ? 'endpoint configured' : 'key configured'} />
            ) : null}
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">
            {p.models.length > 0 ? `${p.models.length} model${p.models.length === 1 ? '' : 's'} · ` : ''}
            {catalogWord ? `${catalogWord} · ` : ''}
            {stateWord}
          </span>
        </div>
      </button>
    );
  };

  const wrap = variant === 'onboarding' ? 'space-y-5' : 'space-y-4';

  return (
    <div className={wrap}>
      {/* Readiness banner — F3: probe-backed, not key-presence-backed. Wave V
          (Lane B): single-truth. While resolving, paint NOTHING until the 300ms
          grace elapses, then a neutral "Checking your models…"; once settled,
          render EXACTLY ONE verdict below — no intermediate verdict may paint. */}
      {!suppressReadinessBanner && (resolving ? (
        showChecking ? (
          <div role="status" className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
            <span aria-hidden className="shrink-0"><BeeLoader size={22} /></span>
            <span>Checking your models…</span>
          </div>
        ) : null
      ) : probe.status === 'verified' && (!routerBlocked || localReady) ? (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm text-foreground">
          <Check className="size-4 shrink-0 text-honey" aria-hidden />
          <span>
            {probe.verifiedModel
              ? `Model verified (${probe.verifiedModel}) — you’re ready to go.`
              : probe.verifiedProvider
              ? `${probe.verifiedProvider} key verified — you’re ready to go.`
              : 'Model verified — you’re ready to go.'}
          </span>
        </div>
      ) : probe.status === 'failed' ? (
        // Same state, same tone: the failing provider TILE below uses --risk, so the
        // banner announcing that state must too (two tones for one truth reads as a bug).
        <div role="status" className="flex items-center gap-2 rounded-lg border border-[var(--risk)]/30 bg-[var(--risk-wash)] px-3 py-2.5 text-sm text-foreground">
          <AlertTriangle className="size-4 shrink-0 text-[var(--risk)]" aria-hidden />
          <span className="flex-1">Key found but not responding.</span>
          <button
                type="button"
                onClick={focusFailingKey}
                disabled={compatibleLocked}
                className="shrink-0 rounded-md border border-[var(--risk)]/40 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-[var(--risk)]/10"
          >
            Fix it now
          </button>
        </div>
      ) : probe.status === 'unverified' ? (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <span>Couldn’t verify your key just now — you can continue and check it in Settings later.</span>
        </div>
      ) : (
        <div
          role="status"
          className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
            ready
              ? 'border-primary/30 bg-primary/10 text-foreground'
              : 'border-border bg-muted/40 text-muted-foreground'
          }`}
        >
          {ready ? (
            <>
              <Check className="size-4 shrink-0 text-honey" aria-hidden />
              <span>You have a working model — you’re ready to go.</span>
            </>
          ) : (
            <>
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              <span>No working model yet — add a provider key or a local model below.</span>
            </>
          )}
        </div>
      ))}

      {/* Tabs */}
      {/* Content-sized 2-segment control (not a full-width band): inline-flex so
          it hugs its two cells — no phantom trailing cells / hex show-through. */}
      <div role="tablist" aria-label="How to add a model" className="inline-flex gap-1 rounded-lg border border-[var(--line-soft)] bg-muted/60 p-1">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'cloud'}
          disabled={compatibleLocked}
          onClick={() => {
            cancelCompatibleVerification();
            setTab('cloud');
          }}
          className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'cloud' ? 'bg-card text-foreground shadow-sm ring-1 ring-[var(--honey-line)]' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <KeyRound className="size-3.5" aria-hidden /> Cloud / API
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'local'}
          disabled={compatibleLocked}
          onClick={() => {
            cancelCompatibleVerification();
            setTab('local');
          }}
          className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'local' ? 'bg-card text-foreground shadow-sm ring-1 ring-[var(--honey-line)]' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Cpu className="size-3.5" aria-hidden /> Local model
        </button>
      </div>

      {tab === 'cloud' && (
        <div className="space-y-3" role="tabpanel">
          <p className="text-xs text-muted-foreground">
            Connect a cloud provider with your own key, or add an OpenAI-compatible endpoint.
          </p>
          {(providersError || catalogNeedsRefresh) && (
            <div
              role={providersError ? 'alert' : 'status'}
              className="flex items-center gap-2 rounded-lg border border-[var(--risk)]/30 bg-[var(--risk-wash)] px-3 py-2.5 text-sm text-foreground"
            >
              <AlertTriangle className="size-4 shrink-0 text-[var(--risk)]" aria-hidden />
              <span className="min-w-0 flex-1">
                {providersError && cloudProviders.length > 0
                  ? 'Provider status could not be refreshed. Your existing choices are still available.'
                  : providersError
                    ? 'Providers could not be loaded. Check that the local service is running, then retry.'
                    : 'A provider model catalog could not be refreshed. Last-known models remain available.'}
              </span>
              <button
                type="button"
                onClick={() => { void handleRetryProviders(); }}
                disabled={retryingProviders}
                className="shrink-0 rounded-md border border-[var(--risk)]/40 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-[var(--risk)]/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`mr-1 inline size-3.5 ${retryingProviders ? 'animate-spin' : ''}`} aria-hidden />
                {retryingProviders ? 'Refreshing…' : providersError ? 'Retry' : 'Refresh catalogs'}
              </button>
            </div>
          )}
          {providersLoading && cloudProviders.length === 0 ? (
            <span className="text-sm text-muted-foreground">Loading providers…</span>
          ) : configuredProviders.length > 0 ? (
            // With ≥1 keyed provider, split into "yours" then "add" so the
            // configured providers read as a distinct, owned set.
            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-dim)]">Your providers</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {configuredProviders.map(renderProviderTile)}
                </div>
              </div>
              {unconfiguredProviders.length > 0 && (
                <div className="space-y-1.5">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-dim)]">Add a provider</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                    {unconfiguredProviders.map(renderProviderTile)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            // First-run (nothing keyed): one flat grid, no group labels.
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {cloudProviders.map(renderProviderTile)}
            </div>
          )}

          {selectedProvider?.id === 'openai-compatible' ? (
            <div className="space-y-3 rounded-lg border border-border bg-card/60 p-3">
              <div>
                <label htmlFor="model-gate-endpoint" className="block text-sm font-medium text-foreground">
                  Endpoint URL
                </label>
                <Input
                  id="model-gate-endpoint"
                  name="modelProviderEndpoint"
                  type="url"
                  autoComplete="url"
                  disabled={compatibleLocked}
                  value={endpointValue}
                  onChange={(event) => {
                    cancelCompatibleVerification();
                    setEndpointValue(event.target.value);
                    setCompatibleModels([]);
                    setCompatibleModel('');
                    setCompatibleStatus('idle');
                    setCompatibleError(null);
                  }}
                  placeholder="http://localhost:4000/v1"
                />
              </div>
              <div>
                <label htmlFor="model-gate-compatible-key" className="block text-sm font-medium text-foreground">
                  API key (optional)
                </label>
                <Input
                  id="model-gate-compatible-key"
                  name="modelProviderKey"
                  type="password"
                  autoComplete="off"
                  disabled={compatibleLocked}
                  value={keyValue}
                  onChange={(event) => {
                    cancelCompatibleVerification();
                    setKeyValue(event.target.value);
                    setCompatibleModels([]);
                    setCompatibleModel('');
                    setCompatibleStatus('idle');
                    setCompatibleError(null);
                  }}
                  placeholder={selectedProvider.hasKey
                    ? 'Enter a key before changing endpoints'
                    : 'Leave blank for a keyless local endpoint'}
                />
              </div>
              {selectedProvider.hasKey
                && !keyValue.trim()
                && endpointValue.trim() !== (selectedProvider.baseUrl ?? '').trim()
                && (
                  <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
                    <AlertTriangle className="size-4" aria-hidden />
                    The stored key is tied to the current endpoint. Enter the key to use before saving a different endpoint.
                  </p>
                )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => { void handleDiscoverCompatible(); }}
                  disabled={compatibleStatus === 'discovering' || compatibleStatus === 'verifying' || compatibleStatus === 'saving' || !endpointValue.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-soft)] px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {compatibleStatus === 'discovering' && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                  {compatibleStatus === 'discovering' ? 'Discovering…' : 'Discover models'}
                </button>
              </div>
              {compatibleModels.length > 0 && (
                <div className="space-y-2">
                  <label htmlFor="model-gate-compatible-model" className="block text-sm font-medium text-foreground">
                    Model
                  </label>
                  <select
                    id="model-gate-compatible-model"
                    disabled={compatibleLocked}
                    value={compatibleModel}
                    onChange={(event) => {
                      cancelCompatibleVerification();
                      setCompatibleModel(event.target.value);
                      setCompatibleStatus('discovered');
                      setCompatibleError(null);
                    }}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    {compatibleModels.map((model) => (
                      <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                  </select>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => { void handleSaveCompatible(); }}
                      disabled={compatibleStatus === 'verifying' || compatibleStatus === 'saving' || compatibleStatus === 'discovering' || !compatibleModel}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {(compatibleStatus === 'verifying' || compatibleStatus === 'saving') && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                      {compatibleStatus === 'verifying'
                        ? 'Verifying…'
                        : compatibleStatus === 'saving'
                          ? 'Saving…'
                          : 'Verify & save'}
                    </button>
                  </div>
                </div>
              )}
              {compatibleStatus === 'saved' && (
                <p role="status" className="flex items-center gap-1.5 text-sm text-honey">
                  <Check className="size-4" aria-hidden />
                  Verified and saved. This model is now your primary model.
                </p>
              )}
              {compatibleStatus === 'error' && compatibleError && (
                <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertTriangle className="size-4" aria-hidden />
                  {compatibleError}
                </p>
              )}
            </div>
          ) : selectedProvider ? (
            <div className="space-y-2 rounded-lg border border-border bg-card/60 p-3">
              <label htmlFor="model-gate-key" className="block text-sm font-medium text-foreground">
                API key for {selectedProvider.name}
              </label>
              <Input
                id="model-gate-key"
                name="modelProviderKey"
                type="password"
                autoComplete="off"
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                placeholder={`Paste your ${selectedProvider.name} API key`}
              />
              <div className="flex items-center justify-between gap-2">
                {selectedProvider.keyUrl ? (
                  <a
                    href={selectedProvider.keyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-honey hover:underline"
                  >
                    Get a key <ExternalLink className="size-3" aria-hidden />
                  </a>
                ) : (
                  <span />
                )}
                {/* R9 fix: an empty input yields a QUIET OUTLINE button (not a
                    gray FILL that reads "permanently broken"); the instant a key
                    is typed it flips to the full primary — an obvious enable. A
                    non-empty testing state keeps the primary look while busy. */}
                <button
                  type="button"
                  onClick={handleValidateAndSave}
                  disabled={validate.status === 'testing' || !keyValue.trim()}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                    keyValue.trim()
                      ? 'border-transparent bg-primary text-primary-foreground'
                      : 'border-[var(--line-soft)] bg-transparent text-[var(--text-muted)]'
                  }`}
                >
                  {validate.status === 'testing' && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                  {validate.status === 'testing' ? 'Validating…' : 'Validate & save'}
                </button>
              </div>
              {validate.status === 'saved' && !validate.routerWarning && (
                <p role="status" className="flex items-center gap-1.5 text-sm text-honey">
                  <Check className="size-4" aria-hidden />
                  {validate.defaultModelSaveFailed
                    ? `Saved — ${selectedProvider.name} is ready. Choose a model in Settings.`
                    : validate.defaultModel
                    ? validate.verified
                      ? `Verified and saved. ${selectedProvider.name} is now your primary model.`
                      : `Saved — ${selectedProvider.name} is now your primary model.`
                    : validate.verified
                      ? 'Verified and saved.'
                      : localReady
                        ? 'Saved — the key looks valid. Your local model stays primary until this key is verified.'
                        : 'Saved — the key looks valid (not live-verified).'}
                </p>
              )}
              {validate.status === 'saved' && validate.routerWarning && (
                <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="size-4 shrink-0" aria-hidden />
                  <span>Key saved, but models are not ready. {validate.routerWarning}</span>
                  <button
                    type="button"
                    onClick={handleRetryRouter}
                    disabled={retryingRouter}
                    className="inline-flex items-center gap-1 rounded-md border border-current px-2 py-1 font-medium disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw className={`size-3.5 ${retryingRouter ? 'animate-spin' : ''}`} aria-hidden />
                    {retryingRouter ? 'Retrying…' : 'Retry router'}
                  </button>
                </div>
              )}
              {validate.status === 'error' && (
                <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertTriangle className="size-4" aria-hidden />
                  {validate.message}
                </p>
              )}
            </div>
          ) : null}
        </div>
      )}

      {tab === 'local' && (
        <div className="space-y-3" role="tabpanel">
          <p className="text-sm text-muted-foreground">
            {(local?.ollamaRunning ?? local?.ollamaInstalled)
              ? `Private runtime running — ${local?.totalLocalModels ?? 0} model${local?.totalLocalModels === 1 ? '' : 's'} installed.`
              : local?.managedRuntime?.installed
                ? 'Private runtime installed but not running. Start it here to use local models.'
                : local?.managedRuntime?.supported
                  ? 'No local runtime yet. Waggle can install and manage it for you.'
                  : local?.managedRuntime?.reason ?? 'Managed runtime status is unavailable. Retry the check before local setup.'}
          </p>
          {!(local?.ollamaRunning ?? local?.ollamaInstalled) && local?.managedRuntime?.supported && (
            <div className="space-y-2 rounded-lg border border-border bg-card/60 p-3">
              <div className="flex items-start gap-2">
                <Cpu className="mt-0.5 size-4 shrink-0 text-honey" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {local.managedRuntime.installed ? 'Start private runtime' : 'Install private runtime'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {local.managedRuntime.installed
                      ? 'Starts Waggle’s verified local runtime on this device.'
                      : `Downloads the checksum-verified official runtime${formatDownloadSize(local.managedRuntime.artifactSizeBytes) ? ` (${formatDownloadSize(local.managedRuntime.artifactSizeBytes)})` : ''}. No Docker, administrator access, or system Ollama install required.`}
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleBootstrap}
                  disabled={bootstrapping}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {bootstrapping && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                  {bootstrapping
                    ? 'Installing private runtime…'
                    : local.managedRuntime.installed ? 'Start runtime' : 'Install runtime'}
                </button>
              </div>
            </div>
          )}
          {runtimeMsg && (
            <p
              role={runtimeMsg.kind === 'err' ? 'alert' : 'status'}
              className={`text-sm ${runtimeMsg.kind === 'err' ? 'text-destructive' : 'text-honey'}`}
            >
              {runtimeMsg.text}
            </p>
          )}
          {(local?.ollamaRunning ?? local?.ollamaInstalled) && (
            <div className="space-y-2 rounded-lg border border-border bg-card/60 p-3">
              <label htmlFor="model-gate-pull" className="block text-sm font-medium text-foreground">
                Download and verify a model
              </label>
              {recommendedLocal && (
                <p className="text-xs text-muted-foreground">
                  Recommended for this device: <span className="font-medium text-foreground">{recommendedLocal.name}</span>
                  {recommendedLocal.fitLevel ? ` · ${recommendedLocal.fitLevel.replace('_', ' ')} fit` : ''}
                  {typeof recommendedLocal.estimatedTps === 'number' ? ` · ~${recommendedLocal.estimatedTps} tok/s` : ''}
                </p>
              )}
              <Input
                id="model-gate-pull"
                name="modelPullName"
                autoComplete="off"
                value={pullName}
                onChange={(e) => setPullName(e.target.value)}
                placeholder="e.g. llama3.2:3b"
              />
              <p className="text-xs text-muted-foreground">
                Model weights are downloaded to Waggle’s private data directory. By continuing, you accept the model publisher’s upstream license.
              </p>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handlePull}
                  disabled={pulling || !pullName.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {pulling && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                  {pulling ? 'Downloading and verifying…' : 'Install model'}
                </button>
              </div>
              {pullMsg && (
                <p
                  role={pullMsg.kind === 'err' ? 'alert' : 'status'}
                  className={`text-sm ${pullMsg.kind === 'err' ? 'text-destructive' : 'text-honey'}`}
                >
                  {pullMsg.text}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
