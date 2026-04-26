/**
 * AwarenessLayer tests — full-file port from
 * hive-mind/packages/core/src/mind/awareness.test.ts.
 *
 * Memory Sync Repair Step 2. Source: hive-mind file at HEAD c363257.
 *
 * Filename suffix `-hive-mind` keeps this distinct from waggle-os's own
 * `awareness.test.ts`. Hive-mind covers metadata round-trip,
 * updateMetadata semantics, and getByStatus — surfaces waggle-os's own
 * file does not exercise.
 *
 * Adapted imports: `./db.js`, `./awareness.js` → `../../src/mind/...`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, existsSync } from 'node:fs';
import { MindDB } from '../../src/mind/db.js';
import { AwarenessLayer } from '../../src/mind/awareness.js';

describe('AwarenessLayer (hive-mind port)', () => {
  let dbPath: string;
  let db: MindDB;
  let awareness: AwarenessLayer;

  beforeEach(() => {
    dbPath = join(tmpdir(), `waggle-mind-awareness-test-${Date.now()}-${Math.random()}.mind`);
    db = new MindDB(dbPath);
    awareness = new AwarenessLayer(db);
  });

  afterEach(() => {
    db.close();
    if (existsSync(dbPath)) rmSync(dbPath);
    for (const suffix of ['-shm', '-wal']) {
      if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix);
    }
  });

  it('add() inserts a row with defaults and get() round-trips it', () => {
    const item = awareness.add('task', 'review PR #42');
    expect(item.category).toBe('task');
    expect(item.content).toBe('review PR #42');
    expect(item.priority).toBe(0);
    expect(item.expires_at).toBeNull();
    expect(JSON.parse(item.metadata)).toEqual({});

    const loaded = awareness.get(item.id);
    expect(loaded?.id).toBe(item.id);
  });

  it('add() with metadata stores it as JSON and parseMetadata reads it back', () => {
    const item = awareness.add('action', 'ran tests', 5, undefined, {
      context: 'CI pipeline',
      status: 'success',
    });
    const meta = awareness.parseMetadata(item);
    expect(meta.context).toBe('CI pipeline');
    expect(meta.status).toBe('success');
  });

  it('update() rewrites fields and leaves others unchanged', () => {
    const item = awareness.add('pending', 'waiting for review', 2);
    const updated = awareness.update(item.id, { priority: 9 });
    expect(updated.priority).toBe(9);
    expect(updated.content).toBe('waiting for review');

    const same = awareness.update(item.id, {});
    expect(same.priority).toBe(9);
  });

  it('updateMetadata() merges into existing metadata without replacing untouched keys', () => {
    const item = awareness.add('flag', 'context-switch', 0, undefined, {
      context: 'onboarding',
    });
    const merged = awareness.updateMetadata(item.id, { status: 'in_progress' });
    const meta = awareness.parseMetadata(merged);
    expect(meta.context).toBe('onboarding');
    expect(meta.status).toBe('in_progress');
  });

  it('updateMetadata() throws for unknown ids', () => {
    expect(() => awareness.updateMetadata(9999, { status: 'x' })).toThrow(
      /Awareness item 9999 not found/,
    );
  });

  it('getAll() orders by priority desc and caps at MAX_ITEMS (10)', () => {
    for (let i = 0; i < 15; i++) {
      awareness.add('task', `task ${i}`, i);
    }
    const all = awareness.getAll();
    expect(all).toHaveLength(10);
    expect(all[0].priority).toBe(14);
    expect(all[9].priority).toBe(5);
  });

  it('getByCategory() filters by category and respects the MAX_ITEMS cap', () => {
    for (let i = 0; i < 12; i++) awareness.add('task', `t${i}`, i);
    awareness.add('flag', 'f-only', 100);

    const tasks = awareness.getByCategory('task');
    expect(tasks).toHaveLength(10);
    expect(tasks.every((t) => t.category === 'task')).toBe(true);

    const flags = awareness.getByCategory('flag');
    expect(flags).toHaveLength(1);
    expect(flags[0].content).toBe('f-only');
  });

  it('getByStatus() returns only items whose metadata.status matches', () => {
    awareness.add('action', 'a1', 0, undefined, { status: 'done' });
    awareness.add('action', 'a2', 0, undefined, { status: 'pending' });
    awareness.add('action', 'a3', 0, undefined, { status: 'done' });

    const done = awareness.getByStatus('done').map((i) => i.content).sort();
    expect(done).toEqual(['a1', 'a3']);
  });

  it('expired items are excluded from getAll() / getByCategory()', () => {
    const pastIso = new Date(Date.now() - 60_000).toISOString();
    const futureIso = new Date(Date.now() + 60_000).toISOString();

    awareness.add('task', 'expired', 0, pastIso);
    const alive = awareness.add('task', 'alive', 0, futureIso);

    const visible = awareness.getAll().map((i) => i.id);
    expect(visible).toEqual([alive.id]);

    const tasks = awareness.getByCategory('task').map((i) => i.id);
    expect(tasks).toEqual([alive.id]);
  });

  it('remove() / clear() / clearCategory() delete rows as expected', () => {
    const a = awareness.add('task', 'a');
    awareness.add('task', 'b');
    awareness.add('flag', 'c');

    awareness.remove(a.id);
    expect(awareness.get(a.id)).toBeUndefined();

    awareness.clearCategory('task');
    expect(awareness.getByCategory('task')).toEqual([]);
    expect(awareness.getByCategory('flag')).toHaveLength(1);

    awareness.clear();
    expect(awareness.getAll()).toEqual([]);
  });

  it('toContext() renders section headers per non-empty category, skipping empty ones', () => {
    awareness.add('task', 'T1', 1);
    awareness.add('task', 'T2', 0);
    awareness.add('flag', 'F1', 0);

    const ctx = awareness.toContext();
    expect(ctx).toContain('Active Tasks:');
    expect(ctx).toContain('- T1');
    expect(ctx).toContain('- T2');
    expect(ctx).toContain('Context Flags:');
    expect(ctx).toContain('- F1');
    expect(ctx).not.toContain('Recent Actions:');
    expect(ctx).not.toContain('Pending Items:');
  });

  it('toContext() returns a sentinel message when there is no active content', () => {
    expect(awareness.toContext()).toBe('No active awareness items.');
  });
});
