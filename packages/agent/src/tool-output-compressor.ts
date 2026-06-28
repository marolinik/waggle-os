/**
 * Pure-code tool-result compression — the portable subset of OpenHuman's
 * "TokenJuice" (see docs/analysis/openhuman-adoption-2026-06-28.md §3.A).
 *
 * Design contract (load-bearing):
 *  - SUBTRACTIVE ONLY: crush / dedup / truncate. Never adds content.
 *  - NEVER ENLARGES: if a transform would grow the string, return the original.
 *  - NEVER THROWS: any parse/format failure falls through to passthrough.
 *  - PASSTHROUGH below a small gate (cheap outputs aren't worth touching).
 *  - NO LLM, NO tree-sitter, NO rule overlay, NO ML model. Deliberately scoped.
 *
 * Because it is subtractive-only, it is safe to run AFTER injection scanning:
 * the scanner always sees the full original, and removing/reformatting an
 * already-validated subset cannot hide an injection from it.
 */

const COMPRESS_GATE_CHARS = 2048;
const MAX_TABLE_ROWS = 40;
const HEAD_ROWS = 20;
const TAIL_ROWS = 8;
const MAX_TABLE_COLS = 24;
const ERROR_RE = /\b(error|panic|fail(?:ed|ure)?|exception|fatal|denied|timeout)\b/i;

/**
 * Compress a tool-result string, or return it unchanged. The single entry point
 * used by the tool executor on the model-facing result.
 */
export function compressToolOutput(result: string): string {
  if (typeof result !== 'string' || result.length <= COMPRESS_GATE_CHARS) return result;
  try {
    const crushed = crushJsonTable(result);
    return crushed.length < result.length ? crushed : result; // never enlarge
  } catch {
    return result; // never throw
  }
}

/**
 * Array-of-objects JSON → a compact pipe-delimited table. The win is dropping
 * the repeated key names (huge on API list responses); rows beyond a cap are
 * elided, but head/tail rows, any error-bearing row, and numeric outliers are
 * force-kept so signal survives. Returns the original string when not applicable.
 */
function crushJsonTable(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }

  // Accept a top-level array, or a single `{ key: array-of-objects }` wrapper.
  let arr: unknown[] | null = null;
  let prefix = '';
  if (Array.isArray(parsed)) {
    arr = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const entries = Object.entries(parsed as Record<string, unknown>);
    const arrayEntries = entries.filter(([, v]) => Array.isArray(v) && (v as unknown[]).length >= 3);
    if (arrayEntries.length === 1) {
      arr = arrayEntries[0][1] as unknown[];
      const scalars = entries.filter(([, v]) => v === null || typeof v !== 'object');
      if (scalars.length) prefix = scalars.map(([k, v]) => `${k}=${String(v)}`).join(' ') + '\n';
    }
  }
  if (!arr || arr.length < 3) return raw;

  // Require a homogeneous array of plain objects; otherwise bail (don't risk loss).
  const rows = arr.filter(
    (x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x),
  );
  if (rows.length !== arr.length) return raw;

  // Union of keys, first-seen order.
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); keys.push(k); }
  if (keys.length === 0 || keys.length > MAX_TABLE_COLS) return raw;

  const keep = selectRows(rows, keys);
  const lines: string[] = [keys.join(' | ')];
  let last = -1;
  for (const idx of keep) {
    if (idx > last + 1) lines.push(`… (${idx - last - 1} rows omitted) …`);
    lines.push(keys.map((k) => cell(rows[idx][k])).join(' | '));
    last = idx;
  }
  if (last < rows.length - 1) lines.push(`… (${rows.length - 1 - last} rows omitted) …`);

  return prefix + lines.join('\n');
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Escape the column delimiter so a value containing '|' can't forge an extra
  // table column (structural integrity of the pipe table).
  return s.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
}

