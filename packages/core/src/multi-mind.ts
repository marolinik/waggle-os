import { MindDB } from './mind/db.js';
import { IdentityLayer, type Identity } from './mind/identity.js';
import { AwarenessLayer, type AwarenessItem } from './mind/awareness.js';
import { FrameStore, type MemoryFrame } from './mind/frames.js';

export type MindSource = 'personal' | 'workspace';
export type SearchScope = 'personal' | 'workspace' | 'all';

export interface MultiMindSearchResult extends MemoryFrame {
  source: MindSource;
}

/**
 * MultiMind manages simultaneous access to personal.mind + workspace.mind.
 * Identity comes from personal mind, awareness is combined from both.
 * Search can target either mind or both.
 */
export class MultiMind {
  personal: MindDB;
  workspace: MindDB | null;

  private personalFrames: FrameStore;
  private workspaceFrames: FrameStore | null;
  private personalIdentity: IdentityLayer;
  private personalAwareness: AwarenessLayer;
  private workspaceAwareness: AwarenessLayer | null;

  constructor(personalPath: string, workspacePath?: string) {
    this.personal = new MindDB(personalPath);
    this.personalFrames = new FrameStore(this.personal);
    this.personalIdentity = new IdentityLayer(this.personal);
    this.personalAwareness = new AwarenessLayer(this.personal);

    if (workspacePath) {
      this.workspace = new MindDB(workspacePath);
      this.workspaceFrames = new FrameStore(this.workspace);
      this.workspaceAwareness = new AwarenessLayer(this.workspace);
    } else {
      this.workspace = null;
      this.workspaceFrames = null;
      this.workspaceAwareness = null;
    }
  }

  /**
   * Search across both minds using FTS5 keyword search.
   * Results include a `source` field indicating which mind they came from.
   */
  searchAll(query: string, limit = 20): MultiMindSearchResult[] {
    return this.search(query, 'all', limit);
  }

  /**
   * Search with a specific scope: personal-only, workspace-only, or all.
   */
  search(query: string, scope: SearchScope = 'all', limit = 20): MultiMindSearchResult[] {
    const results: MultiMindSearchResult[] = [];

    if (scope === 'personal' || scope === 'all') {
      const personalResults = this.ftsSearch(this.personal, query, limit);
      results.push(...personalResults.map(r => ({ ...r, source: 'personal' as MindSource })));
    }

    if ((scope === 'workspace' || scope === 'all') && this.workspace) {
      const workspaceResults = this.ftsSearch(this.workspace, query, limit);
      results.push(...workspaceResults.map(r => ({ ...r, source: 'workspace' as MindSource })));
    }

    // Sort by FTS rank is already done per-mind; for cross-mind we sort by created_at desc
    // ISO 8601 timestamps sort correctly via string comparison
    results.sort((a, b) => b.created_at.localeCompare(a.created_at));

    return results.slice(0, limit);
  }

  /**
   * Get identity from the personal mind.
   */
  getIdentity(): Identity {
    return this.personalIdentity.get();
  }

  /**
   * Check if identity exists in the personal mind.
   */
  hasIdentity(): boolean {
    return this.personalIdentity.exists();
  }

  /**
   * Get combined awareness from both minds.
   * Personal awareness items come first, then workspace items.
   */
  getAwareness(): AwarenessItem[] {
    const personalItems = this.personalAwareness.getAll();
    const workspaceItems = this.workspaceAwareness?.getAll() ?? [];

    // Merge and sort by priority descending
    return [...personalItems, ...workspaceItems]
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Switch the workspace mind to a new path.
   * Closes the old workspace mind (if any) and opens the new one.
   */
  switchWorkspace(newPath: string): void {
    if (this.workspace) {
      this.workspace.close();
    }
    this.workspace = new MindDB(newPath);
    this.workspaceFrames = new FrameStore(this.workspace);
    this.workspaceAwareness = new AwarenessLayer(this.workspace);
  }

  /**
   * Set the workspace mind to an already-open MindDB instance.
   * Does NOT close the previous workspace (caller manages lifecycle).
   * Use this when the DB is managed by an external cache.
   */
  setWorkspace(db: MindDB): void {
    // Don't close — the caller (cache) owns the lifecycle
    this.workspace = db;
    this.workspaceFrames = new FrameStore(db);
    this.workspaceAwareness = new AwarenessLayer(db);
  }

  /**
   * Close both minds. After this, the MultiMind instance should not be used.
   */
  close(): void {
    try { this.personal?.close(); } catch { /* already closed */ }
    try { this.workspace?.close(); } catch { /* already closed */ }
  }

  /**
   * Get the FrameStore for a specific mind.
   */
  getFrameStore(source: MindSource): FrameStore | null {
    if (source === 'personal') return this.personalFrames;
    return this.workspaceFrames;
  }

  /**
   * Get the AwarenessLayer for a specific mind.
   */
  getAwarenessLayer(source: MindSource): AwarenessLayer | null {
    if (source === 'personal') return this.personalAwareness;
    return this.workspaceAwareness;
  }

  /**
   * Get the IdentityLayer (always from personal mind).
   */
  getIdentityLayer(): IdentityLayer {
    return this.personalIdentity;
  }

  /**
   * FTS5 keyword search on a single MindDB instance.
   * Sanitizes the query by wrapping each word in double quotes.
   */
  private ftsSearch(db: MindDB, query: string, limit: number): MemoryFrame[] {
    // F6: OR-based search with stop word filtering (matches HybridSearch.keywordSearch fix)
    const FTS_STOP_WORDS = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'this',
      'that', 'these', 'those', 'it', 'its', 'my', 'your', 'our', 'their',
      'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why', 'all',
      'each', 'every', 'both', 'some', 'any', 'no', 'not', 'and', 'or', 'but',
    ]);
    const safeQuery = query
      .split(/\s+/)
      .map(w => w.replace(/[^\w]/g, ''))
      .filter(w => w.length > 2 && !FTS_STOP_WORDS.has(w.toLowerCase()))
      .map(w => `"${w.replace(/"/g, '')}"`)
      .join(' OR ');

    if (!safeQuery) return [];

    const raw = db.getDatabase();
    try {
      return raw.prepare(`
        SELECT mf.* FROM memory_frames_fts fts
        JOIN memory_frames mf ON mf.id = fts.rowid
        WHERE fts.content MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(safeQuery, limit) as MemoryFrame[];
    } catch {
      // FTS5 parse error — return empty
      return [];
    }
  }
}
