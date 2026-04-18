/**
 * H-31 Tier Enforcement Matrix.
 *
 * Asserts that every gated route enforces its minimum tier per `tiers.ts`.
 * Matrix = every gated endpoint × every tier ∈ { FREE, PRO, TEAMS, ENTERPRISE, TRIAL }.
 *
 * For each cell we compute the expected verdict from TIER_ORDER:
 *   - "allow"  → response must not be 403 TIER_INSUFFICIENT (downstream 4xx/5xx is fine —
 *                we only care the middleware let the request through).
 *   - "deny"   → response must be 403 with `error: 'TIER_INSUFFICIENT'` + correct
 *                `required` / `actual` fields.
 *
 * Also covers the TRIAL-expired → FREE fallback path inside `readTierFromRequest`.
 *
 * If a new gated endpoint is added, extend GATED_ENDPOINTS below. If enforcement
 * is removed from an existing route, that row's "deny" tests will flip to "allow"
 * and fail — which is the intended tripwire.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { TIERS, type Tier } from '@waggle/shared';
import { buildLocalServer } from '../src/local/index.js';
import { authInject } from './test-utils.js';

interface GatedEndpoint {
  method: 'GET' | 'POST';
  url: string;
  minTier: Tier;
  body?: unknown;
}

// Matches TIER_ORDER in @waggle/shared/tiers.ts. TRIAL ranks with ENTERPRISE
// but downgrades to FREE when expired — the fallback is tested separately.
const TIER_ORDER: Record<Tier, number> = {
  FREE: 0, PRO: 1, TEAMS: 2, ENTERPRISE: 3, TRIAL: 3,
};

const GATED_ENDPOINTS: GatedEndpoint[] = [
  // PRO-gated — denies FREE, allows PRO/TEAMS/ENTERPRISE/TRIAL
  { method: 'POST', url: '/api/personas', minTier: 'PRO', body: { name: 'x', systemPrompt: 'y' } },
  { method: 'POST', url: '/api/personas/generate', minTier: 'PRO', body: { prompt: 'x' } },
  { method: 'POST', url: '/api/marketplace/install', minTier: 'PRO', body: { skillId: 'x' } },
  { method: 'POST', url: '/api/marketplace/publish', minTier: 'PRO', body: {} },
  { method: 'POST', url: '/api/stripe/create-portal-session', minTier: 'PRO', body: {} },

  // TEAMS-gated — denies FREE/PRO, allows TEAMS/ENTERPRISE/TRIAL
  { method: 'GET',  url: '/api/cost/by-workspace', minTier: 'TEAMS' },
  { method: 'POST', url: '/api/cloud-sync/toggle', minTier: 'TEAMS', body: { enabled: true } },
  { method: 'GET',  url: '/api/admin/overview', minTier: 'TEAMS' },
  { method: 'GET',  url: '/api/admin/audit-export', minTier: 'TEAMS' },
  { method: 'POST', url: '/api/team/connect', minTier: 'TEAMS', body: { serverUrl: 'http://x', token: 'y' } },

  // ENTERPRISE-gated — denies FREE/PRO/TEAMS, allows ENTERPRISE/TRIAL
  { method: 'GET',  url: '/api/marketplace/enterprise-packs', minTier: 'ENTERPRISE' },
  { method: 'GET',  url: '/api/team/governance/permissions?workspaceId=default', minTier: 'ENTERPRISE' },
];

function writeTier(dataDir: string, tier: Tier, trialStartedAt: string | null = null): void {
  const configPath = path.join(dataDir, 'config.json');
  const existing = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    : {};
  const next = { ...existing, tier, trialStartedAt };
  fs.writeFileSync(configPath, JSON.stringify(next));
}

function parseJsonSafe(raw: string): { error?: string; required?: string; actual?: string } {
  try { return JSON.parse(raw) as { error?: string; required?: string; actual?: string }; }
  catch { return {}; }
}

describe('Tier Enforcement Matrix (H-31)', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-tier-matrix-'));
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    // Windows needs a moment to release file handles.
    await new Promise(r => setTimeout(r, 100));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on win32 — ignore */ }
  });

  for (const tier of TIERS) {
    describe(`tier = ${tier}`, () => {
      beforeAll(() => {
        // Fresh TRIAL for the TRIAL row; other tiers don't need a trialStartedAt.
        const trialStart = tier === 'TRIAL' ? new Date().toISOString() : null;
        writeTier(tmpDir, tier, trialStart);
      });

      for (const ep of GATED_ENDPOINTS) {
        const shouldAllow = TIER_ORDER[tier] >= TIER_ORDER[ep.minTier];
        const verb = shouldAllow ? 'allows' : 'denies';
        it(`${verb} ${ep.method} ${ep.url} (requires ${ep.minTier})`, async () => {
          const res = await server.inject(authInject(server, {
            method: ep.method,
            url: ep.url,
            payload: ep.body,
          }));

          const body = parseJsonSafe(res.body);

          if (shouldAllow) {
            // Tier gate passed. Downstream 4xx/5xx is acceptable — we only
            // guard against the middleware wrongly blocking.
            expect(res.statusCode).not.toBe(403);
            expect(body.error).not.toBe('TIER_INSUFFICIENT');
          } else {
            expect(res.statusCode).toBe(403);
            expect(body.error).toBe('TIER_INSUFFICIENT');
            expect(body.required).toBe(ep.minTier);
            expect(body.actual).toBe(tier);
          }
        });
      }
    });
  }

  describe('TRIAL expiry fallback (getEffectiveTier)', () => {
    it('expired TRIAL is treated as FREE — denies PRO endpoint', async () => {
      const sixteenDaysAgo = new Date(Date.now() - 16 * 24 * 3600 * 1000).toISOString();
      writeTier(tmpDir, 'TRIAL', sixteenDaysAgo);

      const res = await server.inject(authInject(server, {
        method: 'POST',
        url: '/api/personas',
        payload: { name: 'x', systemPrompt: 'y' },
      }));

      expect(res.statusCode).toBe(403);
      const body = parseJsonSafe(res.body);
      expect(body.error).toBe('TIER_INSUFFICIENT');
      expect(body.actual).toBe('FREE');
    });

    it('fresh TRIAL allows an ENTERPRISE endpoint', async () => {
      writeTier(tmpDir, 'TRIAL', new Date().toISOString());
      const res = await server.inject(authInject(server, {
        method: 'GET',
        url: '/api/marketplace/enterprise-packs',
      }));
      expect(res.statusCode).not.toBe(403);
    });

    it('TRIAL with null trialStartedAt is treated as FREE', async () => {
      writeTier(tmpDir, 'TRIAL', null);
      const res = await server.inject(authInject(server, {
        method: 'POST',
        url: '/api/personas',
        payload: { name: 'x', systemPrompt: 'y' },
      }));
      expect(res.statusCode).toBe(403);
      const body = parseJsonSafe(res.body);
      expect(body.error).toBe('TIER_INSUFFICIENT');
      expect(body.actual).toBe('FREE');
    });
  });

  describe('403 error shape contract', () => {
    it('denial response includes upgradeUrl for UI linking', async () => {
      writeTier(tmpDir, 'FREE');
      const res = await server.inject(authInject(server, {
        method: 'POST',
        url: '/api/personas',
        payload: { name: 'x', systemPrompt: 'y' },
      }));
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body) as Record<string, unknown>;
      expect(body.upgradeUrl).toBe('https://waggle-os.ai/upgrade');
      expect(body.message).toMatch(/requires the PRO tier/);
    });
  });
});
