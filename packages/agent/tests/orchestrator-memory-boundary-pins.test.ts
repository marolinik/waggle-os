import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '@waggle/core';
import { Orchestrator } from '../src/orchestrator.js';
import { MockEmbedder } from '../../hive-mind-core/tests/mind/helpers/mock-embedder.js';

/**
 * CA-3 pin program — the memory boundary, characterized before it is inverted.
 *
 * `Orchestrator` is the composition root for the memory layers: its constructor
 * `new`s seven concrete `@waggle/core` classes off `config.db`
 * (`orchestrator.ts:189-196`), and `setWorkspaceMind()` `new`s four more off a
 * second db (`:233-236`). CA-3 replaces those twelve construction sites with
 * interfaces the use case owns and `@waggle/core` implements — Parameterize
 * Constructor with production defaults.
 *
 * These pins therefore assert on the DATABASES, never on the layer objects.
 * A pin that asserted through `getFrames()` would be pinning the very object
 * graph the inversion replaces, and would have to be rewritten by the change it
 * exists to guard. Reading the raw SQLite handles instead means an inverted
 * constructor that binds a layer to the wrong db — or to a shared default —
 * fails here whatever shape the layers end up having.
 *
 * Every expected value below was read off a failing probe, not predicted. The
 * first draft assumed `identity.set()`, an `awareness_items` table and a
 * two-argument `createEntity`; none of the three exist. It also wrote frames
 * without a session and hit `FOREIGN KEY constraint failed` — since
 * `memory_frames.gop_id` references `sessions`, every frame here is seeded
 * through a real session, and the session counts below follow from that.
 */

/** Count rows in one table of one mind, independent of any store object. */
function countRows(db: MindDB, table: string): number {
  const row = db.getDatabase().prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number };
  return row.cnt;
}

/** Seed one I-frame through the orchestrator's own personal layers. */
function seedPersonalFrame(orchestrator: Orchestrator, content: string): void {
  const session = orchestrator.getSessions().create();
  orchestrator.getFrames().createIFrame(session.gop_id, content, 'normal', 'user_stated');
}

const IDENTITY_INPUT = {
  name: 'Marko',
  role: 'Founder',
  department: 'Egzakta',
  personality: 'direct',
  capabilities: 'strategy',
  system_prompt: '',
};

describe('CA-3 pins — Orchestrator is the composition root for the memory layers', () => {
  let personal: MindDB;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    personal = new MindDB(':memory:');
    orchestrator = new Orchestrator({ db: personal, embedder: new MockEmbedder() });
  });

  afterEach(() => {
    personal.close();
  });

  describe('the seven constructor-built layers all bind to config.db', () => {
    it('a frame and its session land in the db that was passed in', () => {
      seedPersonalFrame(orchestrator, 'personal frame');

      expect(countRows(personal, 'memory_frames')).toBe(1);
      expect(countRows(personal, 'sessions')).toBe(1);
    });

    it('an entity written through the knowledge graph lands in the db that was passed in', () => {
      orchestrator.getKnowledge().createEntity('product', 'Waggle', {});

      expect(countRows(personal, 'knowledge_entities')).toBe(1);
    });

    it('awareness and identity write to the db that was passed in', () => {
      orchestrator.getAwareness().add('task', 'pin the memory boundary', 10);
      orchestrator.getIdentity().create(IDENTITY_INPUT);

      expect(countRows(personal, 'awareness')).toBe(1);
      expect(countRows(personal, 'identity')).toBe(1);
    });

    it('getMemoryStats reads the same db the layers wrote to', () => {
      seedPersonalFrame(orchestrator, 'counted frame');
      orchestrator.getKnowledge().createEntity('product', 'Hive', {});

      expect(orchestrator.getMemoryStats()).toEqual({
        frameCount: 1,
        sessionCount: 1,
        entityCount: 1,
      });
    });
  });

  describe('two orchestrators never share a memory layer', () => {
    it('a frame written through one orchestrator is invisible to another over a different db', () => {
      const other = new MindDB(':memory:');
      const otherOrchestrator = new Orchestrator({ db: other, embedder: new MockEmbedder() });

      seedPersonalFrame(orchestrator, 'only mine');

      expect(countRows(personal, 'memory_frames')).toBe(1);
      expect(countRows(other, 'memory_frames')).toBe(0);
      expect(otherOrchestrator.getMemoryStats().frameCount).toBe(0);

      other.close();
    });
  });
});

