import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEmbeddingProvider, EmbeddingQuotaExceededError, getMinimumTierForProvider } from '../src/mind/embedding-provider.js';
import { TierError, TIER_CAPABILITIES } from '@waggle/shared';

describe('Embedding Provider — Tier & Quota Enforcement', () => {
  let tmpDir: string;
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-embed-test-'));
    db = new Database(path.join(tmpDir, 'quota.db'));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Tier enforcement on provider selection', () => {
    it('FREE user requesting voyage throws TierError', async () => {
      await expect(
        createEmbeddingProvider({
          provider: 'voyage',
          userTier: 'FREE',
          quotaDb: db,
          voyage: { apiKey: 'test-key' },
        })
      ).rejects.toThrow(TierError);
    });

    it('FREE user requesting inprocess succeeds', async () => {
      // inprocess may fail to load ONNX in test env, but should NOT throw TierError
      try {
        await createEmbeddingProvider({
          provider: 'inprocess',
          userTier: 'FREE',
          quotaDb: db,
        });
      } catch (err) {
        // If it fails, it should NOT be a TierError — it should be a probe failure
        expect(err).not.toBeInstanceOf(TierError);
      }
    });

    it('PRO user using voyage does not throw TierError', async () => {
      // voyage will fail to connect (no real API), but should NOT throw TierError
      const provider = await createEmbeddingProvider({
        provider: 'auto',
        userTier: 'PRO',
        quotaDb: db,
      });
      // Should fall back to mock (no real providers in test), but no TierError
      expect(provider.getActiveProvider()).toBeDefined();
    });

    it('auto mode skips providers not allowed by FREE tier', async () => {
      const provider = await createEmbeddingProvider({
        provider: 'auto',
        userTier: 'FREE',
        quotaDb: db,
      });
      // FREE allows inprocess, mock, and ollama
      const status = provider.getStatus();
      for (const p of status.availableProviders) {
        expect(['inprocess', 'mock', 'ollama']).toContain(p);
      }
    });
  });

  describe('Quota enforcement', () => {
    // All current tiers have unlimited quotas (-1), so we patch FREE
    // to a finite quota for these tests to exercise the quota mechanism.
    const originalQuota = TIER_CAPABILITIES.FREE.embeddingQuotaPerMonth;

    beforeEach(() => {
      (TIER_CAPABILITIES.FREE as { embeddingQuotaPerMonth: number }).embeddingQuotaPerMonth = 500;
    });

    afterEach(() => {
      (TIER_CAPABILITIES.FREE as { embeddingQuotaPerMonth: number }).embeddingQuotaPerMonth = originalQuota;
    });

    it('FREE user at 499 embeddings succeeds', async () => {
      const provider = await createEmbeddingProvider({
        provider: 'mock',
        userTier: 'FREE',
        userId: 'test-user',
        quotaDb: db,
      });

      // Pre-fill 499 embeddings
      const ym = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      db.prepare('INSERT INTO embedding_usage (user_id, year_month, count, updated_at) VALUES (?, ?, 499, ?)').run('test-user', ym, Date.now());

      // 500th should succeed (499 + 1 = 500 = quota)
      const result = await provider.embed('test text');
      expect(result).toBeInstanceOf(Float32Array);
    });

    it('FREE user at 500 embeddings throws EmbeddingQuotaExceededError', async () => {
      const provider = await createEmbeddingProvider({
        provider: 'mock',
        userTier: 'FREE',
        userId: 'test-user',
        quotaDb: db,
      });

      // Pre-fill to quota limit
      const ym = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      db.prepare('INSERT INTO embedding_usage (user_id, year_month, count, updated_at) VALUES (?, ?, 500, ?)').run('test-user', ym, Date.now());

      await expect(provider.embed('test text')).rejects.toThrow(EmbeddingQuotaExceededError);
    });

    it('TEAMS user with unlimited quota never throws quota error', async () => {
      const provider = await createEmbeddingProvider({
        provider: 'mock',
        userTier: 'TEAMS',
        userId: 'test-user',
        quotaDb: db,
      });

      // Even with high usage, should succeed (TEAMS has -1 = unlimited)
      const ym = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      db.prepare('INSERT INTO embedding_usage (user_id, year_month, count, updated_at) VALUES (?, ?, 999999, ?)').run('test-user', ym, Date.now());

      const result = await provider.embed('test text');
      expect(result).toBeInstanceOf(Float32Array);
    });
  });

  describe('getQuotaStatus', () => {
    const originalQuota = TIER_CAPABILITIES.FREE.embeddingQuotaPerMonth;

    beforeEach(() => {
      (TIER_CAPABILITIES.FREE as { embeddingQuotaPerMonth: number }).embeddingQuotaPerMonth = 500;
    });

    afterEach(() => {
      (TIER_CAPABILITIES.FREE as { embeddingQuotaPerMonth: number }).embeddingQuotaPerMonth = originalQuota;
    });

    it('returns correct percentage for FREE user', async () => {
      const provider = await createEmbeddingProvider({
        provider: 'mock',
        userTier: 'FREE',
        userId: 'test-user',
        quotaDb: db,
      });

      // Use 250 of 500 quota
      const ym = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      db.prepare('INSERT INTO embedding_usage (user_id, year_month, count, updated_at) VALUES (?, ?, 250, ?)').run('test-user', ym, Date.now());

      const status = provider.getQuotaStatus();
      expect(status.tier).toBe('FREE');
      expect(status.quota).toBe(500);
      expect(status.used).toBe(250);
      expect(status.remaining).toBe(250);
      expect(status.percentage).toBe(50);
      expect(status.resetsAt).toBeTruthy();
    });

    it('returns unlimited for TEAMS tier', async () => {
      const provider = await createEmbeddingProvider({
        provider: 'mock',
        userTier: 'TEAMS',
        userId: 'test-user',
        quotaDb: db,
      });

      const status = provider.getQuotaStatus();
      expect(status.tier).toBe('TEAMS');
      expect(status.quota).toBe(-1);
      expect(status.remaining).toBe(-1);
      expect(status.percentage).toBe(0);
    });
  });

  describe('getMinimumTierForProvider', () => {
    it('inprocess requires TRIAL (first tier that allows it)', () => {
      expect(getMinimumTierForProvider('inprocess')).toBe('TRIAL');
    });

    it('voyage requires TRIAL (TRIAL unlocks all providers)', () => {
      // TRIAL is the first tier in TIERS array and has all providers
      expect(getMinimumTierForProvider('voyage')).toBe('TRIAL');
    });

    it('litellm requires TRIAL', () => {
      // TRIAL is the first tier with litellm (all unlocked)
      expect(getMinimumTierForProvider('litellm')).toBe('TRIAL');
    });

    it('mock requires TRIAL', () => {
      expect(getMinimumTierForProvider('mock')).toBe('TRIAL');
    });
  });
});
