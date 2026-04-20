import type {
  FrameStore,
  SessionStore,
  KnowledgeGraph,
  HybridSearch,
  Importance,
} from '@waggle/core';
import { createCoreLogger } from '@waggle/core';
import { extractEntities, extractRelations, type ExtractedEntity } from './entity-extractor.js';
import { MemoryLinker, type MemoryLink } from './memory-linker.js';
import { logTurnEvent } from './turn-context.js';

const log = createCoreLogger('cognify');

export interface CognifyConfig {
  frames: FrameStore;
  sessions: SessionStore;
  knowledge: KnowledgeGraph;
  search: HybridSearch;
  enableLinking?: boolean;
}

export interface CognifyResult {
  frameId: number;
  entitiesExtracted: number;
  relationsCreated: number;
  relatedFrames?: MemoryLink[];
}

export class CognifyPipeline {
  private frames: FrameStore;
  private sessions: SessionStore;
  private knowledge: KnowledgeGraph;
  private search: HybridSearch;
  private linker?: MemoryLinker;

  constructor(config: CognifyConfig) {
    this.frames = config.frames;
    this.sessions = config.sessions;
    this.knowledge = config.knowledge;
    this.search = config.search;
    if (config.enableLinking) {
      this.linker = new MemoryLinker({ search: config.search });
    }
  }

  /**
   * Full cognify pipeline: save frame -> extract entities -> enrich graph -> index for search.
   * H-AUDIT-1: optional turnId threads trace propagation through entity + relation extraction.
   */
  async cognify(
    content: string,
    importance: Importance = 'normal',
    gopId?: string,
    turnId?: string,
  ): Promise<CognifyResult> {
    logTurnEvent(turnId, { stage: 'cognify.enter', contentChars: content.length, importance, gopId });
    // 1. Ensure a session exists
    const resolvedGopId = gopId ?? this.ensureSession();

    // 2. Save a frame (I-frame if none exists, P-frame otherwise)
    const latestI = this.frames.getLatestIFrame(resolvedGopId);
    const frame = latestI
      ? this.frames.createPFrame(resolvedGopId, content, latestI.id, importance)
      : this.frames.createIFrame(resolvedGopId, content, importance);

    // 3. Extract entities from content (guard against very long content)
    const maxContentLength = 10_000;
    const trimmedContent = content.slice(0, maxContentLength);
    const extracted = extractEntities(trimmedContent);

    // 4. Upsert entities into KnowledgeGraph
    const entityIds = this.upsertEntities(extracted);

    // 5. Create co-occurrence relations between entities found in same text
    let relationsCreated = this.createCoOccurrenceRelations(entityIds);

    // 5b. Extract semantic relations (led_by, reports_to, depends_on, etc.)
    relationsCreated += this.createSemanticRelations(content, extracted);

    // 6. Index the frame for vector search
    await this.search.indexFrame(frame.id, content);

    // 7. Find related frames if linking is enabled
    let relatedFrames: MemoryLink[] | undefined;
    if (this.linker) {
      relatedFrames = await this.linker.findRelated(content);
      relatedFrames = relatedFrames.filter(r => r.frameId !== frame.id);
    }

    const result = {
      frameId: frame.id,
      entitiesExtracted: entityIds.length,
      relationsCreated,
      relatedFrames,
    };
    logTurnEvent(turnId, { stage: 'cognify.exit', frameId: frame.id, entitiesExtracted: entityIds.length, relationsCreated });
    return result;
  }

  /**
   * Cognify an existing frame — extract entities, build relations, re-index.
   * Used for post-harvest processing of imported frames.
   * H-AUDIT-1: optional turnId for trace propagation.
   */
  async cognifyFrame(frameId: number, turnId?: string): Promise<CognifyResult | null> {
    logTurnEvent(turnId, { stage: 'cognify.frame.enter', frameId });
    const frame = this.frames.getById(frameId);
    if (!frame) return null;

    const maxContentLength = 10_000;
    const content = frame.content.slice(0, maxContentLength);
    const extracted = extractEntities(content);
    const entityIds = this.upsertEntities(extracted);
    let relationsCreated = this.createCoOccurrenceRelations(entityIds);

    relationsCreated += this.createSemanticRelations(content, extracted);

    // Re-index for search
    try {
      await this.search.indexFrame(frame.id, frame.content);
    } catch (err) {
      log.warn(`indexFrame failed for frame ${frame.id}`, err);
    }

    const frameResult = {
      frameId: frame.id,
      entitiesExtracted: entityIds.length,
      relationsCreated,
    };
    logTurnEvent(turnId, { stage: 'cognify.frame.exit', frameId: frame.id, entitiesExtracted: entityIds.length, relationsCreated });
    return frameResult;
  }

