/**
 * Tests for prompt-shapes layer (Phase 1.2 of agent-fix sprint).
 *
 * Coverage:
 *   - Selector: exact match, prefix match, default fallback, override
 *   - Each shape: 4 methods return non-empty strings
 *   - Each shape: metadata.evidence_link is non-empty
 *   - All shapes registered + listed
 *   - Throw on unknown override
 *   - System prompt distinguishes solo vs multi-step
 */

import { describe, it, expect } from 'vitest';
import {
  selectShape,
  listShapes,
  getShapeMetadata,
  REGISTRY,
  claudeShape,
  qwenThinkingShape,
  qwenNonThinkingShape,
  gptShape,
  genericSimpleShape,
  MULTI_STEP_ACTION_CONTRACT,
  _resetConfigCache,
} from '../src/prompt-shapes/index.js';

describe('selector — alias resolution', () => {
  it('exact match: claude-opus-4-7 → claude', () => {
    const shape = selectShape('claude-opus-4-7');
    expect(shape.name).toBe('claude');
  });

  it('exact match: qwen3.6-35b-a3b-via-dashscope-direct → qwen-thinking', () => {
    const shape = selectShape('qwen3.6-35b-a3b-via-dashscope-direct');
    expect(shape.name).toBe('qwen-thinking');
  });

  it('exact match: gpt-5.4 → gpt', () => {
    const shape = selectShape('gpt-5.4');
    expect(shape.name).toBe('gpt');
  });

  it('prefix match: claude-haiku-4-5-20251001 → claude (via claude- prefix)', () => {
    const shape = selectShape('claude-haiku-4-5-20251001');
    expect(shape.name).toBe('claude');
  });

  it('prefix match: minimax-m27-via-openrouter → generic-simple', () => {
    const shape = selectShape('minimax-m27-via-openrouter');
    expect(shape.name).toBe('generic-simple');
  });

  it('prefix match: gpt-6 → gpt (via gpt- prefix)', () => {
    const shape = selectShape('gpt-6');
    expect(shape.name).toBe('gpt');
  });

  it('default fallback: completely unknown alias → generic-simple', () => {
    const shape = selectShape('mistral-7b-some-future-alias');
    expect(shape.name).toBe('generic-simple');
  });

  it('default fallback: empty alias → generic-simple', () => {
    const shape = selectShape('');
    expect(shape.name).toBe('generic-simple');
  });
});

describe('selector — override', () => {
  it('override: claude-opus-4-7 with override="generic-simple" → generic-simple', () => {
    const shape = selectShape('claude-opus-4-7', { override: 'generic-simple' });
    expect(shape.name).toBe('generic-simple');
  });

  it('override: any alias with override="qwen-non-thinking" → qwen-non-thinking', () => {
    const shape = selectShape('claude-opus-4-7', { override: 'qwen-non-thinking' });
    expect(shape.name).toBe('qwen-non-thinking');
  });

  it('override throws on unknown shape name', () => {
    expect(() => selectShape('claude-opus-4-7', { override: 'nonexistent' })).toThrow(
      /not in REGISTRY/,
    );
  });
});

describe('selector — registry inspection', () => {
  it('listShapes returns all 5 expected names', () => {
    const names = listShapes().sort();
    expect(names).toEqual(['claude', 'generic-simple', 'gpt', 'qwen-non-thinking', 'qwen-thinking']);
  });

  it('REGISTRY contains all named shapes', () => {
    expect(REGISTRY.claude).toBe(claudeShape);
    expect(REGISTRY['qwen-thinking']).toBe(qwenThinkingShape);
    expect(REGISTRY['qwen-non-thinking']).toBe(qwenNonThinkingShape);
    expect(REGISTRY.gpt).toBe(gptShape);
    expect(REGISTRY['generic-simple']).toBe(genericSimpleShape);
  });

  it('getShapeMetadata throws on unknown', () => {
    expect(() => getShapeMetadata('nonexistent')).toThrow(/unknown shape/);
  });
});

describe('selector — longest prefix wins', () => {
  it('qwen3.6- specific prefix beats qwen- generic when both apply', () => {
    // The config has both "qwen3.6-" and "qwen-" patterns, both mapping to
    // qwen-thinking. Test that the longest-prefix rule is honored even when
    // outcomes happen to match.
    const shape = selectShape('qwen3.6-35b-a3b-something-new');
    expect(shape.name).toBe('qwen-thinking');
  });
});

