/**
 * supersede.ts — supersession (P) + bridge (B) frame PRODUCER.
 *
 * The distiller only ever emits I-frames (independent assertions); the
 * substrate's P (partial-update / supersession delta) and B (bridge /
 * cross-link) primitives sat dormant with zero production callers. This module
 * turns them on as a first-class, provider-agnostic capability.
 *
 * PRODUCER vs CONSUMER — read this before renaming or merging. This module is
 * the PRODUCER: it reads UNSTRUCTURED observations, detects supersession chains
 * + enumerable groups, and WRITES P/B frames. The CONSUMERS of those frames
 * live elsewhere and are intentionally NOT here:
 *   - `FrameStore.compact()` merges accumulated P-frames back into their base
 *     I-frame (a downstream housekeeping consumer).
 *   - `packages/weaver/src/consolidation.ts` (MemoryWeaver) consumes P/B frames
 *     (merges I+P into consolidated I-frames, materialises B-frames from KG
 *     entities). Do NOT collapse this file into that name — the two sit on
 *     opposite sides of the P/B lifecycle.
 *
 * Two LLM passes read an I-frame observation set and produce structured
 * consolidation intents:
 *   - Supersession chains — the SAME attribute of the SAME subject whose value
 *     changes over time (follower count 1250 → 1300; job title A → B). We
 *     deprecate the stale members, boost the newest to `critical`, and emit ONE
 *     P-frame carrying the CURRENT value so a "what is X now" read surfaces the
 *     latest, not a stale mention.
 *   - Enumerable entity groups — 2+ observations each describing a DISTINCT
 *     member of one countable class (each aquarium tank; each wedding). We emit
 *     ONE B-frame referencing every member frame so a counting read can expand
 *     it to the COMPLETE set.
 *
 * Provider-agnostic by construction: the caller injects an `llm(system, user)`
 * callback (study harvest/extract-kg-entities.ts for the repo's executor
 * pattern). This module is PURE — no child_process, no fetch, no env reads — so
 * it is trivially unit-testable with a fake llm and safe to call from any
 * executor (CLI `claude -p` subprocess, MCP server, benchmark harness).
 *
 * ⚠️  INDEXING CONTRACT: FrameStore.createPFrame / createBFrame index ONLY the
 * FTS table, NOT the vector table. `applyConsolidation` therefore RETURNS the
 * new frames so the CALLER can vec-index them (e.g. HybridSearch.indexFramesBatch).
 * Skip that step and the P/B frames are keyword-recallable but invisible to
 * semantic search.
 *
 * Ported from the validated LongMemEval experiment
 * (benchmarks/longmemeval/46-consolidate.mjs + 47-answer-pb.mjs): the two
 * prompts below are carried over verbatim, including the clean `current_value`
 * extraction that strips hedges ("about", "around", "close to").
 *
 * Ported from hive-mind 2d0abc5 (mono-parity 2026-07-05, §7.5).
 */

import type { MindDB } from './db.js';
import type { FrameStore, FrameSource, MemoryFrame } from './frames.js';
import { evaluateExternalMemoryIngress } from '../memory-ingress-guard.js';

export const MAX_CONSOLIDATION_OBSERVATIONS = 400;
const MAX_PROMPT_CHARS = 100_000;
const MAX_RESPONSE_CHARS = 100_000;
const MAX_LABEL_CHARS = 256;
const MAX_CURRENT_VALUE_CHARS = 4_000;
const CREATED_AT_SORT_EXPR = `julianday(CASE
  WHEN created_at GLOB '*[+-][0-9][0-9][0-9][0-9]'
  THEN substr(created_at, 1, length(created_at) - 5)
    || substr(created_at, -5, 3) || ':' || substr(created_at, -2)
  ELSE created_at
END)`;

/**
 * LLM callback the consolidation passes inject. Given a system + user message,
 * returns the model's raw text response (JSON is parsed defensively downstream).
 * Provider-agnostic — the caller owns the transport (subprocess, HTTP, etc.).
 */
export type ConsolidationLlm = (system: string, user: string) => Promise<string>;

/** One dated observation fed to the detectors. `id` is the real frame id. */
export interface Observation {
  id: number;
  content: string;
  created_at: string;
}

