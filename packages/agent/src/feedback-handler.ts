import type { KnowledgeGraph } from '@waggle/core';

export class FeedbackHandler {
  private kg: KnowledgeGraph;

  constructor(kg: KnowledgeGraph) {
    this.kg = kg;
  }

  /**
   * Correct an entity's properties by merging updates into existing properties.
   * Adds a `last_corrected` timestamp to track when the correction happened.
   */
  correctEntity(entityId: number, updates: Record<string, unknown>): void {
    const entity = this.kg.getEntity(entityId);
    if (!entity) return;

    const existingProps: Record<string, unknown> = JSON.parse(entity.properties || '{}');
    this.kg.updateEntity(entityId, {
      properties: { ...existingProps, ...updates, last_corrected: new Date().toISOString() },
    });
  }

  /**
   * Invalidate an entity by retiring it (setting valid_to) and recording the reason.
   */
  invalidateEntity(entityId: number, reason: string): void {
    const entity = this.kg.getEntity(entityId);
    if (!entity) return;

    // Store the invalidation reason in properties before retiring
    const existingProps: Record<string, unknown> = JSON.parse(entity.properties || '{}');
    this.kg.updateEntity(entityId, {
      properties: { ...existingProps, invalidation_reason: reason },
    });

    // Retire the entity (sets valid_to to now)
    this.kg.retireEntity(entityId);
  }
}
