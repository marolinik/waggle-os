/**
 * Tests for long-task/failure-classify.ts (Phase 4.1 of agent-fix sprint).
 *
 * Coverage:
 *   - Each of 10 categories: positive (rule fires) + negative (rule doesn't fire)
 *   - Priority ordering (most-specific first)
 *   - Confidence levels (high / medium / low)
 *   - LLM judge fallback (invoked when confidence='low' and judge provided)
 *   - LLM judge fallback DISABLED option (invokeJudgeOnLowConfidence=false)
 *   - Helper: classifyFailureBatch + failureDistribution
 *   - Edge cases: empty output, multi-string gold, unicode
 */

import { describe, it, expect } from 'vitest';
import {
  classifyFailure,
  classifyFailureBatch,
  failureDistribution,
  FAILURE_CATEGORIES,
  type ClassifierInput,
  type FailureCategory,
} from '../src/long-task/failure-classify.js';
import type { LlmCallFn, LlmCallResult } from '../src/retrieval-agent-loop.js';

// ─────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────

function inp(overrides: Partial<ClassifierInput> & { model_output: string; gold_answer: string | string[] }): ClassifierInput {
  return overrides as ClassifierInput;
}

function makeJudge(verdict: { primary: string; confidence: string; rationale: string }): LlmCallFn {
  return async () => ({
    content: JSON.stringify(verdict),
    inTokens: 50,
    outTokens: 30,
    costUsd: 0.0005,
    latencyMs: 100,
  } as LlmCallResult);
}

function makeMalformedJudge(): LlmCallFn {
  return async () => ({
    content: 'I think this is hallucination but cannot output JSON',
    inTokens: 50,
    outTokens: 30,
    costUsd: 0.0005,
    latencyMs: 100,
  } as LlmCallResult);
}

// ─────────────────────────────────────────────────────────────────────────
// Module exports + constants
// ─────────────────────────────────────────────────────────────────────────

