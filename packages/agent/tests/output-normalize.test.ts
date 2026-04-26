/**
 * Tests for output-normalize layer (Phase 1.1 of agent-fix sprint).
 *
 * Coverage:
 *   - Each rule: positive (matches → strips) + negative (doesn't match → no-op)
 *   - Audit: actions array reflects every transformation in order
 *   - PRESETS: production / benchmark-strict / benchmark-lenient distinct
 *   - Hard constraint: abstention signal preserved as "unknown", never empty
 *   - Idempotence: normalize(normalize(x)) === normalize(x)
 *   - Round-trip property: 100 random adversarial inputs preserve abstention
 */

import { describe, it, expect } from 'vitest';
import {
  normalize,
  normalizeWithPreset,
  PRESETS,
  type NormalizationConfig,
} from '../src/output-normalize.js';

const NULL_CONFIG: NormalizationConfig = {
  stripThinkTags: false,
  stripAnswerLabels: false,
  stripWholeResponseMarkdownFence: false,
  stripCopiedMetadata: false,
  unknownAliases: [],
  collapseBlankLines: false,
  trimWhitespace: false,
};

describe('normalize — empty / passthrough', () => {
  it('empty string passes through with no actions', () => {
    const r = normalize('', NULL_CONFIG);
    expect(r.raw).toBe('');
    expect(r.normalized).toBe('');
    expect(r.actions).toEqual([]);
  });

  it('null config = no-op even on rich input', () => {
    const text = '<think>x</think>Answer: y\n[memory:z]';
    const r = normalize(text, NULL_CONFIG);
    expect(r.normalized).toBe(text);
    expect(r.actions).toEqual([]);
  });
});

describe('strip-think-tags', () => {
  const cfg: NormalizationConfig = { ...NULL_CONFIG, stripThinkTags: true };

  it('strips a single <think> block', () => {
    const r = normalize('Hello <think>reasoning</think> world', cfg);
    expect(r.normalized).toBe('Hello  world');
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0].rule).toBe('strip-think-tags');
  });

  it('strips multiple <think> blocks', () => {
    const r = normalize('a<think>b</think>c<think>d</think>e', cfg);
    expect(r.normalized).toBe('ace');
  });

  it('handles multiline reasoning content', () => {
    const r = normalize('before<think>\nline 1\nline 2\n</think>after', cfg);
    expect(r.normalized).toBe('beforeafter');
  });

  it('case-insensitive (handles <THINK>)', () => {
    const r = normalize('a<THINK>x</THINK>b', cfg);
    expect(r.normalized).toBe('ab');
  });

  it('no-op when no think tags present', () => {
    const r = normalize('plain output', cfg);
    expect(r.normalized).toBe('plain output');
    expect(r.actions).toEqual([]);
  });
});

describe('strip-answer-labels', () => {
  const cfg: NormalizationConfig = { ...NULL_CONFIG, stripAnswerLabels: true };

  it('strips "Answer:" prefix', () => {
    const r = normalize('Answer: 42', cfg);
    expect(r.normalized).toBe('42');
  });

  it('strips "Final answer:" prefix', () => {
    const r = normalize('Final answer: 42', cfg);
    expect(r.normalized).toBe('42');
  });

  it('strips "Final answer is:" prefix', () => {
    const r = normalize('Final answer is: 42', cfg);
    expect(r.normalized).toBe('42');
  });

  it('case-insensitive', () => {
    const r = normalize('ANSWER: 42', cfg);
    expect(r.normalized).toBe('42');
  });

  it('only strips at start, not mid-text', () => {
    const r = normalize('The answer: 42 is the answer.', cfg);
    expect(r.normalized).toBe('The answer: 42 is the answer.');
  });
});

describe('strip-whole-response-markdown-fence', () => {
  const cfg: NormalizationConfig = { ...NULL_CONFIG, stripWholeResponseMarkdownFence: true };

  it('strips when entire response is fenced', () => {
    const r = normalize('```\n42\n```', cfg);
    expect(r.normalized).toBe('42');
  });

  it('strips with language hint', () => {
    const r = normalize('```json\n{"a": 1}\n```', cfg);
    expect(r.normalized).toBe('{"a": 1}');
  });

  it('does NOT strip mid-response fences (preserves legitimate code blocks)', () => {
    const text = 'See:\n```\ncode\n```\nthat is the answer.';
    const r = normalize(text, cfg);
    expect(r.normalized).toBe(text);
  });
});