/** Indices to render: all rows when small; else head + tail + error rows + numeric outliers. */
function selectRows(rows: ReadonlyArray<Record<string, unknown>>, keys: readonly string[]): number[] {
  const n = rows.length;
  if (n <= MAX_TABLE_ROWS) return rows.map((_, i) => i);

  const keep = new Set<number>();
  for (let i = 0; i < HEAD_ROWS && i < n; i++) keep.add(i);
  for (let i = Math.max(0, n - TAIL_ROWS); i < n; i++) keep.add(i);
  for (let i = 0; i < n; i++) if (ERROR_RE.test(JSON.stringify(rows[i]))) keep.add(i);

  // Force-keep numeric outliers (>2σ) on the first consistently-numeric column.
  const numKey = keys.find((k) => rows.every((r) => typeof r[k] === 'number'));
  if (numKey) {
    const vals = rows.map((r) => r[numKey] as number);
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    if (sd > 0) for (let i = 0; i < n; i++) if (Math.abs(vals[i] - mean) > 2 * sd) keep.add(i);
  }
  return [...keep].sort((a, b) => a - b);
}

// ── Token estimation + grapheme-safe truncation ──────────────────────────
// A cheap, dependency-free estimate. CJK / Hiragana / Katakana / Hangul ≈ 1
// token/char; other scripts ≈ 0.25. Grapheme-safe so a surrogate pair (emoji)
// or multibyte char is never split mid-codepoint.

function cjkWeight(code: number): number {
  if (code >= 0x10000) return 2; // emoji / non-BMP ≈ 2 tokens in most tokenizers
  return (code >= 0x3000 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff)
    ? 1
    : 0.25;
}

/** Dependency-free, CJK-aware token estimate. */
export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const ch of text) tokens += cjkWeight(ch.codePointAt(0) ?? 0);
  return Math.ceil(tokens);
}

/**
 * Truncate to ~maxTokens, cutting on a code-point boundary (never splits an
 * emoji / surrogate pair / multibyte char). A token budget normalizes the cap
 * across scripts where a fixed CHARACTER cap does not (10k CJK chars ≈ 10k
 * tokens, but 10k English chars ≈ 2.5k tokens).
 */
export function truncateToTokenBudget(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return '';
  if (estimateTokens(text) <= maxTokens) return text;
  let used = 0;
  let out = '';
  for (const ch of text) {
    used += cjkWeight(ch.codePointAt(0) ?? 0);
    if (used > maxTokens) break;
    out += ch;
  }
  return `${out}\n… [truncated]`;
}

// ── Near-duplicate text dedup (for live search snippets) ──────────────────
// Mirrors the trigram-cosine in packages/hive-mind-core/src/harvest/dedup.ts;
// kept local so this module stays a standalone pure utility (the harvest copy
// operates on DistilledKnowledge, not arbitrary result items).

function normalizeForTrigram(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function trigramSimilarity(a: string, b: string): number {
  const na = normalizeForTrigram(a);
  const nb = normalizeForTrigram(b);
  const ta = new Set<string>();
  const tb = new Set<string>();
  for (let i = 0; i <= na.length - 3; i++) ta.add(na.slice(i, i + 3));
  for (let i = 0; i <= nb.length - 3; i++) tb.add(nb.slice(i, i + 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

/**
 * Drop items whose text is >= `threshold` trigram-similar to an earlier kept
 * item (order-preserving). Used to collapse near-duplicate search snippets
 * before they are formatted into the tool result.
 */
export function dedupTextResults<T>(
  items: readonly T[],
  getText: (it: T) => string,
  threshold = 0.85,
): T[] {
  const kept: T[] = [];
  const keptTexts: string[] = [];
  for (const it of items) {
    const text = getText(it);
    let dup = false;
    for (const prev of keptTexts) {
      if (trigramSimilarity(text, prev) >= threshold) { dup = true; break; }
    }
    if (!dup) { kept.push(it); keptTexts.push(text); }
  }
  return kept;
}
