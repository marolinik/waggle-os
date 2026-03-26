import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB, KnowledgeGraph } from '@waggle/core';
import { FeedbackHandler } from '../src/feedback-handler.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('FeedbackHandler', () => {
  let dbPath: string;
  let db: MindDB;
  let kg: KnowledgeGraph;
  let handler: FeedbackHandler;

  beforeEach(() => {
    dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-fb-')), 'test.mind');
    db = new MindDB(dbPath);
    kg = new KnowledgeGraph(db);
    handler = new FeedbackHandler(kg);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
  });

  it('updates entity when user corrects a fact', () => {
    const entity = kg.createEntity('person', 'Alice', { role: 'Engineer' });
    handler.correctEntity(entity.id, { role: 'Senior Engineer' });

    const updated = kg.getEntity(entity.id);
    expect(updated).toBeDefined();
    const props = JSON.parse(updated!.properties);
    expect(props.role).toBe('Senior Engineer');
    expect(props.last_corrected).toBeDefined();
  });

  it('preserves existing properties when correcting', () => {
    const entity = kg.createEntity('person', 'Bob', { role: 'Dev', team: 'Alpha' });
    handler.correctEntity(entity.id, { role: 'Lead Dev' });

    const updated = kg.getEntity(entity.id);
    const props = JSON.parse(updated!.properties);
    expect(props.role).toBe('Lead Dev');
    expect(props.team).toBe('Alpha');
  });

  it('does nothing when correcting non-existent entity', () => {
    // Should not throw
    handler.correctEntity(99999, { role: 'Ghost' });
  });

  it('invalidates entity by setting valid_to', () => {
    const entity = kg.createEntity('fact', 'Sky is green', {});
    handler.invalidateEntity(entity.id, 'User corrected: sky is blue');

    const updated = kg.getEntity(entity.id);
    expect(updated).toBeDefined();
    expect(updated!.valid_to).not.toBeNull();
  });

  it('stores invalidation reason in properties', () => {
    const entity = kg.createEntity('fact', 'Old fact', { source: 'guess' });
    handler.invalidateEntity(entity.id, 'Proven wrong');

    const updated = kg.getEntity(entity.id);
    const props = JSON.parse(updated!.properties);
    expect(props.invalidation_reason).toBe('Proven wrong');
    expect(props.source).toBe('guess');
  });

  it('does nothing when invalidating non-existent entity', () => {
    // Should not throw
    handler.invalidateEntity(99999, 'Does not exist');
  });
});
