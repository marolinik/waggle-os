/**
 * raw-archive.ts — #7 Verbatim Provenance Archive (2026-06-30).
 *
 * Append-only, immutable store of the FULL verbatim source of each harvested
 * item. Distilled/imported frames link back via memory_frames.metadata.archiveUid;
 * reconstructSource(frameId) resolves that link for audit / EU-AI-Act reconstruction.
 *
 * NOT part of the retrieval corpus (no FTS/vec, never fed to an LLM) — so unlike
 * raw-turns (which DROPS injection payloads because they feed recall), this store
 * keeps flagged content verbatim and records the flag. Idempotent on content sha256.
 * Append-only is enforced by DDL triggers; inserts use INSERT OR IGNORE (OR REPLACE
 * would DELETE+INSERT and trip the no-delete trigger).
 */

import { createHash } from 'node:crypto';
import type { MindDB } from './db.js';
import { scanForInjection } from '../injection-scanner.js';

export interface ArchiveInput {
  source: string;
  sourceRef?: string;
  title?: string;
  content: string;
  sourceTimestamp?: string;
}

export interface RawArchiveRow {
  id: number;
  archive_uid: string;
  source: string;
  source_ref: string | null;
  title: string | null;
  content: string;
  content_sha256: string;
  injection_flagged: 0 | 1;
  injection_flags: string;
  source_timestamp: string | null;
  created_at: string;
}

/** sha256 hex over the raw, untouched content (NOT hashFrameContent — that strips/trims). */
export function hashRaw(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export class RawArchive {
  private db: MindDB;
  constructor(db: MindDB) { this.db = db; }

  /** Idempotent append. archive_uid = sha256(content); INSERT OR IGNORE on the
   *  UNIQUE uid makes a re-append a no-op. Injection-scans but stores verbatim. */
  append(input: ArchiveInput): { archiveUid: string; created: boolean } {
    const raw = this.db.getDatabase();
    const archiveUid = hashRaw(input.content);
    // Scan the first 4KB — same probe budget as the harvest pipeline's Pass 0.
    const scan = scanForInjection(input.content.slice(0, 4000), 'tool_output');
    const result = raw.prepare(
      `INSERT OR IGNORE INTO raw_archive
         (archive_uid, source, source_ref, title, content, content_sha256,
          injection_flagged, injection_flags, source_timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      archiveUid,
      input.source,
      input.sourceRef ?? null,
      input.title ?? null,
      input.content,
      archiveUid,
      scan.safe ? 0 : 1,
      scan.safe ? '' : scan.flags.join(','),
      input.sourceTimestamp ?? null,
    );
    return { archiveUid, created: result.changes > 0 };
  }

  getByUid(archiveUid: string): RawArchiveRow | undefined {
    return this.db.getDatabase()
      .prepare('SELECT * FROM raw_archive WHERE archive_uid = ?')
      .get(archiveUid) as RawArchiveRow | undefined;
  }

  /** Resolve frame.metadata.archiveUid → archive row. undefined when no/invalid link. */
  reconstructSource(frameId: number): RawArchiveRow | undefined {
    const row = this.db.getDatabase()
      .prepare('SELECT metadata FROM memory_frames WHERE id = ?')
      .get(frameId) as { metadata?: string } | undefined;
    if (!row?.metadata) return undefined;
    let uid: unknown;
    try { uid = (JSON.parse(row.metadata) as { archiveUid?: unknown }).archiveUid; }
    catch { return undefined; }
    return typeof uid === 'string' ? this.getByUid(uid) : undefined;
  }

  list(opts: { limit?: number; offset?: number; source?: string } = {}): RawArchiveRow[] {
    const { limit = 100, offset = 0, source } = opts;
    if (source) {
      return this.db.getDatabase().prepare(
        'SELECT * FROM raw_archive WHERE source = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      ).all(source, limit, offset) as RawArchiveRow[];
    }
    return this.db.getDatabase().prepare(
      'SELECT * FROM raw_archive ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset) as RawArchiveRow[];
  }

  count(): number {
    return (this.db.getDatabase().prepare('SELECT COUNT(*) as c FROM raw_archive').get() as { c: number }).c;
  }
}
