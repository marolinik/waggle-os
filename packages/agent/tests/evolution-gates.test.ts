import { describe, it, expect } from 'vitest';
import {
  runGates, DEFAULT_SIZE_LIMITS,
  checkNonEmpty, checkSize, checkGrowth,
  checkBalancedFences, checkNoPlaceholders, checkNoObviousTodos, checkRegression,
} from '../src/evolution-gates.js';

describe('checkNonEmpty', () => {
  it('fails on empty string', () => {
    expect(checkNonEmpty('').verdict).toBe('fail');
  });
  it('fails on whitespace-only string', () => {
    expect(checkNonEmpty('   \n\n  ').verdict).toBe('fail');
  });
  it('passes on real content', () => {
    expect(checkNonEmpty('hello').verdict).toBe('pass');
  });
});

describe('checkSize', () => {
  it('passes within the persona cap', () => {
    const result = checkSize('x'.repeat(2000), 'persona-system-prompt', DEFAULT_SIZE_LIMITS);
    expect(result.verdict).toBe('pass');
    expect(result.detail?.current).toBe(2000);
    expect(result.detail?.max).toBe(DEFAULT_SIZE_LIMITS.personaSystemPrompt);
  });

  it('fails over the persona cap', () => {
    const result = checkSize('x'.repeat(4000), 'persona-system-prompt', DEFAULT_SIZE_LIMITS);
    expect(result.verdict).toBe('fail');
    expect(result.reason).toContain('persona-system-prompt');
  });

  it('uses tool-description cap (500)', () => {
    expect(checkSize('x'.repeat(500), 'tool-description', DEFAULT_SIZE_LIMITS).verdict).toBe('pass');
    expect(checkSize('x'.repeat(501), 'tool-description', DEFAULT_SIZE_LIMITS).verdict).toBe('fail');
  });

  it('uses skill-body cap (15k)', () => {
    expect(checkSize('x'.repeat(15_000), 'skill-body', DEFAULT_SIZE_LIMITS).verdict).toBe('pass');
    expect(checkSize('x'.repeat(15_001), 'skill-body', DEFAULT_SIZE_LIMITS).verdict).toBe('fail');
  });

  it('uses generic cap for unknown target', () => {
    const result = checkSize('x'.repeat(5000), 'generic', DEFAULT_SIZE_LIMITS);
    expect(result.verdict).toBe('pass');
  });

  it('accepts custom size limits', () => {
    const limits = { ...DEFAULT_SIZE_LIMITS, generic: 100 };
    const result = checkSize('x'.repeat(200), 'generic', limits);
    expect(result.verdict).toBe('fail');
  });
});

describe('checkGrowth', () => {
  it('passes when candidate is smaller than baseline', () => {
    const result = checkGrowth('abc', 'abcdefgh', 0.2);
    expect(result.verdict).toBe('pass');
  });

  it('passes when growth is within budget', () => {
    const result = checkGrowth('x'.repeat(110), 'x'.repeat(100), 0.2); // +10%
    expect(result.verdict).toBe('pass');
  });

  it('fails when growth exceeds budget', () => {
    const result = checkGrowth('x'.repeat(140), 'x'.repeat(100), 0.2); // +40%
    expect(result.verdict).toBe('fail');
    expect(result.detail?.ratio).toBeCloseTo(0.4, 5);
  });

  it('passes when baseline is empty (cannot compute ratio)', () => {
    const result = checkGrowth('anything', '', 0.2);
    expect(result.verdict).toBe('pass');
  });

  it('boundary: exactly 20% growth passes with default budget', () => {
    // 100 → 120 is exactly 20%, not greater
    const result = checkGrowth('x'.repeat(120), 'x'.repeat(100), 0.2);
    expect(result.verdict).toBe('pass');
  });
});

describe('checkBalancedFences', () => {
  it('passes no fences', () => {
    expect(checkBalancedFences('plain prose').verdict).toBe('pass');
  });
  it('passes two fences (one code block)', () => {
    const text = 'here:\n```js\nconst x = 1;\n```\ndone';
    expect(checkBalancedFences(text).verdict).toBe('pass');
  });
  it('fails one fence (unbalanced)', () => {
    const text = 'here:\n```js\nconst x = 1;\nstill going';
    const result = checkBalancedFences(text);
    expect(result.verdict).toBe('fail');
    expect(result.detail?.fences).toBe(1);
  });
  it('passes four fences (two blocks)', () => {
    const text = '```a\nfoo\n```\n```b\nbar\n```';
    expect(checkBalancedFences(text).verdict).toBe('pass');
  });
});

