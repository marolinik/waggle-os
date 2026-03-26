import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../src/mind/db.js';
import { FrameStore } from '../src/mind/frames.js';
import { IdentityLayer } from '../src/mind/identity.js';
import { AwarenessLayer } from '../src/mind/awareness.js';
import { MultiMind } from '../src/multi-mind.js';

describe('MultiMind', () => {
  let mm: MultiMind;

  afterEach(() => {
    mm?.close();
  });

  describe('constructor', () => {
    it('opens with personal mind only', () => {
      mm = new MultiMind(':memory:');
      expect(mm.personal).toBeInstanceOf(MindDB);
      expect(mm.workspace).toBeNull();
    });

    it('opens with personal and workspace minds', () => {
      mm = new MultiMind(':memory:', ':memory:');
      expect(mm.personal).toBeInstanceOf(MindDB);
      expect(mm.workspace).toBeInstanceOf(MindDB);
    });
  });

  describe('identity', () => {
    beforeEach(() => {
      mm = new MultiMind(':memory:', ':memory:');
    });

    it('returns identity from personal mind', () => {
      const identity = new IdentityLayer(mm.personal);
      identity.create({
        name: 'TestAgent',
        role: 'assistant',
        department: 'engineering',
        personality: 'helpful',
        capabilities: 'memory, search',
        system_prompt: 'You are a test agent.',
      });

      const result = mm.getIdentity();
      expect(result.name).toBe('TestAgent');
      expect(result.role).toBe('assistant');
    });

    it('hasIdentity returns false when no identity set', () => {
      expect(mm.hasIdentity()).toBe(false);
    });

    it('hasIdentity returns true when identity exists', () => {
      const identity = new IdentityLayer(mm.personal);
      identity.create({
        name: 'TestAgent',
        role: 'assistant',
        department: '',
        personality: '',
        capabilities: '',
        system_prompt: '',
      });
      expect(mm.hasIdentity()).toBe(true);
    });

    it('throws when getting identity that does not exist', () => {
      expect(() => mm.getIdentity()).toThrow('No identity configured');
    });
  });

  describe('awareness', () => {
    beforeEach(() => {
      mm = new MultiMind(':memory:', ':memory:');
    });

    it('returns combined awareness from both minds', () => {
      const personalAwareness = new AwarenessLayer(mm.personal);
      personalAwareness.add('task', 'Personal task', 5);

      const workspaceAwareness = new AwarenessLayer(mm.workspace!);
      workspaceAwareness.add('task', 'Workspace task', 3);

      const items = mm.getAwareness();
      expect(items).toHaveLength(2);
      // Sorted by priority desc
      expect(items[0].content).toBe('Personal task');
      expect(items[1].content).toBe('Workspace task');
    });

    it('returns only personal awareness when no workspace', () => {
      mm.close();
      mm = new MultiMind(':memory:');

      const personalAwareness = new AwarenessLayer(mm.personal);
      personalAwareness.add('flag', 'Personal flag', 1);

      const items = mm.getAwareness();
      expect(items).toHaveLength(1);
      expect(items[0].content).toBe('Personal flag');
    });

    it('sorts combined awareness by priority descending', () => {
      const personalAwareness = new AwarenessLayer(mm.personal);
      personalAwareness.add('task', 'Low prio personal', 1);

      const workspaceAwareness = new AwarenessLayer(mm.workspace!);
      workspaceAwareness.add('task', 'High prio workspace', 10);

      const items = mm.getAwareness();
      expect(items[0].content).toBe('High prio workspace');
      expect(items[1].content).toBe('Low prio personal');
    });
  });

  describe('search', () => {
    beforeEach(() => {
      mm = new MultiMind(':memory:', ':memory:');
    });

    function addMemory(db: MindDB, gopId: string, content: string) {
      // Create a session first (foreign key)
      db.getDatabase().prepare(
        "INSERT OR IGNORE INTO sessions (gop_id, status) VALUES (?, 'active')"
      ).run(gopId);
      const frames = new FrameStore(db);
      return frames.createIFrame(gopId, content);
    }

    it('searches across both minds', () => {
      addMemory(mm.personal, 'gop-1', 'TypeScript is a programming language');
      addMemory(mm.workspace!, 'gop-2', 'TypeScript project setup guide');

      const results = mm.searchAll('TypeScript');
      expect(results).toHaveLength(2);
      const sources = results.map(r => r.source);
      expect(sources).toContain('personal');
      expect(sources).toContain('workspace');
    });

    it('searches personal only', () => {
      addMemory(mm.personal, 'gop-1', 'Python data analysis');
      addMemory(mm.workspace!, 'gop-2', 'Python web framework');

      const results = mm.search('Python', 'personal');
      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('personal');
      expect(results[0].content).toBe('Python data analysis');
    });

    it('searches workspace only', () => {
      addMemory(mm.personal, 'gop-1', 'React components guide');
      addMemory(mm.workspace!, 'gop-2', 'React hooks tutorial');

      const results = mm.search('React', 'workspace');
      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('workspace');
      expect(results[0].content).toBe('React hooks tutorial');
    });

    it('returns empty array for no matches', () => {
      addMemory(mm.personal, 'gop-1', 'Something unrelated');
      const results = mm.searchAll('xyznonexistent');
      expect(results).toHaveLength(0);
    });

    it('respects the limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        addMemory(mm.personal, `gop-p${i}`, `JavaScript lesson number ${i}`);
      }
      for (let i = 0; i < 5; i++) {
        addMemory(mm.workspace!, `gop-w${i}`, `JavaScript tutorial number ${i}`);
      }

      const results = mm.searchAll('JavaScript', 3);
      expect(results).toHaveLength(3);
    });

    it('handles search with no workspace gracefully', () => {
      mm.close();
      mm = new MultiMind(':memory:');

      addMemory(mm.personal, 'gop-1', 'Rust memory safety');

      const results = mm.search('Rust', 'all');
      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('personal');
    });

    it('workspace scope returns empty when no workspace', () => {
      mm.close();
      mm = new MultiMind(':memory:');

      addMemory(mm.personal, 'gop-1', 'Some content');

      const results = mm.search('content', 'workspace');
      expect(results).toHaveLength(0);
    });

    it('sanitizes FTS5 queries with special characters', () => {
      addMemory(mm.personal, 'gop-1', 'Error handling in production');

      // Should not throw even with special chars
      const results = mm.searchAll('error "handling"');
      expect(results).toHaveLength(1);
    });
  });

  describe('switchWorkspace', () => {
    it('switches from no workspace to a new workspace', () => {
      mm = new MultiMind(':memory:');
      expect(mm.workspace).toBeNull();

      mm.switchWorkspace(':memory:');
      expect(mm.workspace).toBeInstanceOf(MindDB);
    });

    it('switches between workspaces', () => {
      mm = new MultiMind(':memory:', ':memory:');
      const oldWorkspace = mm.workspace;

      // Add something to old workspace
      const oldAwareness = new AwarenessLayer(mm.workspace!);
      oldAwareness.add('task', 'Old workspace task', 1);

      mm.switchWorkspace(':memory:');
      expect(mm.workspace).not.toBe(oldWorkspace);

      // New workspace should be empty
      const items = mm.getAwareness();
      // Only personal items (none added), no workspace items
      expect(items.every(i => i.content !== 'Old workspace task')).toBe(true);
    });

    it('new workspace is searchable after switch', () => {
      mm = new MultiMind(':memory:', ':memory:');

      mm.switchWorkspace(':memory:');

      // Add memory to new workspace
      mm.workspace!.getDatabase().prepare(
        "INSERT OR IGNORE INTO sessions (gop_id, status) VALUES (?, 'active')"
      ).run('gop-new');
      const frames = new FrameStore(mm.workspace!);
      frames.createIFrame('gop-new', 'New workspace content about databases');

      const results = mm.search('databases', 'workspace');
      expect(results).toHaveLength(1);
      expect(results[0].source).toBe('workspace');
    });
  });

  describe('layer accessors', () => {
    beforeEach(() => {
      mm = new MultiMind(':memory:', ':memory:');
    });

    it('returns personal FrameStore', () => {
      expect(mm.getFrameStore('personal')).toBeInstanceOf(FrameStore);
    });

    it('returns workspace FrameStore', () => {
      expect(mm.getFrameStore('workspace')).toBeInstanceOf(FrameStore);
    });

    it('returns null workspace FrameStore when no workspace', () => {
      mm.close();
      mm = new MultiMind(':memory:');
      expect(mm.getFrameStore('workspace')).toBeNull();
    });

    it('returns personal AwarenessLayer', () => {
      expect(mm.getAwarenessLayer('personal')).toBeInstanceOf(AwarenessLayer);
    });

    it('returns workspace AwarenessLayer', () => {
      expect(mm.getAwarenessLayer('workspace')).toBeInstanceOf(AwarenessLayer);
    });

    it('returns IdentityLayer from personal mind', () => {
      expect(mm.getIdentityLayer()).toBeInstanceOf(IdentityLayer);
    });
  });

  describe('close', () => {
    it('closes both minds without error', () => {
      mm = new MultiMind(':memory:', ':memory:');
      expect(() => mm.close()).not.toThrow();
    });

    it('closes personal-only mind without error', () => {
      mm = new MultiMind(':memory:');
      expect(() => mm.close()).not.toThrow();
    });
  });
});
