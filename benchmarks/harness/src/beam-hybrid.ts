/**
 * BEAM 1M — "hybrid" retrieval merge (Option B).
 *
 * mem0's 0.641 comes from retrieving compact DATED FACTS presented
 * CHRONOLOGICALLY (oldest-first). Our raw-turn cell wins on detail abilities but
 * loses on summarization / event_ordering / instruction / preference. The hybrid
 * cell combines BOTH sources into ONE context sorted chronologically:
 *
 *   - a few RAW turns  (minds-1M,     content = "user: …" / "assistant: …",
 *                       undated — dates come from the per-conv date-map sidecar)
 *   - many FACTS       (minds-1M-obs, content already begins "[YYYY-MM-DD] fact")
 *
 * `mergeHybrid` is a PURE function: it takes the two already-fetched result sets
 * plus the raw-turn date-map and returns a single list of entries, each reduced
 * to `{ date, text }` where `text` NEVER carries a leading date bracket. Rendering
 * `"[date] text"` therefore stamps every entry EXACTLY ONCE (facts are
 * bracket-stripped first, so no double-bracket; raw turns get their date from the
 * map). The caller passes `displayStrings` straight to the v2 answer prompt,
 * bypassing the date-map re-stamp in beam-date-map.ts.
 *
 * SORT: chronological, oldest-first, by ISO date string. The sort is made fully
 * deterministic with an explicit insertion-order tiebreaker (`order`): raw turns
 * are inserted before facts, so on an equal date a raw turn precedes a fact, and
 * within one kind the retrieval order is preserved. Undated entries carry date ''
 * which is lexically smallest, so they sort FIRST (and are counted as date
 * misses for the raw-turn hit-rate).
 */

import type { SearchResult } from '@waggle/core';

/** Leading "[YYYY-MM-DD] " on a distilled fact. */
const FACT_DATE_RE = /^\[(\d{4}-\d{2}-\d{2})\]\s*/;

export interface HybridEntry {
  /** ISO 'YYYY-MM-DD', or '' when no date is known (sorts first). */
  date: string;
  /** Display text WITHOUT any leading date bracket. */
  text: string;
  kind: 'raw' | 'fact';
  /** Insertion index — deterministic tiebreaker for equal dates. */
  order: number;
}

export interface HybridMerge {
  /** Final, already-dated display lines, oldest-first: "[date] text" (or bare
   *  `text` when undated). Pass straight to buildAnswerGenerationPromptV2. */
  displayStrings: string[];
  entries: HybridEntry[];
  /** Raw turns whose content was found in the date-map (dated). */
  rawDated: number;
  /** Total raw turns retrieved (rawDated / rawTotal = raw-date hit-rate). */
  rawTotal: number;
}

/**
 * Merge raw turns + distilled facts into one chronologically-sorted, singly-dated
 * list. Pure — no I/O. `dateMap` is the per-conv content→ISO-date map built by
 * beam-date-map.ts (keyed by the exact raw frame content "role: content").
 */
export function mergeHybrid(
  rawResults: readonly SearchResult[],
  factResults: readonly SearchResult[],
  dateMap: Map<string, string> | null,
): HybridMerge {
  const entries: HybridEntry[] = [];
  let order = 0;
  let rawDated = 0;
  const rawTotal = rawResults.length;

  // Raw turns: content is "user: …" / "assistant: …" (no date). Date, if any,
  // comes from the date-map keyed by the exact frame content.
  for (const r of rawResults) {
    const content = r.frame.content;
    const date = dateMap?.get(content) ?? '';
    if (date) rawDated++;
    entries.push({ date, text: content, kind: 'raw', order: order++ });
  }

  // Facts: content already begins "[YYYY-MM-DD] fact" — strip the bracket so the
  // single render step below re-applies exactly one "[date] " prefix.
  for (const r of factResults) {
    const content = r.frame.content;
    const m = FACT_DATE_RE.exec(content);
    const date = m ? m[1] : '';
    const text = m ? content.slice(m[0].length) : content;
    entries.push({ date, text, kind: 'fact', order: order++ });
  }

  // Stable, deterministic chronological sort (oldest-first). Equal dates keep
  // insertion order → raw-before-fact, then retrieval order within a kind.
  entries.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1));

  const displayStrings = entries.map(e => (e.date ? `[${e.date}] ${e.text}` : e.text));
  return { displayStrings, entries, rawDated, rawTotal };
}
