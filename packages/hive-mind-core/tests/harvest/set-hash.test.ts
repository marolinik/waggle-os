/**
 * harvestSetHash unit tests (R3-004 — skip unchanged-content rescans).
 *
 * The harvest route hashes an incoming item set and, when it matches the
 * source's stored last_content_hash, skips the O(n·500) per-item rescan.
 * The digest must be: deterministic, order-independent (adapter jitter), and
 * sensitive to any id/title/content edit.
 */

import { describe, it, expect } from 'vitest';
import { harvestSetHash } from '../../src/harvest/dedup.js';

const A = { id: '1', title: 'Alpha', content: 'first body' };
const B = { id: '2', title: 'Beta', content: 'second body' };

describe('harvestSetHash', () => {
  it('is deterministic for the same set', () => {
    expect(harvestSetHash([A, B])).toBe(harvestSetHash([A, B]));
  });

  it('is order-independent (adapter ordering jitter must not change the digest)', () => {
    expect(harvestSetHash([A, B])).toBe(harvestSetHash([B, A]));
  });

  it('changes when an item content is edited (same id)', () => {
    const edited = { ...A, content: 'first body — edited' };
    expect(harvestSetHash([A, B])).not.toBe(harvestSetHash([edited, B]));
  });

  it('changes when an item title is edited', () => {
    const edited = { ...A, title: 'Alpha 2' };
    expect(harvestSetHash([A, B])).not.toBe(harvestSetHash([edited, B]));
  });

  it('changes when an item is added or removed', () => {
    expect(harvestSetHash([A, B])).not.toBe(harvestSetHash([A]));
    expect(harvestSetHash([A])).not.toBe(harvestSetHash([]));
  });

  it('tolerates missing optional fields without throwing', () => {
    expect(() => harvestSetHash([{ content: 'x' }, { id: 'y' }, {}])).not.toThrow();
  });

  it('distinguishes two items that swap field values (id+title+content are positional per item)', () => {
    // Same multiset of strings but recombined differently → different digest.
    const x = { id: '1', title: 'T', content: 'C' };
    const y = { id: '1', title: 'C', content: 'T' };
    expect(harvestSetHash([x])).not.toBe(harvestSetHash([y]));
  });
});
