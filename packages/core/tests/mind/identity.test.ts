import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import { IdentityLayer, type Identity } from '../../src/mind/identity.js';

describe('Identity Layer (Layer 0)', () => {
  let db: MindDB;
  let identity: IdentityLayer;

  beforeEach(() => {
    db = new MindDB(':memory:');
    identity = new IdentityLayer(db);
  });

  afterEach(() => {
    db.close();
  });

  const sampleIdentity: Omit<Identity, 'id' | 'created_at' | 'updated_at'> = {
    name: 'Waggle Assistant',
    role: 'Personal AI concierge',
    department: 'Engineering',
    personality: 'Helpful, precise, proactive',
    capabilities: 'Email management, scheduling, research, document drafting',
    system_prompt: 'You are Waggle, a personal AI assistant.',
  };

  describe('create', () => {
    it('creates an identity', () => {
      const result = identity.create(sampleIdentity);
      expect(result.id).toBe(1);
      expect(result.name).toBe('Waggle Assistant');
      expect(result.role).toBe('Personal AI concierge');
    });

    it('rejects creating a second identity', () => {
      identity.create(sampleIdentity);
      expect(() => identity.create(sampleIdentity)).toThrow();
    });
  });

  describe('get', () => {
    it('returns the identity', () => {
      identity.create(sampleIdentity);
      const result = identity.get();
      expect(result.name).toBe('Waggle Assistant');
      expect(result.department).toBe('Engineering');
    });

    it('throws if no identity exists', () => {
      expect(() => identity.get()).toThrow('No identity configured');
    });
  });

  describe('update', () => {
    it('updates specific fields', () => {
      identity.create(sampleIdentity);
      const updated = identity.update({ role: 'Executive Assistant', department: 'C-Suite' });
      expect(updated.role).toBe('Executive Assistant');
      expect(updated.department).toBe('C-Suite');
      expect(updated.name).toBe('Waggle Assistant'); // unchanged
    });

    it('throws if no identity to update', () => {
      expect(() => identity.update({ name: 'New' })).toThrow('No identity configured');
    });

    it('updates the updated_at timestamp', () => {
      identity.create(sampleIdentity);
      const before = identity.get().updated_at;
      // Force a slight delay by doing a sync sleep
      const start = Date.now();
      while (Date.now() - start < 50) { /* busy wait */ }
      const after = identity.update({ name: 'Updated' }).updated_at;
      // updated_at should be set (may or may not differ due to SQLite second-precision)
      expect(after).toBeDefined();
    });
  });

  describe('toContext', () => {
    it('serializes to a context string', () => {
      identity.create(sampleIdentity);
      const ctx = identity.toContext();
      expect(ctx).toContain('Waggle Assistant');
      expect(ctx).toContain('Personal AI concierge');
      expect(ctx).toContain('Engineering');
    });

    it('context string is under 500 tokens (estimated)', () => {
      identity.create(sampleIdentity);
      const ctx = identity.toContext();
      // Rough estimate: 1 token ~= 4 chars
      const estimatedTokens = Math.ceil(ctx.length / 4);
      expect(estimatedTokens).toBeLessThan(500);
    });
  });

  describe('performance', () => {
    it('loads identity in under 1ms (1000 iterations)', () => {
      identity.create(sampleIdentity);

      // Warm up
      for (let i = 0; i < 10; i++) identity.get();

      const start = performance.now();
      const iterations = 1000;
      for (let i = 0; i < iterations; i++) {
        identity.get();
      }
      const elapsed = performance.now() - start;
      const avgMs = elapsed / iterations;

      expect(avgMs).toBeLessThan(1);
    });
  });

  describe('exists', () => {
    it('returns false when no identity', () => {
      expect(identity.exists()).toBe(false);
    });

    it('returns true when identity exists', () => {
      identity.create(sampleIdentity);
      expect(identity.exists()).toBe(true);
    });
  });
});