/** A detected supersession chain, mapped to real frame ids (oldest → newest). */
export interface SupersessionChain {
  /** Short attribute label, e.g. "follower count", "job title". */
  attribute: string;
  /** The clean, unhedged latest value; empty when the model omitted it. */
  currentValue: string;
  /** Member frame ids in oldest → newest order (length ≥ 2). */
  frameIds: number[];
}

/** A detected enumerable entity group, mapped to real frame ids. */
export interface EntityGroup {
  /** Short class name, e.g. "aquarium tanks the user owns". */
  label: string;
  /** Member frame ids (length ≥ 2). */
  frameIds: number[];
}

/** What `applyConsolidation` wrote — returned so the caller can vec-index. */
export interface ConsolidationResult {
  /** Newly created P-frames (current-value deltas). */
  pframes: MemoryFrame[];
  /** Newly created B-frames (member-set bridges). */
  bframes: MemoryFrame[];
  /** Frame ids demoted to importance='deprecated'. */
  deprecated: number[];
}

/** Options for gathering the observation set the detectors run over. */
export interface CollectObservationsOptions {
  /** Scope to a single GOP session; omit for the whole mind. */
  gopId?: string;
  /** Select the latest N eligible observations, returned chronologically. */
  limit?: number;
  /**
   * Which frame source to include. Defaults to 'agent_inferred' (the
   * distiller's output, matching the benchmark). Pass 'any' for every source.
   */
  source?: FrameSource | 'any';
}

// ── Prompts (ported verbatim from 46-consolidate.mjs) ──────────────────────

const SUPERSESSION_SYSTEM =
  'You are given a numbered list of dated observations about ONE user. Identify UPDATE CHAINS: sets of observations that state the SAME attribute of the SAME specific subject where the VALUE CHANGES over time (e.g. follower count 1250 then 1300; job title A then B; where an item is kept). Only genuine supersessions of ONE evolving fact — NOT distinct facts, NOT a count of different items. For each chain give "current_value": the LATEST value as a short, clean, unhedged phrase (e.g. "1300 followers", "in a shoe rack in the closet"), stripping words like "close to", "about", "around". Return JSON {"chains":[{"attribute":"short label","current_value":"clean latest value","ids":[oldest..newest]}]} using the observation numbers as ids. If none, {"chains":[]}.';

const GROUP_SYSTEM =
  'You are given a numbered list of dated observations about ONE user. Identify ENUMERABLE GROUPS: sets of 2+ observations each describing a DISTINCT member of the same countable class that an aggregation question might count or sum (e.g. each aquarium tank the user owns; each wedding attended; each magazine subscription; each workshop with its cost). One group per class. Do NOT include update-chains (same item changing value). Return JSON {"groups":[{"label":"short class name","ids":[...]}]} using observation numbers. If none, {"groups":[]}.';

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Defensive JSON parse of an LLM response (see parseJson in 46). Tries a direct
 * parse first, then falls back to extracting the first balanced-looking `{…}`
 * block from prose (models sometimes wrap JSON in commentary or fences). Returns
 * an empty object when nothing parses — the callers treat "no intents" as a
 * valid, non-fatal outcome rather than throwing on model chatter.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseLlmJson(raw: string): Record<string, unknown> {
  if (typeof raw !== 'string') return {};
  if (raw.length > MAX_RESPONSE_CHARS) return {};
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isRecord(parsed) ? parsed : {};
  } catch {
    // Not a bare JSON document — try to recover an embedded object below.
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed: unknown = JSON.parse(match[0]);
      return isRecord(parsed) ? parsed : {};
    } catch {
      // Embedded block was also malformed — fall through to the empty result.
    }
  }
  return {};
}

/** Fail loudly on malformed input rather than silently producing junk chains. */
function assertObservations(observations: unknown): asserts observations is Observation[] {
  if (!Array.isArray(observations)) {
    throw new TypeError('consolidate: observations must be an array');
  }
  for (const o of observations) {
    if (!o || typeof o !== 'object') {
      throw new TypeError('consolidate: each observation must be an object');
    }
    const rec = o as Record<string, unknown>;
    if (!Number.isSafeInteger(rec.id) || Number(rec.id) <= 0) {
      throw new TypeError('consolidate: observation.id must be a positive safe integer');
    }
    if (typeof rec.content !== 'string') {
      throw new TypeError('consolidate: observation.content must be a string');
    }
    if (typeof rec.created_at !== 'string') {
      throw new TypeError('consolidate: observation.created_at must be a string');
    }
    if (!Number.isFinite(observationTime(rec.created_at))) {
      throw new TypeError('consolidate: observation.created_at must be a valid timestamp');
    }
  }
}

