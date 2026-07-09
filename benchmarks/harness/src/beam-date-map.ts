/**
 * BEAM 1M — per-conversation content→date map for the v2 answer prompt.
 *
 * The raw-turn minds (minds-1M) store each frame's content as
 * `"${role}: ${text}"` with NO dates. BEAM's chat.json anchors each SESSION
 * (batch) with a SINGLE `time_anchor` on its opening `main_question`; every
 * later turn in that session inherits it. This module rebuilds, per
 * conversation, a Map from the exact frame-content string to an ISO date so the
 * v2 path in beam-run-1m.ts can prefix each retrieved memory with
 * `"[YYYY-MM-DD] role: ..."` — giving the contradiction / temporal rules real
 * dates to reason over. v1 never calls this (byte-identical undated behaviour).
 *
 * Keying MUST match beam-ingest-1m.ts::flattenChatJson + ingest-beam.ts exactly:
 *   key = `${String(msg.role).toLowerCase()}: ${String(msg.content).trim()}`
 * for every NON-EMPTY message, walked in batches → turn-groups → messages order.
 */

import fs from 'node:fs';

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

/** "March-01-2024" → "2024-03-01". Returns null when unparseable. */
export function normalizeTimeAnchor(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parts = String(raw).trim().split('-');
  if (parts.length !== 3) return null;
  const mm = MONTHS[parts[0].toLowerCase()];
  const dd = parts[1].padStart(2, '0');
  const yyyy = parts[2];
  if (!mm || !/^\d{4}$/.test(yyyy) || !/^\d{2}$/.test(dd)) return null;
  return `${yyyy}-${mm}-${dd}`;
}

interface RawMsg { role?: string; content?: string; time_anchor?: string }
interface RawBatch { turns?: RawMsg[][]; time_anchor?: string }

/**
 * Build a content→isoDate map for one conversation's chat.json.
 *
 * Dates propagate FORWARD: the last-seen anchor (batch-level, else message-level
 * on the session's opening question) applies to every subsequent turn until the
 * next anchor. The FIRST occurrence of a given content string wins, mirroring
 * the ingest dedup (which keeps the first frame for duplicate content).
 */
export function buildConvDateMap(chatJsonPath: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(chatJsonPath)) return map;
  const batches = JSON.parse(fs.readFileSync(chatJsonPath, 'utf-8')) as RawBatch[];
  let current: string | null = null;
  for (const batch of batches) {
    const batchDate = normalizeTimeAnchor(batch.time_anchor);
    if (batchDate) current = batchDate;
    if (!Array.isArray(batch.turns)) continue;
    for (const group of batch.turns) {
      if (!Array.isArray(group)) continue;
      for (const msg of group) {
        const role = String(msg.role ?? 'unknown').toLowerCase();
        const content = String(msg.content ?? '').trim();
        if (!content) continue;
        const msgDate = normalizeTimeAnchor(msg.time_anchor);
        if (msgDate) current = msgDate;
        if (current === null) continue; // no anchor seen yet → leave undated
        const key = `${role}: ${content}`;
        if (!map.has(key)) map.set(key, current);
      }
    }
  }
  return map;
}

/**
 * v2 memory rendering: prefix `"[date] "` when the map has the content AND it is
 * not already bracketed (distilled-fact minds already embed `[YYYY-MM-DD]` — do
 * not double-stamp). For v1 (or a null map) memories are returned unchanged, so
 * the v1 path stays byte-identical to the original undated behaviour.
 */
export function renderMemories(
  memories: string[],
  dateMap: Map<string, string> | null,
  prompt: 'v1' | 'v2',
): string[] {
  if (prompt !== 'v2' || !dateMap) return memories;
  return memories.map(m => {
    if (m.startsWith('[')) return m; // already dated (e.g. distilled facts)
    const d = dateMap.get(m);
    return d ? `[${d}] ${m}` : m;
  });
}

/**
 * Coverage of a set of mind frame-contents by the date map — for the per-conv
 * hit-rate log. Already-bracketed contents are excluded from the denominator
 * (they are pre-dated and never stamped).
 */
export function computeDateHitRate(
  contents: readonly string[],
  dateMap: Map<string, string>,
): { dated: number; total: number } {
  let dated = 0;
  let total = 0;
  for (const c of contents) {
    if (c.startsWith('[')) continue;
    total++;
    if (dateMap.has(c)) dated++;
  }
  return { dated, total };
}
