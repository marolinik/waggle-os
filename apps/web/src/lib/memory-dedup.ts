import type { Memory } from '@/lib/types';
import { normalizeMemoryKey, isGroupableKey } from '@/lib/memory-text-normalize';

/**
 * W4B (F22) — display-layer dedup for the Memories tab.
 *
 * Groups near-identical memories (same normalized title + content, ignoring
 * embedded volatile ids/timestamps) and picks one representative per group so
 * the list stops showing the same fact several times. This is a rendering-only
 * collapse: every underlying record is left untouched in the store, and the
 * representative card's id is the real id all row actions (edit/archive/delete/
 * erase) operate on.
 *
 * The group key includes the TITLE deliberately — two records that legitimately
 * share body text but differ in what they're about (e.g. the two-mind test
 * fixture) must stay separate.
 */

export interface DedupedMemory {
  memory: Memory;
  /** How many raw records collapsed into this representative (>= 1). */
  duplicateCount: number;
}

/** Preference order for which record represents a group (lower = preferred). */
function statusRank(status: Memory['status']): number {
  switch (status) {
    case 'active': return 0;
    case 'unreviewed': return 1;
    case 'low_confidence': return 2;
    case 'conflict': return 3;
    case 'deprecated': return 4;
    case 'archived': return 5;
    default: return 3;
  }
}

function createdMs(m: Memory): number {
  const parsed = Date.parse(m.createdAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** True if `a` is a better representative than `b`. */
function isBetterRepresentative(a: Memory, b: Memory): boolean {
  const rankDiff = statusRank(a.status) - statusRank(b.status);
  if (rankDiff !== 0) return rankDiff < 0;
  const confA = a.confidence ?? 0;
  const confB = b.confidence ?? 0;
  if (confA !== confB) return confA > confB;
  return createdMs(a) > createdMs(b);
}

/**
 * Group by normalized title+content and return one representative per group,
 * preserving first-seen group order (the server already returns createdAt-desc).
 * Records whose normalized key is too short to group on are always kept distinct.
 * Does not mutate the input.
 */
export function dedupeMemoriesForDisplay(memories: readonly Memory[]): DedupedMemory[] {
  const groups = new Map<string, DedupedMemory>();
  const order: string[] = [];

  memories.forEach((m, index) => {
    const titleKey = normalizeMemoryKey(m.title);
    const contentKey = normalizeMemoryKey(m.content);
    const composite = `${titleKey} ${contentKey}`;
    // Too-thin keys (empty/short) can't be trusted to mean "the same memory" -
    // give each such record its own group so unrelated stubs never merge.
    const key = isGroupableKey(titleKey + contentKey) ? composite : `__unique__:${m.id}:${index}`;

    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { memory: m, duplicateCount: 1 });
      order.push(key);
      return;
    }
    existing.duplicateCount += 1;
    if (isBetterRepresentative(m, existing.memory)) {
      existing.memory = m;
    }
  });

  // Second pass: collapse a GROWING-COMPOSITE chain - a repeatedly re-written
  // "anchor" record where each new write is the previous content plus more
  // appended turns (same title, content is a strict prefix of a later sibling).
  // These aren't equal after normalization (they differ in length), so pass 1
  // never merges them, but they are visibly "the same memory" to a user.
  // Bucket by normalized title only, then absorb any entry whose normalized
  // content is a prefix of a longer sibling's - the longest one wins.
  const byTitle = new Map<string, DedupedMemory[]>();
  for (const key of order) {
    const entry = groups.get(key)!;
    const titleKey = normalizeMemoryKey(entry.memory.title);
    if (!isGroupableKey(titleKey)) continue;
    const bucket = byTitle.get(titleKey);
    if (bucket) bucket.push(entry);
    else byTitle.set(titleKey, [entry]);
  }
  const absorbed = new Set<DedupedMemory>();
  for (const bucket of byTitle.values()) {
    if (bucket.length < 2) continue;
    const withContentKey = bucket
      .map((entry) => ({ entry, contentKey: normalizeMemoryKey(entry.memory.content) }))
      .sort((a, b) => b.contentKey.length - a.contentKey.length);
    for (let i = 0; i < withContentKey.length; i++) {
      const longer = withContentKey[i];
      if (absorbed.has(longer.entry)) continue;
      for (let j = i + 1; j < withContentKey.length; j++) {
        const shorter = withContentKey[j];
        if (absorbed.has(shorter.entry)) continue;
        if (shorter.contentKey.length > 0 && longer.contentKey.startsWith(shorter.contentKey)) {
          longer.entry.duplicateCount += shorter.entry.duplicateCount;
          absorbed.add(shorter.entry);
        }
      }
    }
  }

  return order.map((key) => groups.get(key)!).filter((entry) => !absorbed.has(entry));
}
