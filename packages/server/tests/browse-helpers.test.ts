/**
 * P14 regression — drive enumeration + root detection for /api/browse/local
 *
 * Covers the pure helpers; the route layer stays thin and is exercised by
 * cross-platform.test.ts which hits the Fastify server natively.
 */

import { describe, it, expect } from 'vitest';
import {
  listWindowsDrives,
  shouldListDrives,
} from '../src/local/routes/browse-helpers.js';

describe('listWindowsDrives', () => {
  it('returns no drives when existsFn rejects every letter', () => {
    const drives = listWindowsDrives(() => false);
    expect(drives).toEqual([]);
  });

  it('returns the single typical single-drive Windows machine (C: only)', () => {
    const drives = listWindowsDrives((p) => p === 'C:\\');
    expect(drives).toHaveLength(1);
    expect(drives[0]).toEqual({ name: 'C:', path: 'C:\\', type: 'directory' });
  });

  it('returns both C: and D: on a dual-drive machine like Marko\'s', () => {
    const drives = listWindowsDrives((p) => p === 'C:\\' || p === 'D:\\');
    expect(drives).toHaveLength(2);
    expect(drives.map((d) => d.name)).toEqual(['C:', 'D:']);
    expect(drives.map((d) => d.path)).toEqual(['C:\\', 'D:\\']);
  });

  it('preserves alphabetical order across non-contiguous drives', () => {
    // A floppy + C: system + X: network share is a plausible enterprise layout.
    const drives = listWindowsDrives((p) => p === 'A:\\' || p === 'C:\\' || p === 'X:\\');
    expect(drives.map((d) => d.name)).toEqual(['A:', 'C:', 'X:']);
  });

  it('every returned entry is typed as a directory', () => {
    const drives = listWindowsDrives((p) => p === 'C:\\' || p === 'E:\\');
    for (const d of drives) {
      expect(d.type).toBe('directory');
    }
  });

  it('only probes A through Z (not AA or lowercase)', () => {
    const probed: string[] = [];
    listWindowsDrives((p) => {
      probed.push(p);
      return false;
    });
    expect(probed).toHaveLength(26);
    expect(probed[0]).toBe('A:\\');
    expect(probed[25]).toBe('Z:\\');
    // No lowercase letters, no two-letter paths.
    for (const p of probed) {
      expect(p).toMatch(/^[A-Z]:\\$/);
    }
  });
});

describe('shouldListDrives', () => {
  it('returns false on non-Windows platforms regardless of path', () => {
    expect(shouldListDrives('linux', '/')).toBe(false);
    expect(shouldListDrives('darwin', '/')).toBe(false);
    expect(shouldListDrives('linux', '')).toBe(false);
  });

  it('returns true on win32 when path is an abstract root variant', () => {
    expect(shouldListDrives('win32', '/')).toBe(true);
    expect(shouldListDrives('win32', '\\')).toBe(true);
    expect(shouldListDrives('win32', '')).toBe(true);
    expect(shouldListDrives('win32', '.')).toBe(true);
  });

  it('returns false on win32 when caller asked for a specific drive', () => {
    expect(shouldListDrives('win32', 'C:\\')).toBe(false);
    expect(shouldListDrives('win32', 'D:\\Users')).toBe(false);
    expect(shouldListDrives('win32', '/Users')).toBe(false);
  });

  it('trims whitespace before comparing', () => {
    expect(shouldListDrives('win32', '  /  ')).toBe(true);
    expect(shouldListDrives('win32', '\n\t')).toBe(true);
  });
});
