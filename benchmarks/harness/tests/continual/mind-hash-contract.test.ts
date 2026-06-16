/**
 * Contract probe for the mind-hash dependency (Plan 06 hashMind).
 *
 * The continual harness needs a STABLE content hash of a frozen MindDB so the
 * Mode-1 "byte-identical mind across models" claim is auditable per row
 * (02 §5.4). We pin the contract here and assert it on a real :memory: MindDB
 * via @waggle/core, so a later swap to Plan 06's hashMind cannot silently
 * change the property.
 */
import { describe, expect, it } from 'vitest';
import { MindDB } from '@waggle/core';
import { hashMindBytes, resolveHashMind } from '../../src/continual/mind-hash.js';

function seedMind(db: MindDB, label: string): void {
  const raw = db.getDatabase();
  raw.prepare('CREATE TABLE IF NOT EXISTS probe (k TEXT)').run();
  raw.prepare('INSERT INTO probe (k) VALUES (?)').run(label);
}

describe('hashMindBytes — local fallback contract', () => {
  it('same content ⇒ same hash', () => {
    const a = new MindDB(':memory:');
    const b = new MindDB(':memory:');
    try {
      seedMind(a, 'same');
      seedMind(b, 'same');
      // serialize() omits WAL/rowid-internal jitter for identical logical DBs.
      expect(hashMindBytes(a)).toBe(hashMindBytes(b));
    } finally {
      a.close();
      b.close();
    }
  });

  it('different content ⇒ different hash', () => {
    const a = new MindDB(':memory:');
    const b = new MindDB(':memory:');
    try {
      seedMind(a, 'alpha');
      seedMind(b, 'beta');
      expect(hashMindBytes(a)).not.toBe(hashMindBytes(b));
    } finally {
      a.close();
      b.close();
    }
  });

  it('returns a 64-char lowercase hex string', () => {
    const a = new MindDB(':memory:');
    try {
      seedMind(a, 'x');
      expect(hashMindBytes(a)).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      a.close();
    }
  });
});

describe('resolveHashMind — dependency resolution', () => {
  it('returns a callable that hashes a MindDB', () => {
    const fn = resolveHashMind();
    const a = new MindDB(':memory:');
    try {
      seedMind(a, 'y');
      const h = fn(a);
      expect(typeof h).toBe('string');
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      a.close();
    }
  });
});
