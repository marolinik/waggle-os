import type { ImportItemType, UniversalImportItem } from '@waggle/core';
import type { MemoryKind } from '@waggle/shared';

/**
 * UX-Refactor Phase 2B.3 — server-side harvest classification.
 *
 * Two pure helpers used by the harvest preview/commit path:
 *  1. `importItemTypeToMemoryKind` — maps the 8 harvest `ImportItemType` values
 *     onto the canonical PRD §15.2 `MemoryKind` vocabulary (B6). This lives in
 *     the server (not `@waggle/shared`) because the build order forbids shared
 *     from importing the hive-mind-core `ImportItemType` union; the server
 *     imports both. The FE display-category map is the mirror in
 *     `apps/web/src/lib/harvest-kind-map.ts`.
 *  2. `harvestConfidence` — the B2 heuristic confidence (0-100): a blend of
 *     source-trust × adapter-item-type, NO per-import LLM call. (The dedup-boost
 *     signal and LLM scoring are reserved for the standing J08 review queue, per
 *     the B2 ratification — computing dedup here would re-introduce the O(n·500)
 *     per-item store scan the commit path deliberately avoids.)
 */

const IMPORT_ITEM_TYPE_TO_MEMORY_KIND: Record<ImportItemType, MemoryKind> = {
  conversation: 'fact',
  memory: 'fact',
  instruction: 'preference',
  preference: 'preference',
  artifact: 'fact',
  rule: 'preference',
  decision: 'decision',
  document: 'fact',
};

export function importItemTypeToMemoryKind(type: ImportItemType): MemoryKind {
  return IMPORT_ITEM_TYPE_TO_MEMORY_KIND[type] ?? 'fact';
}

/** Baseline trust by adapter source — all are the user's OWN exports, so the
 *  floor is high; structured/curated sources edge above noisier chat dumps. */
const SOURCE_TRUST: Record<string, number> = {
  claude: 85,
  'claude-code': 88,
  claudeCode: 88,
  chatgpt: 80,
  gemini: 80,
  perplexity: 72,
  cursor: 78,
  unknown: 62,
};

/** Trust by semantic item type — an explicit decision/preference/rule carries
 *  more standalone signal than a raw conversation turn. */
const TYPE_TRUST: Record<ImportItemType, number> = {
  decision: 95,
  preference: 90,
  instruction: 90,
  rule: 90,
  memory: 80,
  document: 76,
  artifact: 74,
  conversation: 64,
};

/**
 * Heuristic confidence in [0,100]. Lightly weights the semantic type over the
 * raw source (the type is the stronger signal of standalone trustworthiness).
 */
export function harvestConfidence(item: Pick<UniversalImportItem, 'type' | 'source'>): number {
  const s = SOURCE_TRUST[item.source] ?? SOURCE_TRUST.unknown;
  const t = TYPE_TRUST[item.type] ?? 70;
  return Math.round(0.45 * s + 0.55 * t);
}
