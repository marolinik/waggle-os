/**
 * EmbeddingProvider — orchestrates the InProcess → Ollama → API → Mock fallback chain.
 * Single entry point for all embedding operations in Waggle.
 * Implements the Embedder interface — drop-in replacement everywhere.
 *
 * Tier enforcement: provider selection is gated by TIER_CAPABILITIES.embeddingProviders.
 * Quota enforcement: monthly embed count tracked in embedding_usage table.
 */

import type { Embedder } from './embeddings.js';
import type { Database as DatabaseType } from 'better-sqlite3';
import { type Tier, TIERS, TIER_CAPABILITIES, TierError } from '@waggle/shared';
import { createCoreLogger } from '../logger.js';

const log = createCoreLogger('embedding');

export type EmbeddingProviderType = 'inprocess' | 'ollama' | 'voyage' | 'openai' | 'litellm' | 'mock';

export interface EmbeddingProviderConfig {
  provider?: EmbeddingProviderType | 'auto';
  targetDimensions?: number;
  /** User tier — gates which providers are available and monthly quota. Defaults to SOLO. */
  userTier?: Tier;
  /** User ID for quota tracking. Defaults to 'local'. */
  userId?: string;
  /** Raw SQLite database for quota tracking. Optional — quota not enforced without it. */
  quotaDb?: DatabaseType;
  inprocess?: { model?: string; cacheDir?: string };
  ollama?: { baseUrl?: string; model?: string };
  voyage?: { apiKey: string; model?: string };
  openai?: { apiKey: string; model?: string };
  litellm?: { url: string; apiKey?: string; model?: string };
}

// ── Tier enforcement helpers ──────────────────────────────────────────

/** Find the lowest tier that allows a given embedding provider. */
export function getMinimumTierForProvider(provider: EmbeddingProviderType): Tier {
  for (const tier of TIERS) {
    const allowed = TIER_CAPABILITIES[tier].embeddingProviders as readonly string[];
    if (allowed.includes(provider)) return tier;
  }
  return 'ENTERPRISE';
}

// ── Quota tracking ────────────────────────────────────────────────────

const EMBEDDING_USAGE_SCHEMA = `
CREATE TABLE IF NOT EXISTS embedding_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  year_month TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, year_month)
);
`;

function ensureQuotaTable(db: DatabaseType): void {
  try { db.exec(EMBEDDING_USAGE_SCHEMA); } catch { /* table may already exist */ }
}

function getCurrentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getUsageCount(db: DatabaseType, userId: string, yearMonth: string): number {
  const row = db.prepare(
    'SELECT count FROM embedding_usage WHERE user_id = ? AND year_month = ?'
  ).get(userId, yearMonth) as { count: number } | undefined;
  return row?.count ?? 0;
}

function incrementUsage(db: DatabaseType, userId: string, yearMonth: string, amount: number): void {
  db.prepare(`
    INSERT INTO embedding_usage (user_id, year_month, count, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, year_month) DO UPDATE SET count = count + ?, updated_at = ?
  `).run(userId, yearMonth, amount, Date.now(), amount, Date.now());
}

export class EmbeddingQuotaExceededError extends Error {
  public readonly tier: Tier;
  public readonly quota: number;
  public readonly current: number;
  public readonly upgradeUrl = 'https://waggle-os.ai/upgrade';

  constructor(tier: Tier, quota: number, current: number) {
    super(`Embedding quota exceeded: ${current}/${quota} for ${tier} tier`);
    this.name = 'EmbeddingQuotaExceededError';
    this.tier = tier;
    this.quota = quota;
    this.current = current;
  }
}

export interface EmbeddingQuotaStatus {
  tier: Tier;
  quota: number;
  used: number;
  remaining: number;
  percentage: number;
  resetsAt: string;
}

