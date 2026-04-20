/**
 * writeHarvestCache / readHarvestCache unit tests (M-08 BLOCKER-2 — atomic write).
 *
 * Covers:
 *  - round-trip: write → read returns original payload
 *  - atomicity: writeHarvestCache leaves no `.tmp` after successful write
 *  - graceful degrade: readHarvestCache returns null for missing file
 *  - graceful degrade: readHarvestCache returns null for corrupted JSON
 *    (simulates partial write left by power-loss, SIGKILL, full disk)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { writeHarvestCache, readHarvestCache } from '../../src/local/routes/harvest.js';

describe('harvest cache (M-08)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harvest-cache-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trips arbitrary JSON payload', () => {
    const payload = { version: 1, items: [{ id: 'a', body: 'hello' }, { id: 'b', body: 'world' }] };
    const file = writeHarvestCache(tmpDir, 'roundtrip-key', payload);
    expect(fs.existsSync(file)).toBe(true);
    expect(readHarvestCache(file)).toEqual(payload);
  });

  it('leaves no .tmp sibling after successful write (atomic rename completed)', () => {
    const file = writeHarvestCache(tmpDir, 'atomic-key', { foo: 'bar' });
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
    expect(fs.existsSync(file)).toBe(true);
  });

  it('overwrites an existing cache file atomically', () => {
    const first = writeHarvestCache(tmpDir, 'overwrite-key', { n: 1 });
    const second = writeHarvestCache(tmpDir, 'overwrite-key', { n: 2 });
    expect(first).toBe(second);
    expect(readHarvestCache(second)).toEqual({ n: 2 });
  });

  it('returns null for a missing cache file (caller responds 410)', () => {
    const nonexistent = path.join(tmpDir, 'does-not-exist.json');
    expect(readHarvestCache(nonexistent)).toBeNull();
  });

  it('returns null for corrupted JSON — partial-write power-loss simulation', () => {
    // Write a valid cache, then truncate it mid-payload to simulate what a
    // crashed writeFileSync would have left behind under the old non-atomic
    // code path. readHarvestCache must return null so the caller returns 410
    // rather than throwing (which would surface as a 500 to the client).
    const file = writeHarvestCache(tmpDir, 'corrupt-key', { large: 'x'.repeat(1000) });
    const raw = fs.readFileSync(file, 'utf-8');
    fs.writeFileSync(file, raw.slice(0, Math.floor(raw.length / 2)), 'utf-8');

    expect(readHarvestCache(file)).toBeNull();
  });

  it('returns null for garbage-in-the-cache-slot (non-JSON bytes)', () => {
    const file = path.join(tmpDir, 'harvest-cache', 'non-json.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '\x00\x01\x02 not json at all', 'utf-8');
    expect(readHarvestCache(file)).toBeNull();
  });
});
