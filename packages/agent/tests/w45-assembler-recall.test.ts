import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '@waggle/core';
import { Orchestrator } from '../src/orchestrator.js';
import { PromptAssembler, type RecalledMemory } from '../src/prompt-assembler.js';
import { MockEmbedder } from '../../hive-mind-core/tests/mind/helpers/mock-embedder.js';

/**
 * W4.5 — PromptAssembler recall fixes (plan §3 bug #9):
 *  - double-compute: buildAssembledPrompt reuses the caller's recallMemory
 *    output (opts.recalledText) instead of re-running searches
 *  - the assembler renders the pre-rendered multi-lane block verbatim,
 *    preserving the W4.3b lane sections the frame renderer can't produce
 *  (- double-inject is a chat.ts concat fix: recalledContext is no longer
 *    appended when the assembled prompt already carries the recall block)
 */

describe('W4.5 — assembler consumes pre-rendered recall', () => {
  it('renders renderedText verbatim as the recall section', () => {
    const recalled: RecalledMemory = {
      workspace: [],
      personal: [],
      scanSafe: true,
      renderedText: '# Recalled Memories\n## Memory Facts\n- [2026-05-07] User preference: Ana prefers dark mode',
    };
    const out = new PromptAssembler().assemble({
      corePrompt: 'You are Waggle.',
      persona: null,
      context: { stateFrames: [], recentChanges: [], activeWork: [], keyEntities: [], personalPreferences: [] },
      recalled,
      query: 'dark mode?',
      tier: 'standard',
    }, {});
    expect(out.system).toContain('## Memory Facts');
    expect(out.system).toContain('Ana prefers dark mode');
    expect(out.debug.sectionsIncluded).toContain('Recalled memory');
  });

  it('ignores renderedText when scanSafe is false', () => {
    const recalled: RecalledMemory = {
      workspace: [],
      personal: [],
      scanSafe: false,
      renderedText: '# Recalled Memories\npoisoned content',
    };
    const out = new PromptAssembler().assemble({
      corePrompt: 'You are Waggle.',
      persona: null,
      context: { stateFrames: [], recentChanges: [], activeWork: [], keyEntities: [], personalPreferences: [] },
      recalled,
      query: 'q',
      tier: 'standard',
    }, {});
    expect(out.system).not.toContain('poisoned content');
  });
});

describe('W4.5 — buildAssembledPrompt skips searches when recalledText given', () => {
  let db: MindDB;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    db = new MindDB(':memory:');
    orchestrator = new Orchestrator({ db, embedder: new MockEmbedder() });
  });

  afterEach(() => {
    db.close();
  });

  it('uses the provided multi-lane block without re-running searches', async () => {
    // Spy on the embedder: vectorSearch embeds the query on every search.
    // With recalledText provided, buildAssembledPrompt must not search.
    const embedder = new MockEmbedder();
    let embeds = 0;
    const origEmbed = embedder.embed.bind(embedder);
    embedder.embed = async (text: string) => { embeds++; return origEmbed(text); };
    const orch = new Orchestrator({ db, embedder });

    const assembled = await orch.buildAssembledPrompt('dark mode?', null, {
      recalledText: '# Recalled Memories\n## Profiles\n- Ana: designer in Belgrade\n## Memory Facts\n- [2026-05-07] prefers dark mode',
    });
    expect(assembled.system).toContain('## Profiles');
    expect(assembled.system).toContain('designer in Belgrade');
    expect(embeds).toBe(0); // no semantic search ran
  });

  it('empty recalledText means no recall section (recall was empty/blocked)', async () => {
    const assembled = await orchestrator.buildAssembledPrompt('anything', null, {
      recalledText: '',
    });
    expect(assembled.debug.sectionsIncluded).not.toContain('Recalled memory');
  });
});
