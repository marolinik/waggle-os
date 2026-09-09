/**
 * Runtime provider model discovery.
 *
 * Provider identity and endpoint metadata belong in the application; model
 * identities do not. Every configured provider is queried through its native
 * model-list endpoint, and the returned ids are exposed as provider/model
 * references so newly released models remain routable without a code change.
 */

export type ProviderCatalogAuth = 'bearer' | 'anthropic' | 'google-header';

export interface ProviderCatalogDefinition {
  endpoint: string;
  auth: ProviderCatalogAuth;
  pagination?: 'anthropic-cursor' | 'google-page-token';
}

export interface DiscoveredProviderModel {
  id: string;
  name: string;
  /** Neutral UI metadata: the provider catalog does not reliably publish price/speed. */
  cost: '$$';
  speed: 'medium';
  source: 'provider-api';
  ownedBy?: string;
}

export type ProviderCatalogStatus =
  | 'provider-api'
  | 'stale-provider-api'
  | 'unavailable';

export interface ProviderCatalogResult {
  models: DiscoveredProviderModel[];
  status: ProviderCatalogStatus;
  updatedAt?: string;
  error?: string;
}

export interface OllamaProviderModel {
  id: string;
  name: string;
  cost: '$' | '$$';
  speed: 'fast' | 'medium';
  source: 'local' | 'cloud';
  sizeMB?: number;
}

/** Ollama cloud aliases are reachable through Ollama, but are not offline models. */
export function isRemoteOllamaAlias(name: string, remoteHost?: string): boolean {
  return Boolean(remoteHost?.trim()) || name.trim().toLowerCase().endsWith(':cloud');
}

/**
 * These are provider API locations, not model inventories. The endpoints are
 * deliberately kept separate from the UI so the catalog can grow without a
 * second hardcoded list in the web bundle.
 */
export const PROVIDER_MODEL_CATALOGS: Record<string, ProviderCatalogDefinition> = {
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/models',
    auth: 'anthropic',
    pagination: 'anthropic-cursor',
  },
  openai: { endpoint: 'https://api.openai.com/v1/models', auth: 'bearer' },
  'openai-compatible': { endpoint: '', auth: 'bearer' },
  google: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    auth: 'google-header',
    pagination: 'google-page-token',
  },
  deepseek: { endpoint: 'https://api.deepseek.com/models', auth: 'bearer' },
  xai: { endpoint: 'https://api.x.ai/v1/models', auth: 'bearer' },
  mistral: { endpoint: 'https://api.mistral.ai/v1/models', auth: 'bearer' },
  alibaba: { endpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models', auth: 'bearer' },
  minimax: { endpoint: 'https://api.minimax.io/v1/models', auth: 'bearer' },
  zhipu: { endpoint: 'https://open.bigmodel.cn/api/paas/v4/models', auth: 'bearer' },
  moonshot: { endpoint: 'https://api.moonshot.ai/v1/models', auth: 'bearer' },
  perplexity: { endpoint: 'https://api.perplexity.ai/v1/models', auth: 'bearer' },
  openrouter: { endpoint: 'https://openrouter.ai/api/v1/models', auth: 'bearer' },
};

interface RawModel {
  id?: unknown;
  name?: unknown;
  display_name?: unknown;
  displayName?: unknown;
  owned_by?: unknown;
  ownedBy?: unknown;
}

export interface DiscoveryOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}

interface CachedCatalog {
  models: DiscoveredProviderModel[];
  updatedAt: string;
}

const cache = new Map<string, CachedCatalog>();
const pending = new Map<string, Promise<ProviderCatalogResult>>();

function hashKey(key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = ((hash << 5) - hash + key.charCodeAt(index)) | 0;
  }
  return String(hash);
}

function cacheKey(providerId: string, apiKey: string, baseUrl?: string): string {
  return `${providerId}:${hashKey(apiKey)}:${baseUrl ?? ''}`;
}

function catalogEndpoint(definition: ProviderCatalogDefinition, baseUrl?: string): string {
  if (!baseUrl?.trim()) return definition.endpoint;
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  return normalized.endsWith('/models') ? normalized : `${normalized}/models`;
}

function asRawModels(body: unknown): RawModel[] {
  if (Array.isArray(body)) return body as RawModel[];
  if (!body || typeof body !== 'object') return [];
  const record = body as { data?: unknown; models?: unknown };
  if (Array.isArray(record.data)) return record.data as RawModel[];
  if (Array.isArray(record.models)) return record.models as RawModel[];
  return [];
}

