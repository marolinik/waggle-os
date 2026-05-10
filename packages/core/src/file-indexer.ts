/**
 * FileIndexer — auto-index workspace files into their workspace mind (L-20).
 *
 * Design decisions (see docs/plans/FILE-TOOLS-AUDIT-2026-04-20.md):
 *   • Trigger:     on-upload / on-overwrite (called from route handlers)
 *   • Target mind: per-workspace (the mind you pass in the constructor)
 *   • Granularity: 1 frame per file
 *   • Formats:     .md, .markdown, .txt only for v1 (Bucket 2 adds PDF/DOCX)
 *   • Cleanup:     re-index on overwrite, delete index on file remove
 *
 * A `file_index` table tracks the file_path → frame_id link so overwrites can
 * swap the old frame cleanly and moves/deletes can locate the right frame
 * without scanning every frame in the workspace.
 *
 * Large files are truncated to MAX_CONTENT_BYTES with a marker appended; the
 * full file is still on disk, only the indexed frame is shortened. Keeps the
 * mind DB size bounded even if a user drops a 5MB markdown dump.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';
import type { MindDB } from '@waggle/hive-mind-core';
import { FrameStore } from '@waggle/hive-mind-core';
import { SessionStore } from '@waggle/hive-mind-core';

const FILE_INDEX_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS file_index (
  file_path TEXT PRIMARY KEY,
  frame_id INTEGER NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  indexed_at TEXT NOT NULL DEFAULT (datetime('now'))
)
`;
const FILE_INDEX_IDX_SQL = `
CREATE INDEX IF NOT EXISTS idx_file_index_frame ON file_index (frame_id)
`;

const INDEX_SESSION_GOP_ID = 'session:file-index';
const INDEX_SESSION_PROJECT = 'file-indexer';

/** Maximum bytes of file content we store in a single frame. Beyond this, the
 * content is truncated with a marker. Keeps mind size bounded on large dumps. */
export const MAX_CONTENT_BYTES = 64 * 1024;

/** Extensions we index for v1. PDF/DOCX/XLSX land in Bucket 2. */
const INDEXABLE_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);

export interface FileIndexRow {
  filePath: string;
  frameId: number;
  mimeType: string | null;
  sizeBytes: number;
  contentHash: string;
  indexedAt: string;
}

export type FileIndexResult =
  | { skipped: true; reason: 'unsupported_format' | 'unchanged' | 'empty' }
  | { skipped: false; frameId: number; truncated: boolean };

export class FileIndexer {
  private readonly db: MindDB;
  private readonly frames: FrameStore;
  private readonly sessions: SessionStore;
  private cachedGopId: string | null = null;

  constructor(db: MindDB) {
    this.db = db;
    this.frames = new FrameStore(db);
    this.sessions = new SessionStore(db);
    this.ensureTable();
  }

