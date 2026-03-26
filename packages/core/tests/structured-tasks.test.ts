import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../src/mind/db.js';
import { AwarenessLayer } from '../src/mind/awareness.js';

describe('Structured Task Model', () => {
  let db: MindDB;
  let awareness: AwarenessLayer;

  beforeEach(() => {
    db = new MindDB(':memory:');
    awareness = new AwarenessLayer(db);
  });

  afterEach(() => {
    db.close();
  });

  it('stores task with metadata', () => {
    const item = awareness.add('task', 'Fix the login bug', 0, undefined, {
      status: 'pending',
      context: 'auth module',
      priority: 'high',
    });
    expect(item).toBeDefined();
    expect(item.content).toBe('Fix the login bug');
    const meta = awareness.parseMetadata(item);
    expect(meta.status).toBe('pending');
    expect(meta.context).toBe('auth module');
    expect(meta.priority).toBe('high');
  });

  it('stores task without metadata (defaults to empty object)', () => {
    const item = awareness.add('task', 'Simple task');
    expect(item.metadata).toBe('{}');
    const meta = awareness.parseMetadata(item);
    expect(meta).toEqual({});
  });

  it('updates metadata on existing task', () => {
    const item = awareness.add('task', 'Deploy v2.0', 0, undefined, { status: 'pending' });
    awareness.updateMetadata(item.id, { status: 'in_progress', result: 'deploying...' });
    const updated = awareness.get(item.id);
    expect(updated).toBeDefined();
    const meta = awareness.parseMetadata(updated!);
    expect(meta.status).toBe('in_progress');
    expect(meta.result).toBe('deploying...');
  });

  it('merges metadata without losing existing fields', () => {
    const item = awareness.add('task', 'Multi-step task', 0, undefined, {
      status: 'pending',
      context: 'deployment',
    });
    awareness.updateMetadata(item.id, { status: 'in_progress' });
    const updated = awareness.get(item.id);
    const meta = awareness.parseMetadata(updated!);
    expect(meta.status).toBe('in_progress');
    expect(meta.context).toBe('deployment'); // preserved
  });

  it('throws when updating metadata for nonexistent item', () => {
    expect(() => awareness.updateMetadata(999, { status: 'done' })).toThrow('Awareness item 999 not found');
  });

  it('retrieves tasks by status', () => {
    awareness.add('task', 'Task A', 0, undefined, { status: 'pending' });
    awareness.add('task', 'Task B', 0, undefined, { status: 'done' });
    awareness.add('task', 'Task C', 0, undefined, { status: 'pending' });
    const pending = awareness.getByStatus('pending');
    expect(pending.length).toBe(2);
    expect(pending.every(i => awareness.parseMetadata(i).status === 'pending')).toBe(true);
  });

  it('getByStatus returns empty array when no matches', () => {
    awareness.add('task', 'Task A', 0, undefined, { status: 'pending' });
    const inProgress = awareness.getByStatus('in_progress');
    expect(inProgress).toEqual([]);
  });

  it('getByStatus ignores items without metadata status', () => {
    awareness.add('task', 'No metadata task');
    awareness.add('task', 'Has status', 0, undefined, { status: 'pending' });
    const pending = awareness.getByStatus('pending');
    expect(pending.length).toBe(1);
  });

  it('get() retrieves a single item by id', () => {
    const item = awareness.add('task', 'Find me', 5);
    const found = awareness.get(item.id);
    expect(found).toBeDefined();
    expect(found!.content).toBe('Find me');
    expect(found!.priority).toBe(5);
  });

  it('get() returns undefined for nonexistent id', () => {
    const found = awareness.get(999);
    expect(found).toBeUndefined();
  });
});
