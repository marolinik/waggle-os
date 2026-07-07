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

// ── Display-layer preview split (round-7 fix 3) ─────────────────────────────
//
// MemoryTrustManage renders a memory as "first line = title, rest = excerpt",
// but harvested frames often LEAD with machine provenance — a bare
// "Timestamp: 1782400441971" line, or a "[Harvest:claude-code] session-handoff-…"
// slug — which read as garbage titles. buildMemoryPreview picks the first
// HUMAN lead instead. Display only: nothing here touches the stored content;
// the drawer still shows and edits the raw text.

export interface MemoryPreview {
  /** Humanized first display line (falls back to the raw first line). */
  title: string;
  /** Remaining lines joined, sentence-truncated near the clamp budget. */
  excerpt: string;
  /** Provenance (handoff label + date + session) lifted out of the title's
   *  lead into a quiet meta chip. Absent when the title had no such prefix. */
  titleMeta?: string;
}

/** Bare machine-provenance line: 'Timestamp: 1782400441971' and nothing else. */
const TIMESTAMP_LINE_RE = /^timestamp\s*:?\s*\d{6,}$/i;

/** '[Harvest:<tool>]' provenance prefix on a lead line. */
const HARVEST_PREFIX_RE = /^\[harvest:[^\]]*\]\s*/i;

/** A slug: no whitespace, at least one dash/underscore joint. */
function isSlug(s: string): boolean {
  return s.length > 0 && !/\s/.test(s) && /[-_]/.test(s);
}

function deSlugify(s: string): string {
  return s.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** A line a human reads as a title/sentence: ≥4 words and not majority
 *  punctuation/digits. */
function isHumanLine(line: string): boolean {
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 4) return false;
  const noise = (line.match(/[\p{N}\p{P}\p{S}]/gu) ?? []).length;
  return noise <= line.length / 2;
}

/** Pick the display title from the stripped non-empty lines, skipping machine
 *  provenance leads. Returns null when nothing qualifies (caller falls back to
 *  the first line, exactly today's behavior). */
function selectPreviewTitle(lines: string[]): { title: string; index: number } | null {
  let scanningForHuman = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (TIMESTAMP_LINE_RE.test(line)) continue; // (a) bare timestamp — never a title
    if (HARVEST_PREFIX_RE.test(line)) {
      // (b) harvest-provenance lead: de-slugify the remainder if it's a slug,
      // keep it if it already reads human, else scan on for a human line.
      const remainder = line.replace(HARVEST_PREFIX_RE, '').trim();
      if (isSlug(remainder)) return { title: deSlugify(remainder), index: i };
      if (isHumanLine(remainder)) return { title: remainder, index: i };
      scanningForHuman = true;
      continue;
    }
    if (scanningForHuman && !isHumanLine(line)) continue;
    return { title: line, index: i };
  }
  return null;
}

/** Rough character budget of the two clamped excerpt lines. */
const EXCERPT_SENTENCE_CAP = 220;

/** Cut a long excerpt at the last full stop inside the clamp budget so the
 *  preview ends on a sentence instead of a mid-word ellipsis. When no usable
 *  stop exists, return the text untouched and let the CSS clamp ellipsize. */
export function sentenceTruncate(text: string, cap = EXCERPT_SENTENCE_CAP): string {
  if (text.length <= cap) return text;
  const head = text.slice(0, cap);
  const lastStop = head.lastIndexOf('. ');
  if (lastStop >= cap * 0.4) return head.slice(0, lastStop + 1);
  return text;
}

// ── Display-layer handoff-title humanization (round-9 Lane C fix 1) ──────────
//
// Harvested session-handoff notes lead with a machine filename slug —
// "session handoff 2026 06 24 s2 warm hive pr8 landing shipped roadmap
// complete" — which reads as log output and punctures the "memory you can
// trust" promise. Lift the provenance prefix (handoff label + date + optional
// session) out of the title into a quiet meta chip and leave the human
// remainder as the title. Deterministic string transforms only — no content is
// invented (the em-dash/comma phrasing a human editor might add is deliberately
// NOT synthesized); nothing here touches the stored content.

const HANDOFF_PREFIX_RE =
  /^(?:project[\s-]+)?(?:session[\s-]+)?handoff[\s-]+(\d{4})[\s-]+(\d{2})[\s-]+(\d{2})(?:[\s-]+s(\d+))?[\s-]+/i;

/** Uppercase the first alphabetic character; leave the rest as-is. */
function capitalizeFirst(s: string): string {
  return s.replace(/\p{L}/u, (c) => c.toUpperCase());
}

/** "pr8" → "PR8" (the PR abbreviation only, digits required). Display polish. */
function upperPrTokens(s: string): string {
  return s.replace(/\bpr(\d+)\b/gi, (_m, n: string) => `PR${n}`);
}

export interface HumanizedTitle {
  title: string;
  /** Provenance lifted out of the title lead, e.g.
   *  "session handoff · 2026-06-24 · s2". Undefined when no prefix matched. */
  meta?: string;
}

/**
 * Lift a leading "session handoff <date> [sN]" provenance slug out of a memory
 * title into a compact meta string, humanizing the remainder. Returns the title
 * untouched (no meta) when no handoff prefix is present, or when nothing
 * readable would remain after the strip (never strip down to an empty title).
 */
export function humanizeMemoryTitle(title: string): HumanizedTitle {
  const m = HANDOFF_PREFIX_RE.exec(title);
  if (!m) return { title };
  const remainder = title.slice(m[0].length).trim();
  if (remainder === '') return { title };
  const [, y, mo, d, s] = m;
  const meta = `session handoff · ${y}-${mo}-${d}${s ? ` · s${s}` : ''}`;
  return { title: capitalizeFirst(upperPrTokens(remainder)), meta };
}

/** Split memory content into a humanized {title, excerpt, titleMeta} for row previews. */
export function buildMemoryPreview(content: string): MemoryPreview {
  const lines = content.split('\n').map(stripMarkdownTokens).filter((l) => l !== '');
  if (lines.length === 0) return { title: stripMarkdownTokens(content), excerpt: '' };
  const picked = selectPreviewTitle(lines) ?? { title: lines[0], index: 0 };
  // Machine-provenance lines BEFORE the picked title are dropped from the
  // preview entirely (they're still in the stored content and the drawer).
  const excerpt = sentenceTruncate(lines.slice(picked.index + 1).join(' ').trim());
  const humanized = humanizeMemoryTitle(picked.title);
  return humanized.meta
    ? { title: humanized.title, excerpt, titleMeta: humanized.meta }
    : { title: humanized.title, excerpt };
}
