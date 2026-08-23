/**
 * BEAM 1M — multi-route dated retrieval (E4 retrieval-architecture lever).
 *
 * Eywa's BEAM lead is dominated by COVERAGE / CHRONOLOGICAL-ORDER / CROSS-SESSION
 * retrieval, which a single top-30 similarity route cannot serve. This module
 * builds a deterministic 3-route retrieval over the DATED raw-turn store and
 * fuses it with RRF:
 *
 *   Route V (vector)   : substrate.search.search(q, {limit:kVec})     — existing.
 *   Route T (timeline) : broad similarity fetch (kWide), dated via dateMap;
 *                        parseDateWindow(q) hard-filters to an explicit period
 *                        when present; ranked by DATE-STRATIFIED COVERAGE
 *                        (≤capPerDate turns/date, chronological) so breadth —
 *                        not similarity density — drives event_ordering / summ.
 *   Route E (entity)   : deterministic query-entity extraction → per-entity
 *                        keywordSearch (FTS, phrase-quoted, conv-scoped) → ALL
 *                        cross-session mentions of each entity (multi_session).
 *
 * FUSE: RRF (k=60) over the three ranked frame-id lists → top-N. Then EVERY
 * survivor is dated via the dateMap and rendered oldest→newest as
 * "[YYYY-MM-DD] role: content" (undated turns appended last, unbracketed).
 * Raw turns are kept verbatim (we still win instruction/preference on detail).
 *
 * WHY dateMap and not `created_at`: BEAM ingest writes every turn with
 * created_at = ingest time (all frames share one date), so the substrate's
 * built-in since/until temporal filter cannot separate turns by conversation
 * date. The dateMap (chat.json time_anchor) is the only real per-turn date.
 *
 * Pure retrieval + string assembly; the only I/O is substrate.search (local
 * ollama embeddings + SQLite). No LLM calls here.
 */

import type { SearchResult } from '@waggle/core';
import { parseDateWindow } from '@waggle/core';
import type { Substrate } from './substrate.js';

const RRF_K = 60;

// ── Entity extraction (deterministic, query-side) ────────────────────────────

/** Question words / generic tokens that are never useful retrieval entities. */
const STOP = new Set([
  'what', 'when', 'which', 'where', 'who', 'whom', 'whose', 'why', 'how', 'did',
  'do', 'does', 'have', 'has', 'had', 'was', 'were', 'is', 'are', 'am', 'the',
  'a', 'an', 'my', 'your', 'our', 'their', 'his', 'her', 'its', 'i', 'you', 'we',
  'they', 'it', 'this', 'that', 'these', 'those', 'and', 'or', 'but', 'for', 'to',
  'of', 'in', 'on', 'at', 'by', 'with', 'from', 'about', 'into', 'over', 'after',
  'before', 'between', 'during', 'since', 'until', 'ago', 'many', 'much', 'any',
  'some', 'all', 'each', 'every', 'been', 'be', 'being', 'will', 'would', 'can',
  'could', 'should', 'may', 'might', 'must', 'me', 'us', 'them', 'if', 'then',
  'there', 'here', 'now', 'ever', 'never', 'still', 'yet', 'also', 'just', 'so',
  'than', 'as', 'up', 'out', 'down', 'off', 'no', 'not', 'yes',
  // BEAM probing-question instruction / filler / quantifier words — these recur
  // verbatim ("Mention ONLY and ONLY ten items", "in order", "list every ...")
  // and are never useful retrieval entities.
  'mention', 'only', 'list', 'name', 'named', 'items', 'item', 'order', 'ordered',
  'progress', 'progressed', 'discussion', 'discussions', 'discussed', 'discuss',
  'say', 'said', 'tell', 'give', 'provide', 'describe', 'summarize', 'summary',
  'overview', 'account', 'sequence', 'chronological', 'versions', 'version',
  'thing', 'things', 'stuff', 'first', 'second', 'third', 'fourth', 'fifth', 'last',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'both', 'entire', 'whole', 'total', 'number', 'count',
  'happened', 'occur', 'occurred', 'time', 'times', 'date', 'dates', 'day', 'days',
  'week', 'weeks', 'month', 'months', 'year', 'years',
  'considering', 'using', 'given', 'based', 'regarding', 'concerning',
]);

/**
 * Extract distinctive entities from a question: quoted spans, version/tech
 * tokens (contain a digit or dot, e.g. "React 18.2", "v6.1.0", "port 4000"),
 * lowercase alnum tokens with a digit, and runs of Capitalized words
 * (proper-noun phrases). Deduplicated case-insensitively, capped.
 */