describe('CA-3 pins — setWorkspaceMind builds a second layer set over a second db', () => {
  let personal: MindDB;
  let workspace: MindDB;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    personal = new MindDB(':memory:');
    workspace = new MindDB(':memory:');
    orchestrator = new Orchestrator({ db: personal, embedder: new MockEmbedder() });
  });

  afterEach(() => {
    personal.close();
    workspace.close();
  });

  it('activating a workspace mind does not move or copy personal frames', () => {
    seedPersonalFrame(orchestrator, 'personal frame');

    orchestrator.setWorkspaceMind(workspace);

    expect(countRows(personal, 'memory_frames')).toBe(1);
    expect(countRows(workspace, 'memory_frames')).toBe(0);
    expect(orchestrator.hasWorkspaceMind()).toBe(true);
  });

  it('the personal frame store keeps writing to the personal db while a workspace is active', () => {
    orchestrator.setWorkspaceMind(workspace);

    seedPersonalFrame(orchestrator, 'still personal');

    expect(countRows(personal, 'memory_frames')).toBe(1);
    expect(countRows(workspace, 'memory_frames')).toBe(0);
  });

  it('identity stays personal — it is not rebuilt over the workspace db', () => {
    orchestrator.setWorkspaceMind(workspace);

    orchestrator.getIdentity().create(IDENTITY_INPUT);

    expect(countRows(personal, 'identity')).toBe(1);
    expect(countRows(workspace, 'identity')).toBe(0);
  });

  it('getMemoryStats sums personal and workspace counts while a workspace is active', () => {
    seedPersonalFrame(orchestrator, 'personal one');
    orchestrator.setWorkspaceMind(workspace);
    seedPersonalFrame(orchestrator, 'personal two');

    expect(orchestrator.getMemoryStats().frameCount).toBe(2);
    expect(countRows(workspace, 'memory_frames')).toBe(0);
  });

  it('a second setWorkspaceMind replaces the layer set rather than adding to it', () => {
    const second = new MindDB(':memory:');
    orchestrator.setWorkspaceMind(workspace);
    orchestrator.setWorkspaceMind(second);

    expect(orchestrator.hasWorkspaceMind()).toBe(true);
    expect(countRows(second, 'memory_frames')).toBe(0);

    second.close();
  });

  /**
   * These two exist because the first mutation check was not enough. Binding
   * the workspace layers to `this.db` inside `setWorkspaceMind()` left all
   * eleven earlier pins green: nothing in them ever wrote THROUGH a workspace
   * layer, because `workspaceLayers` is private and every earlier write goes
   * through the personal stores. `save_memory` is the reachable sensing point —
   * it routes on `target` via `getWorkspaceLayers()` — so these are the pins
   * that actually hold the mind-isolation invariant.
   */
  describe('save_memory routing is the sensing point for the workspace layers', () => {
    function saveMemory(orch: Orchestrator, content: string, target: 'workspace' | 'personal') {
      const tool = orch.getTools().find(t => t.name === 'save_memory');
      if (!tool) throw new Error('save_memory tool not found');
      return tool.execute({ content, target });
    }

    it('a workspace-targeted save lands in the workspace db, never the personal one', async () => {
      orchestrator.setWorkspaceMind(workspace);

      await saveMemory(orchestrator, 'workspace note', 'workspace');

      expect(countRows(workspace, 'memory_frames')).toBe(1);
      expect(countRows(personal, 'memory_frames')).toBe(0);
    });

    it('a personal-targeted save with no workspace signal stays personal', async () => {
      orchestrator.setWorkspaceMind(workspace);

      await saveMemory(orchestrator, 'i prefer tea', 'personal');

      expect(countRows(personal, 'memory_frames')).toBe(1);
      expect(countRows(workspace, 'memory_frames')).toBe(0);
    });
  });

  it('clearWorkspaceMind drops back to personal-only counting', () => {
    seedPersonalFrame(orchestrator, 'personal');
    orchestrator.setWorkspaceMind(workspace);

    orchestrator.clearWorkspaceMind();

    expect(orchestrator.hasWorkspaceMind()).toBe(false);
    expect(orchestrator.getMemoryStats().frameCount).toBe(1);
  });
});