describe('strip-copied-metadata', () => {
  const cfg: NormalizationConfig = { ...NULL_CONFIG, stripCopiedMetadata: true };

  it('strips [memory:synth] markers', () => {
    const r = normalize('answer\n[memory:synth]\nmore', cfg);
    expect(r.normalized).toBe('answer\nmore');
  });

  it('strips # Recalled Memories headers', () => {
    const r = normalize('# Recalled Memories\nthe answer', cfg);
    expect(r.normalized).toBe('the answer');
  });

  it('strips [retrieved N/M] markers', () => {
    const r = normalize('text\n[retrieved 3/8]\ntext', cfg);
    expect(r.normalized).toBe('text\ntext');
  });

  it('strips <retrieval_context> tags as standalone lines', () => {
    const r = normalize('text\n<retrieval_context>\ntext', cfg);
    expect(r.normalized).toBe('text\ntext');
  });

  it('reports stripped line count in action rule', () => {
    const r = normalize('a\n[memory:1]\n[memory:2]\nb', cfg);
    expect(r.actions[0].rule).toContain('2 lines');
  });
});

describe('unknown-alias canonicalization (HARD CONSTRAINT)', () => {
  const cfg: NormalizationConfig = {
    ...NULL_CONFIG,
    unknownAliases: ['unknown', 'unknown.', 'n/a', 'i don\'t know'],
  };

  it('canonicalizes "Unknown" → "unknown" (preserved, not empty)', () => {
    const r = normalize('Unknown', cfg);
    expect(r.normalized).toBe('unknown');
    expect(r.normalized.length).toBeGreaterThan(0); // never empty
  });

  it('canonicalizes "Unknown." → "unknown"', () => {
    const r = normalize('Unknown.', cfg);
    expect(r.normalized).toBe('unknown');
  });

  it('canonicalizes "N/A" → "unknown"', () => {
    const r = normalize('N/A', cfg);
    expect(r.normalized).toBe('unknown');
  });

  it('canonicalizes "I don\'t know" → "unknown"', () => {
    const r = normalize("I don't know", cfg);
    expect(r.normalized).toBe('unknown');
  });

  it('does NOT match when input is part of a larger answer', () => {
    const r = normalize('The answer is unknown to most people', cfg);
    expect(r.normalized).toBe('The answer is unknown to most people');
  });

  it('preserves substantive answers untouched', () => {
    const r = normalize('42', cfg);
    expect(r.normalized).toBe('42');
    expect(r.actions).toEqual([]);
  });

  it('records the matched alias in the action rule', () => {
    const r = normalize('N/A', cfg);
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0].rule).toContain('matched "n/a"');
  });
});

describe('audit trail', () => {
  const cfg: NormalizationConfig = {
    ...NULL_CONFIG,
    stripThinkTags: true,
    stripAnswerLabels: true,
    stripCopiedMetadata: true,
    trimWhitespace: true,
  };

  it('records actions in execution order', () => {
    const r = normalize('  <think>x</think>Answer: 42\n[memory:y]  ', cfg);
    expect(r.normalized).toBe('42');
    const rules = r.actions.map(a => a.rule);
    // First action must be think-tag strip (largest substring removal first).
    expect(rules[0]).toBe('strip-think-tags');
    // Copied-metadata (line-level) must run BEFORE answer-labels (prefix on remaining text).
    const metaIdx = rules.findIndex(r => r.startsWith('strip-copied-metadata'));
    const labelIdx = rules.indexOf('strip-answer-labels');
    expect(metaIdx).toBeGreaterThanOrEqual(0);
    expect(labelIdx).toBeGreaterThanOrEqual(0);
    expect(metaIdx).toBeLessThan(labelIdx);
    // trim-whitespace MAY or may not fire depending on whether upstream
    // rules already consumed all whitespace — both cases are correct.
  });

  it('every action has before / after', () => {
    const r = normalize('<think>x</think>hello', cfg);
    for (const action of r.actions) {
      expect(action.before).toBeDefined();
      expect(action.after).toBeDefined();
      expect(action.before).not.toBe(action.after);
    }
  });

  it('raw is always the original input', () => {
    const input = '<think>noise</think>signal';
    const r = normalize(input, cfg);
    expect(r.raw).toBe(input);
  });
});

