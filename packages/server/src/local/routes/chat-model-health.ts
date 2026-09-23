/**
 * The chat turn's model-health probe, cached per provider status (TD-REL-2).
 *
 * When the tracked provider is not marked healthy, a turn asks the proxy's
 * health path whether it can serve a completion. Without a cache every turn,
 * slash commands included, paid that request, up to the full timeout when the
 * proxy hangs. A result is now reused for `MODEL_HEALTH_PROBE_TTL_MS` after it
 * settles, and turns that arrive while a probe is in flight share it.
 *
 * The cache is keyed by the provider status object itself. Every health
 * change assigns a new `agentState.llmProvider` object, so a change of
 * provider or health starts a fresh probe on the next turn.
 */

export const MODEL_HEALTH_PROBE_TTL_MS = 5_000;
export const MODEL_HEALTH_PROBE_TIMEOUT_MS = 3_000;

interface CachedProbe {
  readonly url: string;
  readonly expiresAt: number;
  readonly available: Promise<boolean>;
}

/** Resolves whether the model path behind `url` can serve a completion. */
export type ModelHealthProbe = (
  providerStatus: object,
  url: string,
  headers: Record<string, string>,
) => Promise<boolean>;

export function createModelHealthProbe(ttlMs: number = MODEL_HEALTH_PROBE_TTL_MS): ModelHealthProbe {
  const cache = new WeakMap<object, CachedProbe>();
  return (providerStatus, url, headers) => {
    const cached = cache.get(providerStatus);
    if (cached && cached.url === url && cached.expiresAt > Date.now()) return cached.available;

    const available = fetch(url, { signal: AbortSignal.timeout(MODEL_HEALTH_PROBE_TIMEOUT_MS), headers })
      // An unreachable or hung proxy reads as unavailable: the turn gets the
      // setup-required reply, and the next probe after the TTL retries.
      .then((res) => res.ok, () => false);
    const inFlight: CachedProbe = { url, expiresAt: Number.POSITIVE_INFINITY, available };
    cache.set(providerStatus, inFlight);
    void available.then(() => {
      if (cache.get(providerStatus) === inFlight) {
        cache.set(providerStatus, { ...inFlight, expiresAt: Date.now() + ttlMs });
      }
    });
    return available;
  };
}