describe('checkNoPlaceholders', () => {
  it('passes clean text', () => {
    expect(checkNoPlaceholders('A prompt with normal prose.').verdict).toBe('pass');
  });
  it('fails [TODO] bracket placeholder', () => {
    expect(checkNoPlaceholders('Write about [TODO] here.').verdict).toBe('fail');
  });
  it('fails [PLACEHOLDER]', () => {
    expect(checkNoPlaceholders('Fill in [PLACEHOLDER].').verdict).toBe('fail');
  });
  it('fails [YOUR NAME] style', () => {
    expect(checkNoPlaceholders('Hi [YOUR NAME HERE]!').verdict).toBe('fail');
  });
  it('fails angle-brackets <placeholder>', () => {
    expect(checkNoPlaceholders('Set <placeholder> before sending.').verdict).toBe('fail');
  });
  it('fails handlebars {{var}}', () => {
    expect(checkNoPlaceholders('Hello {{name}}.').verdict).toBe('fail');
  });
  it('does not false-positive normal bracketed citations', () => {
    expect(checkNoPlaceholders('See [1] and [Smith 2024] for details.').verdict).toBe('pass');
  });
});

describe('checkNoObviousTodos', () => {
  it('passes clean text', () => {
    expect(checkNoObviousTodos('Write clear documentation.').verdict).toBe('pass');
  });
  it('fails lines starting with TODO:', () => {
    expect(checkNoObviousTodos('Intro paragraph.\nTODO: finish this').verdict).toBe('fail');
  });
  it('fails lines starting with FIXME:', () => {
    expect(checkNoObviousTodos('FIXME: tighten this up').verdict).toBe('fail');
  });
  it('does not fail mid-sentence "todo" mention', () => {
    expect(checkNoObviousTodos('Build a todo list UI.').verdict).toBe('pass');
  });
});

describe('checkRegression', () => {
  it('passes when delta is within tolerance', () => {
    const result = checkRegression(0.8, 0.79, -0.02); // -1pp, floor -2pp
    expect(result.verdict).toBe('pass');
  });

  it('passes on improvement', () => {
    const result = checkRegression(0.7, 0.85, -0.02);
    expect(result.verdict).toBe('pass');
    expect(result.detail?.delta).toBeCloseTo(0.15, 5);
  });

  it('fails when delta exceeds tolerance', () => {
    const result = checkRegression(0.9, 0.7, -0.02); // -20pp
    expect(result.verdict).toBe('fail');
  });

  it('boundary: equal to tolerance passes', () => {
    const result = checkRegression(0.8, 0.78, -0.02); // exactly -2pp
    expect(result.verdict).toBe('pass');
  });
});

// ── runGates end-to-end ────────────────────────────────────────

describe('runGates', () => {
  it('passes a clean candidate', () => {
    const res = runGates({
      candidate: 'A concise persona prompt for the researcher.',
      baseline: 'A concise persona prompt for the researcher.',
    }, { targetKind: 'persona-system-prompt' });
    expect(res.verdict).toBe('pass');
    expect(res.firstFailure).toBeNull();
  });

  it('fails an empty candidate on the first gate', () => {
    const res = runGates({ candidate: '', baseline: 'whatever' });
    expect(res.verdict).toBe('fail');
    expect(res.firstFailure?.gate).toBe('non-empty');
  });

  it('fails oversized candidate on size gate', () => {
    const res = runGates({
      candidate: 'x'.repeat(4000),
      baseline: 'x'.repeat(3000),
    }, { targetKind: 'persona-system-prompt' });
    expect(res.verdict).toBe('fail');
    expect(res.firstFailure?.gate).toBe('size');
  });

  it('fails runaway growth', () => {
    const res = runGates({
      candidate: 'x'.repeat(200),
      baseline: 'x'.repeat(100),
    }, { targetKind: 'generic', maxGrowthRatio: 0.2 });
    expect(res.verdict).toBe('fail');
    expect(res.firstFailure?.gate).toBe('growth');
  });

  it('fails placeholder leakage', () => {
    const res = runGates({
      candidate: 'You are {{persona.name}} — answer questions.',
      baseline: 'You are the researcher — answer questions.',
    });
    expect(res.verdict).toBe('fail');
    expect(res.firstFailure?.gate).toBe('no-placeholders');
  });

  it('fails unbalanced markdown fences', () => {
    // Pad baseline so the growth gate doesn't trip before the fence gate.
    const padding = ' '.repeat(100);
    const res = runGates({
      candidate: `Instructions:\n\`\`\`js\nconst x = 1;\nmore prose${padding}`,
      baseline: `Instructions: write code clearly.${padding}`,
    });
    expect(res.verdict).toBe('fail');
    expect(res.firstFailure?.gate).toBe('balanced-fences');
  });

  it('applies the regression gate when scores are supplied', () => {
    const res = runGates({
      candidate: 'new prompt',
      baseline: 'old prompt',
      scores: { baseline: 0.85, candidate: 0.6 },
    }, { maxRegression: -0.02 });
    expect(res.verdict).toBe('fail');
    expect(res.firstFailure?.gate).toBe('regression');
  });

  it('skips the regression gate when scores are omitted', () => {
    const res = runGates({ candidate: 'new', baseline: 'old' });
    expect(res.results.find(r => r.gate === 'regression')).toBeUndefined();
  });

  it('returns results for every gate even when one fails', () => {
    const res = runGates({
      candidate: 'x'.repeat(200),
      baseline: 'x'.repeat(100),
    }, { targetKind: 'generic', maxGrowthRatio: 0.2 });
    expect(res.results.length).toBeGreaterThan(1);
  });
});