export function extractQueryEntities(question: string, cap = 6): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string): void => {
    const t = raw.trim().replace(/[.,;:?!]+$/, '').trim();
    if (t.length < 3) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    // Skip pure stopwords / question words.
    if (STOP.has(key)) return;
    seen.add(key);
    out.push(t);
  };

  // 1) Quoted spans (highest precision).
  for (const m of question.matchAll(/["'“”‘’]([^"'“”‘’]{2,60})["'“”‘’]/g)) push(m[1]);

  // 2) Version / tech tokens: a token containing a digit (React18, 18.2, v6.1.0,
  //    4000, PostgreSQL14) OR a dotted identifier. Keep an adjacent Capitalized
  //    word as a two-word unit ("React 18.2", "PostgreSQL 14", "port 4000").
  const words = question.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/[(),;:?!]+$/g, '').replace(/^[(),;:?!]+/g, '');
    if (/\d/.test(w) && /[A-Za-z0-9.]/.test(w) && !/^\d{4}$/.test(w) === true) {
      const prev = i > 0 ? words[i - 1].replace(/[(),;:?!]+$/g, '') : '';
      if (prev && (/^[A-Z]/.test(prev) || /^(port|version|v|node|python|react|postgres|postgresql)$/i.test(prev)) && !STOP.has(prev.toLowerCase())) {
        push(`${prev} ${w}`);
      }
      push(w);
    }
  }

  // 3) Runs of Capitalized words (proper-noun phrases), ignoring the leading
  //    sentence-initial capital by only taking runs of length>=1 that aren't a
  //    lone stopword. Multi-word runs are kept whole AND their head token.
  const capRun = /([A-Z][A-Za-z0-9+.#-]*(?:\s+[A-Z][A-Za-z0-9+.#-]*)*)/g;
  for (const m of question.matchAll(capRun)) {
    const phrase = m[1].trim();
    const toks = phrase.split(/\s+/);
    // Drop a leading sentence-initial single-cap common word (e.g. "What").
    if (toks.length === 1) {
      if (!STOP.has(toks[0].toLowerCase()) && toks[0].length >= 4) push(toks[0]);
      continue;
    }
    // Multi-word proper-noun phrase.
    const filtered = toks.filter((t, idx) => !(idx === 0 && STOP.has(t.toLowerCase())));
    if (filtered.length >= 2) push(filtered.join(' '));
    else if (filtered.length === 1 && filtered[0].length >= 4) push(filtered[0]);
  }

  // 4) lowercase alnum tokens that carry a digit (e.g. "franc6", "gpt4") — rare
  //    but distinctive; plain lowercase words are left to Route V/T.
  for (const w of words) {
    const t = w.replace(/[(),;:?!.]+$/g, '');
    if (/^[a-z][a-z0-9.-]*\d[a-z0-9.-]*$/i.test(t)) push(t);
  }

  return out.slice(0, cap);
}

// ── RRF fusion ───────────────────────────────────────────────────────────────

/** RRF-fuse ranked id lists → id → score. Higher = better. */
export function rrfFuse(lists: number[][], k = RRF_K): Map<number, number> {
  const scores = new Map<number, number>();
  for (const list of lists) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    });
  }
  return scores;
}

// ── Timeline route (date-stratified coverage) ────────────────────────────────

interface DatedFrame { id: number; content: string; date: string }

/** Rank a candidate set for COVERAGE: keep ≤capPerDate per date, ordered
 *  chronologically (oldest→newest). Returns frame ids in coverage order. */
function coverageRank(dated: DatedFrame[], capPerDate: number, limit: number): number[] {
  const sorted = [...dated].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));
  const perDate = new Map<string, number>();
  const kept: number[] = [];
  for (const e of sorted) {
    const n = perDate.get(e.date) ?? 0;
    if (n >= capPerDate) continue;
    perDate.set(e.date, n + 1);
    kept.push(e.id);
    if (kept.length >= limit) break;
  }
  return kept;
}

// ── Public: build the fused, dated, chronological context ────────────────────

export interface MultiRouteOptions {
  kVec: number;      // Route V similarity limit (baseline parity, 30)
  kWide: number;     // Route T broad similarity fetch (150)
  perEntity: number; // Route E per-entity FTS limit (20)
  capPerDate: number;// Route T coverage stratification cap (2)
  topN: number;      // fused frames kept for the answer context (45)
}

export const DEFAULT_MULTIROUTE: MultiRouteOptions = {
  kVec: 30, kWide: 150, perEntity: 20, capPerDate: 2, topN: 45,
};

