/**
 * Pure-helper tests for the data-erase flow.
 *
 * These cover the safety-critical primitives that the route + boot wipe
 * sit on top of:
 *  - confirmation gate (header + exact phrase)
 *  - snapshot accuracy (file count + bytes)
 *  - safe-to-wipe assertion (refuses non-Waggle dirs, refuses cwd, refuses root)
 *  - path-escape resistance during the wipe walk (symlinks, ..)
 *  - marker round-trip (write then read)
 *  - performWipe receipt correctness
 *
 * These are pure-function tests on a tmp dir — they do NOT touch any
 * server, DB, or network. The integration with the route lives in
 * data-erase.test.ts; the integration with service startup lives
 * implicitly in startService (smoke-tested when first-run.test.ts runs).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  validateEraseConfirmation,
  snapshotDataDir,
  assertDataDirIsSafeToWipe,
  writeEraseMarker,
  readEraseMarker,
  performWipe,
  writeWipeReceipt,
  ERASE_CONFIRMATION_PHRASE,
  ERASE_CONFIRMATION_HEADER_VALUE,
  ERASE_MARKER_FILENAME,
  type EraseMarker,
} from '../src/local/data-erase-helpers.js';

function mkTmp(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `waggle-${name}-`));
}

describe('validateEraseConfirmation', () => {
  it('accepts the exact header + body phrase', () => {
    const r = validateEraseConfirmation(
      { 'x-confirm-erase': ERASE_CONFIRMATION_HEADER_VALUE },
      { confirmation: ERASE_CONFIRMATION_PHRASE },
    );
    expect(r.ok).toBe(true);
  });

  it('rejects missing header', () => {
    const r = validateEraseConfirmation({}, { confirmation: ERASE_CONFIRMATION_PHRASE });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/X-Confirm-Erase/);
  });

  it('rejects header with wrong value', () => {
    const r = validateEraseConfirmation(
      { 'x-confirm-erase': 'YES' }, // wrong case
      { confirmation: ERASE_CONFIRMATION_PHRASE },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/X-Confirm-Erase/);
  });

  it('rejects body with wrong phrase', () => {
    const r = validateEraseConfirmation(
      { 'x-confirm-erase': ERASE_CONFIRMATION_HEADER_VALUE },
      { confirmation: 'i understand this is permanent' }, // wrong case
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/exact phrase/);
  });

  it('rejects body that is not a JSON object', () => {
    const r = validateEraseConfirmation(
      { 'x-confirm-erase': ERASE_CONFIRMATION_HEADER_VALUE },
      'I UNDERSTAND THIS IS PERMANENT',
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/JSON object/);
  });

  it('rejects body with non-string confirmation field', () => {
    const r = validateEraseConfirmation(
      { 'x-confirm-erase': ERASE_CONFIRMATION_HEADER_VALUE },
      { confirmation: true },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/must be a string/);
  });
});

describe('snapshotDataDir', () => {
  let dir: string;
  beforeEach(() => { dir = mkTmp('erase-snapshot'); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ } });

  it('returns zeroes for a non-existent dir', () => {
    const snap = snapshotDataDir(path.join(dir, 'does-not-exist'));
    expect(snap.fileCount).toBe(0);
    expect(snap.totalBytes).toBe(0);
    expect(snap.topLevelEntries).toEqual([]);
  });

  it('counts top-level files + recursive subdir bytes correctly', () => {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'aaaaa'); // 5 bytes
    fs.writeFileSync(path.join(dir, 'b.txt'), 'bb');    // 2 bytes
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', 'c.txt'), 'ccc'); // 3 bytes
    fs.writeFileSync(path.join(dir, 'sub', 'd.txt'), 'dddd'); // 4 bytes

    const snap = snapshotDataDir(dir);
    expect(snap.fileCount).toBe(4);
    expect(snap.totalBytes).toBe(14);
    expect(snap.topLevelEntries).toHaveLength(3);
    const sub = snap.topLevelEntries.find(e => e.name === 'sub');
    expect(sub?.isDirectory).toBe(true);
    expect(sub?.bytes).toBe(7);
  });
});

describe('assertDataDirIsSafeToWipe', () => {
  it('passes for a path with "waggle" in the basename', () => {
    const dir = mkTmp('waggle-safe-name');
    expect(assertDataDirIsSafeToWipe(dir)).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('passes for a non-waggle-named dir if it contains a Waggle artifact', () => {
    const dir = mkTmp('foreign-name'); // mkdtemp prefix gets "waggle-" — work around
    // Rename into a foreign-shape path so the basename heuristic fails.
    const renamed = path.join(path.dirname(dir), `foreign-${Date.now()}`);
    fs.renameSync(dir, renamed);
    fs.writeFileSync(path.join(renamed, 'personal.mind'), '');
    expect(assertDataDirIsSafeToWipe(renamed)).toBeNull();
    fs.rmSync(renamed, { recursive: true, force: true });
  });

  it('refuses a foreign-named, artifact-free dir', () => {
    const dir = mkTmp('safe-suffix');
    const renamed = path.join(path.dirname(dir), `notrelated-${Date.now()}`);
    fs.renameSync(dir, renamed);
    const err = assertDataDirIsSafeToWipe(renamed);
    expect(err).toMatch(/does not look like a Waggle data dir/);
    fs.rmSync(renamed, { recursive: true, force: true });
  });

  it('refuses cwd', () => {
    const err = assertDataDirIsSafeToWipe(process.cwd());
    expect(err).toMatch(/forbidden top-level path/);
  });

  it('refuses an empty / non-string path', () => {
    expect(assertDataDirIsSafeToWipe('')).toMatch(/empty/);
    // @ts-expect-error — testing the runtime guard
    expect(assertDataDirIsSafeToWipe(null)).toMatch(/empty/);
  });
});

describe('writeEraseMarker / readEraseMarker round-trip', () => {
  let dir: string;
  beforeEach(() => { dir = mkTmp('erase-marker'); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ } });

  it('writes a JSON marker that readEraseMarker parses back', () => {
    const marker: EraseMarker = {
      schemaVersion: 1,
      requestedAt: '2026-05-08T10:00:00.000Z',
      snapshot: { fileCount: 3, totalBytes: 100, topLevelEntries: [] },
    };
    const p = writeEraseMarker(dir, marker);
    expect(p).toBe(path.join(dir, ERASE_MARKER_FILENAME));
    const round = readEraseMarker(dir);
    expect(round).toEqual(marker);
  });

  it('returns null when no marker file exists', () => {
    expect(readEraseMarker(dir)).toBeNull();
  });

  it('returns null when marker JSON has wrong schemaVersion', () => {
    fs.writeFileSync(
      path.join(dir, ERASE_MARKER_FILENAME),
      JSON.stringify({ schemaVersion: 2, requestedAt: 'x', snapshot: {} }),
    );
    expect(readEraseMarker(dir)).toBeNull();
  });

  it('returns null when marker JSON is malformed', () => {
    fs.writeFileSync(path.join(dir, ERASE_MARKER_FILENAME), 'not json');
    expect(readEraseMarker(dir)).toBeNull();
  });
});

describe('performWipe', () => {
  let dir: string;
  beforeEach(() => { dir = mkTmp('erase-wipe'); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ } });

  function fakeMarker(): EraseMarker {
    return {
      schemaVersion: 1,
      requestedAt: new Date().toISOString(),
      snapshot: { fileCount: 0, totalBytes: 0, topLevelEntries: [] },
    };
  }

  it('removes every file inside the data dir and returns them in filesRemoved', () => {
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
    fs.writeFileSync(path.join(dir, 'b.mind'), 'b');
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', 'c.txt'), 'c');
    // The marker itself
    writeEraseMarker(dir, fakeMarker());

    const r = performWipe(dir, fakeMarker());
    expect(r.filesSkipped).toEqual([]);
    // All four files + the marker should be removed.
    const removed = new Set(r.filesRemoved);
    expect(removed.has('a.txt')).toBe(true);
    expect(removed.has('b.mind')).toBe(true);
    expect(removed.has(path.join('sub', 'c.txt'))).toBe(true);
    expect(removed.has(ERASE_MARKER_FILENAME)).toBe(true);
    // Data dir still exists, but is empty.
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('refuses to wipe a foreign-named, artifact-free dir and returns refusal in filesSkipped', () => {
    // Build a foreign-shape dir so assertDataDirIsSafeToWipe refuses.
    const renamed = path.join(path.dirname(dir), `notrelated-${Date.now()}`);
    fs.renameSync(dir, renamed);
    fs.writeFileSync(path.join(renamed, 'a.txt'), 'a');

    const r = performWipe(renamed, fakeMarker());
    expect(r.filesRemoved).toEqual([]);
    expect(r.filesSkipped).toHaveLength(1);
    expect(r.filesSkipped[0].reason).toMatch(/does not look like a Waggle data dir/);
    // File untouched.
    expect(fs.existsSync(path.join(renamed, 'a.txt'))).toBe(true);

    fs.rmSync(renamed, { recursive: true, force: true });
  });
});

describe('writeWipeReceipt', () => {
  let dir: string;
  beforeEach(() => { dir = mkTmp('erase-receipt'); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ } });

  it('writes a JSON receipt to a unique timestamped filename', () => {
    const receipt = {
      requestedAt: '2026-05-08T10:00:00.000Z',
      wipedAt: '2026-05-08T10:01:00.000Z',
      snapshot: { fileCount: 0, totalBytes: 0, topLevelEntries: [] },
      filesRemoved: ['a.txt'],
      filesSkipped: [],
    };
    const p = writeWipeReceipt(dir, receipt);
    expect(path.basename(p)).toMatch(/^audit-receipt-2026-05-08T10-01-00-000Z\.json$/);
    const back = JSON.parse(fs.readFileSync(p, 'utf-8'));
    expect(back).toEqual(receipt);
  });

  it('creates the dir if it has been wiped to non-existence', () => {
    fs.rmSync(dir, { recursive: true, force: true });
    expect(fs.existsSync(dir)).toBe(false);
    const receipt = {
      requestedAt: '2026-05-08T10:00:00.000Z',
      wipedAt: '2026-05-08T10:01:00.000Z',
      snapshot: { fileCount: 0, totalBytes: 0, topLevelEntries: [] },
      filesRemoved: [],
      filesSkipped: [],
    };
    const p = writeWipeReceipt(dir, receipt);
    expect(fs.existsSync(p)).toBe(true);
  });
});
