import { createHash } from 'node:crypto';
import type { MindDB } from './db.js';

export type FrameType = 'I' | 'P' | 'B';
export type Importance = 'critical' | 'important' | 'normal' | 'temporary' | 'deprecated';
export type FrameSource = 'user_stated' | 'tool_verified' | 'agent_inferred' | 'import' | 'system' | 'personal' | 'workspace';

export interface MemoryFrame {
  id: number;
  frame_type: FrameType;
  gop_id: string;
  t: number;
  base_frame_id: number | null;
  content: string;
  importance: Importance;
  source: FrameSource;
  access_count: number;
  created_at: string;
  last_accessed: string;
}

export interface ReconstructedState {
  iframe: MemoryFrame | null;
  pframes: MemoryFrame[];
}

const IMPORTANCE_MULTIPLIERS: Record<Importance, number> = {
  critical: 2.0,
  important: 1.5,
  normal: 1.0,
  temporary: 0.7,
  deprecated: 0.3,
};

export class FrameStore {
  private db: MindDB;

  constructor(db: MindDB) {
    this.db = db;
  }

  createIFrame(gopId: string, content: string, importance: Importance = 'normal', source: FrameSource = 'user_stated'): MemoryFrame {
    // L1: Dedup — if identical content exists, update access count instead of duplicating
    const existing = this.findDuplicate(content);
    if (existing) return existing;

    const t = this.nextT(gopId);
    const raw = this.db.getDatabase();
    const result = raw.prepare(`
      INSERT INTO memory_frames (frame_type, gop_id, t, base_frame_id, content, importance, source)
      VALUES ('I', ?, ?, NULL, ?, ?, ?)
    `).run(gopId, t, content, importance, source);

    const frame = raw.prepare('SELECT * FROM memory_frames WHERE id = ?').get(result.lastInsertRowid) as MemoryFrame;
    this.indexFts(frame);
    return frame;
  }

  createPFrame(gopId: string, content: string, baseFrameId: number, importance: Importance = 'normal', source: FrameSource = 'user_stated'): MemoryFrame {
    const t = this.nextT(gopId);
    const raw = this.db.getDatabase();
    const result = raw.prepare(`
      INSERT INTO memory_frames (frame_type, gop_id, t, base_frame_id, content, importance, source)
      VALUES ('P', ?, ?, ?, ?, ?, ?)
    `).run(gopId, t, baseFrameId, content, importance, source);

    const frame = raw.prepare('SELECT * FROM memory_frames WHERE id = ?').get(result.lastInsertRowid) as MemoryFrame;
    this.indexFts(frame);
    return frame;
  }

  createBFrame(gopId: string, content: string, baseFrameId: number, referencedFrameIds: number[]): MemoryFrame {
    const t = this.nextT(gopId);
    // Store cross-references in the content as structured data
    const bContent = JSON.stringify({
      description: content,
      references: referencedFrameIds,
    });
    const raw = this.db.getDatabase();
    const result = raw.prepare(`
      INSERT INTO memory_frames (frame_type, gop_id, t, base_frame_id, content, importance)
      VALUES ('B', ?, ?, ?, ?, 'normal')
    `).run(gopId, t, baseFrameId, bContent);

    const frame = raw.prepare('SELECT * FROM memory_frames WHERE id = ?').get(result.lastInsertRowid) as MemoryFrame;
    this.indexFts(frame);
    return frame;
  }

  getById(id: number): MemoryFrame | undefined {
    return this.db.getDatabase().prepare('SELECT * FROM memory_frames WHERE id = ?').get(id) as MemoryFrame | undefined;
  }

  getLatestIFrame(gopId: string): MemoryFrame | undefined {
    return this.db.getDatabase().prepare(`
      SELECT * FROM memory_frames
      WHERE gop_id = ? AND frame_type = 'I'
      ORDER BY t DESC LIMIT 1
    `).get(gopId) as MemoryFrame | undefined;
  }

  getPFramesSinceLastI(gopId: string): MemoryFrame[] {
    const latestI = this.getLatestIFrame(gopId);
    if (!latestI) return [];
    return this.db.getDatabase().prepare(`
      SELECT * FROM memory_frames
      WHERE gop_id = ? AND frame_type = 'P' AND t > ?
      ORDER BY t ASC
    `).all(gopId, latestI.t) as MemoryFrame[];
  }

  getGopFrames(gopId: string): MemoryFrame[] {
    return this.db.getDatabase().prepare(`
      SELECT * FROM memory_frames WHERE gop_id = ? ORDER BY t ASC
    `).all(gopId) as MemoryFrame[];
  }

  reconstructState(gopId: string): ReconstructedState {
    const iframe = this.getLatestIFrame(gopId) ?? null;
    const pframes = iframe ? this.getPFramesSinceLastI(gopId) : [];
    return { iframe, pframes };
  }

  touch(id: number): void {
    this.db.getDatabase().prepare(`
      UPDATE memory_frames SET access_count = access_count + 1, last_accessed = datetime('now')
      WHERE id = ?
    `).run(id);
  }

