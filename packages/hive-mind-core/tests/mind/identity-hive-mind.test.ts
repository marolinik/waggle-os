/**
 * IdentityLayer tests — full-file port from
 * hive-mind/packages/core/src/mind/identity.test.ts.
 *
 * Memory Sync Repair Step 2. Source: hive-mind file at HEAD c363257.
 *
 * Filename suffix `-hive-mind` keeps this distinct from waggle-os's own
 * `identity.test.ts`. Hive-mind covers the no-op update path and the
 * label-prefixed toContext() rendering — surfaces waggle-os covers
 * differently.
 *
 * Adapted imports: `./db.js`, `./identity.js` → `../../src/mind/...`.
 *
 * NOTE: the "update bumps updated_at" test sleeps 1.1s because SQLite's
 * datetime('now') has only second precision. Slow but deterministic.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, existsSync } from 'node:fs';
import { MindDB } from '../../src/mind/db.js';
import { IdentityLayer } from '../../src/mind/identity.js';

describe('IdentityLayer (hive-mind port)', () => {
  let dbPath: string;
  let db: MindDB;
  let identity: IdentityLayer;

  beforeEach(() => {
    dbPath = join(tmpdir(), `waggle-mind-identity-test-${Date.now()}-${Math.random()}.mind`);
    db = new MindDB(dbPath);
    identity = new IdentityLayer(db);
  });

  afterEach(() => {
    db.close();
    if (existsSync(dbPath)) rmSync(dbPath);
    for (const suffix of ['-shm', '-wal']) {
      if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix);
    }
  });

  it('exists() returns false on a fresh mind and get() throws', () => {
    expect(identity.exists()).toBe(false);
    expect(() => identity.get()).toThrow(/No identity configured/);
  });

  it('create() stores the row with id=1 and get() round-trips it', () => {
    const created = identity.create({
      name: 'Hive',
      role: 'Memory Agent',
      department: 'Core',
      personality: 'terse',
      capabilities: 'recall,search',
      system_prompt: 'Respond concisely.',
    });

    expect(created.id).toBe(1);
    expect(created.name).toBe('Hive');
    expect(identity.exists()).toBe(true);

    const loaded = identity.get();
    expect(loaded.id).toBe(1);
    expect(loaded.role).toBe('Memory Agent');
  });

  it('update() rewrites fields and bumps updated_at', async () => {
    const before = identity.create({
      name: 'Hive',
      role: 'Memory Agent',
      department: '',
      personality: '',
      capabilities: '',
      system_prompt: '',
    });
    // Sleep 1 second because SQLite datetime('now') has second precision.
    await new Promise((r) => setTimeout(r, 1100));

    const after = identity.update({ role: 'Context Agent', department: 'Core' });
    expect(after.role).toBe('Context Agent');
    expect(after.department).toBe('Core');
    expect(after.name).toBe('Hive'); // Untouched field preserved.
    expect(Date.parse(after.updated_at)).toBeGreaterThan(Date.parse(before.updated_at));
  });

  it('update() throws when no identity is configured', () => {
    expect(() => identity.update({ name: 'Orphan' })).toThrow(/No identity configured/);
  });

  it('update() with no changes is a no-op and returns the current row', () => {
    identity.create({
      name: 'Hive',
      role: '',
      department: '',
      personality: '',
      capabilities: '',
      system_prompt: '',
    });
    const unchanged = identity.update({});
    expect(unchanged.name).toBe('Hive');
  });

  it('toContext() renders a label-prefixed block, skipping empty fields', () => {
    identity.create({
      name: 'Hive',
      role: 'Memory Agent',
      department: '',
      personality: 'terse',
      capabilities: '',
      system_prompt: 'Respond concisely.',
    });
    const ctx = identity.toContext();
    expect(ctx).toContain('Name: Hive');
    expect(ctx).toContain('Role: Memory Agent');
    expect(ctx).toContain('Personality: terse');
    expect(ctx).toContain('System Prompt: Respond concisely.');
    expect(ctx).not.toContain('Department:');
    expect(ctx).not.toContain('Capabilities:');
  });
});
