/**
 * Embedding provider routing — the WRITE side of the embedding router (steal #10).
 *
 * The read side (`GET /api/embedding/status`) and reprobe
 * (`POST /api/embedding/reprobe`) live inline in local/index.ts, where they have
 * closure access to the boot-time embedding config. This plugin owns
 * `POST /api/embedding/provider`: validate → tier-gate → persist the choice.
 *
 * Hot-swap note: the live embedder is created once at boot and threaded BY
 * REFERENCE into the Orchestrator, mind search, and the vector-backfill path.
 * There is no runtime seam to replace it in place — the Orchestrator holds the
 * embedder and hive-mind-core (which owns the provider factory) is read-only
 * from here. So a provider change is PERSISTED to config.json and takes effect
 * on the next restart. The response carries `restartRequired` so the UI can say
 * so honestly rather than pretending the switch is live.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { WaggleConfig, getMinimumTierForProvider, type EmbeddingProviderType } from '@waggle/core';
import { TIER_CAPABILITIES, parseTier, getEffectiveTier, type Tier } from '@waggle/shared';
import { validateBody } from '../../validate-body.js';

/**
 * Providers a user may select: every real provider + 'auto'. 'mock' is a
 * deterministic last-resort internal fallback (semantically meaningless) and is
 * never user-selectable — a bad body naming it 400s via the schema below.
 */
const SELECTABLE_PROVIDERS = ['auto', 'inprocess', 'ollama', 'voyage', 'openai', 'litellm'] as const;
type SelectableProvider = (typeof SELECTABLE_PROVIDERS)[number];

const setProviderSchema = z.object({
  provider: z.enum(SELECTABLE_PROVIDERS),
});

/** Effective tier from config.json (mirrors settings.ts readTierConfig + trial resolution). */
function readEffectiveTier(dataDir: string): Tier {
  try {
    const configPath = path.join(dataDir, 'config.json');
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const parsed = parseTier(String(raw.tier ?? '')) ?? 'FREE';
      return getEffectiveTier(parsed, raw.trialStartedAt ?? null);
    }
  } catch { /* fall through to FREE */ }
  return 'FREE';
}

/** True when EMBEDDING_PROVIDER env var is set — it wins over the persisted choice. */
function envOverrideProvider(): string | null {
  const v = process.env.EMBEDDING_PROVIDER?.trim();
  return v ? v : null;
}

/**
 * The persisted embedding provider from config.json only — ignores the
 * `EMBEDDING_PROVIDER` env override (unlike WaggleConfig.getEmbeddingConfig,
 * which folds env in). Reads the raw file so the picker shows what the user
 * actually chose, separately from whatever the environment forces at runtime.
 */
function readConfiguredProvider(dataDir: string): SelectableProvider {
  try {
    const configPath = path.join(dataDir, 'config.json');
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const p = raw?.embedding?.provider;
      if (typeof p === 'string' && (SELECTABLE_PROVIDERS as readonly string[]).includes(p)) {
        return p as SelectableProvider;
      }
    }
  } catch { /* fall through to auto */ }
  return 'auto';
}

/**
 * Enriched status payload: the live provider status (what is actually running)
 * plus `configuredProvider` (what the user persisted) and `envOverride` (whether
 * an env var is forcing the runtime). The picker shows the configured value; the
 * badge shows the active one; when they differ the UI flags it.
 */
export function buildEmbeddingStatusPayload(server: FastifyInstance) {
  const status = server.embeddingProvider.getStatus();
  const configuredProvider = readConfiguredProvider(server.localConfig.dataDir);
  return { ...status, configuredProvider, envOverride: envOverrideProvider() !== null };
}

export const embeddingRoutes: FastifyPluginAsync = async (server) => {
  server.post<{ Body: { provider: SelectableProvider } }>(
    '/api/embedding/provider',
    { preHandler: validateBody(setProviderSchema) },
    async (request, reply) => {
      const { provider } = request.body;

      // Env override wins — refuse to persist a choice the runtime would ignore.
      const envForced = envOverrideProvider();
      if (envForced) {
        return reply.status(409).send({
          error: 'EMBEDDING_PROVIDER_ENV_OVERRIDE',
          message: `The EMBEDDING_PROVIDER environment variable is set (${envForced}) and overrides this setting. Unset it to choose a provider here.`,
          ...buildEmbeddingStatusPayload(server),
        });
      }

      // Tier gate — 'auto' is always allowed; an explicit provider must be in
      // the tier's allowed set (TIER_CAPABILITIES.embeddingProviders).
      if (provider !== 'auto') {
        const tier = readEffectiveTier(server.localConfig.dataDir);
        const allowed = TIER_CAPABILITIES[tier].embeddingProviders as readonly string[];
        if (!allowed.includes(provider)) {
          const requiredTier = getMinimumTierForProvider(provider as EmbeddingProviderType);
          return reply.status(403).send({
            error: 'TIER_REQUIRED',
            message: `The "${provider}" embedding provider requires the ${requiredTier} tier or higher (current: ${tier}).`,
            requiredTier,
            currentTier: tier,
          });
        }
      }

      // Persist (setEmbeddingProvider does not save on its own).
      const config = new WaggleConfig(server.localConfig.dataDir);
      config.setEmbeddingProvider(provider);
      config.save();

      // The live embedder is fixed at boot; switching to an explicit provider
      // that isn't the one currently running needs a restart to take effect.
      // 'auto' is treated as no forced restart — it just re-affirms the default
      // resolution, applied naturally on the next launch.
      const active = server.embeddingProvider.getActiveProvider();
      const restartRequired = provider !== 'auto' && provider !== active;

      return { ...buildEmbeddingStatusPayload(server), restartRequired };
    },
  );
};