  getImportanceMultiplier(importance: Importance): number {
    return IMPORTANCE_MULTIPLIERS[importance];
  }

  /** List frames with an options bag (convenience wrapper used by server routes). */
  list(opts: { limit?: number } = {}): MemoryFrame[] {
    return this.getRecent(opts.limit ?? 50);
  }

  /** Get the most recent frames ordered by creation time descending. */
  getRecent(limit = 50): MemoryFrame[] {
    return this.db.getDatabase().prepare(`
      SELECT * FROM memory_frames ORDER BY id DESC LIMIT ?
    `).all(limit) as MemoryFrame[];
  }

  /**
   * F20: Get recent frames with optional temporal boundaries.
   * @param limit Maximum number of results
   * @param since Only include frames created on or after this ISO date string
   * @param until Only include frames created on or before this ISO date string
   */
  getRecentFiltered(limit = 50, since?: string, until?: string): MemoryFrame[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (since) {
      conditions.push('created_at >= ?');
      params.push(since);
    }
    if (until) {
      conditions.push('created_at <= ?');
      params.push(until);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);

    return this.db.getDatabase().prepare(`
      SELECT * FROM memory_frames ${where} ORDER BY id DESC LIMIT ?
    `).all(...params) as MemoryFrame[];
  }

  getBFrameReferences(bframeId: number): number[] {
    const frame = this.getById(bframeId);
    if (!frame || frame.frame_type !== 'B') return [];
    try {
      const parsed = JSON.parse(frame.content);
      return parsed.references ?? [];
    } catch {
      return [];
    }
  }

  /**
   * L1: Check for duplicate content before inserting.
   * Returns the existing frame if content hash matches, null otherwise.
   * If a duplicate is found, updates its access_count instead of creating a new frame.
   */
  findDuplicate(content: string): MemoryFrame | null {
    const hash = createHash('sha256').update(content.trim()).digest('hex');
    // Check recent frames (last 500) for content hash match
    const existing = this.db.getDatabase().prepare(`
      SELECT * FROM memory_frames
      WHERE length(content) = length(?)
      ORDER BY id DESC LIMIT 500
    `).all(content.trim()) as MemoryFrame[];

    for (const frame of existing) {
      const frameHash = createHash('sha256').update(frame.content.trim()).digest('hex');
      if (frameHash === hash) {
        // Update access count instead of creating duplicate
        this.touch(frame.id);
        return frame;
      }
    }
    return null;
  }

  /**
   * Q22: Update a frame's content and/or importance by ID.
   * Updates the main table, FTS index, and vector index.
   * Returns the updated frame, or undefined if not found.
   */
  update(id: number, content: string, importance?: Importance): MemoryFrame | undefined {
    const raw = this.db.getDatabase();
    const existing = this.getById(id);
    if (!existing) return undefined;

    const newImportance = importance ?? existing.importance;

    // Update main table
    raw.prepare(`
      UPDATE memory_frames SET content = ?, importance = ? WHERE id = ?
    `).run(content, newImportance, id);

    // Update FTS index: delete old entry, insert new
    raw.prepare('DELETE FROM memory_frames_fts WHERE rowid = ?').run(id);
    raw.prepare('INSERT INTO memory_frames_fts (rowid, content) VALUES (?, ?)').run(id, content);

    // Update vector index if exists
    try { raw.prepare('DELETE FROM memory_frames_vec WHERE rowid = ?').run(id); } catch { /* vec table may not exist */ }

    return this.getById(id);
  }

  /**
   * L2: Delete a frame by ID. Returns true if deleted, false if not found.
   */
  delete(id: number): boolean {
    const raw = this.db.getDatabase();
    // Clear self-referential FK: nullify base_frame_id on any frames that reference this one
    raw.prepare('UPDATE memory_frames SET base_frame_id = NULL WHERE base_frame_id = ?').run(id);
    // Delete from vector index if exists
    try { raw.prepare('DELETE FROM memory_frames_vec WHERE rowid = ?').run(id); } catch { /* vec table may not exist */ }
    // Delete from FTS index
    raw.prepare('DELETE FROM memory_frames_fts WHERE rowid = ?').run(id);
    // Delete from KG entity-frame links if KG tables exist
    try { raw.prepare('DELETE FROM kg_entity_frames WHERE frame_id = ?').run(id); } catch { /* KG tables may not exist */ }
    // Delete from main table
    const result = raw.prepare('DELETE FROM memory_frames WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private nextT(gopId: string): number {
    const row = this.db.getDatabase().prepare(`
      SELECT COALESCE(MAX(t), -1) + 1 AS next_t FROM memory_frames WHERE gop_id = ?
    `).get(gopId) as { next_t: number };
    return row.next_t;
  }

  private indexFts(frame: MemoryFrame): void {
    this.db.getDatabase().prepare(`
      INSERT INTO memory_frames_fts (rowid, content) VALUES (?, ?)
    `).run(frame.id, frame.content);
  }
}
