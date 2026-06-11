import { createHash } from 'node:crypto';

/**
 * content-hash.ts — canonical frame content hash for dedup (oss-drift D3).
 *
 * Adopts the OSS indexed-`content_hash`-column pattern but with MONO hash
 * semantics: the hash covers `stripHmPrefix(content).trim()`, NOT bare
 * `content.trim()` — provenance-insensitive dedup (OQ-6) is load-bearing
 * here (two same-body captures of one turn from different sources must
 * collapse regardless of their `[hm …]` metadata prefix). Porting the OSS
 * trim-only definition verbatim would have regressed that.
 *
 * SINGLE definition shared by insert, dedup lookup, update, compaction, and
 * the migration backfill so trim/strip semantics can never drift between
 * call sites.
 *
 * Reverse-ported from OSS hive-mind content-hash.ts (oss-drift triage D3,
 * 2026-06-11), semantics adapted per the triage verdict.
 */

/**
 * Strip the leading hive-mind metadata prefix `[hm session:… src:… event:…] `
 * so dedup compares the semantic turn BODY, not the provenance. The prefix is
 * emitted by shim-core's `buildPrefix` (`[hm <tokens>] `); two captures of the
 * same turn from different sources differ only in that prefix. Content without
 * the prefix (harvest / ingest / cognify) is returned unchanged — a no-op.
 * The regex anchors on `[hm ` and stops at the first `]`, so a body that
 * merely contains `[` brackets later is never over-stripped.
 *
 * (Moved here from frames.ts so the hash and the strip live in one module;
 * frames.ts re-exports it for back-compat.)
 */
export function stripHmPrefix(content: string): string {
  return content.replace(/^\[hm [^\]]*\]\s*/, '');
}

/** Canonical content hash: sha256 over the stripped, trimmed body. */
export function hashFrameContent(content: string): string {
  return createHash('sha256').update(stripHmPrefix(content).trim()).digest('hex');
}
