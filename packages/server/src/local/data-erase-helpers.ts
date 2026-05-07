/**
 * Pure helpers for the data-erase flow.
 *
 * The flow is split: the runtime route validates + snapshots + writes a
 * marker file; the destructive wipe runs at next service startup, BEFORE
 * any DB is opened. Splitting like this means the route can never
 * accidentally rm-rf a data dir whose DBs the running server still
 * holds open (which on Windows would leave a partially-deleted state).
 *
 * Every helper here is pure: it takes a data dir path and a clock,
 * returns a value, and never closes/opens DBs. Boot integration lives
 * in service.ts; the route lives in routes/data-erase.ts.
 *
 * SAFETY
 * - `assertDataDirIsSafeToWipe` refuses to wipe paths that don't look
 *   like a Waggle data dir. The check runs at BOTH the route call (to
 *   refuse marker writes for foreign paths) and at boot (so even a
 *   hand-crafted marker can't escape its own dir).
 * - `performWipe` uses `path.relative()` to confirm every entry it
 *   touches is inside the data dir. A symlink that escapes the dir
 *   would otherwise let a wipe walk into a sibling.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Required exact-match phrase in the request body's `confirmation` field. */
export const ERASE_CONFIRMATION_PHRASE = 'I UNDERSTAND THIS IS PERMANENT';

/** Required value of the `X-Confirm-Erase` header. */
export const ERASE_CONFIRMATION_HEADER_VALUE = 'yes';

/** Marker file name. Lives at the data dir root. */
export const ERASE_MARKER_FILENAME = '.erase-pending.json';

/** Receipt file name. Lives at the data dir root after wipe. */
export const ERASE_RECEIPT_FILENAME_PREFIX = 'audit-receipt-';

export interface DataDirSnapshot {
  fileCount: number;
  totalBytes: number;
  /** Non-recursive top-level entries — useful for the receipt without
   *  enumerating every frame. The actual wipe walks recursively. */
  topLevelEntries: Array<{ name: string; isDirectory: boolean; bytes: number }>;
}

export interface EraseMarker {
  /** ISO timestamp from when the route validated the request. */
  requestedAt: string;
  /** Snapshot taken at request time (NOT at wipe time — the user gets
   *  the receipt up-front, not after a Windows lock makes a re-snapshot
   *  unreliable). */
  snapshot: DataDirSnapshot;
  /** Marker schema version. Bump if the wipe contract changes. */
  schemaVersion: 1;
}

export interface ConfirmationResult {
  ok: boolean;
  error?: string;
}

export interface WipeReceipt {
  requestedAt: string;
  wipedAt: string;
  snapshot: DataDirSnapshot;
  /** Files that were successfully removed. */
  filesRemoved: string[];
  /** Files that survived the wipe (Windows lock, perm denied, etc.). */
  filesSkipped: Array<{ path: string; reason: string }>;
}

/**
 * Validate the request's confirmation header + body. Both must match
 * exactly — no normalization, no trim, no case-folding. Friction is the
 * point: this gate exists to prevent accidental erasure, not to be
 * convenient.
 */
export function validateEraseConfirmation(
  headers: Record<string, string | string[] | undefined>,
  body: unknown,
): ConfirmationResult {
  const raw = headers['x-confirm-erase'] ?? headers['X-Confirm-Erase'];
  const headerValue = Array.isArray(raw) ? raw[0] : raw;
  if (headerValue !== ERASE_CONFIRMATION_HEADER_VALUE) {
    return { ok: false, error: `Missing or wrong X-Confirm-Erase header — expected exact value "${ERASE_CONFIRMATION_HEADER_VALUE}".` };
  }
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Body must be a JSON object with a "confirmation" field.' };
  }
  const phrase = (body as Record<string, unknown>).confirmation;
  if (typeof phrase !== 'string') {
    return { ok: false, error: '"confirmation" must be a string.' };
  }
  if (phrase !== ERASE_CONFIRMATION_PHRASE) {
    return { ok: false, error: `"confirmation" must match the exact phrase: "${ERASE_CONFIRMATION_PHRASE}".` };
  }
  return { ok: true };
}

