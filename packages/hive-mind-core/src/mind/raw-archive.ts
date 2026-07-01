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
  /** GDPR Art.17: set once when this row's content has been redacted; NULL otherwise. */
  erased_at: string | null;
  erased_reason: string | null;
}

/** Placed in `content` when a row is erased under GDPR Art.17 (right to erasure). */
export const RAW_ARCHIVE_REDACTION_MARKER = '[REDACTED — GDPR Art.17 erasure]';

/** sha256 hex over the raw, untouched content (NOT hashFrameContent — that strips/trims). */
export function hashRaw(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Read all archive-uid links off a frame's parsed metadata, tolerating both the
 * canonical array (`archiveUids: string[]`) and the legacy scalar (`archiveUid:
 * string`). Returns the set-union (dedup, order: array first, then legacy scalar)
 * as a fresh array — [] when neither is present. Never mutates the input.
 */
export function readArchiveUids(meta: Record<string, unknown>): string[] {
  const out = new Set<string>();
  if (Array.isArray(meta.archiveUids)) {
    for (const u of meta.archiveUids) if (typeof u === 'string') out.add(u);
  }
  if (typeof meta.archiveUid === 'string') out.add(meta.archiveUid);
  return [...out];
}

/**
 * Return a NEW metadata object with `uid` added to the canonical `archiveUids`
 * array, migrating any legacy scalar `archiveUid` into the array and dropping it.
 * Idempotent (set-union) and immutable (never mutates the input).
 */
export function withArchiveUid(meta: Record<string, unknown>, uid: string): Record<string, unknown> {
  const uids = new Set(readArchiveUids(meta));
  uids.add(uid);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { archiveUid: _legacy, ...rest } = meta;
  return { ...rest, archiveUids: [...uids] };
}

export class RawArchive {
  private db: MindDB;
  constructor(db: MindDB) { this.db = db; }

  /** Idempotent append. INSERT OR IGNORE on the UNIQUE archive_uid makes a
   *  re-append a no-op. Injection-scans (4KB probe) but stores verbatim. */
  append(input: ArchiveInput): { archiveUid: string; created: boolean } {
    const raw = this.db.getDatabase();
    // archive_uid is PER-SOURCE: identical content from two different sources
    // keeps two provenance rows, so each frame's link resolves to ITS own source
    // (a content-only uid would collapse them and make reconstructSource return
    // the wrong source). Re-importing the same item from the same source still
    // collapses (idempotency). content_sha256 stays a content-only integrity
    // anchor — verify the verbatim, or find identical content across sources.
    const archiveUid = hashRaw(`${input.source}\x00${input.sourceRef ?? ''}\x00${input.content}`);
    const contentSha = hashRaw(input.content);
    // injection_flagged is a 4KB PROBE (same budget as the harvest pipeline's
    // Pass 0) — advisory, NOT a full-content guarantee. Content is stored
    // verbatim regardless (zero-loss); the archive is never fed to an LLM, and
    // any consumer that surfaces it to a model MUST re-scan.
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
      contentSha,
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

  /**
   * Resolve every archive-uid link on a frame → its archive rows. Accepts both
   * the canonical `archiveUids: string[]` and the legacy scalar `archiveUid`
   * (via readArchiveUids). Returns [] when no frame / no metadata / malformed
   * metadata / no resolvable rows. Order preserved; unresolved uids dropped.
   */
  reconstructSource(frameId: number): RawArchiveRow[] {
    const row = this.db.getDatabase()
      .prepare('SELECT metadata FROM memory_frames WHERE id = ?')
      .get(frameId) as { metadata?: string } | undefined;
    if (!row?.metadata) return [];
    let meta: Record<string, unknown>;
    try { meta = JSON.parse(row.metadata) as Record<string, unknown>; }
    catch { return []; }
    if (!meta || typeof meta !== 'object') return [];
    const rows: RawArchiveRow[] = [];
    for (const uid of readArchiveUids(meta)) {
      const r = this.getByUid(uid);
      if (r) rows.push(r);
    }
    return rows;
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

  /**
   * GDPR Art.17 right-to-erasure. Redacts ONE archive row in place: content ->
   * marker, content_sha256 -> '', title -> NULL, and stamps erased_at/erased_reason.
   * The identity skeleton (archive_uid/source/source_ref/timestamps/injection flags)
   * is frozen — the audit record that an item existed and was erased survives. The
   * refined raw_archive_no_update trigger permits exactly this one canonical outcome
   * (content=marker, content_sha256='', title NULL) — raw SQL cannot use the erase
   * path to forge audit content. Idempotent: a second call is a no-op, returns false.
   *
   * RETAINED-SKELETON RESIDUALS (founder-ratified — keep skeleton over max erasure):
   *   - source_ref is preserved verbatim and MAY carry PII (thread-id/filename/URL);
   *     harvest adapters should avoid placing raw identifiers there.
   *   - archive_uid = sha256(source ∥ sourceRef ∥ content) is itself a content-derived
   *     hash and stays frozen, so for low-entropy content it remains a re-identification
   *     vector even though content_sha256 is blanked. Making it opaque is a follow-up.
   * THREAT MODEL: append-only + erase-once are trigger-enforced — tamper-EVIDENT
   * against ordinary INSERT/UPDATE/DELETE, NOT tamper-proof against a caller with DDL
   * rights (DROP TRIGGER/TABLE bypasses it).
   */
  erase(archiveUid: string, reason: string): boolean {
    const res = this.db.getDatabase().prepare(
      `UPDATE raw_archive
         SET content = ?, content_sha256 = '', title = NULL,
             erased_at = datetime('now'), erased_reason = ?
       WHERE archive_uid = ? AND erased_at IS NULL`
    ).run(RAW_ARCHIVE_REDACTION_MARKER, reason, archiveUid);
    return res.changes > 0;
  }

  /**
   * Redact every archive row a frame links to (via its metadata.archiveUids, incl.
   * the legacy scalar). Returns the count of rows newly redacted (already-erased
   * rows are skipped).
   *
   * SCOPE — provenance rows ONLY. This is NOT a complete GDPR Art.17 data-subject
   * erasure: the DERIVED memory_frames (whose summaries quote the source) and their
   * FTS / vector / KnowledgeGraph projections still hold the PII and remain
   * searchable and recall-able. A full DSAR flow MUST pair this with a frame + index
   * + KG erasure. It also reaches only rows linked from THIS frame — orphan rows,
   * other frames, and same-source_ref rows are not swept (a subject-level sweep by
   * source_ref is a follow-up).
   */
  eraseByFrame(frameId: number, reason: string): number {
    const row = this.db.getDatabase()
      .prepare('SELECT metadata FROM memory_frames WHERE id = ?')
      .get(frameId) as { metadata?: string } | undefined;
    if (!row?.metadata) return 0;
    let meta: Record<string, unknown>;
    try { meta = JSON.parse(row.metadata) as Record<string, unknown>; }
    catch { return 0; }
    if (!meta || typeof meta !== 'object') return 0;
    let erased = 0;
    for (const uid of readArchiveUids(meta)) {
      if (this.erase(uid, reason)) erased++;
    }
    return erased;
  }
}
