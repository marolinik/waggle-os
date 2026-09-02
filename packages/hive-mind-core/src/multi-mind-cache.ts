import fs from 'node:fs';
import path from 'node:path';
import { MindDB } from './mind/db.js';
import { createCoreLogger } from './logger.js';

const log = createCoreLogger('multi-mind-cache');

export interface MultiMindCacheConfig {
  maxOpen: number;
  getMindPath: (workspaceId: string) => string | null;
  /**
   * Defense-in-depth root directory. If set, `getOrOpen` rejects any path that does not
   * resolve to a descendant of this root. Prevents a crafted workspaceId like
   * '../../other-user.mind' from opening an arbitrary file via the caller-supplied
   * `getMindPath` — closes review Critical #2 from cowork/Code-Review_MultiMind_April-2026.md.
   */
  allowedRoot?: string;
}

export interface MultiMindCacheLease {
  readonly db: MindDB;
  release(): void;
}

interface CacheEntry {
  db: MindDB;
  lastAccessed: number;
  /** Leases bound to this exact entry generation. */
  leases: number;
}

/**
 * LRU cache of open MindDB handles keyed by workspace ID.
 * Opens minds on demand and evicts the least recently used when full.
 */
export class MultiMindCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly legacyLeaseQueues = new Map<string, Array<() => void>>();
  private readonly maxOpen: number;
  private readonly getMindPath: (workspaceId: string) => string | null;
  private readonly allowedRoot: string | null;

  constructor(config: MultiMindCacheConfig) {
    this.maxOpen = config.maxOpen;
    this.getMindPath = config.getMindPath;
    this.allowedRoot = config.allowedRoot ? path.resolve(config.allowedRoot) : null;
  }

  getOrOpen(workspaceId: string): MindDB | null {
    const existing = this.cache.get(workspaceId);
    if (existing) {
      // Reopen-guard: normally hand back the cached handle. But if it was closed
      // out-of-band (an explicit close() seam ran while a session still held a
      // reference), drop the dead entry and reopen below. Leases remain bound to
      // the retired entry so their cleanup cannot unpin the replacement.
      if (existing.db.isOpen()) {
        existing.lastAccessed = Date.now();
        return existing.db;
      }
      this.cache.delete(workspaceId);
    }

    try {
      const mindPath = this.getMindPath(workspaceId);
      if (!mindPath) return null;
      if (mindPath === ':memory:') {
        if (this.cache.size >= this.maxOpen) this.evictLRU();
        const recheck = this.cache.get(workspaceId);
        if (recheck?.db.isOpen()) {
          recheck.lastAccessed = Date.now();
          return recheck.db;
        }
        const db = new MindDB(mindPath);
        this.cache.set(workspaceId, { db, lastAccessed: Date.now(), leases: 0 });
        return db;
      }

    // Review Critical #2: path-traversal guard. Defense-in-depth against an
    // attacker-controlled workspaceId (e.g. from an LLM tool call with a misconfigured
    // approval gate) that resolves to an arbitrary filesystem path.
    if (this.allowedRoot) {
      const resolved = path.resolve(mindPath);
      if (resolved !== this.allowedRoot && !resolved.startsWith(this.allowedRoot + path.sep)) {
        log.warn('path outside allowedRoot — rejecting getOrOpen', {
          workspaceId,
          resolvedPath: resolved,
        });
        return null;
      }
    }

      if (this.cache.size >= this.maxOpen) {
        this.evictLRU();
      }
      const recheck = this.cache.get(workspaceId);
      if (recheck && recheck.db.isOpen()) {
        recheck.lastAccessed = Date.now();
        return recheck.db;
      }
      const mindStat = fs.lstatSync(mindPath, { throwIfNoEntry: false });
      let canonicalMind: string;
      if (mindStat) {
        if (!mindStat.isFile() || mindStat.isSymbolicLink() || mindStat.nlink !== 1) return null;
        canonicalMind = fs.realpathSync.native(mindPath);
      } else {
        const canonicalParent = fs.realpathSync.native(path.dirname(mindPath));
        canonicalMind = path.join(canonicalParent, path.basename(mindPath));
      }
      if (this.allowedRoot) {
        const canonicalRoot = fs.realpathSync.native(this.allowedRoot);
        const relative = path.relative(canonicalRoot, canonicalMind);
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
          return null;
        }
      }
      const db = new MindDB(canonicalMind);
      this.cache.set(workspaceId, { db, lastAccessed: Date.now(), leases: 0 });
      return db;
    } catch (err) {
      log.warn('failed to open MindDB', { workspaceId, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  getIfOpen(workspaceId: string): MindDB | null {
    const entry = this.cache.get(workspaceId);
    if (entry) {
      entry.lastAccessed = Date.now();
      return entry.db;
    }
    return null;
  }

  /**
   * Borrow a MindDB handle for the lifetime of a workspace session and pin it
   * so `evictLRU` cannot close it while the session is live. The cache remains
   * the sole owner of the handle — the borrower must NOT call `.close()` on it;
   * it calls `release()` exactly once when the session closes. Throws if the
   * mind cannot be opened (callers pre-check via `getOrOpen`, so this is the
   * unreachable-path guard, not a normal control-flow branch).
   */
  acquire(workspaceId: string): MindDB {
    const lease = this.acquireLease(workspaceId);
    const queue = this.legacyLeaseQueues.get(workspaceId) ?? [];
    queue.push(lease.release);
    this.legacyLeaseQueues.set(workspaceId, queue);
    return lease.db;
  }

  /**
   * Borrow one exact cache generation. The returned release closure retains
   * the entry object it pinned. If a forced close removes that entry and the
   * same workspace ID is reopened, stale cleanup can only decrement the
   * retired entry, never the replacement.
   */
  acquireLease(workspaceId: string): MultiMindCacheLease {
    const db = this.getOrOpen(workspaceId);
    const entry = this.cache.get(workspaceId);
    if (!db || !entry) {
      throw new Error(`MultiMindCache.acquireLease: cannot open mind for workspace '${workspaceId}'`);
    }
    entry.leases += 1;
    let released = false;

    return {
      db,
      release: () => {
        if (released) return;
        released = true;
        if (entry.leases > 0) entry.leases -= 1;
        if (
          this.cache.get(workspaceId) === entry
          && entry.leases === 0
          && this.cache.size > this.maxOpen
        ) {
          this.evictLRU();
        }
      },
    };
  }

  /**
   * Release the oldest outstanding legacy borrow. FIFO ordering keeps a newer
   * replacement generation pinned even when it finishes before work retained
   * by a force-closed generation; every queued closure remains generation-bound.
   */
  release(workspaceId: string): void {
    const queue = this.legacyLeaseQueues.get(workspaceId);
    if (!queue) return;
    const release = queue.shift();
    if (!release) return;
    if (queue.length === 0) this.legacyLeaseQueues.delete(workspaceId);
    release();
  }

  has(workspaceId: string): boolean {
    return this.cache.has(workspaceId);
  }

  close(workspaceId: string): void {
    const entry = this.cache.get(workspaceId);
    if (entry) {
      try { entry.db.close(); } catch (err) { log.warn('close failed', { workspaceId, error: err instanceof Error ? err.message : String(err) }); }
      this.cache.delete(workspaceId);
    }
  }

  closeAll(): void {
    for (const [id, entry] of this.cache) {
      try { entry.db.close(); } catch (err) { log.warn('close failed', { workspaceId: id, error: err instanceof Error ? err.message : String(err) }); }
    }
    this.cache.clear();
    this.legacyLeaseQueues.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  keys(): string[] {
    return [...this.cache.keys()];
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.leases > 0) continue; // never evict a mind held by live work
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.close(oldestKey);
    } else {
      // Every open mind is pinned by an active session. Closing one would poison
      // an in-flight chat turn, so we accept exceeding the soft cap instead
      // (correctness over the maxOpen limit). The map shrinks again as sessions
      // release their pins.
      log.warn('evictLRU: all cached minds pinned by active sessions — exceeding maxOpen', {
        size: this.cache.size,
        maxOpen: this.maxOpen,
      });
    }
  }
}
