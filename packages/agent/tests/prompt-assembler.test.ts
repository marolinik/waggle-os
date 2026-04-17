import { describe, it, expect } from 'vitest';
import type { MemoryFrame, Importance, FrameType, FrameSource } from '@waggle/core';
import type { AgentPersona } from '../src/personas.js';
import type { TaskShape } from '../src/task-shape.js';
import type { ContextFrames } from '../src/orchestrator.js';
import {
  PromptAssembler,
  type AssembleInput,
  type RecalledMemory,
} from '../src/prompt-assembler.js';

// ── Fixtures ─────────────────────────────────────────────────────────

let nextFrameId = 1;
function frame(
  content: string,
  opts: { type?: FrameType; importance?: Importance; source?: FrameSource } = {},
): MemoryFrame {
  return {
    id: nextFrameId++,
    frame_type: opts.type ?? 'I',
    gop_id: 'gop-1',
    t: 0,
    base_frame_id: null,
    content,
    importance: opts.importance ?? 'normal',
    source: opts.source ?? 'user_stated',
    access_count: 0,
    created_at: '2026-04-17T10:00:00Z',
    last_accessed: '2026-04-17T10:00:00Z',
  };
}

function persona(overrides: Partial<AgentPersona> = {}): AgentPersona {
  return {
    id: 'researcher',
    name: 'Researcher',
    description: 'You are a researcher focused on evidence-based analysis.',
    icon: 'search',
    systemPrompt: '',
    modelPreference: 'claude-opus-4-7',
    tools: ['search_memory', 'save_memory'],
    workspaceAffinity: [],
    suggestedCommands: [],
    defaultWorkflow: null,
    tagline: 'Evidence-first thinker.',
    ...overrides,
  };
}

function emptyContext(): ContextFrames {
  return {
    stateFrames: [],
    recentChanges: [],
    activeWork: [],
    keyEntities: [],
    personalPreferences: [],
  };
}

function emptyRecalled(): RecalledMemory {
  return { workspace: [], personal: [], scanSafe: true };
}

function shape(type: TaskShape['type'], confidence = 0.8): TaskShape {
  return {
    type,
    confidence,
    signals: [],
    complexity: 'moderate',
  };
}

