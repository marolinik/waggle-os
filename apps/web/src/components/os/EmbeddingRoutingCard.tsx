/**
 * EmbeddingRoutingCard — pick the memory embedding provider (steal #10).
 *
 * Sits under ModelPilotCard in Settings › Models. Mirrors ModelPilotCard's Hive DS
 * styling and key-gating pattern. The picker offers `auto` + the tier-allowed
 * providers; voyage/openai are disabled when their vault key is missing. A live
 * badge shows what is actually running; a Reprobe button re-runs the probe (useful
 * after installing Ollama or adding a key). Because the live embedder is fixed at
 * boot, an explicit switch shows a "restart to apply" hint honestly.
 */

import { useState, useEffect, useCallback } from 'react';
import { Boxes, RotateCw, Info, AlertTriangle } from 'lucide-react';
import { adapter, AdapterHttpError, type EmbeddingRoutingStatus } from '@/lib/adapter';
import type { Provider } from '@/hooks/useProviders';
import { TIER_CAPABILITIES, type Tier } from '@waggle/shared';
import { HintTooltip } from '@/components/ui/hint-tooltip';

interface EmbeddingRoutingCardProps {
  /** For voyage/openai key-gating (mirrors ModelPilotCard). */
  providers: Provider[];
  /** Gates which providers the tier may select. */
  tier: Tier;
}

/** Display order for the picker; 'mock' is never user-selectable. */
const PROVIDER_ORDER = ['auto', 'inprocess', 'ollama', 'voyage', 'openai', 'litellm'] as const;

const PROVIDER_LABELS: Record<string, string> = {
  auto: 'Auto (recommended)',
  inprocess: 'In-process (local, bundled)',
  ollama: 'Ollama (local server)',
  voyage: 'Voyage (cloud, paid)',
  openai: 'OpenAI (cloud, paid)',
  litellm: 'LiteLLM (proxy)',
  mock: 'Mock (no semantics)',
};

const EmbeddingRoutingCard = ({ providers, tier }: EmbeddingRoutingCardProps) => {
  const [status, setStatus] = useState<EmbeddingRoutingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restartHint, setRestartHint] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await adapter.getEmbeddingStatus());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load embedding status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Tier-allowed providers (+ always 'auto'), in display order, minus 'mock'.
  const allowed = new Set(TIER_CAPABILITIES[tier].embeddingProviders as readonly string[]);
  const options = PROVIDER_ORDER.filter(p => p === 'auto' || (p !== ('mock' as string) && allowed.has(p)));

  /** True when a cloud provider's key is missing (disable + hint). */
  const keyMissing = (id: string): boolean => {
    if (id === 'openai') {
      const p = providers.find(pr => pr.id === 'openai');
      return !!p && p.requiresKey && !p.hasKey;
    }
    if (id === 'voyage') {
      // Voyage is embedding-only (no /api/providers entry) — use the live probe.
      return !(
        status?.availableProviders?.includes('voyage') ||
        status?.activeProvider === 'voyage' ||
        status?.configuredProvider === 'voyage'
      );
    }
    return false;
  };

  const handleChange = async (provider: string) => {
    setBusy(true);
    setError(null);
    setRestartHint(false);
    try {
      const next = await adapter.setEmbeddingProvider(provider);
      setStatus(next);
      setRestartHint(next.restartRequired === true);
    } catch (err) {
      const msg = err instanceof AdapterHttpError ? err.message
        : err instanceof Error ? err.message : 'Could not change provider';
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleReprobe = async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await adapter.reprobeEmbedding());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reprobe failed');
    } finally {
      setBusy(false);
    }
  };

  const isMock = status?.activeProvider === 'mock';
  const envOverride = status?.envOverride === true;

  return (
    <div className="rounded-xl bg-secondary/30 border border-border/30 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Boxes className="w-4 h-4 text-honey" />
          <h3 className="text-sm font-display font-semibold text-foreground">Memory Embeddings</h3>
          <HintTooltip content="Which model turns your memories into vectors for semantic search. Local options keep everything on-device; cloud options are higher quality but send text to the provider.">
            <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
              <Info className="w-3.5 h-3.5" />
            </button>
          </HintTooltip>
        </div>
        <HintTooltip content="Re-check which providers are reachable (e.g. after starting Ollama or adding a key)">
          <button
            type="button"
            onClick={handleReprobe}
            disabled={busy || loading}
            data-testid="embedding-reprobe"
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-display bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RotateCw className={`w-3 h-3 ${busy ? 'animate-spin' : ''}`} />
            Reprobe
          </button>
        </HintTooltip>
      </div>

      {/* Live status badge */}
      <div className="flex items-center justify-between rounded-lg border border-[var(--line-soft)] bg-card px-3 py-2">
        <span className="text-[11px] text-muted-foreground">Active provider</span>
        {loading ? (
          <span className="text-[11px] text-muted-foreground">Loading…</span>
        ) : (
          <span className="flex items-center gap-2 text-xs">
            <span
              className={`font-display font-semibold ${isMock ? 'text-[var(--status-warning)]' : 'text-foreground'}`}
              data-testid="embedding-active-provider"
            >
              {PROVIDER_LABELS[status?.activeProvider ?? ''] ?? status?.activeProvider ?? '—'}
            </span>
            {status?.modelName && (
              <span className="text-muted-foreground">
                {status.modelName}{status.dimensions ? ` · ${status.dimensions}d` : ''}
              </span>
            )}
          </span>
        )}
      </div>

      {isMock && !loading && (
        <div className="flex items-start gap-1.5 rounded-lg border border-[var(--status-warning)]/30 bg-[var(--status-warning)]/10 px-2.5 py-2 text-[11px] text-muted-foreground">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-[var(--status-warning)] mt-px" />
          <span>Running the deterministic mock embedder — semantic search returns noise. Pick a real provider below, then restart.</span>
        </div>
      )}

      {/* Provider picker */}
      <div>
        <label className="text-[11px] text-muted-foreground block mb-1.5" htmlFor="embedding-provider-select">
          Provider
        </label>
        <select
          id="embedding-provider-select"
          data-testid="embedding-provider-select"
          value={status?.configuredProvider ?? 'auto'}
          disabled={busy || loading || envOverride}
          onChange={(e) => void handleChange(e.target.value)}
          className="w-full bg-muted/50 border border-border/30 rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
        >
          {options.map(p => {
            const missing = keyMissing(p);
            return (
              <option key={p} value={p} disabled={missing}>
                {PROVIDER_LABELS[p]}{missing ? ' — add key in Vault' : ''}
              </option>
            );
          })}
        </select>
      </div>

      {/* Hints */}
      {envOverride && (
        <p className="text-[11px] text-[var(--status-warning)]" data-testid="embedding-env-hint">
          Set by the <span className="font-mono">EMBEDDING_PROVIDER</span> environment variable — changes here are ignored until it is unset.
        </p>
      )}
      {restartHint && !envOverride && (
        <p className="text-[11px] text-muted-foreground" data-testid="embedding-restart-hint">
          Saved. Restart Waggle to switch the running embedder to this provider.
        </p>
      )}
      {error && (
        <p className="text-[11px] text-destructive" data-testid="embedding-error">{error}</p>
      )}
    </div>
  );
};

export default EmbeddingRoutingCard;