describe('PRESETS', () => {
  it('production preset exists with light-touch settings', () => {
    expect(PRESETS.production).toBeDefined();
    expect(PRESETS.production.stripThinkTags).toBe(true);
    expect(PRESETS.production.stripAnswerLabels).toBe(false);
    expect(PRESETS.production.stripWholeResponseMarkdownFence).toBe(false);
  });

  it('benchmark-strict preset exists with full strip', () => {
    expect(PRESETS['benchmark-strict']).toBeDefined();
    expect(PRESETS['benchmark-strict'].stripAnswerLabels).toBe(true);
    expect(PRESETS['benchmark-strict'].stripWholeResponseMarkdownFence).toBe(true);
    expect(PRESETS['benchmark-strict'].collapseBlankLines).toBe(true);
  });

  it('benchmark-lenient preset exists between production and strict', () => {
    expect(PRESETS['benchmark-lenient']).toBeDefined();
    expect(PRESETS['benchmark-lenient'].stripAnswerLabels).toBe(true);
    expect(PRESETS['benchmark-lenient'].stripWholeResponseMarkdownFence).toBe(false);
  });

  it('all presets have unknownAliases', () => {
    for (const name of Object.keys(PRESETS)) {
      expect(PRESETS[name].unknownAliases.length).toBeGreaterThan(0);
    }
  });

  it('production preset preserves user-facing markdown structure', () => {
    const md = '# Title\n\n## Section\n\n- bullet\n- bullet\n';
    const r = normalizeWithPreset(md, 'production');
    expect(r.normalized.trim()).toBe(md.trim());
  });
});

describe('normalizeWithPreset', () => {
  it('throws on unknown preset', () => {
    expect(() => normalizeWithPreset('x', 'nonexistent')).toThrow(/unknown preset/);
  });

  it('returns same shape as direct normalize', () => {
    const r = normalizeWithPreset('hello', 'production');
    expect(r.raw).toBe('hello');
    expect(r.normalized).toBe('hello');
    expect(Array.isArray(r.actions)).toBe(true);
  });
});

describe('idempotence (normalize(normalize(x)) === normalize(x))', () => {
  for (const presetName of ['production', 'benchmark-strict', 'benchmark-lenient']) {
    it(`is idempotent under "${presetName}" preset`, () => {
      const samples = [
        '<think>r</think>Answer: 42',
        '  N/A.  ',
        '```\nx\n```',
        '# Recalled Memories\n[retrieved 1/8]\nThe answer is 42.',
        'plain text',
        '',
      ];
      for (const s of samples) {
        const once = normalizeWithPreset(s, presetName).normalized;
        const twice = normalizeWithPreset(once, presetName).normalized;
        expect(twice).toBe(once);
      }
    });
  }
});

describe('hard constraint — abstention preservation property', () => {
  // 100 random adversarial inputs that contain an abstention pattern
  // must always produce non-empty normalized output (preserving the signal).
  it('100 abstention-containing inputs all preserve "unknown" as non-empty', () => {
    const aliases = ['unknown', 'Unknown', 'UNKNOWN', 'unknown.', 'n/a', 'N/A', 'NA'];
    for (let i = 0; i < 100; i++) {
      const padding = Math.random() < 0.5 ? '   ' : '';
      const trailingPunct = Math.random() < 0.3 ? '.' : '';
      const alias = aliases[i % aliases.length];
      const input = `${padding}${alias}${trailingPunct}${padding}`;
      const r = normalizeWithPreset(input, 'benchmark-strict');
      expect(r.normalized.length).toBeGreaterThan(0);
      expect(r.normalized).toBe('unknown');
    }
  });
});

describe('execution order — fixed and deliberate', () => {
  it('think-tags stripped before label / metadata stripping', () => {
    // <think>Answer: foo</think>real -> we strip the think first, then there's no
    // label to strip on real text, so output is "real".
    const cfg = { ...NULL_CONFIG, stripThinkTags: true, stripAnswerLabels: true };
    const r = normalize('<think>Answer: distractor</think>real', cfg);
    expect(r.normalized).toBe('real');
  });

  it('unknown-alias runs LAST after cleanup', () => {
    // <think>x</think>  Unknown.  -> strip think, trim ws, then alias-canonicalize
    const cfg = {
      ...NULL_CONFIG,
      stripThinkTags: true,
      trimWhitespace: true,
      unknownAliases: ['unknown', 'unknown.'],
    };
    const r = normalize('<think>x</think>  Unknown.  ', cfg);
    expect(r.normalized).toBe('unknown');
    // Verify alias action is the last one
    const lastAction = r.actions[r.actions.length - 1];
    expect(lastAction.rule).toContain('unknown-alias');
  });
});