export interface MultiRouteResult {
  /** Dated display strings, oldest→newest, ready for buildAnswerGenerationPromptV2. */
  displayStrings: string[];
  /** Diagnostics. */
  entities: string[];
  dateWindow: { since: string; until: string; label: string } | null;
  nVec: number;
  nTimeline: number;
  nEntity: number;
  nFused: number;
  nDated: number;
}

/**
 * Run all three routes over one conversation's raw-turn mind and return the
 * fused, dated, chronologically-ordered answer context. `dateMap` maps exact
 * frame content ("role: text") → ISO date (from chat.json time_anchor).
 */
export async function buildMultiRouteContext(
  sub: Substrate,
  gopId: string,
  question: string,
  dateMap: Map<string, string> | null,
  opts: MultiRouteOptions = DEFAULT_MULTIROUTE,
): Promise<MultiRouteResult> {
  const frameById = new Map<number, { id: number; content: string }>();
  const record = (r: SearchResult): void => { frameById.set(r.frame.id, { id: r.frame.id, content: r.frame.content }); };
  const dateOf = (content: string): string => dateMap?.get(content) ?? '';

  // Route V — vector (baseline parity).
  const vec = await sub.search.search(question, { limit: opts.kVec, gopId });
  vec.forEach(record);
  const Lv = vec.map(r => r.frame.id);

  // Route T — timeline: broad fetch, date-window filter, coverage rank.
  const wide = await sub.search.search(question, { limit: opts.kWide, gopId });
  wide.forEach(record);
  const window = parseDateWindow(question);
  let widedated: DatedFrame[] = wide.map(r => ({ id: r.frame.id, content: r.frame.content, date: dateOf(r.frame.content) }));
  if (window) {
    const inWin = widedated.filter(e => e.date && e.date >= window.since && e.date <= window.until);
    // Only apply the window if it actually retains evidence; else keep the broad
    // set (a mis-parse must never empty the context).
    if (inWin.length > 0) widedated = inWin;
  }
  const Lt = coverageRank(widedated, opts.capPerDate, opts.kWide);

  // Route E — entity: per-entity FTS across the whole conversation.
  const entities = extractQueryEntities(question);
  const entityHits = new Map<number, number>(); // id → #entities that matched it
  for (const ent of entities) {
    // Phrase-quote multi-word entities so keywordSearch does a phrase match
    // (it passes a query containing a quote through to FTS unchanged).
    const q = /\s/.test(ent) ? `"${ent.replace(/"/g, '')}"` : ent;
    let ids: number[] = [];
    try { ids = await sub.search.keywordSearch(q, opts.perEntity, gopId); } catch { ids = []; }
    for (const id of ids) entityHits.set(id, (entityHits.get(id) ?? 0) + 1);
    // Materialise contents for ids not yet seen by V/T.
    const missing = ids.filter(id => !frameById.has(id));
    if (missing.length) {
      const rawdb = sub.db.getDatabase();
      const ph = missing.map(() => '?').join(',');
      const rows = rawdb.prepare(`SELECT id, content FROM memory_frames WHERE id IN (${ph})`).all(...missing) as Array<{ id: number; content: string }>;
      for (const row of rows) frameById.set(row.id, row);
    }
  }
  // Le ranked by (most entities matched, then id) — frames mentioning more of
  // the question's entities rank higher.
  const Le = [...entityHits.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] - b[0])).map(e => e[0]);

  // FUSE — RRF over the three ranked lists → top-N.
  const fused = rrfFuse([Lv, Lt, Le]);
  const fusedIds = [...fused.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(e => e[0])
    .slice(0, opts.topN);

  // DATE + chronological render: dated turns oldest→newest, undated appended last.
  const entries = fusedIds
    .map(id => frameById.get(id))
    .filter((f): f is { id: number; content: string } => !!f)
    .map(f => ({ id: f.id, content: f.content, date: dateOf(f.content) }));
  entries.sort((a, b) => {
    if (a.date && b.date) return a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1;
    if (a.date) return -1; // dated before undated
    if (b.date) return 1;
    return a.id - b.id;
  });
  const displayStrings = entries.map(e => (e.date ? `[${e.date}] ${e.content}` : e.content));

  return {
    displayStrings,
    entities,
    dateWindow: window,
    nVec: Lv.length,
    nTimeline: Lt.length,
    nEntity: Le.length,
    nFused: fusedIds.length,
    nDated: entries.filter(e => e.date).length,
  };
}
