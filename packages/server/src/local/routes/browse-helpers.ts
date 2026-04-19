/**
 * Browse route helpers — platform-specific filesystem enumeration
 * that sits behind the /api/browse/local route.
 *
 * Split out of browse.ts so tests can drive the logic with a stubbed
 * existsSync without touching the Fastify layer.
 */

import fs from 'node:fs';

export interface BrowseEntry {
  name: string;
  path: string;
  type: 'directory' | 'file';
}

/** Injection point for tests. Real code passes fs.existsSync. */
export type ExistsFn = (p: string) => boolean;

/**
 * Enumerate mounted Windows drive roots (A:\..Z:\) by probing each letter.
 * Typical Windows boxes return 2-4 entries; the 26-letter scan is ~10ms
 * since fs.existsSync is synchronous and drives that don't exist fail fast.
 *
 * P14 / UX rationale: the Local file browser defaults to path='/' which
 * path.resolve('/') maps to a single drive root on Windows (whichever
 * the sidecar CWD sits on). That hid C: from users whose sidecar CWD
 * was on D:. Returning an explicit drive listing at root lets the UI
 * navigate across drives without any Tauri capability change — the
 * sidecar reads the filesystem natively.
 */
export function listWindowsDrives(existsFn: ExistsFn = fs.existsSync): BrowseEntry[] {
  const drives: BrowseEntry[] = [];
  for (let code = 65; code <= 90; code++) {
    // 65-90 = ASCII A-Z
    const letter = String.fromCharCode(code);
    const root = `${letter}:\\`;
    if (existsFn(root)) {
      drives.push({ name: `${letter}:`, path: root, type: 'directory' });
    }
  }
  return drives;
}

/**
 * Should the route return the drive list instead of resolving `path`?
 * True when we're on Windows AND the caller asked for the abstract root.
 */
export function shouldListDrives(
  platform: NodeJS.Platform,
  requestedPath: string,
): boolean {
  if (platform !== 'win32') return false;
  const trimmed = requestedPath.trim();
  return trimmed === '' || trimmed === '/' || trimmed === '\\' || trimmed === '.';
}
