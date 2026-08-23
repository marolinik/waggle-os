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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function cacheTmpFiles(): string[] {
    const dir = path.join(tmpDir, 'harvest-cache');
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith('.tmp')) : [];
  }

  function filesystemError(code: string): NodeJS.ErrnoException {
    return Object.assign(new Error(`filesystem error: ${code}`), { code });
  }

  it('round-trips arbitrary JSON payload', () => {
    const payload = { version: 1, items: [{ id: 'a', body: 'hello' }, { id: 'b', body: 'world' }] };
    const file = writeHarvestCache(tmpDir, 'roundtrip-key', payload);
    expect(fs.existsSync(file)).toBe(true);
    expect(readHarvestCache(file)).toEqual(payload);
  });

  it('leaves no .tmp sibling after successful write (atomic rename completed)', () => {
    const file = writeHarvestCache(tmpDir, 'atomic-key', { foo: 'bar' });
    expect(cacheTmpFiles()).toEqual([]);
    expect(fs.existsSync(file)).toBe(true);
  });

  it.each(['EPERM', 'EACCES', 'EBUSY'] as const)(
    'retries a transient Windows %s rename lock and completes atomically',
    (code) => {
      const renameSync = fs.renameSync.bind(fs);
      const rename = vi.spyOn(fs, 'renameSync')
        .mockImplementationOnce(() => { throw filesystemError(code); })
        .mockImplementation(renameSync);
      const wait = vi.spyOn(Atomics, 'wait').mockReturnValue('timed-out');

      const file = writeHarvestCache(tmpDir, `transient-${code}`, { code });

      expect(rename).toHaveBeenCalledTimes(2);
      expect(wait).toHaveBeenCalledOnce();
      expect(readHarvestCache(file)).toEqual({ code });
      expect(cacheTmpFiles()).toEqual([]);
    },
  );

  it('bounds persistent transient retries without overwriting the prior cache', () => {
    const file = writeHarvestCache(tmpDir, 'persistent-lock', { version: 1 });
    const error = filesystemError('EBUSY');
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw error; });
    const wait = vi.spyOn(Atomics, 'wait').mockReturnValue('timed-out');

    expect(() => writeHarvestCache(tmpDir, 'persistent-lock', { version: 2 })).toThrow(error);

    expect(rename).toHaveBeenCalledTimes(4);
    expect(wait).toHaveBeenCalledTimes(3);
    expect(readHarvestCache(file)).toEqual({ version: 1 });
    expect(cacheTmpFiles()).toEqual([]);
  });

  it('does not retry a non-transient rename error and still removes its temp file', () => {
    const error = filesystemError('ENOSPC');
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw error; });
    const wait = vi.spyOn(Atomics, 'wait').mockReturnValue('timed-out');

    expect(() => writeHarvestCache(tmpDir, 'disk-full', { version: 1 })).toThrow(error);

    expect(rename).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
    expect(cacheTmpFiles()).toEqual([]);
  });

  it('removes a partially written temp file when the write itself fails', () => {
    const writeFileSync = fs.writeFileSync.bind(fs);
    vi.spyOn(fs, 'writeFileSync').mockImplementationOnce((file, data, options) => {
      writeFileSync(file, data, options);
      throw filesystemError('ENOSPC');
    });

    expect(() => writeHarvestCache(tmpDir, 'partial-write', { version: 1 }))
      .toThrow('filesystem error: ENOSPC');
    expect(cacheTmpFiles()).toEqual([]);
  });

  it('uses a unique temp file for successive writes to the same cache key', () => {
    const writeFileSync = fs.writeFileSync.bind(fs);
    const renameSync = fs.renameSync.bind(fs);
    const tempPaths: string[] = [];
    vi.spyOn(fs, 'writeFileSync').mockImplementation((file, data, options) => {
      tempPaths.push(String(file));
      writeFileSync(file, data, options);
    });
    vi.spyOn(fs, 'renameSync')
      .mockImplementationOnce(() => { throw filesystemError('EBUSY'); })
      .mockImplementation(renameSync);
    vi.spyOn(Atomics, 'wait').mockReturnValue('timed-out');

    writeHarvestCache(tmpDir, 'unique-temp', { version: 1 });
    writeHarvestCache(tmpDir, 'unique-temp', { version: 2 });

    expect(tempPaths).toHaveLength(2);
    expect(new Set(tempPaths).size).toBe(2);
    expect(tempPaths.every((file) => file.endsWith('.tmp'))).toBe(true);
    expect(cacheTmpFiles()).toEqual([]);
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