  private ensureTable(): void {
    const raw = this.db.getDatabase();
    const existsRow = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='file_index'",
    ).get();
    if (existsRow) return;
    raw.prepare(FILE_INDEX_TABLE_SQL).run();
    raw.prepare(FILE_INDEX_IDX_SQL).run();
  }

  /** True iff the path's extension is one we index in v1. */
  static shouldIndex(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return INDEXABLE_EXTENSIONS.has(ext);
  }

  private ensureSession(): string {
    if (this.cachedGopId) return this.cachedGopId;
    const session = this.sessions.ensure(
      INDEX_SESSION_GOP_ID,
      INDEX_SESSION_PROJECT,
      'Auto-indexed workspace files',
    );
    this.cachedGopId = session.gop_id;
    return session.gop_id;
  }

  /**
   * Index a file. Idempotent on unchanged content (same hash → skip). On
   * overwrite with new content, deletes the old frame and inserts a fresh one.
   */
  indexFile(filePath: string, content: Buffer, mime?: string): FileIndexResult {
    if (!FileIndexer.shouldIndex(filePath)) {
      return { skipped: true, reason: 'unsupported_format' };
    }
    if (content.length === 0) {
      // Still remove any stale index so an emptied file doesn't leave an
      // orphan frame pointing at old content.
      this.removeFile(filePath);
      return { skipped: true, reason: 'empty' };
    }

    const hash = createHash('sha256').update(content).digest('hex');
    const raw = this.db.getDatabase();
    const existingRow = raw.prepare('SELECT * FROM file_index WHERE file_path = ?').get(filePath) as
      | Record<string, unknown>
      | undefined;

    if (existingRow && existingRow.content_hash === hash) {
      return { skipped: true, reason: 'unchanged' };
    }

    const normalized = this.normalizeText(content);
    const truncated = content.length > MAX_CONTENT_BYTES;
    const frameBody = this.buildFrameContent(filePath, normalized, truncated, mime);
    const gopId = this.ensureSession();
    // Atomicity contract (L-20 BLOCKER-1 fix): createIFrame → (conditional
    // old-frame delete) → UPDATE/INSERT on file_index must commit as one unit.
    // If any step throws mid-callback, better-sqlite3 rolls back the new frame
    // and the index-row write, leaving the table in its pre-call state. Without
    // this, a crash between the delete and the UPDATE would leave file_index
    // pointing at a deleted frame_id (dangling) or an uncommitted new frame
    // orphaned in the frames table.
    const mutate = raw.transaction(() => {
      const frame = this.frames.createIFrame(gopId, frameBody, 'normal', 'system');

      if (existingRow) {
        // Overwrite path: delete the old frame before we swap the row, unless
        // the dedup coalesced two paths onto the same frame (leave that frame
        // alone in that case — the other path still references it).
        const oldFrameId = Number(existingRow.frame_id);
        if (oldFrameId !== frame.id) {
          const otherRef = raw.prepare('SELECT 1 FROM file_index WHERE frame_id = ? AND file_path != ? LIMIT 1').get(oldFrameId, filePath);
          if (!otherRef) {
            this.frames.delete(oldFrameId);
          }
        }
        raw.prepare(`
          UPDATE file_index SET
            frame_id = ?,
            mime_type = ?,
            size_bytes = ?,
            content_hash = ?,
            indexed_at = datetime('now')
          WHERE file_path = ?
        `).run(frame.id, mime ?? null, content.length, hash, filePath);
      } else {
        raw.prepare(`
          INSERT INTO file_index (file_path, frame_id, mime_type, size_bytes, content_hash)
          VALUES (?, ?, ?, ?, ?)
        `).run(filePath, frame.id, mime ?? null, content.length, hash);
      }

      return frame.id;
    });

    const frameId = mutate();
    return { skipped: false, frameId, truncated };
  }

  /** Remove a file's frame + index row. Returns true if anything was removed. */
  removeFile(filePath: string): boolean {
    const raw = this.db.getDatabase();
    const row = raw.prepare('SELECT frame_id FROM file_index WHERE file_path = ?').get(filePath) as
      | { frame_id: number }
      | undefined;
    if (!row) return false;

    const otherRef = raw.prepare('SELECT 1 FROM file_index WHERE frame_id = ? AND file_path != ? LIMIT 1').get(row.frame_id, filePath);
    if (!otherRef) {
      this.frames.delete(row.frame_id);
    }
    raw.prepare('DELETE FROM file_index WHERE file_path = ?').run(filePath);
    return true;
  }

  /**
   * Update the recorded path for a moved file. The frame content itself still
   * carries the old path in its header — that's acceptable for v1 since the
   * frame body is already the file's own content (not a description). A later
   * reader sees the stale header only if they dig into raw frame content; the
   * index table, which is what every other code path queries, is correct.
   */
  moveFile(from: string, to: string): boolean {
    const raw = this.db.getDatabase();
    const row = raw.prepare('SELECT * FROM file_index WHERE file_path = ?').get(from) as
      | Record<string, unknown>
      | undefined;
    if (!row) return false;

    // If `to` already indexed, drop its entry (file was replaced by the move).
    raw.prepare('DELETE FROM file_index WHERE file_path = ?').run(to);
    raw.prepare('UPDATE file_index SET file_path = ?, indexed_at = datetime(\'now\') WHERE file_path = ?').run(to, from);
    return true;
  }

  getRow(filePath: string): FileIndexRow | null {
    const raw = this.db.getDatabase();
    const row = raw.prepare('SELECT * FROM file_index WHERE file_path = ?').get(filePath) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return {
      filePath: row.file_path as string,
      frameId: row.frame_id as number,
      mimeType: (row.mime_type as string | null) ?? null,
      sizeBytes: row.size_bytes as number,
      contentHash: row.content_hash as string,
      indexedAt: row.indexed_at as string,
    };
  }

  listAll(): FileIndexRow[] {
    const raw = this.db.getDatabase();
    const rows = raw.prepare('SELECT * FROM file_index ORDER BY indexed_at DESC').all() as Record<string, unknown>[];
    return rows.map(r => ({
      filePath: r.file_path as string,
      frameId: r.frame_id as number,
      mimeType: (r.mime_type as string | null) ?? null,
      sizeBytes: r.size_bytes as number,
      contentHash: r.content_hash as string,
      indexedAt: r.indexed_at as string,
    }));
  }

  private normalizeText(content: Buffer): string {
    // UTF-8 decode. Malformed bytes become U+FFFD; acceptable for index use.
    const full = content.toString('utf-8');
    if (Buffer.byteLength(full, 'utf-8') <= MAX_CONTENT_BYTES) return full;
    // Truncate in character-safe chunks. Walk down until we're under the byte
    // budget; avoids cutting a multi-byte character in half.
    let candidate = full.slice(0, MAX_CONTENT_BYTES);
    while (Buffer.byteLength(candidate, 'utf-8') > MAX_CONTENT_BYTES && candidate.length > 0) {
      candidate = candidate.slice(0, candidate.length - 1);
    }
    return candidate;
  }

  private buildFrameContent(filePath: string, body: string, truncated: boolean, mime?: string): string {
    const header = `[FILE: ${filePath}${mime ? ` · ${mime}` : ''}]`;
    const suffix = truncated ? `\n\n[…truncated at ${MAX_CONTENT_BYTES} bytes for indexing]` : '';
    return `${header}\n\n${body}${suffix}`;
  }
}