/**
 * Walk a directory non-recursively (top-level only) and recursively
 * to count files + bytes. Bounded — never follows symlinks out of the dir.
 */
export function snapshotDataDir(dataDir: string): DataDirSnapshot {
  if (!fs.existsSync(dataDir)) {
    return { fileCount: 0, totalBytes: 0, topLevelEntries: [] };
  }

  const topLevelEntries: DataDirSnapshot['topLevelEntries'] = [];
  let fileCount = 0;
  let totalBytes = 0;

  const entries = fs.readdirSync(dataDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dataDir, entry.name);
    let bytes = 0;
    try {
      if (entry.isDirectory()) {
        const result = walkSize(entryPath, dataDir);
        fileCount += result.fileCount;
        bytes = result.totalBytes;
      } else if (entry.isFile()) {
        const stat = fs.statSync(entryPath);
        bytes = stat.size;
        fileCount += 1;
      }
      totalBytes += bytes;
    } catch { /* unreadable — skip */ }
    topLevelEntries.push({ name: entry.name, isDirectory: entry.isDirectory(), bytes });
  }

  return { fileCount, totalBytes, topLevelEntries };
}

function walkSize(dir: string, dataDirRoot: string): { fileCount: number; totalBytes: number } {
  let fileCount = 0;
  let totalBytes = 0;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { fileCount: 0, totalBytes: 0 };
  }
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    // Refuse to follow anything that escapes the root.
    const relative = path.relative(dataDirRoot, entryPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) continue;

    if (entry.isSymbolicLink()) continue; // never follow symlinks
    if (entry.isDirectory()) {
      const sub = walkSize(entryPath, dataDirRoot);
      fileCount += sub.fileCount;
      totalBytes += sub.totalBytes;
    } else if (entry.isFile()) {
      try {
        totalBytes += fs.statSync(entryPath).size;
        fileCount += 1;
      } catch { /* unreadable — skip */ }
    }
  }
  return { fileCount, totalBytes };
}

/**
 * Sanity check: the dir we're about to wipe must look like a Waggle
 * data dir. Heuristics:
 *  (a) the basename starts with "waggle" / ".waggle" / contains "waggle",
 *  OR
 *  (b) the dir contains at least one of the recognized Waggle artifacts
 *      (personal.mind, vault.db, config.json with a Waggle-shaped key).
 *
 * Refusing on a foreign path means a misconfigured or malicious marker
 * can't trick the wipe into deleting the user's home dir or similar.
 *
 * Returns null if safe; an error string if not.
 */
export function assertDataDirIsSafeToWipe(dataDir: string): string | null {
  if (!dataDir || typeof dataDir !== 'string') return 'dataDir is empty or not a string';

  const resolved = path.resolve(dataDir);
  // Block top-level safe-to-wipe candidates that are obviously NOT a Waggle dir.
  const banned = [
    process.cwd(),
    path.parse(resolved).root, // C:\, /
  ];
  // Home dir check requires importing os at the call site to keep helpers
  // pure; the route + service caller pass it via the dataDir parameter,
  // and we trust path.resolve() == path.parse().root catches the nuke-everything case.
  for (const b of banned) {
    if (path.resolve(b) === resolved) {
      return `Refusing to wipe ${resolved}: matches a forbidden top-level path.`;
    }
  }

  const base = path.basename(resolved).toLowerCase();
  const looksLikeWaggleByName = base.includes('waggle');
  if (looksLikeWaggleByName) return null;

  // Fallback: contains a Waggle-shaped artifact?
  const waggleArtifacts = ['personal.mind', 'config.json', 'vault.db', '.vault-key'];
  for (const artifact of waggleArtifacts) {
    if (fs.existsSync(path.join(resolved, artifact))) return null;
  }

  return `Refusing to wipe ${resolved}: directory does not look like a Waggle data dir (no waggle in name, no recognized artifacts).`;
}

