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
 * "Audit run <id>" harvest-provenance suffix as a WHOLE PHRASE, e.g.
 *   "Audit run audit-1782648502308." / "benchmark run 20260704".
 * The label words ("audit run") AND the id must be stripped together — stripping
 * only the id (RUN_ID_RE/AUDIT_NUMERIC_ID_RE) leaves "audit run" behind, which
 * produced two distinct dedup keys ("…account" vs "…account audit run") so the
 * SAME fact showed twice in the login briefing (live wave-5 QA finding). Runs
 * BEFORE RUN_ID_RE so the label isn't half-consumed. The optional `audit[-_]`
 * lets it also swallow the doubled "audit run audit-<digits>" live shape.
 */
const AUDIT_RUN_PHRASE_RE = /\b(?:audit|benchmark)[-_ ]?run\b\s*[:=#-]?\s*(?:audit[-_])?\d{3,}/gi;

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
    .replace(AUDIT_RUN_PHRASE_RE, ' ')
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

// ── Display-layer markdown strip (round-6 fix 2a) ──────────────────────────
//
// Memory-card previews render as PLAIN TEXT nodes, so raw markdown tokens
// ('## heading', **bold**, `code`, [links](url)) show literally and read as
// log output. This is the same cleanup LoginBriefing's truncateHighlight
// applies, extracted so Memory-Trust rows share one implementation. Display
// only — never applied to stored content (the drawer still edits the raw
// text and renders a real markdown preview).

const MD_HEADING_RE = /^#{1,6}\s+/;
const MD_BOLD_RE = /\*\*(.+?)\*\*/g;
const MD_CODE_RE = /`(.+?)`/g;
const MD_FENCE_RE = /^```[\w-]*\s*$/;
const MD_LINK_RE = /\[([^\]]+)\]\([^)]*\)/g;

/** Strip markdown tokens from ONE line of preview text (display only). */
export function stripMarkdownTokens(line: string): string {
  if (MD_FENCE_RE.test(line.trim())) return '';
  return line
    .replace(MD_HEADING_RE, '')
    .replace(MD_LINK_RE, '$1')
    .replace(MD_BOLD_RE, '$1')
    .replace(MD_CODE_RE, '$1')
    .trim();
}