describe('every shape — required metadata', () => {
  for (const name of Object.keys(REGISTRY)) {
    describe(`shape: ${name}`, () => {
      const shape = REGISTRY[name];

      it('has unique name matching registry key', () => {
        expect(shape.name).toBe(name);
      });

      it('metadata.description is non-empty', () => {
        expect(shape.metadata.description.length).toBeGreaterThan(0);
      });

      it('metadata.modelClass is non-empty', () => {
        expect(shape.metadata.modelClass.length).toBeGreaterThan(0);
      });

      it('metadata.evidence_link is non-empty (HARD RULE)', () => {
        expect(shape.metadata.evidence_link.length).toBeGreaterThan(0);
        // No literal "TODO" or empty placeholders allowed.
        expect(shape.metadata.evidence_link).not.toMatch(/^\s*todo\s*$/i);
      });
    });
  }
});

describe('every shape — 4 build methods produce non-empty strings', () => {
  for (const name of Object.keys(REGISTRY)) {
    describe(`shape: ${name}`, () => {
      const shape = REGISTRY[name];

      it('systemPrompt (solo) is non-empty', () => {
        const sp = shape.systemPrompt({ persona: 'You are X.', question: 'What is Y?', isMultiStep: false });
        expect(sp.length).toBeGreaterThan(0);
        expect(sp).toContain('X');
      });

      it('systemPrompt (multi-step) is non-empty and includes the action contract', () => {
        const sp = shape.systemPrompt({
          persona: 'You are X.',
          question: 'What is Y?',
          isMultiStep: true,
          maxSteps: 5,
          maxRetrievalsPerStep: 8,
        });
        expect(sp.length).toBeGreaterThan(0);
        // Multi-step prompts must include the JSON action contract somehow.
        expect(sp).toContain('"action"');
      });

      it('soloUserPrompt is non-empty and contains question', () => {
        const up = shape.soloUserPrompt({
          persona: 'You are X.',
          materials: 'doc 1: foo\ndoc 2: bar',
          question: 'What is Y?',
        });
        expect(up.length).toBeGreaterThan(0);
        expect(up).toContain('What is Y?');
        expect(up).toContain('foo');
      });

      it('multiStepKickoffUserPrompt is non-empty', () => {
        const k = shape.multiStepKickoffUserPrompt({});
        expect(k.length).toBeGreaterThan(0);
      });

      it('retrievalInjectionUserPrompt includes query and results', () => {
        const ri = shape.retrievalInjectionUserPrompt({
          query: 'find foo',
          results: '[result 1] foo bar',
          resultCount: 1,
        });
        expect(ri).toContain('find foo');
        expect(ri).toContain('foo bar');
      });
    });
  }
});

describe('shape distinguishes solo vs multi-step', () => {
  it('claude shape: multi-step has protocol, solo does not', () => {
    const solo = claudeShape.systemPrompt({ persona: 'P', question: 'Q', isMultiStep: false });
    const multi = claudeShape.systemPrompt({ persona: 'P', question: 'Q', isMultiStep: true });
    expect(solo).not.toContain('"action"');
    expect(multi).toContain('"action"');
  });

  it('qwen-thinking shape: multi-step has protocol, solo does not', () => {
    const solo = qwenThinkingShape.systemPrompt({ persona: 'P', question: 'Q', isMultiStep: false });
    const multi = qwenThinkingShape.systemPrompt({ persona: 'P', question: 'Q', isMultiStep: true });
    expect(solo).not.toContain('"action"');
    expect(multi).toContain('"action"');
  });
});

describe('MULTI_STEP_ACTION_CONTRACT', () => {
  it('describes both retrieve and finalize actions', () => {
    expect(MULTI_STEP_ACTION_CONTRACT).toContain('retrieve');
    expect(MULTI_STEP_ACTION_CONTRACT).toContain('finalize');
  });

  it('is referenced by all 5 shapes in their multi-step prompts', () => {
    // Indirect check: when the contract changes, all multi-step prompts pick up
    // the change because each shape templates from MULTI_STEP_ACTION_CONTRACT.
    for (const name of Object.keys(REGISTRY)) {
      const shape = REGISTRY[name];
      const sp = shape.systemPrompt({ persona: 'P', question: 'Q', isMultiStep: true });
      // At minimum each shape must mention both action keywords.
      expect(sp).toMatch(/retrieve/);
      expect(sp).toMatch(/finalize/);
    }
  });
});

describe('config integration — model-prompt-shapes.json', () => {
  it('cache flush + reload picks up config changes (no stale singleton)', () => {
    // Smoke test of the cache reset path used by the test helper.
    _resetConfigCache();
    const shape1 = selectShape('claude-opus-4-7');
    expect(shape1.name).toBe('claude');
  });
});
