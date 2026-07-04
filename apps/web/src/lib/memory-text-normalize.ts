/**
 * W4B (F22) — shared memory-text normalizer for DISPLAY-LAYER dedup.
 *
 * The substrate (`packages/hive-mind-core/src/mind/frames.ts` `findDuplicate`)
 * dedupes only on an exact content hash, so two writes that differ by a single
 * embedded volatile token — a benchmark/audit-run id, a UUID, a timestamp — land
 * as separate frames and surface to the user as near-identical duplicates.
 *
 * This is a pure rendering-side collapse key: it strips those volatile tokens,
 * case-folds, and collapses whitespace so near-duplicates group together. It does
 * NOT touch the store — nothing is merged or deleted.
 *
 * Min-length guard: if the normalized result is shorter than
 * MIN_NORMALIZED_KEY_CHARS, callers MUST treat it as non-groupable (fall back to
 * per-item uniqueness) so short/empty content is never over-collapsed.
 */

export const MIN_NORMALIZED_KEY_CHARS = 8;

/** UUID (v1-v5 shape) — a very common embedded volatile id. */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Explicit run/audit/benchmark id tokens, e.g.
 *   "audit-run-id: 3f9a2b", "run_id=abc123", "benchmark run 20260704",
 *   "auditRunId:00ab". The value can be hex/alphanumeric of length >= 3.
 */
const RUN_ID_RE = /\b(?:audit[-_ ]?run[-_ ]?id|run[-_ ]?id|benchmark[-_ ]?run|audit[-_ ]?run)s?\b[:=#-]?\s*[0-9a-z]{3,}/gi;

/**
 * Bare "audit-<digits>" / "audit_<digits>" ids (e.g. "audit-1782648502308").
 * Hyphen/underscore-joined only — deliberately does NOT match a bare space
 * ("audit trail") so ordinary prose containing the word "audit" survives.
 */
const AUDIT_NUMERIC_ID_RE = /\baudit[-_]\d{4,}\b/gi;

/** ISO-8601 timestamps (date, optional time/zone). */
const ISO_TS_RE = /\d{4}-\d{2}-\d{2}(?:[t ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?z?)?/gi;

/**
 * "Timestamp: <epoch ms>" — a raw epoch millisecond value is not ISO-8601 and
 * would otherwise survive normalization untouched (the original per-fact
 * volatile token in the benchmark harness's anchor text).
 */
const RAW_TIMESTAMP_LABEL_RE = /\btimestamp\s*:?\s*\d{9,}\b/gi;

/**
 * Benchmark-harness secret tokens, e.g. "BENCH-SECRET-5yu27cwrmsv". Narrow to
 * this exact prefix so real "confidential"/"secret" prose is never touched.
 */
const BENCH_SECRET_RE = /\bbench-secret-[0-9a-z]+\b/gi;

/** Bare ticket-style tokens: #1234 (>= 2 digits) — not markdown headings (no space after #). */
const TICKET_RE = /#\d{2,}\b/g;

/** Markdown emphasis / code fences that don't change meaning. */
const MD_NOISE_RE = /[*_`~]+/g;

/**
 * Produce a normalized grouping key for a memory text fragment.
 *
 * Order matters: strip run-id phrases (which may contain hex) BEFORE the bare
 * UUID/timestamp strippers so a labeled id is removed as a unit.
 * Returns '' for nullish input.
 */
export function normalizeMemoryKey(text: string | null | undefined): string {
  if (typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(RUN_ID_RE, ' ')
    .replace(AUDIT_NUMERIC_ID_RE, ' ')
    .replace(RAW_TIMESTAMP_LABEL_RE, ' ')
    .replace(BENCH_SECRET_RE, ' ')
    .replace(UUID_RE, ' ')
    .replace(ISO_TS_RE, ' ')
    .replace(TICKET_RE, ' ')
    .replace(MD_NOISE_RE, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ') // fold remaining punctuation to spaces
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * True when the normalized key is substantial enough to group on. Callers use a
 * per-item fallback key when this is false so unrelated short facts never merge.
 */
export function isGroupableKey(key: string): boolean {
  return key.length >= MIN_NORMALIZED_KEY_CHARS;
}
