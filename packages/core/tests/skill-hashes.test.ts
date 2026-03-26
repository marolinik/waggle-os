import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MindDB } from '../src/mind/db.js';
import { SkillHashStore, computeSkillHash } from '../src/skill-hashes.js';

describe('SkillHashStore', () => {
  let tmpDir: string;
  let db: MindDB;
  let store: SkillHashStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-skill-hash-'));
    db = new MindDB(path.join(tmpDir, 'test.mind'));
    store = new SkillHashStore(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('setHash + getHash round-trips correctly', () => {
    const hash = computeSkillHash('# My Skill\nDo something useful');
    store.setHash('my-skill', hash);

    const stored = store.getHash('my-skill');
    expect(stored).toBeDefined();
    expect(stored!.name).toBe('my-skill');
    expect(stored!.hash).toBe(hash);
    expect(stored!.verified_at).toBeTruthy();
  });

  it('computeSkillHash produces consistent SHA-256', () => {
    const content = '# Draft Memo\nHelp the user draft professional memos.';
    const hash1 = computeSkillHash(content);
    const hash2 = computeSkillHash(content);

    expect(hash1).toBe(hash2);
    // SHA-256 hex is 64 characters
    expect(hash1).toHaveLength(64);
    // Should be hex string
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('checkAll detects changed skill', () => {
    const originalContent = '# Skill v1\nOriginal content';
    store.verify('changed-skill', originalContent);

    const result = store.checkAll([
      { name: 'changed-skill', content: '# Skill v2\nModified content' },
    ]);

    expect(result.changed).toEqual(['changed-skill']);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('checkAll detects new (added) skill', () => {
    const result = store.checkAll([
      { name: 'brand-new-skill', content: '# New Skill\nFresh content' },
    ]);

    expect(result.added).toEqual(['brand-new-skill']);
    expect(result.changed).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('checkAll detects removed skill', () => {
    store.verify('old-skill', '# Old Skill\nGone now');

    const result = store.checkAll([]);

    expect(result.removed).toEqual(['old-skill']);
    expect(result.changed).toEqual([]);
    expect(result.added).toEqual([]);
  });

  it('checkAll returns empty when nothing changed', () => {
    const content = '# Stable Skill\nNothing changed here';
    store.verify('stable-skill', content);

    const result = store.checkAll([
      { name: 'stable-skill', content },
    ]);

    expect(result.changed).toEqual([]);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('verify updates hash to current content', () => {
    const v1 = '# Skill v1';
    const v2 = '# Skill v2';
    store.verify('evolving-skill', v1);

    const hashBefore = store.getHash('evolving-skill')!.hash;
    expect(hashBefore).toBe(computeSkillHash(v1));

    store.verify('evolving-skill', v2);

    const hashAfter = store.getHash('evolving-skill')!.hash;
    expect(hashAfter).toBe(computeSkillHash(v2));
    expect(hashAfter).not.toBe(hashBefore);
  });

  it('removeHash cleans up', () => {
    store.verify('doomed-skill', '# Doomed');
    expect(store.getHash('doomed-skill')).toBeDefined();

    store.removeHash('doomed-skill');
    expect(store.getHash('doomed-skill')).toBeUndefined();
  });
});
