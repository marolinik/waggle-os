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
    it('creates config.json and sets tier to BASIC on checkout complete', () => {
      updateUserTier(tmpDir, 'BASIC');

      const configPath = path.join(tmpDir, 'config.json');
      expect(fs.existsSync(configPath)).toBe(true);

      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(raw.tier).toBe('BASIC');
    });

    it('updates existing config.json without losing other fields', () => {
      const configPath = path.join(tmpDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ theme: 'dark', tier: 'SOLO' }));

      updateUserTier(tmpDir, 'TEAMS');

      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(raw.tier).toBe('TEAMS');
      expect(raw.theme).toBe('dark');
    });

    it('downgrades tier to SOLO on subscription deleted', () => {
      const configPath = path.join(tmpDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify({ tier: 'TEAMS' }));

      updateUserTier(tmpDir, 'SOLO');

      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(raw.tier).toBe('SOLO');
    });

    it('handles missing config.json gracefully', () => {
      // No config.json exists — should create one
      expect(() => updateUserTier(tmpDir, 'ENTERPRISE')).not.toThrow();

      const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8'));
      expect(raw.tier).toBe('ENTERPRISE');
    });
  });

  describe('tierFromPriceId', () => {
    it('returns null when no env vars are set', () => {
      delete process.env['STRIPE_PRICE_BASIC'];
      delete process.env['STRIPE_PRICE_TEAMS'];

      expect(tierFromPriceId('price_abc123')).toBeNull();
    });

    it('maps BASIC price ID correctly', () => {
      process.env['STRIPE_PRICE_BASIC'] = 'price_basic_test';
      expect(tierFromPriceId('price_basic_test')).toBe('BASIC');
      delete process.env['STRIPE_PRICE_BASIC'];
    });

    it('maps TEAMS price ID correctly', () => {
      process.env['STRIPE_PRICE_TEAMS'] = 'price_teams_test';
      expect(tierFromPriceId('price_teams_test')).toBe('TEAMS');
      delete process.env['STRIPE_PRICE_TEAMS'];
    });

    it('returns null for unknown price ID', () => {
      process.env['STRIPE_PRICE_BASIC'] = 'price_basic_test';
      process.env['STRIPE_PRICE_TEAMS'] = 'price_teams_test';

      expect(tierFromPriceId('price_unknown')).toBeNull();

      delete process.env['STRIPE_PRICE_BASIC'];
      delete process.env['STRIPE_PRICE_TEAMS'];
    });
  });

  describe('tier round-trip via parseTier', () => {
    it('tier written by updateUserTier is readable via parseTier', () => {
      updateUserTier(tmpDir, 'BASIC');

      const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, 'config.json'), 'utf-8'));
      const parsed = parseTier(String(raw.tier));
      expect(parsed).toBe('BASIC');
    });
  });
});
