/**
 * Frozen-mind hash tests — deterministic SHA-256 over the mind-DB bytes.
 * Uses a per-test tmpdir (runner-lock.test.ts idiom).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashMind } from '../../src/firewall/hash-mind.js';

let tmpDir: string;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-fw-hash-'));
});
afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('hashMind', () => {
  it('hashes raw bytes deterministically (same bytes → same hash)', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    expect(hashMind(bytes)).toBe(hashMind(Uint8Array.from(bytes)));
  });

  it('produces the known SHA-256 of a fixed byte string', () => {
    // SHA-256("waggle") = the value below (verified via node crypto).
    const h = hashMind(new TextEncoder().encode('waggle'));
    expect(h).toBe('e5b171346e528d4b550334a3c4bd60b50d87434f803b26631810d0309c43ad60');
  });

  it('a file path and its bytes hash identically', () => {
    const p = path.join(tmpDir, 'mind.db');
    const bytes = new Uint8Array([10, 20, 30, 40]);
    fs.writeFileSync(p, bytes);
    expect(hashMind(p)).toBe(hashMind(bytes));
  });

  it('detects a single-byte tamper', () => {
    const a = new Uint8Array([0, 0, 0, 0]);
    const b = new Uint8Array([0, 0, 1, 0]);
    expect(hashMind(a)).not.toBe(hashMind(b));
  });

  it('returns a 64-char lowercase hex string', () => {
    const h = hashMind(new Uint8Array([7]));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('throws on a missing file path', () => {
    expect(() => hashMind(path.join(tmpDir, 'does-not-exist.db'))).toThrow(/mind DB not found/);
  });

  it('throws on a non-string, non-bytes argument', () => {
    expect(() => hashMind(42 as unknown as string)).toThrow(/file path or a Uint8Array/);
  });
});