const SQLITE_TIMESTAMP_RE =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(?:Z|([+-])(\d{2}):?(\d{2}))?$/;

function observationTime(value: string): number {
  const match = SQLITE_TIMESTAMP_RE.exec(value.trim());
  if (!match) return Number.NaN;

  const [, date, time, fraction = '', sign, hour, minute] = match;
  if (hour && (Number(hour) > 14 || Number(minute) > 59)) return Number.NaN;

  const firstThree = Number((fraction + '000').slice(0, 3));
  const millis = Math.min(999, firstThree + ((fraction[3] ?? '0') >= '5' ? 1 : 0));
  const zone = sign ? `${sign}${hour}:${minute}` : 'Z';
  return Date.parse(`${date}T${time}.${String(millis).padStart(3, '0')}${zone}`);
}

function normalizeObservations(observations: Observation[]): Observation[] {
  const sorted = [...observations].sort((a, b) => {
    const timeDelta = observationTime(a.created_at) - observationTime(b.created_at);
    return timeDelta || a.id - b.id;
  });
  const seen = new Set<number>();
  return sorted.filter(({ id }) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function prepareDetectionPrompt(
  observations: Observation[],
  system: string,
  operation: string,
): { normalized: Observation[]; user: string } {
  assertObservations(observations);
  if (observations.length > MAX_CONSOLIDATION_OBSERVATIONS) {
    throw new RangeError(
      `${operation}: at most ${MAX_CONSOLIDATION_OBSERVATIONS} observations are allowed`,
    );
  }
  const normalized = normalizeObservations(observations);
  const lines: string[] = [];
  let userChars = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const observation = normalized[index];
    const prefix = `${index + 1}. [${observation.created_at.slice(0, 10)}] `;
    const addedChars = (index > 0 ? 1 : 0) + prefix.length + observation.content.length;
    if (system.length + userChars + addedChars > MAX_PROMPT_CHARS) {
      throw new RangeError(`${operation}: prompt exceeds ${MAX_PROMPT_CHARS} characters`);
    }
    lines.push(prefix + observation.content);
    userChars += addedChars;
  }
  return { normalized, user: lines.join('\n') };
}

function safeModelText(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (text.length > maxChars) return null;
  if (text && evaluateExternalMemoryIngress({ content: text }).action !== 'allow') return null;
  return text;
}

/**
 * Map the model's 1-based observation numbers back to real frame ids. Invalid /
 * out-of-range / duplicate numbers are dropped. When `sortByAge` is set the ids
 * are returned in observation order (which is created_at, id order = oldest →
 * newest) regardless of the order the model emitted them — the supersession
 * pass relies on the last id being the genuinely newest member.
 */
function mapNumbersToFrameIds(
  numbers: unknown,
  observations: Observation[],
  sortByAge: boolean,
): number[] {
  if (!Array.isArray(numbers)) return [];
  const indices: number[] = [];
  const seen = new Set<number>();
  for (const n of numbers) {
    if (typeof n !== 'number' || !Number.isSafeInteger(n)) continue;
    const idx = n;
    if (idx < 1 || idx > observations.length) continue;
    if (seen.has(idx)) continue;
    seen.add(idx);
    indices.push(idx);
  }
  if (sortByAge) indices.sort((a, b) => a - b);
  return indices.map((i) => observations[i - 1].id);
}

// ── Detection passes ───────────────────────────────────────────────────────

/**
 * Detect supersession chains via the LLM. Returns chains whose member ids map
 * to ≥ 2 real frames, oldest → newest. Never throws on model chatter — a
 * malformed / empty response yields `[]`. The injected `llm` IS allowed to
 * throw (transport failures surface to the caller; they are not swallowed).
 */
export async function detectSupersessionChains(
  observations: Observation[],
  llm: ConsolidationLlm,
): Promise<SupersessionChain[]> {
  if (typeof llm !== 'function') {
    throw new TypeError('detectSupersessionChains: llm must be a function');
  }
  const { normalized, user } = prepareDetectionPrompt(
    observations,
    SUPERSESSION_SYSTEM,
    'detectSupersessionChains',
  );
  if (normalized.length < 2) return [];

  const raw = await llm(SUPERSESSION_SYSTEM, user);
  const parsed = parseLlmJson(raw);
  const rawChains = Array.isArray(parsed.chains) ? parsed.chains : [];

  const chains: SupersessionChain[] = [];
  for (const entry of rawChains) {
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const frameIds = mapNumbersToFrameIds(rec.ids, normalized, true);
    if (frameIds.length < 2) continue;
    const attribute = safeModelText(rec.attribute, MAX_LABEL_CHARS);
    const currentValue = safeModelText(rec.current_value, MAX_CURRENT_VALUE_CHARS);
    if (attribute === null || currentValue === null) continue;
    chains.push({ attribute: attribute || 'value', currentValue, frameIds });
  }
  return chains;
}

/**
 * Detect enumerable entity groups via the LLM. Returns groups whose member ids
 * map to ≥ 2 real frames (member order preserved as emitted). Same throw
 * contract as `detectSupersessionChains`.
 */
export async function detectEntityGroups(
  observations: Observation[],
  llm: ConsolidationLlm,
): Promise<EntityGroup[]> {
  if (typeof llm !== 'function') {
    throw new TypeError('detectEntityGroups: llm must be a function');
  }
  const { normalized, user } = prepareDetectionPrompt(
    observations,
    GROUP_SYSTEM,
    'detectEntityGroups',
  );
  if (normalized.length < 2) return [];

  const raw = await llm(GROUP_SYSTEM, user);
  const parsed = parseLlmJson(raw);
  const rawGroups = Array.isArray(parsed.groups) ? parsed.groups : [];

  const groups: EntityGroup[] = [];
  for (const entry of rawGroups) {
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const frameIds = mapNumbersToFrameIds(rec.ids, normalized, false);
    if (frameIds.length < 2) continue;
    const label = safeModelText(rec.label, MAX_LABEL_CHARS);
    if (label === null) continue;
    groups.push({ label: label || 'group', frameIds });
  }
  return groups;
}

// ── Application pass ───────────────────────────────────────────────────────

/**
 * Apply detected chains + groups to a FrameStore. For each chain: deprecate the
 * stale members, boost the newest to `critical`, and emit a P-frame carrying the
 * clean current value (base = oldest member). For each group: emit a B-frame
 * referencing every member (base = first member).
 *
 * All new frames land under `gopId` (a valid session gop_id) while their
 * base_frame_id / references still point at the original — possibly cross-gop —
 * source frames.
 *
 * ⚠️  The returned `pframes` / `bframes` are FTS-indexed only (createPFrame /
 * createBFrame do not touch the vector table). The caller MUST vec-index them
 * (e.g. `HybridSearch.indexFramesBatch`) for semantic search to reach them.
 */
export function applyConsolidation(
  frames: FrameStore,
  chains: SupersessionChain[],
  groups: EntityGroup[],
  gopId: string,
): ConsolidationResult {
  if (!frames || typeof frames.createPFrame !== 'function') {
    throw new TypeError('applyConsolidation: frames must be a FrameStore');
  }
  if (typeof gopId !== 'string' || !gopId) {
    throw new Error('applyConsolidation: gopId is required');
  }

  const pframes: MemoryFrame[] = [];
  const bframes: MemoryFrame[] = [];
  const deprecated: number[] = [];

  for (const chain of chains ?? []) {
    const ids = chain.frameIds;
    if (!Array.isArray(ids) || ids.length < 2) continue;

    const baseId = ids[0];
    const newestId = ids[ids.length - 1];
    const newest = frames.getById(newestId);
    if (!newest) continue; // newest member gone — cannot anchor a current value

    const cleanValue = chain.currentValue.trim() ? chain.currentValue.trim() : newest.content;
    const attribute = chain.attribute.trim() ? chain.attribute.trim() : 'value';
    const asOf = String(newest.created_at).slice(0, 10);
    const pContent = `[current] ${attribute}: ${cleanValue}  (as of ${asOf})`;
    if (evaluateExternalMemoryIngress({ content: pContent }).action !== 'allow') continue;

    // Deprecate every stale member (all but the newest).
    for (const staleId of ids.slice(0, -1)) {
      const stale = frames.getById(staleId);
      if (!stale) continue;
      frames.update(staleId, stale.content, 'deprecated');
      deprecated.push(staleId);
    }
    // Boost the surviving newest so it wins recall ties.
    frames.update(newestId, newest.content, 'critical');

    pframes.push(frames.createPFrame(gopId, pContent, baseId, 'critical', 'agent_inferred'));
  }

  for (const group of groups ?? []) {
    const ids = group.frameIds;
    if (!Array.isArray(ids) || ids.length < 2) continue;
    const label = group.label.trim() ? group.label.trim() : 'group';
    const desc = `${label} (${ids.length} members)`;
    const persisted = JSON.stringify({ description: desc, references: ids });
    if (
      evaluateExternalMemoryIngress({ content: desc }).action !== 'allow'
      || evaluateExternalMemoryIngress({ content: persisted }).action !== 'allow'
    ) continue;
    bframes.push(frames.createBFrame(gopId, desc, ids[0], ids));
  }

  return { pframes, bframes, deprecated };
}

// ── Read helpers ───────────────────────────────────────────────────────────

/**
 * Gather the observation set the detectors run over: non-deprecated I-frames,
 * chronological. Keeps the query in one place so the CLI + MCP wiring stays
 * thin. `limit` caps the LLM prompt size on large minds.
 */
export function collectObservations(
  db: MindDB,
  options: CollectObservationsOptions = {},
): Observation[] {
  const raw = db.getDatabase();
  const conditions = ["frame_type = 'I'", "importance != 'deprecated'"];
  const params: unknown[] = [];

  const source = options.source ?? 'agent_inferred';
  if (source !== 'any') {
    conditions.push('source = ?');
    params.push(source);
  }
  if (options.gopId) {
    conditions.push('gop_id = ?');
    params.push(options.gopId);
  }

  if (options.limit && options.limit > 0) {
    params.push(options.limit);
    const sql = `
      SELECT id, content, created_at
      FROM (
        SELECT id, content, created_at
        FROM memory_frames
        WHERE ${conditions.join(' AND ')}
        ORDER BY ${CREATED_AT_SORT_EXPR} DESC, id DESC
        LIMIT ?
      )
      ORDER BY ${CREATED_AT_SORT_EXPR} ASC, id ASC
    `;
    return raw.prepare(sql).all(...params) as Observation[];
  }
  const sql = `SELECT id, content, created_at FROM memory_frames WHERE ${conditions.join(' AND ')} ORDER BY ${CREATED_AT_SORT_EXPR}, id`;
  return raw.prepare(sql).all(...params) as Observation[];
}

/**
 * Current-value lines from the P-frames written by `applyConsolidation`, with
 * the `[current]` marker stripped, chronological. Feed into a read context's
 * "current values" block so a stale mention never wins a "what is X now" answer.
 * Scope to a single GOP via `gopId`, or omit for the whole mind.
 */
export function getCurrentValues(db: MindDB, gopId?: string): string[] {
  const raw = db.getDatabase();
  const rows = (
    gopId
      ? raw
          .prepare(
            `SELECT content, importance FROM memory_frames WHERE frame_type = 'P' AND substr(content, 1, 10) = '[current] ' AND gop_id = ? ORDER BY ${CREATED_AT_SORT_EXPR} DESC, id DESC`,
          )
          .all(gopId)
      : raw
          .prepare(`SELECT content, importance FROM memory_frames WHERE frame_type = 'P' AND substr(content, 1, 10) = '[current] ' ORDER BY ${CREATED_AT_SORT_EXPR} DESC, id DESC`)
          .all()
  ) as Array<{ content: string; importance: string }>;

  const seen = new Set<string>();
  const current: string[] = [];
  for (const row of rows) {
    const line = String(row.content).replace(/^\[current\]\s*/, '').trim();
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().replace(/\s+/g, ' ').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (row.importance === 'deprecated') continue;
    current.push(line);
  }
  return current.reverse();
}
