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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, AlertTriangle, Loader2, KeyRound, Cpu, ExternalLink } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { useProviders } from '@/hooks/useProviders';
import { Input } from '@/components/ui/input';

interface ModelGateProps {
  /** Fires after a model becomes available (key saved or local pull ok), so a parent
   *  (onboarding gate / Settings banner) can re-read `useHasWorkingModel`. */
  onModelReady?: () => void;
  /** Styling only — 'onboarding' is full-bleed; 'settings' is an embedded card. */
  variant?: 'onboarding' | 'settings';
}

interface LocalStatus {
  servers: Array<Record<string, unknown>>;
  ollamaInstalled: boolean;
  totalLocalModels: number;
}

type ValidateState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'saved'; verified: boolean }
  | { status: 'error'; message: string };

export function ModelGate({ onModelReady, variant = 'settings' }: ModelGateProps) {
  const { providers, activeProviders, loading: providersLoading, refresh: refreshProviders } = useProviders();
  const [tab, setTab] = useState<'cloud' | 'local'>('cloud');

  // Cloud key entry
  const [selected, setSelected] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState('');
  const [validate, setValidate] = useState<ValidateState>({ status: 'idle' });

  // Local models
  const [local, setLocal] = useState<LocalStatus | null>(null);
  const [pullName, setPullName] = useState('');
  const [pulling, setPulling] = useState(false);
  const [pullMsg, setPullMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const refreshLocal = useCallback(async () => {
    try {
      setLocal(await adapter.getLocalInferenceStatus());
    } catch {
      setLocal({ servers: [], ollamaInstalled: false, totalLocalModels: 0 });
    }
  }, []);
  useEffect(() => { void refreshLocal(); }, [refreshLocal]);

  // Same readiness predicate as useHasWorkingModel — computed inline from data we hold.
  const cloudReady = activeProviders.length > 0;
  const localReady = (local?.totalLocalModels ?? 0) > 0;
  const ready = cloudReady || localReady;

  const keyProviders = useMemo(
    () => providers.filter((p) => p.requiresKey && p.id !== 'ollama'),
    [providers],
  );
  const selectedProvider = keyProviders.find((p) => p.id === selected) ?? null;

  const handleSelect = (id: string) => {
    setSelected(id);
    setKeyValue('');
    setValidate({ status: 'idle' });
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
      await adapter.setProviderKey(selectedProvider.id, key);
      setValidate({ status: 'saved', verified: res.verified === true });
      setKeyValue('');
      await refreshProviders();
      onModelReady?.();
    } catch {
      setValidate({ status: 'error', message: 'Could not save the key — check your connection and try again.' });
    }
  };

  const handlePull = async () => {
    const name = pullName.trim();
    if (!name) return;
    setPulling(true);
    setPullMsg(null);
    try {
      const res = await adapter.pullLocalModel(name);
      if (res?.ok) {
        setPullMsg({ kind: 'ok', text: `Pulled "${name}".` });
        setPullName('');
        await refreshLocal();
        onModelReady?.();
      } else {
        setPullMsg({ kind: 'err', text: `Could not pull "${name}".` });
      }
    } catch {
      setPullMsg({ kind: 'err', text: `Could not pull "${name}" — is Ollama running?` });
    } finally {
      setPulling(false);
    }
  };

  const wrap = variant === 'onboarding' ? 'space-y-5' : 'space-y-4';

  return (
    <div className={wrap}>
      {/* Readiness banner — mirrors the shared useHasWorkingModel signal. */}
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
            <Check className="size-4 shrink-0 text-primary" aria-hidden />
            <span>You have a working model — you’re ready to go.</span>
          </>
        ) : (
          <>
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span>No working model yet — add a provider key or a local model below.</span>
          </>
        )}
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="How to add a model" className="flex gap-1 rounded-lg bg-muted/40 p-1">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'cloud'}
          onClick={() => setTab('cloud')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'cloud' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <KeyRound className="size-3.5" aria-hidden /> API key
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'local'}
          onClick={() => setTab('local')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'local' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Cpu className="size-3.5" aria-hidden /> Local model
        </button>
      </div>

      {tab === 'cloud' && (
        <div className="space-y-3" role="tabpanel">
          <p className="text-xs text-muted-foreground">
            Bring your own key — it’s stored encrypted in your Vault and never leaves your machine.
          </p>
          <div className="flex flex-wrap gap-2">
            {providersLoading && keyProviders.length === 0 ? (
              <span className="text-sm text-muted-foreground">Loading providers…</span>
            ) : (
              keyProviders.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={selected === p.id}
                  onClick={() => handleSelect(p.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    selected === p.id
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p.hasKey && <Check className="size-3.5 text-primary" aria-label="key configured" />}
                  {p.name}
                </button>
              ))
            )}
          </div>

          {selectedProvider && (
            <div className="space-y-2 rounded-lg border border-border bg-card/60 p-3">
              <label htmlFor="model-gate-key" className="block text-sm font-medium text-foreground">
                API key for {selectedProvider.name}
              </label>
              <Input
                id="model-gate-key"
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
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Get a key <ExternalLink className="size-3" aria-hidden />
                  </a>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={handleValidateAndSave}
                  disabled={validate.status === 'testing' || !keyValue.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {validate.status === 'testing' && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                  {validate.status === 'testing' ? 'Validating…' : 'Validate & save'}
                </button>
              </div>
              {validate.status === 'saved' && (
                <p role="status" className="flex items-center gap-1.5 text-sm text-primary">
                  <Check className="size-4" aria-hidden />
                  {validate.verified
                    ? 'Verified and saved.'
                    : 'Saved — the key looks valid (not live-verified).'}
                </p>
              )}
              {validate.status === 'error' && (
                <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertTriangle className="size-4" aria-hidden />
                  {validate.message}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'local' && (
        <div className="space-y-3" role="tabpanel">
          <p className="text-sm text-muted-foreground">
            {local?.ollamaInstalled
              ? `Ollama detected — ${local.totalLocalModels} model${local.totalLocalModels === 1 ? '' : 's'} installed.`
              : 'No local runtime detected. Install Ollama to run models privately on your machine.'}
          </p>
          <div className="space-y-2 rounded-lg border border-border bg-card/60 p-3">
            <label htmlFor="model-gate-pull" className="block text-sm font-medium text-foreground">
              Pull a model
            </label>
            <Input
              id="model-gate-pull"
              value={pullName}
              onChange={(e) => setPullName(e.target.value)}
              placeholder="e.g. llama3.2"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handlePull}
                disabled={pulling || !pullName.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {pulling && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                {pulling ? 'Pulling…' : 'Pull'}
              </button>
            </div>
            {pullMsg && (
              <p
                role={pullMsg.kind === 'err' ? 'alert' : 'status'}
                className={`text-sm ${pullMsg.kind === 'err' ? 'text-destructive' : 'text-primary'}`}
              >
                {pullMsg.text}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
