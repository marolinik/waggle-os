import { MindDB } from './mind/db.js';

export interface MultiMindCacheConfig {
  maxOpen: number;
  getMindPath: (workspaceId: string) => string | null;
}

interface CacheEntry {
  db: MindDB;
  lastAccessed: number;
}

/**
 * LRU cache of open MindDB handles keyed by workspace ID.
 * Opens minds on demand and evicts the least recently used when full.
 */
export class MultiMindCache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly maxOpen: number;
  private readonly getMindPath: (workspaceId: string) => string | null;

  constructor(config: MultiMindCacheConfig) {
    this.maxOpen = config.maxOpen;
    this.getMindPath = config.getMindPath;
  }

  getOrOpen(workspaceId: string): MindDB | null {
    const existing = this.cache.get(workspaceId);
    if (existing) {
      existing.lastAccessed = Date.now();
      return existing.db;
    }

    const mindPath = this.getMindPath(workspaceId);
    if (!mindPath) return null;

    try {
      if (this.cache.size >= this.maxOpen) {
        this.evictLRU();
      }
      const db = new MindDB(mindPath);
      this.cache.set(workspaceId, { db, lastAccessed: Date.now() });
      return db;
    } catch {
      return null;
    }
  }

  get(workspaceId: string): MindDB | null {
    const entry = this.cache.get(workspaceId);
    if (entry) {
      entry.lastAccessed = Date.now();
      return entry.db;
    }
    return null;
  }

  has(workspaceId: string): boolean {
    return this.cache.has(workspaceId);
  }

  close(workspaceId: string): void {
    const entry = this.cache.get(workspaceId);
    if (entry) {
      try { entry.db.close(); } catch { /* already closed */ }
      this.cache.delete(workspaceId);
    }
  }

  closeAll(): void {
    for (const [, entry] of this.cache) {
      try { entry.db.close(); } catch { /* already closed */ }
    }
    this.cache.clear();
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
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.close(oldestKey);
    }
  }
}