describe('failure-classify — module exports', () => {
  it('exports all 10 category names', () => {
    expect(FAILURE_CATEGORIES.length).toBe(10);
    expect(new Set(FAILURE_CATEGORIES).size).toBe(10); // all unique
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Category 1: retrieval_or_harness_error (highest priority)
// ─────────────────────────────────────────────────────────────────────────

describe('failure-classify — retrieval_or_harness_error', () => {
  it('matches when upstream_error is set, even if other rules would fire', async () => {
    const r = await classifyFailure(inp({
      model_output: '<think>fake reasoning</think>some answer',
      gold_answer: 'real answer',
      upstream_error: 'retrieval timeout after 30s',
    }));
    expect(r.primary).toBe('retrieval_or_harness_error');
    expect(r.confidence).toBe('high');
    expect(r.rules_fired).toContain('upstream-error');
  });

  it('does not match when upstream_error is empty string', async () => {
    const r = await classifyFailure(inp({
      model_output: 'wrong answer',
      gold_answer: 'right answer',
      upstream_error: '',
    }));
    expect(r.primary).not.toBe('retrieval_or_harness_error');
  });

  it('does not match when upstream_error is undefined', async () => {
    const r = await classifyFailure(inp({
      model_output: 'wrong answer',
      gold_answer: 'right answer',
    }));
    expect(r.primary).not.toBe('retrieval_or_harness_error');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Category 2: thinking_leakage
// ─────────────────────────────────────────────────────────────────────────

describe('failure-classify — thinking_leakage', () => {
  it('matches literal <think> tag (high confidence)', async () => {
    const r = await classifyFailure(inp({
      model_output: '<think>let me consider this</think>Paris',
      gold_answer: 'Paris',
    }));
    expect(r.primary).toBe('thinking_leakage');
    expect(r.confidence).toBe('high');
  });

  it('matches case-insensitive <THINK>', async () => {
    const r = await classifyFailure(inp({
      model_output: '<THINK>reasoning</THINK>answer',
      gold_answer: 'answer',
    }));
    expect(r.primary).toBe('thinking_leakage');
  });

  it('matches "Let me think" prefix (medium confidence)', async () => {
    const r = await classifyFailure(inp({
      model_output: 'Let me think about this question carefully.',
      gold_answer: 'Paris',
    }));
    expect(r.primary).toBe('thinking_leakage');
    expect(r.confidence).toBe('medium');
  });

  it('matches "First, I need to" prefix', async () => {
    const r = await classifyFailure(inp({
      model_output: 'First, I need to identify the key facts here.',
      gold_answer: 'something',
    }));
    expect(r.primary).toBe('thinking_leakage');
  });

  it('does not match plain answer text', async () => {
    const r = await classifyFailure(inp({
      model_output: 'The capital is Paris.',
      gold_answer: 'Paris',
    }));
    expect(r.primary).not.toBe('thinking_leakage');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Category 3: metadata_copy
// ─────────────────────────────────────────────────────────────────────────

describe('failure-classify — metadata_copy', () => {
  it('matches [memory:xxx] literal pattern', async () => {
    const r = await classifyFailure(inp({
      model_output: 'The user prefers dark mode [memory:user-pref-2024]',
      gold_answer: 'dark mode',
    }));
    expect(r.primary).toBe('metadata_copy');
    expect(r.confidence).toBe('high');
  });

  it('matches "from session N" pattern', async () => {
    const r = await classifyFailure(inp({
      model_output: 'Sam likes coffee from session 14',
      gold_answer: 'coffee',
    }));
    expect(r.primary).toBe('metadata_copy');
  });

  it('matches [ref:xxx] pattern', async () => {
    const r = await classifyFailure(inp({
      model_output: 'answer [ref:doc-abc]',
      gold_answer: 'answer',
    }));
    expect(r.primary).toBe('metadata_copy');
  });

  it('does not match plain prose without metadata patterns', async () => {
    const r = await classifyFailure(inp({
      model_output: 'The user prefers dark mode.',
      gold_answer: 'dark mode',
    }));
    expect(r.primary).not.toBe('metadata_copy');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Category 4: format_violation
// ─────────────────────────────────────────────────────────────────────────

describe('failure-classify — format_violation', () => {
  it('matches output starting with markdown code fence vs plain prose gold', async () => {
    const r = await classifyFailure(inp({
      model_output: '```\nParis\n```',
      gold_answer: 'Paris',
    }));
    expect(r.primary).toBe('format_violation');
    expect(r.confidence).toBe('high');
  });

  it('matches output starting with bullet list vs plain prose gold', async () => {
    const r = await classifyFailure(inp({
      model_output: '* Paris\n* The capital city',
      gold_answer: 'Paris is the capital',
    }));
    expect(r.primary).toBe('format_violation');
    expect(r.confidence).toBe('medium');
  });

  it('matches output starting with JSON vs plain prose gold', async () => {
    const r = await classifyFailure(inp({
      model_output: '{"answer":"Paris"}',
      gold_answer: 'Paris',
    }));
    expect(r.primary).toBe('format_violation');
  });

  it('does not match when gold also uses bullet format', async () => {
    const r = await classifyFailure(inp({
      model_output: '* Paris\n* London',
      gold_answer: '* Paris\n* London',
    }));
    expect(r.primary).not.toBe('format_violation');
  });

  it('does not match plain prose output', async () => {
    const r = await classifyFailure(inp({
      model_output: 'The capital is Paris.',
      gold_answer: 'Paris',
    }));
    expect(r.primary).not.toBe('format_violation');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Category 5: unknown_false_negative
// ─────────────────────────────────────────────────────────────────────────

describe('failure-classify — unknown_false_negative', () => {
  it('matches exact "unknown"', async () => {
    const r = await classifyFailure(inp({
      model_output: 'unknown',
      gold_answer: 'Paris',
    }));
    expect(r.primary).toBe('unknown_false_negative');
    expect(r.confidence).toBe('high');
  });

  it('matches "I don\'t know"', async () => {
    const r = await classifyFailure(inp({
      model_output: 'I don\'t know',
      gold_answer: 'Paris',
    }));
    expect(r.primary).toBe('unknown_false_negative');
  });

  it('matches case-insensitive UNKNOWN', async () => {
    const r = await classifyFailure(inp({
      model_output: 'UNKNOWN',
      gold_answer: 'Paris',
    }));
    expect(r.primary).toBe('unknown_false_negative');
  });

  it('matches "cannot determine" within short output', async () => {
    const r = await classifyFailure(inp({
      model_output: 'I cannot determine this from the given context.',
      gold_answer: 'Paris',
    }));
    expect(r.primary).toBe('unknown_false_negative');
    expect(r.confidence).toBe('medium');
  });

  it('does not match a long output that mentions "unknown" but is substantive', async () => {
    const r = await classifyFailure(inp({
      model_output: 'There are many unknown variables in this scenario, but the most likely capital is Paris based on the context provided in the materials section. Additional details could clarify further.',
      gold_answer: 'Paris',
    }));
    expect(r.primary).not.toBe('unknown_false_negative');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Category 6: punctuation_or_case_only
// ─────────────────────────────────────────────────────────────────────────

describe('failure-classify — punctuation_or_case_only', () => {
  it('matches case-only difference', async () => {
    const r = await classifyFailure(inp({
      model_output: 'PARIS',
      gold_answer: 'Paris',
    }));
    expect(r.primary).toBe('punctuation_or_case_only');
    expect(r.confidence).toBe('high');
  });

  it('matches trailing period difference', async () => {
    const r = await classifyFailure(inp({
      model_output: 'Paris.',
      gold_answer: 'Paris',
    }));
    expect(r.primary).toBe('punctuation_or_case_only');
  });

  it('matches comma difference', async () => {
    const r = await classifyFailure(inp({
      model_output: 'New York, USA',
      gold_answer: 'New York USA',
    }));
    expect(r.primary).toBe('punctuation_or_case_only');
  });

  it('does not match when raw forms are identical', async () => {
    const r = await classifyFailure(inp({
      model_output: 'Paris',
      gold_answer: 'Paris',
    }));
    // Raw matches, so this should not be in the failure cascade. But the test
    // input is a "passing" case — classifier should still output something
    // (defaults to hallucination via low-confidence cascade end).
    expect(r.primary).not.toBe('punctuation_or_case_only');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Category 7: correct_answer_with_extra_text
// ─────────────────────────────────────────────────────────────────────────

describe('failure-classify — correct_answer_with_extra_text', () => {
  it('matches when gold is a substring with substantial extra prose', async () => {
    const r = await classifyFailure(inp({
      model_output: 'Based on the context provided, I believe the correct answer is Paris, which is the capital city of France and home to many famous landmarks.',
      gold_answer: 'Paris',
    }));
    expect(r.primary).toBe('correct_answer_with_extra_text');
  });

  it('high confidence when output is much longer than gold', async () => {
    const r = await classifyFailure(inp({
      model_output: 'After extensive analysis of all available materials and consideration of multiple historical sources from primary documents and secondary references, the answer most likely supported by the evidence is "Paris" although other interpretations could be argued.',
      gold_answer: 'Paris',
    }));
    expect(r.primary).toBe('correct_answer_with_extra_text');
    expect(r.confidence).toBe('high');
  });

  it('does not match when output is just slightly longer', async () => {
    const r = await classifyFailure(inp({
      model_output: 'It\'s Paris.',
      gold_answer: 'Paris',
    }));
    // Output 11 chars vs gold 5 chars — under both 1.5x and +25 chars threshold.
    expect(r.primary).not.toBe('correct_answer_with_extra_text');
  });

  it('does not match when output does not contain gold', async () => {
    const r = await classifyFailure(inp({
      model_output: 'a very long answer with many words but missing the actual capital city name',
      gold_answer: 'Paris',
    }));
    expect(r.primary).not.toBe('correct_answer_with_extra_text');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Category 8: wrong_span
// ─────────────────────────────────────────────────────────────────────────

describe('failure-classify — wrong_span', () => {
  it('matches high token overlap without substring match', async () => {
    const r = await classifyFailure(inp({
      model_output: 'France capital city historic',
      gold_answer: 'France capital city Paris',
    }));
    // Jaccard: {france, capital, city} ∩ / {france, capital, city, historic, paris} = 3/5 = 0.6
    expect(r.primary).toBe('wrong_span');
    expect(r.confidence).toBe('medium');
  });

  it('does not match if substring match present (would be correct_with_extra)', async () => {
    const r = await classifyFailure(inp({
      model_output: 'France capital city Paris is famous',
      gold_answer: 'France capital city Paris',
    }));
    expect(r.primary).not.toBe('wrong_span');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Category 9: wrong_entity
// ─────────────────────────────────────────────────────────────────────────

describe('failure-classify — wrong_entity', () => {
  it('matches definitive output with low token overlap (high confidence)', async () => {
    const r = await classifyFailure(inp({
      model_output: 'The answer is definitely Berlin Germany historic central Europe',
      gold_answer: 'Paris France',
    }));
    expect(r.primary).toBe('wrong_entity');
    expect(r.confidence).toBe('high');
  });

  it('matches medium confidence when overlap is between 0.1 and 0.3', async () => {
    const r = await classifyFailure(inp({
      model_output: 'The capital of Germany is famous historic Berlin',
      gold_answer: 'capital of France Paris',
    }));
    expect(r.primary).toBe('wrong_entity');
  });

  it('does not match unknown output (caught by unknown_false_negative first)', async () => {
    const r = await classifyFailure(inp({
      model_output: 'unknown',
      gold_answer: 'Paris',
    }));
    expect(r.primary).toBe('unknown_false_negative');
  });

  it('does not match very short output', async () => {
    const r = await classifyFailure(inp({
      model_output: 'no',
      gold_answer: 'Paris France capital',
    }));
    // Only 1 token — not "definitive" by ≥5 token threshold.
    expect(r.primary).not.toBe('wrong_entity');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Category 10: hallucination (catch-all)
// ─────────────────────────────────────────────────────────────────────────

describe('failure-classify — hallucination (default fallback)', () => {
  it('defaults to hallucination with low confidence when no rule fires', async () => {
    // Short ambiguous output — no rule fires.
    const r = await classifyFailure(inp({
      model_output: 'maybe',
      gold_answer: 'Paris',
    }));
    expect(r.primary).toBe('hallucination');
    expect(r.confidence).toBe('low');
    expect(r.rules_fired).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Priority ordering
// ─────────────────────────────────────────────────────────────────────────

describe('failure-classify — priority ordering', () => {
  it('thinking_leakage takes priority over correct_with_extra', async () => {
    const r = await classifyFailure(inp({
      model_output: '<think>let me think</think>Paris is the capital city of France.',
      gold_answer: 'Paris',
    }));
    expect(r.primary).toBe('thinking_leakage');
  });

  it('metadata_copy takes priority over wrong_entity', async () => {
    const r = await classifyFailure(inp({
      model_output: 'Berlin is the answer [memory:wrong-fact-2024] historic city Europe',
      gold_answer: 'Paris France',
    }));
    expect(r.primary).toBe('metadata_copy');
  });

  it('format_violation takes priority over correct_with_extra', async () => {
    const r = await classifyFailure(inp({
      model_output: '```\nParis is a beautiful city in France with many landmarks.\n```',
      gold_answer: 'Paris',
    }));
    expect(r.primary).toBe('format_violation');
  });

  it('upstream_error takes priority over thinking_leakage', async () => {
    const r = await classifyFailure(inp({
      model_output: '<think>reasoning</think>',
      gold_answer: 'Paris',
      upstream_error: 'connection refused',
    }));
    expect(r.primary).toBe('retrieval_or_harness_error');
  });

  it('records secondary category when multiple rules fire', async () => {
    // <think> tag (cat 2) AND format violation (cat 4) — primary should be thinking_leakage,
    // secondary should be format_violation.
    const r = await classifyFailure(inp({
      model_output: '<think>x</think>* Paris\n* London',
      gold_answer: 'Paris is the capital',
    }));
    expect(r.primary).toBe('thinking_leakage');
    expect(r.secondary).toBe('format_violation');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// LLM judge fallback
// ─────────────────────────────────────────────────────────────────────────

describe('failure-classify — LLM judge fallback', () => {
  it('does NOT invoke judge when no llmJudge provided', async () => {
    const r = await classifyFailure(inp({
      model_output: 'maybe',
      gold_answer: 'Paris',
    }));
    expect(r.llm_judge_invoked).toBe(false);
  });

  it('invokes judge when confidence is low and judge provided', async () => {
    const judge = makeJudge({ primary: 'wrong_entity', confidence: 'medium', rationale: 'made-up entity' });
    const r = await classifyFailure(
      inp({ model_output: 'maybe', gold_answer: 'Paris' }),
      { llmJudge: judge, judgeModel: 'qwen-budget' },
    );
    expect(r.llm_judge_invoked).toBe(true);
    expect(r.primary).toBe('wrong_entity');
    expect(r.confidence).toBe('medium');
    expect(r.rationale).toContain('llm-judge');
  });

  it('does NOT invoke judge for high-confidence rule hits', async () => {
    const judge = makeJudge({ primary: 'hallucination', confidence: 'high', rationale: 'fake' });
    const r = await classifyFailure(
      inp({ model_output: '<think>x</think>Paris', gold_answer: 'Paris' }),
      { llmJudge: judge, judgeModel: 'qwen-budget' },
    );
    expect(r.llm_judge_invoked).toBe(false);
    expect(r.primary).toBe('thinking_leakage');
  });

  it('respects invokeJudgeOnLowConfidence=false', async () => {
    const judge = makeJudge({ primary: 'wrong_entity', confidence: 'high', rationale: 'whatever' });
    const r = await classifyFailure(
      inp({ model_output: 'maybe', gold_answer: 'Paris' }),
      { llmJudge: judge, judgeModel: 'q', invokeJudgeOnLowConfidence: false },
    );
    expect(r.llm_judge_invoked).toBe(false);
    expect(r.primary).toBe('hallucination');
  });

  it('falls back to rule verdict when LLM judge returns malformed JSON', async () => {
    const r = await classifyFailure(
      inp({ model_output: 'maybe', gold_answer: 'Paris' }),
      { llmJudge: makeMalformedJudge(), judgeModel: 'q' },
    );
    expect(r.primary).toBe('hallucination');
    expect(r.llm_judge_invoked).toBe(false); // judge returned but couldn't parse → rule verdict kept
  });

  it('falls back to rule verdict when LLM judge returns unknown category', async () => {
    const judge = makeJudge({ primary: 'totally_made_up_category', confidence: 'high', rationale: 'x' });
    const r = await classifyFailure(
      inp({ model_output: 'maybe', gold_answer: 'Paris' }),
      { llmJudge: judge, judgeModel: 'q' },
    );
    expect(r.primary).toBe('hallucination');
    expect(r.llm_judge_invoked).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Batch + distribution helpers
// ─────────────────────────────────────────────────────────────────────────

describe('failure-classify — batch + distribution', () => {
  it('classifyFailureBatch processes a list and preserves order', async () => {
    const inputs = [
      inp({ model_output: '<think>x</think>y', gold_answer: 'a' }),
      inp({ model_output: 'unknown', gold_answer: 'a' }),
      inp({ model_output: '* a\n* b', gold_answer: 'plain a b' }),
    ];
    const out = await classifyFailureBatch(inputs);
    expect(out.length).toBe(3);
    expect(out[0]?.primary).toBe('thinking_leakage');
    expect(out[1]?.primary).toBe('unknown_false_negative');
    expect(out[2]?.primary).toBe('format_violation');
  });

  it('failureDistribution counts each category', async () => {
    const inputs = [
      inp({ model_output: '<think>x</think>', gold_answer: 'a' }),
      inp({ model_output: '<think>y</think>', gold_answer: 'b' }),
      inp({ model_output: 'unknown', gold_answer: 'a' }),
      inp({ model_output: 'maybe', gold_answer: 'a' }),  // hallucination default
    ];
    const out = await classifyFailureBatch(inputs);
    const dist = failureDistribution(out);
    expect(dist.thinking_leakage).toBe(2);
    expect(dist.unknown_false_negative).toBe(1);
    expect(dist.hallucination).toBe(1);
    expect(dist.metadata_copy).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────────────────────

describe('failure-classify — edge cases', () => {
  it('empty model_output → defaults to hallucination low confidence', async () => {
    const r = await classifyFailure(inp({ model_output: '', gold_answer: 'Paris' }));
    expect(r.primary).toBe('hallucination');
    expect(r.confidence).toBe('low');
  });

  it('multi-string gold: any-match counts as substring hit', async () => {
    const r = await classifyFailure(inp({
      model_output: 'The answer is the city of London — capital of England historic',
      gold_answer: ['Paris', 'London'],
    }));
    expect(r.primary).toBe('correct_answer_with_extra_text');
  });

  it('multi-string gold: no match → falls through to wrong_entity', async () => {
    const r = await classifyFailure(inp({
      model_output: 'The famous answer is undoubtedly Berlin Germany historic',
      gold_answer: ['Paris', 'London'],
    }));
    expect(r.primary).toBe('wrong_entity');
  });

  it('unicode characters in output', async () => {
    const r = await classifyFailure(inp({
      model_output: 'café',
      gold_answer: 'cafe',
    }));
    // Normalize strips diacritics-not-decomposed differently; result should still classify.
    expect(FAILURE_CATEGORIES).toContain(r.primary);
  });

  it('output with only whitespace', async () => {
    const r = await classifyFailure(inp({ model_output: '   \n\t  ', gold_answer: 'Paris' }));
    expect(r.primary).toBe('hallucination');
  });

  it('very long output (5000 chars) does not hang', async () => {
    const r = await classifyFailure(inp({
      model_output: 'x'.repeat(5000) + ' Paris ' + 'y'.repeat(5000),
      gold_answer: 'Paris',
    }));
    expect(r.primary).toBe('correct_answer_with_extra_text');
  });
});
