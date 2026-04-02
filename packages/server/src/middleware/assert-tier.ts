/**
 * Tier enforcement middleware for Fastify routes.
 *
 * Usage:
 *   server.post('/api/personas', { preHandler: [requireTier('BASIC')] }, handler)
 *
 * Reads the current tier from config.json (same source as GET /api/tier).
 * Returns 403 with structured error when tier is insufficient.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { type Tier, assertTierCapability, TierError, parseTier } from '@waggle/shared';

/**
 * Read the current tier from the server's data directory.
 * Uses the same config.json source as the GET /api/tier route in settings.ts.
 */
export function readTierFromRequest(request: FastifyRequest): Tier {
  try {
    const dataDir = (request.server as any).localConfig?.dataDir;
    if (!dataDir) return 'SOLO';
    const configPath = path.join(dataDir, 'config.json');
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const parsed = parseTier(String(raw.tier ?? ''));
      if (parsed) return parsed;
    }
  } catch { /* default to SOLO */ }
  return 'SOLO';
}

/**
 * Fastify preHandler that enforces a minimum tier.
 * Returns 403 TIER_INSUFFICIENT if the current tier is below the required level.
 */
export function requireTier(minimumTier: Tier) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const userTier = readTierFromRequest(request);
    try {
      assertTierCapability(userTier, minimumTier);
    } catch (e) {
      if (e instanceof TierError) {
        return void reply.code(403).send({
          error: 'TIER_INSUFFICIENT',
          message: `This feature requires the ${e.required} tier. You are on ${e.actual}.`,
          required: e.required,
          actual: e.actual,
          upgradeUrl: 'https://waggle-os.ai/upgrade',
        });
      }
      throw e;
    }
  };
}
