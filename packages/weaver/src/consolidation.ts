import type { MindDB, FrameStore, MemoryFrame, Importance, SessionStore, KnowledgeGraph } from '@waggle/core';

const IMPORTANCE_UPGRADE: Record<string, Importance> = {
  temporary: 'normal',
  normal: 'important',
  important: 'critical',
};

export class MemoryWeaver {
  private db: MindDB;
  private frames: FrameStore;
  private sessions: SessionStore;

  constructor(db: MindDB, frames: FrameStore, sessions: SessionStore) {
    this.db = db;
    this.frames = frames;
    this.sessions = sessions;
  }

  consolidateGop(gopId: string): MemoryFrame | null {
    const state = this.frames.reconstructState(gopId);
    if (!state.iframe || state.pframes.length === 0) return null;

    // Merge I-frame + P-frames into consolidated content
    const parts = [state.iframe.content, ...state.pframes.map(p => p.content)];
    const mergedContent = parts.join('\n---\n');

    // Create new consolidated I-frame
    const consolidated = this.frames.createIFrame(gopId, mergedContent, 'normal');

    // Mark old P-frames as deprecated
    const raw = this.db.getDatabase();
    const pframeIds = state.pframes.map(p => p.id);
    const placeholders = pframeIds.map(() => '?').join(',');
    raw.prepare(
      `UPDATE memory_frames SET importance = 'deprecated' WHERE id IN (${placeholders})`
    ).run(...pframeIds);

    return consolidated;
  }

  decayFrames(): number {
    const raw = this.db.getDatabase();

    // Delete deprecated frames with zero access count
    // First get the IDs for FTS cleanup
    const toDelete = raw.prepare(
      "SELECT id FROM memory_frames WHERE importance = 'deprecated' AND access_count = 0"
    ).all() as { id: number }[];

    if (toDelete.length === 0) return 0;

    const ids = toDelete.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');

    // Delete from FTS index
    raw.prepare(
      `DELETE FROM memory_frames_fts WHERE rowid IN (${placeholders})`
    ).run(...ids);

    // Delete the frames
    const result = raw.prepare(
      `DELETE FROM memory_frames WHERE id IN (${placeholders})`
    ).run(...ids);

    return result.changes;
  }

  strengthenFrames(tempThreshold = 10, normalThreshold = 25): number {
    const raw = this.db.getDatabase();
    let upgraded = 0;

    // Upgrade temporary → normal
    const tempResult = raw.prepare(`
      UPDATE memory_frames SET importance = 'normal'
      WHERE importance = 'temporary' AND access_count >= ?
    `).run(tempThreshold);
    upgraded += tempResult.changes;

    // Upgrade normal → important
    const normalResult = raw.prepare(`
      UPDATE memory_frames SET importance = 'important'
      WHERE importance = 'normal' AND access_count >= ?
    `).run(normalThreshold);
    upgraded += normalResult.changes;

    return upgraded;
  }

  createDailySummary(gopIds: string[]): MemoryFrame | null {
    if (gopIds.length === 0) return null;

    const allContent: string[] = [];
    for (const gopId of gopIds) {
      const gopFrames = this.frames.getGopFrames(gopId);
      for (const frame of gopFrames) {
        if (frame.frame_type === 'I' || frame.frame_type === 'P') {
          allContent.push(frame.content);
        }
      }
    }

    if (allContent.length === 0) return null;

    // Create a summary session
    const summarySession = this.sessions.create('daily-summary');
    const summaryContent = allContent.join('\n---\n');
    return this.frames.createIFrame(summarySession.gop_id, summaryContent, 'important');
  }

  archiveClosedSessions(): number {
    const raw = this.db.getDatabase();
    const result = raw.prepare(
      "UPDATE sessions SET status = 'archived' WHERE status = 'closed'"
    ).run();
    return result.changes;
  }

