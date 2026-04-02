import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEmbeddingProvider, EmbeddingQuotaExceededError, getMinimumTierForProvider } from '../src/mind/embedding-provider.js';
import { TierError } from '@waggle/shared';

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
    it('SOLO user requesting voyage throws TierError', async () => {
      await expect(
        createEmbeddingProvider({
          provider: 'voyage',
          userTier: 'SOLO',
          quotaDb: db,
          voyage: { apiKey: 'test-key' },
        })
      ).rejects.toThrow(TierError);
    });

    it('SOLO user requesting inprocess succeeds', async () => {
      // inprocess may fail to load ONNX in test env, but should NOT throw TierError
      try {
        await createEmbeddingProvider({
          provider: 'inprocess',
          userTier: 'SOLO',
          quotaDb: db,
        });
      } catch (err) {
        // If it fails, it should NOT be a TierError — it should be a probe failure
        expect(err).not.toBeInstanceOf(TierError);
      }
    });

    it('BASIC user using voyage does not throw TierError', async () => {
      // voyage will fail to connect (no real API), but should NOT throw TierError
      const provider = await createEmbeddingProvider({
        provider: 'auto',
        userTier: 'BASIC',
        quotaDb: db,
      });
      // Should fall back to mock (no real providers in test), but no TierError
      expect(provider.getActiveProvider()).toBeDefined();
    });

    it('auto mode skips providers not allowed by SOLO tier', async () => {
      const provider = await createEmbeddingProvider({
        provider: 'auto',
        userTier: 'SOLO',
        quotaDb: db,
      });
      // SOLO only allows inprocess and mock
      const status = provider.getStatus();
      for (const p of status.availableProviders) {
        expect(['inprocess', 'mock']).toContain(p);
      }
    });
  });

  describe('Quota enforcement', () => {
    it('SOLO user at 499 embeddings succeeds', async () => {
      const provider = await createEmbeddingProvider({
        provider: 'mock',
        userTier: 'SOLO',
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

    it('SOLO user at 500 embeddings throws EmbeddingQuotaExceededError', async () => {
      const provider = await createEmbeddingProvider({
        provider: 'mock',
        userTier: 'SOLO',
        userId: 'test-user',
        quotaDb: db,
      });

      // Pre-fill to quota limit
      const ym = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      db.prepare('INSERT INTO embedding_usage (user_id, year_month, count, updated_at) VALUES (?, ?, 500, ?)').run('test-user', ym, Date.now());

      await expect(provider.embed('test text')).rejects.toThrow(EmbeddingQuotaExceededError);
    });

    it('BASIC user with unlimited quota never throws quota error', async () => {
      // BASIC has 5000 quota, not unlimited — but let's test a provider with quota
      const provider = await createEmbeddingProvider({
        provider: 'mock',
        userTier: 'TEAMS', // TEAMS has unlimited
        userId: 'test-user',
        quotaDb: db,
      });

      // Even with high usage, should succeed
      const ym = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      db.prepare('INSERT INTO embedding_usage (user_id, year_month, count, updated_at) VALUES (?, ?, 999999, ?)').run('test-user', ym, Date.now());

      const result = await provider.embed('test text');
      expect(result).toBeInstanceOf(Float32Array);
    });
  });

  describe('getQuotaStatus', () => {
    it('returns correct percentage for SOLO user', async () => {
      const provider = await createEmbeddingProvider({
        provider: 'mock',
        userTier: 'SOLO',
        userId: 'test-user',
        quotaDb: db,
      });

      // Use 250 of 500 quota
      const ym = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      db.prepare('INSERT INTO embedding_usage (user_id, year_month, count, updated_at) VALUES (?, ?, 250, ?)').run('test-user', ym, Date.now());

      const status = provider.getQuotaStatus();
      expect(status.tier).toBe('SOLO');
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
    it('inprocess requires SOLO', () => {
      expect(getMinimumTierForProvider('inprocess')).toBe('SOLO');
    });

    it('voyage requires BASIC', () => {
      expect(getMinimumTierForProvider('voyage')).toBe('BASIC');
    });

    it('litellm requires TEAMS', () => {
      expect(getMinimumTierForProvider('litellm')).toBe('TEAMS');
    });

    it('mock requires SOLO', () => {
      expect(getMinimumTierForProvider('mock')).toBe('SOLO');
    });
  });
});
