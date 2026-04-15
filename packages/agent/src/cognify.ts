import type {
  MindDB,
  FrameStore,
  SessionStore,
  KnowledgeGraph,
  HybridSearch,
  Importance,
  Embedder,
} from '@waggle/core';
import { extractEntities, extractRelations, type ExtractedEntity } from './entity-extractor.js';
import { MemoryLinker, type MemoryLink } from './memory-linker.js';

export interface CognifyConfig {
  db: MindDB;
  embedder: Embedder;
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
   */
  async cognify(
    content: string,
    importance: Importance = 'normal',
    gopId?: string,
  ): Promise<CognifyResult> {
    // 1. Ensure a session exists
    const resolvedGopId = gopId ?? this.ensureSession();

    // 2. Save a frame (I-frame if none exists, P-frame otherwise)
    const latestI = this.frames.getLatestIFrame(resolvedGopId);
    const frame = latestI
      ? this.frames.createPFrame(resolvedGopId, content, latestI.id, importance)
      : this.frames.createIFrame(resolvedGopId, content, importance);

    // 3. Extract entities from content
    const extracted = extractEntities(content);

    // 4. Upsert entities into KnowledgeGraph
    const entityIds = this.upsertEntities(extracted);

    // 5. Create co-occurrence relations between entities found in same text
    let relationsCreated = this.createCoOccurrenceRelations(entityIds);

    // 5b. Extract semantic relations (led_by, reports_to, depends_on, etc.)
    const semanticRelations = extractRelations(content, extracted);
    for (const rel of semanticRelations) {
      try {
        const srcEntity = this.knowledge.searchEntities(rel.source, 5).find(e => e.name.toLowerCase() === rel.source.toLowerCase());
        const tgtEntity = this.knowledge.searchEntities(rel.target, 5).find(e => e.name.toLowerCase() === rel.target.toLowerCase());
        if (srcEntity && tgtEntity) {
          const existing = this.knowledge.getRelationsFrom(srcEntity.id, rel.relationType);
          if (!existing.some(r => r.target_id === tgtEntity.id)) {
            this.knowledge.createRelation(srcEntity.id, tgtEntity.id, rel.relationType, rel.confidence, { source: 'semantic' });
            relationsCreated++;
          }
        }
      } catch { /* non-blocking */ }
    }

    // 6. Index the frame for vector search
    await this.search.indexFrame(frame.id, content);

    // 7. Find related frames if linking is enabled
    let relatedFrames: MemoryLink[] | undefined;
    if (this.linker) {
      relatedFrames = await this.linker.findRelated(content);
    }

    return {
      frameId: frame.id,
      entitiesExtracted: entityIds.length,
      relationsCreated,
      relatedFrames,
    };
  }

  /**
   * Cognify an existing frame — extract entities, build relations, re-index.
   * Used for post-harvest processing of imported frames.
   */
  async cognifyFrame(frameId: number): Promise<CognifyResult | null> {
    const frame = this.frames.getById(frameId);
    if (!frame) return null;

    const extracted = extractEntities(frame.content);
    const entityIds = this.upsertEntities(extracted);
    let relationsCreated = this.createCoOccurrenceRelations(entityIds);

    const semanticRelations = extractRelations(frame.content, extracted);
    for (const rel of semanticRelations) {
      try {
        const srcEntity = this.knowledge.searchEntities(rel.source, 5).find(e => e.name.toLowerCase() === rel.source.toLowerCase());
        const tgtEntity = this.knowledge.searchEntities(rel.target, 5).find(e => e.name.toLowerCase() === rel.target.toLowerCase());
        if (srcEntity && tgtEntity) {
          const existing = this.knowledge.getRelationsFrom(srcEntity.id, rel.relationType);
          if (!existing.some(r => r.target_id === tgtEntity.id)) {
            this.knowledge.createRelation(srcEntity.id, tgtEntity.id, rel.relationType, rel.confidence, { source: 'semantic' });
            relationsCreated++;
          }
        }
      } catch { /* non-blocking */ }
    }

    // Re-index for search
    try { await this.search.indexFrame(frame.id, frame.content); } catch { /* non-fatal */ }

    return {
      frameId: frame.id,
      entitiesExtracted: entityIds.length,
      relationsCreated,
    };
  }

  /**
   * Cognify a batch of existing frames. Returns summary stats.
   */
  async cognifyBatch(frameIds: number[]): Promise<{ processed: number; entities: number; relations: number }> {
    let processed = 0;
    let entities = 0;
    let relations = 0;
    for (const id of frameIds) {
      const result = await this.cognifyFrame(id);
      if (result) {
        processed++;
        entities += result.entitiesExtracted;
        relations += result.relationsCreated;
      }
    }
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
    for (const e of extracted) {
      const existing = this.knowledge.getEntitiesByType(e.type)
        .find(ent => ent.name.toLowerCase() === e.name.toLowerCase());
      if (existing) {
        ids.push(existing.id);
      } else {
        const created = this.knowledge.createEntity(e.type, e.name, {
          confidence: e.confidence,
          source: 'cognify',
        });
        ids.push(created.id);
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
}