  /**
   * Deprecate temporary frames older than maxAgeDays with low access count.
   * Returns the number of frames deprecated.
   */
  decayByAge(maxAgeDays: number, maxAccessCount = 2): number {
    const raw = this.db.getDatabase();
    const result = raw.prepare(`
      UPDATE memory_frames SET importance = 'deprecated'
      WHERE importance = 'temporary'
        AND access_count <= ?
        AND created_at <= datetime('now', '-' || ? || ' days')
    `).run(maxAccessCount, maxAgeDays);
    return result.changes;
  }

  /**
   * Find frames that share entity names (from the knowledge graph) in their content,
   * and create B-frame links between them.
   * Returns the number of B-frames created.
   */
  linkRelatedFrames(kg: KnowledgeGraph): number {
    const raw = this.db.getDatabase();

    // Get all active entities from the knowledge graph
    const entities = raw.prepare(
      'SELECT id, name FROM knowledge_entities WHERE valid_to IS NULL'
    ).all() as { id: number; name: string }[];

    if (entities.length === 0) return 0;

    // Get all non-deprecated, non-B frames
    const allFrames = raw.prepare(
      "SELECT id, gop_id, content FROM memory_frames WHERE importance != 'deprecated' AND frame_type != 'B'"
    ).all() as { id: number; gop_id: string; content: string }[];

    if (allFrames.length < 2) return 0;

    // Build a map: entity name → frame IDs that mention it
    const entityToFrames = new Map<string, Set<number>>();
    for (const entity of entities) {
      const nameLower = entity.name.toLowerCase();
      const matchingFrameIds = new Set<number>();
      for (const frame of allFrames) {
        if (frame.content.toLowerCase().includes(nameLower)) {
          matchingFrameIds.add(frame.id);
        }
      }
      if (matchingFrameIds.size >= 2) {
        entityToFrames.set(entity.name, matchingFrameIds);
      }
    }

    // For each entity with 2+ frames, create a B-frame linking them
    // Track already-linked pairs to avoid duplicates
    const linkedPairs = new Set<string>();
    let created = 0;

    for (const [entityName, frameIds] of entityToFrames) {
      const ids = Array.from(frameIds);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const pairKey = `${Math.min(ids[i], ids[j])}:${Math.max(ids[i], ids[j])}`;
          if (linkedPairs.has(pairKey)) continue;
          linkedPairs.add(pairKey);

          // Find the gop_id of the base frame
          const baseFrame = allFrames.find(f => f.id === ids[i]);
          if (!baseFrame) continue;

          this.frames.createBFrame(
            baseFrame.gop_id,
            `Shared entity: ${entityName}`,
            ids[i],
            [ids[j]]
          );
          created++;
        }
      }
    }

    return created;
  }

  /**
   * Distill session content into a durable memory frame.
   * Takes pre-extracted session summary and key points, creates an important frame
   * that persists across consolidation cycles.
   */
  distillSessionContent(sessionDate: string, summary: string, keyPoints: string[]): MemoryFrame {
    const parts = [`Session (${sessionDate}): ${summary}`];
    if (keyPoints.length > 0) {
      parts.push('Key points: ' + keyPoints.join('; '));
    }
    const content = parts.join('. ');

    // Create a session for the distilled content (or reuse an active one)
    const active = this.sessions.getActive();
    let gopId: string;
    if (active.length > 0) {
      gopId = active[0].gop_id;
    } else {
      gopId = this.sessions.create('distilled').gop_id;
    }

    return this.frames.createIFrame(gopId, content, 'important');
  }

  consolidateProject(projectId: string): MemoryFrame | null {
    const projectSessions = this.sessions.getByProject(projectId);
    const closedSessions = projectSessions.filter(s => s.status === 'closed' || s.status === 'archived');

    if (closedSessions.length === 0) return null;

    const allContent: string[] = [];
    for (const session of closedSessions) {
      const latestI = this.frames.getLatestIFrame(session.gop_id);
      if (latestI) {
        allContent.push(`[${session.gop_id}] ${latestI.content}`);
      }
    }

    if (allContent.length === 0) return null;

    const consolidationSession = this.sessions.create(projectId);
    return this.frames.createIFrame(
      consolidationSession.gop_id,
      allContent.join('\n---\n'),
      'important'
    );
  }
}
