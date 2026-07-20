import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '@waggle/core';
import { Orchestrator } from '../src/orchestrator.js';
import { FEATURE_FLAGS, isEnabled } from '../src/feature-flags.js';
import { MockEmbedder } from '../../hive-mind-core/tests/mind/helpers/mock-embedder.js';

/**
 * Brief §12.4 — feature-flag snapshot tests. Proves:
 *  - PROMPT_ASSEMBLER flag exists and follows env-var convention.
 *  - W4 flip (2026-06-11): flag is DEFAULT ON; WAGGLE_PROMPT_ASSEMBLER=0 is
 *    the kill switch (vitest.setup.ts pins tests to 0 — legacy-path suites
 *    stay deterministic; assembler suites opt in explicitly).
 *  - Flag-off buildSystemPrompt path is stable — regression guard.
 *  - Flag-on path (buildAssembledPrompt) returns well-formed AssembledPrompt.
 */
describe('PROMPT_ASSEMBLER feature flag', () => {
  it('flag key exists on FEATURE_FLAGS', () => {
    expect('PROMPT_ASSEMBLER' in FEATURE_FLAGS).toBe(true);
  });

  it('flag is default-ON with kill switch WAGGLE_PROMPT_ASSEMBLER=0', () => {
    const envValue = process.env['WAGGLE_PROMPT_ASSEMBLER'];
    const expectedFlag = envValue !== '0';
    expect(FEATURE_FLAGS.PROMPT_ASSEMBLER).toBe(expectedFlag);
    expect(isEnabled('PROMPT_ASSEMBLER')).toBe(expectedFlag);
  });

  it('test environment pins the flag OFF (vitest.setup.ts invariant)', () => {
    // vitest.setup.ts sets WAGGLE_PROMPT_ASSEMBLER=0 unless already set —
    // the broad suites exercise the legacy path; eval harness conditions
    // C/D/F override with =1 explicitly.
    if (process.env['WAGGLE_PROMPT_ASSEMBLER'] === '0') {
      expect(FEATURE_FLAGS.PROMPT_ASSEMBLER).toBe(false);
    }
  });
});

describe('Orchestrator prompt paths — flag-off regression protection', () => {
  let db: MindDB;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    db = new MindDB(':memory:');
    orchestrator = new Orchestrator({
      db,
      embedder: new MockEmbedder(),
      model: 'claude-opus-4-7',
    });
  });

  afterEach(() => {
    db.close();
  });

  it('buildSystemPrompt() is stable across successive calls on a fresh mind', () => {
    const a = orchestrator.buildSystemPrompt();
    const b = orchestrator.buildSystemPrompt();
    expect(a).toBe(b);
  });

  it('buildSystemPrompt() does not mention PromptAssembler sections by default', () => {
    const out = orchestrator.buildSystemPrompt();
    expect(out).not.toContain('# Response format');
    expect(out).not.toContain('# Recent changes');
  });

  it('buildAssembledPrompt() returns well-formed output on a fresh mind', async () => {
    const assembled = await orchestrator.buildAssembledPrompt('test query', null);
    expect(typeof assembled.system).toBe('string');
    expect(assembled.system.length).toBeGreaterThan(0);
    expect(assembled.userPrefix).toBe('');
    expect(assembled.debug.tier).toBe('frontier'); // opus-4-7 → frontier
    expect(assembled.debug.totalChars).toBe(assembled.system.length);
    expect(Array.isArray(assembled.debug.sectionsIncluded)).toBe(true);
  });

  it('buildAssembledPrompt() maps tier correctly for small models', async () => {
    const smallDb = new MindDB(':memory:');
    const smallOrch = new Orchestrator({
      db: smallDb,
      embedder: new MockEmbedder(),
      model: 'gemma-4-31b',
    });
    const assembled = await smallOrch.buildAssembledPrompt('plan me a migration from A to B', null);
    expect(assembled.debug.tier).toBe('small');
    smallDb.close();
  });

  it('buildAssembledPrompt() excludes all outside context from closed-world rewrites', async () => {
    orchestrator.setGoalAncestry({ project: 'Outside project context' });
    orchestrator.getAwareness().add('task', 'Ship immediately from prior context', 10);
    await orchestrator.executeTool('save_memory', {
      content: 'Outside memory says the release is safe.',
      importance: 'important',
    });

    const ordinary = await orchestrator.buildAssembledPrompt('What is the current project context?', null);
    const closedWorld = await orchestrator.buildAssembledPrompt(
      'Rewrite this memo and add no new claims: API tests pass.',
      null,
    );

    expect(ordinary.system).toContain('Outside project context');
    expect(closedWorld.debug.closedWorldRewrite).toBe(true);
    expect(closedWorld.system).toContain('# Closed-world rewrite');
    expect(closedWorld.system).not.toContain('Outside project context');
    expect(closedWorld.system).not.toContain('Ship immediately from prior context');
    expect(closedWorld.system).not.toContain('Outside memory says the release is safe.');
    expect(closedWorld.debug.sectionsIncluded).toEqual(['Closed-world rewrite']);
  });

  it('buildSystemPrompt() and buildAssembledPrompt() produce different shapes (flag-off vs PA path)', async () => {
    const legacy = orchestrator.buildSystemPrompt();
    const assembled = await orchestrator.buildAssembledPrompt('compare MECE vs BPMN', null);
    // Both contain identity scaffolding, but the PA output has structured section headers
    // the legacy path lacks (e.g., "## Persona:" when persona=null, "# State" via frame selection).
    // The raw strings won't be equal.
    expect(assembled.system).not.toBe(legacy);
  });
});