function normalizeModelId(providerId: string, rawId: string): string {
  const id = providerId === 'google' ? rawId.replace(/^models\//, '') : rawId;
  return `${providerId}/${id}`;
}

function normalizeModels(providerId: string, body: unknown): DiscoveredProviderModel[] {
  const seen = new Set<string>();
  const models: DiscoveredProviderModel[] = [];
  for (const raw of asRawModels(body)) {
    const rawId = typeof raw.id === 'string'
      ? raw.id.trim()
      : typeof raw.name === 'string'
        ? raw.name.trim()
        : '';
    if (!rawId) continue;
    const id = normalizeModelId(providerId, rawId);
    if (seen.has(id)) continue;
    seen.add(id);
    const cleanId = id.slice(providerId.length + 1);
    const displayName = [raw.display_name, raw.displayName, raw.name]
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
      ?.replace(/^models\//, '')
      .trim() ?? cleanId;
    const ownedBy = typeof raw.owned_by === 'string'
      ? raw.owned_by
      : typeof raw.ownedBy === 'string'
        ? raw.ownedBy
        : undefined;
    models.push({
      id,
      name: displayName,
      cost: '$$',
      speed: 'medium',
      source: 'provider-api',
      ...(ownedBy ? { ownedBy } : {}),
    });
  }
  return models;
}

function requestFor(
  definition: ProviderCatalogDefinition,
  endpoint: string,
  apiKey: string,
): { url: string; init: RequestInit } {
  if (definition.auth === 'google-header') {
    return { url: endpoint, init: { headers: { 'x-goog-api-key': apiKey } } };
  }
  if (definition.auth === 'anthropic') {
    return {
      url: endpoint,
      init: {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      },
    };
  }
  return apiKey
    ? { url: endpoint, init: { headers: { Authorization: `Bearer ${apiKey}` } } }
    : { url: endpoint, init: {} };
}

function firstPageUrl(definition: ProviderCatalogDefinition, endpoint: string): string {
  if (!definition.pagination) return endpoint;
  const url = new URL(endpoint);
  if (definition.pagination === 'anthropic-cursor') url.searchParams.set('limit', '1000');
  if (definition.pagination === 'google-page-token') url.searchParams.set('pageSize', '1000');
  return url.toString();
}

function nextPageUrl(
  definition: ProviderCatalogDefinition,
  currentUrl: string,
  body: unknown,
): string | null {
  if (!body || typeof body !== 'object') return null;
  const page = body as { has_more?: unknown; last_id?: unknown; nextPageToken?: unknown };
  const url = new URL(currentUrl);

  if (definition.pagination === 'anthropic-cursor') {
    if (page.has_more !== true || typeof page.last_id !== 'string' || !page.last_id) return null;
    url.searchParams.set('after_id', page.last_id);
    return url.toString();
  }
  if (definition.pagination === 'google-page-token') {
    if (typeof page.nextPageToken !== 'string' || !page.nextPageToken) return null;
    url.searchParams.set('pageToken', page.nextPageToken);
    return url.toString();
  }
  return null;
}

async function fetchCatalog(
  providerId: string,
  apiKey: string,
  baseUrl: string | undefined,
  options: DiscoveryOptions,
): Promise<ProviderCatalogResult> {
  const definition = PROVIDER_MODEL_CATALOGS[providerId];
  if (!definition) return { models: [], status: 'unavailable', error: 'Provider does not expose model discovery.' };
  if (!baseUrl?.trim() && !definition.endpoint) {
    return { models: [], status: 'unavailable', error: 'Provider requires a model catalog base URL.' };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = catalogEndpoint(definition, baseUrl);
  let pageUrl: string | null = firstPageUrl(definition, endpoint);
  const cursors = new Set<string>();
  const rawModels: RawModel[] = [];

  while (pageUrl) {
    if (cursors.has(pageUrl)) throw new Error('Provider model catalog repeated a pagination cursor');
    cursors.add(pageUrl);
    const request = requestFor(definition, pageUrl, apiKey);
    const response = await fetchImpl(request.url, {
      ...request.init,
      signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
      ...(baseUrl?.trim() ? { redirect: 'error' as const } : {}),
    });
    if (!response.ok) throw new Error(`Provider model catalog returned HTTP ${response.status}`);
    const body = await response.json();
    rawModels.push(...asRawModels(body));
    pageUrl = nextPageUrl(definition, request.url, body);
  }

  const models = normalizeModels(providerId, rawModels);
  const updatedAt = new Date((options.now ?? Date.now)()).toISOString();
  return { models, status: 'provider-api', updatedAt };
}

/** Discover a provider catalog, retaining a last-known list through outages. */
export async function discoverProviderModels(
  providerId: string,
  apiKey: string,
  baseUrl?: string,
  options: DiscoveryOptions = {},
): Promise<ProviderCatalogResult> {
  const key = cacheKey(providerId, apiKey, baseUrl);
  const current = pending.get(key);
  if (current) return current;

  const request = fetchCatalog(providerId, apiKey, baseUrl, options)
    .then((result) => {
      cache.set(key, { models: result.models, updatedAt: result.updatedAt! });
      return result;
    })
    .catch((error: unknown) => {
      const stale = cache.get(key);
      const message = error instanceof Error ? error.message : 'Provider model discovery failed';
      return stale
        ? { models: stale.models, status: 'stale-provider-api' as const, updatedAt: stale.updatedAt, error: message }
        : { models: [], status: 'unavailable' as const, error: message };
    })
    .finally(() => { pending.delete(key); });
  pending.set(key, request);
  return request;
}

/** Test seam for catalog refresh and outage tests. */
export function clearProviderModelCache(): void {
  cache.clear();
  pending.clear();
}

/** Discover locally installed Ollama models without treating them as cloud keys. */
export async function fetchOllamaModels(): Promise<{ models: OllamaProviderModel[]; reachable: boolean }> {
  const endpoint = process.env.OLLAMA_HOST?.replace(/\/+$/, '') ?? 'http://localhost:11434';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`${endpoint}/api/tags`, { signal: controller.signal });
    if (!response.ok) return { models: [], reachable: false };
    const body = await response.json() as {
      models?: Array<{ name: string; size?: number; remote_host?: string }>;
    };
    const models = (body.models ?? []).map((model): OllamaProviderModel => {
      const cloud = isRemoteOllamaAlias(model.name, model.remote_host);
      const sizeMB = cloud ? 0 : Math.round((model.size ?? 0) / 1024 / 1024);
      return {
        id: `ollama/${model.name}`,
        name: model.name,
        cost: cloud ? '$$' : '$',
        speed: cloud ? 'medium' : 'fast',
        source: cloud ? 'cloud' : 'local',
        ...(sizeMB > 0 ? { sizeMB } : {}),
      };
    });
    return { models, reachable: true };
  } catch {
    return { models: [], reachable: false };
  } finally {
    clearTimeout(timeout);
  }
}