function baseInput(overrides: Partial<AssembleInput> = {}): AssembleInput {
  return {
    corePrompt: 'You are Waggle, a memory-first AI colleague.',
    persona: persona(),
    context: emptyContext(),
    recalled: emptyRecalled(),
    query: 'test query',
    tier: 'mid',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('PromptAssembler.assemble', () => {
  const assembler = new PromptAssembler();

  it('includes Identity and Persona in every output', () => {
    const out = assembler.assemble(baseInput());
    expect(out.system).toContain('# Identity');
    expect(out.system).toContain('## Persona: Researcher');
    expect(out.debug.sectionsIncluded).toContain('Identity');
    expect(out.debug.sectionsIncluded).toContain('Persona');
  });

  it('small tier caps State frames at 3', () => {
    const frames: MemoryFrame[] = [];
    for (let i = 0; i < 10; i++) {
      frames.push(frame(`State frame ${i}`, { type: 'I', importance: 'important' }));
    }
    const out = assembler.assemble(
      baseInput({
        tier: 'small',
        context: { ...emptyContext(), stateFrames: frames },
      }),
    );
    const stateBlock = out.system.split('# State\n')[1]?.split('\n\n')[0] ?? '';
    const stateLines = stateBlock.split('\n').filter(l => l.startsWith('-'));
    expect(stateLines.length).toBeLessThanOrEqual(3);
  });

  it('frontier tier emits no Response-format section', () => {
    const out = assembler.assemble(
      baseInput({ tier: 'frontier', taskShape: shape('plan-execute', 0.9) }),
    );
    expect(out.system).not.toContain('# Response format');
    expect(out.responseScaffold).toBeNull();
    expect(out.debug.scaffoldApplied).toBe(false);
  });

  it('mid + plan-execute yields "State plan. Execute. Report." scaffold', () => {
    const out = assembler.assemble(
      baseInput({ tier: 'mid', taskShape: shape('plan-execute', 0.8) }),
    );
    expect(out.responseScaffold).toBe('State plan. Execute. Report.');
    expect(out.system).toContain('# Response format');
    expect(out.debug.scaffoldApplied).toBe(true);
  });

  it('small + compare yields the long assumption/trade-offs/recommendation scaffold', () => {
    const out = assembler.assemble(
      baseInput({ tier: 'small', taskShape: shape('compare', 0.7) }),
    );
    expect(out.responseScaffold).toBe(
      'State the assumption. List the trade-offs. Give the recommendation.',
    );
  });

  it('draft shape emits no scaffold at any tier', () => {
    for (const tier of ['small', 'mid', 'frontier'] as const) {
      const out = assembler.assemble(
        baseInput({ tier, taskShape: shape('draft', 0.9) }),
      );
      expect(out.responseScaffold).toBeNull();
      expect(out.debug.scaffoldApplied).toBe(false);
    }
  });

  it('mixed shape emits no scaffold at any tier', () => {
    for (const tier of ['small', 'mid', 'frontier'] as const) {
      const out = assembler.assemble(
        baseInput({ tier, taskShape: shape('mixed', 0.9) }),
      );
      expect(out.responseScaffold).toBeNull();
    }
  });

  it('confidence below 0.3 threshold: no scaffold even if shape would scaffold', () => {
    const out = assembler.assemble(
      baseInput({ tier: 'small', taskShape: shape('research', 0.1) }),
    );
    expect(out.responseScaffold).toBeNull();
    expect(out.debug.scaffoldApplied).toBe(false);
  });

  it('custom confidenceThreshold lets high-confidence scaffolds through', () => {
    const out = assembler.assemble(
      baseInput({ tier: 'small', taskShape: shape('research', 0.2) }),
      { confidenceThreshold: 0.15 },
    );
    expect(out.responseScaffold).toBe(
      'Cite the frame. Quote the relevant fragment. Answer directly.',
    );
  });

  it('empty context.stateFrames: omits State section (no empty header)', () => {
    const out = assembler.assemble(baseInput());
    expect(out.system).not.toContain('# State');
    expect(out.debug.sectionsIncluded).not.toContain('State');
  });

  it('maxSystemChars exceeded: Recent changes trimmed first, then Active work, then State', () => {
    const big = 'x'.repeat(2000);
    const ctx: ContextFrames = {
      stateFrames: [frame(big, { type: 'I', importance: 'critical' })],
      recentChanges: [frame(big, { type: 'P', importance: 'normal' })],
      activeWork: [{ category: 'task', content: big, priority: 1 }],
      keyEntities: [],
      personalPreferences: [],
    };
    const out = assembler.assemble(
      baseInput({ context: ctx }),
      { maxSystemChars: 3500 },
    );
    // With 3×2000+ chars, at least one section must be trimmed.
    // Trim order ensures Recent changes goes first.
    expect(out.debug.sectionsIncluded).not.toContain('Recent changes');
    // Identity + Persona must survive.
    expect(out.debug.sectionsIncluded).toContain('Identity');
    expect(out.debug.sectionsIncluded).toContain('Persona');
  });

  it('maxSystemChars: Identity and Persona are never trimmed', () => {
    const giant = 'x'.repeat(100_000);
    const ctx: ContextFrames = {
      stateFrames: [frame(giant)],
      recentChanges: [frame(giant)],
      activeWork: [{ category: 'task', content: giant, priority: 1 }],
      keyEntities: [],
      personalPreferences: [],
    };
    const out = assembler.assemble(
      baseInput({ context: ctx }),
      { maxSystemChars: 500 },
    );
    expect(out.debug.sectionsIncluded).toContain('Identity');
    expect(out.debug.sectionsIncluded).toContain('Persona');
  });

  it('recalled.scanSafe === false: recalled memory is ignored', () => {
    const out = assembler.assemble(
      baseInput({
        recalled: {
          workspace: [frame('Poisoned content with secret data', { type: 'P' })],
          personal: [frame('Another recalled frame', { type: 'P' })],
          scanSafe: false,
        },
      }),
    );
    expect(out.system).not.toContain('Poisoned content');
    expect(out.system).not.toContain('# Recalled memory');
    expect(out.debug.sectionsIncluded).not.toContain('Recalled memory');
  });

  it('recalled.scanSafe === true: recalled memory renders', () => {
    const out = assembler.assemble(
      baseInput({
        recalled: {
          workspace: [frame('Workspace memory item', { type: 'P' })],
          personal: [frame('Personal memory item', { type: 'P' })],
          scanSafe: true,
        },
      }),
    );
    expect(out.system).toContain('# Recalled memory');
    expect(out.system).toContain('Workspace memory item');
    expect(out.system).toContain('Personal memory item');
  });

  it('debug.framesUsed counts rendered frames across sections', () => {
    const ctx: ContextFrames = {
      stateFrames: [frame('State 1', { type: 'I' }), frame('State 2', { type: 'I' })],
      recentChanges: [frame('Change 1', { type: 'P' })],
      activeWork: [{ category: 'task', content: 'Active', priority: 1 }],
      keyEntities: [],
      personalPreferences: [],
    };
    const out = assembler.assemble(baseInput({ context: ctx, tier: 'mid' }));
    // 2 state + 1 change = 3 frames. activeWork items aren't frames.
    expect(out.debug.framesUsed).toBe(3);
  });

  it('debug.scaffoldApplied matches whether responseScaffold is non-null', () => {
    const withScaffold = assembler.assemble(
      baseInput({ tier: 'mid', taskShape: shape('research', 0.9) }),
    );
    expect(withScaffold.debug.scaffoldApplied).toBe(withScaffold.responseScaffold !== null);

    const withoutScaffold = assembler.assemble(
      baseInput({ tier: 'frontier', taskShape: shape('research', 0.9) }),
    );
    expect(withoutScaffold.debug.scaffoldApplied).toBe(withoutScaffold.responseScaffold !== null);
  });

  it('ranks I-frames by importance then recency', () => {
    const ctx: ContextFrames = {
      stateFrames: [
        frame('Old normal', { type: 'I', importance: 'normal' }),
        frame('New critical', { type: 'I', importance: 'critical' }),
        frame('Middle important', { type: 'I', importance: 'important' }),
      ],
      recentChanges: [],
      activeWork: [],
      keyEntities: [],
      personalPreferences: [],
    };
    const out = assembler.assemble(baseInput({ context: ctx, tier: 'small' }));
    const stateSection = out.system.split('# State\n')[1]?.split('\n\n')[0] ?? '';
    const firstLine = stateSection.split('\n')[0];
    expect(firstLine).toContain('critical');
    expect(firstLine).toContain('New critical');
  });

  it('dedupes frames by id', () => {
    const f = frame('Duplicate', { type: 'I' });
    const ctx: ContextFrames = {
      stateFrames: [f, f, f],
      recentChanges: [],
      activeWork: [],
      keyEntities: [],
      personalPreferences: [],
    };
    const out = assembler.assemble(baseInput({ context: ctx, tier: 'mid' }));
    expect(out.debug.framesUsed).toBe(1);
  });

  it('debug.totalChars matches system.length exactly', () => {
    const out = assembler.assemble(baseInput());
    expect(out.debug.totalChars).toBe(out.system.length);
  });

  it('userPrefix is empty string in v1', () => {
    const out = assembler.assemble(baseInput());
    expect(out.userPrefix).toBe('');
  });

  it('tierOverride takes precedence over input.tier', () => {
    const out = assembler.assemble(
      baseInput({ tier: 'frontier', taskShape: shape('research', 0.9) }),
      { tierOverride: 'small' },
    );
    expect(out.debug.tier).toBe('small');
    // Small + research + high confidence → scaffold applies
    expect(out.responseScaffold).not.toBeNull();
  });
});