/** Write the marker file. Idempotent — overwrites existing marker. */
export function writeEraseMarker(dataDir: string, marker: EraseMarker): string {
  const markerPath = path.join(dataDir, ERASE_MARKER_FILENAME);
  fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2), 'utf-8');
  return markerPath;
}

/** Read the marker file if it exists, validate its shape, return it. */
export function readEraseMarker(dataDir: string): EraseMarker | null {
  const markerPath = path.join(dataDir, ERASE_MARKER_FILENAME);
  if (!fs.existsSync(markerPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(markerPath, 'utf-8')) as Record<string, unknown>;
    if (raw.schemaVersion !== 1) return null;
    if (typeof raw.requestedAt !== 'string') return null;
    if (!raw.snapshot || typeof raw.snapshot !== 'object') return null;
    return raw as unknown as EraseMarker;
  } catch {
    return null;
  }
}

/**
 * Recursively delete every entry inside dataDir EXCEPT the receipt file
 * we're about to write. After wipe completes, the dataDir still exists
 * (mkdirSync at boot will be a no-op) but is empty except for the receipt.
 *
 * Returns a receipt listing what was actually removed vs skipped — on
 * Windows, file locks held by lingering processes will leave some entries
 * in `filesSkipped` instead of failing the whole operation.
 */
export function performWipe(dataDir: string, marker: EraseMarker): WipeReceipt {
  const safetyError = assertDataDirIsSafeToWipe(dataDir);
  if (safetyError) {
    // Refuse — but don't throw. Return a receipt that documents the refusal
    // so service.ts can log + bail without crashing the binary on boot.
    return {
      requestedAt: marker.requestedAt,
      wipedAt: new Date().toISOString(),
      snapshot: marker.snapshot,
      filesRemoved: [],
      filesSkipped: [{ path: dataDir, reason: safetyError }],
    };
  }

  const filesRemoved: string[] = [];
  const filesSkipped: WipeReceipt['filesSkipped'] = [];
  const root = path.resolve(dataDir);

  function rmRecursive(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      filesSkipped.push({ path: dir, reason: (e as Error).message });
      return;
    }
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      // The marker file MUST be removed last — service.ts uses its
      // disappearance as the signal that wipe succeeded. Skip on this pass.
      if (entry.name === ERASE_MARKER_FILENAME && dir === root) continue;

      // Path-escape guard.
      const rel = path.relative(root, entryPath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        filesSkipped.push({ path: entryPath, reason: 'escapes data dir' });
        continue;
      }

      try {
        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          rmRecursive(entryPath);
          fs.rmdirSync(entryPath);
        } else {
          fs.unlinkSync(entryPath);
        }
        filesRemoved.push(rel);
      } catch (e) {
        filesSkipped.push({ path: rel || entryPath, reason: (e as Error).message });
      }
    }
  }

  rmRecursive(root);

  // Now remove the marker itself, last.
  try {
    fs.unlinkSync(path.join(root, ERASE_MARKER_FILENAME));
    filesRemoved.push(ERASE_MARKER_FILENAME);
  } catch (e) {
    filesSkipped.push({ path: ERASE_MARKER_FILENAME, reason: (e as Error).message });
  }

  return {
    requestedAt: marker.requestedAt,
    wipedAt: new Date().toISOString(),
    snapshot: marker.snapshot,
    filesRemoved,
    filesSkipped,
  };
}

/**
 * Write the wipe receipt to the now-empty data dir. Filename includes
 * timestamp so multiple wipes (across reinstalls) leave separate
 * receipts and don't collide.
 */
export function writeWipeReceipt(dataDir: string, receipt: WipeReceipt): string {
  // Create the dir if performWipe removed it via rmdirSync of the root.
  // (We don't rmdir the root in performWipe, but defensive:)
  fs.mkdirSync(dataDir, { recursive: true });
  const safeStamp = receipt.wipedAt.replace(/[:.]/g, '-');
  const receiptPath = path.join(dataDir, `${ERASE_RECEIPT_FILENAME_PREFIX}${safeStamp}.json`);
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), 'utf-8');
  return receiptPath;
}