function getNextMonthReset(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export interface EmbeddingProviderStatus {
  activeProvider: EmbeddingProviderType;
  availableProviders: EmbeddingProviderType[];
  dimensions: number;
  modelName: string;
  lastError?: string;
  probeTimestamp: string;
}

export interface EmbeddingProviderInstance extends Embedder {
  getStatus(): EmbeddingProviderStatus;
  getActiveProvider(): EmbeddingProviderType;
  reprobe(): Promise<EmbeddingProviderStatus>;
  /** Get current quota status for the user. Returns unlimited values if no quotaDb configured. */
  getQuotaStatus(): EmbeddingQuotaStatus;
}

/** Deterministic mock — last resort, semantically meaningless. */
function mockEmbed(text: string, dims: number): Float32Array {
  const arr = new Float32Array(dims);
  const bytes = new TextEncoder().encode(text);
  for (let i = 0; i < Math.min(bytes.length, dims); i++) {
    arr[i] = (bytes[i] - 128) / 128;
  }
  return arr;
}

function createMockEmbedder(dims: number): Embedder {
  return {
    dimensions: dims,
    async embed(text: string) { return mockEmbed(text, dims); },
    async embedBatch(texts: string[]) { return texts.map(t => mockEmbed(t, dims)); },
  };
}

interface ProbeResult {
  type: EmbeddingProviderType;
  embedder: Embedder;
  modelName: string;
}

async function probeProvider(
  type: EmbeddingProviderType,
  config: EmbeddingProviderConfig,
): Promise<ProbeResult | null> {
  const dims = config.targetDimensions ?? 1024;

  try {
    switch (type) {
      case 'inprocess': {
        const { createInProcessEmbedder } = await import('./inprocess-embedder.js');
        const embedder = await createInProcessEmbedder({
          model: config.inprocess?.model,
          cacheDir: config.inprocess?.cacheDir,
          targetDimensions: dims,
        });
        const test = await embedder.embed('waggle embedding probe');
        if (test.length !== dims) throw new Error(`Unexpected dims: ${test.length}`);
        return { type: 'inprocess', embedder, modelName: config.inprocess?.model ?? 'Xenova/all-MiniLM-L6-v2' };
      }

      case 'ollama': {
        const { createOllamaEmbedder } = await import('./ollama-embedder.js');
        const embedder = createOllamaEmbedder({
          baseUrl: config.ollama?.baseUrl,
          model: config.ollama?.model,
          targetDimensions: dims,
        });
        const test = await embedder.embed('waggle embedding probe');
        if (test.length !== dims) throw new Error(`Unexpected dims: ${test.length}`);
        return { type: 'ollama', embedder, modelName: config.ollama?.model ?? 'nomic-embed-text' };
      }

      case 'voyage': {
        if (!config.voyage?.apiKey) return null;
        const { createApiEmbedder } = await import('./api-embedder.js');
        const embedder = createApiEmbedder({
          provider: 'voyage',
          apiKey: config.voyage.apiKey,
          model: config.voyage.model,
          targetDimensions: dims,
        });
        const test = await embedder.embed('waggle embedding probe');
        if (test.length !== dims) throw new Error(`Unexpected dims: ${test.length}`);
        return { type: 'voyage', embedder, modelName: config.voyage.model ?? 'voyage-3-lite' };
      }

      case 'openai': {
        if (!config.openai?.apiKey) return null;
        const { createApiEmbedder } = await import('./api-embedder.js');
        const embedder = createApiEmbedder({
          provider: 'openai',
          apiKey: config.openai.apiKey,
          model: config.openai.model,
          targetDimensions: dims,
        });
        const test = await embedder.embed('waggle embedding probe');
        if (test.length !== dims) throw new Error(`Unexpected dims: ${test.length}`);
        return { type: 'openai', embedder, modelName: config.openai.model ?? 'text-embedding-3-small' };
      }

      case 'litellm': {
        if (!config.litellm?.url) return null;
        const { createLiteLLMEmbedder } = await import('./litellm-embedder.js');
        const embedder = createLiteLLMEmbedder({
          litellmUrl: config.litellm.url,
          litellmApiKey: config.litellm.apiKey,
          model: config.litellm.model ?? 'text-embedding',
          dimensions: dims,
          fallbackToMock: false,
        });
        const test = await embedder.embed('waggle embedding probe');
        if (test.length !== dims) throw new Error(`Unexpected dims: ${test.length}`);
        return { type: 'litellm', embedder, modelName: config.litellm.model ?? 'text-embedding' };
      }

      default:
        return null;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.info(`Trying ${type}... FAILED (${msg})`);
    return null;
  }
}

export async function createEmbeddingProvider(config?: EmbeddingProviderConfig): Promise<EmbeddingProviderInstance> {
  const cfg: EmbeddingProviderConfig = { provider: 'auto', targetDimensions: 1024, ...config };
  const dims = cfg.targetDimensions ?? 1024;
  const userTier: Tier = cfg.userTier ?? 'FREE';
  const userId = cfg.userId ?? 'local';
  const quotaDb = cfg.quotaDb ?? null;
  const tierEnforced = cfg.userTier !== undefined; // Only enforce tier when explicitly set
  const tierCaps = TIER_CAPABILITIES[userTier];
  const allowedProviders = tierCaps.embeddingProviders as readonly string[];

  // Initialize quota table if DB provided
  if (quotaDb) {
    ensureQuotaTable(quotaDb);
  }

  let activeResult: ProbeResult | null = null;
  let activeEmbedder: Embedder;
  let activeType: EmbeddingProviderType = 'mock';
  let activeModelName = 'deterministic-mock';
  let lastError: string | undefined;
  let availableProviders: EmbeddingProviderType[] = [];
  let probeTimestamp = new Date().toISOString();

  /** Check quota before embedding. Throws if exceeded. Warns at 80%. */
  function checkQuota(count: number): void {
    if (!quotaDb || !tierEnforced) return;
    const quota = tierCaps.embeddingQuotaPerMonth;
    if (quota === -1) return; // unlimited
    const ym = getCurrentYearMonth();
    const used = getUsageCount(quotaDb, userId, ym);
    if (used + count > quota) {
      throw new EmbeddingQuotaExceededError(userTier, quota, used);
    }
    if (used + count >= quota * 0.8) {
      log.warn(`Embedding quota warning: ${used + count}/${quota} (${Math.round(((used + count) / quota) * 100)}%) for ${userTier} tier`);
    }
  }

  /** Record usage after successful embedding. */
  function recordUsage(count: number): void {
    if (!quotaDb) return;
    incrementUsage(quotaDb, userId, getCurrentYearMonth(), count);
  }

  async function runProbe(): Promise<void> {
    log.info('Probing embedding providers...');
    const available: EmbeddingProviderType[] = [];
    activeResult = null;
    probeTimestamp = new Date().toISOString();

    const requestedProvider = cfg.provider ?? 'auto';

    if (requestedProvider !== 'auto' && requestedProvider !== 'mock') {
      // Explicit provider — tier-check only when tier is explicitly configured
      if (tierEnforced && !allowedProviders.includes(requestedProvider)) {
        const required = getMinimumTierForProvider(requestedProvider);
        throw new TierError(required, userTier);
      }
      log.info(`Trying ${requestedProvider}...`);
      const result = await probeProvider(requestedProvider, cfg);
      if (result) {
        activeResult = result;
        available.push(result.type);
        log.info(`Trying ${requestedProvider}... OK`);
      }
    } else if (requestedProvider === 'auto') {
      // Auto: iterate chain, skip providers not allowed by tier
      const chain: EmbeddingProviderType[] = ['inprocess', 'ollama', 'voyage', 'openai'];

      for (const providerType of chain) {
        // Tier gate — skip providers not allowed (only when tier is explicitly configured)
        if (tierEnforced && !allowedProviders.includes(providerType)) {
          log.info(`Skipping ${providerType} (not available on ${userTier} tier)`);
          continue;
        }
        // Skip API providers without keys
        if (providerType === 'voyage' && !cfg.voyage?.apiKey) {
          log.info('Skipping voyage (no API key in Vault)');
          continue;
        }
        if (providerType === 'openai' && !cfg.openai?.apiKey) {
          log.info('Skipping openai (no API key in Vault)');
          continue;
        }

        log.info(`Trying ${providerType}...`);
        const result = await probeProvider(providerType, cfg);
        if (result) {
          available.push(result.type);
          log.info(`Trying ${providerType}... OK`);
          if (!activeResult) {
            activeResult = result;
          }
        }
      }
    }

    available.push('mock'); // Always available
    availableProviders = available;

    if (activeResult) {
      activeEmbedder = activeResult.embedder;
      activeType = activeResult.type;
      activeModelName = activeResult.modelName;
      lastError = undefined;
      log.info(`Embedding provider: ${activeType} (${activeModelName}, ${dims} dims)`);
    } else {
      activeEmbedder = createMockEmbedder(dims);
      activeType = 'mock';
      activeModelName = 'deterministic-mock';
      lastError = 'No real providers available';
      log.info('Embedding provider: mock (no real providers available — semantic search quality degraded)');
    }
  }

  // Initial probe
  try {
    await runProbe();
  } catch (err) {
    // Re-throw tier errors — these are intentional enforcement, not probe failures
    if (err instanceof TierError) throw err;
    lastError = err instanceof Error ? err.message : String(err);
    activeEmbedder = createMockEmbedder(dims);
    activeType = 'mock';
    activeModelName = 'deterministic-mock';
    availableProviders = ['mock'];
  }

  // Ensure activeEmbedder is assigned (TypeScript flow)
  activeEmbedder ??= createMockEmbedder(dims);

  const instance: EmbeddingProviderInstance = {
    dimensions: dims,

    async embed(text: string): Promise<Float32Array> {
      checkQuota(1);
      try {
        const result = await activeEmbedder.embed(text);
        recordUsage(1);
        return result;
      } catch (err) {
        if (err instanceof EmbeddingQuotaExceededError) throw err;
        log.warn(`Embedding failed with ${activeType}, falling back to mock: ${(err as Error).message}`);
        lastError = (err as Error).message;
        const fallback = mockEmbed(text, dims);
        recordUsage(1);
        return fallback;
      }
    },

    async embedBatch(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];
      checkQuota(texts.length);
      try {
        const result = await activeEmbedder.embedBatch(texts);
        recordUsage(texts.length);
        return result;
      } catch (err) {
        if (err instanceof EmbeddingQuotaExceededError) throw err;
        log.warn(`Batch embedding failed with ${activeType}, falling back to mock: ${(err as Error).message}`);
        lastError = (err as Error).message;
        const fallback = texts.map(t => mockEmbed(t, dims));
        recordUsage(texts.length);
        return fallback;
      }
    },

    getStatus(): EmbeddingProviderStatus {
      return {
        activeProvider: activeType,
        availableProviders,
        dimensions: dims,
        modelName: activeModelName,
        lastError,
        probeTimestamp,
      };
    },

    getActiveProvider(): EmbeddingProviderType {
      return activeType;
    },

    async reprobe(): Promise<EmbeddingProviderStatus> {
      await runProbe();
      return instance.getStatus();
    },

    getQuotaStatus(): EmbeddingQuotaStatus {
      const quota = tierCaps.embeddingQuotaPerMonth;
      if (!quotaDb || quota === -1) {
        return { tier: userTier, quota: -1, used: 0, remaining: -1, percentage: 0, resetsAt: getNextMonthReset() };
      }
      const used = getUsageCount(quotaDb, userId, getCurrentYearMonth());
      return {
        tier: userTier,
        quota,
        used,
        remaining: Math.max(0, quota - used),
        percentage: Math.round((used / quota) * 100),
        resetsAt: getNextMonthReset(),
      };
    },
  };

  return instance;
}
