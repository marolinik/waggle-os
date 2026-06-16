/**
 * Deterministic frozen-mind hash (02 §5.4, 03 C8).
 *
 * Mode-1's shared frozen mind must be byte-identical across every arm; the run
 * records this content hash per row so the audit proves the same substrate fed
 * every model and that nothing wrote to it during Phase B. We hash the SQLite
 * mind-DB BYTES (SHA-256), so:
 *   - two arms reading the same file → the same hash, and
 *   - any tamper (a stray write-back, a different build) → a different hash.
 *
 * Accepts a file path (read from disk) OR raw bytes (for in-memory / test use).
 *
 * Caveat for the Plan-08 caller: hash the DB only when it is QUIESCENT (handle
 * closed / checkpointed). SQLite WAL mode keeps recent writes in a `-wal`
 * sidecar, so hashing the main `.db` mid-transaction can miss bytes. Plan 08
 * must close the MindDB (or `PRAGMA wal_checkpoint(TRUNCATE)`) before calling
 * hashMind on the path. This module hashes exactly the bytes it is given.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';

export function hashMind(dbPathOrBytes: string | Uint8Array): string {
  let bytes: Uint8Array;
  if (typeof dbPathOrBytes === 'string') {
    if (!fs.existsSync(dbPathOrBytes)) {
      throw new Error(`mind DB not found at ${dbPathOrBytes}`);
    }
    bytes = fs.readFileSync(dbPathOrBytes);
  } else if (dbPathOrBytes instanceof Uint8Array) {
    bytes = dbPathOrBytes;
  } else {
    throw new Error('hashMind requires a file path or a Uint8Array');
  }
  return createHash('sha256').update(bytes).digest('hex');
}
