import {
  evaluateExternalMemoryIngress,
  type MindDB,
  type FrameStore,
  type MemoryFrame,
  type Importance,
  type SessionStore,
  type KnowledgeGraph,
} from '@waggle/core';

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
    if ([mergedContent, parts.join('\n'), parts.join('')].some(
      content => evaluateExternalMemoryIngress({ content }).action !== 'allow',
    )) return null;

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

    // Select deprecated frames with zero access count for canonical cleanup.
    const toDelete = raw.prepare(
      "SELECT id FROM memory_frames WHERE importance = 'deprecated' AND access_count = 0"
    ).all() as { id: number }[];

    if (toDelete.length === 0) return 0;

    let deleted = 0;
    for (const { id } of toDelete) {
      if (this.frames.delete(id)) deleted++;
    }
    return deleted;
  }

  strengthenFrames(tempThreshold = 10, normalThreshold = 25): number {
    const raw = this.db.getDatabase();
    let upgraded = 0;
    const candidates = raw.prepare(
      'SELECT id, content FROM memory_frames WHERE importance = ? AND access_count >= ?',
    );
    const promote = raw.prepare(
      'UPDATE memory_frames SET importance = ? WHERE id = ? AND content = ? AND importance = ? AND access_count >= ?',
    );

    // Upgrade temporary → normal
    for (const frame of candidates.all('temporary', tempThreshold) as Array<{ id: number; content: string }>) {
      if (evaluateExternalMemoryIngress({ content: frame.content }).action !== 'allow') continue;
      upgraded += promote.run('normal', frame.id, frame.content, 'temporary', tempThreshold).changes;
    }

    // Upgrade normal → important
    for (const frame of candidates.all('normal', normalThreshold) as Array<{ id: number; content: string }>) {
      if (evaluateExternalMemoryIngress({ content: frame.content }).action !== 'allow') continue;
      upgraded += promote.run('important', frame.id, frame.content, 'normal', normalThreshold).changes;
    }

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

    const summaryContent = allContent.join('\n---\n');
    if ([summaryContent, allContent.join('\n'), allContent.join('')].some(
      content => evaluateExternalMemoryIngress({ content }).action !== 'allow',
    )) return null;

    // Create a summary session
    const summarySession = this.sessions.create('daily-summary');
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
          const baseFrame = allFrames.find(f => f.id === ids[i]);
          const referencedFrame = allFrames.find(f => f.id === ids[j]);
          if (!baseFrame || !referencedFrame) continue;
          const description = `Shared entity: ${entityName}`;
          const bContent = JSON.stringify({ description, references: [ids[j]] });
          const sourceContent = [baseFrame.content, referencedFrame.content];
          if ([entityName, bContent, ...sourceContent, sourceContent.join('\n'), sourceContent.join('')].some(
            content => evaluateExternalMemoryIngress({ content }).action !== 'allow',
          )) continue;
          linkedPairs.add(pairKey);

          this.frames.createBFrame(
            baseFrame.gop_id,
            description,
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
  distillSessionContent(sessionDate: string, summary: string, keyPoints: string[]): MemoryFrame | null {
    const parts = [`Session (${sessionDate}): ${summary}`];
    if (keyPoints.length > 0) {
      parts.push('Key points: ' + keyPoints.join('; '));
    }
    const content = parts.join('. ');
    const components = [sessionDate, summary, ...keyPoints];
    if ([content, components.join('\n'), components.join('')].some(
      projection => evaluateExternalMemoryIngress({ content: projection }).action !== 'allow',
    )) return null;

    // Replace-on-update: re-distilling the same session (same date+summary,
    // evolving key points) must update the one distilled frame. createIFrame's
    // exact-content dedup can't catch the drifting key-points tail — every
    // cron re-run appended another near-identical "Session (…)" frame.
    this.frames.deleteByContentPrefix(`Session (${sessionDate}): ${summary}`);

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
    if (evaluateExternalMemoryIngress({ content: projectId }).action !== 'allow') return null;
    const projectSessions = this.sessions.getByProject(projectId);
    const closedSessions = projectSessions.filter(s => s.status === 'closed' || s.status === 'archived');

    if (closedSessions.length === 0) return null;

    const allContent: string[] = [];
    const sourceContent: string[] = [];
    for (const session of closedSessions) {
      const latestI = this.frames.getLatestIFrame(session.gop_id);
      if (latestI) {
        allContent.push(`[${session.gop_id}] ${latestI.content}`);
        sourceContent.push(latestI.content);
      }
    }

    if (allContent.length === 0) return null;

    const consolidatedContent = allContent.join('\n---\n');
    if ([consolidatedContent, sourceContent.join('\n'), sourceContent.join('')].some(
      content => evaluateExternalMemoryIngress({ content }).action !== 'allow',
    )) return null;

    const consolidationSession = this.sessions.create(projectId);
    return this.frames.createIFrame(
      consolidationSession.gop_id,
      consolidatedContent,
      'important'
    );
  }
}
