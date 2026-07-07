/**
 * surface-cache — a typed, keyed, session-scoped cache for the route-cache
 * pillar (path-to-9 Pillar 2.6). Generalizes the proven memory-list-cache
 * (Wave T Lane D) and workspace-shelf (Wave U Lane A) pattern: a judged surface
 * that UNMOUNTS on tab-away must repaint its last-known content the instant it
 * returns and refresh silently — never re-skeletoning within a session.
 *
 * Two facts per key, because "never fetched" and "fetched, genuinely empty"
 * must render DIFFERENTLY (skeleton vs. empty-state — the shelf-cache lesson):
 *   - value    — the last resolved payload; seeds a remount's initial state so
 *                the content is on screen before the silent refresh returns.
 *   - resolved — whether the fetch resolved >=once this session, so a revisit to
 *                a genuinely-empty surface resolves WITHOUT a skeleton flash.
 *
 * Module-scope by construction (the consumer holds the instance at module
 * scope) and NOT persisted: a page reload starts cold by design (a fresh
 * session). resetForTests() drops all state so it can't leak across tests —
 * every test that mounts a cached surface must call it in setup (the
 * clearMemoryListCache convention). This phase introduces it for Marketplace +
 * Agents only; migrating memory/workspaces onto it is deferred (churn without
 * yield — those surfaces already ship their own equivalent guards).
 */
export interface SurfaceCache<T> {
  /** The last resolved payload for `key`, or undefined if never resolved. */
  read(key: string): T | undefined;
  /** Whether a fetch for `key` has resolved >=once this session. */
  hasResolved(key: string): boolean;
  /** Record a resolved payload — marks `key` resolved and seeds future remounts. */
  write(key: string, value: T): void;
  /** Test-only: drop all cached state so it can't leak across tests. */
  resetForTests(): void;
}

/** Create a fresh, typed, keyed session cache. One instance per surface. */
export function createSurfaceCache<T>(): SurfaceCache<T> {
  const values = new Map<string, T>();
  const resolved = new Set<string>();
  return {
    read: (key) => values.get(key),
    hasResolved: (key) => resolved.has(key),
    write: (key, value) => {
      values.set(key, value);
      resolved.add(key);
    },
    resetForTests: () => {
      values.clear();
      resolved.clear();
    },
  };
}

/**
 * Build a stable string key from the query dimensions that affect a payload
 * (facet, filters, scope). Mirrors memoryListCacheKey — undefined becomes '' so
 * the key stays stable across "unset" variants.
 */
export function surfaceCacheKey(
  parts: ReadonlyArray<string | number | boolean | undefined>,
): string {
  return parts.map((p) => (p === undefined ? '' : String(p))).join('|');
}
