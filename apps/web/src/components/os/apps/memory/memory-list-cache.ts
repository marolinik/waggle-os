import type { Memory } from '@/lib/types';

/**
 * Wave T Lane D (item 2) — session-scoped cache of fetched memory lists.
 *
 * The Memory surface swaps its body components on every tab switch (Trust ↔
 * Memories unmount + remount), so each re-entry re-fetched from scratch and
 * flashed a spinner ("re-spins on every tab switch" — R13-V1 judge finding).
 * This module holds the last-fetched list per query key at MODULE scope, so a
 * remount can seed its initial state instantly and refresh in the background
 * (the list guards its spinner on `loading && memories.length === 0`, so a
 * seeded list never re-spins). Staleness is acceptable — the surface has
 * explicit refresh affordances (mutations bump the reload tick; the mind pills
 * refetch on scope change).
 *
 * Not persisted — a page reload starts cold by design (it is a fresh session).
 */
const cache = new Map<string, Memory[]>();

/** Build a stable cache key from the query dimensions that affect the fetch. */
export function memoryListCacheKey(parts: Array<string | number | undefined>): string {
  return parts.map((p) => (p === undefined ? '' : String(p))).join('|');
}

export function readMemoryListCache(key: string): Memory[] | undefined {
  return cache.get(key);
}

export function writeMemoryListCache(key: string, memories: Memory[]): void {
  cache.set(key, memories);
}

/** Test-only: drop all cached lists so module state can't leak across tests. */
export function clearMemoryListCache(): void {
  cache.clear();
}
