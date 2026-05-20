import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { updateUserTier } from '../../src/stripe/webhook.js';
import { tierFromPriceId } from '../../src/stripe/index.js';
import { parseTier } from '@waggle/shared';

describe('Stripe Webhook — tier update logic', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-stripe-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('updateUserTier', () => {
    it('creates config.json and sets tier to PRO on checkout complete', () => {
      updateUserTier(tmpDir, 'PRO');

      const configPath = path.join(tmpDir, 'config.json');
      expect(fs.existsSync(configPath)).toBe(true);

      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(raw.tier).toBe('PRO');
    });

    it('updates existing config.json without losing other fields', () => {
      const configPath = path.join(tmpDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ theme: 'dark', tier: 'FREE' }));

      updateUserTier(tmpDir, 'TEAMS');

      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(raw.tier).toBe('TEAMS');
      expect(raw.theme).toBe('dark');
    });

    it('downgrades tier to FREE on subscription deleted', () => {
      const configPath = path.join(tmpDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ tier: 'TEAMS' }));

      updateUserTier(tmpDir, 'FREE');

      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(raw.tier).toBe('FREE');
    });

    it('handles missing config.json gracefully', () => {
      // No config.json exists — should create one
      expect(() => updateUserTier(tmpDir, 'ENTERPRISE')).not.toThrow();

      const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8'));
      expect(raw.tier).toBe('ENTERPRISE');
    });
  });

  describe('tierFromPriceId', () => {
    // All Stripe price env vars we touch. Cleared before/after each test so
    // tests are order-independent and don't leak into one another.
    const PRICE_ENV_KEYS = [
      'STRIPE_PRICE_BASIC',
      'STRIPE_PRICE_PRO',
      'STRIPE_PRICE_PRO_MONTHLY',
      'STRIPE_PRICE_PRO_ANNUAL',
      'STRIPE_PRICE_TEAMS',
      'STRIPE_PRICE_TEAMS_MONTHLY',
      'STRIPE_PRICE_TEAMS_ANNUAL',
    ] as const;

    beforeEach(() => {
      for (const k of PRICE_ENV_KEYS) delete process.env[k];
    });

    afterEach(() => {
      for (const k of PRICE_ENV_KEYS) delete process.env[k];
    });

    // ── Legacy single-var contract (back-compat) ────────────────────────

    it('returns null when no env vars are set', () => {
      expect(tierFromPriceId('price_abc123')).toBeNull();
    });

    it('maps legacy BASIC price env to PRO tier', () => {
      // BASIC was renamed to PRO; STRIPE_PRICE_BASIC is kept as a legacy
      // alias that now resolves to the PRO tier (see stripe/index.ts).
      process.env['STRIPE_PRICE_BASIC'] = 'price_basic_test';
      expect(tierFromPriceId('price_basic_test')).toBe('PRO');
    });

    it('maps legacy STRIPE_PRICE_PRO to PRO tier', () => {
      process.env['STRIPE_PRICE_PRO'] = 'price_pro_test';
      expect(tierFromPriceId('price_pro_test')).toBe('PRO');
    });

    it('maps legacy STRIPE_PRICE_TEAMS to TEAMS tier', () => {
      process.env['STRIPE_PRICE_TEAMS'] = 'price_teams_test';
      expect(tierFromPriceId('price_teams_test')).toBe('TEAMS');
    });

    it('returns null for unknown price ID with legacy contract', () => {
      process.env['STRIPE_PRICE_BASIC'] = 'price_basic_test';
      process.env['STRIPE_PRICE_TEAMS'] = 'price_teams_test';
      expect(tierFromPriceId('price_unknown')).toBeNull();
    });

    // ── New 4-var contract (apps/www Next.js port) ──────────────────────

    it('maps STRIPE_PRICE_PRO_MONTHLY to PRO tier', () => {
      process.env['STRIPE_PRICE_PRO_MONTHLY'] = 'price_pro_monthly_test';
      expect(tierFromPriceId('price_pro_monthly_test')).toBe('PRO');
    });

    it('maps STRIPE_PRICE_PRO_ANNUAL to PRO tier', () => {
      process.env['STRIPE_PRICE_PRO_ANNUAL'] = 'price_pro_annual_test';
      expect(tierFromPriceId('price_pro_annual_test')).toBe('PRO');
    });

    it('maps STRIPE_PRICE_TEAMS_MONTHLY to TEAMS tier', () => {
      process.env['STRIPE_PRICE_TEAMS_MONTHLY'] = 'price_teams_monthly_test';
      expect(tierFromPriceId('price_teams_monthly_test')).toBe('TEAMS');
    });

    it('maps STRIPE_PRICE_TEAMS_ANNUAL to TEAMS tier', () => {
      process.env['STRIPE_PRICE_TEAMS_ANNUAL'] = 'price_teams_annual_test';
      expect(tierFromPriceId('price_teams_annual_test')).toBe('TEAMS');
    });

    // ── Coexistence: both contracts active simultaneously ───────────────

    it('resolves correctly when both new + legacy contracts are set with different IDs', () => {
      // apps/www landing config + sidecar legacy config on the same env.
      process.env['STRIPE_PRICE_PRO_MONTHLY'] = 'price_landing_pro_m';
      process.env['STRIPE_PRICE_PRO_ANNUAL']  = 'price_landing_pro_y';
      process.env['STRIPE_PRICE_PRO']         = 'price_sidecar_pro';
      process.env['STRIPE_PRICE_TEAMS_MONTHLY'] = 'price_landing_teams_m';
      process.env['STRIPE_PRICE_TEAMS_ANNUAL']  = 'price_landing_teams_y';
      process.env['STRIPE_PRICE_TEAMS']         = 'price_sidecar_teams';

      // Every configured Pro price → PRO, every configured Teams price → TEAMS.
      expect(tierFromPriceId('price_landing_pro_m')).toBe('PRO');
      expect(tierFromPriceId('price_landing_pro_y')).toBe('PRO');
      expect(tierFromPriceId('price_sidecar_pro')).toBe('PRO');
      expect(tierFromPriceId('price_landing_teams_m')).toBe('TEAMS');
      expect(tierFromPriceId('price_landing_teams_y')).toBe('TEAMS');
      expect(tierFromPriceId('price_sidecar_teams')).toBe('TEAMS');
    });

    it('does not cross-pollute tiers (Teams price does not resolve to PRO)', () => {
      process.env['STRIPE_PRICE_PRO_MONTHLY'] = 'price_pro_m';
      process.env['STRIPE_PRICE_TEAMS_MONTHLY'] = 'price_teams_m';

      expect(tierFromPriceId('price_pro_m')).toBe('PRO');
      expect(tierFromPriceId('price_teams_m')).toBe('TEAMS');
      // And the negative case explicitly:
      expect(tierFromPriceId('price_teams_m')).not.toBe('PRO');
      expect(tierFromPriceId('price_pro_m')).not.toBe('TEAMS');
    });

    it('returns null for unknown price ID when only the 4-var contract is set', () => {
      process.env['STRIPE_PRICE_PRO_MONTHLY'] = 'price_pro_m';
      process.env['STRIPE_PRICE_PRO_ANNUAL']  = 'price_pro_y';
      process.env['STRIPE_PRICE_TEAMS_MONTHLY'] = 'price_teams_m';
      process.env['STRIPE_PRICE_TEAMS_ANNUAL']  = 'price_teams_y';

      expect(tierFromPriceId('price_unknown')).toBeNull();
    });
  });

  describe('tier round-trip via parseTier', () => {
    it('tier written by updateUserTier is readable via parseTier', () => {
      updateUserTier(tmpDir, 'PRO');

      const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8'));
      const parsed = parseTier(String(raw.tier));
      expect(parsed).toBe('PRO');
    });
  });
});
