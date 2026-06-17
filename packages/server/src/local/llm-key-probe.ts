/**
 * PR5 / D3 — shared, provider-agnostic live API-key probe.
 *
 * Generalises the proven *private* Anthropic 1-token probe (`validateAnthropicKey`
 * in `index.ts`, which powers `/health` and must NOT be touched — it is closure-scoped
 * over the server's vault + a module cache) into a standalone, injectable function the
 * `POST /api/settings/test-key` route can call in "live" mode for the PR5 ModelGate.
 *
 * Honesty contract (carries the PR3/PR3.5 no-fabrication rule): `verified` is `true`
 * ONLY when a real provider API call confirmed the key. Format-only acceptance — for a
 * provider without a cheap probe, or when the network is unreachable — returns
 * `verified: false`, so the UI can say "looks valid" rather than a confident
 * "✓ verified". A format-only pass must never masquerade as a checked key.
 */

export interface KeyProbeResult {
  /** Accept the key? Passes format and — if a live probe ran — was not rejected (401/403). */
  valid: boolean;
  /** True ONLY if a live provider API call confirmed the key (not format-only, not a network fallback). */
  verified: boolean;
  error?: string;
}

/**
 * Validate key format without a network call. Ported verbatim from the previous
 * `settings.ts` `validateApiKeyFormat` so the two can never drift — `settings.ts`
 * now imports this as its single source of truth.
 */
export function validateKeyFormat(provider: string, apiKey: string): { valid: boolean; error?: string } {
  switch (provider.toLowerCase()) {
    case 'openai':
      if (!apiKey.startsWith('sk-')) {
        return { valid: false, error: 'OpenAI keys must start with "sk-"' };
      }
      if (apiKey.length < 20) {
        return { valid: false, error: 'API key is too short' };
      }
      return { valid: true };

    case 'anthropic':
      if (!apiKey.startsWith('sk-ant-')) {
        return { valid: false, error: 'Anthropic keys must start with "sk-ant-"' };
      }
      if (apiKey.length < 20) {
        return { valid: false, error: 'API key is too short' };
      }
      return { valid: true };

    case 'google':
    case 'gemini':
      if (apiKey.length < 10) {
        return { valid: false, error: 'API key is too short' };
      }
      return { valid: true };

    default:
      // Unknown providers: only a sanity length check.
      if (apiKey.length < 8) {
        return { valid: false, error: 'API key is too short' };
      }
      return { valid: true };
  }
}

interface ProbeSpec {
  url: (key: string) => string;
  init: (key: string) => RequestInit;
}

/**
 * The cheapest "does this key authenticate" request per provider. We treat ONLY
 * 401/403 as "key rejected" — any other status (200 OK, 400 bad-request,
 * 429 rate-limited, 5xx) means the key was accepted, the same rule the Anthropic
 * `/health` probe uses (a 400 means the key works but our 1-token body was odd).
 * Providers absent from this map fall back to format-only (`verified: false`).
 */
const PROBE_SPECS: Record<string, ProbeSpec> = {
  anthropic: {
    url: () => 'https://api.anthropic.com/v1/messages',
    init: (key) => ({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    }),
  },
  openai: {
    url: () => 'https://api.openai.com/v1/models',
    init: (key) => ({ headers: { Authorization: `Bearer ${key}` } }),
  },
  google: {
    url: (key) => `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
    init: () => ({}),
  },
  gemini: {
    url: (key) => `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
    init: () => ({}),
  },
  openrouter: {
    url: () => 'https://openrouter.ai/api/v1/key',
    init: (key) => ({ headers: { Authorization: `Bearer ${key}` } }),
  },
  xai: {
    url: () => 'https://api.x.ai/v1/models',
    init: (key) => ({ headers: { Authorization: `Bearer ${key}` } }),
  },
  mistral: {
    url: () => 'https://api.mistral.ai/v1/models',
    init: (key) => ({ headers: { Authorization: `Bearer ${key}` } }),
  },
  deepseek: {
    url: () => 'https://api.deepseek.com/models',
    init: (key) => ({ headers: { Authorization: `Bearer ${key}` } }),
  },
};

function hashKey(key: string): string {
  // Non-cryptographic — cache key only (never logged, never persisted).
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  }
  return String(h);
}

const PROBE_TTL_MS = 60_000;
// Keyed by `${provider}:${hash(key)}` so the same string reused across providers
// never collides (the grounding flagged a hash-only key as a false-negative risk).
const cache = new Map<string, { result: KeyProbeResult; at: number }>();

/** Test seam — clears the short-TTL probe cache. */
export function _clearKeyProbeCache(): void {
  cache.clear();
}

export interface ProbeOptions {
  timeoutMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable clock for deterministic cache tests; defaults to Date.now. */
  now?: () => number;
}

/**
 * Probe a provider key. Format-checks first (no network on a malformed key), then —
 * for providers with a cheap auth endpoint — does one live request with a 5s timeout
 * and a short-TTL hash cache. Network/timeout errors degrade to format-only rather
 * than failing the gate on a transient blip.
 */
export async function probeProviderKey(
  provider: string,
  apiKey: string,
  opts: ProbeOptions = {},
): Promise<KeyProbeResult> {
  const fmt = validateKeyFormat(provider, apiKey);
  if (!fmt.valid) {
    return { valid: false, verified: false, error: fmt.error };
  }

  const p = provider.toLowerCase();
  const spec = PROBE_SPECS[p];
  if (!spec) {
    // No cheap live probe for this provider — accept on format, but be honest.
    return { valid: true, verified: false };
  }

  const now = opts.now ?? Date.now;
  const cacheKey = `${p}:${hashKey(apiKey)}`;
  const cached = cache.get(cacheKey);
  if (cached && now() - cached.at < PROBE_TTL_MS) {
    return cached.result;
  }

  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 5000;
  try {
    const res = await doFetch(spec.url(apiKey), {
      ...spec.init(apiKey),
      signal: AbortSignal.timeout(timeoutMs),
    });
    let rejected = res.status === 401 || res.status === 403;
    // Google/Gemini are the outlier: an INVALID key returns HTTP 400 with body
    // reason API_KEY_INVALID (not 401/403, and the key rides in the query string),
    // so the 401/403-only rule would mis-report a bad Google key as "verified".
    // Read the body ONLY on a Google 400 — the happy path stays body-free.
    if (!rejected && res.status === 400 && (p === 'google' || p === 'gemini')) {
      const body = await res.text().catch(() => '');
      if (/API_KEY_INVALID|API key not valid/i.test(body)) rejected = true;
    }
    const result: KeyProbeResult = rejected
      ? { valid: false, verified: true, error: 'Key was rejected by the provider.' }
      : { valid: true, verified: true };
    cache.set(cacheKey, { result, at: now() });
    return result;
  } catch {
    // Network/timeout — we can't confirm. The format is valid; don't fail the gate on
    // a transient network problem, but never claim "verified".
    return { valid: true, verified: false };
  }
}
