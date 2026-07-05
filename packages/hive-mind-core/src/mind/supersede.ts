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
  /** Cap the number of observations (keeps the LLM prompt bounded). */
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
function parseLlmJson(raw: string): Record<string, unknown> {
  if (typeof raw !== 'string') return {};
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // Not a bare JSON document — try to recover an embedded object below.
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
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
    if (!Number.isInteger(rec.id)) {
      throw new TypeError('consolidate: observation.id must be an integer');
    }
    if (typeof rec.content !== 'string') {
      throw new TypeError('consolidate: observation.content must be a string');
    }
  }
}

/** Render the observations as a `N. [YYYY-MM-DD] content` numbered list. */
function numberObservations(observations: Observation[]): string {
  return observations
    .map((o, idx) => `${idx + 1}. [${String(o.created_at ?? '').slice(0, 10)}] ${o.content}`)
    .join('\n');
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
    const idx = Number(n);
    if (!Number.isInteger(idx) || idx < 1 || idx > observations.length) continue;
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
  assertObservations(observations);
  if (typeof llm !== 'function') {
    throw new TypeError('detectSupersessionChains: llm must be a function');
  }
  if (observations.length < 2) return [];

  const raw = await llm(SUPERSESSION_SYSTEM, numberObservations(observations));
  const parsed = parseLlmJson(raw);
  const rawChains = Array.isArray(parsed.chains) ? parsed.chains : [];

  const chains: SupersessionChain[] = [];
  for (const entry of rawChains) {
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const frameIds = mapNumbersToFrameIds(rec.ids, observations, true);
    if (frameIds.length < 2) continue;
    const attribute = typeof rec.attribute === 'string' ? rec.attribute.trim() : '';
    const currentValue = typeof rec.current_value === 'string' ? rec.current_value.trim() : '';
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
  assertObservations(observations);
  if (typeof llm !== 'function') {
    throw new TypeError('detectEntityGroups: llm must be a function');
  }
  if (observations.length < 2) return [];

  const raw = await llm(GROUP_SYSTEM, numberObservations(observations));
  const parsed = parseLlmJson(raw);
  const rawGroups = Array.isArray(parsed.groups) ? parsed.groups : [];

  const groups: EntityGroup[] = [];
  for (const entry of rawGroups) {
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const frameIds = mapNumbersToFrameIds(rec.ids, observations, false);
    if (frameIds.length < 2) continue;
    const label = typeof rec.label === 'string' ? rec.label.trim() : '';
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

    // Deprecate every stale member (all but the newest).
    for (const staleId of ids.slice(0, -1)) {
      const stale = frames.getById(staleId);
      if (!stale) continue;
      frames.update(staleId, stale.content, 'deprecated');
      deprecated.push(staleId);
    }
    // Boost the surviving newest so it wins recall ties.
    frames.update(newestId, newest.content, 'critical');

    // Emit the current-value P-frame (base = oldest), preferring the model's
    // clean value and falling back to the newest frame's raw content.
    const cleanValue = chain.currentValue.trim() ? chain.currentValue.trim() : newest.content;
    const attribute = chain.attribute.trim() ? chain.attribute.trim() : 'value';
    const asOf = String(newest.created_at).slice(0, 10);
    const pContent = `[current] ${attribute}: ${cleanValue}  (as of ${asOf})`;
    pframes.push(frames.createPFrame(gopId, pContent, baseId, 'critical', 'agent_inferred'));
  }

  for (const group of groups ?? []) {
    const ids = group.frameIds;
    if (!Array.isArray(ids) || ids.length < 2) continue;
    const label = group.label.trim() ? group.label.trim() : 'group';
    const desc = `${label} (${ids.length} members)`;
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

  let sql = `SELECT id, content, created_at FROM memory_frames WHERE ${conditions.join(' AND ')} ORDER BY created_at, id`;
  if (options.limit && options.limit > 0) {
    sql += ' LIMIT ?';
    params.push(options.limit);
  }
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
            "SELECT content FROM memory_frames WHERE frame_type = 'P' AND gop_id = ? ORDER BY created_at, id",
          )
          .all(gopId)
      : raw
          .prepare("SELECT content FROM memory_frames WHERE frame_type = 'P' ORDER BY created_at, id")
          .all()
  ) as Array<{ content: string }>;

  return rows
    .map((r) => String(r.content).replace(/^\[current\]\s*/, '').trim())
    .filter(Boolean);
}