  /**
   * Cognify a batch of existing frames. Returns summary stats.
   * H-AUDIT-1: optional turnId propagates into per-frame cognify calls.
   */
  async cognifyBatch(frameIds: number[], turnId?: string): Promise<{ processed: number; entities: number; relations: number }> {
    logTurnEvent(turnId, { stage: 'cognify.batch.enter', frameCount: frameIds.length });
    let processed = 0;
    let entities = 0;
    let relations = 0;
    // Sequential: each frame's cognify may produce entities used by the next frame's relation linking
    for (const id of frameIds) {
      const result = await this.cognifyFrame(id, turnId);
      if (result) {
        processed++;
        entities += result.entitiesExtracted;
        relations += result.relationsCreated;
      }
    }
    logTurnEvent(turnId, { stage: 'cognify.batch.exit', processed, entities, relations });
    return { processed, entities, relations };
  }

  private ensureSession(): string {
    // Review (cognify Major #1): use the transaction-wrapped SessionStore.ensureActive()
    // method. The previous getActive() + create() sequence was racy — two concurrent
    // callers on a fresh mind both saw no active session and both created one, splitting
    // frames across twin sessions. Same fix pattern as autoSaveFromExchange (commit b8ffe8e).
    return this.sessions.ensureActive().gop_id;
  }

  /**
   * Upsert entities: if an entity with the same type+name exists, skip it;
   * otherwise create it. Returns the entity IDs (existing or new).
   */
  private upsertEntities(extracted: ExtractedEntity[]): number[] {
    const ids: number[] = [];
    // Pre-fetch entities by type to avoid N queries in the loop
    const typeCache = new Map<string, { id: number; name: string }[]>();
    const types = new Set(extracted.map(e => e.type));
    for (const type of types) {
      typeCache.set(type, this.knowledge.getEntitiesByType(type).map(ent => ({
        id: ent.id,
        name: ent.name.toLowerCase(),
      })));
    }

    for (const e of extracted) {
      const cached = typeCache.get(e.type) ?? [];
      const nameLower = e.name.toLowerCase();
      const existing = cached.find(ent => ent.name === nameLower);
      if (existing) {
        ids.push(existing.id);
      } else {
        const created = this.knowledge.createEntity(e.type, e.name, {
          confidence: e.confidence,
          source: 'cognify',
        });
        ids.push(created.id);
        // Add to cache so subsequent dupes in this batch are caught
        cached.push({ id: created.id, name: nameLower });
      }
    }
    return ids;
  }

  /**
   * Create co-occurrence relations between all pairs of entities found
   * in the same text. Uses "co_occurs_with" relation type.
   * Returns the number of new relations created.
   */
  private createCoOccurrenceRelations(entityIds: number[]): number {
    let count = 0;
    for (let i = 0; i < entityIds.length; i++) {
      for (let j = i + 1; j < entityIds.length; j++) {
        const sourceId = entityIds[i];
        const targetId = entityIds[j];

        // Check if relation already exists
        const existingRels = this.knowledge.getRelationsFrom(sourceId, 'co_occurs_with');
        const alreadyExists = existingRels.some(r => r.target_id === targetId);
        if (!alreadyExists) {
          this.knowledge.createRelation(sourceId, targetId, 'co_occurs_with', 0.8, {
            source: 'cognify',
          });
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Extract semantic relations (led_by, reports_to, depends_on, etc.)
   * from content and upsert them into the knowledge graph.
   * Returns the number of new relations created.
   */
  private createSemanticRelations(content: string, extracted: ExtractedEntity[]): number {
    let count = 0;
    const relations = extractRelations(content, extracted);
    for (const rel of relations) {
      try {
        const srcEntity = this.knowledge.searchEntities(rel.source, 5)
          .find(e => e.name.toLowerCase() === rel.source.toLowerCase());
        const tgtEntity = this.knowledge.searchEntities(rel.target, 5)
          .find(e => e.name.toLowerCase() === rel.target.toLowerCase());
        if (srcEntity && tgtEntity) {
          const existing = this.knowledge.getRelationsFrom(srcEntity.id, rel.relationType);
          if (!existing.some(r => r.target_id === tgtEntity.id)) {
            this.knowledge.createRelation(srcEntity.id, tgtEntity.id, rel.relationType, rel.confidence, { source: 'semantic' });
            count++;
          }
        }
      } catch (err) {
        log.warn('semantic relation extraction failed', err);
      }
    }
    return count;
  }
}
